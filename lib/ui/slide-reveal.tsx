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
//
// Optional override props (all default to standard behaviour so existing
// callers are unaffected):
//   durationOpenMs  — bypasses height-based duration calculation for open
//   easeOpen        — overrides EASE_OPEN for the open direction
//   delayOpenMs     — CSS transition delay applied on open (ms)
//   durationCloseMs — bypasses height-based duration calculation for close
//   delayCloseMs    — CSS transition delay applied on close (ms)
//   noOpacity       — disables the opacity animation entirely (opacity stays 1)
//   noTransform     — disables the translateY animation (transform stays none)

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

// Opening: ease-out — fast arrival, settles calmly. Closing: slightly
// tighter curve so the tail doesn't drag; also shorter duration, because
// once you've asked a panel to close, you want it gone.
// Opening: ease-in-out weighted toward a slow start — the panel should
// feel like it's inhaling, not snapping. Closing: a tighter curve and
// shorter duration so the exit is decisive without being abrupt.
const EASE_OPEN = "cubic-bezier(0.65, 0, 0.2, 1)";
const EASE_CLOSE = "cubic-bezier(0.4, 0, 0.6, 1)";
const MIN_MS = 780;
const MAX_MS = 1250;
const PX_PER_MS = 0.6;
const CLOSE_SCALE = 0.58; // close in ~58% the time of open

function openDurationFor(height: number): number {
  const extra = Math.max(0, height - 160) * PX_PER_MS;
  return Math.min(MAX_MS, Math.max(MIN_MS, MIN_MS + extra));
}

function closeDurationFor(height: number): number {
  return Math.round(openDurationFor(height) * CLOSE_SCALE);
}

type Props = {
  open: boolean;
  children: ReactNode;
  marginTop?: number;
  marginBottom?: number;
  style?: CSSProperties;
  // Animation overrides — all optional, default to standard SlideReveal behaviour
  durationOpenMs?: number;   // override height-based open duration
  easeOpen?: string;         // override EASE_OPEN
  delayOpenMs?: number;      // delay before open animation starts (ms)
  durationCloseMs?: number;  // override height-based close duration
  delayCloseMs?: number;     // delay before close animation starts (ms)
  noOpacity?: boolean;       // disable opacity animation (keep at 1 always)
  noTransform?: boolean;     // disable translateY animation
};

export function SlideReveal({
  open,
  children,
  marginTop = 0,
  marginBottom = 0,
  style,
  durationOpenMs,
  easeOpen: easeOpenProp,
  delayOpenMs = 0,
  durationCloseMs,
  delayCloseMs = 0,
  noOpacity = false,
  noTransform = false,
}: Props) {
  const inner = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | "auto">(open ? "auto" : 0);
  const [duration, setDuration] = useState(MIN_MS);
  const [ease, setEase] = useState(EASE_OPEN);
  const [delay, setDelay] = useState(0);
  const firstRun = useRef(true);

  useEffect(() => {
    if (!inner.current) return;

    if (firstRun.current) {
      firstRun.current = false;
      if (!open) return;
    }

    if (open) {
      const target = inner.current.scrollHeight;
      const d = durationOpenMs ?? openDurationFor(target);
      setDuration(d);
      setEase(easeOpenProp ?? EASE_OPEN);
      setDelay(delayOpenMs);
      setHeight(target);
      const t = setTimeout(() => setHeight("auto"), d + delayOpenMs + 20);
      return () => clearTimeout(t);
    } else {
      // Snapshot current height, then drop to 0 on the next frame.
      const current = inner.current.scrollHeight;
      const d = durationCloseMs ?? closeDurationFor(current);
      setDuration(d);
      setEase(EASE_CLOSE);
      setDelay(delayCloseMs);
      setHeight(current);
      requestAnimationFrame(() => requestAnimationFrame(() => setHeight(0)));
    }
  }, [open, durationOpenMs, easeOpenProp, delayOpenMs, durationCloseMs, delayCloseMs]);

  const isAuto = height === "auto";
  // Opacity finishes before the box so content feels "arrived" without
  // waiting for the last pixel — on close, it fades faster than the box
  // collapses, which also helps the tail not drag.
  // Opacity lags on open so content doesn't appear fully-formed before
  // the box has had a chance to reveal. On close, opacity outruns the
  // box so the tail collapse isn't visible.
  const opacityMs = Math.round(duration * (open ? 0.85 : 0.5));
  const delayStr = delay > 0 ? ` ${delay}ms` : "";

  const transitions: string[] = [
    `max-height ${duration}ms ${ease}${delayStr}`,
    ...(!noOpacity ? [`opacity ${opacityMs}ms ${ease}${delayStr}`] : []),
    ...(!noTransform ? [`transform ${duration}ms ${ease}${delayStr}`] : []),
    `margin-top ${duration}ms ${ease}${delayStr}`,
    `margin-bottom ${duration}ms ${ease}${delayStr}`,
  ];

  return (
    <div
      style={{
        maxHeight: isAuto ? "none" : height,
        // overflow:visible + clipPath lets vertical clipping work for the
        // animation while allowing box-shadows to bleed horizontally.
        // overflow:hidden would clip shadows on the left and right sides.
        overflow: "visible",
        clipPath: isAuto ? "none" : "inset(0 -60px)",
        opacity: noOpacity ? 1 : (open ? 1 : 0),
        transform: noTransform ? "none" : (open ? "translateY(0)" : "translateY(-4px)"),
        marginTop: open ? marginTop : 0,
        marginBottom: open ? marginBottom : 0,
        transition: transitions.join(", "),
        ...style,
      }}
    >
      <div ref={inner}>{children}</div>
    </div>
  );
}
