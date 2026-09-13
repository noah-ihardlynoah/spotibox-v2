"use client";

import { useRouter } from "next/navigation";

function createRoomCode(length = 8) {
  const characters = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const values = new Uint32Array(length);
  crypto.getRandomValues(values);

  return Array.from(values, (value) => characters[value % characters.length]).join("");
}

export default function CreateRoomPage() {
  const router = useRouter();

  function handleCreateRoom() {
    router.push(`/${createRoomCode()}`);
  }

  return (
    <main className="app-shell">
      <header className="brand">
        <a href="/" className="brand-link">
          <img src="/logo.png" alt="Spotibox logo" />
          <h1>Spotibox</h1>
        </a>
      </header>

      <section className="screen-content">
        <h2>Create a private room</h2>
        <p>Anyone with the room link will be able to request access.</p>
        <button type="button" onClick={handleCreateRoom}>
          Create Room
        </button>
      </section>
    </main>
  );
}
