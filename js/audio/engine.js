// Web Audio synth engine.
//
// Each voice: one pitch source drives four phase-locked oscillators
// (sine, triangle, square, saw). The shape crossfades their gains, so the
// waveform morphs without ever being swapped mid-cycle (the old crackle).
// Then: low-pass filter -> level -> envelope -> dry + reverb send.
//
// The engine does not touch the page. Settings come in through configureAudio().
import { clamp } from "../util.js";
import { requestPlaybackSession, unlockContext } from "./unlock.js";

const TYPES = ["sine", "triangle", "square", "sawtooth"]; // matches WAVE_NAMES in mapping.js
const TRIM = { sine: 1, triangle: 1, square: 0.55, sawtooth: 0.7 }; // even out loudness

let ac = null, master, reverb, analyser, playing = false;
const voices = new Map();
const eq = {};
let sceneTone = 0;
let currentTracks = [];

let getSettings = () => ({ volume: 0.7, attack: 0.3, release: 0.8, morph: 1.5, tone: 1 });
let onPaused = () => {};

/**
 * @param opts.getSettings  () => { volume, attack, release, morph, tone }
 * @param opts.onPaused     called when the OS has suspended audio while playing
 */
export function configureAudio(opts) {
  if (opts.getSettings) getSettings = opts.getSettings;
  if (opts.onPaused) onPaused = opts.onPaused;
}

export const isPlaying = () => playing;
export const needsUnlock = () => playing && ac && ac.state !== "running";
/** The analyser node for the scope, or null when silent. */
export const getAnalyser = () => (ac && playing ? analyser : null);

export function setPlaying(on) {
  playing = on;
  if (on) syncVoices(currentTracks); else stopAll();
}

export function setVolume(v) {
  if (master) master.gain.setTargetAtTime(v, ac.currentTime, 0.05);
}

// Runs at the start of every tap.
export function unlockAudio() {
  requestPlaybackSession();
  initAudio();
  unlockContext(ac);
}

export function audioCheck() {
  if (!ac || !playing) return;
  if (ac.state !== "running") onPaused();
}

function initAudio() {
  if (ac) return;
  ac = new (window.AudioContext || window.webkitAudioContext)();
  ac.onstatechange = () => { audioCheck(); if (ac.state === "running" && playing) syncVoices(currentTracks); };
  master = ac.createGain(); master.gain.value = getSettings().volume;
  const limiter = ac.createDynamicsCompressor();
  limiter.threshold.value = -8; limiter.knee.value = 6; limiter.ratio.value = 16;
  limiter.attack.value = 0.005; limiter.release.value = 0.25;
  analyser = ac.createAnalyser(); analyser.fftSize = 2048;
  reverb = ac.createConvolver(); reverb.buffer = impulse(3.4);
  const revIn = ac.createBiquadFilter(); revIn.type = "highpass"; revIn.frequency.value = 180;
  revIn.connect(reverb); reverb.connect(master); reverb.input = revIn;
  // Scene tone EQ: low-mid boost for warm scenes; treble lift and mid scoop for cool ones
  const dc = ac.createBiquadFilter(); dc.type = "highpass"; dc.frequency.value = 25; dc.Q.value = 0.7;
  eq.lowMid = ac.createBiquadFilter(); eq.lowMid.type = "peaking"; eq.lowMid.frequency.value = 280; eq.lowMid.Q.value = 0.9;
  eq.scoop = ac.createBiquadFilter(); eq.scoop.type = "peaking"; eq.scoop.frequency.value = 1100; eq.scoop.Q.value = 0.7;
  eq.bright = ac.createBiquadFilter(); eq.bright.type = "highshelf"; eq.bright.frequency.value = 3500;
  master.connect(dc); dc.connect(eq.lowMid); eq.lowMid.connect(eq.scoop); eq.scoop.connect(eq.bright); eq.bright.connect(limiter);
  limiter.connect(analyser); analyser.connect(ac.destination);
  applyTone(true);
}

