// App entry point: holds the state and wires the modules to the page.
import { analyzeImage } from "./analysis/image.js";
import { mapObject } from "./mapping.js";
import { Tracker } from "./tracking.js";
import * as audio from "./audio/engine.js";
import { getSettings, bindSettings } from "./ui/settings.js";
import { watchTheme } from "./ui/theme.js";
import { renderVoices, renderScene, sizeView, drawOverlay, drawScope, drawSource, mirrorRect } from "./ui/render.js";
import { loadSample } from "./sources/sample.js";
import { startCamera, stopCamera, countCameras } from "./sources/camera.js";
import { loadImageFile } from "./sources/image-file.js";
import { createRecordCanvas, drawRecordFrame } from "./recording/compose.js";
import { Recorder, recordingSupported } from "./recording/recorder.js";
import { videoFile, isMp4, canShareFile, shareFile } from "./recording/share.js";
import { finalizeRecording } from "./recording/finalize.js";

const $ = (id) => document.getElementById(id);
const view = $("view"), vctx = view.getContext("2d");
const sctx = $("scope").getContext("2d");
const video = $("video");

let mode = "sample";        // sample | photo | live
let still = null;           // canvas for static modes
let stream = null;
let facing = "environment"; // which camera to use: "environment" (back) or "user" (front)
let lastAnalysis = 0;
let analysisSize = { W: 256, H: 192 };
let sceneInfo = null;
const tracker = new Tracker();

// Shape outlines on screen and in recordings; remembered per device
let showShapes = true;
try { showShapes = localStorage.getItem("pw.showShapes") !== "0"; } catch (e) {}

// Recording
const MAX_SECONDS = 90;
const recCanvas = createRecordCanvas(), rctx = recCanvas.getContext("2d");
let recorder = null;
let take = null; // { file, url } of the last recording

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
function currentSource() {
  if (mode === "live" && video.readyState >= 2 && video.videoWidth) return [video, video.videoWidth, video.videoHeight];
  if (still) return [still, still.width, still.height];
  return [null, 0, 0];
}

function frame(now) {
  const [src, sw, sh] = currentSource();
  const mirror = src === video && facing === "user"; // front camera shows as a mirror
  if (src === video) {
    sizeView(view, sw, sh);
    if (now - lastAnalysis > 120) { lastAnalysis = now; analyze(video, sw, sh, false); }
  }
  const full = { x: 0, y: 0, w: view.width, h: view.height };
  if (src) drawSource(vctx, src, full, mirror);
  if (showShapes) drawOverlay(vctx, tracker.tracks, analysisSize.W, analysisSize.H, mirror ? mirrorRect(full) : full);
  if (recorder) drawRecordFrame(rctx, src, sw, sh, showShapes ? { tracks: tracker.tracks, aw: analysisSize.W, ah: analysisSize.H } : null, mirror);
  drawScope(sctx, audio.getAnalyser());
  requestAnimationFrame(frame);
}

