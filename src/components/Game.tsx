"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client/api";
import { PREF_CONFIRM_PLAY, PREF_SOUND, useBoolPref } from "@/lib/client/prefs";
import { playTurnChime, unlockAudio } from "@/lib/client/sound";
import {
  cardLabel,
  GAME_INFO,
  RANK_LABEL,
  rankOf,
  rentzPoints,
  rentzRow,
  SUIT_NAME,
  SUIT_SYMBOL,
  SUITS,
  suitOf,
  type Card as CardCode,
  type GameId,
} from "@/lib/game";
import type { MatchActionResult, MatchView, RoomState } from "@/lib/types";
import { OfflineBadge, PlayerList } from "./PlayerList";
import { PlayingCard } from "./PlayingCard";
import { Scoreboard } from "./Scoreboard";
import { Button, Card, ErrorText } from "./ui";

interface Props {
  state: RoomState;
  token: string;
  refresh: () => Promise<void>;
  /** Applies a confirmed or optimistic change to the screen state without a /state round trip. */
  patch: (fn: (s: RoomState) => RoomState) => void;
  kickLeft: (playerId: string) => number | null;
}

/** Optimistic local effect of playing `card`: it leaves my hand and nothing else is playable until the answer. */
function dropCard(s: RoomState, card: CardCode): RoomState {
  const m = s.match;
  if (!m) return s;
  const handCounts = m.handCounts.map((c, i) => (i === m.mySeat ? Math.max(0, c - 1) : c));
  return { ...s, match: { ...m, hand: m.hand.filter((c) => c !== card), legal: [], handCounts } };
}

const fmt = (n: number) => (n > 0 ? `+${n}` : `${n}`);

/** What a seat has collected in this deal that matters for the current game. */
function takenSummary(m: MatchView, seat: number): string {
  const taken = m.taken[seat] ?? [];
  const q = taken.filter((c) => rankOf(c) === "Q").length;
  const d = taken.filter((c) => suitOf(c) === "D").length;
  const k = taken.includes("KH");
  const t = m.tricks[seat] ?? 0;
  switch (m.game) {
    case "rege":
      return k ? "K♥ luat" : `${t} lev.`;
    case "dame":
      return `${q} dame`;
    case "carouri":
      return `${d}♦`;
    case "levate":
    case "whist":
      return `${t} lev.`;
    case "zece":
      return taken.includes("TC") ? "10♣ luat" : `${t} lev.`;
    case "totale":
      return [`${t} lev.`, q && `${q}Q`, d && `${d}♦`, k && "K♥"].filter(Boolean).join(" · ");
    case "totalePlus":
      return [`${t} lev.`, taken.includes("TC") && "10♣"].filter(Boolean).join(" · ");
    default:
      return "";
  }
}