function impulse(sec) {
  const sr = ac.sampleRate, len = Math.floor(sr * sec), buf = ac.createBuffer(2, len, sr);
  const fade = Math.floor(sr * 0.004);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.4) * Math.min(1, i / fade);
  }
  return buf;
}

function mixFor(p) { return TYPES.map((t, i) => p.weights[i] * TRIM[t]); }

// Overdrive: a tanh saturator blended in parallel with the clean signal.
// Warm-colored objects get more of it, cool ones less.
let driveCurve = null;
function curve() {
  if (driveCurve) return driveCurve;
  const n = 2048, c = new Float32Array(n), k = 4;
  for (let i = 0; i < n; i++) { const x = i / (n - 1) * 2 - 1; c[i] = Math.tanh(k * x) / Math.tanh(k); }
  return (driveCurve = c);
}
const driveMix = p => clamp(p.drive, 0, 1) * 0.6;

// Harmonic generators fed by each voice's raw oscillator mix.
// x² adds the 2nd harmonic (its DC offset is removed on the master bus);
// x³ adds the 3rd. Warm scenes get the 2nd, cool scenes the 3rd.
let h2Curve = null, h3Curve = null;
function harmCurves() {
  if (h2Curve) return;
  const n = 2049; h2Curve = new Float32Array(n); h3Curve = new Float32Array(n);
  for (let i = 0; i < n; i++) { const x = i / (n - 1) * 2 - 1; h2Curve[i] = x * x; h3Curve[i] = x * x * x; }
}

// ---------- scene tone ----------
/** Current scene tone after the user's "Scene tone" amount: -1 (cool) .. 1 (warm). */
export function toneAmount() { return clamp(sceneTone * getSettings().tone, -1, 1); }

/** Move the scene tone toward a target; k = 1 jumps, smaller values glide. */
export function setSceneTone(target, k) {
  sceneTone += k * (target - sceneTone);
  applyTone(false);
}

function toneTargets() {
  const t = toneAmount(), warm = Math.max(0, t), cool = Math.max(0, -t);
  return { h2: 0.7 * warm, h3: 1.1 * cool, lowMid: 4 * warm, scoop: -4 * cool, bright: 6 * cool };
}

export function applyTone(immediate) {
  if (!ac) return;
  const g = toneTargets(), t = ac.currentTime, tc = immediate ? 0.01 : 0.6;
  setParam(eq.lowMid.gain, g.lowMid, t, tc);
  setParam(eq.scoop.gain, g.scoop, t, tc);
  setParam(eq.bright.gain, g.bright, t, tc);
  for (const v of voices.values()) { setParam(v.h2.gain, g.h2, t, tc); setParam(v.h3.gain, g.h3, t, tc); }
}

function setParam(param, value, t, tc) {
  // Smoothly glide from wherever the parameter is now
  param.cancelScheduledValues(t);
  param.setValueAtTime(param.value, t);
  param.setTargetAtTime(value, t, tc);
}

