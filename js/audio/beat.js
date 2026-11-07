// Looping drum beats under the synth.
//
// Tempo works like a sampler or turntable: the loop plays faster or slower and
// its pitch moves with it. Loop points are worked out from each beat's tempo and
// bar count, starting where the sound actually begins. MP3 files carry a few
// tens of ms of encoder padding at the start and end; Chrome keeps it and
// Safari strips it, so the start is found after decoding rather than hard-coded.
import { beatOutput } from "./engine.js";

export const BEATS = {
  I:   { name: "Straight techno", url: "assets/beats/straight-techno-beat.mp3", bpm: 124, bars: 1, gain: 0.4 },
  II:  { name: "Electro loop",    url: "assets/beats/electro-loop-110-bpm.mp3", bpm: 110, bars: 4, gain: 0.7 },
  III: { name: "Amen break",      url: "assets/beats/amen140bpm.mp3",           bpm: 140, bars: 4, gain: 0.65 },
};
// gain evens out the files' loudness (the techno loop is ~5 dB hotter) and sits them under the synth

const FADE = 0.03; // seconds; avoids clicks when starting, stopping or switching
const buffers = new Map(); // id -> Promise<{ buffer, start, end }>

function load(id) {
  if (!buffers.has(id)) {
    const beat = BEATS[id];
    const p = (async () => {
      const out = beatOutput();
      const res = await fetch(beat.url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buffer = await out.context.decodeAudioData(await res.arrayBuffer());
      const start = soundStart(buffer);
      const length = beat.bars * 4 * 60 / beat.bpm;
      return { buffer, start, end: Math.min(buffer.duration, start + length) };
    })();
    p.catch(() => buffers.delete(id)); // let a later tap retry
    buffers.set(id, p);
  }
  return buffers.get(id);
}

/** Seconds of near-silence before the first sound (MP3 encoder padding). */
function soundStart(buffer) {
  const sr = buffer.sampleRate, limit = Math.min(buffer.length, Math.round(sr * 0.2));
  let first = limit;
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const d = buffer.getChannelData(ch);
    for (let i = 0; i < first; i++) if (Math.abs(d[i]) > 0.002) { first = i; break; }
  }
  if (first >= limit) return 0; // quiet intro, not padding: keep it
  return Math.max(0, first - Math.round(sr * 0.001)) / sr; // keep 1 ms before the attack
}

let current = null; // { id, source, gain }
let bpm = null;     // chosen tempo, or null for each beat's own tempo
let request = 0;    // ignores loads that finish after the user moved on

export const nativeBpm = id => BEATS[id].bpm;

/** Start looping beat `id` (replacing any beat playing now). */
export async function playBeat(id) {
  const my = ++request;
  const loop = await load(id);
  if (my !== request) return;
  stopBeat(true);
  const out = beatOutput(), ac = out.context, t = ac.currentTime;
  const source = ac.createBufferSource(), gain = ac.createGain();
  source.buffer = loop.buffer;
  source.loop = true; source.loopStart = loop.start; source.loopEnd = loop.end;
  source.playbackRate.value = rateFor(id);
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(BEATS[id].gain, t + FADE);
  source.connect(gain); gain.connect(out);
  source.start(t, loop.start);
  current = { id, source, gain };
}

/** Fade out and stop whatever beat is playing. */
export function stopBeat(keepRequest) {
  if (!keepRequest) request++; // cancel a beat that's still loading
  if (!current) return;
  const { source, gain } = current, ac = gain.context, t = ac.currentTime;
  gain.gain.cancelScheduledValues(t);
  gain.gain.setValueAtTime(gain.gain.value, t);
  gain.gain.linearRampToValueAtTime(0, t + FADE);
  try { source.stop(t + FADE + 0.01); } catch (e) {}
  source.onended = () => { try { gain.disconnect(); } catch (e) {} };
  current = null;
}

/** Set the tempo in BPM; null means each beat's own tempo. Glides if a beat is playing. */
export function setBeatTempo(newBpm) {
  bpm = newBpm;
  if (!current) return;
  const { source } = current;
  source.playbackRate.setTargetAtTime(rateFor(current.id), source.context.currentTime, 0.04);
}

function rateFor(id) { return bpm ? bpm / BEATS[id].bpm : 1; }
