// Drawing: camera overlay, oscilloscope and scene description.
// (The voice list lives in voices.js.)
import { colors, voiceColor } from "./theme.js";

// ---------- scene ----------
export function renderScene(el, sceneInfo, tone) {
  if (!el || !sceneInfo) return;
  const pct = Math.round(Math.abs(tone) * 100);
  const desc = pct < 8 ? "Neutral. No extra harmonics or tone shaping."
    : tone > 0 ? `Warm ${pct}%. Adds 2nd harmonics and lifts the low mids.`
    : `Cool ${pct}%. Adds 3rd harmonics, brightens the top and scoops the mids.`;
  el.innerHTML = `<span class="chip" style="background:rgb(${sceneInfo.rgb.join(",")})"></span><span>${desc}</span>`;
}

// ---------- camera view ----------
/**
 * Draw the `crop` part of an image into `rect`, flipped left-to-right when
 * `mirror` is set (front camera).
 */
export function drawSource(ctx, src, crop, rect, mirror) {
  const draw = () => ctx.drawImage(src, crop.x, crop.y, crop.w, crop.h, rect.x, rect.y, rect.w, rect.h);
  if (!mirror) { draw(); return; }
  ctx.save();
  ctx.translate(2 * rect.x + rect.w, 0); ctx.scale(-1, 1);
  draw();
  ctx.restore();
}

/** The same rect seen through a left-to-right flip, for drawOverlay (labels stay readable). */
export const mirrorRect = r => ({ x: r.x + r.w, y: r.y, w: -r.w, h: r.h });

export function sizeView(view, w, h) {
  const s = Math.min(1, 960 / w), cw = Math.round(w * s), ch = Math.round(h * s);
  if (view.width !== cw || view.height !== ch) { view.width = cw; view.height = ch; }
}

/**
 * Outline each tracked shape. Hulls are in analysis pixels (aw x ah).
 * @param rect  where the full image sits on the canvas (may extend past it when cropped)
 * @param unit  reference width for line and label sizes
 */
export function drawOverlay(ctx, tracks, aw, ah, rect, unit) {
  const r = rect || { x: 0, y: 0, w: ctx.canvas.width, h: ctx.canvas.height };
  const u = unit || ctx.canvas.width;
  const sx = r.w / aw, sy = r.h / ah;
  const lw = Math.max(2, u / 260);
  for (const tr of tracks) {
    const c = voiceColor(tr), h = tr.obj.hull;
    ctx.beginPath();
    h.forEach((p, i) => i ? ctx.lineTo(r.x + p[0] * sx, r.y + p[1] * sy) : ctx.moveTo(r.x + p[0] * sx, r.y + p[1] * sy));
    ctx.closePath();
    ctx.globalAlpha = 0.16; ctx.fillStyle = c; ctx.fill();
    ctx.globalAlpha = 1; ctx.lineWidth = lw; ctx.strokeStyle = c; ctx.stroke();
    const fs = Math.max(14, u / 36); // Alkhemikal runs small, so ~15% up from the old 12 / u/42
    ctx.font = `${fs}px "Alkhemikal", system-ui, sans-serif`;
    const label = tr.p.note, tw = ctx.measureText(label).width;
    const lx = r.x + tr.obj.cx * r.w - tw / 2 - 6, ly = r.y + tr.obj.cy * r.h - fs * 0.75;
    ctx.fillStyle = c; roundRect(ctx, lx, ly, tw + 12, fs * 1.5, 6); ctx.fill();
    ctx.fillStyle = "#ffffff"; ctx.textBaseline = "middle"; ctx.fillText(label, lx + 6, ly + fs * 0.76);
  }
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

// ---------- oscilloscope ----------
const scopeBuf = new Float32Array(2048);

/** @param analyser  AnalyserNode, or null to draw just the center line */
export function drawScope(ctx, analyser) {
  const w = ctx.canvas.width, h = ctx.canvas.height;
  ctx.clearRect(0, 0, w, h);
  ctx.strokeStyle = colors.line; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(0, h / 2); ctx.lineTo(w, h / 2); ctx.stroke();
  if (!analyser) return;
  analyser.getFloatTimeDomainData(scopeBuf);
  let start = 0; for (let i = 1; i < 1024; i++) if (scopeBuf[i - 1] < 0 && scopeBuf[i] >= 0) { start = i; break; }
  ctx.strokeStyle = colors.accent; ctx.lineWidth = 2.5; ctx.beginPath();
  for (let i = 0; i < 1024; i++) { const x = i / 1023 * w, y = h / 2 - scopeBuf[start + i] * h * 0.9; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
  ctx.stroke();
}
