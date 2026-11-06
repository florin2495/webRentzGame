import { chooseGame } from "@/lib/game";
import { handle, readJson } from "@/lib/server/http";
import { matchAction } from "@/lib/server/room";

// POST /api/rooms/[code]/choose  { game, start? } - the chooser picks this deal's game (start rank for Rentz).
export async function POST(req: Request, ctx: RouteContext<"/api/rooms/[code]/choose">) {
  return handle(async () => {
    const { code } = await ctx.params;
    const body = await readJson(req);
    return matchAction(req, code, "game_chosen", (m, seat) => chooseGame(m, seat, body.game, body.start));
  });
}
