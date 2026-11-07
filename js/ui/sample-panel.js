// The Sound sample section: record / clear buttons, a small waveform of the
// captured sound, and the Blend slider.
const $ = (id) => document.getElementById(id);

/** @param h  { onRecord(), onClear(), onBlend(value 0..1) } */
export function bindSamplePanel(h) {
  $("sndRecBtn").addEventListener("click", () => h.onRecord());
  $("sndClearBtn").addEventListener("click", () => h.onClear());
  $("blend").addEventListener("input", e => { showBlend(+e.target.value); h.onBlend(+e.target.value); });
}

/** state: "empty" | "recording" | "ready" */
export function showSampleState(state, seconds) {
  const rec = $("sndRecBtn");
  rec.setAttribute("aria-pressed", String(state === "recording"));
  rec.textContent = state === "recording" ? `■ ${seconds.toFixed(1)} s` : state === "ready" ? "● Re-record" : "● Record sound";
  $("sndClearBtn").disabled = state !== "ready";
  $("blend").disabled = state !== "ready";
  if (state !== "ready") drawSample(null);
}

export function showBlend(v) { $("blendOut").textContent = Math.round(v * 100) + "%"; }

/** Draw the sample's envelope (array of 0..1 peaks), or clear it. */
export function drawSample(peaks) {
  const svg = $("sndWave");
  // SVG elements have no .hidden property, so toggle the attribute itself
  if (!peaks) { svg.innerHTML = ""; svg.setAttribute("hidden", ""); return; }
  const n = peaks.length, w = 200, h = 32, mid = h / 2;
  const top = peaks.map((p, i) => `${(i / (n - 1) * w).toFixed(1)},${(mid - p * (mid - 1)).toFixed(1)}`);
  const bottom = peaks.map((p, i) => `${(i / (n - 1) * w).toFixed(1)},${(mid + p * (mid - 1)).toFixed(1)}`).reverse();
  svg.innerHTML = `<polygon points="${top.concat(bottom).join(" ")}" fill="var(--accent)" opacity="0.85"/>`;
  svg.removeAttribute("hidden");
}
