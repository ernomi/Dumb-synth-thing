// Draws the vertical (9:16) frame that gets recorded: the camera or photo,
// center-cropped to fill the frame, plus the shape outlines if they're on.
import { drawOverlay, drawSource, mirrorRect } from "../ui/render.js";

export const REC_WIDTH = 720, REC_HEIGHT = 1280;

export function createRecordCanvas() {
  const c = document.createElement("canvas");
  c.width = REC_WIDTH; c.height = REC_HEIGHT;
  return c;
}

/**
 * @param src        video, image or canvas (or null for a black frame)
 * @param sw, sh     source size in pixels
 * @param overlay    null, or { tracks, aw, ah } to draw shape outlines
 * @param mirror     flip left-to-right (front camera), matching the screen
 */
export function drawRecordFrame(ctx, src, sw, sh, overlay, mirror) {
  const W = ctx.canvas.width, H = ctx.canvas.height;
  ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, H);
  if (!src || !sw || !sh) return;
  const s = Math.max(W / sw, H / sh), w = sw * s, h = sh * s;
  const rect = { x: (W - w) / 2, y: (H - h) / 2, w, h };
  drawSource(ctx, src, rect, mirror);
  if (overlay) drawOverlay(ctx, overlay.tracks, overlay.aw, overlay.ah, mirror ? mirrorRect(rect) : rect, W * 1.5);
}
