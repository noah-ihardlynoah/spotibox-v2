import Link from "next/link";

export default function JoinHostPage() {
  return (
    <main className="app-shell">
      <header className="brand">
        <Link href="/" className="brand-link">
          <img src="/logo.png" alt="Spotibox logo" />
          <h1>Spotibox</h1>
        </Link>
      </header>

      <section className="screen-content">
        <h2>Join Room as Host</h2>
        <p>Host room joining will be connected next.</p>
      </section>
    </main>
  );
}
