import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// Minimal stand-in for the Supabase query builder used by cleanupAbandonedRooms:
//   select: from(rooms).select(...).lt("last_activity_at", cutoff).or(...).limit(n)  -> { data, error }
//   delete: from(rooms).delete().in("id", ids).lt("last_activity_at", cutoff)        -> { error }
// Every delete chain records its own calls, so the lobby and playing deletes can be told apart.
const h = vi.hoisted(() => ({
  selectResult: { data: [] as unknown[] | null, error: null as unknown },
  deleteResult: { error: null as unknown },
  selectCalls: [] as { op: string; args: unknown[] }[],
  deletes: [] as { op: string; args: unknown[] }[][],
}));

vi.mock("./db", () => {
  const selectChain = () => {
    const q: Record<string, (...args: unknown[]) => unknown> = {};
    for (const op of ["select", "lt", "or", "eq", "limit"]) {
      q[op] = (...args: unknown[]) => {
        h.selectCalls.push({ op, args });
        return op === "limit" ? Promise.resolve(h.selectResult) : q;
      };
    }
    return q;
  };
  const deleteChain = () => {
    const calls: { op: string; args: unknown[] }[] = [];
    h.deletes.push(calls);
    const q: Record<string, (...args: unknown[]) => unknown> = {};
    for (const op of ["delete", "in", "eq", "lt"]) {
      q[op] = (...args: unknown[]) => {
        calls.push({ op, args });
        return op === "lt" ? Promise.resolve(h.deleteResult) : q;
      };
    }
    return q;
  };
  return {
    T: { rooms: "rentz_rooms", players: "rentz_players" },
    ROOM_COLUMNS: "",
    PLAYER_COLUMNS: "",
    db: () => ({
      from: () => ({
        select: (...args: unknown[]) => selectChain().select(...args),
        delete: (...args: unknown[]) => deleteChain().delete(...args),
      }),
    }),
  };
});

import { ROOM_ABANDONED_MS, ROOM_ABANDONED_PLAYING_MS } from "@/lib/game";
import { cleanupAbandonedRooms } from "./room";

const NOW = Date.parse("2026-11-14T12:00:00.000Z");
const ago = (ms: number) => new Date(NOW - ms).toISOString();
const old = ago(ROOM_ABANDONED_MS + 60_000);
const veryOld = ago(ROOM_ABANDONED_PLAYING_MS + 60_000);

const arg = (calls: { op: string; args: unknown[] }[], op: string) => calls.find((c) => c.op === op)?.args;
const deletedIds = () => h.deletes.flatMap((d) => (arg(d, "in")?.[1] as string[]) ?? []);

describe("cleanupAbandonedRooms", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    h.selectCalls.length = 0;
    h.deletes.length = 0;
    h.selectResult = { data: [], error: null };
    h.deleteResult = { error: null };
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("only looks at rooms idle for longer than ROOM_ABANDONED_MS, and selects their status", async () => {
    await cleanupAbandonedRooms();
    expect(arg(h.selectCalls, "select")?.[0]).toContain("status");
    expect(arg(h.selectCalls, "lt")).toEqual(["last_activity_at", ago(ROOM_ABANDONED_MS)]);
    expect(arg(h.selectCalls, "or")?.[0]).toContain(ago(ROOM_ABANDONED_PLAYING_MS));
    expect(h.deletes).toHaveLength(0);
  });

  it("keeps rooms with a recently seen member and deletes silent ones", async () => {
    h.selectResult = {
      data: [
        { id: "kept", status: "lobby", last_activity_at: old, players: [{ last_seen_at: old }, { last_seen_at: ago(30_000) }] },
        { id: "silent", status: "lobby", last_activity_at: old, players: [{ last_seen_at: old }, { last_seen_at: null }] },
        { id: "empty", status: "finished", last_activity_at: old, players: [] },
      ],
      error: null,
    };
    await cleanupAbandonedRooms();
    expect(h.deletes).toHaveLength(1);
    expect(arg(h.deletes[0], "in")).toEqual(["id", ["silent", "empty"]]);
  });

  it("keeps a silent running match for less than 6 h and deletes it after", async () => {
    h.selectResult = {
      data: [
        { id: "young-match", status: "playing", last_activity_at: old, players: [{ last_seen_at: old }] },
        { id: "five-hours", status: "playing", last_activity_at: ago(5 * 3600_000), players: [] },
        { id: "dead-match", status: "playing", last_activity_at: veryOld, players: [{ last_seen_at: veryOld }] },
      ],
      error: null,
    };
    await cleanupAbandonedRooms();
    expect(deletedIds()).toEqual(["dead-match"]);
  });

  it("re-checks the activity cutoff of the room's status in the delete itself", async () => {
    h.selectResult = {
      data: [
        { id: "silent", status: "lobby", last_activity_at: old, players: [] },
        { id: "dead-match", status: "playing", last_activity_at: veryOld, players: [] },
      ],
      error: null,
    };
    await cleanupAbandonedRooms();
    const lobby = h.deletes.find((d) => (arg(d, "in")?.[1] as string[]).includes("silent"));
    const playing = h.deletes.find((d) => (arg(d, "in")?.[1] as string[]).includes("dead-match"));
    expect(arg(lobby!, "lt")).toEqual(["last_activity_at", ago(ROOM_ABANDONED_MS)]);
    expect(arg(playing!, "lt")).toEqual(["last_activity_at", ago(ROOM_ABANDONED_PLAYING_MS)]);
  });

  it("deletes nothing when every room has a recent member", async () => {
    h.selectResult = {
      data: [{ id: "kept", status: "lobby", last_activity_at: old, players: [{ last_seen_at: ago(1_000) }] }],
      error: null,
    };
    await cleanupAbandonedRooms();
    expect(h.deletes).toHaveLength(0);
  });

  it("logs a select error instead of throwing", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    h.selectResult = { data: null, error: { message: "boom" } };
    await expect(cleanupAbandonedRooms()).resolves.toBeUndefined();
    expect(log).toHaveBeenCalled();
    expect(h.deletes).toHaveLength(0);
  });

  it("logs a delete error instead of throwing", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    h.selectResult = { data: [{ id: "silent", status: "lobby", last_activity_at: old, players: [] }], error: null };
    h.deleteResult = { error: { message: "boom" } };
    await expect(cleanupAbandonedRooms()).resolves.toBeUndefined();
    expect(log).toHaveBeenCalled();
  });
});
