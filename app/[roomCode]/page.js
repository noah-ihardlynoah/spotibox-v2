import Link from "next/link";

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
          <h2>In this room</h2>
          <ul>
            <li>You</li>
          </ul>
          <p className="room-note">Realtime member tracking will be connected next.</p>
        </aside>
      </div>
    </main>
  );
}
