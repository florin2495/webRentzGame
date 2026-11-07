import { describe, expect, it } from "vitest";
import { isKickExpired, KICK_GRACE_MS, KICK_NETWORK_GRACE_MS, kickRemainingMs } from "./kick";

const T0 = Date.parse("2026-01-01T00:00:00.000Z");
const iso = new Date(T0).toISOString();

describe("kickRemainingMs", () => {
  it("is null when no kick is pending", () => expect(kickRemainingMs(null, T0)).toBeNull());
  it("counts down from the full grace", () => {
    expect(kickRemainingMs(iso, T0)).toBe(KICK_GRACE_MS);
    expect(kickRemainingMs(iso, T0 + 4_000)).toBe(6_000);
  });
  it("clamps to [0, grace]", () => {
    expect(kickRemainingMs(iso, T0 + 60_000)).toBe(0);
    expect(kickRemainingMs(iso, T0 - 5_000)).toBe(KICK_GRACE_MS); // clock skew: requested "in the future"
  });
  it("ignores an unparsable timestamp", () => expect(kickRemainingMs("nope", T0)).toBeNull());
});

describe("isKickExpired", () => {
  it("is false without a pending kick", () => expect(isKickExpired(null, T0 + 1e9)).toBe(false));
  it("waits for the grace plus the network tolerance", () => {
    expect(isKickExpired(iso, T0 + KICK_GRACE_MS)).toBe(false);
    expect(isKickExpired(iso, T0 + KICK_GRACE_MS + KICK_NETWORK_GRACE_MS)).toBe(false);
    expect(isKickExpired(iso, T0 + KICK_GRACE_MS + KICK_NETWORK_GRACE_MS + 1)).toBe(true);
  });
});
