import { describe, expect, it } from "vitest";
import {
  autoAction,
  BASE_GAMES,
  canCancelRentz,
  cancelRentz,
  canRefuse,
  capeteCount,
  chooseGame,
  dealHands,
  dealPoints,
  decideBlind,
  deckFor,
  gamesOf,
  handHidden,
  isRoomAbandoned,
  isRoomExpired,
  legalCards,
  LEGACY_GAMES,
  newMatch,
  playCard,
  ranksFor,
  refuseCards,
  remainingGames,
  rentzPoints,
  rentzRow,
  ROOM_ABANDONED_MS,
  ROOM_ABANDONED_PLAYING_MS,
  RulesError,
  type Match,
} from "./game";

function seeded(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ids = (n: number) => Array.from({ length: n }, (_, i) => `p${i}`);

/** Builds a match in the playing phase with fixed hands (seat 0 chooses, not blind). */
function fixed(hands: string[][], game: Match["game"]): Match {
  const n = hands.length;
  let m = newMatch(ids(n), ids(n), seeded(1));
  m = decideBlind({ ...m, hands: hands.map((h) => [...h]) }, 0, false);
  return chooseGame(m, 0, game, null);
}

describe("deck", () => {
  it("uses the top 2N ranks: 24 cards for 3 players, 32 for 4, 40 for 5, 48 for 6", () => {
    expect(ranksFor(3)).toEqual(["9", "T", "J", "Q", "K", "A"]);
    expect(deckFor(3)).toHaveLength(24);
    expect(deckFor(4)).toHaveLength(32);
    expect(ranksFor(5)).toEqual(["5", "6", "7", "8", "9", "T", "J", "Q", "K", "A"]);
    expect(deckFor(5)).toHaveLength(40);
    expect(ranksFor(6)).toHaveLength(12);
    expect(ranksFor(6)[0]).toBe("3");
    expect(deckFor(6)).toHaveLength(48);
  });

  it("deals 8 distinct cards to everyone (3 to 6 players)", () => {
    for (const n of [3, 4, 5, 6]) {
      const hands = dealHands(n, seeded(7));
      expect(hands).toHaveLength(n);
      expect(hands.every((h) => h.length === 8)).toBe(true);
      expect(new Set(hands.flat()).size).toBe(8 * n);
    }
  });
});

describe("trick games", () => {
  const hands = [
    ["AS", "9H", "7C", "8D", "TS", "JH", "QC", "KD"],
    ["KS", "AH", "8C", "9D", "JS", "QH", "KC", "AD"],
    ["QS", "KH", "9C", "TD", "7S", "8H", "TC", "JD"],
    ["8S", "TH", "AC", "7D", "9S", "7H", "JC", "QD"],
  ];

  it("must follow suit, highest card of the led suit wins and leads next", () => {
    let m = fixed(hands, "levate");
    expect(m.turn).toBe(0);
    m = playCard(m, 0, "TS");
    expect(legalCards(m, 1)).toEqual(["KS", "JS"]);
    expect(() => playCard(m, 1, "AH")).toThrow(RulesError);
    m = playCard(m, 1, "JS");
    m = playCard(m, 2, "QS");
    m = playCard(m, 3, "8S");
    expect(m.lastTrick?.winner).toBe(2);
    expect(m.turn).toBe(2);
    expect(m.tricks).toEqual([0, 0, 1, 0]);
  });

  it("off-suit cards never win", () => {
    let m = fixed(hands, "levate");
    m = playCard(m, 0, "9H");
    m = playCard(m, 1, "QH");
    m = playCard(m, 2, "KH");
    m = playCard(m, 3, "TH");
    expect(m.lastTrick?.winner).toBe(2);
  });

  it("Regele de inimă: −200, the deal ends as soon as K♥ is taken", () => {
    let m = fixed(hands, "rege");
    m = playCard(m, 0, "9H");
    m = playCard(m, 1, "AH");
    m = playCard(m, 2, "KH");
    m = playCard(m, 3, "7H");
    expect(m.history).toHaveLength(1);
    expect(m.history[0]).toMatchObject({ game: "rege", points: [0, -200, 0, 0] });
    expect(m.deal).toBe(1);
    expect(m.phase).toBe("choosing");
    expect(m.chooser).toBe(1);
    expect(m.played[0]).toEqual(["rege"]);
  });

  it("Zece de treflă: +200 to whoever takes 10♣, the deal ends there", () => {
    let m = fixed(hands, "zece");
    m = playCard(m, 0, "7C");
    m = playCard(m, 1, "KC");
    m = playCard(m, 2, "TC");
    m = playCard(m, 3, "JC");
    expect(m.history[0]).toMatchObject({ game: "zece", points: [0, 200, 0, 0] });
  });

  it("Carouri: big diamonds (10-A) −20, small ones −10; Levate −50", () => {
    let m = fixed(hands, "carouri");
    m = playCard(m, 0, "8D");
    m = playCard(m, 1, "AD");
    m = playCard(m, 2, "TD");
    m = playCard(m, 3, "7D");
    expect(dealPoints(m)).toEqual([0, -20 - 20 - 10 - 10, 0, 0]);
    let l = fixed(hands, "levate");
    l = playCard(l, 0, "TS");
    l = playCard(l, 1, "JS");
    l = playCard(l, 2, "QS");
    l = playCard(l, 3, "8S");
    expect(dealPoints(l)).toEqual([0, 0, -50, 0]);
    let t = fixed(hands, "totale");
    t = playCard(t, 0, "QC");
    t = playCard(t, 1, "KC");
    t = playCard(t, 2, "9C");
    t = playCard(t, 3, "JC");
    expect(dealPoints(t)).toEqual([0, -50 - 30, 0, 0]);
  });

  it("Totale +: Whist +50 per trick plus 10♣ +200", () => {
    let m = newMatch(ids(4), ids(4), seeded(1), { totalePlus: true });
    m = decideBlind({ ...m, hands: hands.map((h) => [...h]) }, 0, false);
    m = chooseGame(m, 0, "totalePlus", null);
    m = playCard(m, 0, "7C");
    m = playCard(m, 1, "KC");
    m = playCard(m, 2, "TC");
    m = playCard(m, 3, "JC");
    expect(dealPoints(m)).toEqual([0, 50 + 200, 0, 0]);
  });

  it("a chooser cannot pick the same game twice", () => {
    const m = decideBlind(newMatch(ids(3), ids(3), seeded(2)), 0, false);
    const after = { ...m, played: [["dame"], [], []] } as Match;
    expect(() => chooseGame(after, 0, "dame", null)).toThrow(/deja/);
    expect(() => chooseGame(m, 1, "dame", null)).toThrow(/rândul/);
  });

  it("Totale + can only be chosen in a room that added it", () => {
    const m = decideBlind(newMatch(ids(3), ids(3), seeded(2)), 0, false);
    expect(() => chooseGame(m, 0, "totalePlus", null)).toThrow(/necunoscut/);
  });
});

describe("rentz (from the 4 Jacks)", () => {
  // 3 players: ranks 9..A, lowest card 9
  const hands = [
    ["JS", "QS", "KS", "AS", "9S", "TS", "JH", "QH"],
    ["9H", "TH", "KH", "AH", "9C", "TC", "QC", "KC"],
    ["JC", "AC", "9D", "TD", "JD", "QD", "KD", "AD"],
  ];

  it("opens with Jacks, then grows both ways; players without a card pass", () => {
    let m = fixed(hands, "rentz");
    expect(m.turn).toBe(0);
    expect(legalCards(m, 0).sort()).toEqual(["JH", "JS"]);
    m = playCard(m, 0, "JS");
    // seat 1 has no Jack and no QS / TS -> passes, seat 2 has JC / JD
    expect(m.passes).toEqual([1]);
    expect(m.turn).toBe(2);
    m = playCard(m, 2, "JD");
    expect(rentzRow(m, "S")).toEqual(["JS"]);
    expect(legalCards(m, 0).sort()).toEqual(["JH", "QS", "TS"]);
    m = playCard(m, 0, "TS");
    expect(rentzRow(m, "S")).toEqual(["TS", "JS"]);
  });

  it("an Ace gives the same player one more card", () => {
    let m = fixed(hands, "rentz");
    m = { ...m, rows: { S: [2, 4], H: null, C: null, D: null }, layout: { S: 3, H: 0, C: 0, D: 0 } };
    expect(legalCards(m, 0).sort()).toEqual(["AS", "JH", "TS"]);
    m = playCard(m, 0, "AS");
    expect(m.turn).toBe(0);
    expect(rentzRow(m, "S")).toEqual(["JS", "QS", "KS", "AS"]);
  });

  it("the lowest card makes the next player wait a turn", () => {
    let m = fixed(hands, "rentz");
    m = { ...m, rows: { S: [1, 5], H: null, C: null, D: null }, layout: { S: 5, H: 0, C: 0, D: 0 } };
    m = playCard(m, 0, "9S");
    expect(m.rentzSkip).toBe(1);
    expect(m.passes).toEqual([]);
    expect(m.turn).toBe(2);
  });

  it("only the first three score: +400 / +200 / +100, the rest 0", () => {
    let m = fixed(hands, "rentz");
    let guard = 0;
    while (m.history.length === 0 && guard++ < 200) m = playCard(m, m.turn, legalCards(m, m.turn)[0]);
    expect(m.history).toHaveLength(1);
    expect([...m.history[0].points].sort((a, b) => b - a)).toEqual([400, 200, 100]);
    expect(rentzPoints(4)).toEqual([400, 200, 100, 0]);
    expect(rentzPoints(6)).toEqual([400, 200, 100, 0, 0, 0]);
  });

  it("a Rentz of a match started before v1.3 keeps running from its start card", () => {
    let m = fixed(hands, "rentz");
    m = { ...m, rentzStart: "Q", rows: undefined };
    expect(legalCards(m, 0).sort()).toEqual(["QH", "QS"]);
  });
});

describe("cancel Rentz with 4 capete", () => {
  // 3 players: capete are 9 and A. Seat 0 holds 9S 9H 9C AS = 4 capete, the others 2 each.
  const hands = [
    ["9S", "9H", "9C", "AS", "JS", "QS", "KS", "TS"],
    ["AH", "9D", "TH", "JH", "QH", "KH", "TC", "JC"],
    ["AC", "AD", "QC", "KC", "TD", "JD", "QD", "KD"],
  ];

  it("counts the lowest rank and the Ace", () => {
    expect(capeteCount(hands[0], 3)).toBe(4);
    expect(capeteCount(hands[1], 3)).toBe(2);
    expect(capeteCount(["7S", "AS", "7H", "8H"], 4)).toBe(3);
  });

  it("the chooser with 4 capete cancels: redeal, same chooser, Rentz still available, no limit", () => {
    let m = fixed(hands, "rentz");
    expect(canCancelRentz(m, 0)).toBe(true);
    expect(canCancelRentz(m, 1)).toBe(false);
    expect(() => cancelRentz(m, 1)).toThrow(/4 capete/);
    m = cancelRentz(m, 0, seeded(9));
    expect(m.phase).toBe("choosing");
    expect(m.chooser).toBe(0);
    expect(m.game).toBeNull();
    expect(m.played[0]).toEqual([]);
    expect(m.refused).toEqual([false, false, false]);
    expect(m.lastRentzCancel).toEqual({ seat: 0, deal: 0 });
    expect(m.blindPending).toBe(true); // asked about blind again
    // Again, as many times as the cards allow.
    m = chooseGame(decideBlind({ ...m, hands: hands.map((h) => [...h]) }, 0, false), 0, "rentz", null);
    expect(cancelRentz(m, 0, seeded(10)).deal).toBe(0);
  });

  it("another player with 4 capete cancels too", () => {
    const swapped = [hands[1], hands[0], hands[2]];
    const m = fixed(swapped, "rentz");
    expect(canCancelRentz(m, 1)).toBe(true);
    expect(cancelRentz(m, 1, seeded(9)).lastRentzCancel).toEqual({ seat: 1, deal: 0 });
  });

  it("not after the first card, not in other games", () => {
    let m = fixed(hands, "rentz");
    m = playCard(m, 0, legalCards(m, 0)[0]);
    expect(canCancelRentz(m, 0)).toBe(false);
    expect(() => cancelRentz(m, 0)).toThrow(RulesError);
    expect(canCancelRentz(fixed(hands, "levate"), 0)).toBe(false);
  });
});

describe("blind", () => {
  const hands = [
    ["AS", "9H", "7C", "8D", "TS", "JH", "QC", "KD"],
    ["KS", "AH", "8C", "9D", "JS", "QH", "KC", "AD"],
    ["QS", "KH", "9C", "TD", "7S", "8H", "TC", "JD"],
    ["8S", "TH", "AC", "7D", "9S", "7H", "JC", "QD"],
  ];

  it("the chooser answers first, without seeing the cards; a blind deal counts double, once per match", () => {
    let m = newMatch(ids(4), ids(4), seeded(3));
    m = { ...m, hands: hands.map((h) => [...h]) };
    expect(m.blindPending).toBe(true);
    expect(handHidden(m, 0)).toBe(true);
    expect(handHidden(m, 1)).toBe(false);
    expect(() => chooseGame(m, 0, "rege", null)).toThrow(/blind/);
    expect(() => decideBlind(m, 1, true)).toThrow(/rândul/);
    m = decideBlind(m, 0, true);
    expect(handHidden(m, 0)).toBe(true);
    m = chooseGame(m, 0, "rege", null);
    expect(handHidden(m, 0)).toBe(false);
    m = playCard(m, 0, "9H");
    m = playCard(m, 1, "AH");
    m = playCard(m, 2, "KH");
    m = playCard(m, 3, "7H");
    expect(m.history[0]).toMatchObject({ game: "rege", points: [0, -400, 0, 0], blind: true });
    expect(m.scores).toEqual([0, -400, 0, 0]);
    expect(m.blindUsed).toEqual([true, false, false, false]);
    expect(m.chooser).toBe(1);
    expect(m.blindPending).toBe(true);
    expect(m.blind).toBe(false);
  });

  it("a used blind is not offered again", () => {
    let m = newMatch(ids(4), ids(4), seeded(3));
    m = { ...m, blindUsed: [true, false, false, false] };
    expect(() => decideBlind(m, 0, true)).toThrow(/deja/);
    expect(decideBlind(m, 0, false).blind).toBe(false);
  });

  it("a blind Rentz cancelled with 4 capete keeps the blind and asks again", () => {
    const capete = [
      ["9S", "9H", "9C", "AS", "JS", "QS", "KS", "TS"],
      ["AH", "9D", "TH", "JH", "QH", "KH", "TC", "JC"],
      ["AC", "AD", "QC", "KC", "TD", "JD", "QD", "KD"],
    ];
    let m = newMatch(ids(3), ids(3), seeded(1));
    m = decideBlind({ ...m, hands: capete.map((h) => [...h]) }, 0, true);
    m = chooseGame(m, 0, "rentz", null);
    m = cancelRentz(m, 0, seeded(4));
    expect(m.blindUsed).toEqual([false, false, false]);
    expect(m.blindPending).toBe(true);
    expect(m.blind).toBe(false);
    expect(m.chooser).toBe(0);
  });
});

describe("games per match", () => {
  it("8 games per player, 9 with Totale +; rejects 2 or 7 players", () => {
    expect(newMatch(ids(4), ids(4), seeded(3)).totalDeals).toBe(32);
    expect(newMatch(ids(5), ids(5), seeded(3)).totalDeals).toBe(40);
    expect(newMatch(ids(6), ids(6), seeded(3)).totalDeals).toBe(48);
    expect(newMatch(ids(5), ids(5), seeded(3), { totalePlus: true }).totalDeals).toBe(45);
    expect(gamesOf(newMatch(ids(3), ids(3), seeded(3)))).toEqual([...BASE_GAMES]);
    expect(gamesOf({})).toEqual([...LEGACY_GAMES]); // matches started before v1.3
    expect(() => newMatch(ids(2), ids(2))).toThrow(RulesError);
    expect(() => newMatch(ids(7), ids(7))).toThrow(RulesError);
  });
});

describe("refusal", () => {
  it("each player can refuse once, only before the first card is played", () => {
    let m = newMatch(ids(4), ids(4), seeded(3));
    expect(canRefuse(m, 2)).toBe(true);
    const before = m.hands;
    m = refuseCards(m, 2, seeded(4));
    expect(m.hands).not.toEqual(before);
    expect(m.refused).toEqual([false, false, true, false]);
    expect(m.phase).toBe("choosing");
    expect(m.chooser).toBe(0);
    expect(() => refuseCards(m, 2)).toThrow(/deja/);

    m = chooseGame(decideBlind(m, 0, false), 0, "levate", null);
    expect(canRefuse(m, 1)).toBe(true); // game known, nothing played yet
    m = refuseCards(m, 1, seeded(5));
    expect(m.phase).toBe("choosing");
    expect(m.game).toBeNull();
    expect(m.played[0]).toEqual([]); // the chooser keeps the game

    m = chooseGame(decideBlind(m, 0, false), 0, "levate", null);
    m = playCard(m, 0, legalCards(m, 0)[0]);
    expect(canRefuse(m, 3)).toBe(false);
    expect(() => refuseCards(m, 3)).toThrow(RulesError);
  });
});

describe("full matches (random legal play)", () => {
  for (const n of [3, 4, 5, 6]) {
    for (const seed of [11, 22, 33]) {
      const totalePlus = seed === 33;
      it(`${n} players, seed ${seed}${totalePlus ? ", with Totale +" : ""}: every seat chooses every game once and points add up`, () => {
        const random = seeded(seed);
        let m = newMatch(ids(n), ids(n), random, { totalePlus });
        const games = gamesOf(m);
        expect(games).toHaveLength(totalePlus ? 9 : 8);
        let steps = 0;
        while (m.phase !== "over" && steps++ < 10000) m = autoAction(m, random);
        expect(m.phase).toBe("over");
        expect(m.endReason).toBe("complete");
        expect(m.history).toHaveLength(n * games.length);
        for (let s = 0; s < n; s++) {
          expect([...m.played[s]].sort()).toEqual([...games].sort());
          expect(remainingGames(m, s)).toEqual([]);
        }
        const carouri = -20 * 5 - 10 * (2 * n - 5); // 10, J, Q, K, A big; the rest small
        const expected: Record<string, number> = {
          rege: -200,
          dame: -120,
          carouri,
          levate: -50 * 8,
          totale: -200 - 120 + carouri - 50 * 8,
          zece: 200,
          whist: 50 * 8,
          rentz: 400 + 200 + 100,
          totalePlus: 50 * 8 + 200,
        };
        for (const h of m.history) expect(h.points.reduce((a, b) => a + b, 0)).toBe(expected[h.game]);
        const total = m.history.reduce((acc, h) => acc.map((v, i) => v + h.points[i]), Array(n).fill(0));
        expect(m.scores).toEqual(total);
      });
    }
  }
});

describe("abandoned rooms", () => {
  const now = Date.parse("2026-11-14T12:00:00Z");
  const sec = (s: number) => new Date(now - s * 1000).toISOString();
  const LIMIT = ROOM_ABANDONED_MS / 1000;
  const PLAYING_LIMIT = ROOM_ABANDONED_PLAYING_MS / 1000;
  it("uses 600 s for lobby / finished and 6 h for a running match", () => {
    expect(ROOM_ABANDONED_MS).toBe(600_000);
    expect(ROOM_ABANDONED_PLAYING_MS).toBe(6 * 3600_000);
  });
  it(`is abandoned after ${LIMIT} s with nobody seen (lobby / finished)`, () => {
    for (const status of ["lobby", "finished"]) {
      expect(isRoomAbandoned(status, sec(LIMIT + 1), [sec(LIMIT + 300), sec(LIMIT + 200)], now)).toBe(true);
      expect(isRoomAbandoned(status, sec(LIMIT + 1), [], now)).toBe(true);
      expect(isRoomAbandoned(status, sec(LIMIT + 1), [null], now)).toBe(true);
    }
  });
  it("is kept while the last activity is recent", () => {
    expect(isRoomAbandoned("lobby", sec(LIMIT - 1), [], now)).toBe(false);
  });
  it("is kept while any player or spectator was seen recently", () => {
    expect(isRoomAbandoned("lobby", sec(LIMIT * 2), [sec(LIMIT * 2), sec(30)], now)).toBe(false);
  });
  it("keeps a silent running match for 6 h, then drops it", () => {
    expect(isRoomAbandoned("playing", sec(LIMIT + 1), [], now)).toBe(false);
    expect(isRoomAbandoned("playing", sec(PLAYING_LIMIT - 1), [sec(PLAYING_LIMIT - 1)], now)).toBe(false);
    expect(isRoomAbandoned("playing", sec(PLAYING_LIMIT + 1), [sec(PLAYING_LIMIT + 1), null], now)).toBe(true);
  });
});

describe("room expiry", () => {
  const now = Date.parse("2026-11-14T12:00:00Z");
  const min = (m: number) => new Date(now - m * 60_000).toISOString();
  it("closes an idle lobby / finished room after 10 min", () => {
    expect(isRoomExpired("lobby", min(9), now)).toBe(false);
    expect(isRoomExpired("finished", min(11), now)).toBe(true);
  });
  it("keeps a running match for 6 h", () => {
    expect(isRoomExpired("playing", min(31), now)).toBe(false);
    expect(isRoomExpired("playing", min(359), now)).toBe(false);
    expect(isRoomExpired("playing", min(361), now)).toBe(true);
  });
});
