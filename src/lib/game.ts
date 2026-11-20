// Pure Rentz rules - shared by server and client, no I/O.
// The whole match lives in one JSON object (`Match`); every action is a pure function
// Match -> Match, so the server can apply it and store it with an optimistic version check.

export const MIN_PLAYERS = 3;
export const MAX_PLAYERS = 6;
/** Spectators per room (feedback plan contract B). */
export const MAX_SPECTATORS = 16;
export const HAND_SIZE = 8;
export const NICKNAME_MAX = 10;

/**
 * Lobby/finished rooms are closed (deleted) after this long without activity. Every open room
 * page polls /state, which refreshes the timer, so a room only closes once nobody has it open.
 */
export const ROOM_IDLE_MINUTES = 10;
/** /state refreshes last_activity_at at most this often, to keep DB writes low. */
export const PRESENCE_TOUCH_MS = 20_000;

/** "10 minute" / "60 de minute" (Romanian numeral agreement). */
export function minutesLabel(n: number): string {
  return `${n} ${n >= 20 ? "de " : ""}${n === 1 ? "minut" : "minute"}`;
}

/** A running match nobody has open any more (every tab closed) is dropped after this long (6 hours). */
export const PLAYING_IDLE_MINUTES = 360;

export function isRoomExpired(status: string, lastActivityAt: string | Date, now = Date.now()): boolean {
  const limit = status === "playing" ? PLAYING_IDLE_MINUTES : ROOM_IDLE_MINUTES;
  return now - new Date(lastActivityAt).getTime() > limit * 60_000;
}

/**
 * A lobby / finished room is abandoned once its last activity is older than this AND no player or
 * spectator has been seen within it. Swept every time the room list loads (GET /api/rooms).
 */
export const ROOM_ABANDONED_MS = 600_000;
/** The same for a running match ("playing"): 6 hours, so a long match is never closed under the players. */
export const ROOM_ABANDONED_PLAYING_MS = 6 * 3600_000;

/** The abandon limit for a room in this status. */
export function abandonedLimitMs(status: string): number {
  return status === "playing" ? ROOM_ABANDONED_PLAYING_MS : ROOM_ABANDONED_MS;
}

export function isRoomAbandoned(
  status: string,
  lastActivityAt: string | Date,
  membersLastSeen: (string | Date | null | undefined)[],
  now = Date.now(),
): boolean {
  const limit = abandonedLimitMs(status);
  const recent = (t: string | Date | null | undefined) => {
    if (t === null || t === undefined) return false;
    const ms = new Date(t).getTime();
    return !Number.isNaN(ms) && now - ms <= limit;
  };
  return !recent(lastActivityAt) && !membersLastSeen.some(recent);
}

// ---------------------------------------------------------------------------
// Cards
// ---------------------------------------------------------------------------

export type Suit = "S" | "H" | "C" | "D";
/** Display / sort order: alternating colours. */
export const SUITS: readonly Suit[] = ["S", "H", "C", "D"];
export const RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "T", "J", "Q", "K", "A"] as const;
export type Rank = (typeof RANKS)[number];
/** Rank char + suit char, e.g. "QH" (damă de inimă), "TS" (10 de pică). */
export type Card = string;

export const SUIT_SYMBOL: Record<Suit, string> = { S: "♠", H: "♥", C: "♣", D: "♦" };
export const SUIT_NAME: Record<Suit, string> = { S: "pică", H: "inimă roșie", C: "treflă", D: "caro" };
export const RANK_LABEL: Record<Rank, string> = { "2": "2", "3": "3", "4": "4", "5": "5", "6": "6", "7": "7", "8": "8", "9": "9", T: "10", J: "J", Q: "Q", K: "K", A: "A" };

export const rankOf = (c: Card) => c[0] as Rank;
export const suitOf = (c: Card) => c[1] as Suit;
export const rankValue = (r: Rank) => RANKS.indexOf(r);
export const cardLabel = (c: Card) => `${RANK_LABEL[rankOf(c)]}${SUIT_SYMBOL[suitOf(c)]}`;
export const isRed = (c: Card) => suitOf(c) === "H" || suitOf(c) === "D";

