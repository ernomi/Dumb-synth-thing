// Live camera. Errors are thrown with a message meant for the user.
const inFrame = (() => { try { return window.self !== window.top; } catch (e) { return true; } })();

let wakeLock = null;

/** How many cameras the device has (accurate only after permission is granted). */
export async function countCameras() {
  try { return (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === "videoinput").length; }
  catch (e) { return 0; }
}

/**
 * Start a camera on `video`. Resolves to the MediaStream.
 * @param facing  "environment" (back) or "user" (front)
 */
export async function startCamera(video, facing = "environment") {
  if (!window.isSecureContext)
    throw new Error("Live camera needs a secure page. Open this file from an https:// address, not from your phone's Files app or a file:// link.");
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia)
    throw new Error("This browser doesn't offer camera access to web pages. Try Chrome on Android or Safari on iPhone.");
  let stream;
  try {
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: facing }, width: { ideal: 960 } }, audio: false });
    } catch (e) {
      if (e && (e.name === "OverconstrainedError" || e.name === "NotFoundError")) stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      else throw e;
    }
  } catch (e) {
    throw new Error(cameraErrorMessage(e));
  }
  video.muted = true; video.setAttribute("playsinline", ""); video.srcObject = stream;
  await video.play().catch(() => {});
  try { if (navigator.wakeLock) wakeLock = await navigator.wakeLock.request("screen"); } catch (e) {}
  return stream;
}

export function stopCamera(stream) {
  if (stream) stream.getTracks().forEach(t => t.stop());
  if (wakeLock) { wakeLock.release().catch(() => {}); wakeLock = null; }
}

function cameraErrorMessage(e) {
  const name = e && e.name;
  if (inFrame) return "Camera access blocked";
  if (name === "NotAllowedError" || name === "SecurityError") return "Camera permission was refused. Allow the camera for this site in your browser's site settings, then try again.";
  if (name === "NotReadableError") return "The camera is busy in another app. Close that app and try again.";
  if (name === "NotFoundError") return "No camera was found on this device.";
  return "The camera couldn't start" + (name ? " (" + name + ")" : "") + ".";
}
