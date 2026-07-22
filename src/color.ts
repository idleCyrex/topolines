// color.ts — parse any CSS color to 0..1 RGB via a shared offscreen 2D canvas.

/** Lazily-created shared parse canvas. `undefined` = not yet tried, `null` = no
 *  2D context available (kept out of module scope so importing is SSR-safe). */
let ctx2d: CanvasRenderingContext2D | null | undefined;

function devWarn(msg: string): void {
  // Gate on NODE_ENV without pulling in Node types; silent in production builds.
  const g = globalThis as { process?: { env?: { NODE_ENV?: string } } };
  if (g.process?.env?.NODE_ENV === "production") return;
  if (typeof console !== "undefined") console.warn(msg);
}

/**
 * Parse any CSS color string (`#hex`, `rgb()/rgba()`, `hsl()`, named, etc.)
 * into linear-free `[r, g, b]` components in the 0..1 range. On an
 * unrecognized color it dev-warns and falls back to white `[1, 1, 1]`.
 */
export function parseColor(c: string): [number, number, number] {
  if (ctx2d === undefined) {
    ctx2d =
      typeof document !== "undefined"
        ? document.createElement("canvas").getContext("2d")
        : null;
  }
  if (!ctx2d) {
    devWarn(`topolines: no 2D canvas available to parse color "${c}"`);
    return [1, 1, 1];
  }

  // Validity check: a real color normalizes to the same string from two
  // different fallbacks; an invalid one leaves each fallback in place and the
  // two disagree.
  ctx2d.fillStyle = "#000";
  ctx2d.fillStyle = c;
  const first = ctx2d.fillStyle;
  ctx2d.fillStyle = "#fff";
  ctx2d.fillStyle = c;
  if (ctx2d.fillStyle !== first) {
    devWarn(`topolines: unrecognized color "${c}", falling back to white`);
    return [1, 1, 1];
  }

  // Draw one pixel and read it back — robust across every accepted format.
  ctx2d.clearRect(0, 0, 1, 1);
  ctx2d.fillRect(0, 0, 1, 1);
  const d = ctx2d.getImageData(0, 0, 1, 1).data;
  return [d[0] / 255, d[1] / 255, d[2] / 255];
}
