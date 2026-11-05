// Two-finger pinch and trackpad pinch (ctrl + wheel) on an element.
// One-finger scrolling still scrolls the page.
/**
 * @param el       element to listen on
 * @param opts     { enabled(): boolean, start(): number (current value), change(value) }
 */
export function onPinch(el, { enabled, start, change }) {
  let base = null; // { dist, value }
  const dist = t => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);

  el.addEventListener("touchstart", e => {
    if (e.touches.length !== 2 || !enabled()) return;
    base = { dist: dist(e.touches) || 1, value: start() };
    e.preventDefault(); // stop the browser zooming the page instead
  }, { passive: false });

  el.addEventListener("touchmove", e => {
    if (!base || e.touches.length !== 2) return;
    e.preventDefault();
    change(base.value * dist(e.touches) / base.dist);
  }, { passive: false });

  const end = e => { if (e.touches.length < 2) base = null; };
  el.addEventListener("touchend", end);
  el.addEventListener("touchcancel", end);

  // Trackpad pinch arrives as a wheel event with ctrlKey set (also Ctrl + mouse wheel)
  el.addEventListener("wheel", e => {
    if (!e.ctrlKey || !enabled()) return;
    e.preventDefault();
    change(start() * Math.exp(-e.deltaY * 0.01));
  }, { passive: false });
}
