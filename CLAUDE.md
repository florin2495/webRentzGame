@AGENTS.md

# webRentzGame - project notes for Claude

## Accounts and deploy
- GitHub: personal account **florin2495** only (repo `florin2495/webRentzGame`, public). Never the work account.
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
| `supabase/migrations/003_spectators_seats.sql` | yes (run via ALL_MIGRATIONS.sql, 2026-11-08; verified 2026-11-14 by effect: production E2E exercises its columns) | `rentz_players.role` ('player'/'spectator'), `seat` (host-controlled table order), `queued_at` ("Intră la runda următoare" queue). Do not push before it is applied: every player query selects these columns. |
| `supabase/migrations/004_totale_plus.sql` | yes (2026-11-21, verified by effect: service-role select of `totale_plus` = 200) | `rentz_rooms.totale_plus boolean` (optional 9th game "Totale +", ticked when the room is created). Do not push v1.3 code before it is applied: every room query selects the column. |

Rules for schema changes:
- New migration = new numbered file in `supabase/migrations/`, additive when possible, and the same change folded
  into `supabase/schema.sql`.
- Code that needs a migration must not be pushed until the user has run it. Verify it by effect with the
  service key from `.env.local` (a `select` of the new column; note that `head: true` count queries hide a missing table).
- Never print or commit the keys in `.env.local`.

## Abandoned rooms (600 s; 6 h for a running match)
- `GET /api/rooms` (the room list behind "Intră în cameră") also runs `cleanupAbandonedRooms` (`src/lib/server/room.ts`):
  a lobby / finished room whose `last_activity_at` is older than `ROOM_ABANDONED_MS` (600 s, `game.ts`) and with no member
  (player or spectator, both `rentz_players` rows) `last_seen_at` within 600 s is deleted (players cascade). A running
  match (`playing`) uses `ROOM_ABANDONED_PLAYING_MS` (6 h) instead, so a long match is never closed under the players
  (`isRoomAbandoned(status, …)`; the cleanup selects `status`, and each delete re-checks the cutoff of its status).
  Open room pages keep both fresh (`/state` polls every 60 s; it touches `last_seen_at` at most every 10 s and
  `last_activity_at` at most every 20 s), so only rooms nobody has open disappear; the room page shows its neutral
  "room gone" screen on the next 404 ("Camera nu mai există (a fost închisă după inactivitate).").
  The plain idle expiry (`isRoomExpired`, lazy in `getRoomByCode` + `cleanupExpiredRooms`) stays too: 10 minutes for
  lobby/finished, 6 hours (`PLAYING_IDLE_MINUTES = 360`) for a running match.
  Unit-tested with the DB mocked in `src/lib/server/room.test.ts`.

## Design
- All rules are pure functions in `src/lib/game.ts` (`Match -> Match`). The whole match, hands included, is one
  jsonb column; each action is applied by `matchAction` in `src/lib/server/room.ts` and saved with
  `.eq("version", read_version)`, so concurrent moves cannot both land.
- `/state` returns `viewMatch(...)`: own hand only, everything else is public (played cards are face up anyway).
- Rejoin the same seat (`src/lib/reconnect.ts`): every member request stamps `last_seen_at` (at most every 10 s);
  re-joining with an existing nickname reclaims that seat (same player id, new token, pending kick cleared) from the
  same device (`device_hash`) or once the seat has been unseen for 301 s (`DISCONNECT_MS`), also mid-match. `/state` exposes only a
  derived `connected` flag ("deconectat" badge).
- Spectators / seats (feedback plan contracts A+B): joining a room whose match already runs makes a spectator (max 16, `rentz_players.role`).
  `POST /reorder` (host, lobby only) saves `seat`; `start` deals in seat order; `new-round` rotates the order by one and seats queued
  spectators (`POST /queue` toggles `queued_at`) in queue order while seats are free. Spectators get the public `/state` (no hand) and
  `matchAction` refuses them. Leaderboard: `saveMatch` reports a complete match to the hub's `hub_leaderboard*` (best effort, idempotent);
  rooms named `e2e-test-…` never reach it (`isTestRoom` in `leaderboard.ts`).
