import "server-only";
import { randomInt } from "node:crypto";
import {
  actingSeat,
  canRefuse,
  isRoomExpired,
  leaderSeat,
  legalCards,
  minutesLabel,
  PLAYING_IDLE_MINUTES,
  remainingGames,
  ROOM_IDLE_MINUTES,
  RulesError,
  sortHand,
  type Match,
} from "@/lib/game";
import { kickRemainingMs } from "@/lib/kick";
import type { MatchView, PublicPlayer, RoomState } from "@/lib/types";
import { notifyRoom } from "./broadcast";
import { hashToken } from "./crypto";
import { db, PLAYER_COLUMNS, type PlayerRow, ROOM_COLUMNS, type RoomRow, T } from "./db";
import { fail } from "./http";
import { enforceExpiredKicks } from "./membership";

const GONE = `Camera nu există sau a fost închisă după ${minutesLabel(ROOM_IDLE_MINUTES)} de inactivitate.`;

/** Server-side randomness for dealing (crypto, not Math.random). */
export const serverRandom = () => randomInt(0, 2 ** 32) / 2 ** 32;

export function normalizeCode(code: string): string {
  const c = decodeURIComponent(code).trim().toUpperCase();
  if (!/^[A-Z2-9]{6}$/.test(c)) fail(404, GONE);
  return c;
}

export async function getRoomByCode(code: string): Promise<RoomRow> {
  const { data, error } = await db().from(T.rooms).select(ROOM_COLUMNS).eq("code", normalizeCode(code)).maybeSingle();
  if (error) throw error;
  if (!data) fail(404, GONE);
  const room = data as RoomRow;
  // Lazy expiry: Vercel Hobby has no frequent cron, so idle rooms are closed when touched.
  if (isRoomExpired(room.status, room.last_activity_at)) {
    await db().from(T.rooms).delete().eq("id", room.id).eq("last_activity_at", room.last_activity_at);
    fail(404, GONE);
  }
  return room;
}

/** Deletes idle rooms: lobby/finished after ROOM_IDLE_MINUTES, abandoned matches after PLAYING_IDLE_MINUTES. */
export async function cleanupExpiredRooms(): Promise<void> {
  const cutoff = (min: number) => new Date(Date.now() - min * 60_000).toISOString();
  const [a, b] = await Promise.all([
    db().from(T.rooms).delete().in("status", ["lobby", "finished"]).lt("last_activity_at", cutoff(ROOM_IDLE_MINUTES)),
    db().from(T.rooms).delete().eq("status", "playing").lt("last_activity_at", cutoff(PLAYING_IDLE_MINUTES)),
  ]);
  if (a.error || b.error) console.error("cleanup failed", a.error ?? b.error);
}

/** Records activity on a room, restarting its idle timer. */
export async function touchRoom(roomId: string): Promise<void> {
  const { error } = await db().from(T.rooms).update({ last_activity_at: new Date().toISOString() }).eq("id", roomId);
  if (error) throw error;
}

/**
 * Resolves the caller from the x-player-token header and checks they belong to the room.
 * Every member-only route goes through here.
 */
export async function requireMember(req: Request, code: string): Promise<{ room: RoomRow; player: PlayerRow }> {
  const token = req.headers.get("x-player-token");
  if (!token || token.length > 200) fail(401, "Nu ești în această cameră.");
  let room = await getRoomByCode(code);
  // Lazy enforcement of lapsed pending kicks, before the caller's own membership is looked up.
  room = await enforceExpiredKicks(room);
  const { data, error } = await db()
    .from(T.players)
    .select(PLAYER_COLUMNS)
    .eq("token_hash", hashToken(token))
    .eq("room_id", room.id)
    .maybeSingle();
  if (error) throw error;
  if (!data) fail(401, "Nu ești în această cameră.");
  return { room, player: data as PlayerRow };
}

export function requireHost(room: RoomRow, player: PlayerRow) {
  if (room.host_player_id !== player.id) fail(403, "Doar creatorul camerei poate face asta.");
}

export function requireStatus(room: RoomRow, ...allowed: RoomRow["status"][]) {
  if (!allowed.includes(room.status)) {
    const msg: Record<RoomRow["status"], string> = {
      lobby: "Jocul nu a început încă.",
      playing: "Jocul este în desfășurare.",
      finished: "Jocul s-a terminat.",
    };
    fail(409, msg[room.status]);
  }
}

