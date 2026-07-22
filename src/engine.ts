// engine.ts — framework-agnostic renderer. Extracted from the source
// component's effect body: fresh canvas per instance, GL setup, live uniforms,
// the rAF loop, IntersectionObserver + visibilitychange + prefers-reduced-motion
// + ResizeObserver wiring, dt clamp, premultiplied blending, full cleanup.

import { parseColor } from "./color";
import { seedOffset } from "./seed";
import { buildProgram } from "./shader";

/** A stop in a scroll-driven colour journey. */
export interface ColorStop {
  /** Progress 0..1 at which this stop applies. */
  at: number;
  /** Line colour at this stop (any CSS color). */
  color: string;
  /** Line opacity at this stop. */
  opacity: number;
}

export interface TopolinesOptions {
  /** Any string. Same seed = same starting pattern. */
  seed?: string;
  /** Time multiplier. ~0.012 ≈ 10px/sec of contour drift. 0 freezes it. */
  speed?: number;
  /** Noise frequency. Lower = larger, sweepier landforms. */
  scale?: number;
  /** Number of contour bands. More = denser line packing. */
  levels?: number;
  /** Line thickness in CSS pixels. Stays constant regardless of field steepness. */
  lineWidth?: number;
  /** Line opacity. 0.16 matches the reference's barely-there look. */
  opacity?: number;
  /** Line colour. Any CSS color string. */
  color?: string;
  /** Slow translation across the field, in units/sec. Adds sideways drift. */
  drift?: [number, number];
  /** Domain warp strength. 0 = smooth blobs, ~0.2 = meandering, terrain-like. */
  warp?: number;
  /** Noise-units panned per scrolled pixel [x, y]. Scrolling travels across
   *  the field, so each section sits on a different part of the map. */
  scrollPan?: [number, number];
  /** Override the scroll value the pan reads. Lets the host freeze the map's
   *  travel across a range (e.g. a pinned scene) by clamping scrollY. */
  getPanScroll?: () => number;
  /** Scroll-driven recolouring. `at` is progress 0..1; between two stops the
   *  line colour/opacity is lerped, outside the band the nearest stop holds.
   *  Overrides `color`/`opacity` when present. */
  colorStops?: ColorStop[];
  /** Progress source (0..1) that drives `colorStops`. Defaults to document
   *  scroll progress, the original component's behaviour. */
  getProgress?: () => number;
  /** Cap on devicePixelRatio. This is fragment-bound, so 1.5 is plenty. */
  maxDpr?: number;
  /** Follow the cursor: raise the field near the pointer so contour rings
   *  bloom around it. Listens on window pointermove. */
  interactive?: boolean;
  /** Peak height of the mouse bump when `interactive`. */
  mouseStrength?: number;
  /** Falloff radius of the mouse bump, in field (stBase) units. */
  mouseRadius?: number;
}

/** Options with every non-callback field resolved to a concrete value. */
interface Resolved {
  seed: string;
  speed: number;
  scale: number;
  levels: number;
  lineWidth: number;
  opacity: number;
  color: string;
  drift: [number, number];
  warp: number;
  scrollPan: [number, number];
  maxDpr: number;
  interactive: boolean;
  mouseStrength: number;
  mouseRadius: number;
  getPanScroll?: () => number;
  colorStops?: ColorStop[];
  getProgress?: () => number;
}

/** Defaults IDENTICAL to the source component's props. */
export const DEFAULTS: Resolved = {
  seed: "topo",
  speed: 0.012,
  scale: 1.15,
  levels: 11,
  lineWidth: 1.2,
  opacity: 0.16,
  color: "#C3D82C",
  drift: [0.004, 0.002],
  warp: 0.18,
  scrollPan: [0, 0],
  maxDpr: 1.5,
  interactive: false,
  mouseStrength: 0.35,
  mouseRadius: 0.35,
};

/** Merge a partial over a base, ignoring `undefined` (so absent keys keep the
 *  base value). Used at construction to fill defaults from a partial. */
function mergeDefined(base: Resolved, patch: TopolinesOptions): Resolved {
  const out: Resolved = { ...base };
  (Object.keys(patch) as (keyof TopolinesOptions)[]).forEach((k) => {
    const v = patch[k];
    if (v !== undefined) (out as unknown as Record<string, unknown>)[k] = v;
  });
  return out;
}

const clamp01 = (n: number): number => Math.min(1, Math.max(0, n));