export function isCard(c: unknown): c is Card {
  return typeof c === "string" && c.length === 2 && (RANKS as readonly string[]).includes(c[0]) && SUITS.includes(c[1] as Suit);
}

/**
 * Ranks in play: the top 2N of every suit, so each of the N players gets exactly 8 cards.
 * 3 players: 9-A (24 cards), 4: 7-A (32), 5: 6-A (40), 6: 3-A (48). The low cards are simply left out.
 */
export function ranksFor(players: number): Rank[] {
  return RANKS.slice(RANKS.length - 2 * players);
}

export function deckFor(players: number): Card[] {
  return SUITS.flatMap((s) => ranksFor(players).map((r) => `${r}${s}`));
}

export function sortHand(cards: Card[]): Card[] {
  return [...cards].sort((a, b) => SUITS.indexOf(suitOf(a)) - SUITS.indexOf(suitOf(b)) || rankValue(rankOf(a)) - rankValue(rankOf(b)));
}

/** Fisher-Yates; `random` is injectable for tests. */
export function shuffle<T>(items: T[], random: () => number = Math.random): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function dealHands(players: number, random: () => number = Math.random): Card[][] {
  const deck = shuffle(deckFor(players), random);
  return Array.from({ length: players }, (_, i) => sortHand(deck.slice(i * HAND_SIZE, (i + 1) * HAND_SIZE)));
}

// ---------------------------------------------------------------------------
// Games (contracte)
// ---------------------------------------------------------------------------

/** Every game, in display order. `totalePlus` is optional (room setting), the other 8 are always played. */
export const GAMES = ["rege", "dame", "carouri", "levate", "totale", "zece", "whist", "rentz", "totalePlus"] as const;
export type GameId = (typeof GAMES)[number];
/** The 8 games of every match. */
export const BASE_GAMES: readonly GameId[] = GAMES.filter((g) => g !== "totalePlus");
/** Games of a match started before `Match.games` existed (v1.2.x): read only, for matches already running. */
export const LEGACY_GAMES: readonly GameId[] = ["rege", "dame", "carouri", "levate", "whist", "totale", "rentz"];

export function matchGames(totalePlus: boolean): GameId[] {
  return totalePlus ? [...GAMES] : [...BASE_GAMES];
}

export const GAME_INFO: Record<GameId, { name: string; icon: string; rule: string }> = {
  rege: { name: "Regele de inimă", icon: "K♥", rule: "Cine ia K♥ primește −200. Mâna se oprește când iese regele." },
  dame: { name: "Dame", icon: "Q", rule: "−30 pentru fiecare damă luată. Mâna se oprește când au ieșit toate 4." },
  carouri: {
    name: "Carouri",
    icon: "♦",
    rule: "Caro mare (10, J, Q, K, A) −20, caro mic (9 și mai mic) −10 pentru fiecare luat. Mâna se oprește când au ieșit toate.",
  },
  levate: { name: "Levate", icon: "▤", rule: "−50 pentru fiecare levată luată." },
  totale: {
    name: "Totale",
    icon: "Σ",
    rule: "Toate penalizările odată: K♥ −200, dame −30, caro mare −20 / mic −10, levate −50 (dama de caro se pune și ca damă, și ca caro).",
  },
  zece: { name: "Zece de treflă", icon: "10♣", rule: "Cine ia 10♣ primește +200. Mâna se oprește când iese." },
  whist: { name: "Whist", icon: "+", rule: "+50 pentru fiecare levată luată." },
  rentz: {
    name: "Rentz",
    icon: "R",
    rule: "Se pornește de la cei 4 Valeți; pe fiecare culoare se pune în ambele părți, în sus spre As și în jos spre cea mai mică. Cine nu poate pune, dă pas. Pui un As: mai pui o carte. Pui cea mai mică carte: următorul stă o tură. Primii trei care scapă de cărți iau +400 / +200 / +100, restul 0. Cine are cel puțin 4 capete (cea mai mică carte și As) poate anula Rentz-ul înainte de prima carte.",
  },
  totalePlus: { name: "Totale +", icon: "Σ+", rule: "Toate jocurile cu plus odată: Whist +50 pe levată și 10♣ +200." },
};

