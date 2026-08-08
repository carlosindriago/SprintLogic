// SENSEI FIX: Nuestro escudo, protegiendo contra los undefined y las mutaciones de D3.
export const getSafeTime = (nodeRef: unknown): number => {
  if (!nodeRef || typeof nodeRef !== 'object') return 0;
  const value = (nodeRef as { birth_time?: unknown }).birth_time;
  return typeof value === 'number' ? value : 0;
};

// Normalize any label casing to TitleCase ("file" -> "File") — must match activeTypes set values exactly.
export const toTitleCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();

// ── Visual helpers ────────────────────────────────────────────────────

// Draw a rounded square centered at (cx, cy) with half-size r
export function drawRoundedSquare(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  const rad = r * 0.35;
  const x = cx - r, y = cy - r, w = r * 2, h = r * 2;
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.lineTo(x + w - rad, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rad);
  ctx.lineTo(x + w, y + h - rad);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rad, y + h);
  ctx.lineTo(x + rad, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rad);
  ctx.lineTo(x, y + rad);
  ctx.quadraticCurveTo(x, y, x + rad, y);
  ctx.closePath();
}

// Draw a diamond (rotated square) centered at (cx, cy) with half-size r
export function drawDiamond(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(cx, cy - r);
  ctx.lineTo(cx + r, cy);
  ctx.lineTo(cx, cy + r);
  ctx.lineTo(cx - r, cy);
  ctx.closePath();
}

// Draw a triangle pointing up centered at (cx, cy) with half-size r
export function drawTriangle(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(cx, cy - r);
  ctx.lineTo(cx + r * 0.87, cy + r * 0.5);
  ctx.lineTo(cx - r * 0.87, cy + r * 0.5);
  ctx.closePath();
}
