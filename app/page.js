"use client";

import { useRouter } from "next/navigation";

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

  function handleCreateRoom() {
    const roomCode = createRoomCode();
    router.push(`/${roomCode}`);
  }

  function handleJoinRoomasGuest() {
    
  }

  function handleJoinRoomasHost() {
    
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
          />
        </div>


       
        

        <div className="join-options">
          <a>2.</a>
          <input
          className="menu-input"
          type="text"
          placeholder="Enter room code"
          aria-label="Room code"
          />

          <div className="join-buttons">
            <button type="button" onClick={handleJoinRoomasGuest}>
            Join Room as Guest
            </button>
            <button type="button" onClick={handleJoinRoomasHost}>
              Join Room as Co-Host
            </button>
          </div>
        </div>

          <a>OR</a>


          <button type="button" onClick={handleCreateRoom}>
          Create Room
        </button>

        

      </nav>

      <footer>(C) Noah Massie 2026</footer>
    </main>
  );
}