export const POINTS = {
  rege: -200,
  dame: -30,
  /** Carouri: 10, J, Q, K, A. */
  caroMare: -20,
  /** Carouri: 9 and below. */
  caroMic: -10,
  levate: -50,
  whist: 50,
  zece: 200,
} as const;

export const isBigCard = (c: Card) => rankValue(rankOf(c)) >= rankValue("T");

/** Rentz points by finishing place: only the first three score, +400 / +200 / +100; the others 0. */
export const RENTZ_TOP = [400, 200, 100] as const;
export function rentzPoints(players: number): number[] {
  return Array.from({ length: players }, (_, place) => RENTZ_TOP[place] ?? 0);
}

/** "Capete": the lowest rank in play and the Ace (4 players: 7 and A). */
export function capeteRanks(players: number): Rank[] {
  return [ranksFor(players)[0], "A"];
}

export function capeteCount(hand: Card[], players: number): number {
  const ranks = capeteRanks(players);
  return hand.filter((c) => ranks.includes(rankOf(c))).length;
}

/** At least this many capete in hand lets a player cancel a Rentz before the first card. */
export const CAPETE_TO_CANCEL = 4;

// ---------------------------------------------------------------------------
// Match state
// ---------------------------------------------------------------------------

export interface PlayedCard {
  seat: number;
  card: Card;
}

export interface DealResult {
  deal: number;
  chooser: number;
  game: GameId;
  /** Already doubled for a blind deal. */
  points: number[];
  /** Blind deal (points x2). */
  blind?: boolean;
}

export interface Match {
  /** Player ids by seat (turn order, clockwise). */
  seats: string[];
  /** Nicknames by seat, kept so the scoreboard survives players leaving. */
  names: string[];
  /** 0-based index of the current deal. */
  deal: number;
  totalDeals: number;
  phase: "choosing" | "playing" | "over";
  /** Seat that chooses the game of this deal (and leads first). */
  chooser: number;
  game: GameId | null;
  rentzStart: Rank | null;
  hands: Card[][];
  turn: number;
  trick: PlayedCard[];
  lastTrick: { deal: number; cards: PlayedCard[]; winner: number } | null;
  /** Tricks / cards taken in the current deal, by seat. */
  tricks: number[];
  taken: Card[][];
  /** Rentz: how many cards of each suit are on the table. */
  layout: Record<Suit, number>;
  /**
   * Rentz from the Jacks: per suit, the [lowest, highest] index into ranksFor(n) already on the table, null until
   * its Jack is down. Missing on older matches (their Rentz ran from `rentzStart`, ascending).
   */
  rows?: Record<Suit, [number, number] | null>;
  /** Rentz: seat that lost its turn because the lowest card was just put down (shown to everyone). */
  rentzSkip?: number | null;
  /** Rentz: seats in the order they ran out of cards. */
  finished: number[];
  /** Rentz: seats that had to pass since the last card was put down. */
  passes: number[];
  /** Games in this match (8, or 9 with Totale +). Missing on matches started before v1.3: LEGACY_GAMES. */
  games?: GameId[];
  /** Games each seat has already chosen (each seat chooses every game exactly once). */
  played: GameId[][];
  /** Each player may refuse the cards (redeal) once per match. */
  refused: boolean[];
  lastRefusal: { seat: number; deal: number } | null;
  /** Last Rentz cancelled with 4 capete (redeal, same chooser). Missing on older matches. */
  lastRentzCancel?: { seat: number; deal: number } | null;
  /** Blind ("pe nevăzute"): one per player per match, used once a blind deal is finished. Missing on older matches. */
  blindUsed?: boolean[];
  /** The chooser still has to say whether this deal is blind (their cards stay hidden until then). */
  blindPending?: boolean;
  /** This deal is blind: the game was chosen without looking, its points count double. */
  blind?: boolean;
  scores: number[];
  history: DealResult[];
  endReason: "complete" | "abandoned" | null;
}

/** A rule violation; the message is safe to show to the player. */
export class RulesError extends Error {}

function fail(msg: string): never {
  throw new RulesError(msg);
}

const emptyLayout = (): Record<Suit, number> => ({ S: 0, H: 0, C: 0, D: 0 });
const emptyRows = (): Record<Suit, [number, number] | null> => ({ S: null, H: null, C: null, D: null });

