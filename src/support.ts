// support.ts — capability probe for WebGL1 + the derivatives extension.

let cached: boolean | null = null;

/**
 * True when the browser can run the field: WebGL1 plus
 * `OES_standard_derivatives` (needed for the `fwidth()` line-width technique).
 * Result is cached. SSR-safe: returns false without caching when there is no
 * `document`, so the client can probe for real after hydration.
 */
export function isSupported(): boolean {
  if (cached !== null) return cached;
  if (typeof document === "undefined") return false;
  try {
    const canvas = document.createElement("canvas");
    const gl = (canvas.getContext("webgl") ||
      canvas.getContext("experimental-webgl")) as WebGLRenderingContext | null;
    cached = !!(gl && gl.getExtension("OES_standard_derivatives"));
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
  } catch {
    cached = false;
  }
  return cached;
}
