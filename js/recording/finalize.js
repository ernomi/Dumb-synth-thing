// Browsers write recordings as "fragmented" MP4 (or WebM) with no total length
// in the header, so phone players and upload screens guess it from the first
// few seconds. This rewrites the file into a standard MP4 with H.264 video and
// AAC audio, which is what Instagram and other apps expect. If the recording
// already uses those codecs the data is copied as is, nothing is re-encoded.
//
// Mediabunny (MPL-2.0) is vendored at a pinned version and only loaded once a
// recording finishes, so it costs nothing at startup.
const MEDIABUNNY = "../vendor/mediabunny-1.62.1.min.mjs";

/** Resolves to a fixed-up MP4 blob, or the original blob if that isn't possible. */
export async function finalizeRecording(blob) {
  try {
    const mb = await import(MEDIABUNNY);
    const input = new mb.Input({ formats: mb.ALL_FORMATS, source: new mb.BlobSource(blob) });
    const output = new mb.Output({
      format: new mb.Mp4OutputFormat({ fastStart: "in-memory" }), // length and index at the front
      target: new mb.BufferTarget(),
    });
    const conversion = await mb.Conversion.init({
      input, output, showWarnings: false,
      video: { codec: "avc" },
      audio: { codec: "aac" },
    });
    // e.g. a WebM recording on a phone that can't encode H.264 or AAC
    if (!conversion.isValid || conversion.discardedTracks.length) return blob;
    await conversion.execute();
    return new Blob([output.target.buffer], { type: "video/mp4" });
  } catch (e) {
    console.warn("Couldn't finalize the recording; keeping the original.", e);
    return blob;
  }
}