// ---------- sources ----------
function closeCamera() {
  stopCamera(stream); stream = null;
  $("liveBtn").textContent = "Live camera";
  $("flipBtn").hidden = true;
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

/** Show the built-in sample image. Resolves to false if it couldn't load. */
async function useSample() {
  let img;
  try { img = await loadSample(); } catch (e) { setStatus(e.message); return false; }
  useStill(img, img.width, img.height, "Sample scene");
  return true;
}

async function toggleCamera() {
  if (stream) { closeCamera(); useSample(); return; }
  await openCamera();
}

/** Start the live camera. Resolves to true on success; on failure the status explains why. */
async function openCamera() {
  if (stream) return true;
  setStatus("Starting the camera…");
  try {
    stream = await startCamera(video, facing);
  } catch (e) {
    stream = null; setStatus(e.message); return false;
  }
  mode = "live"; still = null; tracker.reset(); audio.stopAll();
  if (audio.isPlaying()) { audio.unlockAudio(); setTimeout(audio.audioCheck, 800); }
  $("liveBtn").textContent = "Stop camera"; setBadge("Live", true);
  setStatus(audio.isPlaying() ? "Live. Move objects around to change the sound." : "Live. Press Play to hear what the camera sees.");
  // Only offer flipping when there's a second camera to flip to
  countCameras().then(n => { if (stream) $("flipBtn").hidden = n < 2; });
  return true;
}

let flipping = false;
async function flipCamera() {
  if (!stream || flipping) return;
  flipping = true;
  const previous = facing;
  facing = facing === "user" ? "environment" : "user";
  // Phones usually can't run both cameras at once, so release this one first
  stopCamera(stream); stream = null;
  let ok = await openCamera();
  if (!ok) { facing = previous; ok = await openCamera(); }
  if (ok) setStatus(facing === "user" ? "Front camera." : "Back camera.");
  else useSample();
  flipping = false;
}

/** Resolves once the video element has a frame to draw (or after `ms`). */
function videoReady(ms = 3000) {
  if (video.readyState >= 2 && video.videoWidth) return Promise.resolve();
  return new Promise(res => {
    const done = () => { clearTimeout(t); video.removeEventListener("loadeddata", done); res(); };
    const t = setTimeout(done, ms);
    video.addEventListener("loadeddata", done);
  });
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
for (const id of ["liveBtn", "flipBtn", "sampleBtn", "photoBtn", "uploadBtn"])
  $(id).addEventListener("click", () => { if (audio.isPlaying()) audio.unlockAudio(); }, true);

function setPlaying(playing) {
  if (playing) { audio.unlockAudio(); setTimeout(audio.audioCheck, 800); }
  audio.setPlaying(playing);
  $("play").setAttribute("aria-pressed", String(playing));
  $("play").textContent = playing ? "■ Stop" : "▶ Play";
}
$("play").addEventListener("click", () => {
  const playing = !audio.isPlaying();
  setPlaying(playing);
  if (playing && mode !== "live") setStatus(tracker.tracks.length ? "Playing. Try another photo, or the live camera." : "Playing, but no shapes are in view.");
  if (!playing) setStatus("Stopped.");
});

// ---------- shapes toggle ----------
function setShowShapes(on) {
  showShapes = on;
  $("shapesBtn").setAttribute("aria-pressed", String(on));
  $("shapesBtn").textContent = on ? "Shapes: on" : "Shapes: off";
  try { localStorage.setItem("pw.showShapes", on ? "1" : "0"); } catch (e) {}
}
$("shapesBtn").addEventListener("click", () => setShowShapes(!showShapes));
setShowShapes(showShapes);

// ---------- recording ----------
const clock = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

function setRecordingUI(on) {
  $("recBtn").setAttribute("aria-pressed", String(on));
  $("recBtn").textContent = on ? "■ 0:00" : "● Record";
}

let startingRecording = false;
async function startRecording() {
  if (startingRecording) return; // ignore extra taps while the camera starts
  if (!recordingSupported()) { setStatus("This browser can't record video. Try Safari on iPhone or Chrome on Android."); return; }
  discardTake();
  // Start the sound first, while we're still inside the tap (phones require that)
  if (!audio.isPlaying()) setPlaying(true);
  startingRecording = true;
  try {
    if (!(await openCamera())) return; // status already says what went wrong
    await videoReady();
  } finally {
    startingRecording = false;
  }
  const [src, sw, sh] = currentSource();
  drawRecordFrame(rctx, src, sw, sh, null, src === video && facing === "user"); // have a frame ready before capture starts
  recorder = new Recorder(recCanvas, audio.getAudioStream(), {
    maxSeconds: MAX_SECONDS,
    onTick: s => { $("recBtn").textContent = `■ ${clock(s)}`; },
    onDone: async blob => {
      recorder = null; setRecordingUI(false);
      // A take is over: silence the synth, release the camera, back to the sample
      setPlaying(false);
      if (stream) { closeCamera(); await useSample(); }
      setStatus("Finishing the video…");
      showTake(await finalizeRecording(blob));
    },
  });
  try {
    recorder.start();
  } catch (e) {
    recorder = null;
    setStatus("Recording couldn't start" + (e && e.name ? ` (${e.name})` : "") + ".");
    return;
  }
  setRecordingUI(true);
  setStatus(`Recording. Tap ■ to stop (up to ${clock(MAX_SECONDS)}).`);
}

function showTake(blob) {
  if (!blob.size) { setStatus("The recording came out empty. Try again, and keep the app in front while recording."); return; }
  const file = videoFile(blob), url = URL.createObjectURL(file);
  take = { file, url };
  $("takeVideo").src = url;
  $("saveBtn").href = url;
  $("saveBtn").download = file.name;
  $("shareBtn").hidden = !canShareFile(file);
  $("take").hidden = false;
  setStatus(isMp4(blob)
    ? "Recording ready. Share it or save it to your phone."
    : "Recording ready. This browser saved it as WebM, which Instagram may not accept. Other apps usually do.");
}

function discardTake() {
  if (!take) return;
  $("takeVideo").removeAttribute("src"); $("takeVideo").load();
  URL.revokeObjectURL(take.url);
  take = null;
  $("take").hidden = true;
}

$("recBtn").addEventListener("click", () => { if (recorder) recorder.stop(); else startRecording(); });
$("shareBtn").addEventListener("click", async () => {
  if (!take) return;
  const r = await shareFile(take.file);
  if (r === "failed") setStatus("Sharing didn't work here. Use Save instead, then post it from your gallery.");
});
$("discardBtn").addEventListener("click", () => { discardTake(); setStatus("Recording discarded."); });
// Phones stop drawing when the page is hidden, so end the take and keep what was recorded
document.addEventListener("visibilitychange", () => { if (document.hidden && recorder) recorder.stop(); });
$("liveBtn").addEventListener("click", toggleCamera);
$("flipBtn").addEventListener("click", flipCamera);
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
loadSample().then(img => {
  // Skip if the user already picked the camera or a photo while it loaded
  if (mode !== "sample" || still || stream) return;
  useStill(img, img.width, img.height, "Sample scene");
  setStatus("Showing a built-in sample scene. Press Play to hear it.");
}, e => setStatus(e.message));
requestAnimationFrame(frame);

// Offline support: stores the app on the phone after the first visit
if ("serviceWorker" in navigator && location.protocol === "https:") {
  window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
}
