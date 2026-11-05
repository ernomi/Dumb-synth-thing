// Shape detection on raw RGBA pixels. Pure functions, no DOM, so this module
// can run in a Web Worker, in Node tests, or inside a native wrapper.
//
// Two detectors run side by side:
//  - contrast: Otsu threshold, for objects darker or lighter than the background
//  - outlines: Sobel edges, then every region fully enclosed by edges, which finds
//    same-colored objects with visible outlines (a white switch on a white wall)
// Duplicates and nested regions are merged, keeping the larger shape.
import { pointInPoly, morphMask, convexHull, perimeter, polyArea, minRectArea } from "./geometry.js";
import { colorInfo } from "./color.js";

export const MAX_VOICES = 5;

/**
 * @param {Uint8ClampedArray} d  RGBA pixels
 * @param {number} W
 * @param {number} H
 * @param {"auto"|"outline"|"dark"|"light"} mode
 */
export function analyzePixels(d, W, H, mode) {
  const N = W * H, gray = new Uint8Array(N);
  for (let i = 0; i < N; i++) gray[i] = (d[i*4] * 0.299 + d[i*4+1] * 0.587 + d[i*4+2] * 0.114) | 0;
  const b = new Uint8Array(N);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let s = 0, n = 0;
    for (let dy = -1; dy <= 1; dy++) { const yy = y + dy; if (yy < 0 || yy >= H) continue;
      for (let dx = -1; dx <= 1; dx++) { const xx = x + dx; if (xx < 0 || xx >= W) continue; s += gray[yy*W+xx]; n++; } }
    b[y*W+x] = s / n;
  }
  let cands = [];
  if (mode !== "outline") cands = cands.concat(contrastObjects(b, d, W, H, mode));
  if (mode === "auto" || mode === "outline") cands = cands.concat(outlineObjects(b, d, W, H));
  cands.sort((p, q) => q.area - p.area);
  const kept = [];
  for (const c of cands) {
    if (kept.length >= MAX_VOICES) break;
    const pt = [c.cx * W, c.cy * H];
    if (kept.some(k => pointInPoly(pt, k.hull))) continue; // same object or nested inside one
    kept.push(c);
  }
  // Whole-frame color: warm scenes > 0, cool scenes < 0, grey or white about 0
  let sr = 0, sg = 0, sb = 0;
  for (let i = 0; i < N; i++) { sr += d[i*4]; sg += d[i*4+1]; sb += d[i*4+2]; }
  const scene = colorInfo(sr / N, sg / N, sb / N);
  scene.tone = Math.max(-1, Math.min(1, (scene.warmth * 2 - 1) * Math.min(1, scene.sat * 2.5)));
  return { W, H, objects: kept, scene };
}

function contrastObjects(b, d, W, H, mode) {
  const N = W * H, hist = new Float64Array(256); let mn = 255, mx = 0;
  for (let i = 0; i < N; i++) { hist[b[i]]++; if (b[i] < mn) mn = b[i]; if (b[i] > mx) mx = b[i]; }
  if (mx - mn < 28) return [];
  let sum = 0; for (let t = 0; t < 256; t++) sum += t * hist[t];
  let sumB = 0, wB = 0, best = 0, thr = 127;
  for (let t = 0; t < 256; t++) {
    wB += hist[t]; if (!wB) continue; const wF = N - wB; if (!wF) break;
    sumB += t * hist[t]; const mB = sumB / wB, mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > best) { best = between; thr = t; }
  }
  let mask = new Uint8Array(N), dark = 0;
  for (let i = 0; i < N; i++) if (b[i] <= thr) { mask[i] = 1; dark++; }
  const invert = mode === "light" || (mode === "auto" && dark > N / 2);
  if (invert) for (let i = 0; i < N; i++) mask[i] ^= 1;
  mask = morphMask(morphMask(mask, W, H, false), W, H, true);
  return components(mask, d, W, H, 0, 0.003);
}