// ---------- voices ----------
function createVoice(p) {
  const t = ac.currentTime;
  const pre = ac.createGain(), clean = ac.createGain(), shaper = ac.createWaveShaper(), dirty = ac.createGain();
  const filt = ac.createBiquadFilter(), level = ac.createGain(), envG = ac.createGain(), dry = ac.createGain(), wet = ac.createGain();
  shaper.curve = curve(); shaper.oversample = "4x";
  const m = driveMix(p); clean.gain.value = 1 - m; dirty.gain.value = m * 0.85;
  filt.type = "lowpass"; filt.Q.value = 0.5; filt.frequency.value = p.cutoff;
  level.gain.value = p.level; dry.gain.value = p.dry; wet.gain.value = p.wet;
  let pitch = null;
  if (ac.createConstantSource) { pitch = ac.createConstantSource(); pitch.offset.value = p.freq; }
  const mix = mixFor(p);
  const oscs = TYPES.map((type, i) => {
    const o = ac.createOscillator(); o.type = type;
    const g = ac.createGain(); g.gain.value = mix[i];
    if (pitch) { o.frequency.value = 0; pitch.connect(o.frequency); } else o.frequency.value = p.freq;
    o.connect(g); g.connect(pre);
    return { o, g };
  });
  pre.connect(clean); clean.connect(filt);
  pre.connect(shaper); shaper.connect(dirty); dirty.connect(filt);
  harmCurves();
  const s2 = ac.createWaveShaper(), s3 = ac.createWaveShaper(), h2 = ac.createGain(), h3 = ac.createGain();
  s2.curve = h2Curve; s3.curve = h3Curve; s2.oversample = s3.oversample = "2x";
  const tg = toneTargets(); h2.gain.value = tg.h2; h3.gain.value = tg.h3;
  pre.connect(s2); s2.connect(h2); h2.connect(filt);
  pre.connect(s3); s3.connect(h3); h3.connect(filt);
  filt.connect(level); level.connect(envG); envG.connect(dry); envG.connect(wet);
  dry.connect(master); wet.connect(reverb.input);
  // Attack: ramp up from silence
  const { attack } = getSettings();
  envG.gain.setValueAtTime(0, t);
  envG.gain.linearRampToValueAtTime(1, t + Math.max(0.01, attack));
  if (pitch) pitch.start(t);
  oscs.forEach(x => x.o.start(t));
  return { pitch, oscs, clean, dirty, h2, h3, filt, level, envG, dry, wet };
}

/** Bring the sounding voices in line with the tracks (each track has a mapped `p`). */
export function syncVoices(tracks) {
  currentTracks = tracks;
  if (!ac || !playing) return;
  const t = ac.currentTime, live = new Set(), morph = getSettings().morph / 3; // slider is roughly the time to settle
  for (const tr of tracks) {
    live.add(tr.id);
    const p = tr.p;
    const v = voices.get(tr.id);
    if (!v) { voices.set(tr.id, createVoice(p)); continue; }
    if (v.pitch) setParam(v.pitch.offset, p.freq, t, 0.08);
    else v.oscs.forEach(x => setParam(x.o.frequency, p.freq, t, 0.08));
    const mix = mixFor(p);
    v.oscs.forEach((x, i) => setParam(x.g.gain, mix[i], t, morph));
    const m = driveMix(p);
    setParam(v.clean.gain, 1 - m, t, 0.3);
    setParam(v.dirty.gain, m * 0.85, t, 0.3);
    setParam(v.filt.frequency, p.cutoff, t, 0.25);
    setParam(v.level.gain, p.level, t, 0.2);
    setParam(v.dry.gain, p.dry, t, 0.3);
    setParam(v.wet.gain, p.wet, t, 0.3);
  }
  for (const [id, v] of voices) if (!live.has(id)) releaseVoice(id, v);
}

function releaseVoice(id, v) {
  const t = ac.currentTime, rel = Math.max(0.05, getSettings().release);
  const g = v.envG.gain;
  if (g.cancelAndHoldAtTime) g.cancelAndHoldAtTime(t);
  else { const now = g.value; g.cancelScheduledValues(t); g.setValueAtTime(now, t); }
  g.linearRampToValueAtTime(0, t + rel);
  const end = t + rel + 0.05;
  v.oscs.forEach(x => { try { x.o.stop(end); } catch (e) {} });
  if (v.pitch) { try { v.pitch.stop(end); } catch (e) {} }
  setTimeout(() => { try { v.dry.disconnect(); v.wet.disconnect(); } catch (e) {} }, (rel + 0.3) * 1000);
  voices.delete(id);
}

export function stopAll() {
  if (!ac) return;
  for (const [id, v] of voices) releaseVoice(id, v);
}
