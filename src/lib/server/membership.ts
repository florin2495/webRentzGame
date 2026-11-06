import "server-only";
import { abandonMatch, leaderSeat } from "@/lib/game";
import { notifyRoom } from "./broadcast";
import { db, type RoomRow, T } from "./db";
import { listPlayers } from "./room";

/**
 * Removes a player from a room (used by both "leave" and the host's "kick").
 *  - last player out: the room is deleted
 *  - host removed: host passes to the next player in join order
 *  - during a match: a card game cannot go on one player short, so the match stops;
 *    scores so far stand and the leader wins.
 */
export async function removePlayer(room: RoomRow, playerId: string, reason: string): Promise<{ roomClosed: boolean }> {
  const now = new Date().toISOString();
  const remaining = (await listPlayers(room.id)).filter((p) => p.id !== playerId);

  if (remaining.length === 0) {
    const { error } = await db().from(T.rooms).delete().eq("id", room.id);
    if (error) throw error;
    return { roomClosed: true };
  }

  const newHostId = room.host_player_id === playerId ? remaining[0].id : room.host_player_id;
  const update: Record<string, unknown> = { host_player_id: newHostId, updated_at: now, last_activity_at: now };

  if (room.status === "playing" && room.match?.seats.includes(playerId)) {
    const match = abandonMatch(room.match);
    update.match = match;
    update.version = room.version + 1;
    update.status = "finished";
    const leader = match.seats[leaderSeat(match)];
    // The leaver cannot be the winner on record (the FK would be nulled anyway).
    update.winner_player_id = leader === playerId ? null : leader;
  }

  // Update the room first so the host never points at a deleted player.
  const { error: roomError } = await db().from(T.rooms).update(update).eq("id", room.id);
  if (roomError) throw roomError;

  if (newHostId && newHostId !== room.host_player_id) {
    const { error } = await db().from(T.players).update({ is_host: true }).eq("id", newHostId);
    if (error) throw error;
  }

  const { error: deleteError } = await db().from(T.players).delete().eq("id", playerId);
  if (deleteError) throw deleteError;

  await notifyRoom(room.id, reason);
  return { roomClosed: false };
}
