// Sound sample: record a short sound from the microphone and turn it into a
// convolution impulse, so the synth plays "through" that sound (a tapped glass
// makes it ring like glass, a sung vowel gives it that vowel's colour).
//
// The mic is only open for the capture itself. On iPhone an open mic switches
// audio into call mode (quieter, sometimes to the earpiece), so it's released
// straight away and the normal playback mode is asked for again.
import { audioContext, muteSpeaker, unlockAudio } from "./engine.js";

export const MAX_SECONDS = 2;

let capture = null; // { stop() } while recording

export const isCapturing = () => !!capture;

/** Stop a capture early (the sound so far is kept). */
export function stopCapture() { if (capture) capture.stop(); }

/**
 * Record up to MAX_SECONDS from the mic. Resolves to { buffer, peaks } where
 * buffer is the cleaned-up impulse and peaks is a small envelope for drawing.
 * Errors are thrown with a message meant for the user.
 * @param onTick  called with elapsed seconds while recording
 */
export async function recordSample(onTick = () => {}) {
  if (capture) throw new Error("Already recording a sample.");
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !window.MediaRecorder)
    throw new Error("This browser can't record from the microphone.");
  const ac = audioContext();
  try { if (navigator.audioSession) navigator.audioSession.type = "play-and-record"; } catch (e) {}
  let stream;
  try {
    // Raw sound: phone voice processing would strip out exactly the character we want
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 },
      video: false,
    });
  } catch (e) {
    unlockAudio(); // back to playback mode
    const n = e && e.name;
    throw new Error(n === "NotAllowedError" || n === "SecurityError"
      ? "Microphone permission was refused. Allow the microphone for this site, then try again."
      : n === "NotFoundError" ? "No microphone was found." : "The microphone couldn't start" + (n ? ` (${n})` : "") + ".");
  }

  muteSpeaker(true); // so the mic doesn't record the synth and beat
  let blob;
  try {
    blob = await new Promise((resolve, reject) => {
      const rec = new MediaRecorder(stream), chunks = [];
      rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
      rec.onerror = e => reject(e.error || new Error("Recording failed"));
      rec.onstop = () => resolve(new Blob(chunks, { type: rec.mimeType }));
      const t0 = performance.now();
      const timer = setInterval(() => {
        const s = (performance.now() - t0) / 1000;
        onTick(Math.min(s, MAX_SECONDS));
        if (s >= MAX_SECONDS + 0.15) stop(); // a little extra: the start is trimmed anyway
      }, 100);
      const stop = () => { clearInterval(timer); if (rec.state !== "inactive") rec.stop(); };
      capture = { stop };
      rec.start();
    });
  } finally {
    capture = null;
    stream.getTracks().forEach(t => t.stop()); // release the mic right away
    muteSpeaker(false);
    unlockAudio(); // ask for normal playback mode again (iPhone)
  }

  let raw;
  try { raw = await ac.decodeAudioData(await blob.arrayBuffer()); }
  catch (e) { throw new Error("The recording couldn't be read. Try again."); }
  return prepare(raw, ac);
}

/**
 * Raw recording -> impulse: mono, start trimmed to the first sound, at most
 * MAX_SECONDS, lows below 120 Hz removed (they turn to mud), short fade-in
 * and a smooth fade-out so it doesn't end with a click.
 */
async function prepare(raw, ac) {
  const sr = raw.sampleRate, n = raw.length;
  const mono = new Float32Array(n);
  for (let ch = 0; ch < raw.numberOfChannels; ch++) {
    const d = raw.getChannelData(ch);
    for (let i = 0; i < n; i++) mono[i] += d[i] / raw.numberOfChannels;
  }
  let peak = 0; for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(mono[i]));
  if (peak < 0.003) throw new Error("That was too quiet to use. Try again closer to the microphone.");

  let start = 0; while (start < n && Math.abs(mono[start]) < peak * 0.05) start++;
  start = Math.max(0, start - Math.round(sr * 0.005));
  let end = Math.min(n, start + Math.round(sr * MAX_SECONDS));
  while (end > start + 1 && Math.abs(mono[end - 1]) < peak * 0.01) end--;
  const len = Math.max(Math.round(sr * 0.05), end - start);

  // High-pass at 120 Hz, rendered offline
  const off = new OfflineAudioContext(1, len, sr);
  const src = off.createBuffer(1, len, sr);
  src.getChannelData(0).set(mono.subarray(start, start + len));
  const node = off.createBufferSource(); node.buffer = src;
  const hp = off.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 120; hp.Q.value = 0.7;
  node.connect(hp); hp.connect(off.destination); node.start();
  const rendered = await off.startRendering();

  const d = rendered.getChannelData(0);
  const fadeIn = Math.round(sr * 0.003), fadeOut = Math.round(len * 0.2);
  for (let i = 0; i < fadeIn && i < len; i++) d[i] *= i / fadeIn;
  for (let i = 0; i < fadeOut; i++) d[len - 1 - i] *= 0.5 - 0.5 * Math.cos(Math.PI * i / fadeOut);

  // Copy into a buffer of the live context (sample rates can differ from the mic's)
  const buffer = ac.createBuffer(1, len, sr);
  buffer.getChannelData(0).set(d);
  return { buffer, peaks: envelope(d, 64) };
}

/** Peak level in `bins` slices, 0..1, for drawing the sample. */
function envelope(d, bins) {
  const out = [], step = d.length / bins; let max = 0;
  for (let b = 0; b < bins; b++) {
    let p = 0; for (let i = Math.floor(b * step); i < Math.floor((b + 1) * step); i++) p = Math.max(p, Math.abs(d[i]));
    out.push(p); max = Math.max(max, p);
  }
  return out.map(p => p / (max || 1));
}
