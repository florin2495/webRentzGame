"use client";

import { useState } from "react";
import { api } from "@/lib/client/api";
import { KICK_GRACE_MS } from "@/lib/kick";
import type { RoomState } from "@/lib/types";
import { Card, ErrorText } from "./ui";

interface Props {
  state: RoomState;
  token: string;
  refresh: () => Promise<void>;
  /** Seconds left of a pending kick for a player, null when none. */
  kickLeft: (playerId: string) => number | null;
}

/** Players during a match: pending-kick badge for everyone, kick button for the host. */
export function PlayerList({ state, token, refresh, kickLeft }: Props) {
  const { room, me, players } = state;
  const isHost = room.hostPlayerId === me.id;
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function kick(id: string, nickname: string) {
    const warning =
      room.status === "playing"
        ? `Scoți jucătorul ${nickname} din cameră? Are ${KICK_GRACE_MS / 1000} secunde să refuze; dacă nu, meciul se încheie pentru toți.`
        : `Scoți jucătorul ${nickname} din cameră?`;
    if (!window.confirm(warning)) return;
    setBusy(id);
    setError("");
    try {
      await api(`/api/rooms/${room.code}/kick`, { token, body: { playerId: id } });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Eroare.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card>
      <h2 className="mb-2 font-bold">Jucători</h2>
      <ul className="flex flex-col divide-y divide-zinc-200 dark:divide-zinc-800">
        {players.map((p) => {
          const left = kickLeft(p.id);
          return (
            <li key={p.id} className="flex items-center justify-between gap-2 py-2">
              <span className="flex min-w-0 items-center gap-2">
                <span className="truncate">
                  {p.nickname}
                  {p.id === me.id && <span className="text-zinc-500"> (tu)</span>}
                </span>
                {p.isHost && (
                  <span className="rounded bg-zinc-200 px-1.5 text-[10px] font-semibold uppercase dark:bg-zinc-800">host</span>
                )}
                {left !== null && (
                  <span className="shrink-0 rounded bg-amber-100 px-1.5 text-[11px] font-semibold text-amber-900 dark:bg-amber-950 dark:text-amber-200">
                    iese în {left} s
                  </span>
                )}
              </span>
              {isHost && p.id !== me.id && (
                <button
                  type="button"
                  onClick={() => void kick(p.id, p.nickname)}
                  disabled={busy !== null}
                  className="min-h-8 rounded-md border border-rose-300 px-2 text-xs font-semibold text-rose-600 disabled:opacity-40 dark:border-rose-800 dark:text-rose-400"
                >
                  {busy === p.id ? "…" : "Scoate"}
                </button>
              )}
            </li>
          );
        })}
      </ul>
      <div className="mt-2">
        <ErrorText>{error}</ErrorText>
      </div>
    </Card>
  );
}
