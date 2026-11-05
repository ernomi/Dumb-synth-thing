// Drawing: camera overlay, oscilloscope, voice list and scene description.
import { blend, NH } from "../mapping.js";
import { colors } from "./theme.js";

const voiceColor = (tr) => colors[tr.id % colors.length];

// ---------- voice list ----------
function wavePath(p) {
  const h = blend(p), pts = [], n = 64; let peak = 0; const ys = [];
  for (let i = 0; i <= n; i++) {
    let y = 0; const x = i / n;
    for (let k = 1; k <= NH; k++) if (h[k]) y += h[k] * Math.sin(2 * Math.PI * k * x);
    ys.push(y); peak = Math.max(peak, Math.abs(y));
  }
  ys.forEach((y, i) => pts.push((i / n * 56).toFixed(1) + "," + (11 - y / (peak || 1) * 9).toFixed(1)));
  return "M" + pts.join(" L");
}

export function renderVoices(el, tracks) {
  if (!tracks.length) { el.innerHTML = '<div class="empty">No shapes found. Try objects that contrast with a plain background, or change “Detect by”.</div>'; return; }
  el.innerHTML = tracks.map(tr => {
    const c = voiceColor(tr);
    return `<div class="voice">
      <span class="dot" style="background:${c}"></span>
      <svg viewBox="0 0 56 22" aria-hidden="true"><path d="${wavePath(tr.p)}" fill="none" stroke="${c}" stroke-width="1.8" stroke-linejoin="round"/></svg>
      <div class="what"><div class="shape"><span class="chip" style="background:rgb(${tr.obj.rgb.join(",")})"></span>${tr.p.name}</div>
      <div class="meta">${tr.p.shown}</div>
      <div class="meta">size ${(tr.f.frac * 100).toFixed(1)}% · far ${Math.round(tr.p.dist * 100)}% · drive ${Math.round(tr.p.drive * 100)}%</div></div>
      <span class="note">${tr.p.note}</span></div>`;
  }).join("");
}

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
export function sizeView(view, w, h) {
  const s = Math.min(1, 960 / w), cw = Math.round(w * s), ch = Math.round(h * s);
  if (view.width !== cw || view.height !== ch) { view.width = cw; view.height = ch; }
}

/** Outline each tracked shape. Hulls are in analysis pixels (aw x ah). */
export function drawOverlay(ctx, tracks, aw, ah) {
  const view = ctx.canvas, sx = view.width / aw, sy = view.height / ah;
  const lw = Math.max(2, view.width / 260);
  for (const tr of tracks) {
    const c = voiceColor(tr), h = tr.obj.hull;
    ctx.beginPath();
    h.forEach((p, i) => i ? ctx.lineTo(p[0] * sx, p[1] * sy) : ctx.moveTo(p[0] * sx, p[1] * sy));
    ctx.closePath();
    ctx.globalAlpha = 0.16; ctx.fillStyle = c; ctx.fill();
    ctx.globalAlpha = 1; ctx.lineWidth = lw; ctx.strokeStyle = c; ctx.stroke();
    const fs = Math.max(12, view.width / 42);
    ctx.font = `500 ${fs}px "IBM Plex Mono", ui-monospace, monospace`;
    const label = tr.p.note, tw = ctx.measureText(label).width;
    const lx = tr.obj.cx * view.width - tw / 2 - 6, ly = tr.obj.cy * view.height - fs * 0.75;
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
