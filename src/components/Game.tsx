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
  ranksFor,
  rentzPoints,
  rentzRow,
  SUIT_NAME,
  SUIT_SYMBOL,
  SUITS,
  suitOf,
  type Card as CardCode,
  type GameId,
  type Rank,
} from "@/lib/game";
import type { MatchView, RoomState } from "@/lib/types";
import { OfflineBadge, PlayerList } from "./PlayerList";
import { PlayingCard } from "./PlayingCard";
import { Scoreboard } from "./Scoreboard";
import { Button, Card, ErrorText } from "./ui";

interface Props {
  state: RoomState;
  token: string;
  refresh: () => Promise<void>;
  kickLeft: (playerId: string) => number | null;
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
    case "totale":
      return [`${t} lev.`, q && `${q}Q`, d && `${d}♦`, k && "K♥"].filter(Boolean).join(" · ");
    default:
      return "";
  }
}

export function Game({ state, token, refresh, kickLeft }: Props) {
  const { room, me } = state;
  const m = state.match!;
  const base = `/api/rooms/${room.code}`;
  const isHost = room.hostPlayerId === me.id;
  const n = m.seats.length;
  const name = (s: number) => m.names[s] ?? "?";
  const over = m.phase === "over";
  const myTurn = m.phase === "playing" && m.acting === m.mySeat;
  const iChoose = m.phase === "choosing" && m.chooser === m.mySeat;

  const [confirmPlay] = useBoolPref(PREF_CONFIRM_PLAY, false);
  const [soundOn] = useBoolPref(PREF_SOUND, true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<CardCode | null>(null);
  const [pickedGame, setPickedGame] = useState<GameId | null>(null);
  const [start, setStart] = useState<Rank>(ranksFor(n)[0]);
  // Deal-result pop-up: deals finished while this component is mounted (it remounts per match).
  const [seenDeals, setSeenDeals] = useState(m.history.length);

  useEffect(() => {
    if (soundOn && !over && m.acting === m.mySeat) playTurnChime();
  }, [soundOn, over, m.acting, m.mySeat, m.deal, m.phase]);

  async function run(key: string, path: string, body: unknown = {}) {
    unlockAudio();
    setBusy(key);
    setError("");
    try {
      await api(`${base}/${path}`, { token, body });
      setSelected(null);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Eroare.");
      await refresh();
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
    void run("play", "play", { card });
  }

  const legal = new Set(m.legal);
  const others = Array.from({ length: n - 1 }, (_, i) => (Math.max(m.mySeat, 0) + 1 + i) % n);
  const showLast = m.phase === "playing" && m.trick.length === 0 && m.lastTrick?.deal === m.deal;
  const refusalNow = m.lastRefusal && m.lastRefusal.deal === m.deal && m.phase !== "over";
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
              <span>
                Mâna {m.deal + 1}/{m.totalDeals}
              </span>
              <span>alege {m.chooser === m.mySeat ? "tu" : name(m.chooser)}</span>
            </div>
            {m.game ? (
              <>
                <h2 className="mt-1 text-xl font-black">
                  {GAME_INFO[m.game].name}
                  {m.game === "rentz" && m.rentzStart && (
                    <span className="ml-2 text-sm font-semibold text-zinc-500">de la {RANK_LABEL[m.rentzStart]}</span>
                  )}
                </h2>
                <p className="text-xs text-zinc-500">{GAME_INFO[m.game].rule}</p>
              </>
            ) : (
              <h2 className="mt-1 text-xl font-black">{iChoose ? "Alegi jocul" : `${name(m.chooser)} alege jocul…`}</h2>
            )}
            <p
              className={`mt-2 rounded-lg px-3 py-1.5 text-center text-sm font-semibold ${
                myTurn || iChoose ? "bg-indigo-600 text-white" : "bg-zinc-100 dark:bg-zinc-900"
              }`}
            >
              {iChoose
                ? "Uită-te în cărți și alege jocul"
                : myTurn
                  ? m.game === "rentz"
                    ? "E rândul tău: pune o carte"
                    : m.trick.length === 0
                      ? "E rândul tău: deschide"
                      : "E rândul tău: răspunde"
                  : m.phase === "choosing"
                    ? `Așteptăm alegerea lui ${name(m.chooser)}`
                    : `Rândul lui ${name(m.acting)}`}
            </p>
            {refusalNow && (
              <p role="status" className="mt-2 rounded-lg bg-amber-100 px-3 py-1.5 text-center text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
                🔄 {m.lastRefusal!.seat === m.mySeat ? "Ai" : `${name(m.lastRefusal!.seat)} a`} refuzat cărțile. S-au împărțit din nou.
              </p>
            )}
          </>
        )}
      </Card>

      {/* Choosing */}
      {iChoose && (
        <Card>
          <div className="grid grid-cols-2 gap-2">
            {m.remaining[m.mySeat].map((g) => (
              <button
                key={g}
                type="button"
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
          {pickedGame === "rentz" && (
            <label className="mt-3 flex items-center justify-between gap-2 text-sm font-medium">
              Pornește de la
              <select
                value={start}
                onChange={(e) => setStart(e.target.value as Rank)}
                className="min-h-11 rounded-lg border border-zinc-300 bg-white px-3 text-base dark:border-zinc-700 dark:bg-zinc-900"
              >
                {ranksFor(n).map((r) => (
                  <option key={r} value={r}>
                    {RANK_LABEL[r]}
                  </option>
                ))}
              </select>
            </label>
          )}
          <Button
            className="mt-3 w-full"
            disabled={!pickedGame || busy !== null}
            onClick={() => pickedGame && void run("choose", "choose", { game: pickedGame, start })}
          >
            {busy === "choose" ? "Se alege…" : pickedGame ? `Joacă ${GAME_INFO[pickedGame].name}` : "Alege un joc"}
          </Button>
        </Card>
      )}

      {/* Table */}
      {!over && (
        <Card className="bg-emerald-50 dark:bg-emerald-950/40">
          <ul className={`grid gap-2 ${n === 4 ? "grid-cols-3" : "grid-cols-2"}`}>
            {others.map((s) => (
              <SeatChip key={s} m={m} seat={s} connected={state.players.find((p) => p.id === m.seats[s])?.connected} />
            ))}
          </ul>

          {m.game === "rentz" ? (
            <div className="mt-3 flex flex-col gap-1.5">
              {SUITS.map((suit) => {
                const row = rentzRow(m, suit);
                return (
                  <div key={suit} className="flex min-h-12 items-center gap-1">
                    <span className={`w-5 shrink-0 text-center text-lg ${suit === "H" || suit === "D" ? "text-rose-600" : ""}`} title={SUIT_NAME[suit]}>
                      {SUIT_SYMBOL[suit]}
                    </span>
                    <div className="flex flex-wrap gap-0.5">
                      {row.length === 0 ? (
                        <span className="text-xs text-zinc-500">se deschide cu {RANK_LABEL[m.rentzStart ?? "7"]}{SUIT_SYMBOL[suit]}</span>
                      ) : (
                        row.map((c) => <PlayingCard key={c} card={c} size="sm" />)
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="mt-3 flex min-h-28 flex-col items-center justify-center gap-1">
              {m.trick.length > 0 ? (
                <div className="flex justify-center gap-2">
                  {m.trick.map((p) => (
                    <PlayingCard key={p.card} card={p.card} size="lg" label={p.seat === m.mySeat ? "tu" : name(p.seat)} />
                  ))}
                </div>
              ) : showLast && m.lastTrick ? (
                <>
                  <div className="flex justify-center gap-2">
                    {m.lastTrick.cards.map((p) => (
                      <PlayingCard key={p.card} card={p.card} size="lg" faded label={p.seat === m.mySeat ? "tu" : name(p.seat)} />
                    ))}
                  </div>
                  <p className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">
                    {m.lastTrick.winner === m.mySeat ? "Ai luat levata" : `${name(m.lastTrick.winner)} a luat levata`}
                  </p>
                </>
              ) : (
                <p className="text-sm text-zinc-500">{m.phase === "choosing" ? "Se alege jocul…" : "Masa e goală"}</p>
              )}
            </div>
          )}
        </Card>
      )}

      {/* My hand */}
      {!over && m.mySeat >= 0 && (
        <Card>
          <div className="mb-2 flex items-baseline justify-between gap-2 text-sm">
            <span className="font-bold">Cărțile tale</span>
            <span className="text-xs text-zinc-500">
              {m.game && m.game !== "rentz" && takenSummary(m, m.mySeat)}
              {m.game === "rentz" && m.finished.includes(m.mySeat) && `Ai terminat al ${m.finished.indexOf(m.mySeat) + 1}-lea`}
            </span>
          </div>
          {m.hand.length === 0 ? (
            <p className="py-4 text-center text-sm text-zinc-500">Nu mai ai cărți.</p>
          ) : (
            <div className="grid grid-cols-8 gap-1">
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
            <Button className="mt-3 w-full" disabled={busy !== null} onClick={() => void run("play", "play", { card: selected })}>
              {busy === "play" ? "Se joacă…" : `Joacă ${cardLabel(selected)}`}
            </Button>
          )}

          {m.canRefuse ? (
            <Button
              variant="secondary"
              className="mt-3 w-full"
              disabled={busy !== null}
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
        <Button className="w-full" disabled={busy !== null} onClick={() => void run("new", "new-round")}>
          {busy === "new" ? "Se pregătește…" : "Meci nou"}
        </Button>
      )}
      {over && !isHost && <p className="text-center text-sm text-zinc-500">Host-ul poate porni un meci nou.</p>}

      <ErrorText>{error}</ErrorText>

      <Scoreboard m={m} />

      <PlayerList state={state} token={token} refresh={refresh} kickLeft={kickLeft} />

      {lastDeal && !over && (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 p-4 sm:items-center" onClick={() => setSeenDeals(m.history.length)}>
          <div role="dialog" aria-modal="true" className="w-full max-w-sm rounded-xl bg-white p-4 shadow-xl dark:bg-zinc-950">
            <p className="text-xs text-zinc-500">
              Mâna {lastDeal.deal + 1} · a ales {name(lastDeal.chooser)}
            </p>
            <h2 className="text-xl font-black">{GAME_INFO[lastDeal.game].name}</h2>
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
            <Button className="mt-4 w-full" onClick={() => setSeenDeals(m.history.length)}>
              OK
            </Button>
          </div>
        </div>
      )}
    </>
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
      {m.refused[seat] && <span className="block text-[10px] text-amber-600">refuz folosit</span>}
      <OfflineBadge connected={connected} />
    </li>
  );
}

function FinalBanner({ m }: { m: MatchView }) {
  const best = Math.max(...m.scores);
  const winners = m.scores.map((s, i) => (s === best ? i : -1)).filter((i) => i >= 0);
  return (
    <div className="text-center">
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
