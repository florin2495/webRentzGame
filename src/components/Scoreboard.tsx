import { GAME_INFO } from "@/lib/game";
import type { MatchView } from "@/lib/types";
import { Card } from "./ui";

const fmt = (n: number) => (n > 0 ? `+${n}` : `${n}`);
const tone = (n: number) => (n > 0 ? "text-emerald-600 dark:text-emerald-400" : n < 0 ? "text-rose-600 dark:text-rose-400" : "text-zinc-400");

/** Live score of the deal in progress, per-deal history, totals and which games each player still has. */
export function Scoreboard({ m }: { m: MatchView }) {
  const seats = m.seats.map((_, i) => i);
  const live = m.livePoints;
  const total = (s: number) => m.scores[s] + (live?.[s] ?? 0);
  return (
    <Card>
      <h2 className="mb-2 font-bold">Scor</h2>
      <div className="-mx-1 overflow-x-auto">
        <table className="w-full min-w-max border-collapse text-sm">
          <thead>
            <tr className="text-xs text-zinc-500">
              <th className="px-1 py-1 text-left font-semibold">Mâna</th>
              {seats.map((s) => (
                <th key={s} className={`px-1 py-1 text-right font-semibold ${s === m.mySeat ? "text-indigo-600 dark:text-indigo-400" : ""}`}>
                  <span className="inline-block max-w-16 truncate align-bottom">{m.names[s]}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {live && m.game && (
              <tr data-testid="live-row" className="border-b-2 border-indigo-200 bg-indigo-50 dark:border-indigo-900 dark:bg-indigo-950/40">
                <td className="px-1 py-1 text-xs">
                  <span className="font-bold uppercase tracking-wide text-indigo-700 dark:text-indigo-300">● Live score</span>
                  <span className="block text-[11px] text-zinc-500">
                    {GAME_INFO[m.game].name}
                    {m.blind && " · BLIND ×2"} · {m.names[m.chooser]}
                  </span>
                </td>
                {seats.map((s) => (
                  <td key={s} className={`px-1 py-1 text-right font-mono font-bold tabular-nums ${tone(live[s])}`}>
                    {live[s] === 0 ? "0" : fmt(live[s])}
                  </td>
                ))}
              </tr>
            )}
            {m.history.map((h) => (
              <tr key={h.deal} className="border-t border-zinc-100 dark:border-zinc-900">
                <td className="px-1 py-1 text-xs">
                  <span className="font-semibold">{GAME_INFO[h.game].name}</span>
                  {h.blind && <span className="ml-1 text-[10px] font-bold">BLIND ×2</span>}{" "}
                  <span className="text-zinc-500">· {m.names[h.chooser]}</span>
                </td>
                {seats.map((s) => (
                  <td key={s} className={`px-1 py-1 text-right font-mono tabular-nums ${tone(h.points[s])}`}>
                    {h.points[s] === 0 ? "·" : fmt(h.points[s])}
                  </td>
                ))}
              </tr>
            ))}
            {m.history.length === 0 && !live && (
              <tr>
                <td colSpan={seats.length + 1} className="py-2 text-center text-xs text-zinc-500">
                  Nicio mână terminată încă.
                </td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-zinc-300 font-bold dark:border-zinc-700" data-testid="score-total">
              <td className="px-1 py-1">Total{live && <span className="block text-[10px] font-normal text-zinc-500">cu mâna în curs</span>}</td>
              {seats.map((s) => (
                <td key={s} className={`px-1 py-1 text-right font-mono tabular-nums ${tone(total(s))}`}>
                  {fmt(total(s))}
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>

      <GameLog m={m} />

      <h3 className="mb-1 mt-4 text-sm font-bold">Jocuri alese</h3>
      <div className="-mx-1 overflow-x-auto">
        <table className="w-full min-w-max text-xs">
          <thead>
            <tr className="text-zinc-500">
              <th />
              {m.games.map((g) => (
                <th key={g} className="px-1 font-semibold" title={GAME_INFO[g].name}>
                  {GAME_INFO[g].icon}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {seats.map((s) => (
              <tr key={s}>
                <td className="max-w-20 truncate px-1 py-0.5 font-semibold">{m.names[s]}</td>
                {m.games.map((g) => {
                  const done = !m.remaining[s].includes(g);
                  const now = m.phase !== "over" && m.chooser === s && m.game === g;
                  return (
                    <td key={g} className="px-1 py-0.5 text-center">
                      {now ? <span className="text-indigo-600">●</span> : done ? <span className="text-emerald-600">✓</span> : <span className="text-zinc-300 dark:text-zinc-700">○</span>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-1 text-[11px] text-zinc-500">
        {m.games.map((g) => `${GAME_INFO[g].icon} ${GAME_INFO[g].name}`).join(" · ")}
      </p>
    </Card>
  );
}

/**
 * Game log, collapsed by default (tap "Jurnal" to open): two lines per finished deal, newest first:
 * "Mâna 3 · Rentz ales de Ana" / "Ana +400p · Bob +200p · Cris 0p".
 */
function GameLog({ m }: { m: MatchView }) {
  if (m.history.length === 0) return null;
  const line = (points: number[]) =>
    points.map((p, s) => (
      <span key={s} className="whitespace-nowrap">
        {s > 0 && <span className="text-zinc-400"> · </span>}
        <span className={s === m.mySeat ? "font-semibold" : ""}>{m.names[s]}</span>{" "}
        <span className={`font-mono ${tone(p)}`}>{p === 0 ? "0" : fmt(p)}p</span>
      </span>
    ));
  return (
    <details data-testid="game-log" className="group mt-4">
      <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-bold">
        <span>
          Jurnal <span className="font-normal text-zinc-500">({m.history.length})</span>
        </span>
        <span className="text-xs font-normal text-indigo-600 dark:text-indigo-400">
          <span className="group-open:hidden">Arată ▾</span>
          <span className="hidden group-open:inline">Ascunde ▴</span>
        </span>
      </summary>
      <ol className="mt-1 flex max-h-64 flex-col gap-1.5 overflow-y-auto text-xs">
        {[...m.history].reverse().map((h) => (
          <li key={h.deal} className="rounded-lg bg-zinc-50 px-2 py-1.5 leading-relaxed dark:bg-zinc-900">
            {/* Line 1: the game and who chose it. Line 2: the points of every player. */}
            <div>
              <span className="text-zinc-500">Mâna {h.deal + 1} · </span>
              <b>{GAME_INFO[h.game].name}</b>
              {h.blind && <span className="text-[10px] font-bold"> BLIND ×2</span>} <span className="text-zinc-500">ales de</span>{" "}
              <b>{m.names[h.chooser]}</b>
            </div>
            <div className="flex flex-wrap">{line(h.points)}</div>
          </li>
        ))}
      </ol>
    </details>
  );
}
