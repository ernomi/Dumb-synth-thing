// Load a user-picked image file into a canvas (max 1280 px on the long side).
// Errors are thrown with a message meant for the user.
export async function loadImageFile(file) {
  const toCanvas = (src, w, h) => {
    const sc = Math.min(1, 1280 / Math.max(w, h));
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(w * sc)); c.height = Math.max(1, Math.round(h * sc));
    c.getContext("2d").drawImage(src, 0, 0, c.width, c.height);
    return c;
  };
  // 1) createImageBitmap reads the file directly and honours EXIF rotation
  if (window.createImageBitmap) {
    try {
      let bmp;
      try { bmp = await createImageBitmap(file, { imageOrientation: "from-image" }); }
      catch (e) { bmp = await createImageBitmap(file); }
      const c = toCanvas(bmp, bmp.width, bmp.height); if (bmp.close) bmp.close(); return c;
    } catch (e) { /* fall through */ }
  }
  // 2) Read as a data: URL into an <img>
  try {
    const url = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error); r.readAsDataURL(file); });
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    return toCanvas(img, img.naturalWidth, img.naturalHeight);
  } catch (e) { /* fall through */ }
  const heic = /heic|heif/i.test(file.type) || /\.hei[cf]$/i.test(file.name || "");
  throw new Error(heic
    ? "This browser can't read HEIC photos. On iPhone, set Settings › Camera › Formats to Most Compatible, or upload a JPEG or PNG."
    : "That file couldn't be opened as an image" + (file.type ? " (" + file.type + ")" : "") + ". Try a JPEG or PNG.");
}
