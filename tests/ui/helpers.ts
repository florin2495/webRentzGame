// Shared steps for the Playwright UI tests (tests/ui/*.e2e.ts). Not a test file itself (no .e2e.ts suffix).
// Rooms are named "e2e-test-ui-…"; a leftover is deleted with the service key (env) as a safety net.
// Rentz is random (dealt cards): every move is picked from what the screen offers (the first playable card),
// and whose turn it is comes from the server's answer to the previous move (the `match` view it returns).
import { expect, test, type Browser, type BrowserContext, type Page, type Response } from "@playwright/test";

/** A change has to show up on another screen within this, without a reload. Polling alone takes up to 60 s. */
export const REALTIME_MS = 5_000;

export interface Player {
  name: string;
  context: BrowserContext;
  page: Page;
}

/** The parts of the MatchView (src/lib/types.ts) the tests read from action answers. */
interface MatchView {
  names: string[];
  deal: number;
  phase: "choosing" | "playing" | "over";
  acting: number;
}

/** A separate browser context = a separate device (own localStorage session), with the project's device settings. */
export async function newPlayer(browser: Browser, name: string): Promise<Player> {
  const use = test.info().project.use;
  const context = await browser.newContext({
    baseURL: use.baseURL,
    locale: use.locale,
    viewport: use.viewport,
    userAgent: use.userAgent,
    deviceScaleFactor: use.deviceScaleFactor,
    isMobile: use.isMobile,
    hasTouch: use.hasTouch,
  });
  return { name, context, page: await context.newPage() };
}

export const turnBadge = (p: Player) => p.page.getByTestId("turn-badge");
export const playableCards = (p: Player) => p.page.getByTestId("my-hand").locator("button:enabled");

const isAction = (code: string, path: string) => (r: Response) => r.url().endsWith(`/api/rooms/${code}/${path}`) && r.request().method() === "POST";

/** Host creates a room (no password) from the home page; returns its code. */
export async function createRoom(host: Player): Promise<string> {
  const page = host.page;
  await page.goto("./");
  await page.getByLabel("Numele camerei").fill(`e2e-test-ui-${Date.now().toString(36)}`);
  await page.getByLabel("Nickname-ul tău").fill(host.name);
  await page.getByTestId("home-submit").click();
  await page.waitForURL(/\/room\/[A-Z2-9]{6}$/);
  await expect(page.getByTestId("lobby-players")).toContainText(host.name);
  return page.url().match(/\/room\/([A-Z2-9]{6})$/)![1];
}

/** Opens the invite link and joins with the player's nickname (lands in the lobby or as a spectator). */
export async function joinRoom(p: Player, code: string): Promise<void> {
  await p.page.goto(`room/${code}`);
  await p.page.getByLabel("Nickname-ul tău").fill(p.name);
  await p.page.getByTestId("join-submit").click();
  await expect(p.page.getByTestId("join-submit")).toBeHidden();
}

/** The chooser answers "no" to the blind question (their cards show up), then everyone sees them choosing. */
export async function declineBlind(chooser: Player, others: Player[], code: string): Promise<void> {
  await expect(turnBadge(chooser)).toHaveText("Joci blind? Răspunde înainte să vezi cărțile");
  await expect(chooser.page.getByTestId("hand-hidden")).toBeVisible();
  for (const p of others) {
    await expect(turnBadge(p)).toHaveText(`${chooser.name} decide dacă joacă blind`, { timeout: REALTIME_MS });
  }
  const [res] = await Promise.all([chooser.page.waitForResponse(isAction(code, "blind")), chooser.page.getByTestId("blind-no").click()]);
  expect(res.ok(), `blind no: ${res.status()}`).toBe(true);
  await expect(turnBadge(chooser)).toHaveText("Uită-te în cărți și alege jocul");
  for (const p of others) {
    await expect(turnBadge(p)).toHaveText(`Așteptăm alegerea lui ${chooser.name}`, { timeout: REALTIME_MS });
  }
}

/** Host (players[0]) starts once every player shows up in the lobby; the host declines blind, everyone sees the host choosing. */
export async function startMatch(players: Player[]): Promise<void> {
  const host = players[0];
  for (const p of players.slice(1)) {
    await expect(host.page.getByTestId("lobby-players")).toContainText(p.name, { timeout: REALTIME_MS });
  }
  await expect(host.page.getByTestId("start-game")).toBeEnabled();
  await host.page.getByTestId("start-game").click();
  const code = decodeURIComponent(new URL(host.page.url()).pathname.split("/").filter(Boolean).pop() ?? "");
  await declineBlind(host, players.slice(1), code);
}

