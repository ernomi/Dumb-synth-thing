// Shape-to-sound mapping. Pure functions, no DOM.
import { clamp, smoothstep as ss } from "./util.js";

export const SCALES = { minpent: [0,3,5,7,10], majpent: [0,2,4,7,9], major: [0,2,4,5,7,9,11], chrom: [0,1,2,3,4,5,6,7,8,9,10,11] };
const NOTE = ["C","C♯","D","D♯","E","F","F♯","G","G♯","A","A♯","B"];

// Harmonic tables, used to draw the little waveform previews
export const NH = 32;
function harmonics(kind) {
  const h = new Float32Array(NH + 1);
  if (kind === "sine") h[1] = 1;
  for (let n = 1; n <= NH; n++) {
    if (kind === "square" && n % 2) h[n] = 1 / n;
    if (kind === "triangle" && n % 2) h[n] = (((n - 1) / 2) % 2 ? -1 : 1) / (n * n);
    if (kind === "saw") h[n] = (n % 2 ? 1 : -1) / n;
  }
  return h;
}
const WAVES = { sine: harmonics("sine"), square: harmonics("square"), triangle: harmonics("triangle"), saw: harmonics("saw") };

// Order matters: weights[i] lines up with the oscillator types in audio/engine.js
export const WAVE_NAMES = ["sine", "triangle", "square", "saw"];
const LABEL = { sine: "Round", triangle: "Triangle", square: "Square", saw: "Spiky" };

/**
 * Continuous shape-to-timbre mapping. Each wave gets a weight that changes
 * smoothly with the measurements, so a squircle sits halfway between sine and
 * square instead of snapping to one bucket.
 *
 * @param f       smoothed features: circ, rect, solidity, frac, bottom, drive
 * @param count   number of voices sounding (for level balancing)
 * @param opts    { scale: keyof SCALES | "free", drive: 0..1 }
 */
export function mapObject(f, count, { scale, drive: driveAmount }) {
  const rnd = clamp((f.circ - 0.79) / 0.18, 0, 1); // linear: 0 for a square, 1 for a circle
  const sq  = ss((f.rect - 0.80) / 0.14);      // 1 when it fills its box
  const tri = ss((0.78 - f.rect) / 0.18);      // 1 when it fills half its box
  const spk = ss((0.90 - f.solidity) / 0.22);  // 1 for stars and spikes
  const rest = Math.max(0, 1 - sq - tri);
  const ang = 1 - rnd;
  const w = [rnd, ang * (tri + rest / 2), ang * (sq + rest / 2), 0].map(v => v * (1 - spk));
  w[3] = spk;
  const tot = w.reduce((x, y) => x + y, 0) || 1;
  const weights = w.map(v => v / tot);
  const order = weights.map((v, i) => [v, i]).sort((x, y) => y[0] - x[0]);
  const name = LABEL[WAVE_NAMES[order[0][1]]];
  const shown = order.filter(([v], k) => k < 2 && v >= 0.1).map(([v, i]) => `${WAVE_NAMES[i]} ${Math.round(v * 100)}%`).join(" · ");
  // size to pitch, on a log scale
  const t = clamp((Math.log(f.frac) - Math.log(0.002)) / (Math.log(0.3) - Math.log(0.002)), 0, 1);
  let midi = 86 - t * 50;
  if (scale !== "free") midi = snap(Math.round(midi), SCALES[scale]);
  const freq = 440 * Math.pow(2, (midi - 69) / 12);
  const dist = clamp(1 - (f.bottom - 0.25) / 0.75, 0, 1);
  const drive = f.drive * driveAmount;
  return {
    weights, name, shown, midi, freq, dist, drive,
    note: scale === "free" ? Math.round(freq) + " Hz" : NOTE[((Math.round(midi) % 12) + 12) % 12] + (Math.floor(Math.round(midi) / 12) - 1),
    cutoff: 700 * Math.pow(2, 4.2 * (1 - dist)),
    level: (0.32 / Math.sqrt(Math.max(1, count))) * (1 - 0.55 * dist),
    wet: 0.04 + 0.96 * dist,
    dry: 1 - 0.7 * dist,
  };
}

function snap(m, set) {
  for (let o = 0; o < 12; o++) {
    if (set.includes(((m + o) % 12 + 12) % 12)) return m + o;
    if (set.includes(((m - o) % 12 + 12) % 12)) return m - o;
  }
  return m;
}

// Harmonic spectrum of a voice's blended waveform
export function blend(p) {
  const h = new Float32Array(NH + 1);
  WAVE_NAMES.forEach((k, i) => { const src = WAVES[k]; for (let n = 0; n <= NH; n++) h[n] += p.weights[i] * src[n]; });
  return h;
}
