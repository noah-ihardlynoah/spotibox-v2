"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "../../lib/supabase";

const SCOPES = "streaming user-read-email user-read-private user-modify-playback-state";

function randomString(length = 64) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes)).replace(/[^a-zA-Z0-9]/g, "").slice(0, length);
}

async function sha256(value) {
  const buffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return btoa(String.fromCharCode(...new Uint8Array(buffer))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function trackForQueue(track, addedBy) {
  return { id: track.id, uri: track.uri, name: track.name, artist: track.artists.map((artist) => artist.name).join(", "), album: track.album.name, image: track.album.images?.[0]?.url || "", addedBy };
}

export default function Jukebox({ roomCode, session }) {
  const [token, setToken] = useState("");
  const [search, setSearch] = useState("");
  const [results, setResults] = useState([]);
  const [selectedTrack, setSelectedTrack] = useState(null);
  const [queue, setQueue] = useState([]);
  const [currentTrack, setCurrentTrack] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [status, setStatus] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const channelRef = useRef(null);
  const playerRef = useRef(null);
  const deviceIdRef = useRef(null);
  const queueRef = useRef(queue);
  const sessionRef = useRef(session);
  queueRef.current = queue;
  sessionRef.current = session;
  const canControl = session?.role === "host" || session?.role === "cohost";
  const isHost = session?.role === "host";

  useEffect(() => {
    const storedToken = sessionStorage.getItem(`spotibox:spotify-token:${roomCode}`);
    if (storedToken) setToken(storedToken);
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const state = params.get("state");
    const savedState = sessionStorage.getItem("spotibox:spotify-state");
    const codeVerifier = sessionStorage.getItem("spotibox:spotify-verifier");
    if (code && state === savedState && codeVerifier) {
      fetch("/api/spotify/token", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code, codeVerifier, redirectUri: `${window.location.origin}/spotify-callback` }) })
        .then((response) => response.json())
        .then((data) => {
          if (!data.access_token) throw new Error(data.error || "Spotify login failed.");
          sessionStorage.setItem(`spotibox:spotify-token:${roomCode}`, data.access_token);
          setToken(data.access_token);
          window.history.replaceState({}, "", `/${roomCode}`);
        })
        .catch(() => setStatus("Spotify could not connect."));
    }
  }, [roomCode]);

  useEffect(() => {
    if (isHost && token) {
      channelRef.current?.send({ type: "broadcast", event: "spotify-token", payload: { token } });
    }
  }, [isHost, token]);

  useEffect(() => {
    const channel = supabase.channel(`jukebox:${roomCode}`);
    channelRef.current = channel;
    channel.on("broadcast", { event: "spotify-token" }, ({ payload }) => setToken(payload.token))
      .on("broadcast", { event: "queue-sync" }, ({ payload }) => setQueue(payload.queue || []))
      .on("broadcast", { event: "queue-request" }, () => { if (isHost) channel.send({ type: "broadcast", event: "queue-sync", payload: { queue: queueRef.current } }); })
      .on("broadcast", { event: "player-command" }, ({ payload }) => {
        if (!isHost || !playerRef.current) return;
        if (payload.action === "play") playerRef.current.resume();
        if (payload.action === "pause") playerRef.current.pause();
        if (payload.action === "next") playNext();
        if (payload.action === "previous") playerRef.current.seek(0);
      })
      .on("broadcast", { event: "track-state" }, ({ payload }) => { setCurrentTrack(payload.track || null); setIsPlaying(Boolean(payload.isPlaying)); })
      .subscribe(() => channel.send({ type: "broadcast", event: "queue-request", payload: {} }));
    return () => { channelRef.current = null; supabase.removeChannel(channel); };
  }, [isHost, roomCode]);

  useEffect(() => {
    if (!token || !isHost) return undefined;
    const script = document.createElement("script");
    script.src = "https://sdk.scdn.co/spotify-player.js";
    script.async = true;
    document.body.appendChild(script);
    window.onSpotifyWebPlaybackSDKReady = () => {
      const player = new window.Spotify.Player({ name: "Spotibox Jukebox", getOAuthToken: (callback) => callback(token), volume: 0.7 });
      player.addListener("ready", ({ device_id }) => { deviceIdRef.current = device_id; });
      player.addListener("player_state_changed", (state) => {
        if (!state) return;
        setIsPlaying(!state.paused);
        if (state.track_window.current_track) {
          const track = trackForQueue(state.track_window.current_track, "");
          setCurrentTrack(track);
          channelRef.current?.send({ type: "broadcast", event: "track-state", payload: { track, isPlaying: !state.paused } });
        }
      });
      player.connect();
      playerRef.current = player;
    };
    return () => { playerRef.current?.disconnect(); script.remove(); };
  }, [isHost, token]);

  useEffect(() => {
    if (!search.trim() || !token) { setResults([]); return undefined; }
    const timer = setTimeout(async () => {
      setIsSearching(true);
      const response = await fetch(`/api/spotify/search?q=${encodeURIComponent(search)}&token=${encodeURIComponent(token)}`);
      const data = await response.json();
      setResults(data.tracks?.items || []);
      setIsSearching(false);
    }, 350);
    return () => clearTimeout(timer);
  }, [search, token]);

  function connectSpotify() {
    const clientId = process.env.NEXT_PUBLIC_SPOTIFY_CLIENT_ID;
    if (!clientId) { setStatus("Add NEXT_PUBLIC_SPOTIFY_CLIENT_ID to connect Spotify."); return; }
    const verifier = randomString();
    sessionStorage.setItem("spotibox:spotify-verifier", verifier);
    sessionStorage.setItem("spotibox:spotify-room", roomCode);
    sha256(verifier).then((challenge) => {
      const state = randomString(16);
      sessionStorage.setItem("spotibox:spotify-state", state);
      const params = new URLSearchParams({ client_id: clientId, response_type: "code", redirect_uri: `${window.location.origin}/spotify-callback`, code_challenge_method: "S256", code_challenge: challenge, state, scope: SCOPES });
      window.location.href = `https://accounts.spotify.com/authorize?${params}`;
    });
  }

  function sendCommand(action) {
    if (!canControl) return;
    if (isHost) {
      if (action === "play") playerRef.current?.resume();
      if (action === "pause") playerRef.current?.pause();
      if (action === "next") playNext();
      if (action === "previous") playerRef.current?.seek(0);
    } else channelRef.current?.send({ type: "broadcast", event: "player-command", payload: { action } });
  }

  function playNext() {
    const nextQueue = queueRef.current.slice(1);
    setQueue(nextQueue);
    channelRef.current?.send({ type: "broadcast", event: "queue-sync", payload: { queue: nextQueue } });
    const nextTrack = queueRef.current[0];
    if (nextTrack && deviceIdRef.current) fetch(`https://api.spotify.com/v1/me/player/play?device_id=${deviceIdRef.current}`, { method: "PUT", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ uris: [nextTrack.uri] }) });
  }

  function addToQueue() {
    const item = trackForQueue(selectedTrack, session?.name || "Guest");
    const nextQueue = [...queueRef.current, item];
    setQueue(nextQueue);
    channelRef.current?.send({ type: "broadcast", event: "queue-sync", payload: { queue: nextQueue } });
    setSelectedTrack(null);
    setStatus(`${item.name} added to the queue.`);
  }

  const tokenReady = Boolean(token);
  return (
    <section className="jukebox" aria-label="Spotibox jukebox">
      <div className="jukebox-topline"><span>LIVE JUKEBOX</span><span>{tokenReady ? "SPOTIFY CONNECTED" : "SPOTIFY OFFLINE"}</span></div>
      <div className="jukebox-search-row"><input className="jukebox-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={tokenReady ? "Search Spotify tracks..." : "Connect Spotify to search"} disabled={!tokenReady} aria-label="Search Spotify tracks" />{!tokenReady && isHost && <button className="solid-button" type="button" onClick={connectSpotify}>Connect Spotify</button>}</div>
      {status && <p className="jukebox-status">{status}</p>}
      {isSearching && <p className="jukebox-hint">Searching...</p>}
      {results.length > 0 && <div className="search-results">{results.map((track) => <button className="search-result" type="button" key={track.id} onClick={() => setSelectedTrack(track)}><img src={track.album.images?.[2]?.url || track.album.images?.[0]?.url} alt="" /><span><strong>{track.name}</strong><small>{track.artists.map((artist) => artist.name).join(", ")}</small></span></button>)}</div>}
      <div className="jukebox-grid"><div className="now-playing"><p className="eyebrow">NOW PLAYING</p>{currentTrack ? <><img src={currentTrack.image} alt="" /><h2>{currentTrack.name}</h2><p>{currentTrack.artist}</p></> : <div className="empty-record">No record on the turntable.</div>}<div className="player-controls"><button type="button" disabled={!canControl} onClick={() => sendCommand("previous")} aria-label="Rewind" title="Rewind">|&lt;</button><button type="button" disabled={!canControl} onClick={() => sendCommand(isPlaying ? "pause" : "play")} aria-label={isPlaying ? "Pause" : "Play"} title={isPlaying ? "Pause" : "Play"}>{isPlaying ? "||" : ">"}</button><button type="button" disabled={!canControl} onClick={() => sendCommand("next")} aria-label="Skip" title="Skip">&gt;|</button></div>{!canControl && <p className="jukebox-hint">Host and co-hosts control playback.</p>}</div><div className="queue-panel"><div className="queue-heading"><p className="eyebrow">UP NEXT</p><span>{queue.length} {queue.length === 1 ? "record" : "records"}</span></div>{queue.length === 0 ? <div className="empty-queue">The queue is empty.<br />Be the first to pick a record.</div> : <ol>{queue.map((track, index) => <li key={`${track.id}-${index}`}><img src={track.image} alt="" /><span><strong>{track.name}</strong><small>{track.artist}</small></span><em>{track.addedBy}</em></li>)}</ol>}</div></div>
      {selectedTrack && <div className="track-modal-backdrop" role="presentation" onClick={() => setSelectedTrack(null)}><div className="track-modal" role="dialog" aria-modal="true" aria-labelledby="track-title" onClick={(event) => event.stopPropagation()}><img src={selectedTrack.album.images?.[0]?.url} alt="" /><div><p className="eyebrow">ADD TO JUKEBOX</p><h2 id="track-title">{selectedTrack.name}</h2><p>{selectedTrack.artists.map((artist) => artist.name).join(", ")}</p><button className="solid-button" type="button" onClick={addToQueue}>Add to queue</button><button className="text-button" type="button" onClick={() => setSelectedTrack(null)}>Close</button></div></div></div>}
    </section>
  );
}