import { MAX_PLAYERS } from "@/lib/game";
import { notifyRoom } from "@/lib/server/broadcast";
import { db, T } from "@/lib/server/db";
import { fail, handle } from "@/lib/server/http";
import { listPlayers, requireMember, touchRoom } from "@/lib/server/room";

// POST /api/rooms/[code]/queue - a spectator toggles "Intră la runda următoare". At the next new-round the
// queued spectators become players, in queue order, while seats are free. In the lobby with a free seat there
// is no round to wait for: the spectator sits down at once.
export async function POST(req: Request, ctx: RouteContext<"/api/rooms/[code]/queue">) {
  return handle(async () => {
    const { code } = await ctx.params;
    const { room, player } = await requireMember(req, code);
    if (player.role !== "spectator") fail(409, "Ești deja jucător.");

    if (room.status === "lobby") {
      const players = await listPlayers(room.id);
      if (players.length < MAX_PLAYERS) {
        const seat = Math.max(-1, ...players.map((p) => p.seat ?? -1)) + 1;
        const { error } = await db()
          .from(T.players)
          .update({ role: "player", seat, queued_at: null })
          .eq("id", player.id)
          .eq("role", "spectator");
        if (error) throw error;
        await touchRoom(room.id);
        await notifyRoom(room.id, "spectator_seated");
        return { ok: true, queued: false, seated: true };
      }
    }

    const queued = player.queued_at === null;
    const { error } = await db()
      .from(T.players)
      .update({ queued_at: queued ? new Date().toISOString() : null })
      .eq("id", player.id);
    if (error) throw error;
    await notifyRoom(room.id, "spectator_queue");
    return { ok: true, queued, seated: false };
  });
}
