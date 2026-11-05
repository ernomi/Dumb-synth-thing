// Mobile browser audio workarounds.
// Phones only let a page make sound after a tap, and iPhones mute web audio
// when the silent switch is on unless the page asks for "playback" audio.
// A native wrapper can set the audio session itself and skip most of this.

let silentEl = null;

export function requestPlaybackSession() {
  try { if (navigator.audioSession) navigator.audioSession.type = "playback"; } catch (e) {}
}

/** Call inside a user gesture, after the AudioContext exists. */
export function unlockContext(ac) {
  if (ac.state !== "running") ac.resume().catch(() => {});
  try {
    const b = ac.createBuffer(1, 1, ac.sampleRate), src = ac.createBufferSource();
    src.buffer = b; src.connect(ac.destination); src.start(0);
  } catch (e) {}
  // Older iPhones: a looping silent media element switches audio to the
  // "playback" category, which ignores the silent switch.
  try {
    if (!silentEl) silentEl = makeSilentLoop();
    const pr = silentEl.play(); if (pr) pr.catch(() => {});
  } catch (e) {}
}

function makeSilentLoop() {
  const sr = 8000, n = sr / 2, buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf);
  const w = (o, t) => { for (let i = 0; i < t.length; i++) v.setUint8(o + i, t.charCodeAt(i)); };
  w(0, "RIFF"); v.setUint32(4, 36 + n * 2, true); w(8, "WAVEfmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, sr, true); v.setUint32(28, sr * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, "data"); v.setUint32(40, n * 2, true);
  const el = document.createElement("audio");
  el.loop = true; el.setAttribute("playsinline", ""); el.setAttribute("x-webkit-airplay", "deny");
  el.src = URL.createObjectURL(new Blob([buf], { type: "audio/wav" }));
  return el;
}
