// Small shared helpers.
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// Smoothstep on 0..1
export const smoothstep = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
