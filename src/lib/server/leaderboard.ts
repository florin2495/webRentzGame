import "server-only";
import { db } from "./db";
import { isUniqueViolation } from "./http";

const GAME = "rentz";

export const playerKey = (nickname: string) => nickname.trim().toLowerCase();

/**
 * Reports a finished match to the hub's shared leaderboard (tables owned by florin2495/hailataticu-hub,
 * migration hub 002_hub_leaderboard.sql). Idempotent per (game, room, round): the hub_leaderboard_rounds row is
 * claimed first, so a match is never counted twice. Best effort: never throws, a failure only logs
 * (this must not break the last move of a match, or the hub migration not being run yet).
 */
export async function reportLeaderboard(
  roomCode: string,
  roundNo: number,
  players: { nickname: string; won: boolean }[],
): Promise<void> {
  try {
    const { error: claimError } = await db()
      .from("hub_leaderboard_rounds")
      .insert({ game: GAME, room_code: roomCode, round_no: roundNo });
    if (isUniqueViolation(claimError)) return; // already counted
    if (claimError) throw claimError;

    const keys = players.map((p) => playerKey(p.nickname));
    const { data, error } = await db()
      .from("hub_leaderboard")
      .select("player_key, wins, games")
      .eq("game", GAME)
      .in("player_key", keys);
    if (error) throw error;
    const current = new Map((data ?? []).map((r: { player_key: string; wins: number; games: number }) => [r.player_key, r]));
    const rows = players.map((p) => {
      const key = playerKey(p.nickname);
      const row = current.get(key);
      return {
        game: GAME,
        player_key: key,
        display_name: p.nickname.trim().slice(0, 40),
        wins: (row?.wins ?? 0) + (p.won ? 1 : 0),
        games: (row?.games ?? 0) + 1,
        updated_at: new Date().toISOString(),
      };
    });
    const { error: upsertError } = await db().from("hub_leaderboard").upsert(rows, { onConflict: "game,player_key" });
    if (upsertError) throw upsertError;
  } catch (err) {
    console.error("leaderboard report failed", err);
  }
}
