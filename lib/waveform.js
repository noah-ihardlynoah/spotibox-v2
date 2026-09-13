// Derives a dense, animated "oscilloscope" style waveform (closer to the
// .||.|.||. look VLC shows) from Spotify's per-track Audio Analysis data.
//
// Spotify's Web Playback SDK does not expose raw/live audio samples, so
// this works from the closest available substitute: the currently playing
// segment's overall loudness plus its 12-value timbre vector. A single
// segment is expanded into many bars (instead of the old flat 5-value
// array) so the strip reads as a real spectrum instead of a few chunky
// blocks, and bars are weighted low/mid/high across the strip like a
// real analyzer instead of all moving in lockstep.

const DEFAULT_BAR_COUNT = 27;

function clamp(value, min = 0, max = 1) {
  return Math.max(min, Math.min(max, value));
}

// Deterministic pseudo-random offset per bar/segment so bars look varied
// across the strip but don't flicker randomly on every re-render of the
// *same* segment (Math.random() would look noisy/inconsistent).
function seededJitter(seed) {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * @param {object|null|undefined} segment - current Spotify audio-analysis segment
 * @param {number} barCount - how many bars to produce
 * @returns {number[]} values in [0, 1], one per bar
 */
export function computeWaveformBars(segment, barCount = DEFAULT_BAR_COUNT) {
  if (!segment) {
    // Idle / paused / no-data fallback: a low, gently uneven line rather
    // than a dead flat bar so it still reads as a waveform at rest.
    return Array.from({ length: barCount }, (_, i) => 0.12 + 0.05 * Math.sin(i * 0.9));
  }

  const timbre = segment.timbre || [];
  const loudness = clamp(((segment.loudness_max ?? -30) + 60) / 60);
  const seedBase = Math.floor((segment.start || 0) * 1000);

  const bass = clamp((Math.abs(timbre[1] || 0) + Math.abs(timbre[2] || 0)) / 24, 0.15);
  const mid = clamp(
    (Math.abs(timbre[4] || 0) + Math.abs(timbre[5] || 0) + Math.abs(timbre[6] || 0)) / 30,
    0.15,
  );
  const treble = clamp((Math.abs(timbre[10] || 0) + Math.abs(timbre[11] || 0)) / 20, 0.15);
  const body = clamp(loudness * 1.15, 0.15);

  return Array.from({ length: barCount }, (_, i) => {
    const t = i / (barCount - 1); // 0 -> 1 across the strip
    // Blend bass (left) -> mid (centre) -> treble (right), like a spectrum.
    const bandBlend =
      t < 0.4
        ? bass * (1 - t / 0.4) + mid * (t / 0.4)
        : t < 0.7
          ? mid
          : mid * (1 - (t - 0.7) / 0.3) + treble * ((t - 0.7) / 0.3);
    const jitter = (seededJitter(seedBase + i * 7.13) - 0.5) * 0.35;
    return clamp(body * 0.35 + bandBlend * 0.65 + jitter, 0.1, 1);
  });
}