export class TopoField {
  /** False when WebGL/derivatives are unavailable — the constructor then
   *  mounted nothing and every method is a no-op. */
  public ok = false;

  private host: HTMLElement;
  private live: Resolved;

  // GL state — only valid when `ok`.
  private canvas!: HTMLCanvasElement;
  private gl!: WebGLRenderingContext;
  private program!: WebGLProgram;
  private buffer!: WebGLBuffer | null;
  private uRes!: WebGLUniformLocation | null;
  private uTime!: WebGLUniformLocation | null;
  private uSeed!: WebGLUniformLocation | null;
  private uScale!: WebGLUniformLocation | null;
  private uLevels!: WebGLUniformLocation | null;
  private uLineWidth!: WebGLUniformLocation | null;
  private uOpacity!: WebGLUniformLocation | null;
  private uColor!: WebGLUniformLocation | null;
  private uDrift!: WebGLUniformLocation | null;
  private uWarp!: WebGLUniformLocation | null;
  private uScrollOff!: WebGLUniformLocation | null;
  private uMouse!: WebGLUniformLocation | null;
  private uMouseBump!: WebGLUniformLocation | null;
  private uMouseRadius!: WebGLUniformLocation | null;

  private reduceMotion!: MediaQueryList;
  private io?: IntersectionObserver;
  private ro?: ResizeObserver;

  // Runtime state.
  private width = 0;
  private height = 0;
  private clock = 0; // accumulated animation time, independent of wall clock
  private last = 0;
  private raf = 0;
  private visible = true;
  private running = false;
  private seedX = 0;
  private seedY = 0;

  // Mouse state. `mouseN*` is the normalized (scale-free, DPR-free) pointer
  // position; `mouse*` is its smoothed value in stBase space; `bump` is the
  // eased strength sent to the shader.
  private mouseNX = 0;
  private mouseNY = 0;
  private mouseX = 0;
  private mouseY = 0;
  private bump = 0;
  private pointerInside = false;

