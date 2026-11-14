// Scenario 1: three real browsers (Rentz needs at least 3 players) play a live match on the deployed site: create,
// join by link, start, the host chooses "Regele de inimă", the whole deal is played card by card (each move reaches
// the next player through Realtime, well under the 15 s polling fallback), everyone sees the deal result and the
// next chooser, a player leaves mid-match (match stopped for everyone), the host starts a new match, leave.
// Runs on every project.
import { expect, test } from "@playwright/test";
import { chooseGame, closeDealResult, createRoom, joinRoom, leaveAll, playDeal, REALTIME_MS, startMatch, turnBadge, withPlayers } from "./helpers";

test("three players play a live deal of Rentz", async ({ browser }) => {
  await withPlayers(browser, ["Ana", "Bob", "Cris"], async (players, room) => {
    const [host, bob, cris] = players;

    await test.step("host creates a room, the others join by link, host starts", async () => {
      room.code = await createRoom(host);
      await joinRoom(bob, room.code);
      await joinRoom(cris, room.code);
      await startMatch(players);
      for (const p of players) {
        await expect(p.page.getByTestId("deal-counter")).toHaveText("Mâna 1/21");
        await expect(p.page.getByTestId("my-hand").locator("[data-card]")).toHaveCount(8);
      }
    });

    await test.step("host chooses Regele de inimă, the deal is played to its end, every turn live", async () => {
      const view = await chooseGame(host, room.code, "rege");
      expect(view.phase).toBe("playing");
      for (const p of [bob, cris]) {
        await expect(p.page.getByRole("heading", { name: "Regele de inimă" })).toBeVisible({ timeout: REALTIME_MS });
      }
      const after = await playDeal(players, room.code, view);
      expect(after.deal).toBe(1);
    });

    await test.step("everyone sees the deal result, then Bob chooses the next game", async () => {
      await closeDealResult(players, "Regele de inimă", "Mâna 2/21");
      await expect(turnBadge(bob)).toHaveText("Uită-te în cărți și alege jocul");
      await expect(turnBadge(host)).toHaveText("Așteptăm alegerea lui Bob");
    });

    await test.step("Cris leaves mid-match: the match stops for everyone", async () => {
      await leaveAll([cris]);
      for (const p of [host, bob]) {
        await expect(p.page.getByTestId("final-banner")).toHaveAttribute("data-end", "abandoned", { timeout: REALTIME_MS });
      }
    });

    await test.step("host starts a new match, Bob follows live", async () => {
      await host.page.getByTestId("new-round").click();
      await expect(host.page.getByTestId("lobby-players")).toBeVisible();
      await expect(bob.page.getByTestId("lobby-players")).toBeVisible({ timeout: REALTIME_MS });
      await expect(bob.page.getByTestId("lobby-players")).not.toContainText("Cris");
    });

    await test.step("both leave, the room closes", async () => {
      await leaveAll([bob, host]);
      room.closed = true;
    });
  });
});
