import { connection } from "next/server";
import { NICKNAME_MAX } from "@/lib/game";
import { hashDeviceId, hashPassword, hashToken, newPlayerToken, newRoomCode } from "@/lib/server/crypto";
import { db, T } from "@/lib/server/db";
import { cleanText, fail, handle, isUniqueViolation, readJson } from "@/lib/server/http";
import { cleanupAbandonedRooms, cleanupExpiredRooms } from "@/lib/server/room";
import type { RoomListItem } from "@/lib/types";

// GET /api/rooms - public list of every live room (lobby, running and just-finished matches; idle ones are cleaned up first).
// Joining a running match makes the newcomer a spectator.
// Loading the list ("Intră în cameră") first sweeps abandoned rooms: no member seen and no activity for 600 s
// (6 h for a running match).
export async function GET() {
  await connection(); // always request-time, never prerendered at build
  return handle(async () => {
    await Promise.all([cleanupExpiredRooms(), cleanupAbandonedRooms()]);
    const { data, error } = await db()
      .from(T.rooms)
      .select("code, name, status, password_hash, last_activity_at, players:rentz_players!rentz_players_room_id_fkey(count)")
      .eq("players.role", "player")
      .order("last_activity_at", { ascending: false })
      .limit(50);
    if (error) throw error;
    const rooms: RoomListItem[] = (data ?? []).map((r) => ({
      code: r.code,
      name: r.name,
      hasPassword: r.password_hash !== null,
      inGame: r.status !== "lobby",
      players: (r.players as unknown as { count: number }[])[0]?.count ?? 0,
    }));
    return { rooms };
  });
}

// POST /api/rooms - create a room and its host player.
export async function POST(req: Request) {
  return handle(async () => {
    await cleanupExpiredRooms();
    const body = await readJson(req);
    const name = cleanText(body.name, "Numele camerei", 1, 40);
    const nickname = cleanText(body.nickname, "Nickname-ul", 1, NICKNAME_MAX);

    let passwordHash: string | null = null;
    if (typeof body.password === "string" && body.password.length > 0) {
      if (body.password.length > 100) fail(400, "Parola e prea lungă.");
      passwordHash = await hashPassword(body.password);
    }

    let room: { id: string; code: string } | null = null;
    for (let attempt = 0; attempt < 5 && !room; attempt++) {
      const { data, error } = await db()
        .from(T.rooms)
        .insert({ code: newRoomCode(), name, password_hash: passwordHash })
        .select("id, code")
        .single();
      if (error && !isUniqueViolation(error)) throw error;
      room = data;
    }
    if (!room) fail(503, "Nu am putut genera un cod de cameră. Încearcă din nou.");

    const token = newPlayerToken();
    const { data: player, error: playerError } = await db()
      .from(T.players)
      .insert({ room_id: room.id, nickname, token_hash: hashToken(token), device_hash: hashDeviceId(body.deviceId), is_host: true, seat: 0 })
      .select("id")
      .single();
    if (playerError) throw playerError;

    const { error: hostError } = await db().from(T.rooms).update({ host_player_id: player.id }).eq("id", room.id);
    if (hostError) throw hostError;

    return { code: room.code, playerId: player.id, token };
  });
}
