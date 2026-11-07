import { notifyRoom } from "@/lib/server/broadcast";
import { db, T } from "@/lib/server/db";
import { fail, handle, readJson } from "@/lib/server/http";
import { removePlayer } from "@/lib/server/membership";
import { requireHost, requireMember } from "@/lib/server/room";

// POST /api/rooms/[code]/kick  { playerId } - host removes another player.
// Lobby / finished match / a player who is not seated in the running match: removed at once.
// A seated player during a running match only gets a pending kick: 10 s to press "Ignoră"
// (POST /kick/ignore), after which the next request to the room removes them (enforceExpiredKicks).
// Not a ban: identity is a browser token, so a kicked player could rejoin a lobby under a
// new nickname. A room password is the real access control.
export async function POST(req: Request, ctx: RouteContext<"/api/rooms/[code]/kick">) {
  return handle(async () => {
    const { code } = await ctx.params;
    const { room, player } = await requireMember(req, code);
    requireHost(room, player);

    const body = await readJson(req);
    const targetId = typeof body.playerId === "string" ? body.playerId : "";
    if (targetId === player.id) fail(400, "Nu te poți scoate singur. Folosește „Părăsește camera”.");

    const { data: target, error } = await db()
      .from(T.players)
      .select("id")
      .eq("id", targetId)
      .eq("room_id", room.id)
      .maybeSingle();
    if (error && error.code !== "22P02") throw error; // 22P02 = malformed uuid
    if (!target) fail(404, "Jucătorul nu mai e în cameră.");

    if (room.status === "playing" && room.match?.seats.includes(targetId)) {
      // Only starts the countdown when none is running: a second kick does not reset the deadline.
      const { error: pendingError } = await db()
        .from(T.players)
        .update({ kick_requested_at: new Date().toISOString() })
        .eq("id", targetId)
        .is("kick_requested_at", null);
      if (pendingError) throw pendingError;
      await notifyRoom(room.id, "kick_pending");
      return { ok: true, pending: true };
    }

    await removePlayer(room, targetId, "player_kicked");
    return { ok: true };
  });
}
