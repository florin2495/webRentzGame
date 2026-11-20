// Scenario 2: someone opens the invite link of a running match. They become a spectator (no hand, no player
// buttons), the players see them live, they queue for the next match, they follow every turn live, see the deal
// result and the stopped match, and the host's "Meci nou" seats them. Desktop Chromium only: it checks game logic
// and Realtime, the device does not matter (scenario 1 already runs on WebKit).
import { expect, test } from "@playwright/test";
import { chooseGame, closeDealResult, createRoom, joinRoom, leaveAll, playDeal, REALTIME_MS, startMatch, withPlayers } from "./helpers";

test("a late joiner watches as a spectator and plays from the next match", async ({ browser }) => {
  test.skip(test.info().project.name !== "desktop-chromium", "game logic, one browser is enough");

  await withPlayers(browser, ["Ana", "Bob", "Cris", "Dan"], async (all, room) => {
    const [host, bob, cris, dan] = all;
    const players = [host, bob, cris];

    await test.step("three players start a match", async () => {
      room.code = await createRoom(host);
      await joinRoom(bob, room.code);
      await joinRoom(cris, room.code);
      await startMatch(players);
    });

    await test.step("a fourth person joins mid-match and becomes a spectator", async () => {
      await joinRoom(dan, room.code);
      const sp = dan.page;
      await expect(sp.getByTestId("spectator-status")).toBeVisible();
      await expect(sp.getByTestId("queue-toggle")).toBeVisible();
      for (const id of ["my-hand", "refuse", "choose-game", "new-round"]) await expect(sp.getByTestId(id)).toHaveCount(0);
      for (const p of players) {
        await expect(p.page.getByTestId("spectator-list")).toContainText(dan.name, { timeout: REALTIME_MS });
      }
    });

    await test.step("the spectator queues for the next match, the players see it live", async () => {
      await dan.page.getByTestId("queue-toggle").click();
      await expect(dan.page.getByTestId("queue-toggle")).toContainText("Ești în coadă");
      await expect(host.page.getByTestId("spectator-list")).toContainText("în coadă", { timeout: REALTIME_MS });
    });

    await test.step("a whole deal is played; the spectator follows every turn live", async () => {
      const view = await chooseGame(host, room.code, "rege");
      await playDeal(players, room.code, view, [dan]);
      await closeDealResult([...players, dan], "Regele de inimă", "Mâna 2/24");
    });

    await test.step("a player leaves: the spectator sees the stopped match", async () => {
      await leaveAll([cris]);
      await expect(dan.page.getByTestId("final-banner")).toHaveAttribute("data-end", "abandoned", { timeout: REALTIME_MS });
    });

    await test.step("new match: the queued spectator becomes a player", async () => {
      await host.page.getByTestId("new-round").click();
      await expect(dan.page.getByTestId("lobby-players")).toContainText(`${dan.name} (tu)`, { timeout: REALTIME_MS });
      await expect(dan.page.getByTestId("queue-toggle")).toHaveCount(0);
      await expect(host.page.getByTestId("lobby-players")).toContainText(dan.name);
      await expect(host.page.getByTestId("spectator-list")).toHaveCount(0);
    });

    await test.step("everyone leaves, the room closes", async () => {
      await leaveAll([dan, bob, host]);
      room.closed = true;
    });
  });
});
