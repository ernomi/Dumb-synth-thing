// Object tracking across frames. Pure, no DOM.
// Measurements are smoothed over time per tracked object, so a shape that
// flickers between readings glides instead of jumping.
const FEATS = ["circ", "rect", "solidity", "frac", "bottom", "drive"];

export class Tracker {
  constructor() {
    this.tracks = [];
    this.nextId = 0;
  }

  reset() { this.tracks = []; }

  /** @param staticMode  true for photos (no smoothing, no grace period) */
  update(objects, staticMode) {
    const used = new Set();
    for (const tr of this.tracks) {
      let bi = -1, bd = 0.2;
      objects.forEach((o, i) => {
        if (used.has(i)) return;
        const d = Math.hypot(o.cx - tr.obj.cx, o.cy - tr.obj.cy);
        if (d < bd) { bd = d; bi = i; }
      });
      if (bi >= 0) {
        used.add(bi); tr.obj = objects[bi]; tr.miss = 0;
        const k = staticMode ? 1 : 0.2;
        for (const f of FEATS) tr.f[f] += k * (tr.obj[f] - tr.f[f]);
      } else tr.miss++;
    }
    this.tracks = this.tracks.filter(tr => tr.miss <= (staticMode ? 0 : 5));
    objects.forEach((o, i) => {
      if (used.has(i)) return;
      const f = {}; for (const k of FEATS) f[k] = o[k];
      this.tracks.push({ id: this.nextId++, obj: o, f, miss: 0 });
    });
    return this.tracks;
  }
}
