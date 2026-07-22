// index.ts — vanilla entry point. SSR-safe to import: no window/document access
// runs at module top level.

export { TopoField, DEFAULTS } from "./engine";
export type { TopolinesOptions, ColorStop } from "./engine";
export { isSupported } from "./support";
export { randomSeed, seedOffset } from "./seed";
export { parseColor } from "./color";
export { PRESETS } from "./presets";
export type { Preset } from "./presets";