/** Blind deals count double. */
export const BLIND_FACTOR = 2;

function startDeal(m: Match, random: () => number) {
  const n = m.seats.length;
  m.phase = "choosing";
  m.chooser = m.deal % n;
  m.turn = m.chooser;
  m.game = null;
  m.rentzStart = null;
  m.hands = dealHands(n, random);
  m.trick = [];
  m.tricks = Array(n).fill(0);
  m.taken = Array.from({ length: n }, () => []);
  m.layout = emptyLayout();
  m.rows = emptyRows();
  m.rentzSkip = null;
  m.finished = [];
  m.passes = [];
  m.blindUsed ??= Array(n).fill(false);
  m.blind = false;
  m.blindPending = !m.blindUsed[m.chooser];
}

export function newMatch(
  seats: string[],
  names: string[],
  random: () => number = Math.random,
  options: { totalePlus?: boolean } = {},
): Match {
  const n = seats.length;
  if (n < MIN_PLAYERS || n > MAX_PLAYERS) fail(`Rentz se joacă în ${MIN_PLAYERS}-${MAX_PLAYERS} jucători.`);
  const games = matchGames(options.totalePlus === true);
  const m: Match = {
    seats: [...seats],
    names: [...names],
    deal: 0,
    totalDeals: n * games.length,
    phase: "choosing",
    chooser: 0,
    game: null,
    rentzStart: null,
    hands: [],
    turn: 0,
    trick: [],
    lastTrick: null,
    tricks: [],
    taken: [],
    layout: emptyLayout(),
    rows: emptyRows(),
    rentzSkip: null,
    finished: [],
    passes: [],
    games,
    played: Array.from({ length: n }, () => []),
    refused: Array(n).fill(false),
    lastRefusal: null,
    lastRentzCancel: null,
    blindUsed: Array(n).fill(false),
    blindPending: false,
    blind: false,
    scores: Array(n).fill(0),
    history: [],
    endReason: null,
  };
  startDeal(m, random);
  return m;
}

/** The games of this match (older matches: the 7 legacy ones). */
export function gamesOf(m: Pick<Match, "games">): GameId[] {
  return [...(m.games ?? LEGACY_GAMES)];
}

export function remainingGames(m: Match, seat: number): GameId[] {
  return gamesOf(m).filter((g) => !m.played[seat]?.includes(g));
}

/** Rentz: the next card that can be put down on `suit`, or null when the suit is complete. */
export function nextRentzCard(m: Match, suit: Suit): Card | null {
  const ranks = ranksFor(m.seats.length);
  const count = m.layout[suit];
  if (!m.rentzStart || count >= ranks.length) return null;
  const start = ranks.indexOf(m.rentzStart);
  return `${ranks[(start + count) % ranks.length]}${suit}`;
}

/** Rentz: the cards already on the table for `suit`, in the order they were put down. */
export function rentzRow(m: Pick<Match, "rentzStart" | "layout" | "seats" | "rows">, suit: Suit): Card[] {
  const ranks = ranksFor(m.seats.length);
  if (!m.rentzStart) {
    const row = m.rows?.[suit] ?? null;
    return row ? ranks.slice(row[0], row[1] + 1).map((r) => `${r}${suit}`) : [];
  }
  const start = ranks.indexOf(m.rentzStart);
  return Array.from({ length: m.layout[suit] }, (_, k) => `${ranks[(start + k) % ranks.length]}${suit}`);
}

/** Rentz from the Jacks: the cards that can go down on `suit` now (its Jack, or the next one at either end). */
export function rentzEnds(m: Pick<Match, "rows" | "seats">, suit: Suit): Card[] {
  const ranks = ranksFor(m.seats.length);
  const row = m.rows?.[suit] ?? null;
  if (!row) return [`J${suit}`];
  const out: Card[] = [];
  if (row[0] > 0) out.push(`${ranks[row[0] - 1]}${suit}`);
  if (row[1] < ranks.length - 1) out.push(`${ranks[row[1] + 1]}${suit}`);
  return out;
}

/** A Rentz deal of a match started before v1.3 (chosen start card, ascending). */
const legacyRentz = (m: Match) => m.rentzStart !== null;