export async function listPlayers(roomId: string): Promise<PlayerRow[]> {
  const { data, error } = await db()
    .from(T.players)
    .select(PLAYER_COLUMNS)
    .eq("room_id", roomId)
    .order("joined_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as PlayerRow[];
}

/**
 * Stores a new match state if nobody else changed it since we read `room` (version check).
 * Finishing the match moves the room to "finished" with the leader as winner.
 */
export async function saveMatch(room: RoomRow, match: Match, kind: string): Promise<void> {
  const now = new Date().toISOString();
  const over = match.phase === "over";
  const { data, error } = await db()
    .from(T.rooms)
    .update({
      match,
      version: room.version + 1,
      status: over ? "finished" : "playing",
      winner_player_id: over ? match.seats[leaderSeat(match)] : null,
      updated_at: now,
      last_activity_at: now,
    })
    .eq("id", room.id)
    .eq("version", room.version)
    .select("id");
  if (error) throw error;
  if (!data || data.length === 0) fail(409, "Altcineva a jucat între timp. Mai încearcă o dată.");
  await notifyRoom(room.id, kind);
}

/**
 * Shared body of every in-match action: member check, seat lookup, pure rule function,
 * versioned save, broadcast. Rule violations become 409 with the rule's message.
 */
export async function matchAction(
  req: Request,
  code: string,
  kind: string,
  apply: (match: Match, seat: number, ctx: { room: RoomRow; player: PlayerRow }) => Match,
): Promise<{ ok: true }> {
  const ctx = await requireMember(req, code);
  requireStatus(ctx.room, "playing");
  const match = ctx.room.match;
  if (!match) fail(409, "Meciul nu a început.");
  const seat = match.seats.indexOf(ctx.player.id);
  let next: Match;
  try {
    next = apply(match, seat, ctx);
  } catch (err) {
    if (err instanceof RulesError) fail(409, err.message);
    throw err;
  }
  await saveMatch(ctx.room, next, kind);
  return { ok: true };
}

const toPublic = (p: PlayerRow, now: number): PublicPlayer => ({
  id: p.id,
  nickname: p.nickname,
  isHost: p.is_host,
  kickRemainingMs: kickRemainingMs(p.kick_requested_at, now),
});

export function viewMatch(m: Match, playerId: string): MatchView {
  const mySeat = m.seats.indexOf(playerId);
  const n = m.seats.length;
  return {
    seats: m.seats,
    names: m.names,
    mySeat,
    deal: m.deal,
    totalDeals: m.totalDeals,
    phase: m.phase,
    chooser: m.chooser,
    game: m.game,
    rentzStart: m.rentzStart,
    acting: actingSeat(m),
    hand: mySeat >= 0 && m.phase !== "over" ? sortHand(m.hands[mySeat]) : [],
    legal: mySeat >= 0 ? legalCards(m, mySeat) : [],
    handCounts: m.hands.map((h) => h.length),
    trick: m.trick,
    lastTrick: m.lastTrick,
    tricks: m.tricks,
    taken: m.taken,
    layout: m.layout,
    finished: m.finished,
    passes: m.passes,
    remaining: Array.from({ length: n }, (_, s) => remainingGames(m, s)),
    refused: m.refused,
    canRefuse: mySeat >= 0 && canRefuse(m, mySeat),
    lastRefusal: m.lastRefusal,
    scores: m.scores,
    history: m.history,
    endReason: m.endReason,
  };
}

export async function buildState(room: RoomRow, me: PlayerRow): Promise<RoomState> {
  const players = await listPlayers(room.id);
  let ordered = players;
  if (room.match) {
    const pos = new Map(room.match.seats.map((id, i) => [id, i]));
    ordered = [...players].sort((a, b) => (pos.get(a.id) ?? 1e9) - (pos.get(b.id) ?? 1e9));
  }
  const now = Date.now();
  return {
    room: {
      id: room.id,
      code: room.code,
      name: room.name,
      status: room.status,
      round: room.round,
      hasPassword: room.password_hash !== null,
      hostPlayerId: room.host_player_id,
      winnerPlayerId: room.winner_player_id,
    },
    players: ordered.map((p) => toPublic(p, now)),
    me: toPublic(me, now),
    match: room.match ? viewMatch(room.match, me.id) : null,
  };
}
