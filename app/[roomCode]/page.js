import Link from "next/link";
import RoomMembers from "./RoomMembers";

export default async function RoomPage({ params }) {
  const { roomCode } = await params;

  return (
    <main className="app-shell">
      <header className="brand">
        <Link href="/" className="brand-link">
          <img src="/logo.png" alt="Spotibox logo" />
          <h1>Spotibox</h1>
        </Link>
      </header>

      <div className="room-layout">
        <section className="room-placeholder" aria-label="Room placeholder">
          <div>
            <h2>Room {roomCode}</h2>
            <p>Your room content will appear here.</p>
          </div>
        </section>

        <aside className="participants">
          <RoomMembers roomCode={roomCode} />
        </aside>
      </div>
    </main>
  );
}
