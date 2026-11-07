import { KICK_GRACE_MS, KICK_NETWORK_GRACE_MS } from "@/lib/kick";
import { notifyRoom } from "@/lib/server/broadcast";
import { db, T } from "@/lib/server/db";
import { fail, handle } from "@/lib/server/http";
import { requireMember } from "@/lib/server/room";

// POST /api/rooms/[code]/kick/ignore - the kicked player refuses ("Ignoră") within the grace period.
// Clears the caller's own pending kick only. requireMember has already removed lapsed kicks, so a late
// press normally ends in 401 (already out); the 409 covers the race at the very edge.
export async function POST(req: Request, ctx: RouteContext<"/api/rooms/[code]/kick/ignore">) {
  return handle(async () => {
    const { code } = await ctx.params;
    const { room, player } = await requireMember(req, code);
    if (player.kick_requested_at === null) return { ok: true }; // nothing pending (already ignored)

    const cutoff = new Date(Date.now() - (KICK_GRACE_MS + KICK_NETWORK_GRACE_MS)).toISOString();
    const { data, error } = await db()
      .from(T.players)
      .update({ kick_requested_at: null })
      .eq("id", player.id)
      .not("kick_requested_at", "is", null)
      .gte("kick_requested_at", cutoff)
      .select("id");
    if (error) throw error;
    if (!data || data.length === 0) fail(409, "Prea târziu, ai fost scos.");

    await notifyRoom(room.id, "kick_ignored");
    return { ok: true };
  });
}
