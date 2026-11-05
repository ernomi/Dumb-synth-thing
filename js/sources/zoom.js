// Camera zoom. Uses the camera's own zoom when the browser offers it (sharper,
// and some phones switch lenses), otherwise crops the middle of the picture.
const DIGITAL_MAX = 4;

export class CameraZoom {
  constructor() { this.detach(); }

  /** Call with each new camera stream. Starts at 1x (or the camera's current zoom). */
  attach(stream) {
    this.detach();
    this.track = stream.getVideoTracks()[0] || null;
    let caps = null;
    try { caps = this.track && this.track.getCapabilities ? this.track.getCapabilities().zoom : null; } catch (e) {}
    if (caps && caps.max > caps.min) {
      this.hw = { min: caps.min, max: caps.max };
      let now = 1;
      try { now = this.track.getSettings().zoom || 1; } catch (e) {}
      this.level = Math.min(this.hw.max, Math.max(this.hw.min, now));
    }
  }

  detach() {
    this.track = null; this.hw = null; this.level = 1;
    this.applying = false; this.queued = null;
  }

  get min() { return this.hw ? this.hw.min : 1; }
  get max() { return this.hw ? this.hw.max : DIGITAL_MAX; }
  get hardware() { return !!this.hw; }

  set(level) {
    this.level = Math.min(this.max, Math.max(this.min, level));
    if (this.hw) this.applyHardware(this.level);
    return this.level;
  }

  /** The part of a sw x sh frame to show: all of it unless zooming digitally. */
  crop(sw, sh) {
    if (this.hw || this.level <= 1) return { x: 0, y: 0, w: sw, h: sh };
    const w = sw / this.level, h = sh / this.level;
    return { x: (sw - w) / 2, y: (sh - h) / 2, w, h };
  }

  // Pinching fires many updates; only keep the latest one while the camera catches up
  applyHardware(level) {
    if (this.applying) { this.queued = level; return; }
    const track = this.track;
    this.applying = true;
    track.applyConstraints({ advanced: [{ zoom: level }] })
      .catch(() => {})
      .finally(() => {
        if (track !== this.track) return; // camera changed meanwhile
        this.applying = false;
        if (this.queued != null) { const q = this.queued; this.queued = null; this.applyHardware(q); }
      });
  }
}

/** "1×", "2.5×", "0.5×" */
export const zoomLabel = z => (Math.round(z * 10) / 10).toString() + "×";
