import { MAX_PLAYERS, MIN_PLAYERS, newMatch } from "@/lib/game";
import { notifyRoom } from "@/lib/server/broadcast";
import { db, T } from "@/lib/server/db";
import { clearPendingKicks } from "@/lib/server/membership";
import { fail, handle } from "@/lib/server/http";
import { listPlayers, requireHost, requireMember, requireStatus, serverRandom } from "@/lib/server/room";

// POST /api/rooms/[code]/start - host only, 3-6 players. Deals the first hand.
export async function POST(req: Request, ctx: RouteContext<"/api/rooms/[code]/start">) {
  return handle(async () => {
    const { code } = await ctx.params;
    const { room, player } = await requireMember(req, code);
    requireHost(room, player);
    requireStatus(room, "lobby");

    const players = await listPlayers(room.id);
    if (players.length < MIN_PLAYERS) fail(409, `Rentz se joacă în ${MIN_PLAYERS}-${MAX_PLAYERS}. Mai așteaptă un jucător.`);
    if (players.length > MAX_PLAYERS) fail(409, `Sunt prea mulți jucători (maxim ${MAX_PLAYERS}).`);

    // Table order = the seat order the host arranged (listPlayers sorts by seat); the first seat chooses first.
    const seats = players.map((p) => p.id);
    const names = players.map((p) => p.nickname);
    const match = newMatch(seats, names, serverRandom, { totalePlus: room.totale_plus });

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

    await clearPendingKicks(room.id);
    await notifyRoom(room.id, "game_started");
    return { ok: true };
  });
}
