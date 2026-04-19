"use client";

// SlideReveal — shared expand/collapse primitive.
// One easing (cubic-bezier(0.22, 1, 0.36, 1)) and one duration (420ms)
// across every collapsible surface in Ambo: reading bodies, Fathers,
// Prompts, Seed, HomilyList, Write panels. Different timings across
// surfaces is the tell of a hand-assembled UI; consistency is the fix.
//
// Animates max-height + opacity + small translateY + vertical margins.
// On open, after the transition finishes we let max-height go back to
// "auto" so dynamic content inside (textarea growth, late loads) isn't
// clipped. On close, we snapshot the current scrollHeight first, then
// drop to 0 on the next frame so the browser has a start value to
// interpolate from.

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

const EASE = "cubic-bezier(0.22, 1, 0.36, 1)";
const DURATION_MS = 420;
const OPACITY_MS = 300;

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
  const firstRun = useRef(true);

  useEffect(() => {
    if (!inner.current) return;

    if (firstRun.current) {
      firstRun.current = false;
      if (!open) return;
    }

    if (open) {
      const target = inner.current.scrollHeight;
      setHeight(target);
      const t = setTimeout(() => setHeight("auto"), DURATION_MS + 20);
      return () => clearTimeout(t);
    } else {
      // Snapshot current height, then drop to 0 on the next frame.
      const current = inner.current.scrollHeight;
      setHeight(current);
      requestAnimationFrame(() => requestAnimationFrame(() => setHeight(0)));
    }
  }, [open]);

  const isAuto = height === "auto";

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
          `max-height ${DURATION_MS}ms ${EASE}`,
          `opacity ${OPACITY_MS}ms ${EASE}`,
          `transform ${DURATION_MS}ms ${EASE}`,
          `margin-top ${DURATION_MS}ms ${EASE}`,
          `margin-bottom ${DURATION_MS}ms ${EASE}`,
        ].join(", "),
        ...style,
      }}
    >
      <div ref={inner}>{children}</div>
    </div>
  );
}
