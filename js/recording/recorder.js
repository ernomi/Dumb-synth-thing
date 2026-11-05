// Records a canvas plus an audio stream into a single video file.

// Instagram and most social apps want MP4 (H.264 + AAC), so try that first.
const MIME_TYPES = [
  "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
  "video/mp4;codecs=avc1,mp4a.40.2",
  "video/mp4",
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/webm",
];

export function recordingSupported() {
  return !!(window.MediaRecorder && HTMLCanvasElement.prototype.captureStream);
}

function pickMimeType() {
  return MIME_TYPES.find(t => { try { return MediaRecorder.isTypeSupported(t); } catch (e) { return false; } }) || "";
}

export class Recorder {
  /**
   * @param canvas       the canvas to record (keep drawing it while recording)
   * @param audioStream  MediaStream with the sound to record
   * @param opts         { maxSeconds, onTick(seconds), onDone(blob) }
   */
  constructor(canvas, audioStream, opts) {
    this.canvas = canvas;
    this.audioStream = audioStream;
    this.opts = opts;
  }

  start() {
    const { maxSeconds = 90, onTick = () => {}, onDone = () => {} } = this.opts;
    this.videoStream = this.canvas.captureStream(30);
    const stream = new MediaStream([...this.videoStream.getVideoTracks(), ...this.audioStream.getAudioTracks()]);
    const mimeType = pickMimeType();
    let rec;
    try {
      rec = new MediaRecorder(stream, { ...(mimeType ? { mimeType } : {}), videoBitsPerSecond: 5_000_000, audioBitsPerSecond: 160_000 });
    } catch (e) {
      this.videoStream.getTracks().forEach(t => t.stop());
      throw e;
    }
    const chunks = [];
    rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
    rec.onstop = () => {
      clearInterval(this.timer);
      // Only stop the canvas track; the audio stream is shared with the synth
      this.videoStream.getTracks().forEach(t => t.stop());
      onDone(new Blob(chunks, { type: rec.mimeType || mimeType || "video/webm" }));
    };
    try {
      rec.start(1000);
    } catch (e) {
      this.videoStream.getTracks().forEach(t => t.stop());
      throw e;
    }
    this.rec = rec;
    const t0 = performance.now();
    this.timer = setInterval(() => {
      const s = (performance.now() - t0) / 1000;
      onTick(s);
      if (s >= maxSeconds) this.stop();
    }, 250);
  }

  stop() {
    if (this.rec && this.rec.state !== "inactive") this.rec.stop();
  }
}
