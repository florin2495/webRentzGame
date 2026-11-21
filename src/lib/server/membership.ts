import "server-only";
import { recordedWinner, seatLeaves } from "@/lib/game";
import { isKickExpired, KICK_GRACE_MS, KICK_NETWORK_GRACE_MS } from "@/lib/kick";
import { notifyRoom } from "./broadcast";
import { db, type RoomRow, T } from "./db";
import { reportLeaderboard } from "./leaderboard";
import { getRoomByCode, listMembers, serverRandom, sortBySeat } from "./room";

/**
 * Removes a player from a room (used by both "leave" and the host's "kick").
 *  - last player out: the room is deleted
 *  - host removed: host passes to the next player in table order (never to a spectator)
 *  - no player left (only spectators): the room is deleted
 *  - during a match: the seat goes on automatically (legal cards; game.ts seatLeaves), so the others keep
 *    playing; with fewer than 2 real players left the match stops, scores so far stand and the leader wins.
 */
export async function removePlayer(room: RoomRow, playerId: string, reason: string): Promise<{ roomClosed: boolean }> {
  const now = new Date().toISOString();
  const remaining = (await listMembers(room.id)).filter((p) => p.id !== playerId);
  const remainingPlayers = sortBySeat(remaining.filter((p) => p.role === "player"));

  if (remainingPlayers.length === 0) {
    const { error } = await db().from(T.rooms).delete().eq("id", room.id);
    if (error) throw error;
    return { roomClosed: true };
  }

  const newHostId = room.host_player_id === playerId ? remainingPlayers[0].id : room.host_player_id;
  const update: Record<string, unknown> = { host_player_id: newHostId, updated_at: now, last_activity_at: now };

  let completed: NonNullable<RoomRow["match"]> | null = null;
  if (room.status === "playing" && room.match?.seats.includes(playerId)) {
    const match = seatLeaves(room.match, room.match.seats.indexOf(playerId), serverRandom, reason === "player_kicked");
    update.match = match;
    update.version = room.version + 1;
    if (match.phase === "over") {
      update.status = "finished";
      // Neither the leaver nor a player who left earlier can be the winner on record: their rows are gone (FK).
      const winner = recordedWinner(match);
      update.winner_player_id = winner === playerId ? null : winner;
      if (match.endReason === "complete") completed = match;
    }
  }

  // Update the room first so the host never points at a deleted player.
  const { error: roomError } = await db().from(T.rooms).update(update).eq("id", room.id);
  if (roomError) throw roomError;

  if (newHostId && newHostId !== room.host_player_id) {
    const { error } = await db().from(T.players).update({ is_host: true }).eq("id", newHostId);
    if (error) throw error;
  }

  const { error: deleteError } = await db().from(T.players).delete().eq("id", playerId);
  if (deleteError) throw deleteError;

  if (completed) {
    // The automatic seats played the last deal to its end: report it like any finished match.
    const top = Math.max(...completed.scores);
    await reportLeaderboard(room, completed.names.map((nickname, i) => ({ nickname, won: completed.scores[i] === top })));
  }

  await notifyRoom(room.id, reason);
  return { roomClosed: false };
}

/**
 * Lazy enforcement of pending kicks (serverless, no timers): removes every player of the room whose
 * grace period (plus network tolerance) has lapsed, exactly like an immediate kick. Each removal is
 * claimed atomically (conditional update on the value read), so concurrent requests never remove twice.
 * Returns the room as it is afterwards; getRoomByCode answers 404 if the room closed meanwhile.
 */
export async function enforceExpiredKicks(room: RoomRow): Promise<RoomRow> {
  const cutoff = new Date(Date.now() - (KICK_GRACE_MS + KICK_NETWORK_GRACE_MS)).toISOString();
  const { data, error } = await db()
    .from(T.players)
    .select("id, kick_requested_at")
    .eq("room_id", room.id)
    .not("kick_requested_at", "is", null)
    .lt("kick_requested_at", cutoff);
  if (error) throw error;
  let current = room;
  for (const row of (data ?? []) as { id: string; kick_requested_at: string }[]) {
    if (!isKickExpired(row.kick_requested_at, Date.now())) continue;
    const { data: claimed, error: claimError } = await db()
      .from(T.players)
      .update({ kick_requested_at: null })
      .eq("id", row.id)
      .eq("kick_requested_at", row.kick_requested_at)
      .select("id");
    if (claimError) throw claimError;
    if (!claimed || claimed.length === 0) continue; // another request got it
    const { roomClosed } = await removePlayer(current, row.id, "player_kicked");
    current = await getRoomByCode(current.code); // fresh version / host / status; 404 if the room closed
    if (roomClosed) break;
  }
  return current;
}

/** A new match / back to the lobby: no pending kick survives. */
export async function clearPendingKicks(roomId: string): Promise<void> {
  const { error } = await db().from(T.players).update({ kick_requested_at: null }).eq("room_id", roomId).not("kick_requested_at", "is", null);
  if (error) throw error;
}
