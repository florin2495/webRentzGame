import { actingSeat, autoAction } from "@/lib/game";
import { fail, handle } from "@/lib/server/http";
import { matchAction, requireHost, serverRandom } from "@/lib/server/room";

// POST /api/rooms/[code]/autoplay - host only: a random legal move for a player who is not responding.
export async function POST(req: Request, ctx: RouteContext<"/api/rooms/[code]/autoplay">) {
  return handle(async () => {
    const { code } = await ctx.params;
    return matchAction(req, code, "autoplay", (m, seat, { room, player }) => {
      requireHost(room, player);
      if (actingSeat(m) === seat) fail(409, "E rândul tău, joacă tu.");
      return autoAction(m, serverRandom);
    });
  });
}
