// Turn a recording into a named file and hand it to the phone's share sheet.

export function isMp4(blob) { return /mp4/i.test(blob.type); }

export function videoFile(blob) {
  const d = new Date(), p = n => String(n).padStart(2, "0");
  const stamp = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
  const type = blob.type.split(";")[0] || "video/webm";
  return new File([blob], `pocket-wizard-${stamp}.${isMp4(blob) ? "mp4" : "webm"}`, { type });
}

export function canShareFile(file) {
  try { return !!(navigator.canShare && navigator.canShare({ files: [file] })); } catch (e) { return false; }
}

/** Must be called from a tap. Resolves to "shared", "cancelled" or "failed". */
export async function shareFile(file) {
  try {
    // Files only: adding title/text makes some apps (Instagram among them) drop the video
    await navigator.share({ files: [file] });
    return "shared";
  } catch (e) {
    return e && e.name === "AbortError" ? "cancelled" : "failed";
  }
}
