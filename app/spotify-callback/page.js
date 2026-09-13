"use client";

import { useEffect } from "react";

export default function SpotifyCallbackPage() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (window.opener) {
      window.opener.postMessage({
        type: "spotibox-spotify-callback",
        code: params.get("code"),
        state: params.get("state"),
        error: params.get("error"),
      }, window.location.origin);
      window.close();
    }
  }, []);

  return <main className="app-shell"><p className="jukebox-hint">Spotify connected. You can close this tab.</p></main>;
}