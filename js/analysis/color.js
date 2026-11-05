// Average color of an object -> how warm it is and how much overdrive it earns.
export function colorInfo(r, g, b) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), c = mx - mn;
  let hue = 0;
  if (c > 0) {
    if (mx === r) hue = ((g - b) / c) % 6; else if (mx === g) hue = (b - r) / c + 2; else hue = (r - g) / c + 4;
    hue *= 60; if (hue < 0) hue += 360;
  }
  const sat = mx > 0 ? Math.min(1, (c / mx) * 1.4) * Math.min(1, mx / 80) : 0;
  const warmth = (1 + Math.cos((hue - 30) * Math.PI / 180)) / 2; // orange = 1, blue = 0
  const drive = Math.max(0, Math.min(1, 0.3 + sat * (0.95 * warmth - 0.25)));
  return { rgb: [r | 0, g | 0, b | 0], hue, sat, warmth, drive };
}
