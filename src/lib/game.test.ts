import { describe, expect, it } from "vitest";
import {
  autoAction,
  canRefuse,
  chooseGame,
  dealHands,
  deckFor,
  GAMES,
  isRoomAbandoned,
  legalCards,
  newMatch,
  playCard,
  ranksFor,
  refuseCards,
  remainingGames,
  rentzPoints,
  rentzRow,
  ROOM_ABANDONED_MS,
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

/** Builds a match in the playing phase with fixed hands. */
function fixed(hands: string[][], game: Match["game"], start: Match["rentzStart"] = null): Match {
  const n = hands.length;
  let m = newMatch(ids(n), ids(n), seeded(1));
  m = { ...m, hands: hands.map((h) => [...h]) };
  return chooseGame(m, 0, game, start);
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

  it("Regele de inimă ends as soon as K♥ is taken", () => {
    let m = fixed(hands, "rege");
    m = playCard(m, 0, "9H");
    m = playCard(m, 1, "AH");
    m = playCard(m, 2, "KH");
    m = playCard(m, 3, "7H");
    expect(m.history).toHaveLength(1);
    expect(m.history[0]).toMatchObject({ game: "rege", points: [0, -100, 0, 0] });
    expect(m.deal).toBe(1);
    expect(m.phase).toBe("choosing");
    expect(m.chooser).toBe(1);
    expect(m.played[0]).toEqual(["rege"]);
  });

  it("a chooser cannot pick the same game twice", () => {
    const m = newMatch(ids(3), ids(3), seeded(2));
    const after = { ...m, played: [["dame"], [], []] } as Match;
    expect(() => chooseGame(after, 0, "dame", null)).toThrow(/deja/);
    expect(() => chooseGame(m, 1, "dame", null)).toThrow(/rândul/);
  });
});

describe("rentz", () => {
  // 3 players: ranks 9..A
  const hands = [
    ["JS", "QS", "KS", "AS", "9S", "TS", "JH", "QH"],
    ["9H", "TH", "KH", "AH", "9C", "TC", "QC", "KC"],
    ["JC", "AC", "9D", "TD", "JD", "QD", "KD", "AD"],
  ];

  it("only the next card of each suit (or the start card) can be put down; others pass", () => {
    let m = fixed(hands, "rentz", "J");
    expect(m.turn).toBe(0);
    expect(legalCards(m, 0).sort()).toEqual(["JH", "JS"]);
    m = playCard(m, 0, "JS");
    // seat 1 has no J and no QS -> passes, seat 2 has JD
    expect(m.passes).toEqual([1]);
    expect(m.turn).toBe(2);
    m = playCard(m, 2, "JD");
    expect(rentzRow(m, "S")).toEqual(["JS"]);
    expect(legalCards(m, 0).sort()).toEqual(["JH", "QS"]);
  });

  it("wraps from A to the lowest rank and scores by finishing place", () => {
    let m = fixed(hands, "rentz", "J");
    let guard = 0;
    while (m.history.length === 0 && guard++ < 200) {
      const legal = legalCards(m, m.turn);
      m = playCard(m, m.turn, legal[0]);
    }
    expect(m.history).toHaveLength(1);
    const pts = m.history[0].points;
    expect([...pts].sort((a, b) => b - a)).toEqual(rentzPoints(3));
  });
});

describe("5 and 6 players", () => {
  it("a match has 7 games per player and rejects 2 or 7 players", () => {
    expect(newMatch(ids(5), ids(5), seeded(3)).totalDeals).toBe(35);
    expect(newMatch(ids(6), ids(6), seeded(3)).totalDeals).toBe(42);
    expect(() => newMatch(ids(2), ids(2))).toThrow(RulesError);
    expect(() => newMatch(ids(7), ids(7))).toThrow(RulesError);
  });

  it("rentz points go 100 x players down to 100", () => {
    expect(rentzPoints(6)).toEqual([600, 500, 400, 300, 200, 100]);
    expect(rentzPoints(5)).toEqual([500, 400, 300, 200, 100]);
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

    m = chooseGame(m, 0, "levate", null);
    expect(canRefuse(m, 1)).toBe(true); // game known, nothing played yet
    m = refuseCards(m, 1, seeded(5));
    expect(m.phase).toBe("choosing");
    expect(m.game).toBeNull();
    expect(m.played[0]).toEqual([]); // the chooser keeps the game

    m = chooseGame(m, 0, "levate", null);
    m = playCard(m, 0, legalCards(m, 0)[0]);
    expect(canRefuse(m, 3)).toBe(false);
    expect(() => refuseCards(m, 3)).toThrow(RulesError);
  });
});

describe("full matches (random legal play)", () => {
  for (const n of [3, 4, 5, 6]) {
    for (const seed of [11, 22, 33]) {
      it(`${n} players, seed ${seed}: every seat chooses every game once and points add up`, () => {
        const random = seeded(seed);
        let m = newMatch(ids(n), ids(n), random);
        let steps = 0;
        while (m.phase !== "over" && steps++ < 5000) m = autoAction(m, random);
        expect(m.phase).toBe("over");
        expect(m.endReason).toBe("complete");
        expect(m.history).toHaveLength(n * GAMES.length);
        for (let s = 0; s < n; s++) {
          expect([...m.played[s]].sort()).toEqual([...GAMES].sort());
          expect(remainingGames(m, s)).toEqual([]);
        }
        const diamonds = 2 * n;
        const expected: Record<string, number> = {
          rege: -100,
          dame: -120,
          carouri: -20 * diamonds,
          levate: -20 * 8,
          whist: 50 * 8,
          totale: -100 - 120 - 20 * diamonds - 20 * 8,
          rentz: rentzPoints(n).reduce((a, b) => a + b, 0),
        };
        for (const h of m.history) expect(h.points.reduce((a, b) => a + b, 0)).toBe(expected[h.game]);
        const total = m.history.reduce((acc, h) => acc.map((v, i) => v + h.points[i]), Array(n).fill(0));
        expect(m.scores).toEqual(total);
      });
    }
  }
});

describe("abandoned rooms (any status)", () => {
  const now = Date.parse("2026-11-14T12:00:00Z");
  const sec = (s: number) => new Date(now - s * 1000).toISOString();
  it(`is abandoned after ${ROOM_ABANDONED_MS / 1000} s with nobody seen`, () => {
    expect(isRoomAbandoned(sec(121), [sec(300), sec(200)], now)).toBe(true);
    expect(isRoomAbandoned(sec(121), [], now)).toBe(true);
    expect(isRoomAbandoned(sec(121), [null], now)).toBe(true);
  });
  it("is kept while the last activity is recent", () => {
    expect(isRoomAbandoned(sec(119), [], now)).toBe(false);
  });
  it("is kept while any player or spectator was seen recently", () => {
    expect(isRoomAbandoned(sec(600), [sec(600), sec(30)], now)).toBe(false);
  });
});
