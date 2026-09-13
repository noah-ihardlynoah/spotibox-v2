"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

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

  function requireName() {
    const trimmedName = name.trim();

    if (!trimmedName) {
      setNameError("Enter your name before continuing.");
      return false;
    }

    setNameError("");
    return true;
  }

  function handleCreateRoom() {
    if (!requireName()) {
      return;
    }

    const roomCode = createRoomCode();
    sessionStorage.setItem(
      "spotibox:pending-join",
      JSON.stringify({ roomCode, name: name.trim(), role: "host" })
    );
    router.push(`/${roomCode}`);
  }

  function handleJoinRoomasGuest() {
    if (!requireName()) {
      return;
    }

    if (!roomCode) {
      setRoomCodeError("Enter a room code before continuing.");
      return;
    }

    sessionStorage.setItem(
      "spotibox:pending-join",
      JSON.stringify({ roomCode, name: name.trim(), role: "guest" })
    );
    router.push(`/${roomCode}`);
  }

  function handleJoinRoomasHost() {
    if (!requireName()) {
      return;
    }

    if (!roomCode) {
      setRoomCodeError("Enter a room code before continuing.");
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
          autoCapitalize="characters"
          onChange={(event) => {
            setRoomCode(event.target.value.toUpperCase().slice(0, 8));
            setRoomCodeError("");
          }}
          />

          {roomCodeError && (
            <p className="room-code-error">{roomCodeError}</p>
          )}

          <div className="join-buttons">
            <button type="button" onClick={handleJoinRoomasGuest}>
            Join Room as Guest
            </button>
            <button type="button" onClick={handleJoinRoomasHost}>
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
