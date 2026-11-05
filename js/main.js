// App entry point: holds the state and wires the modules to the page.
import { analyzeImage } from "./analysis/image.js";
import { mapObject } from "./mapping.js";
import { Tracker } from "./tracking.js";
import * as audio from "./audio/engine.js";
import { getSettings, bindSettings } from "./ui/settings.js";
import { watchTheme } from "./ui/theme.js";
import { renderVoices, renderScene, sizeView, drawOverlay, drawScope } from "./ui/render.js";
import { makeSample } from "./sources/sample.js";
import { startCamera, stopCamera } from "./sources/camera.js";
import { loadImageFile } from "./sources/image-file.js";

const $ = (id) => document.getElementById(id);
const view = $("view"), vctx = view.getContext("2d");
const sctx = $("scope").getContext("2d");
const video = $("video");

let mode = "sample";        // sample | photo | live
let still = null;           // canvas for static modes
let stream = null;
let lastAnalysis = 0;
let analysisSize = { W: 256, H: 192 };
let sceneInfo = null;
const tracker = new Tracker();
const sample = makeSample();

// ---------- status ----------
const setStatus = (t) => { $("status").textContent = t; };
function setBadge(t, live) { const b = $("badge"); b.textContent = t; b.classList.toggle("live", !!live); }

audio.configureAudio({
  getSettings,
  onPaused: () => setStatus("The phone has paused the sound. Tap anywhere on the page to resume. On iPhone, also check the silent switch and volume."),
});

// ---------- analysis -> tracks -> sound ----------
function analyze(src, w, h, staticMode) {
  const r = analyzeImage(src, w, h, getSettings().polarity);
  analysisSize = { W: r.W, H: r.H };
  sceneInfo = r.scene;
  audio.setSceneTone(r.scene.tone, mode === "live" ? 0.1 : 1);
  showScene();
  tracker.update(r.objects, staticMode);
  remap(r.objects.length);
}

function remap(count) {
  const s = getSettings(), tracks = tracker.tracks;
  for (const tr of tracks) tr.p = mapObject(tr.f, count ?? tracks.length, s);
  tracks.sort((a, b) => a.p.midi - b.p.midi);
  audio.syncVoices(tracks);
  showVoices();
}

const showVoices = () => renderVoices($("voices"), tracker.tracks);
const showScene = () => renderScene($("scene"), sceneInfo, audio.toneAmount());

// ---------- frame loop ----------
function frame(now) {
  if (mode === "live" && video.readyState >= 2 && video.videoWidth) {
    sizeView(view, video.videoWidth, video.videoHeight);
    vctx.drawImage(video, 0, 0, view.width, view.height);
    if (now - lastAnalysis > 120) { lastAnalysis = now; analyze(video, video.videoWidth, video.videoHeight, false); }
  } else if (still) {
    vctx.drawImage(still, 0, 0, view.width, view.height);
  }
  drawOverlay(vctx, tracker.tracks, analysisSize.W, analysisSize.H);
  drawScope(sctx, audio.getAnalyser());
  requestAnimationFrame(frame);
}

// ---------- sources ----------
function closeCamera() {
  stopCamera(stream); stream = null;
  $("liveBtn").textContent = "Live camera";
}

function useStill(img, w, h, label) {
  closeCamera();
  mode = label === "Sample scene" ? "sample" : "photo";
  still = img; sizeView(view, w, h); tracker.reset(); audio.stopAll();
  analyze(img, w, h, true);
  setBadge(label);
  const n = tracker.tracks.length;
  setStatus(n ? `Found ${n} shape${n > 1 ? "s" : ""}. ${audio.isPlaying() ? "Playing." : "Press Play to hear them."}` : "No shapes found in this image.");
}

const useSample = () => useStill(sample, 640, 480, "Sample scene");

async function toggleCamera() {
  if (stream) { closeCamera(); useSample(); return; }
  setStatus("Starting the camera…");
  try {
    stream = await startCamera(video);
  } catch (e) {
    stream = null; setStatus(e.message); return;
  }
  mode = "live"; still = null; tracker.reset(); audio.stopAll();
  if (audio.isPlaying()) { audio.unlockAudio(); setTimeout(audio.audioCheck, 800); }
  $("liveBtn").textContent = "Stop camera"; setBadge("Live", true);
  setStatus(audio.isPlaying() ? "Live. Move objects around to change the sound." : "Live. Press Play to hear what the camera sees.");
}

async function openFile(file) {
  if (!file) return;
  setStatus("Opening image…");
  try {
    const c = await loadImageFile(file);
    useStill(c, c.width, c.height, "Photo");
  } catch (e) {
    setStatus(e.message);
  }
}

// ---------- controls ----------
// Any tap retries a paused sound (iOS pauses audio when the camera starts or a call comes in)
document.addEventListener("pointerdown", () => { if (audio.needsUnlock()) audio.unlockAudio(); }, true);
for (const id of ["liveBtn", "sampleBtn", "photoBtn", "uploadBtn"])
  $(id).addEventListener("click", () => { if (audio.isPlaying()) audio.unlockAudio(); }, true);

$("play").addEventListener("click", () => {
  audio.unlockAudio();
  setTimeout(audio.audioCheck, 800);
  const playing = !audio.isPlaying();
  audio.setPlaying(playing);
  $("play").setAttribute("aria-pressed", String(playing));
  $("play").textContent = playing ? "■ Stop" : "▶ Play";
  if (playing && mode !== "live") setStatus(tracker.tracks.length ? "Playing. Try another photo, or the live camera." : "Playing, but no shapes are in view.");
  if (!playing) setStatus("Stopped.");
});
$("liveBtn").addEventListener("click", toggleCamera);
$("sampleBtn").addEventListener("click", useSample);
$("photoBtn").addEventListener("click", () => $("photoInput").click());
$("uploadBtn").addEventListener("click", () => $("uploadInput").click());
for (const id of ["photoInput", "uploadInput"]) {
  const inp = $(id);
  const take = () => { const f = inp.files && inp.files[0]; if (f) openFile(f); inp.value = ""; };
  inp.addEventListener("change", take); inp.addEventListener("input", take);
}

const stageEl = document.querySelector(".stage");
stageEl.addEventListener("dragover", e => { e.preventDefault(); stageEl.classList.add("drop"); });
stageEl.addEventListener("dragleave", () => stageEl.classList.remove("drop"));
stageEl.addEventListener("drop", e => { e.preventDefault(); stageEl.classList.remove("drop"); const f = e.dataTransfer && e.dataTransfer.files[0]; if (f) openFile(f); });
document.addEventListener("paste", e => {
  const it = [...(e.clipboardData ? e.clipboardData.items : [])].find(i => i.type.startsWith("image/"));
  if (it) openFile(it.getAsFile());
});

bindSettings({
  onVolume: v => audio.setVolume(v),
  onTone: () => { audio.applyTone(false); showScene(); },
  onRemap: () => remap(),
  onPolarity: () => { if (still) { tracker.reset(); audio.stopAll(); analyze(still, still.width, still.height, true); } },
});
watchTheme(showVoices);

// ---------- start ----------
useSample();
setStatus("Showing a built-in sample scene. Press Play to hear it.");
requestAnimationFrame(frame);

// Offline support: stores the app on the phone after the first visit
if ("serviceWorker" in navigator && location.protocol === "https:") {
  window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
}
