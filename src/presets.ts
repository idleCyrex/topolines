// presets.ts — the six shipped looks, tuned on the dark bg #0D0D0B.

import type { TopolinesOptions } from "./engine";

export interface Preset {
  /** Stable id used in URLs (e.g. ?preset=relief). */
  id: string;
  /** Display name, numbered and cartographic. */
  name: string;
  /** Option overrides layered on top of the defaults. */
  options: TopolinesOptions;
}

export const PRESETS: Preset[] = [
  {
    id: "relief",
    name: "Relief",
    options: { color: "#F2EFE6", opacity: 0.34, warp: 0.22 },
  },
  {
    id: "ridgeline",
    name: "Ridgeline",
    options: {
      scale: 0.8,
      levels: 8,
      lineWidth: 1.6,
      color: "#FF4D00",
      opacity: 0.5,
      warp: 0.3,
    },
  },
  {
    id: "survey",
    name: "Survey",
    options: {
      scale: 1.6,
      levels: 18,
      lineWidth: 0.8,
      color: "#9EC7E8",
      opacity: 0.4,
      warp: 0.12,
    },
  },
  {
    id: "basin",
    name: "Basin",
    options: {
      scale: 0.6,
      levels: 12,
      color: "#C3D82C",
      opacity: 0.42,
      warp: 0.05,
      speed: 0.02,
    },
  },
  {
    id: "glass",
    name: "Glass",
    options: {
      warp: 0,
      levels: 7,
      lineWidth: 2.2,
      color: "#C9B8E8",
      opacity: 0.3,
      speed: 0.006,
    },
  },
  {
    id: "drift",
    name: "Drift",
    options: {
      drift: [0.02, 0.01],
      speed: 0.03,
      levels: 10,
      color: "#A8B89A",
      opacity: 0.38,
    },
  },
];
