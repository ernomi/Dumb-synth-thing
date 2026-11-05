// Built-in sample scene, shown before the user picks a camera or photo.
const SAMPLE_URL = new URL("../../hourglass_2.png", import.meta.url);

let pending = null;

/** Loads the sample image once and resolves to a canvas holding it. */
export function loadSample() {
  if (!pending) {
    pending = new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement("canvas");
        c.width = img.naturalWidth; c.height = img.naturalHeight;
        c.getContext("2d").drawImage(img, 0, 0);
        resolve(c);
      };
      img.onerror = () => { pending = null; reject(new Error("The sample image couldn't be loaded. Try the camera or upload a photo instead.")); };
      img.src = SAMPLE_URL;
    });
  }
  return pending;
}