export function legalCards(m: Match, seat: number): Card[] {
  if (m.phase !== "playing" || m.turn !== seat) return [];
  const hand = m.hands[seat];
  if (m.game === "rentz") {
    const wanted = new Set(
      legacyRentz(m) ? SUITS.map((s) => nextRentzCard(m, s)).filter(Boolean) : SUITS.flatMap((s) => rentzEnds(m, s)),
    );
    return hand.filter((c) => wanted.has(c));
  }
  if (m.trick.length === 0) return [...hand];
  const lead = suitOf(m.trick[0].card);
  const follow = hand.filter((c) => suitOf(c) === lead);
  return follow.length > 0 ? follow : [...hand];
}

/** True until the first card of the deal is on the table. */
export function nothingPlayedYet(m: Match): boolean {
  return m.trick.length === 0 && m.tricks.every((t) => t === 0) && SUITS.every((s) => m.layout[s] === 0);
}

export function canRefuse(m: Match, seat: number): boolean {
  if (seat < 0 || m.refused[seat]) return false;
  return m.phase === "choosing" || (m.phase === "playing" && nothingPlayedYet(m));
}

/** A Rentz was chosen, no card is down yet, and this seat holds at least 4 capete. No limit per match. */
export function canCancelRentz(m: Match, seat: number): boolean {
  if (seat < 0 || m.phase !== "playing" || m.game !== "rentz" || !nothingPlayedYet(m)) return false;
  return capeteCount(m.hands[seat] ?? [], m.seats.length) >= CAPETE_TO_CANCEL;
}

function count(cards: Card[], pred: (c: Card) => boolean): number {
  return cards.filter(pred).length;
}

/** Points of the current deal, by seat. */
export function dealPoints(m: Match): number[] {
  const n = m.seats.length;
  const rege = (s: number) => (m.taken[s].includes("KH") ? POINTS.rege : 0);
  const dame = (s: number) => POINTS.dame * count(m.taken[s], (c) => rankOf(c) === "Q");
  const carouri = (s: number) =>
    m.taken[s].filter((c) => suitOf(c) === "D").reduce((sum, c) => sum + (isBigCard(c) ? POINTS.caroMare : POINTS.caroMic), 0);
  const levate = (s: number) => POINTS.levate * m.tricks[s];
  const whist = (s: number) => POINTS.whist * m.tricks[s];
  const zece = (s: number) => (m.taken[s].includes("TC") ? POINTS.zece : 0);
  return Array.from({ length: n }, (_, s) => {
    switch (m.game) {
      case "rege":
        return rege(s);
      case "dame":
        return dame(s);
      case "carouri":
        return carouri(s);
      case "levate":
        return levate(s);
      case "whist":
        return whist(s);
      case "zece":
        return zece(s);
      case "totale":
        return rege(s) + dame(s) + carouri(s) + levate(s);
      case "totalePlus":
        return whist(s) + zece(s);
      case "rentz": {
        const place = m.finished.indexOf(s);
        return place < 0 ? 0 : rentzPoints(n)[place];
      }
      default:
        return 0;
    }
  });
}

function trickDealOver(m: Match): boolean {
  if (m.hands.every((h) => h.length === 0)) return true;
  const taken = m.taken.flat();
  switch (m.game) {
    case "rege":
      return taken.includes("KH");
    case "dame":
      return count(taken, (c) => rankOf(c) === "Q") === SUITS.length;
    case "carouri":
      return count(taken, (c) => suitOf(c) === "D") === ranksFor(m.seats.length).length;
    case "zece":
      return taken.includes("TC");
    default:
      return false;
  }
}

function finishDeal(m: Match, random: () => number) {
  const blind = m.blind === true;
  const points = dealPoints(m).map((p) => (blind ? p * BLIND_FACTOR : p));
  m.scores = m.scores.map((s, i) => s + points[i]);
  m.history.push({ deal: m.deal, chooser: m.chooser, game: m.game!, points, ...(blind ? { blind: true } : {}) });
  m.played[m.chooser].push(m.game!);
  if (blind && m.blindUsed) m.blindUsed[m.chooser] = true;
  m.deal += 1;
  if (m.deal >= m.totalDeals) {
    m.phase = "over";
    m.endReason = "complete";
    m.trick = [];
    return;
  }
  startDeal(m, random);
}

