import { refuseCards } from "@/lib/game";
import { handle } from "@/lib/server/http";
import { matchAction, serverRandom } from "@/lib/server/room";

// POST /api/rooms/[code]/refuse - once per match, before the first card: redeal, no reason needed.
export async function POST(req: Request, ctx: RouteContext<"/api/rooms/[code]/refuse">) {
  return handle(async () => {
    const { code } = await ctx.params;
    return matchAction(req, code, "cards_refused", (m, seat) => refuseCards(m, seat, serverRandom));
  });
}
