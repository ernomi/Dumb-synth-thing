// The voice list. Tap a voice to open its details, tap again to close.
//
// The list updates several times a second from the live camera, so each voice
// keeps its own element (keyed by track id) and is updated in place. Replacing
// the whole list would swallow taps that land mid-update.
import { blend, NH, WAVE_NAMES } from "../mapping.js";
import { voiceColor } from "./theme.js";

const expanded = new Set(); // track ids whose details are open
const nodes = new Map();    // track id -> element
let bound = null;           // the list element we've attached the tap handler to

const pct = v => Math.round(v * 100) + "%";

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

function summaryHTML(tr) {
  const c = voiceColor(tr);
  return `<span class="dot" style="background:${c}"></span>
    <svg viewBox="0 0 56 22" aria-hidden="true"><path d="${wavePath(tr.p)}" fill="none" stroke="${c}" stroke-width="1.8" stroke-linejoin="round"/></svg>
    <span class="what"><span class="shape"><span class="chip" style="background:rgb(${tr.obj.rgb.join(",")})"></span>${tr.p.name}</span>
    <span class="meta">${tr.p.shown}</span>
    <span class="meta">size ${(tr.f.frac * 100).toFixed(1)}% · far ${pct(tr.p.dist)} · drive ${pct(tr.p.drive)}</span></span>
    <span class="note">${tr.p.note}</span>
    <span class="chev" aria-hidden="true">▾</span>`;
}

function detailsHTML(tr) {
  const p = tr.p, f = tr.f, o = tr.obj, c = voiceColor(tr);
  const hz = p.freq < 1000 ? p.freq.toFixed(1) + " Hz" : (p.freq / 1000).toFixed(2) + " kHz";
  const cutoff = p.cutoff < 1000 ? Math.round(p.cutoff) + " Hz" : (p.cutoff / 1000).toFixed(1) + " kHz";
  const bars = WAVE_NAMES.map((w, i) =>
    `<span class="bar"><span class="bar-name">${w}</span><span class="bar-track"><span class="bar-fill" style="width:${pct(p.weights[i])};background:${c}"></span></span><span class="bar-val">${pct(p.weights[i])}</span></span>`).join("");
  return `<dl>
      <dt>Pitch</dt><dd>${p.note} · ${hz}</dd>
      <dt>Waveform</dt><dd class="bars">${bars}</dd>
      <dt>Shape</dt><dd>roundness ${pct(f.circ)} · fills its box ${pct(f.rect)} · solidity ${pct(f.solidity)}</dd>
      <dt>Size</dt><dd>${(f.frac * 100).toFixed(1)}% of the frame. Bigger plays lower.</dd>
      <dt>Distance</dt><dd>${pct(p.dist)} far → reverb ${pct(p.wet)}, treble cut at ${cutoff}, level ${pct(p.level / 0.32)}</dd>
      <dt>Color</dt><dd><span class="chip" style="background:rgb(${o.rgb.join(",")})"></span> warmth ${pct(o.warmth)} · saturation ${pct(o.sat)} → overdrive ${pct(p.drive)}</dd>
    </dl>`;
}

function createNode(id) {
  const el = document.createElement("div");
  el.className = "voice";
  el.innerHTML = `<button type="button" class="voice-head" aria-expanded="false" aria-controls="voice-${id}"></button>
    <div class="voice-details" id="voice-${id}" hidden></div>`;
  el.dataset.id = id;
  return el;
}

function bind(listEl) {
  if (bound === listEl) return;
  bound = listEl;
  listEl.addEventListener("click", e => {
    const head = e.target.closest(".voice-head");
    if (!head || !listEl.contains(head)) return;
    const node = head.parentElement, id = +node.dataset.id;
    if (expanded.has(id)) expanded.delete(id); else expanded.add(id);
    applyOpen(node, id);
    if (expanded.has(id) && node._track) node.querySelector(".voice-details").innerHTML = detailsHTML(node._track);
    if (expanded.has(id)) reveal(listEl, node);
  });
}

// The list scrolls inside a fixed-height box: when a voice opens near the
// bottom, scroll just enough to show its details (never past its own top).
function reveal(listEl, node) {
  const top = node.offsetTop, bottom = top + node.offsetHeight;
  const target = Math.min(top, bottom - listEl.clientHeight);
  if (target > listEl.scrollTop) listEl.scrollTo({ top: target, behavior: "smooth" });
}

function applyOpen(node, id) {
  const open = expanded.has(id);
  node.classList.toggle("open", open);
  node.querySelector(".voice-head").setAttribute("aria-expanded", String(open));
  node.querySelector(".voice-details").hidden = !open;
}

export function renderVoices(listEl, tracks) {
  bind(listEl);
  if (!tracks.length) {
    nodes.clear(); expanded.clear();
    listEl.innerHTML = '<div class="empty">No shapes found. Try objects that contrast with a plain background, or change “Detect by”.</div>';
    return;
  }
  const live = new Set(tracks.map(tr => tr.id));
  // Forget voices that are gone (and their open state)
  for (const [id, node] of nodes) if (!live.has(id)) { node.remove(); nodes.delete(id); expanded.delete(id); }
  listEl.querySelector(".empty")?.remove();

  tracks.forEach((tr, i) => {
    let node = nodes.get(tr.id);
    if (!node) { node = createNode(tr.id); nodes.set(tr.id, node); }
    node._track = tr;
    const head = node.querySelector(".voice-head");
    head.innerHTML = summaryHTML(tr);
    applyOpen(node, tr.id);
    if (expanded.has(tr.id)) node.querySelector(".voice-details").innerHTML = detailsHTML(tr);
    // Keep the list in pitch order without rebuilding it
    if (listEl.children[i] !== node) listEl.insertBefore(node, listEl.children[i] || null);
  });
}