/** Rentz: gives the turn to the first seat from `from` (inclusive) that can put a card down; the others pass. */
function settleRentzTurn(m: Match, from: number) {
  const n = m.seats.length;
  for (let i = 0; i < n * 2; i++) {
    const seat = (from + i) % n;
    if (m.finished.includes(seat)) continue;
    m.turn = seat;
    if (legalCards(m, seat).length > 0) return;
    if (!m.passes.includes(seat)) m.passes.push(seat);
  }
  fail("Nimeni nu poate juca. Stare invalidă.");
}

export function chooseGame(prev: Match, seat: number, game: unknown, start: unknown): Match {
  if (prev.phase !== "choosing") fail("Jocul acestei mâini a fost deja ales.");
  if (seat !== prev.chooser) fail("Nu e rândul tău să alegi jocul.");
  if (prev.blindPending) fail("Spune întâi dacă joci blind.");
  if (typeof game !== "string" || !(gamesOf(prev) as string[]).includes(game)) fail("Joc necunoscut.");
  const g = game as GameId;
  if (prev.played[seat].includes(g)) fail(`Ai jucat deja ${GAME_INFO[g].name}.`);
  const m = structuredClone(prev);
  m.game = g;
  m.phase = "playing";
  m.turn = m.chooser;
  if (g === "rentz") {
    // Always from the 4 Jacks now; `start` is ignored (kept in the signature for old clients).
    void start;
    m.rentzStart = null;
    m.rows = emptyRows();
    settleRentzTurn(m, m.chooser);
  }
  return m;
}

/** The chooser says whether this deal is blind (game chosen before looking at the cards, points x2, once per match). */
export function decideBlind(prev: Match, seat: number, blind: unknown): Match {
  if (prev.phase !== "choosing") fail("Jocul acestei mâini a fost deja ales.");
  if (seat !== prev.chooser) fail("Nu e rândul tău să alegi jocul.");
  if (!prev.blindPending) fail("Ai răspuns deja la blind.");
  if (typeof blind !== "boolean") fail("Răspuns invalid.");
  if (blind && prev.blindUsed?.[seat]) fail("Ți-ai folosit deja jocul blind în acest meci.");
  const m = structuredClone(prev);
  m.blindPending = false;
  m.blind = blind;
  return m;
}

/** The chooser's own cards are hidden while they decide on blind, and for the whole choice of a blind game. */
export function handHidden(m: Match, seat: number): boolean {
  return m.phase === "choosing" && seat === m.chooser && (m.blindPending === true || m.blind === true);
}

export function playCard(prev: Match, seat: number, card: unknown, random: () => number = Math.random): Match {
  if (prev.phase !== "playing") fail(prev.phase === "choosing" ? "Jocul mâinii nu a fost ales încă." : "Meciul s-a terminat.");
  if (seat !== prev.turn) fail("Nu e rândul tău.");
  if (!isCard(card) || !prev.hands[seat].includes(card)) fail("Nu ai cartea asta.");
  if (!legalCards(prev, seat).includes(card)) {
    fail(prev.game === "rentz" ? "Cartea asta nu se poate pune acum." : "Trebuie să răspunzi la culoare.");
  }
  const m = structuredClone(prev);
  const n = m.seats.length;
  m.hands[seat] = m.hands[seat].filter((c) => c !== card);

  if (m.game === "rentz") {
    const suit = suitOf(card);
    m.layout[suit] += 1;
    m.passes = [];
    m.rentzSkip = null;
    const idx = ranksFor(n).indexOf(rankOf(card));
    if (!legacyRentz(m)) {
      m.rows ??= emptyRows();
      const row = m.rows[suit];
      m.rows[suit] = row ? [Math.min(row[0], idx), Math.max(row[1], idx)] : [idx, idx];
    }
    if (m.hands[seat].length === 0) m.finished.push(seat);
    if (m.finished.length >= n - 1) {
      for (let s = 0; s < n; s++) if (!m.finished.includes(s)) m.finished.push(s);
      finishDeal(m, random);
      return m;
    }
    if (!legacyRentz(m)) {
      // Ace: the same player puts down one more card, if they can.
      if (rankOf(card) === "A" && !m.finished.includes(seat) && legalCards(m, seat).length > 0) return m;
      // Lowest card: the next player still in the deal loses this turn.
      if (idx === 0) {
        let skipped = (seat + 1) % n;
        while (m.finished.includes(skipped)) skipped = (skipped + 1) % n;
        m.rentzSkip = skipped;
        settleRentzTurn(m, (skipped + 1) % n);
        return m;
      }
    }
    settleRentzTurn(m, (seat + 1) % n);
    return m;
  }

  m.trick.push({ seat, card });
  if (m.trick.length < n) {
    m.turn = (seat + 1) % n;
    return m;
  }
  const lead = suitOf(m.trick[0].card);
  const winner = m.trick
    .filter((p) => suitOf(p.card) === lead)
    .reduce((best, p) => (rankValue(rankOf(p.card)) > rankValue(rankOf(best.card)) ? p : best)).seat;
  m.tricks[winner] += 1;
  m.taken[winner].push(...m.trick.map((p) => p.card));
  m.lastTrick = { deal: m.deal, cards: m.trick, winner };
  m.trick = [];
  m.turn = winner;
  if (trickDealOver(m)) finishDeal(m, random);
  return m;
}

