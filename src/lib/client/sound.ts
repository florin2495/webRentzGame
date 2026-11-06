"use client";

let ctx: AudioContext | null = null;

/** Unlocks audio on iOS: call from a tap. */
export function unlockAudio() {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
  } catch {
    // Web Audio unavailable
  }
}

/** A short two-note "your turn" chime, synthesized (no audio file). Silent if audio is locked. */
export function playTurnChime() {
  try {
    ctx ??= new AudioContext();
    const ac = ctx;
    if (ac.state !== "running") return;
    [660, 880].forEach((freq, i) => {
      const at = ac.currentTime + i * 0.12;
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, at);
      gain.gain.linearRampToValueAtTime(0.25, at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, at + 0.25);
      osc.connect(gain).connect(ac.destination);
      osc.start(at);
      osc.stop(at + 0.3);
    });
  } catch {
    // ignore
  }
}
