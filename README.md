# topolines

Animated topographic contour backgrounds. One React component, zero dependencies, drawn on the GPU.

## Install

```
npm i topolines
```

## React quick start

```tsx
import { Topolines } from "topolines/react";

export default function Hero() {
  return <Topolines seed="topolines" color="#F2EFE6" style={{ position: "fixed", inset: 0 }} />;
}
```

## Vanilla quick start

```ts
import { TopoField } from "topolines";

const field = new TopoField(document.getElementById("host")!, {
  seed: "topolines",
  color: "#F2EFE6",
});

// later
field.pause();
field.destroy();
```

## No build step

Works straight from a CDN in a plain HTML file, no npm and no bundler needed:

```html
<div id="topolines-bg" style="position:fixed;inset:0"></div>

<script type="module">
  import { TopoField } from "https://esm.sh/topolines";

  const field = new TopoField(document.getElementById("topolines-bg"), {
    seed: "hero",
  });
</script>
```

## Props (`TopolinesOptions`)

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `seed` | `string` | `"topo"` | Seeds the noise offset. Same seed renders the same field. |
| `speed` | `number` | `0.012` | Animation speed of the field over time. |
| `scale` | `number` | `1.15` | Zoom level of the contour field. |
| `levels` | `number` | `11` | Number of contour bands. |
| `lineWidth` | `number` | `1.2` | Line thickness of each contour. |
| `opacity` | `number` | `0.16` | Overall opacity of the drawn lines. |
| `color` | `string` | `"#C3D82C"` | Line color. Accepts any CSS color. |
| `drift` | `[number, number]` | `[0.004, 0.002]` | Constant x/y drift applied to the field per frame. |
| `warp` | `number` | `0.18` | Amount of domain warp applied to the noise. |
| `scrollPan` | `[number, number]` | `[0, 0]` | Extra pan offset, in the same space as drift, useful for pinned sections. |
| `colorStops` | `{ at: number; color: string }[]` \| `undefined` | `undefined` | Color keyframes interpolated by `getProgress()`. |
| `getPanScroll` | `() => [number, number]` \| `undefined` | `undefined` | Overrides the pan offset per frame, for example to freeze pan across a pinned section. |
| `getProgress` | `() => number` \| `undefined` | document scroll progress | Drives `colorStops`. Defaults to the page scroll fraction. |
| `maxDpr` | `number` | `1.5` | Caps device pixel ratio used for rendering. |
| `interactive` | `boolean` | `false` | Enables the cursor bump: contour rings bloom around the pointer. |
| `mouseStrength` | `number` | `0.35` | Strength of the cursor bump when `interactive` is on. |
| `mouseRadius` | `number` | `0.35` | Radius of the cursor bump when `interactive` is on. |
| `fallback` | `ReactNode` | `null` | Rendered instead of the canvas when WebGL is unsupported (React only). |
| `className` | `string` \| `undefined` | `undefined` | Class applied to the host element (React only). |
| `style` | `CSSProperties` \| `undefined` | `undefined` | Style applied to the host element (React only). |

## Notes

- SSR-safe. No `window`/`document` access at module load, safe to import in a Next.js server component tree.
- Pauses automatically when the canvas is offscreen or the tab is hidden, and resumes when visible again.
- Respects `prefers-reduced-motion`: renders one static frame instead of animating.
- Requires WebGL1 with the `OES_standard_derivatives` extension. Check ahead of time with `isSupported()`, or pass a `fallback` to the React component for automatic handling.
- If the environment lacks support, the component mounts nothing and reports `isSupported() === false` / a `TopoField` instance with `.ok === false`.

Docs and interactive playground: https://topolines.idlee.xyz
Source: https://github.com/idleCyrex/topolines

## License

MIT. Includes a simplex noise implementation from webgl-noise, by Ashima Arts and Stefan Gustavson (MIT). See LICENSE.
