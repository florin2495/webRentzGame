"use client";

import { useEffect, useRef, useState } from "react";
import { KICK_NETWORK_GRACE_MS } from "@/lib/kick";
import type { RoomState } from "@/lib/types";

/**
 * Live countdown for pending kicks. The server sends remaining ms; we count down locally from the
 * moment the state arrived (`stateAt`). When a countdown reaches 0 the client refreshes once, and once
 * more after the server's network tolerance, so the removal is enforced without waiting for the poll.
 * Returns whole seconds left for a player (ceil), or null when no kick is pending.
 */
export function useKickCountdown(state: RoomState | null, stateAt: number, refresh: () => Promise<void>) {
  const pending = state?.players.filter((p) => p.kickRemainingMs !== null) ?? [];
  const hasPending = pending.length > 0;
  const [now, setNow] = useState(() => Date.now());
  const fired = useRef(new Set<string>());

  useEffect(() => {
    if (!hasPending) return;
    const t = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(t);
  }, [hasPending]);

  const leftMs = (ms: number) => ms - Math.max(0, now - stateAt);

  useEffect(() => {
    const live = new Set(pending.map((p) => p.id));
    for (const key of fired.current) if (!live.has(key.split(":")[0])) fired.current.delete(key);
    for (const p of pending) {
      const left = (p.kickRemainingMs ?? 0) - Math.max(0, now - stateAt);
      for (const [stage, threshold] of [
        [0, 0],
        [1, -KICK_NETWORK_GRACE_MS - 200],
      ] as const) {
        const key = `${p.id}:${stage}`;
        if (left <= threshold && !fired.current.has(key)) {
          fired.current.add(key);
          void refresh();
        }
      }
    }
  });

  return (playerId: string): number | null => {
    const p = state?.players.find((x) => x.id === playerId);
    if (!p || p.kickRemainingMs === null) return null;
    return Math.max(0, Math.ceil(leftMs(p.kickRemainingMs) / 1000));
  };
}
