import { playCard } from "@/lib/game";
import { handle, readJson } from "@/lib/server/http";
import { matchAction, serverRandom } from "@/lib/server/room";

// POST /api/rooms/[code]/play  { card } - play a card on your turn.
export async function POST(req: Request, ctx: RouteContext<"/api/rooms/[code]/play">) {
  return handle(async () => {
    const { code } = await ctx.params;
    const body = await readJson(req);
    return matchAction(req, code, "card_played", (m, seat) => playCard(m, seat, body.card, serverRandom));
  });
}
