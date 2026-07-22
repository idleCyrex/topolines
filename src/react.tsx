"use client";

// react.tsx — thin React wrapper over TopoField. Mirrors the source
// component's "live values in a ref" pattern: the GL context is recreated only
// when seed or maxDpr changes; every other prop flows through setOptions with
// no teardown and no flicker.

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { TopoField, type TopolinesOptions } from "./engine";

export interface TopolinesHandle {
  play(): void;
  pause(): void;
  setClock(t: number): void;
  snapshot(): string | null;
}

export type TopolinesProps = TopolinesOptions & {
  /** Rendered when WebGL/derivatives are unavailable (field.ok === false). */
  fallback?: ReactNode;
  className?: string;
  style?: CSSProperties;
};

export const Topolines = forwardRef<TopolinesHandle, TopolinesProps>(
  function Topolines(props, ref) {
    const {
      // Defaults IDENTICAL to the source component's props.
      seed = "topo",
      speed = 0.012,
      scale = 1.15,
      levels = 11,
      lineWidth = 1.2,
      opacity = 0.16,
      color = "#C3D82C",
      drift = [0.004, 0.002],
      warp = 0.18,
      scrollPan = [0, 0],
      colorStops,
      getPanScroll,
      getProgress,
      maxDpr = 1.5,
      interactive = false,
      mouseStrength = 0.35,
      mouseRadius = 0.35,
      fallback,
      className,
      style,
    } = props;

    const hostRef = useRef<HTMLDivElement | null>(null);
    const fieldRef = useRef<TopoField | null>(null);
    const [ok, setOk] = useState(true);

    // Full option set as of this render, so a freshly-created field starts from
    // current values (not the ones present when seed last changed).
    const optsRef = useRef<TopolinesOptions>(null!);
    optsRef.current = {
      seed, speed, scale, levels, lineWidth, opacity, color, drift, warp,
      scrollPan, colorStops, getPanScroll, getProgress, maxDpr, interactive,
      mouseStrength, mouseRadius,
    };

    // Recreate the GL context ONLY on seed / maxDpr change.
    useEffect(() => {
      const host = hostRef.current;
      if (!host) return;
      const field = new TopoField(host, optsRef.current);
      fieldRef.current = field;
      setOk(field.ok);
      return () => {
        field.destroy();
        fieldRef.current = null;
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [seed, maxDpr]);

    // Everything else is a live update. Layout effect so it lands before paint.
    useLayoutEffect(() => {
      fieldRef.current?.setOptions({
        speed, scale, levels, lineWidth, opacity, color, drift, warp, scrollPan,
        colorStops, getPanScroll, getProgress, interactive, mouseStrength, mouseRadius,
      });
    }, [
      speed, scale, levels, lineWidth, opacity, color, drift, warp, scrollPan,
      colorStops, getPanScroll, getProgress, interactive, mouseStrength, mouseRadius,
    ]);

    useImperativeHandle(
      ref,
      (): TopolinesHandle => ({
        play: () => fieldRef.current?.play(),
        pause: () => fieldRef.current?.pause(),
        setClock: (t) => fieldRef.current?.setClock(t),
        snapshot: () => fieldRef.current?.snapshot() ?? null,
      }),
      []
    );

    // Single mount node, exactly like the source component: the engine appends
    // its canvas imperatively, so this div carries NO React children while a
    // canvas is present. The fallback is only rendered when field.ok is false,
    // by which point the engine has already removed its canvas — the two never
    // coexist under this parent, which would otherwise break reconciliation.
    return (
      <div
        ref={hostRef}
        aria-hidden="true"
        className={className}
        style={{ display: "block", width: "100%", height: "100%", ...style }}
      >
        {ok ? null : fallback ?? null}
      </div>
    );
  }
);

export default Topolines;
