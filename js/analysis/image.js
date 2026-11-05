// Browser glue: downscale any drawable (video, image, canvas) and run detection on it.
import { analyzePixels } from "./detect.js";

export const ANALYSIS_WIDTH = 256; // analysis width in pixels

const work = document.createElement("canvas");
const wctx = work.getContext("2d", { willReadFrequently: true });

/** @returns {{W:number,H:number,objects:object[],scene:object}} */
export function analyzeImage(src, sw, sh, polarity) {
  const W = ANALYSIS_WIDTH, H = Math.max(8, Math.round(W * sh / sw));
  work.width = W; work.height = H;
  wctx.drawImage(src, 0, 0, W, H);
  return analyzePixels(wctx.getImageData(0, 0, W, H).data, W, H, polarity);
}