- 3-6 players: 8 cards each, deck = top 2N ranks per suit (3: 9-A, 4: 7-A, 5: 5-A, 6: 3-A).
- Games (user's rules, 2026-11-21; points fixed, not configurable): Regele de inimă −200, Dame −30 each, Carouri big (10-A) −20 /
  small −10, Levate −50 per trick, Totale (all of these), Zece de treflă +200, Whist +50 per trick, Rentz; optional 9th
  "Totale +" (Whist + 10♣ in one deal, room setting `totale_plus`). 8 (or 9) games per player, so 8N (9N) deals. `Match.games`
  holds the list; matches started before v1.3 have none and use `LEGACY_GAMES` (the old 7).
- Rentz: always from the 4 Jacks, each suit grows both ways (up to A, down to the lowest rank; `Match.rows`). An Ace gives
  the same player one more card (if they can); the lowest card makes the next player still in the deal lose a turn
  (`rentzSkip`). Places pay +400 / +200 / +100, the rest 0. A match whose Rentz deal started before v1.3 (`rentzStart` set)
  finishes it the old way (ascending from the start card).
- Cancel Rentz with 4 capete (user's house rule): capete = lowest rank in play + Ace. Once a Rentz is chosen and before
  the first card, any player holding >= 4 capete (the chooser too) may cancel (`POST /cancel-rentz`): redeal, the same
  chooser chooses again, Rentz stays available, no limit, the once-per-match refusal is not used.
- Blind (user's house rule): one blind game per player per match. Every deal the chooser (if their blind is unused) is
  first asked "Joci blind?" (`POST /blind`, `blindPending`) while their own cards stay hidden (`handHidden`); a blind game
  is chosen without seeing the cards and its points count x2 (`DealResult.blind`). The blind is used only when the blind
  deal finishes: a redeal (refusal or a cancelled Rentz) asks again. The chooser always leads.
- Live score: `MatchView.livePoints` (points of the deal in progress after every trick / Rentz card, blind doubled) feeds
  the "Live score" row on top of the scoreboard, the Total and each seat chip; the "Jurnal" lists every finished deal as one line
  (game, who chose it, points per player), newest first.
- Table UI (`Table` + `Felt` in `Game.tsx`, Septica's look): me bottom, next players on the left clockwise (6: left 2, top 1, right 2; 5: left 1, top 2, right 1) around a green felt; each trick card lies in front of its player, Rentz rows sit on the felt (cards overlap when long).
- House rule from the user: each player may refuse the cards once per match, without a reason, until the first
  card of the deal is played. Redeal, the same chooser chooses again, the game is not consumed.

## Testing (GitHub Actions, manual only)
All checks run only in GitHub Actions on the free tier (public repo, standard `ubuntu-latest` runners only, never
billed / larger / macOS runners), never locally (user's rule, see `D:\_DEv\CLAUDE.md`). Every workflow is
`workflow_dispatch` only (no automatic trigger, the user's choice): nothing gates a push, and Vercel deploys `main` regardless.
Start one with `gh workflow run <file> --ref main`, then `gh run watch` (or the Actions tab, "Run workflow").

| Workflow | Runs |
| --- | --- |
| `.github/workflows/check.yml` "Check code" | `npx next typegen` + `npx tsc --noEmit` (typegen first, so route types in `.next/types` are checked), `npx eslint src`, `npx next build`. Every step runs even if an earlier one failed |
| `.github/workflows/unit-tests.yml` "Unit tests" | `npm test` (Vitest, `vitest.config.ts` resolves the `@/` alias: `src/lib/game.test.ts` rules + full random matches for 3 and 4 players, `kick.test.ts`, `reconnect.test.ts`, `server/room.test.ts` (abandoned-room cleanup) and `server/leaderboard.test.ts` (test rooms skipped) with `server-only` and the db module mocked; no real DB) |
| `.github/workflows/e2e.yml` "E2E" | `node scripts/e2e.mjs <base_url>` (input, default production `https://games.hailatat.icu/rentz`); one run at a time |
| `.github/workflows/e2e-ui.yml` "E2E UI (Playwright)" | `npx playwright test` (`playwright.config.ts`, tests in `tests/ui/*.e2e.ts`) against `base_url` (`E2E_BASE_URL`, default production), on desktop Chromium and an emulated iPhone 13 (WebKit). Same concurrency group as "E2E". On failure the report (traces, screenshots, videos) is uploaded as the `playwright-report` artifact |

- E2E needs the repo secrets `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (only for the cleanup safety net;
  locally the script falls back to `.env.local`). It checks that the deployed client JS contains the `package.json`
  version of the checked-out ref, so run it on `main` after the Vercel deploy of that version has finished.
- What E2E does (`scripts/e2e.mjs`, Node built-ins only): checks page / `_next` assets / version / manifest / icons /
  `room/XXXXXX` over HTTP and that `web-rentz-game.vercel.app/rentz` serves the same build, then drives the real API
  (production DB): create (password), join, wrong / missing password, start with 2 refused, 6 players then the 7th refused,
  room list, rejoin (saved token, same device, old token dead, mid-match), host reorder, start, private hands (24 distinct
  cards, no `hands` / tokens / hashes in any state), spectators (join a running room, 403 on every player / host route,
  queue toggle and order, spectator rejoin), choose rules, blind question (cards hidden, answered once, chooser only), refusal (once per match, not after the first card; blind asked again), out-of-turn /
  foreign / malformed / not-following-suit cards, autoplay (host only, not on his own turn), kick with "Ignoră", three full
  deals (Regele de inimă −200, Rentz from the Jacks paying 400/200/100 with every possible 4-capete cancel exercised, blind
  Whist +800) with the scores adding up, a Totale + room, a game cannot be
  chosen twice, leave mid-match (match abandoned), new round (seats rotated, queued spectators seated), pending kick enforced
  after 12 s, lobby kick. It never plays a match to its natural end (that would write the hub leaderboard). Rooms are named
  `e2e-test-…` and deleted at the end; it never calls `/api/feedback`.
- What E2E UI does (`tests/ui/`, shared steps in `helpers.ts`; Rentz needs 3 players, so 3 browser contexts = 3 devices;
  every change must reach the other screens within 5 s without a reload, polling is 60 s, so this checks Realtime; cards
  are random, so each move is the first playable card on screen and the next actor comes from the server's answer):
  - `game.e2e.ts` (both projects): create, two join by link, start, the host chooses Regele de inimă, the whole deal is
    played (each actor's "Tura ta" must appear live), deal-result pop-up on every screen, Bob chooses next, a player leaves
    (match abandoned for the others), new match, leave.
  - `spectator.e2e.ts` (desktop Chromium only): a 4th person joins mid-match = spectator (no hand, no player buttons), the
    players see them, queue ("în coadă" seen by the players), follows every turn of a whole deal, sees the stopped match,
    and the new match seats them.
  - `mobile.e2e.ts` (iPhone only): no horizontal scroll on home / lobby / match, every hand card and game button >= 24 px,
    a touch tap chooses Whist and plays a card that the other phones see live.
  Rooms are `e2e-test-ui-…`; a leftover is deleted with the service key from the same repo secrets.
- Playwright files are `*.e2e.ts`, never `*.spec.ts` / `*.test.ts` (Vitest would pick those up).
- The UI tests find elements by `data-testid`: `home-submit`, `join-submit`, `leave`, `lobby-players`, `start-game`,
  `deal-counter` ("Mâna X/Y"), `blind-yes` / `blind-no`, `felt`, `live-row`, `score-total`, `seat-live`, `game-log`, `hand-hidden`, `blind-badge`, `cancel-rentz`, `rentz-cancelled`, `rentz-skip`, `lobby-games`, `turn-badge` (with `data-phase`, `data-deal`, `data-acting` = nickname of who acts),
  `game-option` (with `data-game` = GameId), `choose-game`, `my-hand` (cards carry `data-card`, e.g. "QH";
  playable ones are enabled buttons), `refuse`, `deal-result` + `deal-result-ok`, `final-banner` (`data-end` =
  "complete"/"abandoned"), `new-round`, `spectator-status`, `queue-toggle`, `spectator-list`. Renaming or removing one breaks `tests/ui`.
