import { notifyRoom } from "@/lib/server/broadcast";
import { db, T } from "@/lib/server/db";
import { fail, handle, readJson } from "@/lib/server/http";
import { requireHost, requireMember, requireStatus } from "@/lib/server/room";

// POST /api/rooms/[code]/settings { totalePlus: boolean } - host only, in the lobby: add or drop the optional
// 9th game "Totale +" for the next match.
export async function POST(req: Request, ctx: RouteContext<"/api/rooms/[code]/settings">) {
  return handle(async () => {
    const { code } = await ctx.params;
    const { room, player } = await requireMember(req, code);
    requireHost(room, player);
    requireStatus(room, "lobby");
    const body = await readJson(req);
    if (typeof body.totalePlus !== "boolean") fail(400, "Setare invalidă.");
    const { data, error } = await db()
      .from(T.rooms)
      .update({ totale_plus: body.totalePlus, updated_at: new Date().toISOString() })
      .eq("id", room.id)
      .eq("status", "lobby")
      .select("id");
    if (error) throw error;
    if (!data || data.length === 0) fail(409, "Meciul a pornit deja.");
    await notifyRoom(room.id, "settings_changed");
    return { ok: true, totalePlus: body.totalePlus };
  });
}
