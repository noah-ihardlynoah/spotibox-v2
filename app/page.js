"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createRoom, roomExists } from "../lib/rooms";

const MAX_NAME_LENGTH = 20;
const ROOM_CODE_PATTERN = /[^ABCDEFGHJKLMNPQRSTUVWXYZ23456789]/g;

function createRoomCode(length = 8) {
  const characters = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const values = new Uint32Array(length);

  crypto.getRandomValues(values);

  return Array.from(
    values,
    (value) => characters[value % characters.length]
  ).join("");
}

export default function HomePage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [nameError, setNameError] = useState("");
  const [roomCodeError, setRoomCodeError] = useState("");
  const [isJoining, setIsJoining] = useState(false);

  useEffect(() => {
    const error = new URLSearchParams(window.location.search).get("error");

    if (error === "room-not-found") {
      setRoomCodeError("This room does not exist.");
    }

    if (error === "name-in-use") {
      setNameError("This name is already in use in this room.");
    }
  }, []);

  function requireName() {
    const trimmedName = name.trim();

    if (!trimmedName) {
      setNameError("Enter your name before continuing.");
      return false;
    }

    if (trimmedName.length > MAX_NAME_LENGTH) {
      setNameError(`Name must be ${MAX_NAME_LENGTH} characters or fewer.`);
      return false;
    }

    setNameError("");
    return true;
  }

  async function handleCreateRoom() {
    if (!requireName()) {
      return;
    }

    const roomCode = createRoomCode();

    try {
      await createRoom(roomCode);
    } catch {
      setRoomCodeError("Unable to create a room. Try again.");
      return;
    }

    sessionStorage.setItem(
      "spotibox:pending-join",
      JSON.stringify({ roomCode, name: name.trim(), role: "host" })
    );
    router.push(`/${roomCode}`);
  }

  async function handleJoinRoomasGuest() {
    if (isJoining) {
      return;
    }

    if (!requireName()) {
      return;
    }

    if (!roomCode) {
      setRoomCodeError("Enter a room code before continuing.");
      return;
    }

    setIsJoining(true);

    try {
      if (!(await roomExists(roomCode))) {
        setRoomCodeError("That room does not exist.");
        setIsJoining(false);
        return;
      }
    } catch {
      setRoomCodeError("Unable to verify that room. Try again.");
      setIsJoining(false);
      return;
    }

    sessionStorage.setItem(
      "spotibox:pending-join",
      JSON.stringify({ roomCode, name: name.trim(), role: "guest" })
    );
    router.push(`/${roomCode}`);
  }

  async function handleJoinRoomasHost() {
    if (isJoining) {
      return;
    }

    if (!requireName()) {
      return;
    }

    if (!roomCode) {
      setRoomCodeError("Enter a room code before continuing.");
      return;
    }

    setIsJoining(true);

    try {
      if (!(await roomExists(roomCode))) {
        setRoomCodeError("That room does not exist.");
        setIsJoining(false);
        return;
      }
    } catch {
      setRoomCodeError("Unable to verify that room. Try again.");
      setIsJoining(false);
      return;
    }

    sessionStorage.setItem(
      "spotibox:pending-join",
      JSON.stringify({ roomCode, name: name.trim(), role: "cohost" })
    );
    router.push(`/${roomCode}`);
  }

  return (
    <main className="app-shell">
      <header className="brand">
        <a href="/" className="brand-link">
          <img src="/logo.png" alt="Spotibox logo" />
          <h1>Spotibox</h1>
        </a>
      </header>

      
      <nav className="menu" aria-label="Main navigation">
        
        <div className="name-input">
          <a>1.</a>
          <input
            className="menu-input"
            type="text"
            placeholder="Enter name"
            aria-label="Name"
            maxLength={MAX_NAME_LENGTH}
            value={name}
            aria-invalid={Boolean(nameError)}
            onChange={(event) => {
              setName(event.target.value);
              setNameError("");
            }}
          />
        </div>

        {nameError && <p className="input-error">{nameError}</p>}


       
        

        <div className={`join-options ${roomCodeError ? "has-error" : ""}`}>
          <a>2.</a>
          <input
          className="menu-input"
          type="text"
          placeholder="Enter room code"
          aria-label="Room code"
          value={roomCode}
          maxLength={8}
          pattern="[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}"
          autoCapitalize="characters"
          onChange={(event) => {
            setRoomCode(
              event.target.value
                .toUpperCase()
                .replace(ROOM_CODE_PATTERN, "")
                .slice(0, 8)
            );
            setRoomCodeError("");
          }}
          />

          {roomCodeError && (
            <p className="room-code-error">{roomCodeError}</p>
          )}

          <div className="join-buttons">
            <button
              type="button"
              onClick={handleJoinRoomasGuest}
              disabled={isJoining}
            >
            Join Room as Guest
            </button>
            <button
              type="button"
              onClick={handleJoinRoomasHost}
              disabled={isJoining}
            >
              Join Room as Co-Host
            </button>
          </div>
        </div>

          <a className="join-divider">OR</a>


          <button
            className="create-room-button"
            type="button"
            onClick={handleCreateRoom}
          >
            Create Room
          </button>

        

      </nav>

      <footer>(C) Noah Massie 2026</footer>
    </main>
  );
}
