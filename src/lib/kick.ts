/** Pending kick (host kicks a player during a running match): pure helpers, shared by server and client. */

/** How long the kicked player has to press "Ignoră". */
export const KICK_GRACE_MS = 10_000;
/** Server-side tolerance (network) added to the grace before a kick is enforced / an ignore is refused. */
export const KICK_NETWORK_GRACE_MS = 2_000;

const toMs = (t: string | number | Date): number => (t instanceof Date ? t.getTime() : typeof t === "number" ? t : Date.parse(t));

/** Milliseconds left of the grace period, clamped to [0, KICK_GRACE_MS]; null when no kick is pending. */
export function kickRemainingMs(requestedAt: string | number | Date | null, now: number): number | null {
  if (requestedAt === null) return null;
  const t = toMs(requestedAt);
  if (Number.isNaN(t)) return null;
  return Math.min(KICK_GRACE_MS, Math.max(0, KICK_GRACE_MS - (now - t)));
}

/** True once the grace period plus the network tolerance has passed: the player must be removed. */
export function isKickExpired(requestedAt: string | number | Date | null, now: number): boolean {
  if (requestedAt === null) return false;
  const t = toMs(requestedAt);
  return !Number.isNaN(t) && now - t > KICK_GRACE_MS + KICK_NETWORK_GRACE_MS;
}
