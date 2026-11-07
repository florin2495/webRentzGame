@AGENTS.md

# webRentzGame - project notes for Claude

## Accounts and deploy
- GitHub: personal account **florin2495** only (repo `florin2495/webRentzGame`, private). Never the work account.
  Local git identity is pinned in `.git/config`.
- The user connects the repo to Vercel by hand. Once connected, every push to `main` deploys to production.
  Functions run in `fra1` (Frankfurt, `vercel.json`), next to the Supabase DB.
- Production domain: https://rentz.hailatat.icu
- Ask the user before pushing (= deploying), unless they explicitly say to deploy.
- **Before every push, bump the patch version** in `package.json` (and `npm install --package-lock-only`).
  It is shown in-game next to "Setări".
- Feedback (`POST /api/feedback`) writes to `hub_feedback` (owned by `florin2495/hailataticu-hub`, slug `rentz`).

## Database (shared Supabase project `vgpcagpqbeiqplfidmwo`)
One Supabase project hosts every hailatat.icu mini-game. **Every table of this game starts with `rentz_`**
(lowercase: Postgres folds unquoted names). Never touch other games' tables.
Migrations are run by hand in the Supabase SQL editor, so this list is the source of truth.
**Update it whenever the user confirms a migration ran.**

| Migration | Applied to the live DB | Notes |
| --- | --- | --- |
| `supabase/schema.sql` (initial) | yes (2026-11-07, verified by a full E2E match on production) | `rentz_rooms` (match as jsonb + version), `rentz_players` |
| `supabase/migrations/001_pending_kick.sql` | **not yet applied** | `rentz_players.kick_requested_at timestamptz` (pending kick, 10 s to press "Ignoră"). Do not push the kick-with-ignore code before it runs: every player query selects the column. |

Rules for schema changes:
- New migration = new numbered file in `supabase/migrations/`, additive when possible, and the same change folded
  into `supabase/schema.sql`.
- Code that needs a migration must not be pushed until the user has run it. Verify it by effect with the
  service key from `.env.local` (a `select` of the new column; note that `head: true` count queries hide a missing table).
- Never print or commit the keys in `.env.local`.

## Design
- All rules are pure functions in `src/lib/game.ts` (`Match -> Match`). The whole match, hands included, is one
  jsonb column; each action is applied by `matchAction` in `src/lib/server/room.ts` and saved with
  `.eq("version", read_version)`, so concurrent moves cannot both land.
- `/state` returns `viewMatch(...)`: own hand only, everything else is public (played cards are face up anyway).
- House rule from the user: each player may refuse the cards once per match, without a reason, until the first
  card of the deal is played. Redeal, the same chooser chooses again, the game is not consumed.

## Testing
- `npm test` (Vitest: rules + full random matches for 3 and 4 players), `npx tsc --noEmit`, `npx eslint src`, `npx next build`.
- End-to-end: drive the real API with 3-4 players (create, join, 5th refused, start, choose, play, refuse,
  autoplay, leave mid-match, new-round) against `npm run dev`. Delete the test rooms afterwards.
