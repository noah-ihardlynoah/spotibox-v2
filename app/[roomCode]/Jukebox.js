"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "../../lib/supabase";

const SCOPES =
  "streaming user-read-email user-read-private user-read-playback-state user-read-currently-playing user-modify-playback-state";

function getBrowser() {
  if (navigator.userAgent.indexOf("Edg") !== -1) {
    return "Edge";
  } else if (navigator.userAgent.indexOf("OPR") !== -1 || navigator.userAgent.indexOf("Opera") !== -1) {
    return "Opera";
  } else if (navigator.userAgent.indexOf("Chrome") !== -1) {
    return "Chrome";
  } else if (navigator.userAgent.indexOf("MSIE") !== -1) {
    return "IE";
  } else if (navigator.userAgent.indexOf("Firefox") !== -1) {
    return "Firefox";
  } else {
    return "unknown browser";
  }
}

function getSpotifyRedirectUri() {
  return (
    process.env.NEXT_PUBLIC_SPOTIFY_REDIRECT_URI ||
    `${window.location.origin}/spotify-callback`
  );
}

function randomString(length = 64) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes))
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(0, length);
}

async function sha256(value) {
  const buffer = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return btoa(String.fromCharCode(...new Uint8Array(buffer)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function trackForQueue(track, addedBy) {
  return {
    id: track.id,
    uri: track.uri,
    name: track.name,
    artist: track.artists.map((artist) => artist.name).join(", "),
    album: track.album.name,
    image: track.album.images?.[0]?.url || "",
    durationMs: track.duration_ms || 0,
    addedBy,
    source: "virtual",
  };
}

function formatDuration(durationMs) {
  const seconds = Math.floor((durationMs || 0) / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export default function Jukebox({ roomCode, session }) {
  const [token, setToken] = useState("");
  const [search, setSearch] = useState("");
  const [results, setResults] = useState([]);
  const [selectedTrack, setSelectedTrack] = useState(null);
  const [queue, setQueue] = useState([]);
  const [playedTrackIds, setPlayedTrackIds] = useState([]);
  const [currentTrack, setCurrentTrack] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [status, setStatus] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [deletionNotice, setDeletionNotice] = useState(null);
  const channelRef = useRef(null);
  const playerRef = useRef(null);
  const deviceIdRef = useRef(null);
  const tokenRef = useRef(token);
  const queueRef = useRef(queue);
  const sessionRef = useRef(session);
  const currentTrackRef = useRef(currentTrack);
  const isPlayingRef = useRef(isPlaying);
  const lastPlayerStateRef = useRef(null);
  const advancingRef = useRef(false);
  const playedTrackIdsRef = useRef(playedTrackIds);
  const pendingUriRef = useRef(null);
  queueRef.current = queue;
  tokenRef.current = token;
  sessionRef.current = session;
  currentTrackRef.current = currentTrack;
  isPlayingRef.current = isPlaying;
  const canControl = session?.role === "host" || session?.role === "cohost";
  const isHost = session?.role === "host";

  function markTrackPlayed(track) {
    if (!track?.id || playedTrackIdsRef.current.includes(track.id)) return playedTrackIdsRef.current;
    const nextPlayedTrackIds = [...playedTrackIdsRef.current, track.id];
    playedTrackIdsRef.current = nextPlayedTrackIds;
    setPlayedTrackIds(nextPlayedTrackIds);
    return nextPlayedTrackIds;
  }

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
      body: JSON.stringify({
        code,
        codeVerifier,
        redirectUri: getSpotifyRedirectUri(),
      }),
    });
    const data = await response.json();
    if (!response.ok || !data.access_token)
      throw new Error(data.error || "Spotify login failed.");
    sessionStorage.setItem(
      `spotibox:spotify-token:${roomCode}`,
      data.access_token,
    );
    setToken(data.access_token);
    localStorage.removeItem("spotibox:spotify-state");
    localStorage.removeItem("spotibox:spotify-verifier");
  }

  useEffect(() => {
    const storedToken = sessionStorage.getItem(
      `spotibox:spotify-token:${roomCode}`,
    );
    if (storedToken) setToken(storedToken);
    function handleSpotifyCallback(event) {
      if (
        event.origin !== window.location.origin ||
        event.data?.type !== "spotibox-spotify-callback"
      )
        return;
      if (event.data.error) {
        setStatus("Spotify connection was cancelled.");
        return;
      }
      completeSpotifyLogin(event.data.code, event.data.state).catch(() =>
        setStatus("Spotify could not connect."),
      );
    }
    window.addEventListener("message", handleSpotifyCallback);
    return () => window.removeEventListener("message", handleSpotifyCallback);
  }, [roomCode]);

  useEffect(() => {
    if (isHost && token) {
      channelRef.current?.send({
        type: "broadcast",
        event: "spotify-token",
        payload: { token },
      });
    }
  }, [isHost, token]);

  useEffect(() => {
    const channel = supabase.channel(`jukebox:${roomCode}`);
    channelRef.current = channel;
    channel
      .on("broadcast", { event: "spotify-token" }, ({ payload }) =>
        setToken(payload.token),
      )
      .on("broadcast", { event: "spotify-token-request" }, () => {
        if (isHost && tokenRef.current) {
          channel.send({
            type: "broadcast",
            event: "spotify-token",
            payload: { token: tokenRef.current },
          });
        }
      })
      .on("broadcast", { event: "track-state-request" }, () => {
        if (isHost && currentTrackRef.current) {
          channel.send({
            type: "broadcast",
            event: "track-state",
            payload: {
              track: currentTrackRef.current,
              isPlaying: isPlayingRef.current,
              playedTrackIds: playedTrackIdsRef.current,
            },
          });
        }
      })
      .on("broadcast", { event: "queue-deleted" }, ({ payload }) => {
        setQueue((currentQueue) =>
          currentQueue.filter(
            (track) =>
              !(
                track.id === payload.trackId && track.source === payload.source
              ),
          ),
        );
        if (payload.addedBy === sessionRef.current?.name) {
          setDeletionNotice({
            trackName: payload.trackName,
            deletedBy: payload.deletedBy,
          });
        }
      })
      .on("broadcast", { event: "queue-sync" }, ({ payload }) => {
        setQueue(payload.queue || []);
        if (payload.playedTrackIds) {
          playedTrackIdsRef.current = payload.playedTrackIds;
          setPlayedTrackIds(payload.playedTrackIds);
        }
      })
      .on("broadcast", { event: "queue-request" }, () => {
        if (isHost)
          channel.send({
            type: "broadcast",
            event: "queue-sync",
            payload: { queue: queueRef.current, playedTrackIds: playedTrackIdsRef.current },
          });
      })
      .on("broadcast", { event: "player-command" }, ({ payload }) => {
        if (!isHost || !playerRef.current) return;
        if (payload.action === "play") playerRef.current.resume();
        if (payload.action === "pause") playerRef.current.pause();
        if (payload.action === "next") playNext();
        if (payload.action === "previous") playerRef.current.seek(0);
      })
      .on("broadcast", { event: "track-state" }, ({ payload }) => {
        setCurrentTrack(payload.track || null);
        setIsPlaying(Boolean(payload.isPlaying));
        if (payload.playedTrackIds) {
          playedTrackIdsRef.current = payload.playedTrackIds;
          setPlayedTrackIds(payload.playedTrackIds);
        }
      })
      .subscribe(() => {
        channel.send({
          type: "broadcast",
          event: "queue-request",
          payload: {},
        });
        if (!isHost) {
          channel.send({
            type: "broadcast",
            event: "spotify-token-request",
            payload: {},
          });
          channel.send({
            type: "broadcast",
            event: "track-state-request",
            payload: {},
          });
        }
      });
    return () => {
      channelRef.current = null;
      supabase.removeChannel(channel);
    };
  }, [isHost, roomCode]);

  useEffect(() => {
    if (!token || !isHost) return undefined;
    const script = document.createElement("script");
    script.src = "https://sdk.scdn.co/spotify-player.js";
    script.async = true;
    document.body.appendChild(script);
    window.onSpotifyWebPlaybackSDKReady = () => {
      const player = new window.Spotify.Player({
        name: "Spotibox (" + getBrowser() + ")",
        getOAuthToken: (callback) => callback(token),
        volume: 0.7,
      });
      player.addListener("ready", ({ device_id }) => {
        deviceIdRef.current = device_id;
      });
      player.addListener("player_state_changed", (state) => {
        if (!state) return;

        const previousState = lastPlayerStateRef.current;
        const currentSdkTrack = state.track_window.current_track;
        const previousSdkTrack = previousState?.track_window?.current_track;
        const trackChanged = Boolean(
          previousState && currentSdkTrack?.id !== previousSdkTrack?.id,
        );
        const finishedNaturally = Boolean(
          previousState &&
          previousSdkTrack?.id === currentSdkTrack?.id &&
          !previousState.paused &&
          state.paused &&
          previousState.position > 1000 &&
          state.position < 1000,
        );
        lastPlayerStateRef.current = state;

        // Spotify's device sometimes auto-advances on its own (into its
        // native queue, or whatever it had lined up) instead of waiting
        // for our explicit next-track command. Every time the SDK reports
        // a new track, re-check the *live* queue: if it wasn't the track
        // we just told it to play and a jukebox request is still waiting,
        // override immediately so priority requests always win.
        if (trackChanged && currentSdkTrack) {
          const commandedThisTrack =
            pendingUriRef.current && currentSdkTrack.uri === pendingUriRef.current;
          pendingUriRef.current = null;
          const priorityTrackWaiting = queueRef.current.some(
            (track) => track.source !== "spotify",
          );
          if (!commandedThisTrack && priorityTrackWaiting && !advancingRef.current) {
            advancingRef.current = true;
            playNext();
            window.setTimeout(() => {
              advancingRef.current = false;
            }, 1500);
            return;
          }
        }

        if (
          finishedNaturally &&
          !advancingRef.current &&
          queueRef.current.length > 0
        ) {
          advancingRef.current = true;
          playNext();
          window.setTimeout(() => {
            advancingRef.current = false;
          }, 1500);
        }

        setIsPlaying(!state.paused);
        if (currentSdkTrack) {
          const track = trackForQueue(currentSdkTrack, "");
          const nextPlayedTrackIds = markTrackPlayed(track);
          setCurrentTrack(track);
          channelRef.current?.send({
            type: "broadcast",
            event: "track-state",
            payload: { track, isPlaying: !state.paused, playedTrackIds: nextPlayedTrackIds },
          });
        }
      });
      player.connect();
      player.getCurrentState().then((state) => {
        if (!state?.track_window?.current_track) return;
        const track = trackForQueue(state.track_window.current_track, "");
        const nextPlayedTrackIds = markTrackPlayed(track);
        setCurrentTrack(track);
        setIsPlaying(!state.paused);
        channelRef.current?.send({
          type: "broadcast",
          event: "track-state",
          payload: { track, isPlaying: !state.paused, playedTrackIds: nextPlayedTrackIds },
        });
      });
      playerRef.current = player;
    };
    return () => {
      playerRef.current?.disconnect();
      script.remove();
    };
  }, [isHost, token]);

  useEffect(() => {
    if (!isHost || !token) return undefined;
    async function syncSpotifyQueue() {
      const response = await fetch(
        "https://api.spotify.com/v1/me/player/queue",
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!response.ok) return;
      const data = await response.json();
      const spotifyTracks = (data.queue || [])
        .filter((track) => track.id !== currentTrackRef.current?.id)
        .map((track) => ({
          ...trackForQueue(track, "Spotify"),
          source: "spotify",
        }));
      const virtualTracks = queueRef.current.filter(
        (track) => track.source !== "spotify",
      );
      const virtualIds = new Set(virtualTracks.map((track) => track.id));
      const nextQueue = [
        ...virtualTracks,
        ...spotifyTracks.filter((track) => !virtualIds.has(track.id)),
      ];
      setQueue(nextQueue);
      channelRef.current?.send({
        type: "broadcast",
        event: "queue-sync",
        payload: { queue: nextQueue },
      });
    }
    syncSpotifyQueue();
    const interval = window.setInterval(syncSpotifyQueue, 10000);
    return () => window.clearInterval(interval);
  }, [isHost, token]);

  useEffect(() => {
    if (!search.trim() || !token) {
      setResults([]);
      return undefined;
    }
    const timer = setTimeout(async () => {
      setIsSearching(true);
      const response = await fetch(
        `/api/spotify/search?q=${encodeURIComponent(search)}&token=${encodeURIComponent(token)}`,
      );
      const data = await response.json();
      setResults(data.tracks?.items || []);
      setIsSearching(false);
    }, 350);
    return () => clearTimeout(timer);
  }, [search, token]);

  function connectSpotify() {
    const clientId = process.env.NEXT_PUBLIC_SPOTIFY_CLIENT_ID;
    if (!clientId) {
      setStatus("Add NEXT_PUBLIC_SPOTIFY_CLIENT_ID to connect Spotify.");
      return;
    }
    const verifier = randomString();
    localStorage.setItem("spotibox:spotify-verifier", verifier);
    sha256(verifier).then((challenge) => {
      const state = randomString(16);
      localStorage.setItem("spotibox:spotify-state", state);
      const params = new URLSearchParams({
        client_id: clientId,
        response_type: "code",
        redirect_uri: getSpotifyRedirectUri(),
        code_challenge_method: "S256",
        code_challenge: challenge,
        state,
        scope: SCOPES,
      });
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
    } else
      channelRef.current?.send({
        type: "broadcast",
        event: "player-command",
        payload: { action },
      });
  }

  function playNext() {
    // Always re-read the live queue right when we need it, not a stale
    // snapshot — external edits from any client (add/delete/reorder) or
    // Spotify's own device jumping ahead are respected either way. The
    // jukebox (priority) queue always wins over Spotify's own queue.
    const currentQueue = queueRef.current;
    const priorityIndex = currentQueue.findIndex(
      (track) => track.source !== "spotify",
    );
    const spotifyIndex = currentQueue.findIndex(
      (track) => track.source === "spotify",
    );
    const nextIndex = priorityIndex >= 0 ? priorityIndex : spotifyIndex;

    if (nextIndex < 0) {
      pendingUriRef.current = null;
      return;
    }

    const nextTrack = currentQueue[nextIndex];
    const nextQueue = currentQueue.filter((_, index) => index !== nextIndex);
    setQueue(nextQueue);
    channelRef.current?.send({
      type: "broadcast",
      event: "queue-sync",
      payload: { queue: nextQueue },
    });
    if (nextTrack && deviceIdRef.current) {
      pendingUriRef.current = nextTrack.uri;
      fetch(
        `https://api.spotify.com/v1/me/player/play?device_id=${deviceIdRef.current}`,
        {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${tokenRef.current}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ uris: [nextTrack.uri] }),
        },
      );
    }
  }

  function addToQueue() {
    const item = trackForQueue(selectedTrack, session?.name || "Guest");
    const currentQueue = queueRef.current;
    // Insert after the last priority (non-Spotify) track so new requests
    // land at the bottom of the jukebox queue, chronological order —
    // but still ahead of any Spotify-sourced tracks.
    let insertAt = 0;
    for (let i = 0; i < currentQueue.length; i += 1) {
      if (currentQueue[i].source !== "spotify") insertAt = i + 1;
    }
    const nextQueue = [
      ...currentQueue.slice(0, insertAt),
      item,
      ...currentQueue.slice(insertAt),
    ];
    setQueue(nextQueue);
    channelRef.current?.send({
      type: "broadcast",
      event: "queue-sync",
      payload: { queue: nextQueue },
    });
    setSelectedTrack(null);
    setStatus(`${item.name} added to the queue.`);
  }


  function moveTrack(index, direction) {
    if (
      !canControl ||
      index + direction < 0 ||
      index + direction >= queueRef.current.length
    )
      return;
    const nextQueue = [...queueRef.current];
    [nextQueue[index], nextQueue[index + direction]] = [
      nextQueue[index + direction],
      nextQueue[index],
    ];
    setQueue(nextQueue);
    channelRef.current?.send({
      type: "broadcast",
      event: "queue-sync",
      payload: { queue: nextQueue },
    });
  }

  function deleteQueueTrack(track) {
    if (!canControl) return;
    const nextQueue = queueRef.current.filter(
      (item) => !(item.id === track.id && item.source === track.source),
    );
    setQueue(nextQueue);
    channelRef.current?.send({
      type: "broadcast",
      event: "queue-sync",
      payload: { queue: nextQueue },
    });
    channelRef.current?.send({
      type: "broadcast",
      event: "queue-deleted",
      payload: {
        trackId: track.id,
        trackName: track.name,
        source: track.source,
        addedBy: track.addedBy,
        deletedBy: session?.name || "A host",
      },
    });
  }

  const tokenReady = Boolean(token);
  const selectedTrackIsQueued = Boolean(
    selectedTrack && queue.some((track) => track.id === selectedTrack.id),
  );
  const selectedTrackWasPlayed = Boolean(
    selectedTrack && playedTrackIds.includes(selectedTrack.id),
  );
  const selectedTrackWarning = selectedTrackWasPlayed
    ? "This song has already played in this room."
    : selectedTrackIsQueued
      ? "This song is already in the queue."
      : "";


  return (
    <section className="jukebox" aria-label="Spotibox jukebox">
      <div className="jukebox-topline">
        <span>SEARCH</span>
        <span>{tokenReady ? "SPOTIFY CONNECTED" : "SPOTIFY OFFLINE"}</span>
      </div>
      <div className="jukebox-search-row">
        <input
          className="jukebox-search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={
            tokenReady
              ? "Search Spotify tracks..."
              : "Connect Spotify to search"
          }
          disabled={!tokenReady}
          aria-label="Search Spotify tracks"
        />
        {!tokenReady && isHost && (
          <button
            className="solid-button"
            type="button"
            onClick={connectSpotify}
          >
            Connect Spotify
          </button>
        )}
      </div>
      {status && <p className="jukebox-status">{status}</p>}
      {isSearching && <p className="jukebox-hint">Searching...</p>}
      {results.length > 0 && (
        <div className="search-results">
          {results.map((track) => (
            <button
              className="search-result"
              type="button"
              key={track.id}
              onClick={() => setSelectedTrack(track)}
            >
              <img
                src={
                  track.album.images?.[2]?.url || track.album.images?.[0]?.url
                }
                alt=""
              />
              <span>
                <strong>{track.name}</strong>
                <small>
                  {track.artists.map((artist) => artist.name).join(", ")} ·{" "}
                  {formatDuration(track.duration_ms)}
                </small>
              </span>
            </button>
          ))}
        </div>
      )}
      <div className="jukebox-grid">
        <div className="now-playing">
          <p className="eyebrow">NOW PLAYING</p>
          {currentTrack ? (
            <>
              <img src={currentTrack.image} alt="" />
              <h2>{currentTrack.name}</h2>
              <p>
                {currentTrack.artist} ·{" "}
                {formatDuration(currentTrack.durationMs)}
              </p>
            </>
          ) : (
            <div className="empty-record">No record on the turntable.</div>
          )}
          <div className="player-controls">
            <button
              type="button"
              disabled={!canControl}
              onClick={() => sendCommand("previous")}
              aria-label="Rewind"
              title="Rewind"
            >
              |&lt;
            </button>
            <button
              type="button"
              disabled={!canControl}
              onClick={() => sendCommand(isPlaying ? "pause" : "play")}
              aria-label={isPlaying ? "Pause" : "Play"}
              title={isPlaying ? "Pause" : "Play"}
            >
              {isPlaying ? "||" : ">"}
            </button>
            <button
              type="button"
              disabled={!canControl}
              onClick={() => sendCommand("next")}
              aria-label="Skip"
              title="Skip"
            >
              &gt;|
            </button>
          </div>
          {!canControl && (
            <p className="jukebox-hint">Host and co-hosts control playback.</p>
          )}
        </div>
        <div className="queue-panel">
          <div className="queue-heading">
            <p className="eyebrow">JUKEBOX QUEUE</p>
            <span>
              {queue.filter((track) => track.source !== "spotify").length}{" "}
              priority
            </span>
          </div>
          {queue.filter((track) => track.source !== "spotify").length === 0 ? (
            <div className="empty-queue">No priority requests yet.</div>
          ) : (
            <ol>
              {queue
                .filter((track) => track.source !== "spotify")
                .map((track) => {
                  const index = queue.indexOf(track);
                  return (
                    <li key={`${track.id}-${index}`}>
                      <img src={track.image} alt="" />
                      <span>
                        <strong>{track.name}</strong>
                        <small>
                          {track.artist} · {formatDuration(track.durationMs)}
                        </small>
                      </span>
                      <em>{track.addedBy}</em>
                      {canControl && (
                        <div className="queue-move">
                          <button
                            type="button"
                            onClick={() => moveTrack(index, -1)}
                            disabled={index === 0}
                            aria-label="Move up"
                            title="Move up"
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            onClick={() => moveTrack(index, 1)}
                            disabled={index === queue.length - 1}
                            aria-label="Move down"
                            title="Move down"
                          >
                            ↓
                          </button>
                        </div>
                      )}
                      {canControl && (
                        <button
                          className="queue-delete"
                          type="button"
                          onClick={() => deleteQueueTrack(track)}
                          aria-label={`Delete ${track.name}`}
                          title="Delete song"
                        >
                          ×
                        </button>
                      )}
                    </li>
                  );
                })}
            </ol>
          )}
          <div className="spotify-queue">
            <div className="queue-heading">
              <p className="eyebrow">SPOTIFY QUEUE</p>
              <span>
                {queue.filter((track) => track.source === "spotify").length}{" "}
                tracks
              </span>
            </div>
            {queue.filter((track) => track.source === "spotify").length ===
            0 ? (
              <div className="empty-queue">
                Nothing in Spotify's queue right now.
              </div>
            ) : (
              <ol>
                {queue
                  .filter((track) => track.source === "spotify")
                  .map((track, index) => (
                    <li key={`${track.id}-spotify-${index}`}>
                      <img src={track.image} alt="" />
                      <span>
                        <strong>{track.name}</strong>
                        <small>
                          {track.artist} · {formatDuration(track.durationMs)}
                        </small>
                      </span>
                      <em>{track.addedBy}</em>
                    </li>
                  ))}
              </ol>
            )}
          </div>
        </div>
      </div>
      {deletionNotice && (
        <div className="queue-deletion-notice" role="status">
          <span>
            <strong>{deletionNotice.trackName}</strong> was removed by {deletionNotice.deletedBy}.
          </span>
          <button
            type="button"
            onClick={() => setDeletionNotice(null)}
            aria-label="Dismiss deletion notice"
            title="Dismiss"
          >
            ×
          </button>
        </div>
      )}
      {selectedTrack && (
        <div
          className="track-modal-backdrop"
          role="presentation"
          onClick={() => setSelectedTrack(null)}
        >
          <div
            className="track-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="track-title"
            onClick={(event) => event.stopPropagation()}
          >
            <img src={selectedTrack.album.images?.[0]?.url} alt="" />
            <div>
              <p className="eyebrow">ADD TO JUKEBOX</p>
              <h2 id="track-title">{selectedTrack.name}</h2>
              <p>
                {selectedTrack.artists.map((artist) => artist.name).join(", ")}
              </p>
              {selectedTrackWarning && (
                <p className="queue-warning" role="alert">
                  {selectedTrackWarning} You can still add it again.
                </p>
              )}
              <button
                className="solid-button"
                type="button"
                onClick={addToQueue}
              >
                Add to queue
              </button>
              <button
                className="text-button"
                type="button"
                onClick={() => setSelectedTrack(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