function outlineObjects(b, d, W, H) {
  const N = W * H, mag = new Float32Array(N);
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    const i = y * W + x;
    const gx = -b[i-W-1] - 2*b[i-1] - b[i+W-1] + b[i-W+1] + 2*b[i+1] + b[i+W+1];
    const gy = -b[i-W-1] - 2*b[i-W] - b[i-W+1] + b[i+W-1] + 2*b[i+W] + b[i+W+1];
    mag[i] = Math.hypot(gx, gy);
  }
  const sorted = Float32Array.from(mag).sort();
  const thr = Math.max(36, 0.25 * sorted[Math.floor(N * 0.99)]);
  let edge = new Uint8Array(N);
  for (let i = 0; i < N; i++) if (mag[i] > thr) edge[i] = 1;
  edge = morphMask(edge, W, H, true); // close small gaps in outlines
  // flood the background from the frame border; what it can't reach is enclosed
  const bg = new Uint8Array(N), stack = new Int32Array(N); let sp = 0;
  const push = i => { if (!edge[i] && !bg[i]) { bg[i] = 1; stack[sp++] = i; } };
  for (let x = 0; x < W; x++) { push(x); push((H - 1) * W + x); }
  for (let y = 0; y < H; y++) { push(y * W); push(y * W + W - 1); }
  while (sp) {
    const p = stack[--sp], x = p % W, y = (p / W) | 0;
    if (x > 0) push(p - 1); if (x < W - 1) push(p + 1); if (y > 0) push(p - W); if (y < H - 1) push(p + W);
  }
  const inside = new Uint8Array(N);
  for (let i = 0; i < N; i++) if (!edge[i] && !bg[i]) inside[i] = 1;
  return components(inside, d, W, H, 1.5, 0.004); // grow back out to the middle of the outline
}

function components(mask, d, W, H, grow, minFrac) {
  const N = W * H, lab = new Int32Array(N), stack = new Int32Array(N);
  const out = []; let cur = 0;
  for (let s = 0; s < N; s++) {
    if (!mask[s] || lab[s]) continue;
    cur++; let sp = 0; stack[sp++] = s; lab[s] = cur;
    const pix = [];
    while (sp) {
      const p = stack[--sp]; pix.push(p);
      const x = p % W, y = (p / W) | 0;
      if (x > 0 && mask[p-1] && !lab[p-1]) { lab[p-1] = cur; stack[sp++] = p-1; }
      if (x < W-1 && mask[p+1] && !lab[p+1]) { lab[p+1] = cur; stack[sp++] = p+1; }
      if (y > 0 && mask[p-W] && !lab[p-W]) { lab[p-W] = cur; stack[sp++] = p-W; }
      if (y < H-1 && mask[p+W] && !lab[p+W]) { lab[p+W] = cur; stack[sp++] = p+W; }
    }
    if (pix.length < N * minFrac) continue;
    let x0 = W, x1 = 0, y0 = H, y1 = 0, r = 0, g = 0, bl = 0;
    const pts = [];
    for (const p of pix) {
      const x = p % W, y = (p / W) | 0;
      r += d[p*4]; g += d[p*4+1]; bl += d[p*4+2];
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      const e = x === 0 || y === 0 || x === W-1 || y === H-1 || lab[p-1] !== cur || lab[p+1] !== cur || lab[p-W] !== cur || lab[p+W] !== cur;
      if (e) pts.push([x - grow, y - grow], [x + 1 + grow, y - grow], [x - grow, y + 1 + grow], [x + 1 + grow, y + 1 + grow]);
    }
    if ((x1 - x0) > W * 0.92 || (y1 - y0) > H * 0.92) continue;
    // fill holes: count bbox pixels the outside can't reach (a ring counts as a disc)
    const bw = x1 - x0 + 3, bh = y1 - y0 + 3, loc = new Uint8Array(bw * bh), st = [];
    for (const p of pix) loc[((p / W | 0) - y0 + 1) * bw + (p % W - x0 + 1)] = 1;
    loc[0] = 2; st.push(0); let outside = 1;
    while (st.length) {
      const q = st.pop(), qx = q % bw, qy = (q / bw) | 0;
      for (const n of [qx > 0 ? q - 1 : -1, qx < bw - 1 ? q + 1 : -1, qy > 0 ? q - bw : -1, qy < bh - 1 ? q + bw : -1])
        if (n >= 0 && !loc[n]) { loc[n] = 2; outside++; st.push(n); }
    }
    const filled = bw * bh - outside;
    const hull = convexHull(pts);
    const P = perimeter(hull), HA = polyArea(hull);
    const area = grow ? filled + Math.max(0, P - 2 * Math.PI * grow) * grow + Math.PI * grow * grow : filled;
    if (area > N * 0.45) continue;
    const n = pix.length;
    let cx = 0, cy = 0; for (const q of hull) { cx += q[0]; cy += q[1]; }
    const col = colorInfo(r / n, g / n, bl / n);
    out.push({
      area, frac: area / N, cx: cx / hull.length / W, cy: cy / hull.length / H, bottom: Math.min(1, (y1 + 1 + grow) / H), hull,
      circ: Math.min(1, 4 * Math.PI * area / (P * P)),
      solidity: Math.min(1, area / Math.max(1, HA)),
      rect: Math.min(1, area / minRectArea(hull)), // square ≈ 1, circle ≈ 0.79, triangle ≈ 0.5
      ...col,
    });
  }
  return out;
}
