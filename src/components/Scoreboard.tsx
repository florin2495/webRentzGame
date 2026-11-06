import { GAME_INFO, GAMES } from "@/lib/game";
import type { MatchView } from "@/lib/types";
import { Card } from "./ui";

const fmt = (n: number) => (n > 0 ? `+${n}` : `${n}`);
const tone = (n: number) => (n > 0 ? "text-emerald-600 dark:text-emerald-400" : n < 0 ? "text-rose-600 dark:text-rose-400" : "text-zinc-400");

/** Totals, per-deal history and which games each player still has to choose. */
export function Scoreboard({ m }: { m: MatchView }) {
  const seats = m.seats.map((_, i) => i);
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
            {m.history.map((h) => (
              <tr key={h.deal} className="border-t border-zinc-100 dark:border-zinc-900">
                <td className="px-1 py-1 text-xs">
                  <span className="font-semibold">{GAME_INFO[h.game].name}</span>{" "}
                  <span className="text-zinc-500">· {m.names[h.chooser]}</span>
                </td>
                {seats.map((s) => (
                  <td key={s} className={`px-1 py-1 text-right font-mono tabular-nums ${tone(h.points[s])}`}>
                    {h.points[s] === 0 ? "·" : fmt(h.points[s])}
                  </td>
                ))}
              </tr>
            ))}
            {m.history.length === 0 && (
              <tr>
                <td colSpan={seats.length + 1} className="py-2 text-center text-xs text-zinc-500">
                  Nicio mână terminată încă.
                </td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-zinc-300 font-bold dark:border-zinc-700">
              <td className="px-1 py-1">Total</td>
              {seats.map((s) => (
                <td key={s} className={`px-1 py-1 text-right font-mono tabular-nums ${tone(m.scores[s])}`}>
                  {fmt(m.scores[s])}
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>

      <h3 className="mb-1 mt-4 text-sm font-bold">Jocuri alese</h3>
      <div className="-mx-1 overflow-x-auto">
        <table className="w-full min-w-max text-xs">
          <thead>
            <tr className="text-zinc-500">
              <th />
              {GAMES.map((g) => (
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
                {GAMES.map((g) => {
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
        {GAMES.map((g) => `${GAME_INFO[g].icon} ${GAME_INFO[g].name}`).join(" · ")}
      </p>
    </Card>
  );
}
