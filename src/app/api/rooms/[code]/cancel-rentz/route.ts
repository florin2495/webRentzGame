import { cancelRentz } from "@/lib/game";
import { handle } from "@/lib/server/http";
import { matchAction, serverRandom } from "@/lib/server/room";

// POST /api/rooms/[code]/cancel-rentz - a player with at least 4 capete cancels the chosen Rentz before the first card:
// redeal, the same chooser chooses again. No limit, the once-per-match refusal is not used.
export async function POST(req: Request, ctx: RouteContext<"/api/rooms/[code]/cancel-rentz">) {
  return handle(async () => {
    const { code } = await ctx.params;
    return matchAction(req, code, "rentz_cancelled", (m, seat) => cancelRentz(m, seat, serverRandom));
  });
}
