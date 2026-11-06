// The settings panel: the only place that reads the form controls.
import { SCALES } from "../mapping.js";

const $ = (id) => document.getElementById(id);
const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
let selectedNotes = new Set();

export function getSettings() {
  return {
    scale: $("scale").value,
    notes: [...selectedNotes],
    polarity: $("polarity").value,
    volume: +$("volume").value,
    attack: +$("attack").value,
    release: +$("release").value,
    morph: +$("morph").value,
    drive: +$("drive").value,
    tone: +$("tone").value,
  };
}

const seconds = v => (+v).toFixed(2) + " s";
const percent = v => Math.round(v * 100) + "%";

/**
 * Wire the controls. Handlers receive the new settings.
 * @param h  { onVolume, onTone, onRemap, onPolarity }
 */
export function bindSettings(h) {
  const on = (id, ev, fn) => $(id).addEventListener(ev, fn);
  const renderNotes = () => {
    const picker = $("notePicker");
    picker.replaceChildren(...NOTE_NAMES.map((name, note) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "note-toggle";
      button.textContent = name;
      button.setAttribute("aria-label", `${name} note`);
      button.setAttribute("aria-pressed", String(selectedNotes.has(note)));
      button.addEventListener("click", () => {
        if (selectedNotes.has(note)) selectedNotes.delete(note);
        else selectedNotes.add(note);
        $("scale").value = "custom";
        renderNotes();
        h.onRemap();
      });
      return button;
    }));
  };
  const scale = $("scale").value;
  selectedNotes = new Set(scale === "free" ? [] : (SCALES[scale] || []));
  renderNotes();
  on("attack", "input", e => { $("attackOut").textContent = seconds(e.target.value); });
  on("release", "input", e => { $("releaseOut").textContent = seconds(e.target.value); });
  on("morph", "input", e => { $("morphOut").textContent = seconds(e.target.value); });
  on("tone", "input", e => { $("toneOut").textContent = percent(e.target.value); h.onTone(); });
  on("drive", "input", e => { $("driveOut").textContent = percent(e.target.value); h.onRemap(); });
  on("volume", "input", e => h.onVolume(+e.target.value));
  on("scale", "change", e => {
    if (e.target.value !== "custom") {
      selectedNotes = new Set(e.target.value === "free" ? [] : (SCALES[e.target.value] || []));
      renderNotes();
    }
    h.onRemap();
  });
  on("polarity", "change", () => h.onPolarity());
}
