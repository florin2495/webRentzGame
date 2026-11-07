import { notifyRoom } from "@/lib/server/broadcast";
import { db, T } from "@/lib/server/db";
import { clearPendingKicks } from "@/lib/server/membership";
import { fail, handle } from "@/lib/server/http";
import { requireHost, requireMember, requireStatus } from "@/lib/server/room";

// POST /api/rooms/[code]/new-round - host only, after a finished match. Back to the lobby.
export async function POST(req: Request, ctx: RouteContext<"/api/rooms/[code]/new-round">) {
  return handle(async () => {
    const { code } = await ctx.params;
    const { room, player } = await requireMember(req, code);
    requireHost(room, player);
    requireStatus(room, "finished");

    const now = new Date().toISOString();
    const { data, error } = await db()
      .from(T.rooms)
      .update({
        status: "lobby",
        round: room.round + 1,
        match: null,
        version: room.version + 1,
        winner_player_id: null,
        updated_at: now,
        last_activity_at: now,
      })
      .eq("id", room.id)
      .eq("version", room.version)
      .select("id");
    if (error) throw error;
    if (!data || data.length === 0) fail(409, "Meciul nou a fost deja pornit.");

    await clearPendingKicks(room.id);
    await notifyRoom(room.id, "new_round");
    return { ok: true };
  });
}
