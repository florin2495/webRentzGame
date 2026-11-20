import { decideBlind } from "@/lib/game";
import { handle, readJson } from "@/lib/server/http";
import { matchAction } from "@/lib/server/room";

// POST /api/rooms/[code]/blind { blind: boolean } - the chooser says whether this deal is blind (before seeing the cards).
export async function POST(req: Request, ctx: RouteContext<"/api/rooms/[code]/blind">) {
  return handle(async () => {
    const { code } = await ctx.params;
    const body = await readJson(req);
    return matchAction(req, code, "blind_decided", (m, seat) => decideBlind(m, seat, body.blind));
  });
}
