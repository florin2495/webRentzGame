"use client";

import { useState } from "react";
import { api } from "@/lib/client/api";
import { MAX_PLAYERS, MIN_PLAYERS } from "@/lib/game";
import type { RoomState } from "@/lib/types";
import { OfflineBadge } from "./PlayerList";
import { Rules } from "./Rules";
import { Button, Card, ErrorText } from "./ui";

interface Props {
  state: RoomState;
  token: string;
  refresh: () => Promise<void>;
}

export function Lobby({ state, token, refresh }: Props) {
  const { room, me, players } = state;
  const isHost = room.hostPlayerId === me.id;
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const isPlayer = me.role === "player";
  const enough = players.length >= MIN_PLAYERS && players.length <= MAX_PLAYERS;

  async function run(key: string, path: string, body: unknown = {}) {
    setBusy(key);
    setError("");
    try {
      await api(`/api/rooms/${room.code}/${path}`, { token, body });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Eroare.");
    } finally {
      setBusy(null);
    }
  }

  /** Moves a player one place up (-1) or down (+1) and saves the whole order. */
  function move(index: number, dir: -1 | 1) {
    const order = players.map((p) => p.id);
    const j = index + dir;
    if (j < 0 || j >= order.length) return;
    [order[index], order[j]] = [order[j], order[index]];
    void run(`move:${order[j]}`, "reorder", { order });
  }

  return (
    <>
      <Card>
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="font-bold">Jucători</h2>
          <span className="text-xs text-zinc-500">
            {players.length}/{MAX_PLAYERS} · minim {MIN_PLAYERS}
          </span>
        </div>
        <ul className="flex flex-col divide-y divide-zinc-200 dark:divide-zinc-800">
          {players.map((p, index) => (
            <li key={p.id} className="flex items-center justify-between gap-2 py-2">
              <span className="flex min-w-0 items-center gap-2">
                <span className="w-4 shrink-0 text-xs font-semibold text-zinc-500">{index + 1}</span>
                <span className="truncate">
                  {p.nickname}
                  {p.id === me.id && <span className="text-zinc-500"> (tu)</span>}
                </span>
                {p.isHost && (
                  <span className="rounded bg-zinc-200 px-1.5 text-[10px] font-semibold uppercase dark:bg-zinc-800">host</span>
                )}
                <OfflineBadge connected={p.connected} />
              </span>
              <span className="flex shrink-0 items-center gap-1">
                {isHost && players.length > 1 && (
                  <>
                    <button
                      type="button"
                      aria-label={`Mută ${p.nickname} mai sus`}
                      onClick={() => move(index, -1)}
                      disabled={busy !== null || index === 0}
                      className="min-h-9 min-w-9 rounded-md border border-zinc-300 text-sm font-bold disabled:opacity-30 dark:border-zinc-700"
                    >
                      ▲
                    </button>
                    <button
                      type="button"
                      aria-label={`Mută ${p.nickname} mai jos`}
                      onClick={() => move(index, 1)}
                      disabled={busy !== null || index === players.length - 1}
                      className="min-h-9 min-w-9 rounded-md border border-zinc-300 text-sm font-bold disabled:opacity-30 dark:border-zinc-700"
                    >
                      ▼
                    </button>
                  </>
                )}
                {isHost && p.id !== me.id && (
                  <button
                    type="button"
                    onClick={() => window.confirm(`Scoți jucătorul ${p.nickname} din cameră?`) && void run(p.id, "kick", { playerId: p.id })}
                    disabled={busy !== null}
                    className="min-h-9 rounded-md border border-rose-300 px-2 text-xs font-semibold text-rose-600 disabled:opacity-40 dark:border-rose-800 dark:text-rose-400"
                  >
                    {busy === p.id ? "…" : "Scoate"}
                  </button>
                )}
              </span>
            </li>
          ))}
          {Array.from({ length: Math.max(0, MAX_PLAYERS - players.length) }, (_, i) => (
            <li key={`empty-${i}`} className="py-2 text-sm text-zinc-400">
              Loc liber{players.length + i < MIN_PLAYERS ? " (necesar)" : " (opțional)"}
            </li>
          ))}
        </ul>
      </Card>

      <Card>
        {isHost ? (
          <>
            <Button className="w-full" disabled={!enough || busy !== null} onClick={() => void run("start", "start")}>
              {busy === "start" ? "Se împart cărțile…" : "Începe meciul"}
            </Button>
            <p className="mt-2 text-center text-xs text-zinc-500">
              {enough
                ? `Meciul are ${players.length * 7} mâini. Ordinea la masă e cea din listă (primul alege primul); o schimbi cu ▲▼.`
                : `Trimite codul camerei prietenilor. Mai trebuie ${MIN_PLAYERS - players.length} jucător(i).`}
            </p>
          </>
        ) : (
          <p className="text-center text-sm text-zinc-500">
            {isPlayer ? "Așteptăm ca host-ul să înceapă meciul…" : "Host-ul pornește meciul. Apasă „Intră la runda următoare” ca să joci."}
          </p>
        )}
        <div className="mt-2">
          <ErrorText>{error}</ErrorText>
        </div>
      </Card>

      <Rules />
    </>
  );
}
