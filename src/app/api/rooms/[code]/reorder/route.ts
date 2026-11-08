import { notifyRoom } from "@/lib/server/broadcast";
import { db, T } from "@/lib/server/db";
import { fail, handle, readJson } from "@/lib/server/http";
import { listPlayers, requireHost, requireMember, requireStatus } from "@/lib/server/room";

// POST /api/rooms/[code]/reorder  { order: [playerId, ...] } - host only, lobby only (a new match is dealt
// from the lobby, also between matches). `order` must be a full permutation of the players; the first seat
// chooses first in the next match.
export async function POST(req: Request, ctx: RouteContext<"/api/rooms/[code]/reorder">) {
  return handle(async () => {
    const { code } = await ctx.params;
    const { room, player } = await requireMember(req, code);
    requireHost(room, player);
    requireStatus(room, "lobby");

    const body = await readJson(req);
    const order = Array.isArray(body.order) ? (body.order as unknown[]) : null;
    const players = await listPlayers(room.id);
    const ids = new Set(players.map((p) => p.id));
    if (
      !order ||
      order.length !== players.length ||
      new Set(order).size !== order.length ||
      !order.every((id) => typeof id === "string" && ids.has(id))
    ) {
      fail(400, "Ordinea trebuie să conțină toți jucătorii, o singură dată.");
    }

    // Version guard: a start or new-round racing with the reorder makes one of them lose.
    const now = new Date().toISOString();
    const { data, error } = await db()
      .from(T.rooms)
      .update({ version: room.version + 1, updated_at: now, last_activity_at: now })
      .eq("id", room.id)
      .eq("version", room.version)
      .eq("status", "lobby")
      .select("id");
    if (error) throw error;
    if (!data || data.length === 0) fail(409, "Camera s-a schimbat între timp. Mai încearcă o dată.");

    const results = await Promise.all(
      (order as string[]).map((id, seat) => db().from(T.players).update({ seat }).eq("id", id).eq("room_id", room.id)),
    );
    const failed = results.find((r) => r.error);
    if (failed?.error) throw failed.error;

    await notifyRoom(room.id, "players_reordered");
    return { ok: true };
  });
}
