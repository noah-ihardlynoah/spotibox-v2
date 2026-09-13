"use client";

import { useEffect } from "react";

export default function SpotifyCallbackPage() {
  useEffect(() => {
    const roomCode = sessionStorage.getItem("spotibox:spotify-room");
    const params = new URLSearchParams(window.location.search);
    window.location.replace(roomCode ? `/${roomCode}?${params.toString()}` : "/");
  }, []);

  return <main className="app-shell"><p className="jukebox-hint">Returning to Spotibox...</p></main>;
}