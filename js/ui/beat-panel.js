// The Beat section: Off / I / II / III and a tempo slider.
const $ = (id) => document.getElementById(id);

/**
 * @param h  { onSelect(id: "off" | "I" | "II" | "III"), onTempo(bpm) }
 */
export function bindBeatPanel(h) {
  for (const btn of document.querySelectorAll(".beat-btn"))
    btn.addEventListener("click", () => h.onSelect(btn.dataset.beat));
  $("tempo").addEventListener("input", e => { showTempo(+e.target.value); h.onTempo(+e.target.value); });
}

/** Reflect the chosen beat; with a beat on, put the slider at `bpm`. */
export function showBeat(id, bpm) {
  for (const btn of document.querySelectorAll(".beat-btn"))
    btn.setAttribute("aria-pressed", String(btn.dataset.beat === id));
  $("tempo").disabled = id === "off";
  if (bpm != null) { $("tempo").value = bpm; showTempo(bpm); }
}

function showTempo(bpm) { $("tempoOut").textContent = Math.round(bpm) + " BPM"; }