/** The player throws their one refusal: the cards are dealt again and the same chooser chooses again. */
export function refuseCards(prev: Match, seat: number, random: () => number = Math.random): Match {
  if (prev.phase === "over") fail("Meciul s-a terminat.");
  if (prev.refused[seat]) fail("Ți-ai folosit deja refuzul în acest meci.");
  if (!canRefuse(prev, seat)) fail("Poți refuza doar înainte să fie pusă prima carte.");
  const m = structuredClone(prev);
  m.refused[seat] = true;
  m.lastRefusal = { seat, deal: m.deal };
  m.lastRentzCancel = null;
  startDeal(m, random);
  return m;
}

/**
 * A player with at least 4 capete cancels the chosen Rentz (the chooser too): the cards are dealt again and
 * the same chooser chooses again; Rentz stays available. Unlimited, and the once-per-match refusal is not used.
 */
export function cancelRentz(prev: Match, seat: number, random: () => number = Math.random): Match {
  if (prev.phase !== "playing" || prev.game !== "rentz") fail("Se poate anula doar un Rentz ales.");
  if (!nothingPlayedYet(prev)) fail("Rentz-ul se poate anula doar înainte să fie pusă prima carte.");
  if (!canCancelRentz(prev, seat)) fail(`Ai nevoie de cel puțin ${CAPETE_TO_CANCEL} capete ca să anulezi Rentz-ul.`);
  const m = structuredClone(prev);
  m.lastRentzCancel = { seat, deal: m.deal };
  m.lastRefusal = null;
  startDeal(m, random);
  return m;
}

/** A player left mid-match: the match stops, scores so far stand. */
export function abandonMatch(prev: Match): Match {
  if (prev.phase === "over") return prev;
  const m = structuredClone(prev);
  m.phase = "over";
  m.endReason = "abandoned";
  m.trick = [];
  return m;
}

/** Seat with the highest score (first in seat order on a tie). */
export function leaderSeat(m: Match): number {
  return m.scores.reduce((best, s, i) => (s > m.scores[best] ? i : best), 0);
}

/** Who has to act now (choose or play), or -1. */
export function actingSeat(m: Match): number {
  if (m.phase === "choosing") return m.chooser;
  if (m.phase === "playing") return m.turn;
  return -1;
}

/** Host's unblock button: a random legal action for whoever is stuck. */
export function autoAction(m: Match, random: () => number = Math.random): Match {
  const pick = <T>(xs: T[]) => xs[Math.floor(random() * xs.length)];
  if (m.phase === "choosing") {
    const ready = m.blindPending ? decideBlind(m, m.chooser, false) : m;
    return chooseGame(ready, ready.chooser, pick(remainingGames(ready, ready.chooser)), null);
  }
  if (m.phase === "playing") return playCard(m, m.turn, pick(legalCards(m, m.turn)), random);
  fail("Meciul s-a terminat.");
  return m;
}
