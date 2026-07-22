import { defineConfig } from "tsup";

export default defineConfig([
  {
    entry: { index: "src/index.ts" },
    format: ["esm", "cjs"],
    dts: true,
    sourcemap: true,
    clean: true,
    external: ["react", "react-dom"],
  },
  {
    entry: { react: "src/react.tsx" },
    format: ["esm", "cjs"],
    dts: true,
    sourcemap: true,
    clean: false,
    external: ["react", "react-dom"],
    banner: { js: '"use client";' },
  },
]);
