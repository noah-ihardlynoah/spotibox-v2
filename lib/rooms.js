import { supabase } from "./supabase";

export function normalizeRoomCode(roomCode) {
  return roomCode.trim().toUpperCase();
}

export function normalizeMemberName(name) {
  return name.trim().toLowerCase();
}

export async function roomExists(roomCode) {
  const normalizedRoomCode = normalizeRoomCode(roomCode);
  const { data, error } = await supabase
    .from("rooms")
    .select("code")
    .eq("code", normalizedRoomCode)
    .is("closed_at", null)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return Boolean(data);
}

export async function createRoom(roomCode) {
  const normalizedRoomCode = normalizeRoomCode(roomCode);
  const { error } = await supabase
    .from("rooms")
    .insert({ code: normalizedRoomCode, host_id: crypto.randomUUID() });

  if (error) {
    throw error;
  }

  return normalizedRoomCode;
}

export async function closeRoom(roomCode) {
  const normalizedRoomCode = normalizeRoomCode(roomCode);
  const { error } = await supabase
    .from("rooms")
    .delete()
    .eq("code", normalizedRoomCode);

  if (error) {
    throw error;
  }
}

export function closeRoomOnExit(roomCode) {
  const normalizedRoomCode = normalizeRoomCode(roomCode);
  const params = new URLSearchParams({
    code: `eq.${normalizedRoomCode}`,
  });

  return fetch(
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rooms?${params.toString()}`,
    {
      method: "DELETE",
      headers: {
        apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
        Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      keepalive: true,
    }
  );
}

export async function isNameBanned(roomCode, name) {
  const { data, error } = await supabase
    .from("room_bans")
    .select("room_code")
    .eq("room_code", normalizeRoomCode(roomCode))
    .eq("name_key", normalizeMemberName(name))
    .maybeSingle();

  if (error) {
    throw error;
  }

  return Boolean(data);
}

export async function banName(roomCode, name) {
  const { error } = await supabase.from("room_bans").upsert(
    {
      room_code: normalizeRoomCode(roomCode),
      name_key: normalizeMemberName(name),
      display_name: name.trim(),
    },
    { onConflict: "room_code,name_key" }
  );

  if (error) {
    throw error;
  }
}
