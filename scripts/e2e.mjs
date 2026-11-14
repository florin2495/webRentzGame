// End-to-end test of the Rentz API with real players. Usage: node scripts/e2e.mjs [baseUrl incl. /rentz]
// Rooms are named "e2e-test-…" and deleted at the end (leave as every player, then a DB delete of leftovers
// with the service key as a safety net: env NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY, else .env.local).
// Never sends feedback. Never plays a match to its natural end (that would write the hub leaderboard): the match
// is stopped by a player leaving after a few deals.
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

const BASE = (process.argv[2] ?? "https://games.hailatat.icu/rentz").replace(/\/$/, "");
const ORIGIN = new URL(BASE).origin;
const BASE_PATH = new URL(BASE).pathname;
const VERCEL = "https://web-rentz-game.vercel.app" + BASE_PATH;
const created = new Set();
let failures = 0;

function check(cond, msg) {
  if (cond) console.log("  ✓", msg);
  else {
    failures++;
    console.log("  ✗", msg);
  }
}

async function call(path, { token, body, method } = {}) {
  const headers = {};
  if (token) headers["x-player-token"] = token;
  if (body !== undefined) headers["content-type"] = "application/json";
  const res = await fetch(BASE + path, {
    method: method ?? (body !== undefined ? "POST" : "GET"),
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data, region: res.headers.get("x-vercel-id") };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const state = async (code, p) => (await call(`/api/rooms/${code}/state`, { token: p.token })).data;
const suitOf = (c) => c[1];

/** Same deck as game.ts deckFor(3): the top 6 ranks of every suit. */
const DECK3 = ["S", "H", "C", "D"].flatMap((s) => ["9", "T", "J", "Q", "K", "A"].map((r) => r + s));

async function httpChecks() {
  console.log("HTTP (pages, assets, PWA)");
  const page = await fetch(BASE);
  const html = await page.text();
  check(page.status === 200, `GET ${BASE_PATH} = ${page.status}`);
  // The settings panel (with the version) is only on the room page: collect the chunks of both pages.
  const roomRes = await fetch(`${BASE}/room/XXXXXX`);
  const roomHtml = await roomRes.text();
  check(roomRes.status === 200, `GET /room/XXXXXX = ${roomRes.status} (client shows the join form)`);
  const assets = [...new Set((html + roomHtml).match(new RegExp(`${BASE_PATH}/_next/static/[^"'\\\\]+\\.(?:js|css)`, "g")) ?? [])];
  check(assets.length > 0, `${assets.length} /_next assets referenced under the base path`);
  const assetStatus = await Promise.all(assets.map(async (a) => (await fetch(ORIGIN + a)).status));
  check(assetStatus.every((s) => s === 200), `all /_next assets 200 (${assetStatus.filter((s) => s !== 200).length} failed)`);
  const version = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).version;
  let hasVersion = false;
  for (const a of assets.filter((x) => x.endsWith(".js"))) if ((await (await fetch(ORIGIN + a)).text()).includes(`"${version}"`)) hasVersion = true;
  check(hasVersion, `client JS contains version ${version}`);

  const man = await fetch(`${BASE}/manifest.webmanifest`);
  const manifest = await man.json().catch(() => null);
  check(man.status === 200 && manifest?.start_url === `${BASE_PATH}/`, `manifest 200, start_url ${manifest?.start_url}`);
  check((manifest?.icons ?? []).length >= 2, `manifest lists ${(manifest?.icons ?? []).length} icons`);
  for (const icon of manifest?.icons ?? []) {
    const r = await fetch(ORIGIN + icon.src);
    check(r.status === 200 && (r.headers.get("content-type") ?? "").includes("image/png"), `icon ${icon.src} = ${r.status}`);
  }
  const headIcons = [...new Set(html.match(new RegExp(`${BASE_PATH}/(?:favicon\\.ico|pwa-icon/[a-z0-9]+)`, "g")) ?? [])];
  check(headIcons.length >= 2, `${headIcons.length} icons in <head> (favicon, apple)`);
  for (const href of headIcons) check((await fetch(ORIGIN + href)).status === 200, `head icon ${href} = 200`);

  const v = await fetch(VERCEL);
  const vHtml = await v.text();
  const title = (h) => h.match(/<title>([^<]*)<\/title>/)?.[1];
  check(v.status === 200 && title(vHtml) === title(html), `${VERCEL} = ${v.status}, same page (title ${title(vHtml)})`);
  const chunk = (h) => (h.match(/_next\/static\/[^"']+\.js/g) ?? []).sort().join();
  check(chunk(vHtml) === chunk(html), "vercel.app serves the same build (same chunks)");
}

/**
 * Plays legal cards (the first legal card of whoever acts) until deal `deal` is over or the match stops.
 * `hook(view, actor, actorState)` runs before each play; it may test something and return a new view
 * (when it made the move itself, e.g. autoplay). Returns the number of cards played.
 */
async function playDeal(code, members, deal, hook) {
  const byId = (id) => members.find((p) => p.playerId === id);
  let view = (await state(code, members[0])).match;
  let plays = 0;
  while (view.phase === "playing" && view.deal === deal && plays < 60) {
    const actor = byId(view.seats[view.acting]);
    const as = await state(code, actor);
    if (hook) {
      const next = await hook(as.match, actor, as);
      if (next) {
        view = next;
        plays++;
        continue;
      }
    }
    const card = as.match.legal[0];
    if (!card) {
      check(false, `${actor.name} has no legal card on their turn`);
      break;
    }
    const r = await call(`/api/rooms/${code}/play`, { token: actor.token, body: { card } });
    if (r.status !== 200) {
      check(false, `play ${card} by ${actor.name} failed: ${r.status} ${r.data.error}`);
      break;
    }
    view = r.data.match;
    plays++;
  }
  return plays;
}

async function main() {
  console.log(`E2E against ${BASE}`);
  await httpChecks();

  console.log("Create, list, join, rejoin");
  const tag = `e2e-test-${Date.now().toString(36)}`;
  const dev = { A: randomUUID(), B: randomUUID(), C: randomUUID() };
  check((await call("/api/rooms", { body: { name: "", nickname: "Ana" } })).status === 400, "empty room name = 400");
  const r = await call("/api/rooms", { body: { name: tag, nickname: "Ana", password: "pw", deviceId: dev.A } });
  check(r.status === 200 && /^[A-Z2-9]{6}$/.test(r.data.code ?? ""), `create room (${r.status}) region=${r.region}`);
  const code = r.data.code;
  if (!code) throw new Error("no room");
  created.add(code);
  const A = { ...r.data, name: "Ana" };
  const joinRes = (nickname, deviceId, password = "pw") => call(`/api/rooms/${code}/join`, { body: { nickname, password, deviceId } });
  const join = async (nickname, deviceId) => ({ ...(await joinRes(nickname, deviceId)).data, name: nickname });
  check((await joinRes("Bob", dev.B, "nope")).status === 403, "wrong password = 403");
  check((await call(`/api/rooms/${code}/join`, { body: { nickname: "Bob" } })).status === 403, "missing password = 403");
  const B = await join("Bob", dev.B);
  check(!!B.token && B.playerId !== A.playerId, "Bob joined");
  check((await call(`/api/rooms/${code}/start`, { token: A.token, body: {} })).status === 409, "start with 2 players = 409 (minimum 3)");
  const C = await join("Cris", dev.C);
  check(!!C.token && C.playerId !== B.playerId, "Cris joined");
  check((await joinRes("bob", randomUUID())).status === 409, "nickname of a connected seat from another device = 409");
  check((await joinRes("", randomUUID())).status === 400, "empty nickname = 400");
  check((await joinRes("x".repeat(11), randomUUID())).status === 400, "nickname > 10 = 400");

  // Fill the table to 6, the 7th is refused, then the extra three leave.
  const extra = [];
  for (const nick of ["P4", "P5", "P6"]) extra.push(await join(nick, randomUUID()));
  check(extra.every((p) => !!p.token), "three more join: 6 players");
  check((await joinRes("P7", randomUUID())).status === 409, "7th player = 409 (room full)");
  for (const p of extra) await call(`/api/rooms/${code}/leave`, { token: p.token, body: {} });
  check((await state(code, A)).players.length === 3, "the extra three left: 3 players");

  const list = await call("/api/rooms");
  const item = list.data.rooms?.find((x) => x.code === code);
  check(item?.name === tag && item.hasPassword && item.players === 3 && item.inGame === false, "room in public list, 🔒, 3 players, not in game");
  check(!JSON.stringify(list.data).includes("password_hash") && !JSON.stringify(list.data).includes("scrypt"), "list leaks no password hash");

  check((await call(`/api/rooms/${code}/state`, { token: B.token })).status === 200, "saved token still works");
  const B2 = await join("bob", dev.B);
  check(B2.playerId === B.playerId && B2.token !== B.token, "rejoin from the same device = same seat, new token");
  check((await call(`/api/rooms/${code}/state`, { token: B.token })).status === 401, "old token = 401 after rejoin");
  Object.assign(B, B2, { name: "Bob" });
  check((await call(`/api/rooms/${code}/state`, { token: "bogus" })).status === 401, "bad token = 401");
  check((await call(`/api/rooms/${code}/state`)).status === 401, "no token = 401");
  check((await call(`/api/rooms/ZZZZZZ/state`, { token: A.token })).status === 404, "unknown room = 404");

  console.log("Seats and start");
  check((await call(`/api/rooms/${code}/reorder`, { token: B.token, body: { order: [] } })).status === 403, "non-host reorder = 403");
  check((await call(`/api/rooms/${code}/reorder`, { token: A.token, body: { order: [A.playerId, B.playerId] } })).status === 400, "reorder with a missing player = 400");
  check((await call(`/api/rooms/${code}/reorder`, { token: A.token, body: { order: [A.playerId, A.playerId, B.playerId] } })).status === 400, "reorder with a duplicate = 400");
  check((await call(`/api/rooms/${code}/reorder`, { token: A.token, body: { order: [C.playerId, A.playerId, B.playerId] } })).status === 200, "host reorders: Cris, Ana, Bob");
  check((await state(code, B)).players.map((p) => p.nickname).join() === "Cris,Ana,Bob", "everyone sees the new order");
  check((await call(`/api/rooms/${code}/reorder`, { token: A.token, body: { order: [A.playerId, B.playerId, C.playerId] } })).status === 200, "and back: Ana, Bob, Cris");
  check((await call(`/api/rooms/${code}/play`, { token: A.token, body: { card: "AS" } })).status === 409, "play in the lobby = 409");
  check((await call(`/api/rooms/${code}/start`, { token: B.token, body: {} })).status === 403, "non-host start = 403");
  check((await call(`/api/rooms/${code}/start`, { token: A.token, body: {} })).status === 200, "host starts");
  check((await call(`/api/rooms/${code}/start`, { token: A.token, body: {} })).status === 409, "double start = 409");
  check((await call(`/api/rooms/${code}/reorder`, { token: A.token, body: { order: [A.playerId, B.playerId, C.playerId] } })).status === 409, "reorder mid-match = 409");

  const members = [A, B, C];
  let s = await state(code, A);
  check(s.room.status === "playing" && s.match.seats.join() === [A, B, C].map((p) => p.playerId).join(), "match dealt in seat order Ana, Bob, Cris");
  check(s.match.totalDeals === 21 && s.match.deal === 0 && s.match.phase === "choosing" && s.match.chooser === 0, "21 deals, Ana chooses the first");
  const hands = {};
  for (const p of members) {
    const st = await state(code, p);
    hands[p.playerId] = st.match.hand;
    const raw = JSON.stringify(st);
    check(st.match.hand.length === 8 && st.match.handCounts.every((n) => n === 8), `${p.name} holds 8 cards, everyone 8`);
    check(!raw.includes('"hands"') && !raw.includes("token_hash") && !raw.includes("device_hash") && !raw.includes("password_hash"), `${p.name}'s state leaks no hands or hashes`);
    check(members.filter((o) => o !== p).every((o) => !raw.includes(o.token)), `${p.name}'s state leaks no other tokens`);
  }
  const all = Object.values(hands).flat();
  check(new Set(all).size === 24 && all.every((c) => DECK3.includes(c)), "the 3 hands are 24 distinct cards 9-A");

  console.log("Spectators");
  const devD = randomUUID();
  const devE = randomUUID();
  const dRes = await joinRes("Dan", devD);
  const D = { ...dRes.data, name: "Dan" };
  const eRes = await joinRes("Eli", devE);
  const E = { ...eRes.data, name: "Eli" };
  check(dRes.status === 200 && eRes.status === 200, "two people join the running room");
  const sD = await state(code, D);
  check(sD.me.role === "spectator" && sD.match.mySeat === -1 && sD.match.hand.length === 0 && sD.match.legal.length === 0 && !sD.match.canRefuse, "spectator state: no seat, no hand");
  check(sD.spectators.map((x) => x.nickname).join() === "Dan,Eli" && sD.players.length === 3, "spectator sees the players and spectators");
  const rawD = JSON.stringify(sD);
  check(all.every((c) => !sD.match.hand.includes(c)) && !rawD.includes('"hands"') && members.every((o) => !rawD.includes(o.token)), "spectator state leaks no hands or tokens");
  check((await state(code, A)).spectators.length === 2, "players see the spectators");
  check((await joinRes("dan", randomUUID())).status === 409, "nickname of a connected spectator from another device = 409");
  for (const [path, body] of [["choose", { game: "rege" }], ["play", { card: all[0] }], ["refuse", {}], ["autoplay", {}], ["start", {}], ["new-round", {}], ["reorder", { order: [] }], ["kick", { playerId: A.playerId }]]) {
    const res = await call(`/api/rooms/${code}/${path}`, { token: D.token, body });
    check(res.status === 403, `spectator ${path} = 403 (${res.status})`);
  }
  check((await call(`/api/rooms/${code}/queue`, { token: A.token, body: {} })).status === 409, "a player cannot queue");
  check((await call(`/api/rooms/${code}/queue`, { token: D.token, body: {} })).data.queued === true, "Dan queues for the next match");
  check((await call(`/api/rooms/${code}/queue`, { token: D.token, body: {} })).data.queued === false, "queue is a toggle (Dan out)");
  check((await call(`/api/rooms/${code}/queue`, { token: E.token, body: {} })).data.queued === true, "Eli queues first");
  check((await call(`/api/rooms/${code}/queue`, { token: D.token, body: {} })).data.queued === true, "Dan queues second");
  check((await state(code, D)).spectators.map((x) => x.nickname).join() === "Eli,Dan", "queue order: Eli, Dan");
  const D2 = await joinRes("Dan", devD);
  check(D2.status === 200 && D2.data.playerId === D.playerId && D2.data.token !== D.token, "spectator rejoins from the same device = same id, new token");
  D.token = D2.data.token;
  const sD2 = await state(code, D);
  check(sD2.me.role === "spectator" && sD2.me.queued === true, "still a spectator, queue survives the rejoin");

  console.log("Choosing, refusal");
  check((await call(`/api/rooms/${code}/choose`, { token: B.token, body: { game: "rege" } })).status === 409, "choose by a non-chooser = 409");
  check((await call(`/api/rooms/${code}/choose`, { token: A.token, body: { game: "poker" } })).status === 409, "unknown game = 409");
  check((await call(`/api/rooms/${code}/choose`, { token: A.token, body: { game: "rentz" } })).status === 409, "Rentz without a start card = 409");
  check((await call(`/api/rooms/${code}/choose`, { token: A.token, body: { game: "rentz", start: "2" } })).status === 409, "Rentz start 2 (not in a 3-player deck) = 409");
  check((await call(`/api/rooms/${code}/play`, { token: A.token, body: { card: hands[A.playerId][0] } })).status === 409, "play before the game is chosen = 409");
  const ref = await call(`/api/rooms/${code}/refuse`, { token: B.token, body: {} });
  check(ref.status === 200 && ref.data.match.refused[1] === true && ref.data.match.lastRefusal?.seat === 1, "Bob refuses the cards");
  s = await state(code, C);
  check(s.match.phase === "choosing" && s.match.deal === 0 && s.match.chooser === 0 && s.match.lastRefusal?.seat === 1, "redealt: same deal, Ana still chooses, everyone sees the refusal");
  check(s.match.hand.length === 8, "Cris got 8 new cards");
  check((await call(`/api/rooms/${code}/refuse`, { token: B.token, body: {} })).status === 409, "second refusal in the match = 409");
  check((await call(`/api/rooms/${code}/autoplay`, { token: A.token, body: {} })).status === 409, "host autoplay on his own turn = 409");
  const ch = await call(`/api/rooms/${code}/choose`, { token: A.token, body: { game: "rege" } });
  check(ch.status === 200 && ch.data.match.game === "rege" && ch.data.match.phase === "playing" && ch.data.match.acting === 0, "Ana chooses Regele de inimă and leads");
  check((await call(`/api/rooms/${code}/choose`, { token: A.token, body: { game: "dame" } })).status === 409, "choose twice = 409");

  console.log("Deal 1 (Regele de inimă): illegal moves, autoplay, kick, rejoin");
  const done = { outOfTurn: false, notMine: false, follow: false, refuseLate: false, autoplay: false, kick: false, rejoin: false };
  const plays1 = await playDeal(code, members, 0, async (view, actor, as) => {
    const others = members.filter((p) => p !== actor);
    if (!done.outOfTurn) {
      done.outOfTurn = true;
      const o = others[0];
      const card = (await state(code, o)).match.hand[0];
      check((await call(`/api/rooms/${code}/play`, { token: o.token, body: { card } })).status === 409, `${o.name} plays out of turn = 409`);
      const foreign = (await state(code, others[1])).match.hand[0];
      check((await call(`/api/rooms/${code}/play`, { token: actor.token, body: { card: foreign } })).status === 409, `${actor.name} plays a card he does not hold = 409`);
      check((await call(`/api/rooms/${code}/play`, { token: actor.token, body: { card: "XX" } })).status === 409, "malformed card = 409");
      done.notMine = true;
    }
    if (!done.refuseLate && view.trick.length > 0) {
      done.refuseLate = true;
      check(!(await state(code, C)).match.canRefuse, "Cris can no longer refuse after the first card");
      check((await call(`/api/rooms/${code}/refuse`, { token: C.token, body: {} })).status === 409, "refuse after the first card = 409");
    }
    if (!done.follow && view.trick.length > 0) {
      const lead = suitOf(view.trick[0].card);
      const off = as.match.hand.find((c) => suitOf(c) !== lead);
      if (as.match.hand.some((c) => suitOf(c) === lead) && off) {
        done.follow = true;
        const res = await call(`/api/rooms/${code}/play`, { token: actor.token, body: { card: off } });
        check(res.status === 409 && /culoare/.test(res.data.error ?? ""), `${actor.name} must follow suit: ${off} on ${lead} = 409`);
        check(!as.match.legal.includes(off) && as.match.legal.every((c) => suitOf(c) === lead), "legal cards = the lead suit only");
      }
    }
    if (!done.kick) {
      done.kick = true;
      check((await call(`/api/rooms/${code}/kick`, { token: B.token, body: { playerId: C.playerId } })).status === 403, "non-host kick = 403");
      const k = await call(`/api/rooms/${code}/kick`, { token: A.token, body: { playerId: C.playerId } });
      check(k.status === 200 && k.data.pending === true, "kick mid-match is pending");
      check((await state(code, C)).me.kickRemainingMs > 0, "kicked player sees the countdown");
      check((await call(`/api/rooms/${code}/kick/ignore`, { token: C.token, body: {} })).status === 200, "Ignoră");
      check((await state(code, A)).players.every((p) => p.kickRemainingMs === null), "kick cleared for everyone");
    }
    if (!done.rejoin && actor !== B) {
      done.rejoin = true;
      const before = (await state(code, B)).match.hand.join();
      const nb = await join("Bob", dev.B);
      check(nb.playerId === B.playerId && nb.token !== B.token, "Bob rejoins mid-match, same seat");
      Object.assign(B, nb, { name: "Bob" });
      check((await state(code, B)).match.hand.join() === before, "same hand after the rejoin");
    }
    if (!done.autoplay && actor !== A) {
      done.autoplay = true;
      check((await call(`/api/rooms/${code}/autoplay`, { token: B === actor ? C.token : B.token, body: {} })).status === 403, "non-host autoplay = 403");
      const ap = await call(`/api/rooms/${code}/autoplay`, { token: A.token, body: {} });
      check(ap.status === 200, `host plays for ${actor.name} (autoplay)`);
      return ap.data.match;
    }
    return null;
  });
  if (!done.follow) console.log("  - (no follow-suit situation came up this deal, check skipped)");
  check(done.outOfTurn && done.refuseLate && done.kick && done.rejoin && done.autoplay, "every deal-1 check ran");
  s = await state(code, A);
  const h1 = s.match.history[0];
  check(s.match.deal === 1 && h1?.game === "rege" && h1.chooser === 0, `deal 1 over after ${plays1} cards`);
  check(h1 && h1.points.filter((p) => p === -100).length === 1 && h1.points.reduce((a, b) => a + b, 0) === -100, `K♥ cost one player −100 (${h1?.points.join("/")})`);
  check(s.match.scores.join() === h1?.points.join(), "scores = deal 1 points");
  check(s.match.phase === "choosing" && s.match.chooser === 1 && s.match.remaining[0].length === 6, "deal 2: Bob chooses, Ana has 6 games left");

  console.log("Deal 2 (Rentz from 9)");
  const ch2 = await call(`/api/rooms/${code}/choose`, { token: B.token, body: { game: "rentz", start: "9" } });
  check(ch2.status === 200 && ch2.data.match.game === "rentz" && ch2.data.match.rentzStart === "9", "Bob chooses Rentz from 9");
  let first = true;
  const plays2 = await playDeal(code, members, 1, async (view, actor, as) => {
    if (first) {
      first = false;
      check(as.match.legal.every((c) => c[0] === "9"), `only 9s can open the rows (${as.match.legal.join(" ")})`);
      const bad = as.match.hand.find((c) => c[0] !== "9");
      if (bad) check((await call(`/api/rooms/${code}/play`, { token: actor.token, body: { card: bad } })).status === 409, `${bad} cannot open a row = 409`);
    }
    return null;
  });
  s = await state(code, A);
  const h2 = s.match.history[1];
  check(s.match.deal === 2 && h2?.game === "rentz", `deal 2 over after ${plays2} cards`);
  check(h2 && [...h2.points].sort((a, b) => b - a).join() === "300,200,100", `Rentz places pay 300/200/100 (${h2?.points.join("/")})`);

  console.log("Deal 3 (Whist), deal 4 rules");
  check((await call(`/api/rooms/${code}/choose`, { token: C.token, body: { game: "whist" } })).status === 200, "Cris chooses Whist");
  const plays3 = await playDeal(code, members, 2);
  s = await state(code, A);
  const h3 = s.match.history[2];
  check(plays3 === 24 && h3?.game === "whist" && h3.points.reduce((a, b) => a + b, 0) === 400, `Whist: 8 tricks, +400 in total (${h3?.points.join("/")})`);
  const sum = [0, 1, 2].map((i) => s.match.history.reduce((t, h) => t + h.points[i], 0));
  check(s.match.scores.join() === sum.join(), `scores add up (${s.match.scores.join("/")})`);
  check(s.match.chooser === 0 && s.match.deal === 3, "deal 4: Ana chooses again");
  check((await call(`/api/rooms/${code}/choose`, { token: A.token, body: { game: "rege" } })).status === 409, "a game cannot be chosen twice by the same player = 409");
  check((await call(`/api/rooms/${code}/choose`, { token: A.token, body: { game: "dame" } })).status === 200, "Ana chooses Dame");
  await playDeal(code, members, 3, async (view) => (view.trick.length === 0 && view.tricks.reduce((a, b) => a + b, 0) >= 2 ? { phase: "stop" } : null));

  console.log("Leave mid-match, new round");
  const left = await call(`/api/rooms/${code}/leave`, { token: C.token, body: {} });
  check(left.status === 200 && left.data.roomClosed === false, "Cris leaves mid-match");
  s = await state(code, A);
  check(s.room.status === "finished" && s.match.phase === "over" && s.match.endReason === "abandoned", "match stopped (abandoned) for everyone");
  check(s.room.winnerPlayerId === s.match.seats[s.match.scores.indexOf(Math.max(...s.match.scores))] || s.room.winnerPlayerId === null, "winner = the leader");
  check((await call(`/api/rooms/${code}/play`, { token: A.token, body: { card: "AS" } })).status === 409, "play after the end = 409");
  check((await call(`/api/rooms/${code}/new-round`, { token: B.token, body: {} })).status === 403, "non-host new round = 403");
  check((await call(`/api/rooms/${code}/new-round`, { token: A.token, body: {} })).status === 200, "host new round");
  check((await call(`/api/rooms/${code}/new-round`, { token: A.token, body: {} })).status === 409, "double new round = 409");
  s = await state(code, B);
  check(s.room.status === "lobby" && s.room.round === 2 && s.match === null, "round 2: clean lobby");
  check(s.players.map((p) => p.nickname).join() === "Bob,Ana,Eli,Dan", `seats rotated, queued spectators seated in queue order (${s.players.map((p) => p.nickname).join()})`);
  check(s.spectators.length === 0, "queue emptied");
  check((await state(code, D)).me.role === "player" && (await state(code, E)).me.role === "player", "spectator tokens still work, now as players");

  console.log("Round 2: pending kick enforced");
  check((await call(`/api/rooms/${code}/leave`, { token: D.token, body: {} })).status === 200, "Dan leaves the lobby");
  check((await call(`/api/rooms/${code}/start`, { token: A.token, body: {} })).status === 200, "round 2 started (Bob, Ana, Eli)");
  s = await state(code, A);
  check(s.match.seats[0] === B.playerId && s.match.chooser === 0, "round 2: Bob chooses first");
  await call(`/api/rooms/${code}/kick`, { token: A.token, body: { playerId: E.playerId } });
  await sleep(12_500);
  check((await call(`/api/rooms/${code}/state`, { token: E.token })).status === 401, "pending kick enforced after 12 s");
  s = await state(code, A);
  check(s.players.length === 2 && s.room.status === "finished" && s.match.endReason === "abandoned", "2 players left, the match stopped");

  console.log("Lobby kick, cleanup");
  await call(`/api/rooms/${code}/new-round`, { token: A.token, body: {} });
  const F = await join("Fay", randomUUID());
  check(!!F.token, "Fay joins the lobby");
  check((await call(`/api/rooms/${code}/kick`, { token: A.token, body: { playerId: A.playerId } })).status === 400, "host cannot kick himself");
  check((await call(`/api/rooms/${code}/kick`, { token: A.token, body: { playerId: "not-a-uuid" } })).status === 404, "kick unknown id = 404");
  const k = await call(`/api/rooms/${code}/kick`, { token: A.token, body: { playerId: F.playerId } });
  check(k.status === 200 && !k.data.pending, "lobby kick is immediate");
  check((await call(`/api/rooms/${code}/state`, { token: F.token })).status === 401, "kicked player = 401");
  check((await call(`/api/rooms/${code}/leave`, { token: B.token, body: {} })).data.roomClosed === false, "Bob leaves");
  const last = await call(`/api/rooms/${code}/leave`, { token: A.token, body: {} });
  check(last.data.roomClosed === true, "last one out closes the room");
  check((await joinRes("X", randomUUID())).status === 404, "room gone");
  created.delete(code);
}

/** Supabase URL + service key: environment (GitHub Actions secrets) first, else .env.local. */
function supabaseEnv() {
  const { NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
  if (NEXT_PUBLIC_SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) return { NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY };
  return Object.fromEntries(
    readFileSync(new URL("../.env.local", import.meta.url), "utf8")
      .split(/\r?\n/)
      .filter((l) => l.includes("=") && !l.startsWith("#"))
      .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim().replace(/^"|"$/g, "")]),
  );
}

/** Safety net: delete rooms left behind by a failed run, straight in the DB (service key from env or .env.local). */
async function cleanup() {
  if (created.size === 0) return;
  try {
    const env = supabaseEnv();
    const url = `${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rentz_rooms?code=in.(${[...created].join(",")})&name=like.e2e-test-*`;
    const key = env.SUPABASE_SERVICE_ROLE_KEY;
    const res = await fetch(url, { method: "DELETE", headers: { apikey: key, authorization: `Bearer ${key}` } });
    console.log(`  cleanup: deleted leftover rooms ${[...created].join(", ")} (${res.status})`);
  } catch (err) {
    console.log("  cleanup failed, delete these rooms by hand:", [...created].join(", "), err.message);
  }
}

try {
  await main();
} catch (err) {
  failures++;
  console.error(err);
} finally {
  await cleanup();
}
console.log(failures === 0 ? "\nE2E OK" : `\nE2E FAILED: ${failures} check(s)`);
process.exit(failures === 0 ? 0 : 1);