export function Game({ state, token, refresh, patch, kickLeft }: Props) {
  const { room, me } = state;
  const m = state.match!;
  const base = `/api/rooms/${room.code}`;
  const isHost = room.hostPlayerId === me.id;
  const name = (s: number) => m.names[s] ?? "?";
  const over = m.phase === "over";
  const myTurn = m.phase === "playing" && m.acting === m.mySeat;
  const iChoose = m.phase === "choosing" && m.chooser === m.mySeat;
  const iDecideBlind = iChoose && m.blindPending;

  const [confirmPlay] = useBoolPref(PREF_CONFIRM_PLAY, false);
  const [soundOn] = useBoolPref(PREF_SOUND, true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<CardCode | null>(null);
  const [pickedGame, setPickedGame] = useState<GameId | null>(null);
  // Deal-result pop-up: deals finished while this component is mounted (it remounts per match).
  const [seenDeals, setSeenDeals] = useState(m.history.length);

  useEffect(() => {
    if (soundOn && !over && m.acting === m.mySeat) playTurnChime();
  }, [soundOn, over, m.acting, m.mySeat, m.deal, m.phase]);

  async function run(key: string, path: string, body: unknown = {}, optimistic?: (s: RoomState) => RoomState) {
    unlockAudio();
    setBusy(key);
    setError("");
    if (optimistic) patch(optimistic); // my own move shows at once; rolled back below on error
    try {
      const res = await api<MatchActionResult>(`${base}/${path}`, { token, body });
      setSelected(null);
      // The answer carries my new view: no /state afterwards.
      patch((s) => ({ ...s, room: { ...s.room, status: res.status }, match: res.match }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Eroare.");
      await refresh(); // server truth replaces the optimistic change
    } finally {
      setBusy(null);
    }
  }

  function tapCard(card: CardCode) {
    unlockAudio();
    if (!myTurn || !m.legal.includes(card) || busy) return;
    if (confirmPlay && selected !== card) {
      setSelected(card);
      return;
    }
    void run("play", "play", { card }, (s) => dropCard(s, card));
  }

  const legal = new Set(m.legal);
  const showLast = m.phase === "playing" && m.trick.length === 0 && m.lastTrick?.deal === m.deal;
  const refusalNow = m.lastRefusal && m.lastRefusal.deal === m.deal && m.phase !== "over";
  const rentzCancelNow = m.lastRentzCancel && m.lastRentzCancel.deal === m.deal && m.phase !== "over";
  const lastDeal = m.history.length > seenDeals ? m.history[m.history.length - 1] : null;

  return (
    <>
      {/* Status */}
      <Card className={myTurn || iChoose ? "border-indigo-400 dark:border-indigo-600" : ""}>
        {over ? (
          <FinalBanner m={m} />
        ) : (
          <>
            <div className="flex items-baseline justify-between gap-2 text-xs text-zinc-500">
              <span data-testid="deal-counter">
                Mâna {m.deal + 1}/{m.totalDeals}
              </span>
              <span>alege {m.chooser === m.mySeat ? "tu" : name(m.chooser)}</span>
            </div>
            {m.game ? (
              <>
                <h2 className="mt-1 text-xl font-black">
                  {GAME_INFO[m.game].name}
                  {m.blind && <BlindBadge />}
                  {m.game === "rentz" && m.rentzStart && (
                    <span className="ml-2 text-sm font-semibold text-zinc-500">de la {RANK_LABEL[m.rentzStart]}</span>
                  )}
                </h2>
                <p className="text-xs text-zinc-500">{GAME_INFO[m.game].rule}</p>
              </>
            ) : (
              <h2 className="mt-1 text-xl font-black">
                {iChoose ? "Alegi jocul" : `${name(m.chooser)} alege jocul…`}
                {m.blind && <BlindBadge />}
              </h2>
            )}
            <p
              data-testid="turn-badge"
              data-phase={m.phase}
              data-deal={m.deal}
              data-acting={m.acting >= 0 ? name(m.acting) : ""}
              className={`mt-2 rounded-lg px-3 py-1.5 text-center text-sm font-semibold ${
                myTurn || iChoose ? "bg-indigo-600 text-white" : "bg-zinc-100 dark:bg-zinc-900"
              }`}
            >
              {iDecideBlind
                ? "Joci blind? Răspunde înainte să vezi cărțile"
                : iChoose && m.blind
                  ? "Alege jocul fără să vezi cărțile"
                  : iChoose
                ? "Uită-te în cărți și alege jocul"
                : myTurn
                  ? "Tura ta"
                  : m.phase === "choosing"
                    ? m.blindPending
                      ? `${name(m.chooser)} decide dacă joacă blind`
                      : `Așteptăm alegerea lui ${name(m.chooser)}`
                    : `Tura lui ${name(m.acting)}`}
            </p>
            {refusalNow && (
              <p role="status" className="mt-2 rounded-lg bg-amber-100 px-3 py-1.5 text-center text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
                🔄 {m.lastRefusal!.seat === m.mySeat ? "Ai" : `${name(m.lastRefusal!.seat)} a`} refuzat cărțile. S-au împărțit din nou.
              </p>
            )}
            {m.game === "rentz" && m.rentzSkip !== null && m.phase === "playing" && (
              <p role="status" data-testid="rentz-skip" className="mt-2 rounded-lg bg-zinc-100 px-3 py-1.5 text-center text-sm dark:bg-zinc-900">
                ⏸ {m.rentzSkip === m.mySeat ? "Stai" : `${name(m.rentzSkip)} stă`} o tură (s-a pus cea mai mică carte).
              </p>
            )}
            {rentzCancelNow && (
              <p
                role="status"
                data-testid="rentz-cancelled"
                className="mt-2 rounded-lg bg-amber-100 px-3 py-1.5 text-center text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200"
              >
                ✋ {m.lastRentzCancel!.seat === m.mySeat ? "Ai" : `${name(m.lastRentzCancel!.seat)} a`} anulat Rentz-ul (4 capete). S-au
                împărțit din nou, {m.chooser === m.mySeat ? "alegi" : `alege ${name(m.chooser)}`} din nou.
              </p>
            )}
          </>
        )}
      </Card>

      {/* Blind? */}
      {iDecideBlind && (
        <Card>
          <h2 className="font-bold">Joci blind?</h2>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Alegi jocul fără să te uiți în cărți și punctajul mâinii se dublează. Ai un singur joc blind pe meci.
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Button data-testid="blind-yes" disabled={busy !== null} onClick={() => void run("blind", "blind", { blind: true })}>
              Da, blind (×2)
            </Button>
            <Button variant="secondary" data-testid="blind-no" disabled={busy !== null} onClick={() => void run("blind", "blind", { blind: false })}>
              Nu, văd cărțile
            </Button>
          </div>
        </Card>
      )}

      {/* Choosing */}
      {iChoose && !iDecideBlind && (
        <Card>
          <div className="grid grid-cols-2 gap-2">
            {m.remaining[m.mySeat].map((g) => (
              <button
                key={g}
                type="button"
                data-testid="game-option"
                data-game={g}
                onClick={() => setPickedGame(g)}
                className={`min-h-12 rounded-lg border-2 px-2 py-1 text-left text-sm font-semibold ${
                  pickedGame === g ? "border-indigo-600 bg-indigo-50 dark:bg-indigo-950" : "border-zinc-200 dark:border-zinc-800"
                }`}
              >
                <span className="mr-1 font-mono text-indigo-600 dark:text-indigo-400">{GAME_INFO[g].icon}</span>
                {GAME_INFO[g].name}
              </button>
            ))}
          </div>
          {pickedGame && <p className="mt-2 text-xs text-zinc-500">{GAME_INFO[pickedGame].rule}</p>}
          <Button
            className="mt-3 w-full"
            disabled={!pickedGame || busy !== null}
            data-testid="choose-game"
            onClick={() => pickedGame && void run("choose", "choose", { game: pickedGame })}
          >
            {busy === "choose" ? "Se alege…" : pickedGame ? `Joacă ${GAME_INFO[pickedGame].name}` : "Alege un joc"}
          </Button>
        </Card>
      )}

      {/* Table: the seats around a green felt; the cards are put down on the felt */}
      {!over && <Table m={m} players={state.players} name={name} showLast={showLast} />}

      {/* My hand */}
      {!over && m.mySeat >= 0 && (
        <Card className={myTurn ? "ring-2 ring-indigo-500" : ""}>
          <div className="mb-2 flex items-baseline justify-between gap-2 text-sm">
            <span className="font-bold">Cărțile tale</span>
            <span className="text-xs text-zinc-500">
              {m.game && m.game !== "rentz" && takenSummary(m, m.mySeat)}
              {m.game === "rentz" && m.finished.includes(m.mySeat) && `Ai terminat al ${m.finished.indexOf(m.mySeat) + 1}-lea`}
            </span>
          </div>
          {m.handHidden ? (
            <p data-testid="hand-hidden" className="py-4 text-center text-sm text-zinc-500">
              🙈 Cărțile sunt ascunse până alegi jocul{m.blindPending ? " (întâi spui dacă joci blind)" : " (joc blind)"}.
            </p>
          ) : m.hand.length === 0 ? (
            <p className="py-4 text-center text-sm text-zinc-500">Nu mai ai cărți.</p>
          ) : (
            <div data-testid="my-hand" className="grid grid-cols-8 gap-1">
              {m.hand.map((c) => (
                <PlayingCard
                  key={c}
                  card={c}
                  onClick={() => tapCard(c)}
                  playable={myTurn && legal.has(c) && !busy}
                  dimmed={myTurn && !legal.has(c)}
                  selected={confirmPlay && selected === c && myTurn}
                />
              ))}
            </div>
          )}
          {confirmPlay && myTurn && selected && legal.has(selected) && (
            <Button className="mt-3 w-full" disabled={busy !== null} onClick={() => void run("play", "play", { card: selected }, (s) => dropCard(s, selected))}>
              {busy === "play" ? "Se joacă…" : `Joacă ${cardLabel(selected)}`}
            </Button>
          )}

          {m.canCancelRentz && (
            <Button
              variant="secondary"
              className="mt-3 w-full"
              disabled={busy !== null}
              data-testid="cancel-rentz"
              onClick={() =>
                window.confirm(`Anulezi Rentz-ul? Ai ${m.myCapete} capete. Se împart din nou și se alege din nou jocul.`) &&
                void run("cancel-rentz", "cancel-rentz")
              }
            >
              {busy === "cancel-rentz" ? "Se împart din nou…" : `✋ Anulez Rentz-ul (${m.myCapete} capete)`}
            </Button>
          )}
          {m.canRefuse ? (
            <Button
              variant="secondary"
              className="mt-3 w-full"
              disabled={busy !== null}
              data-testid="refuse"
              onClick={() =>
                window.confirm("Refuzi cărțile? Se împart din nou pentru toți. Ai un singur refuz pe tot meciul.") &&
                void run("refuse", "refuse")
              }
            >
              {busy === "refuse" ? "Se împart din nou…" : "🔄 Refuz cărțile (1 dată pe meci)"}
            </Button>
          ) : (
            m.refused[m.mySeat] && <p className="mt-2 text-center text-xs text-zinc-500">Ți-ai folosit refuzul în acest meci.</p>
          )}
        </Card>
      )}

      {isHost && !over && m.acting >= 0 && m.acting !== m.mySeat && (
        <button
          type="button"
          disabled={busy !== null}
          onClick={() =>
            window.confirm(
              `${name(m.acting)} nu răspunde? Fac o mutare la întâmplare în locul lui (${m.phase === "choosing" ? "alege un joc" : "joacă o carte permisă"}).`,
            ) && void run("auto", "autoplay")
          }
          className="text-center text-xs font-semibold text-zinc-500 underline disabled:opacity-40"
        >
          ⏩ Joacă în locul lui {name(m.acting)}
        </button>
      )}

      {over && isHost && (
        <Button className="w-full" disabled={busy !== null} onClick={() => void run("new", "new-round")} data-testid="new-round">
          {busy === "new" ? "Se pregătește…" : "Meci nou"}
        </Button>
      )}
      {over && !isHost && <p className="text-center text-sm text-zinc-500">Host-ul poate porni un meci nou.</p>}
      {me.role === "spectator" && !over && (
        <p data-testid="spectator-status" className="text-center text-xs text-zinc-500">
          Urmărești meciul ca spectator.
        </p>
      )}

      <ErrorText>{error}</ErrorText>

      <Scoreboard m={m} />

      <PlayerList state={state} token={token} refresh={refresh} kickLeft={kickLeft} />

      {lastDeal && !over && (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 p-4 sm:items-center" onClick={() => setSeenDeals(m.history.length)}>
          <div role="dialog" aria-modal="true" aria-label="Rezultatul mâinii" data-testid="deal-result" className="w-full max-w-sm rounded-xl bg-white p-4 shadow-xl dark:bg-zinc-950">
            <p className="text-xs text-zinc-500">
              Mâna {lastDeal.deal + 1} · a ales {name(lastDeal.chooser)}
            </p>
            <h2 className="text-xl font-black">
              {GAME_INFO[lastDeal.game].name}
              {lastDeal.blind && <BlindBadge />}
            </h2>
            <ul className="mt-3 flex flex-col gap-1">
              {lastDeal.points
                .map((p, s) => ({ p, s }))
                .sort((a, b) => b.p - a.p)
                .map(({ p, s }) => (
                  <li key={s} className="flex justify-between text-sm">
                    <span className={s === m.mySeat ? "font-bold" : ""}>{s === m.mySeat ? `${name(s)} (tu)` : name(s)}</span>
                    <span className="font-mono">
                      <span className={p > 0 ? "text-emerald-600" : p < 0 ? "text-rose-600" : "text-zinc-400"}>{fmt(p)}</span>
                      <span className="ml-3 text-zinc-500">{fmt(m.scores[s])}</span>
                    </span>
                  </li>
                ))}
            </ul>
            <Button className="mt-4 w-full" onClick={() => setSeenDeals(m.history.length)} data-testid="deal-result-ok">
              OK
            </Button>
          </div>
        </div>
      )}
    </>
  );
}

type Spot = [number, number];

/**
 * Seats around the table, me at the bottom (my hand), play order clockwise = next players on my left.
 * 3: left 1, right 1 | 4: left 1, top 1, right 1 | 5: left 1, top 2, right 1 | 6: left 2, top 1, right 2 (stacked).
 * The felt sits in the middle: every trick card lies in front of the seat that played it (Septica's table).
 * A spectator watches from seat 0.
 */
function Table({
  m,
  players,
  name,
  showLast,
}: {
  m: MatchView;
  players: RoomState["players"];
  name: (s: number) => string;
  showLast: boolean;
}) {
  const n = m.seats.length;
  const anchor = Math.max(m.mySeat, 0);
  const o = Array.from({ length: n - 1 }, (_, i) => (anchor + 1 + i) % n);
  const split =
    o.length === 2
      ? { left: [o[0]], top: [] as number[], right: [o[1]] }
      : o.length === 3
        ? { left: [o[0]], top: [o[1]], right: [o[2]] }
        : o.length === 4
          ? { left: [o[0]], top: [o[1], o[2]], right: [o[3]] }
          : { left: [o[1], o[0]], top: [o[2]], right: [o[3], o[4]] };

  // Where each seat's card lands on the felt (% of its width / height).
  const spots = new Map<number, Spot>();
  const column = (seats: number[], x: number) =>
    seats.forEach((s, i) => spots.set(s, [x, seats.length === 1 ? 46 : i === 0 ? 30 : 64]));
  column(split.left, 19);
  column(split.right, 81);
  split.top.forEach((s, i) => spots.set(s, [split.top.length === 1 ? 50 : i === 0 ? 34 : 66, 24]));
  spots.set(anchor, [50, 74]);

  const chip = (s: number) => <SeatChip key={s} m={m} seat={s} connected={players.find((p) => p.id === m.seats[s])?.connected} />;
  return (
    <Card className="flex flex-col gap-2 !p-2 sm:!p-3">
      {split.top.length > 0 && (
        <ul className="mx-auto flex w-full max-w-[20rem] justify-center gap-2 [&>li]:min-w-0 [&>li]:flex-1">{split.top.map(chip)}</ul>
      )}
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,2.6fr)_minmax(0,1fr)] items-center gap-1.5">
        <ul className="flex flex-col gap-2">{split.left.map(chip)}</ul>
        <Felt m={m} spots={spots} name={name} showLast={showLast} />
        <ul className="flex flex-col gap-2">{split.right.map(chip)}</ul>
      </div>
      {m.mySeat < 0 && <ul className="mx-auto w-1/2">{chip(anchor)}</ul>}
    </Card>
  );
}

/** The green felt: the current trick (each card in front of its player), or the four Rentz rows. */
function Felt({ m, spots, name, showLast }: { m: MatchView; spots: Map<number, Spot>; name: (s: number) => string; showLast: boolean }) {
  const felt = "relative w-full rounded-2xl bg-emerald-800 shadow-inner ring-1 ring-emerald-950/30";
  if (m.game === "rentz") {
    return (
      <div className={`${felt} flex flex-col justify-center gap-1.5 px-2 py-2.5`} data-testid="felt" data-mode="rentz">
        {SUITS.map((suit) => {
          const row = rentzRow(m, suit);
          return (
            <div key={suit} className="flex h-11 items-center" title={SUIT_NAME[suit]} data-suit={suit}>
              {row.length === 0 ? (
                <span className="flex h-10 w-7 items-center justify-center rounded-md border border-dashed border-emerald-200/50 text-[10px] font-bold text-emerald-100/80">
                  {m.rentzStart ? RANK_LABEL[m.rentzStart] : "J"}
                  {SUIT_SYMBOL[suit]}
                </span>
              ) : (
                // Cards overlap when the row is longer than the felt: each one keeps its corner (rank) visible.
                row.map((c, i) => (
                  <span key={c} className={`min-w-[11px] ${i === row.length - 1 ? "shrink-0" : "shrink basis-7"}`}>
                    <PlayingCard card={c} size="xs" />
                  </span>
                ))
              )}
            </div>
          );
        })}
      </div>
    );
  }
  const live = m.trick;
  const showing = live.length === 0 && showLast && m.lastTrick ? m.lastTrick.cards : live;
  const faded = live.length === 0;
  return (
    <div className={`${felt} h-44`} data-testid="felt" data-mode="trick" data-last={faded && showing.length > 0}>
      {showing.length === 0 ? (
        <span className="absolute inset-0 flex items-center justify-center px-2 text-center text-xs text-emerald-100/80">
          {m.phase === "choosing" ? "Se alege jocul…" : "Masa e goală"}
        </span>
      ) : (
        showing.map((p) => {
          const [x, y] = spots.get(p.seat) ?? [50, 50];
          return (
            <span
              key={p.card}
              className="absolute -translate-x-1/2 -translate-y-1/2"
              style={{ left: `${x}%`, top: `${y}%` }}
              title={p.seat === m.mySeat ? "tu" : name(p.seat)}
            >
              <PlayingCard card={p.card} size="felt" faded={faded} />
            </span>
          );
        })
      )}
      {faded && showing.length > 0 && m.lastTrick && (
        <span className="absolute inset-x-1 bottom-1 truncate text-center text-[10px] font-semibold text-emerald-50">
          {m.lastTrick.winner === m.mySeat ? "Ai luat levata" : `${name(m.lastTrick.winner)} a luat levata`}
        </span>
      )}
    </div>
  );
}

function SeatChip({ m, seat, connected }: { m: MatchView; seat: number; connected: boolean | undefined }) {
  const acting = m.acting === seat;
  const place = m.finished.indexOf(seat);
  const passed = m.passes.includes(seat);
  return (
    <li
      className={`rounded-lg border px-2 py-1.5 text-center ${
        acting ? "border-indigo-500 bg-white font-bold text-indigo-700 dark:bg-zinc-900 dark:text-indigo-300" : "border-transparent bg-white/60 dark:bg-zinc-900/60"
      }`}
    >
      <span className="block truncate text-sm">
        {acting && "▶ "}
        {m.names[seat]}
      </span>
      <span className="block text-[11px] font-normal text-zinc-500">
        🂠 {m.handCounts[seat]}
        {m.game && m.game !== "rentz" && ` · ${takenSummary(m, seat)}`}
        {m.game === "rentz" && place >= 0 && ` · locul ${place + 1} (+${rentzPoints(m.seats.length)[place]})`}
        {m.game === "rentz" && place < 0 && passed && " · pas"}
      </span>
      {m.chooser === seat && (
        <span className="mx-auto mt-0.5 block w-fit rounded-full bg-amber-300 px-1.5 text-[9px] font-bold uppercase text-amber-950">
          {m.phase === "choosing" ? "alege" : "a ales"}
        </span>
      )}
      {m.refused[seat] && <span className="block text-[10px] text-amber-600">refuz folosit</span>}
      {m.blindUsed[seat] && <span className="block text-[10px] text-zinc-500">blind folosit</span>}
      <OfflineBadge connected={connected} />
    </li>
  );
}

function BlindBadge() {
  return (
    <span data-testid="blind-badge" className="ml-2 rounded-full bg-zinc-900 px-2 py-0.5 align-middle text-[11px] font-bold text-white dark:bg-zinc-100 dark:text-zinc-900">
      BLIND ×2
    </span>
  );
}

function FinalBanner({ m }: { m: MatchView }) {
  const best = Math.max(...m.scores);
  const winners = m.scores.map((s, i) => (s === best ? i : -1)).filter((i) => i >= 0);
  return (
    <div className="text-center" data-testid="final-banner" data-end={m.endReason ?? ""}>
      {m.endReason === "abandoned" && (
        <p className="mb-2 rounded-lg bg-amber-100 px-3 py-1.5 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
          Meci întrerupt: un jucător a plecat după {m.history.length} din {m.totalDeals} mâini.
        </p>
      )}
      <p className="text-4xl">🏆</p>
      <h2 className="text-2xl font-black">
        {winners.map((s) => (s === m.mySeat ? "Tu" : m.names[s])).join(" și ")} {winners.length > 1 ? "câștigă la egalitate" : winners[0] === m.mySeat ? "ai câștigat" : "câștigă"}
      </h2>
      <p className="text-sm text-zinc-500">cu {fmt(best)} puncte</p>
    </div>
  );
}
