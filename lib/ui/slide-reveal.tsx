"use client";

// SlideReveal — shared expand/collapse primitive.
//
// Calm motion vocabulary: one easing (cubic-bezier(0.22, 1, 0.36, 1))
// across every collapsible surface in Ambo. But duration *scales with
// height* so edge velocity stays constant — a 600px reading body and
// a 120px seed expansion should feel like they're moving at the same
// pace, not crashing open in the same 640ms.
//
// Formula: duration = clamp(MIN, BASE + height * PX_MS, MAX).
// At ~160px you get ~640ms; at ~600px you get ~960ms; cap is 1100ms
// so nothing ever drags past a single calm breath.
//
// Animates max-height + opacity + small translateY + vertical margins.
// On open, after the transition finishes we let max-height go back to
// "auto" so dynamic content inside (textarea growth, late loads) isn't
// clipped. On close, we snapshot the current scrollHeight first, then
// drop to 0 on the next frame so the browser has a start value to
// interpolate from.

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

const EASE = "cubic-bezier(0.22, 1, 0.36, 1)";
const MIN_MS = 640;
const MAX_MS = 1100;
const PX_PER_MS = 0.55; // ~0.55ms per pixel past 200px — gentle ramp

function durationFor(height: number): number {
  const extra = Math.max(0, height - 160) * PX_PER_MS;
  return Math.min(MAX_MS, Math.max(MIN_MS, MIN_MS + extra));
}

type Props = {
  open: boolean;
  children: ReactNode;
  marginTop?: number;
  marginBottom?: number;
  style?: CSSProperties;
};

export function SlideReveal({ open, children, marginTop = 0, marginBottom = 0, style }: Props) {
  const inner = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | "auto">(open ? "auto" : 0);
  const [duration, setDuration] = useState(MIN_MS);
  const firstRun = useRef(true);

  useEffect(() => {
    if (!inner.current) return;

    if (firstRun.current) {
      firstRun.current = false;
      if (!open) return;
    }

    if (open) {
      const target = inner.current.scrollHeight;
      const d = durationFor(target);
      setDuration(d);
      setHeight(target);
      const t = setTimeout(() => setHeight("auto"), d + 20);
      return () => clearTimeout(t);
    } else {
      // Snapshot current height, then drop to 0 on the next frame.
      const current = inner.current.scrollHeight;
      const d = durationFor(current);
      setDuration(d);
      setHeight(current);
      requestAnimationFrame(() => requestAnimationFrame(() => setHeight(0)));
    }
  }, [open]);

  const isAuto = height === "auto";
  // Opacity fades a touch faster than height — keeps the panel feeling
  // arrived without waiting for the last pixel of the box to open.
  const opacityMs = Math.round(duration * 0.72);

  return (
    <div
      style={{
        maxHeight: isAuto ? "none" : height,
        overflow: isAuto ? "visible" : "hidden",
        opacity: open ? 1 : 0,
        transform: open ? "translateY(0)" : "translateY(-4px)",
        marginTop: open ? marginTop : 0,
        marginBottom: open ? marginBottom : 0,
        transition: [
          `max-height ${duration}ms ${EASE}`,
          `opacity ${opacityMs}ms ${EASE}`,
          `transform ${duration}ms ${EASE}`,
          `margin-top ${duration}ms ${EASE}`,
          `margin-bottom ${duration}ms ${EASE}`,
        ].join(", "),
        ...style,
      }}
    >
      <div ref={inner}>{children}</div>
    </div>
  );
}
