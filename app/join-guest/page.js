import Link from "next/link";

export default function JoinGuestPage() {
  return (
    <main className="app-shell">
      <header className="brand">
        <Link href="/" className="brand-link">
          <img src="/logo.png" alt="Spotibox logo" />
          <h1>Spotibox</h1>
        </Link>
      </header>

      <section className="screen-content">
        <h2>Join Room as Guest</h2>
        <p>Guest room joining will be connected next.</p>
      </section>
    </main>
  );
}
