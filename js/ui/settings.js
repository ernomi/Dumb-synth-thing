// The settings panel: the only place that reads the form controls.
const $ = (id) => document.getElementById(id);

export function getSettings() {
  return {
    scale: $("scale").value,
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
  on("attack", "input", e => { $("attackOut").textContent = seconds(e.target.value); });
  on("release", "input", e => { $("releaseOut").textContent = seconds(e.target.value); });
  on("morph", "input", e => { $("morphOut").textContent = seconds(e.target.value); });
  on("tone", "input", e => { $("toneOut").textContent = percent(e.target.value); h.onTone(); });
  on("drive", "input", e => { $("driveOut").textContent = percent(e.target.value); h.onRemap(); });
  on("volume", "input", e => h.onVolume(+e.target.value));
  on("scale", "change", () => h.onRemap());
  on("polarity", "change", () => h.onPolarity());
}
