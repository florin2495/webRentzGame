import { MAX_PLAYERS, MIN_PLAYERS, newMatch } from "@/lib/game";
import { notifyRoom } from "@/lib/server/broadcast";
import { db, T } from "@/lib/server/db";
import { fail, handle } from "@/lib/server/http";
import { listPlayers, requireHost, requireMember, requireStatus, serverRandom } from "@/lib/server/room";

/**
 * Seat order: host first, then join order, rotated by one every match so a different
 * player chooses (and leads) first.
 */
function seatOrder(ids: string[], hostId: string | null, round: number): string[] {
  const base = hostId && ids.includes(hostId) ? [hostId, ...ids.filter((id) => id !== hostId)] : [...ids];
  const shift = (round - 1) % base.length;
  return [...base.slice(shift), ...base.slice(0, shift)];
}

// POST /api/rooms/[code]/start - host only, 3-4 players. Deals the first hand.
export async function POST(req: Request, ctx: RouteContext<"/api/rooms/[code]/start">) {
  return handle(async () => {
    const { code } = await ctx.params;
    const { room, player } = await requireMember(req, code);
    requireHost(room, player);
    requireStatus(room, "lobby");

    const players = await listPlayers(room.id);
    if (players.length < MIN_PLAYERS) fail(409, `Rentz se joacă în ${MIN_PLAYERS}-${MAX_PLAYERS}. Mai așteaptă un jucător.`);
    if (players.length > MAX_PLAYERS) fail(409, `Sunt prea mulți jucători (maxim ${MAX_PLAYERS}).`);

    const seats = seatOrder(players.map((p) => p.id), room.host_player_id, room.round);
    const names = seats.map((id) => players.find((p) => p.id === id)?.nickname ?? "?");
    const match = newMatch(seats, names, serverRandom);

    // Conditional update: only one start can win, and only from the lobby.
    const now = new Date().toISOString();
    const { data, error } = await db()
      .from(T.rooms)
      .update({
        status: "playing",
        match,
        version: room.version + 1,
        winner_player_id: null,
        updated_at: now,
        last_activity_at: now,
      })
      .eq("id", room.id)
      .eq("status", "lobby")
      .select("id");
    if (error) throw error;
    if (!data || data.length === 0) fail(409, "Jocul a fost deja pornit.");

    await notifyRoom(room.id, "game_started");
    return { ok: true };
  });
}