/** The chooser picks `game` (a GameId, not Rentz: no start card) on screen; returns the server's new view. */
export async function chooseGame(chooser: Player, code: string, game: string): Promise<MatchView> {
  await chooser.page.locator(`[data-testid="game-option"][data-game="${game}"]`).click();
  const [res] = await Promise.all([
    chooser.page.waitForResponse(isAction(code, "choose")),
    chooser.page.getByTestId("choose-game").click(),
  ]);
  expect(res.ok(), `choose ${game}: ${res.status()}`).toBe(true);
  return ((await res.json()) as { match: MatchView }).match;
}

/** The acting player taps (touch) or clicks their first playable card; returns the server's new view. */
export async function playFirstCard(actor: Player, code: string, touch = false): Promise<MatchView> {
  const card = playableCards(actor).first();
  await expect(card).toBeVisible();
  const [res] = await Promise.all([actor.page.waitForResponse(isAction(code, "play")), touch ? card.tap() : card.click()]);
  expect(res.ok(), `${actor.name} plays: ${res.status()}`).toBe(true);
  return ((await res.json()) as { match: MatchView }).match;
}

/**
 * Plays deal `view.deal` to its end, one card at a time, always the first playable card of whoever acts.
 * Before every move the acting player's screen must say "Tura ta" within REALTIME_MS (the previous card was
 * played on another device, so this checks the live update). `watchers` (spectators) must follow every turn.
 */
export async function playDeal(players: Player[], code: string, view: MatchView, watchers: Player[] = []): Promise<MatchView> {
  const deal = view.deal;
  let plays = 0;
  while (view.phase === "playing" && view.deal === deal) {
    expect(plays++, "a deal has at most 8 tricks").toBeLessThan(60);
    const actorName = view.names[view.acting];
    const actor = players.find((p) => p.name === actorName)!;
    await expect(turnBadge(actor)).toHaveText("Tura ta", { timeout: REALTIME_MS });
    for (const w of watchers) await expect(turnBadge(w)).toHaveAttribute("data-acting", actorName, { timeout: REALTIME_MS });
    view = await playFirstCard(actor, code);
  }
  return view;
}

/** Everyone sees the deal-result pop-up of `gameName` live and closes it; the next deal is shown. */
export async function closeDealResult(players: Player[], gameName: string, nextDealLabel: string): Promise<void> {
  for (const p of players) {
    await expect(p.page.getByTestId("deal-result")).toContainText(gameName, { timeout: REALTIME_MS });
    await p.page.getByTestId("deal-result-ok").click();
    await expect(p.page.getByTestId("deal-result")).toBeHidden();
    await expect(p.page.getByTestId("deal-counter")).toHaveText(nextDealLabel);
  }
}

/** Leaves through the "Părăsește" button (accepting the confirm), in the given order. */
export async function leaveAll(players: Player[]): Promise<void> {
  for (const p of players) {
    p.page.once("dialog", (d) => void d.accept());
    await p.page.getByTestId("leave").click();
    await expect(p.page.getByTestId("home-submit")).toBeVisible();
  }
}

/** The page must not scroll sideways (the usual mobile layout bug). */
export async function expectNoHorizontalScroll(page: Page): Promise<void> {
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth))
    .toBeLessThanOrEqual(0);
}

/** Safety net: delete the room straight in the DB if the UI flow did not close it. */
export async function deleteRoom(code: string): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.log(`cleanup: no Supabase env, delete room ${code} by hand if it is still there`);
    return;
  }
  const res = await fetch(`${url}/rest/v1/rentz_rooms?code=eq.${code}&name=like.e2e-test-ui-*`, {
    method: "DELETE",
    headers: { apikey: key, authorization: `Bearer ${key}` },
  });
  console.log(`cleanup: room ${code} delete = ${res.status}`);
}

/** Runs `body` with fresh players; always closes their browsers and deletes the room if it was left open. */
export async function withPlayers(
  browser: Browser,
  names: string[],
  body: (players: Player[], room: { code: string; closed: boolean }) => Promise<void>,
): Promise<void> {
  const players = await Promise.all(names.map((n) => newPlayer(browser, n)));
  const room = { code: "", closed: false };
  try {
    await body(players, room);
  } finally {
    if (room.code && !room.closed) await deleteRoom(room.code);
    for (const p of players) await p.context.close();
  }
}
