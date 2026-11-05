// Colors read from the CSS custom properties in css/styles.css.
export const colors = Object.assign([], { ink: "", bg: "", panel: "", accent: "", line: "" });

export function readColors() {
  const cs = getComputedStyle(document.documentElement);
  const voice = ["--v1","--v2","--v3","--v4","--v5","--v6"].map(v => cs.getPropertyValue(v).trim() || "#888");
  colors.length = 0; colors.push(...voice);
  for (const k of ["ink", "bg", "panel", "accent", "line"]) colors[k] = cs.getPropertyValue("--" + k).trim();
}

/** Re-read colors when the theme changes, then call `cb`. */
export function watchTheme(cb) {
  const update = () => { readColors(); cb(); };
  try { matchMedia("(prefers-color-scheme: dark)").addEventListener("change", update); } catch (e) {}
  new MutationObserver(update).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
}

readColors();
