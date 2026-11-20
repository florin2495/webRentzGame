import type { Card, DealResult, GameId, Rank, Suit } from "./game";

export type RoomStatus = "lobby" | "playing" | "finished";

export interface PublicPlayer {
  id: string;
  nickname: string;
  isHost: boolean;
  /** Ms left before a pending kick is enforced (0-10000), null when none. Remaining time, not a timestamp: no clock skew. */
  kickRemainingMs: number | null;
  /** Seen in the last 301 s (see lib/reconnect.ts). False = phone in the background, closed tab, no network. */
  connected: boolean;
  role: "player" | "spectator";
  /** Spectator waiting for the next match ("Intră la runda următoare" pressed). */
  queued: boolean;
}

/** The match as one player may see it: own hand only, everything else is public. Seats are indexes into `seats`. */
export interface MatchView {
  seats: string[];
  names: string[];
  /** My seat, -1 if I am not in the match. */
  mySeat: number;
  deal: number;
  totalDeals: number;
  phase: "choosing" | "playing" | "over";
  chooser: number;
  game: GameId | null;
  rentzStart: Rank | null;
  /** Seat that has to act now (choose or play), -1 when over. */
  acting: number;
  hand: Card[];
  /** Blind: my own cards are hidden from me while I decide / choose (I am the chooser). */
  handHidden: boolean;
  /** Cards I may play right now (empty when it is not my turn). */
  legal: Card[];
  handCounts: number[];
  trick: { seat: number; card: Card }[];
  lastTrick: { deal: number; cards: { seat: number; card: Card }[]; winner: number } | null;
  tricks: number[];
  taken: Card[][];
  layout: Record<Suit, number>;
  /** Rentz from the Jacks: [lowest, highest] index into ranksFor(n) per suit, null until its Jack is down. */
  rows: Record<Suit, [number, number] | null> | null;
  /** Rentz: seat that lost its turn to the lowest card just put down. */
  rentzSkip: number | null;
  finished: number[];
  passes: number[];
  /** Games of this match (8, or 9 with Totale +). */
  games: GameId[];
  /** Games each seat still has to choose. */
  remaining: GameId[][];
  refused: boolean[];
  canRefuse: boolean;
  lastRefusal: { seat: number; deal: number } | null;
  /** I may cancel the chosen Rentz now (at least 4 capete, before the first card). */
  canCancelRentz: boolean;
  /** How many capete (lowest rank in play + Ace) are in my hand. */
  myCapete: number;
  lastRentzCancel: { seat: number; deal: number } | null;
  /** Each seat's blind game is used up. */
  blindUsed: boolean[];
  /** The chooser still has to say whether this deal is blind. */
  blindPending: boolean;
  /** This deal is blind (points x2). */
  blind: boolean;
  scores: number[];
  history: DealResult[];
  endReason: "complete" | "abandoned" | null;
}

export interface RoomState {
  room: {
    id: string;
    code: string;
    name: string;
    status: RoomStatus;
    round: number;
    hasPassword: boolean;
    /** Optional 9th game "Totale +" is played in this room. */
    totalePlus: boolean;
    hostPlayerId: string | null;
    winnerPlayerId: string | null;
  };
  /** Seat order while a match exists, join order in the lobby. */
  players: PublicPlayer[];
  /** Spectators (at most MAX_SPECTATORS): queued ones first, in queue order. */
  spectators: PublicPlayer[];
  me: PublicPlayer;
  match: MatchView | null;
}

/** Item of the public room list (GET /api/rooms). */
export interface RoomListItem {
  code: string;
  name: string;
  hasPassword: boolean;
  /** A match is running: joining makes a spectator. */
  inGame: boolean;
  /** Seated players (spectators not counted). */
  players: number;
}

export interface Session {
  playerId: string;
  token: string;
}

/** Answer of every in-match action: the caller's new view, so the client needs no /state afterwards. */
export interface MatchActionResult {
  ok: true;
  status: RoomState["room"]["status"];
  match: MatchView;
}
