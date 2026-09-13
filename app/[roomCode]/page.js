"use client";

import Link from "next/link";
import { useState } from "react";
import Jukebox from "./Jukebox";
import RoomMembers from "./RoomMembers";

export default function RoomPage({ params }) {
  const [session, setSession] = useState(null);
  const roomCode = params.roomCode;

  return (
    <main className="app-shell">
      <header className="brand">
        <Link href="/" className="brand-link">
          <img src="/logo.png" alt="Spotibox logo" />
          <h1>Spotibox</h1>
        </Link>
      </header>

      <div className="room-layout">
        <Jukebox roomCode={roomCode} session={session} />

        <aside className="participants">
          <RoomMembers roomCode={roomCode} onSessionChange={setSession} />
        </aside>
      </div>
      <footer>(C) Noah Massie 2026</footer>
    </main>
  );
}
