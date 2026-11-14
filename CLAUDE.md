@AGENTS.md

# webRentzGame - project notes for Claude

## Accounts and deploy
- GitHub: personal account **florin2495** only (repo `florin2495/webRentzGame`, private). Never the work account.
  Local git identity is pinned in `.git/config`.
- The user connects the repo to Vercel by hand. Once connected, every push to `main` deploys to production.
  Functions run in `fra1` (Frankfurt, `vercel.json`), next to the Supabase DB.
- Production domain: https://games.hailatat.icu/rentz (basePath `/rentz`, proxied by the hub; Vercel project web-rentz-game.vercel.app)
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
| `supabase/migrations/001_pending_kick.sql` | yes (2026-11-07, verified) | `rentz_players.kick_requested_at timestamptz` (pending kick, 10 s to press "Ignoră"). Do not push the kick-with-ignore code before it runs: every player query selects the column. |
| `supabase/migrations/002_reconnect.sql` | yes (2026-11-07, verified: service role 200, anon 401) | `rentz_players.last_seen_at`, `device_hash` + index (rejoin the same seat). Do not push before it is applied: every player query selects `last_seen_at`. |
| `supabase/migrations/003_spectators_seats.sql` | yes (run via ALL_MIGRATIONS.sql, 2026-11-08) | `rentz_players.role` ('player'/'spectator'), `seat` (host-controlled table order), `queued_at` ("Intră la runda următoare" queue). Do not push before it is applied: every player query selects these columns. |

Rules for schema changes:
- New migration = new numbered file in `supabase/migrations/`, additive when possible, and the same change folded
  into `supabase/schema.sql`.
- Code that needs a migration must not be pushed until the user has run it. Verify it by effect with the
  service key from `.env.local` (a `select` of the new column; note that `head: true` count queries hide a missing table).
- Never print or commit the keys in `.env.local`.

## Abandoned rooms (120 s)
- `GET /api/rooms` (the room list behind "Intră în cameră") also runs `cleanupAbandonedRooms` (`src/lib/server/room.ts`):
  every room in ANY status (also `playing`) whose `last_activity_at` is older than `ROOM_ABANDONED_MS` (120 s, `game.ts`)
  and with no member (player or spectator, both `rentz_players` rows) `last_seen_at` within 120 s is deleted (players cascade).
  Open room pages keep both fresh (`/state` polls every 15 s; it touches `last_seen_at` every 10 s and `last_activity_at`
  every 20 s), so only rooms nobody has open disappear; the room page shows its "room gone" screen on the next 404.
  The 10-minute lobby/finished and 30-minute playing expiry stay too.

## Design
- All rules are pure functions in `src/lib/game.ts` (`Match -> Match`). The whole match, hands included, is one
  jsonb column; each action is applied by `matchAction` in `src/lib/server/room.ts` and saved with
  `.eq("version", read_version)`, so concurrent moves cannot both land.
- `/state` returns `viewMatch(...)`: own hand only, everything else is public (played cards are face up anyway).
- Rejoin the same seat (`src/lib/reconnect.ts`): every member request stamps `last_seen_at` (at most every 10 s);
  re-joining with an existing nickname reclaims that seat (same player id, new token, pending kick cleared) from the
  same device (`device_hash`) or once the seat has been unseen for 45 s, also mid-match. `/state` exposes only a
  derived `connected` flag ("deconectat" badge).
- Spectators / seats (feedback plan contracts A+B): joining a room whose match already runs makes a spectator (max 16, `rentz_players.role`).
  `POST /reorder` (host, lobby only) saves `seat`; `start` deals in seat order; `new-round` rotates the order by one and seats queued
  spectators (`POST /queue` toggles `queued_at`) in queue order while seats are free. Spectators get the public `/state` (no hand) and
  `matchAction` refuses them. Leaderboard: `saveMatch` reports a complete match to the hub's `hub_leaderboard*` (best effort, idempotent).
- 3-6 players: 8 cards each, deck = top 2N ranks per suit (3: 9-A, 4: 7-A, 5: 5-A, 6: 3-A); 7 games per player so 7N deals; Rentz places pay 100*N..100.
  Table UI (`TableSeats` in `Game.tsx`): me bottom, next players on the left clockwise (6: left 2, top 1, right 2; 5: left 1, top 2, right 1).
- House rule from the user: each player may refuse the cards once per match, without a reason, until the first
  card of the deal is played. Redeal, the same chooser chooses again, the game is not consumed.

## Testing
- `npm test` (Vitest: rules + full random matches for 3 and 4 players), `npx tsc --noEmit`, `npx eslint src`, `npx next build`.
- End-to-end: drive the real API with 3-6 players (create, join, 7th refused, start, choose, play, refuse,
  autoplay, leave mid-match, new-round) against `npm run dev`. Delete the test rooms afterwards.
