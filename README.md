# Shapescape Synth

Point your phone's camera at objects and their shapes become sound.

- **Shape** blends the waveform: round toward sine, box-like toward square, triangle-like toward triangle, spiky toward saw.
- **Size** sets pitch: bigger objects play lower notes.
- **Distance** (height in the frame) sets reverb: farther objects sound more distant.
- **Object color** sets overdrive: warm hues are driven harder, cool hues stay clean.
- **Scene color** shapes the overall tone: warm scenes add 2nd harmonics and low mids, cool scenes add 3rd harmonics, treble and scooped mids.

Everything runs in the browser with the Web Audio API. No build step and no server code.

## Run it

Live camera mode needs an `https://` address. GitHub Pages provides one:

1. Push these files to the repository root.
2. In **Settings → Pages**, choose **Deploy from a branch**, branch `main`, folder `/ (root)`.
3. Open `https://<username>.github.io/<repo>/` on your phone, then tap **Live camera** and **Play**.

## Install it on a phone

- **iPhone:** open the link in Safari → Share → **Add to Home Screen**.
- **Android:** open the link in Chrome → ⋮ → **Install app**.

After the first visit it works offline.

## Updating

Replace `index.html`, then raise `VERSION` in `sw.js` (for example `"v2"`) so installed copies pick up the change.

## Files

| File | Purpose |
| --- | --- |
| `index.html` | The whole app: UI, shape detection and synth |
| `manifest.webmanifest` | App name, colors and icons for installing |
| `sw.js` | Offline cache |
| `icon-*.png`, `apple-touch-icon.png` | Home-screen icons |
