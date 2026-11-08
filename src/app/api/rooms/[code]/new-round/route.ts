import { notifyRoom } from "@/lib/server/broadcast";
import { db, T } from "@/lib/server/db";
import { clearPendingKicks } from "@/lib/server/membership";
import { fail, handle } from "@/lib/server/http";
import { listMembers, queuedSpectators, requireHost, requireMember, requireStatus, sortBySeat } from "@/lib/server/room";
import { MAX_PLAYERS } from "@/lib/game";

// POST /api/rooms/[code]/new-round - host only, after a finished match. Back to the lobby.
// Table order for the next match: last match's order rotated by one (a different player chooses first; the host
// can reorder in the lobby), then queued spectators fill the free seats in queue order. The rest keep watching.
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

    const members = await listMembers(room.id);
    const byId = new Map(members.map((p) => [p.id, p]));
    const matchOrder = (room.match?.seats ?? []).map((id) => byId.get(id)).filter((p) => p?.role === "player");
    const known = new Set(matchOrder.map((p) => p!.id));
    const base = [
      ...(matchOrder as typeof members),
      ...sortBySeat(members.filter((p) => p.role === "player" && !known.has(p.id))),
    ];
    const rotated = base.length > 1 ? [...base.slice(1), base[0]] : base;
    const joining = queuedSpectators(members).slice(0, Math.max(0, MAX_PLAYERS - rotated.length));
    await Promise.all([
      ...rotated.map((p, seat) => db().from(T.players).update({ seat }).eq("id", p.id)),
      ...joining.map((p, i) =>
        db()
          .from(T.players)
          .update({ role: "player", seat: rotated.length + i, queued_at: null })
          .eq("id", p.id),
      ),
    ]).then((rs) => {
      const failed = rs.find((r) => r.error);
      if (failed?.error) throw failed.error;
    });

    await clearPendingKicks(room.id);
    await notifyRoom(room.id, "new_round");
    return { ok: true };
  });
}
