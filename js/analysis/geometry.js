// Geometry and binary-mask helpers. Pure functions, no DOM.

export function pointInPoly(pt, P) {
  let c = false;
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
    const [ax, ay] = P[i], [bx, by] = P[j];
    if ((ay > pt[1]) !== (by > pt[1]) && pt[0] < (bx - ax) * (pt[1] - ay) / (by - ay) + ax) c = !c;
  }
  return c;
}

// 3x3 erosion (dilate = false) or dilation (dilate = true) of a 0/1 mask.
export function morphMask(m, W, H, dilate) {
  const o = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let v = dilate ? 0 : 1;
    for (let dy = -1; dy <= 1 && (dilate ? !v : v); dy++) for (let dx = -1; dx <= 1; dx++) {
      const xx = x + dx, yy = y + dy;
      const s = (xx < 0 || yy < 0 || xx >= W || yy >= H) ? 0 : m[yy*W+xx];
      if (dilate && s) { v = 1; break; }
      if (!dilate && !s) { v = 0; break; }
    }
    o[y*W+x] = v;
  }
  return o;
}

export function convexHull(pts) {
  pts.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0]-o[0])*(b[1]-o[1]) - (a[1]-o[1])*(b[0]-o[0]);
  const lo = [], up = [];
  for (const p of pts) { while (lo.length >= 2 && cross(lo[lo.length-2], lo[lo.length-1], p) <= 0) lo.pop(); lo.push(p); }
  for (let i = pts.length - 1; i >= 0; i--) { const p = pts[i]; while (up.length >= 2 && cross(up[up.length-2], up[up.length-1], p) <= 0) up.pop(); up.push(p); }
  up.pop(); lo.pop(); return lo.concat(up);
}

export function perimeter(h) {
  let s = 0;
  for (let i = 0; i < h.length; i++) { const a = h[i], b = h[(i+1) % h.length]; s += Math.hypot(a[0]-b[0], a[1]-b[1]); }
  return s;
}

export function polyArea(h) {
  let s = 0;
  for (let i = 0; i < h.length; i++) { const a = h[i], b = h[(i+1) % h.length]; s += a[0]*b[1] - b[0]*a[1]; }
  return Math.abs(s) / 2;
}

// Smallest-area rectangle around the hull, trying each hull edge as a side.
export function minRectArea(h) {
  let best = Infinity;
  for (let i = 0; i < h.length; i++) {
    const a = h[i], b = h[(i + 1) % h.length];
    const L = Math.hypot(b[0]-a[0], b[1]-a[1]); if (L < 1e-6) continue;
    const ux = (b[0]-a[0]) / L, uy = (b[1]-a[1]) / L;
    let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
    for (const p of h) { const u = p[0]*ux + p[1]*uy, v = -p[0]*uy + p[1]*ux; if (u < u0) u0 = u; if (u > u1) u1 = u; if (v < v0) v0 = v; if (v > v1) v1 = v; }
    best = Math.min(best, (u1 - u0) * (v1 - v0));
  }
  return best;
}
