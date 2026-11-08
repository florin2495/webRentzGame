# HANDOFF Rentz (006_Rentz), 2026-11-08

Self-contained. The previous agent (Sonnet 5.5) stopped here; the next agent continues. Read `CLAUDE.md`, `AGENTS.md`
(Next.js 16 with breaking changes: check `node_modules/next/dist/docs/` before writing Next code) and `D:\_DEv\FEEDBACK_PLAN.md`.

## 1. Task and every message received

### Initial prompt (from the coordinating session `local_3ff01623-91e8-4a81-8b2e-a2e3ecbbeb86`, "Feedback și bug-uri jocuri")
Rentz is one of 12 separate repos (hub + 11 games) on a single Supabase project. Common plan and contracts: `D:\_DEv\FEEDBACK_PLAN.md`.
Each repo has its own agent; I am the Rentz agent.

Task: read FEEDBACK_PLAN.md (rules, contracts A-D, section on games without special tasks), then CLAUDE.md/AGENTS.md. Implement:
contract A (host reorder), B (spectator + "Intră la runda următoare", max 16), C (leaderboard reporting; code ready but not pushed
until the user runs the hub migration), D (iOS bugs: look for the fix in the plan's "Fix iOS" section; if empty do A/B/C first and recheck).
Rules: no `git push`, bump the patch in `package.json`, numbered additive migrations with the game prefix, run `npm test`,
`npx tsc --noEmit`, `npx eslint src`, `npx next build`. Git identity is already pinned, do not change it. Small commits on `main`.
Final report: what was done, migrations to run, what was not verified.
Shared notes folder: `C:\Users\andre\AppData\Local\Claude-Data\claude_pzs8sxrjxfjjc\side-session-notes\local_3ff01623-91e8-4a81-8b2e-a2e3ecbbeb86`.

Contracts (from the plan, short):
- A: `POST /api/rooms/[code]/reorder {order:[playerId...]}`, host only, full permutation validated on the server, lobby/between rounds only; saved order = play order; UI with up/down arrows.
- B: joining a running room = spectator (max 16, clear message above that); spectator sees public state only, cannot act; `POST /queue` toggles "Intră la runda următoare"; at new-round the queued ones become players in queue order while seats are free; rejoin must work for spectators.
- C: hub-owned tables `hub_leaderboard(game, player_key, display_name, wins, games, updated_at, PK(game, player_key))` and `hub_leaderboard_rounds(game, room_code, round_no, PK(...))`; `player_key` = lowercase trimmed nickname; idempotent upsert at the end of a round, written with the service key.
- D: iOS bugs (#4 feedback textarea invisible on iPhone 12 Pro, #5 zoom stuck after landscape->portrait). Fix given by the Bingo agent is in the plan.

### Follow-up messages
1. **Migrations process change:** do not ask the user to run anything; just write the files. The user wants ONE single SQL script with all migrations of all repos, assembled by the coordinator. So migrations in `supabase/migrations/` (and `supabase/schema.sql`) must be idempotent (`create table if not exists`, `add column if not exists`, `create index if not exists`, guarded constraints), no `drop`/`delete` of data; do not block waiting for it to run. The final report must give the exact path of each migration file. (Already answered: see section 5.)
2. **Septica layout "Varianta A" (from session `local_4a4b9ff2-1ecf-4f07-b8a7-9348c93b6935`):** the user wants Septica's "variant A" layout in Rentz too, if there is no clear seat order already. Mock stated as **approved**: `D:\_DEv\008_Septica\docs\mock\septica-layout.html`. Variant A: table with seats in a cross; current player at the bottom, left = next, top = 3rd, right = previous; cards played in front of each seat; "a început"/"urmează" badges; with 3 players only left+right, with 2 only top. Septica's implementation will be in `D:\_DEv\008_Septica\src\components\Game.tsx` as reference once done. I only checked Rentz's current layout (see section 3) and did not reply to that session.
3. **Up to 6 players (from the coordinator, user request):** the game must accept 3 to 6 players (today `MAX_PLAYERS = 4` in `src/lib/game.ts`).
   - Rules: adapt the deal and match structure for 5 and 6 (52 cards do not split evenly; use the usual Rentz variant, e.g. remove low cards so the deal is exact, and adjust the number of games/"hands" if the rules require it). Update validations (`game.ts`, `start`, `join`, lobby, room list) and tests. In the report say exactly which rules were chosen for 5 and 6 and why, so the user can correct them.
   - Table layout (current player always at the bottom, play order clockwise starting from my left):
     - 6 players: me bottom; left = next 2 (stacked); top = 1 player (the 4th); right = last 2 (stacked).
     - 5 players: me bottom alone; left = 1; right = 1; top = 2 players.
     - 3 and 4 players stay as now. Everything must fit a portrait phone (~390 px).
   - Ties into contracts B (spectators) and A (reorder): seats are assigned in the saved order.
4. **Handoff request:** finish the current atomic step, write this file, commit (no push), reply with the exact path and a 3-line summary, then stop.

## 2. Done so far (all local on `main`, NOT pushed)

| Commit | Content |
| --- | --- |
| `737f61b` | A + B + C: migration 003, `role/seat/queued_at`, `reorder` and `queue` routes, spectators (join, state, UI `SpectatorPanel`), `new-round` rotation + promotion from queue, `start` uses seat order, `lib/server/leaderboard.ts` reporting from `saveMatch` |
| `1341812` | D (iOS fix from the plan: `FeedbackButton` modal at top, scrollable, no autofocus; `maximumScale: 1`; `text-size-adjust: 100%`; `overflow-x: clip`), version 1.2.5, CLAUDE.md (migration table row 003 = not applied + design notes) |

Nothing is done for 5-6 players or the Septica-style layout. This HANDOFF file is the only thing after `1341812`.

Verified at `1341812`: `npm test` 29/29, `npx tsc --noEmit`, `npx eslint src`, `npx next build` all clean.

## 3. Remaining, in order

1. **5-6 players.** Constants: `MIN_PLAYERS = 3`, `MAX_PLAYERS = 4`, `MAX_SPECTATORS = 16` in `src/lib/game.ts`. Look at `newMatch` (validates `n`), the deal (`7` hands per player: `totalDeals = n * 7`, 52 cards / 4 = 13 per hand, 3 players use a 32-card or reduced deck: read `game.ts` to see how 3 is handled and mirror it), `ranksFor(n)`, `GAME_INFO`, `remainingGames`, scoring. Then raise `MAX_PLAYERS` to 6 and fix every use: `start` and `join` routes (messages say "3-4"), `queue` route, `new-round` (promotion up to `MAX_PLAYERS`), `Lobby.tsx`, `RoomClient.tsx` header, `RoomList.tsx` / `Home.tsx` / `Rules.tsx` text, `rooms/route.ts` list, the grid `n === 4 ? grid-cols-3 : grid-cols-2` in `Game.tsx`, tests in `game.test.ts` (random full matches for 5 and 6). Check `grep -rn "MAX_PLAYERS\|3-4\|4 jucători\|3 sau 4" src`.
2. **Table layout** in `Game.tsx` (section "Table", `others` = seats clockwise after mine, rendered by `SeatChip`): implement the 3/4/5/6 layouts above. Spectators have `mySeat = -1`: the code uses `Math.max(mySeat, 0)`, keep that behaviour. Mock reference for the look: Septica's `docs/mock/septica-layout.html` (approved) and its `Game.tsx`. Show who started/who is next with badges, and keep it within ~390 px portrait. Test with the in-app browser at 390 px width.
3. Replying to the Septica session is optional (the layout is folded into step 2).
4. Re-run `npm test`, `npx tsc --noEmit`, `npx eslint src`, `npx next build`; bump the patch in `package.json` (`npm install --package-lock-only`); commit in small steps; no push without the user's explicit OK.
5. Final report to the coordinator: what was done, exact migration paths, rules chosen for 5 and 6 and why, what was not verified.

## 4. Decisions and reasons

- Spectators live in `rentz_players` with `role='spectator'` (not a new table): the unique nickname index and the existing rejoin code then cover them for free. `listPlayers` returns only players (sorted by seat then join), `listMembers` returns everyone.
- Table order for a match = `seat` order saved by the host; no more "host first + rotation by round" at `start`. To keep a different chooser each match, `new-round` rotates the previous match's order by one; the host can reorder in the lobby afterwards.
- Reorder is allowed only in status `lobby` (a finished match goes back to the lobby via `new-round`). It bumps `rentz_rooms.version` conditionally so a racing `start` loses.
- A queue toggle in a lobby with a free seat seats the spectator immediately (no round to wait for). In a full lobby a newcomer still gets "Camera e plină" rather than becoming a spectator.
- Spectators: `matchAction` returns 403 for them; `/state` already only returns the caller's own hand, so spectators see no cards.
- Leaderboard: only complete matches (`endReason === "complete"`), winners = everyone with the top score (ties share the win), `round_no = room.round`. The `hub_leaderboard_rounds` row is inserted first (unique violation = already counted). Read-modify-write increments (no transaction): two matches ending at the same instant for the same player could lose a +1. Failures are logged, never thrown.
- 5-6 player rules are NOT chosen yet: pick the usual Rentz variant (drop low cards so the deal is exact; adjust the number of hands) and document the choice in this file and in the report.

## 5. Migrations created

- `D:\_DEv\006_Rentz\supabase\migrations\003_spectators_seats.sql` (idempotent: `add column if not exists`, guarded check constraint, backfill only where `seat is null`; assumes 001 and 002, already applied live). Same change folded into `D:\_DEv\006_Rentz\supabase\schema.sql`.
- Hub dependency for leaderboard reporting (not mine): `D:\_DEv\000_Startup\supabase\migrations\002_hub_leaderboard.sql`.
- Do not push before 003 is applied (every player query selects `role, seat, queued_at`). `CLAUDE.md` migration table has row 003 marked "NO, to run by hand": flip it when applied.
- Going to 6 players needs no schema change (the `seat` column is an integer; `rentz_rooms.match` is jsonb).

## 6. Pitfalls and what is unverified

- Windows: `npx tsc`, `eslint` and `next build` are slow (can exceed 2 min); run them in the background or with `timeout`. Route typing (`RouteContext<"/api/...">`) fails in `tsc` until `npx next typegen` or a build has generated the types after adding a route.
- Use scripted edits carefully: files may have CRLF (CLAUDE.md does); a Python helper that normalises and restores line endings was used.
- `scripts/` is untracked (contains `e2e.mjs`, the end-to-end API driver that creates rooms named `e2e-test-...` and deletes them). It only knows the old flow; extending it with spectators/reorder/5-6 players is a good way to verify. Do not commit it without asking.
- NOT verified: any end-to-end run against a real DB with migration 003 applied (spectator join/rejoin, reorder, queue promotion, leaderboard rows); the UI in a browser (Lobby arrows, `SpectatorPanel`); the iOS fix on a real iPhone (cause and fix come from the Bingo agent's notes, also unverified on device).
- Nothing was pushed; production is still at the previous commit. Never print or commit keys from `.env.local`.
- `CLAUDE.md` text still says 3-4 players in places; update it when `MAX_PLAYERS` changes.
