import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Match } from "@/lib/game";

/**
 * Table names. The Supabase project is shared by every hailatat.icu mini-game,
 * so every Rentz table carries the rentz_ prefix.
 */
export const T = {
  rooms: "rentz_rooms",
  players: "rentz_players",
} as const;

let admin: SupabaseClient | null = null;

/** Service-role client. Bypasses RLS - must never be imported from client code. */
export function db(): SupabaseClient {
  if (admin) return admin;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }
  admin = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return admin;
}

export interface RoomRow {
  id: string;
  code: string;
  name: string;
  password_hash: string | null;
  status: "lobby" | "playing" | "finished";
  round: number;
  host_player_id: string | null;
  winner_player_id: string | null;
  /** Whole match state, including every hand. Never sent to clients as-is. */
  match: Match | null;
  /** Optimistic lock: every match write requires the version it read. */
  version: number;
  last_activity_at: string;
}

export interface PlayerRow {
  id: string;
  room_id: string;
  nickname: string;
  is_host: boolean;
  joined_at: string;
  /** Pending kick during a match (null = none). See src/lib/kick.ts. */
  kick_requested_at: string | null;
}

export const PLAYER_COLUMNS = "id, room_id, nickname, is_host, joined_at, kick_requested_at";
export const ROOM_COLUMNS =
  "id, code, name, password_hash, status, round, host_player_id, winner_player_id, match, version, last_activity_at";
