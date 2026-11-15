"use client";

import { useState } from "react";
import { api } from "@/lib/client/api";
import type { RoomState } from "@/lib/types";
import { OfflineBadge } from "./PlayerList";
import { Button, Card, ErrorText } from "./ui";

interface Props {
  state: RoomState;
  token: string;
  refresh: () => Promise<void>;
}

/** Spectator controls ("Intră la runda următoare") and the list of spectators, shown in lobby and match. */
export function SpectatorPanel({ state, token, refresh }: Props) {
  const { room, me, spectators } = state;
  const isHost = room.hostPlayerId === me.id;
  const imSpectator = me.role === "spectator";
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function run(key: string, path: string, body: unknown = {}, confirmText?: string) {
    if (confirmText && !window.confirm(confirmText)) return;
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

  if (!imSpectator && spectators.length === 0) return null;

  return (
    <Card>
      {imSpectator && (
        <div className="mb-3">
          <p className="text-sm font-semibold">Ești spectator: vezi jocul, dar nu poți juca.</p>
          <Button
            variant={me.queued ? "secondary" : "primary"}
            className="mt-2 w-full"
            disabled={busy !== null}
            onClick={() => void run("queue", "queue")}
            data-testid="queue-toggle"
          >
            {busy === "queue" ? "…" : me.queued ? "✓ Ești în coadă (apasă ca să renunți)" : "Intră la runda următoare"}
          </Button>
          <p className="mt-1 text-center text-xs text-zinc-500">
            {me.queued
              ? "Când host-ul pornește un meci nou, intri la masă dacă sunt locuri libere."
              : "Apasă ca să joci în meciul următor, dacă sunt locuri libere."}
          </p>
        </div>
      )}
      {spectators.length > 0 && (
        <>
          <h2 className="mb-1 text-sm font-bold">
            Spectatori <span className="font-normal text-zinc-500">{spectators.length}</span>
          </h2>
          <ul data-testid="spectator-list" className="flex flex-col divide-y divide-zinc-200 dark:divide-zinc-800">
            {spectators.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-2 py-1.5 text-sm">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="truncate">
                    {s.nickname}
                    {s.id === me.id && <span className="text-zinc-500"> (tu)</span>}
                  </span>
                  {s.queued && (
                    <span className="shrink-0 rounded bg-indigo-100 px-1.5 text-[10px] font-semibold uppercase text-indigo-800 dark:bg-indigo-950 dark:text-indigo-200">
                      în coadă
                    </span>
                  )}
                  <OfflineBadge connected={s.connected} />
                </span>
                {isHost && (
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => void run(s.id, "kick", { playerId: s.id }, `Scoți spectatorul ${s.nickname} din cameră?`)}
                    className="min-h-8 rounded-md border border-rose-300 px-2 text-xs font-semibold text-rose-600 disabled:opacity-40 dark:border-rose-800 dark:text-rose-400"
                  >
                    {busy === s.id ? "…" : "Scoate"}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
      <div className="mt-2">
        <ErrorText>{error}</ErrorText>
      </div>
    </Card>
  );
}
