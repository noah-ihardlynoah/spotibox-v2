"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "../../lib/supabase";

const SCOPES = "streaming user-read-email user-read-private user-read-playback-state user-read-currently-playing user-modify-playback-state playlist-read-private playlist-read-collaborative";

function getBrowser() {
  if( navigator.userAgent.indexOf("Chrome") != -1 ) {
    return "Chrome";
  } else if( navigator.userAgent.indexOf("Opera") != -1 ) {
    return "Opera";
  } else if( navigator.userAgent.indexOf("MSIE") != -1 ) {
    return "IE";
  } else if( navigator.userAgent.indexOf("Firefox") != -1 ) {
    return "Firefox";
  } else if( navigator.userAgent.indexOf("Edg") != -1 ) {
    return "Edge";
  } else {
    return "unknown browser";
  }
}

function getSpotifyRedirectUri() {
  return process.env.NEXT_PUBLIC_SPOTIFY_REDIRECT_URI || `${window.location.origin}/spotify-callback`;
}

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
  return { id: track.id, uri: track.uri, name: track.name, artist: track.artists.map((artist) => artist.name).join(", "), album: track.album.name, image: track.album.images?.[0]?.url || "", durationMs: track.duration_ms || 0, addedBy, source: "virtual" };
}

function formatDuration(durationMs) {
  const seconds = Math.floor((durationMs || 0) / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function playlistIdFromInput(value) {
  const match = value.trim().match(/(?:playlist\/|playlist:)([A-Za-z0-9]+)|^([A-Za-z0-9]+)$/);
  return match?.[1] || match?.[2] || "";
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
  const [playlistInput, setPlaylistInput] = useState("");
  const [isLoadingPlaylist, setIsLoadingPlaylist] = useState(false);
  const channelRef = useRef(null);
  const playerRef = useRef(null);
  const deviceIdRef = useRef(null);
  const queueRef = useRef(queue);
  const sessionRef = useRef(session);
  const currentTrackRef = useRef(currentTrack);
  const isPlayingRef = useRef(isPlaying);
  const lastPlayerStateRef = useRef(null);
  const advancingRef = useRef(false);
  queueRef.current = queue;
  sessionRef.current = session;
  currentTrackRef.current = currentTrack;
  isPlayingRef.current = isPlaying;
  const canControl = session?.role === "host" || session?.role === "cohost";
  const isHost = session?.role === "host";

  async function completeSpotifyLogin(code, state) {
    const savedState = localStorage.getItem("spotibox:spotify-state");
    const codeVerifier = localStorage.getItem("spotibox:spotify-verifier");
    if (!code || state !== savedState || !codeVerifier) {
      setStatus("Spotify login expired. Please connect again.");
      return;
    }
    const response = await fetch("/api/spotify/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, codeVerifier, redirectUri: getSpotifyRedirectUri() }),
    });
    const data = await response.json();
    if (!response.ok || !data.access_token) throw new Error(data.error || "Spotify login failed.");
    sessionStorage.setItem(`spotibox:spotify-token:${roomCode}`, data.access_token);
    setToken(data.access_token);
    localStorage.removeItem("spotibox:spotify-state");
    localStorage.removeItem("spotibox:spotify-verifier");
  }

  useEffect(() => {
    const storedToken = sessionStorage.getItem(`spotibox:spotify-token:${roomCode}`);
    if (storedToken) setToken(storedToken);
    function handleSpotifyCallback(event) {
      if (event.origin !== window.location.origin || event.data?.type !== "spotibox-spotify-callback") return;
      if (event.data.error) {
        setStatus("Spotify connection was cancelled.");
        return;
      }
      completeSpotifyLogin(event.data.code, event.data.state).catch(() => setStatus("Spotify could not connect."));
    }
    window.addEventListener("message", handleSpotifyCallback);
    return () => window.removeEventListener("message", handleSpotifyCallback);
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
      .on("broadcast", { event: "spotify-token-request" }, () => {
        if (isHost && token) {
          channel.send({ type: "broadcast", event: "spotify-token", payload: { token } });
        }
      })
      .on("broadcast", { event: "track-state-request" }, () => {
        if (isHost && currentTrackRef.current) {
          channel.send({ type: "broadcast", event: "track-state", payload: { track: currentTrackRef.current, isPlaying: isPlayingRef.current } });
        }
      })
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
      .subscribe(() => {
        channel.send({ type: "broadcast", event: "queue-request", payload: {} });
        if (!isHost) {
          channel.send({ type: "broadcast", event: "spotify-token-request", payload: {} });
          channel.send({ type: "broadcast", event: "track-state-request", payload: {} });
        }
      });
    return () => { channelRef.current = null; supabase.removeChannel(channel); };
  }, [isHost, roomCode]);

  useEffect(() => {
    if (!token || !isHost) return undefined;
    const script = document.createElement("script");
    script.src = "https://sdk.scdn.co/spotify-player.js";
    script.async = true;
    document.body.appendChild(script);
    window.onSpotifyWebPlaybackSDKReady = () => {
      const player = new window.Spotify.Player({ name: "Spotibox ("+getBrowser()+")", getOAuthToken: (callback) => callback(token), volume: 0.7 });
      player.addListener("ready", ({ device_id }) => { deviceIdRef.current = device_id; });
      player.addListener("player_state_changed", (state) => {
        if (!state) return;

        const previousState = lastPlayerStateRef.current;
        const currentSdkTrack = state.track_window.current_track;
        const finishedNaturally = Boolean(
          previousState &&
          previousState.track_window.current_track?.id === currentSdkTrack?.id &&
          !previousState.paused &&
          state.paused &&
          previousState.position > 1000 &&
          state.position < 1000
        );
        lastPlayerStateRef.current = state;

        if (finishedNaturally && !advancingRef.current && queueRef.current.length > 0) {
          advancingRef.current = true;
          playNext();
          window.setTimeout(() => {
            advancingRef.current = false;
          }, 1500);
        }

        setIsPlaying(!state.paused);
        if (currentSdkTrack) {
          const track = trackForQueue(currentSdkTrack, "");
          setCurrentTrack(track);
          channelRef.current?.send({ type: "broadcast", event: "track-state", payload: { track, isPlaying: !state.paused } });
        }
      });
      player.connect();
      player.getCurrentState().then((state) => {
        if (!state?.track_window?.current_track) return;
        const track = trackForQueue(state.track_window.current_track, "");
        setCurrentTrack(track);
        setIsPlaying(!state.paused);
        channelRef.current?.send({ type: "broadcast", event: "track-state", payload: { track, isPlaying: !state.paused } });
      });
      playerRef.current = player;
    };
    return () => { playerRef.current?.disconnect(); script.remove(); };
  }, [isHost, token]);

  useEffect(() => {
    if (!isHost || !token) return undefined;
    async function syncSpotifyQueue() {
      const response = await fetch("https://api.spotify.com/v1/me/player/queue", { headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok) return;
      const data = await response.json();
      const spotifyTracks = (data.queue || [])
        .filter((track) => track.id !== currentTrackRef.current?.id)
        .map((track) => ({ ...trackForQueue(track, "Spotify"), source: "spotify" }));
      const virtualTracks = queueRef.current.filter((track) => track.source !== "spotify");
      const virtualIds = new Set(virtualTracks.map((track) => track.id));
      const nextQueue = [...virtualTracks, ...spotifyTracks.filter((track) => !virtualIds.has(track.id))];
      setQueue(nextQueue);
      channelRef.current?.send({ type: "broadcast", event: "queue-sync", payload: { queue: nextQueue } });
    }
    syncSpotifyQueue();
    const interval = window.setInterval(syncSpotifyQueue, 10000);
    return () => window.clearInterval(interval);
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
    localStorage.setItem("spotibox:spotify-verifier", verifier);
    sha256(verifier).then((challenge) => {
      const state = randomString(16);
      localStorage.setItem("spotibox:spotify-state", state);
      const params = new URLSearchParams({ client_id: clientId, response_type: "code", redirect_uri: getSpotifyRedirectUri(), code_challenge_method: "S256", code_challenge: challenge, state, scope: SCOPES });
      const authWindow = window.open("about:blank", "_blank");
      if (!authWindow) {
        setStatus("Allow pop-ups to connect Spotify.");
        return;
      }
      authWindow.location.href = `https://accounts.spotify.com/authorize?${params}`;
      setStatus("Spotify opened in a new tab.");
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
    const nextQueue = [item, ...queueRef.current];
    setQueue(nextQueue);
    channelRef.current?.send({ type: "broadcast", event: "queue-sync", payload: { queue: nextQueue } });
    setSelectedTrack(null);
    setStatus(`${item.name} added to the queue.`);
  }

  async function loadPlaylist() {
    const playlistId = playlistIdFromInput(playlistInput);
    if (!playlistId || !token) {
      setStatus("Enter a Spotify playlist link or ID.");
      return;
    }
    setIsLoadingPlaylist(true);
    const response = await fetch(`https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=50`, { headers: { Authorization: `Bearer ${token}` } });
    const data = await response.json();
    setIsLoadingPlaylist(false);
    if (!response.ok) {
      setStatus(data.error?.message || "Unable to load playlist.");
      return;
    }
    const playlistTracks = (data.items || []).map((item) => trackForQueue(item.track, "Playlist"));
    const nextQueue = [...playlistTracks, ...queueRef.current.filter((track) => !playlistTracks.some((item) => item.id === track.id))];
    setQueue(nextQueue);
    channelRef.current?.send({ type: "broadcast", event: "queue-sync", payload: { queue: nextQueue } });
    setPlaylistInput("");
    setStatus(`${playlistTracks.length} playlist tracks loaded.`);
  }

  function moveTrack(index, direction) {
    if (!canControl || index + direction < 0 || index + direction >= queueRef.current.length) return;
    const nextQueue = [...queueRef.current];
    [nextQueue[index], nextQueue[index + direction]] = [nextQueue[index + direction], nextQueue[index]];
    setQueue(nextQueue);
    channelRef.current?.send({ type: "broadcast", event: "queue-sync", payload: { queue: nextQueue } });
  }

  const tokenReady = Boolean(token);
  return (
    <section className="jukebox" aria-label="Spotibox jukebox">
      <div className="jukebox-topline"><span>SEARCH</span><span>{tokenReady ? "SPOTIFY CONNECTED" : "SPOTIFY OFFLINE"}</span></div>
      <div className="jukebox-search-row"><input className="jukebox-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={tokenReady ? "Search Spotify tracks..." : "Connect Spotify to search"} disabled={!tokenReady} aria-label="Search Spotify tracks" />{!tokenReady && isHost && <button className="solid-button" type="button" onClick={connectSpotify}>Connect Spotify</button>}</div>
      {isHost && tokenReady && <div className="playlist-loader"><input className="jukebox-search" value={playlistInput} onChange={(event) => setPlaylistInput(event.target.value)} placeholder="Start with a Spotify playlist link" aria-label="Spotify playlist link" /><button className="solid-button" type="button" onClick={loadPlaylist} disabled={isLoadingPlaylist}>{isLoadingPlaylist ? "Loading..." : "Load playlist"}</button></div>}
      {status && <p className="jukebox-status">{status}</p>}
      {isSearching && <p className="jukebox-hint">Searching...</p>}
      {results.length > 0 && <div className="search-results">{results.map((track) => <button className="search-result" type="button" key={track.id} onClick={() => setSelectedTrack(track)}><img src={track.album.images?.[2]?.url || track.album.images?.[0]?.url} alt="" /><span><strong>{track.name}</strong><small>{track.artists.map((artist) => artist.name).join(", ")} · {formatDuration(track.duration_ms)}</small></span></button>)}</div>}
      <div className="jukebox-grid"><div className="now-playing"><p className="eyebrow">NOW PLAYING</p>{currentTrack ? <><img src={currentTrack.image} alt="" /><h2>{currentTrack.name}</h2><p>{currentTrack.artist} · {formatDuration(currentTrack.durationMs)}</p></> : <div className="empty-record">No record on the turntable.</div>}<div className="player-controls"><button type="button" disabled={!canControl} onClick={() => sendCommand("previous")} aria-label="Rewind" title="Rewind">|&lt;</button><button type="button" disabled={!canControl} onClick={() => sendCommand(isPlaying ? "pause" : "play")} aria-label={isPlaying ? "Pause" : "Play"} title={isPlaying ? "Pause" : "Play"}>{isPlaying ? "||" : ">"}</button><button type="button" disabled={!canControl} onClick={() => sendCommand("next")} aria-label="Skip" title="Skip">&gt;|</button></div>{!canControl && <p className="jukebox-hint">Host and co-hosts control playback.</p>}</div><div className="queue-panel"><div className="queue-heading"><p className="eyebrow">UP NEXT</p><span>{queue.length} {queue.length === 1 ? "record" : "records"}</span></div>{queue.length === 0 ? <div className="empty-queue">The queue is empty.<br />Be the first to pick a record.</div> : <ol>{queue.map((track, index) => <li key={`${track.id}-${index}`}><img src={track.image} alt="" /><span><strong>{track.name}</strong><small>{track.artist} · {formatDuration(track.durationMs)}</small></span><em>{track.addedBy}</em>{canControl && <div className="queue-move"><button type="button" onClick={() => moveTrack(index, -1)} disabled={index === 0} aria-label="Move up" title="Move up">↑</button><button type="button" onClick={() => moveTrack(index, 1)} disabled={index === queue.length - 1} aria-label="Move down" title="Move down">↓</button></div>}</li>)}</ol>}</div></div>
      {selectedTrack && <div className="track-modal-backdrop" role="presentation" onClick={() => setSelectedTrack(null)}><div className="track-modal" role="dialog" aria-modal="true" aria-labelledby="track-title" onClick={(event) => event.stopPropagation()}><img src={selectedTrack.album.images?.[0]?.url} alt="" /><div><p className="eyebrow">ADD TO JUKEBOX</p><h2 id="track-title">{selectedTrack.name}</h2><p>{selectedTrack.artists.map((artist) => artist.name).join(", ")}</p><button className="solid-button" type="button" onClick={addToQueue}>Add to queue</button><button className="text-button" type="button" onClick={() => setSelectedTrack(null)}>Close</button></div></div></div>}
    </section>
  );
}