  constructor(host: HTMLElement, options: TopolinesOptions = {}) {
    this.host = host;
    this.live = mergeDefined(DEFAULTS, options);
    const [sx, sy] = seedOffset(this.live.seed);
    this.seedX = sx;
    this.seedY = sy;

    // A FRESH canvas per instance. React dev StrictMode mounts an effect
    // mount → cleanup → mount on the same DOM node; cleanup calls
    // loseContext(), which kills that canvas's context forever, and a reused
    // canvas would hand the second mount the same dead context back.
    const canvas = document.createElement("canvas");
    canvas.style.cssText = "display:block;width:100%;height:100%";
    host.appendChild(canvas);
    this.canvas = canvas;

    const gl = canvas.getContext("webgl", {
      alpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      premultipliedAlpha: true,
      // preserveDrawingBuffer stays false: snapshot() draws and reads in the
      // same tick, so we get correct pixels without the perf cost.
      powerPreference: "low-power",
    });

    // No WebGL (or software-blocked): drop the canvas so whatever is behind the
    // host — e.g. a static fallback — shows through.
    const bail = (): void => {
      gl?.getExtension("WEBGL_lose_context")?.loseContext();
      if (canvas.parentNode === host) host.removeChild(canvas);
      this.ok = false;
    };
    if (!gl) {
      bail();
      return;
    }

    // fwidth() lives behind an extension in WebGL1. Without it we can't keep
    // line width uniform, so bail rather than render something wrong.
    if (!gl.getExtension("OES_standard_derivatives")) {
      bail();
      return;
    }

    const program = buildProgram(gl);
    if (!program) {
      bail();
      return;
    }

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    // One oversized triangle covers the viewport with no wasted vertices.
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 3, -1, -1, 3]),
      gl.STATIC_DRAW
    );

    const aPos = gl.getAttribLocation(program, "aPos");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    const u = (n: string) => gl.getUniformLocation(program, n);
    this.gl = gl;
    this.program = program;
    this.buffer = buffer;
    this.uRes = u("uRes");
    this.uTime = u("uTime");
    this.uSeed = u("uSeed");
    this.uScale = u("uScale");
    this.uLevels = u("uLevels");
    this.uLineWidth = u("uLineWidth");
    this.uOpacity = u("uOpacity");
    this.uColor = u("uColor");
    this.uDrift = u("uDrift");
    this.uWarp = u("uWarp");
    this.uScrollOff = u("uScrollOff");
    this.uMouse = u("uMouse");
    this.uMouseBump = u("uMouseBump");
    this.uMouseRadius = u("uMouseRadius");

    gl.useProgram(program);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); // premultiplied

    this.reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    this.resize();

    // Don't burn GPU on a background that isn't on screen.
    this.io = new IntersectionObserver(([entry]) => {
      this.visible = entry.isIntersecting;
      this.visible ? this.start() : this.stop();
    });
    this.io.observe(canvas);

    this.ro = new ResizeObserver(() => {
      this.resize();
      if (!this.running) this.render(); // keep it correct while paused
    });
    this.ro.observe(canvas);

    document.addEventListener("visibilitychange", this.onVisibility);
    this.reduceMotion.addEventListener("change", this.onMotionChange);
    window.addEventListener("pointermove", this.onPointerMove);
    document.documentElement.addEventListener("pointerleave", this.onPointerLeave);
    window.addEventListener("blur", this.onPointerLeave);

    this.ok = true;
    this.render(); // paint immediately, before the first rAF
    this.start();
  }

  // -------------------------------------------------------------- public API

  /** Live-update options. Never rebuilds the program or context. */
  setOptions(patch: TopolinesOptions): void {
    if (patch.seed !== undefined && patch.seed !== this.live.seed) {
      const [sx, sy] = seedOffset(patch.seed);
      this.seedX = sx;
      this.seedY = sy;
    }
    Object.assign(this.live, patch);
    // Reflect changes right away on paused / reduced-motion instances.
    if (this.ok && !this.running) this.render();
  }

  play(): void {
    if (this.ok) this.start();
  }

  pause(): void {
    if (this.ok) this.stop();
  }

  /** Set the accumulated animation time directly. */
  setClock(t: number): void {
    this.clock = t;
    if (this.ok && !this.running) this.render();
  }

  /** Render one frame and read it back as a data URL. Returns null when not ok.
   *  Draw-then-read in the same tick is required because the context is not
   *  preserveDrawingBuffer. */
  snapshot(): string | null {
    if (!this.ok) return null;
    this.resize();
    this.render();
    return this.canvas.toDataURL("image/png");
  }

  /** Full teardown: stop the loop, disconnect observers, remove listeners,
   *  delete GL objects, force the context loss, drop the canvas. */
  destroy(): void {
    if (!this.ok) return;
    this.stop();
    this.io?.disconnect();
    this.ro?.disconnect();
    document.removeEventListener("visibilitychange", this.onVisibility);
    this.reduceMotion.removeEventListener("change", this.onMotionChange);
    window.removeEventListener("pointermove", this.onPointerMove);
    document.documentElement.removeEventListener("pointerleave", this.onPointerLeave);
    window.removeEventListener("blur", this.onPointerLeave);
    this.gl.deleteBuffer(this.buffer);
    this.gl.deleteProgram(this.program);
    this.gl.getExtension("WEBGL_lose_context")?.loseContext();
    if (this.canvas.parentNode === this.host) this.host.removeChild(this.canvas);
    this.ok = false;
  }

  // ---------------------------------------------------------------- internals

  private start = (): void => {
    // prefers-reduced-motion: paint one static frame (done elsewhere), never loop.
    if (this.running || !this.visible || this.reduceMotion.matches) return;
    this.running = true;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  };

  private stop = (): void => {
    this.running = false;
    cancelAnimationFrame(this.raf);
  };

  private frame = (now: number): void => {
    // Clamp dt so a backgrounded tab doesn't jump the pattern on return.
    const dt = Math.min((now - this.last) / 1000, 0.1);
    this.last = now;
    this.resize();
    this.clock += dt * this.live.speed;
    this.tickMouse();
    this.render();
    this.raf = requestAnimationFrame(this.frame);
  };

  private tickMouse(): void {
    const p = this.live;
    // Ease the bump toward strength while the pointer is in the viewport and
    // interactive is on, else toward 0.
    const target = p.interactive && this.pointerInside ? p.mouseStrength : 0;
    this.bump += (target - this.bump) * 0.08;
    // Lerp the smoothed position toward the live target (scale can change).
    const tx = this.mouseNX * p.scale;
    const ty = this.mouseNY * p.scale;
    this.mouseX += (tx - this.mouseX) * 0.06;
    this.mouseY += (ty - this.mouseY) * 0.06;
  }

  private progress(): number {
    if (this.live.getProgress) return clamp01(this.live.getProgress());
    if (typeof window === "undefined") return 0;
    const doc = document.documentElement;
    return clamp01(
      (window.scrollY || 0) / Math.max(1, doc.scrollHeight - window.innerHeight)
    );
  }

  private resize(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, this.live.maxDpr);
    const w = Math.max(1, Math.round(this.canvas.clientWidth * dpr));
    const h = Math.max(1, Math.round(this.canvas.clientHeight * dpr));
    if (w === this.width && h === this.height) return;
    this.width = w;
    this.height = h;
    this.canvas.width = w;
    this.canvas.height = h;
    this.gl.viewport(0, 0, w, h);
  }

  private render = (): void => {
    const p = this.live;
    const gl = this.gl;

    let [r, g, b] = parseColor(p.color);
    let alpha = p.opacity;
    // Scroll-driven recolouring between stops (see colorStops docs).
    const s = p.colorStops;
    if (s && s.length) {
      const prog = this.progress();
      let lo = s[0];
      let hi = s[s.length - 1];
      if (prog <= lo.at) {
        [r, g, b] = parseColor(lo.color);
        alpha = lo.opacity;
      } else if (prog >= hi.at) {
        [r, g, b] = parseColor(hi.color);
        alpha = hi.opacity;
      } else {
        for (let i = 0; i < s.length - 1; i++) {
          if (prog >= s[i].at && prog <= s[i + 1].at) {
            lo = s[i];
            hi = s[i + 1];
            break;
          }
        }
        const t = (prog - lo.at) / (hi.at - lo.at || 1e-6);
        const ca = parseColor(lo.color);
        const cb = parseColor(hi.color);
        r = ca[0] + (cb[0] - ca[0]) * t;
        g = ca[1] + (cb[1] - ca[1]) * t;
        b = ca[2] + (cb[2] - ca[2]) * t;
        alpha = lo.opacity + (hi.opacity - lo.opacity) * t;
      }
    }

    gl.uniform2f(this.uRes, this.width, this.height);
    gl.uniform1f(this.uTime, this.clock);
    gl.uniform2f(this.uSeed, this.seedX, this.seedY);
    gl.uniform1f(this.uScale, p.scale);
    gl.uniform1f(this.uLevels, p.levels);
    gl.uniform1f(this.uLineWidth, p.lineWidth);
    gl.uniform1f(this.uOpacity, alpha);
    gl.uniform3f(this.uColor, r, g, b);
    gl.uniform2f(this.uDrift, p.drift[0], p.drift[1]);
    gl.uniform1f(this.uWarp, p.warp);
    // Scroll pans the field: read scrollY at draw time so the map slides to a
    // different region as the page moves. Y is negated — scrolling down should
    // feel like travelling "up" the chart. getPanScroll lets the host clamp the
    // value so pinned scenes don't drag the map with them.
    const sy2 = p.getPanScroll ? p.getPanScroll() : window.scrollY || 0;
    gl.uniform2f(this.uScrollOff, sy2 * p.scrollPan[0], -sy2 * p.scrollPan[1]);
    gl.uniform2f(this.uMouse, this.mouseX, this.mouseY);
    gl.uniform1f(this.uMouseBump, this.bump);
    // Clamp radius so the shader's exp(-d/r^2) never divides by zero.
    gl.uniform1f(this.uMouseRadius, Math.max(p.mouseRadius, 1e-3));

    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };

  private onVisibility = (): void => {
    document.hidden ? this.stop() : this.start();
  };

  private onMotionChange = (): void => {
    this.stop();
    this.resize();
    this.render(); // always paint one static frame
    this.start();
  };

  private onPointerMove = (e: PointerEvent): void => {
    this.pointerInside = true;
    const rect = this.canvas.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;
    if (w <= 0 || h <= 0) return;
    // Convert to gl_FragCoord's bottom-left origin, then to the normalized,
    // scale-free stN space (DPR cancels because it is a ratio).
    const fx = e.clientX - rect.left;
    const fy = h - (e.clientY - rect.top);
    const m = Math.min(w, h);
    this.mouseNX = (fx - 0.5 * w) / m;
    this.mouseNY = (fy - 0.5 * h) / m;
  };

  private onPointerLeave = (): void => {
    this.pointerInside = false;
  };
}
