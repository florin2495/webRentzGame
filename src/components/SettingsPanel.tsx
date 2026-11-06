"use client";

import { PREF_CONFIRM_PLAY, PREF_SOUND, useBoolPref } from "@/lib/client/prefs";
import { Card, Toggle } from "./ui";

const VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? "dev";

/** Per-device settings, collapsed by default, shown on every room screen (lobby and game). */
export function SettingsPanel() {
  const [confirmPlay, setConfirmPlay] = useBoolPref(PREF_CONFIRM_PLAY, false);
  const [soundOn, setSoundOn] = useBoolPref(PREF_SOUND, true);

  return (
    <Card className="py-2">
      <details className="group">
        <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between gap-2">
          <span className="flex items-center gap-2 font-bold">
            <span className="text-xs transition-transform group-open:rotate-90">▶</span>
            Setări
          </span>
          <span className="font-mono text-xs text-zinc-500">v{VERSION}</span>
        </summary>
        <div className="pb-1 pt-1">
          <Toggle
            label="Confirmare la carte"
            hint={confirmPlay ? "Prima apăsare alege cartea, a doua o joacă." : "Cartea apăsată pe tura ta se joacă imediat."}
            checked={confirmPlay}
            onChange={setConfirmPlay}
          />
          <Toggle label="Sunet când e rândul tău" checked={soundOn} onChange={setSoundOn} />
        </div>
      </details>
    </Card>
  );
}
