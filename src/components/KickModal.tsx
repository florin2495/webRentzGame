"use client";

import { useState } from "react";
import { api, ApiRequestError } from "@/lib/client/api";
import { Button, ErrorText } from "./ui";

/** Blocking modal for a player whose kick is pending. Only "Ignoră" closes it. */
export function KickModal({ code, token, seconds, refresh }: { code: string; token: string; seconds: number; refresh: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function ignore() {
    setBusy(true);
    setError("");
    try {
      await api(`/api/rooms/${code}/kick/ignore`, { token, body: {} });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Eroare.");
      if (!(err instanceof ApiRequestError)) {
        setBusy(false);
        return;
      }
    }
    await refresh(); // 401 here = already removed: refresh shows the "removed" flow
    setBusy(false);
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 p-4 sm:items-center">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="kick-title"
        aria-describedby="kick-text"
        className="w-full max-w-sm rounded-xl border border-zinc-200 bg-white p-5 text-zinc-900 shadow-xl dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
      >
        <h2 id="kick-title" className="text-xl font-black">
          Ai fost scos din joc
        </h2>
        <p id="kick-text" className="mt-2 text-sm">
          Gazda te-a scos din cameră. Apasă „Ignoră” în {seconds} s ca să rămâi în joc.
        </p>
        <p className="my-4 text-center font-mono text-5xl font-black tabular-nums" aria-hidden="true">
          {seconds}
        </p>
        <Button className="w-full" disabled={busy} onClick={() => void ignore()}>
          Ignoră
        </Button>
        <div className="mt-2">
          <ErrorText>{error}</ErrorText>
        </div>
      </div>
    </div>
  );
}
