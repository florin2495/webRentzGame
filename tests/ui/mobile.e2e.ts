// Scenario 3 (phone only): no screen may scroll sideways (home, lobby, the match with the table, the hand of 8
// cards and the game picker), every card in the hand and every game button must stay big enough to tap (WCAG 2.2
// minimum target: 24 x 24 CSS px), and a real touch tap must play a card that the other phones see live.
// Scenario 1 already plays a full deal on the emulated iPhone; this one checks the layout.
import { expect, test } from "@playwright/test";
import {
  createRoom,
  expectNoHorizontalScroll,
  joinRoom,
  leaveAll,
  playableCards,
  playFirstCard,
  REALTIME_MS,
  startMatch,
  turnBadge,
  withPlayers,
} from "./helpers";

const MIN_TAP_PX = 24;

test("the match fits a phone screen and a card is played by touch", async ({ browser }) => {
  test.skip(!test.info().project.use.isMobile, "phone layout only");

  await withPlayers(browser, ["Ana", "Bob", "Cris"], async (players, room) => {
    const [host, bob, cris] = players;

    await test.step("home page fits the screen", async () => {
      await host.page.goto("./");
      await expect(host.page.getByTestId("home-submit")).toBeVisible();
      await expectNoHorizontalScroll(host.page);
    });

    await test.step("lobby fits the screen", async () => {
      room.code = await createRoom(host);
      await joinRoom(bob, room.code);
      await joinRoom(cris, room.code);
      await expect(host.page.getByTestId("lobby-players")).toContainText(cris.name, { timeout: REALTIME_MS });
      await expectNoHorizontalScroll(host.page);
    });

    await test.step("match screen fits, cards and game buttons are big enough to tap", async () => {
      await startMatch(players);
      for (const p of players) {
        await expectNoHorizontalScroll(p.page);
        const sizes = await p.page
          .getByTestId("my-hand")
          .locator("[data-card]")
          .evaluateAll((els) => els.map((e) => Math.min(e.getBoundingClientRect().width, e.getBoundingClientRect().height)));
        expect(sizes).toHaveLength(8);
        expect(Math.min(...sizes), `smallest card in the hand of ${p.name}`).toBeGreaterThanOrEqual(MIN_TAP_PX);
      }
      const options = host.page.getByTestId("game-option");
      await expect(options).toHaveCount(7);
      const heights = await options.evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height));
      expect(Math.min(...heights), "smallest game button").toBeGreaterThanOrEqual(MIN_TAP_PX);
    });

    await test.step("the host taps a game, then taps a card; the other phones see it live", async () => {
      await host.page.locator('[data-testid="game-option"][data-game="whist"]').tap();
      await host.page.getByTestId("choose-game").tap();
      await expect(turnBadge(host)).toHaveText("Tura ta");
      await expect(playableCards(host)).toHaveCount(8);
      const view = await playFirstCard(host, room.code, true); // a touch tap, not a mouse click
      await expect(host.page.getByTestId("my-hand").locator("[data-card]")).toHaveCount(7);
      expect(view.names[view.acting]).toBe(bob.name);
      await expect(turnBadge(bob)).toHaveText("Tura ta", { timeout: REALTIME_MS });
      await expect(turnBadge(cris)).toHaveText("Tura lui Bob", { timeout: REALTIME_MS });
      for (const p of players) await expectNoHorizontalScroll(p.page);
    });

    await test.step("everyone leaves, the room closes", async () => {
      await leaveAll([cris, bob, host]);
      room.closed = true;
    });
  });
});
