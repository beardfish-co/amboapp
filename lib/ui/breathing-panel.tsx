"use client";

import type { ReactNode, CSSProperties } from "react";

/**
 * BreathingPanel — port of the "Panel-breathing" pattern from
 * /test-textarea variant 5.
 *
 * The panel is the animated element. A TextareaAutosize sits inside as a
 * passenger (no transition, no animation, no overflow constraint of its
 * own). The textarea reports its required height via `onHeightChange`;
 * the parent stores that in state and passes it as `height` here. The
 * panel eases its own content-area height toward that value.
 *
 * Generous bottom padding (28px) gives wrapped text a cushion at the
 * moment of the wrap, before the panel's height has caught up.
 *
 * Usage:
 *
 *   const [taHeight, setTaHeight] = useState(0);
 *   <BreathingPanel height={taHeight}>
 *     <TextareaAutosize
 *       ref={ref}
 *       value={value}
 *       onChange={onChange}
 *       onHeightChange={setTaHeight}
 *       style={{ ...inert textarea styles, no height transition... }}
 *     />
 *   </BreathingPanel>
 *
 * Callers may pass extra `style` (e.g. background, border, shadow) for
 * visible chrome, but the breathing-critical values (padding, height,
 * transition, box-sizing) always win.
 *
 * `transition` lets a caller transiently override the default ease — pass
 * `"none"` to snap to a new height without animation (e.g. when content
 * has been swapped externally and an animated morph between unrelated
 * heights would feel jarring). Omit to use the default 2000ms ease.
 */
export function BreathingPanel({
  height,
  children,
  style,
  transition,
}: {
  height: number;
  children: ReactNode;
  style?: CSSProperties;
  transition?: string;
}) {
  return (
    <div
      style={{
        ...style,
        // Sampled exactly from /test-textarea variant 5 — do not approximate.
        boxSizing: "content-box",
        padding: "16px 20px 28px 20px",
        height: height ? `${height}px` : "auto",
        transition: transition ?? "height 2000ms ease-in-out",
      }}
    >
      {children}
    </div>
  );
}
