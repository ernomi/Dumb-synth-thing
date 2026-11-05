// Built-in sample scene, shown before the user picks a camera or photo.
export function makeSample() {
  const c = document.createElement("canvas"); c.width = 640; c.height = 480;
  const x = c.getContext("2d");
  const g = x.createLinearGradient(0, 0, 0, 480);
  g.addColorStop(0, "#e9edf1"); g.addColorStop(1, "#cfd6de");
  x.fillStyle = g; x.fillRect(0, 0, 640, 480);
  // big warm circle, close
  x.fillStyle = "#d4502a"; x.beginPath(); x.arc(175, 352, 92, 0, Math.PI * 2); x.fill();
  // medium blue square, mid distance
  x.fillStyle = "#2f5fd0"; x.save(); x.translate(430, 300); x.rotate(0.21); x.fillRect(-58, -58, 116, 116); x.restore();
  // small golden triangle, far
  x.fillStyle = "#d99a1e"; x.beginPath(); x.moveTo(310, 70); x.lineTo(345, 132); x.lineTo(275, 132); x.closePath(); x.fill();
  // teal star, mid-far
  x.fillStyle = "#138a8a"; x.beginPath();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? 18 : 44, a = -Math.PI / 2 + i * Math.PI / 5;
    x.lineTo(540 + r * Math.cos(a), 150 + r * Math.sin(a));
  }
  x.closePath(); x.fill();
  return c;
}
