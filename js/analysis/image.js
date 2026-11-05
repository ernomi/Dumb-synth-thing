// Browser glue: downscale any drawable (video, image, canvas) and run detection on it.
import { analyzePixels } from "./detect.js";

export const ANALYSIS_WIDTH = 256; // analysis width in pixels

const work = document.createElement("canvas");
const wctx = work.getContext("2d", { willReadFrequently: true });

/**
 * @param crop  optional { x, y, w, h } part of the source to analyze (for zoom)
 * @returns {{W:number,H:number,objects:object[],scene:object}}
 */
export function analyzeImage(src, sw, sh, polarity, crop) {
  const c = crop || { x: 0, y: 0, w: sw, h: sh };
  const W = ANALYSIS_WIDTH, H = Math.max(8, Math.round(W * c.h / c.w));
  work.width = W; work.height = H;
  wctx.drawImage(src, c.x, c.y, c.w, c.h, 0, 0, W, H);
  return analyzePixels(wctx.getImageData(0, 0, W, H).data, W, H, polarity);
}
