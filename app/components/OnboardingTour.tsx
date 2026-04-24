"use client";

import { useState, useEffect, useCallback, useLayoutEffect } from "react";

// ─── Step definitions ────────────────────────────────────────────────────────

type Tab = "reflect" | "write" | "preach";
type Dir = "up" | "down" | "left" | "right" | "none";

interface Step {
  target: string;           // data-tour value
  copy: string;
  tab: Tab;
  prefer: "top" | "bottom" | "left" | "right";
  prepareEvent?: string;    // custom window event to fire before positioning
  prepareDelay?: number;    // ms to wait after prepareEvent before measuring (default 120)
}

const STEPS: Step[] = [
  { target: "nav-tabs",             copy: "For priests who want to preach from prayer.",                         tab: "reflect", prefer: "bottom" },
  { target: "reflect-tab",          copy: "Let the Word speak before you begin composing.",                      tab: "reflect", prefer: "bottom" },
  { target: "reading-panels",       copy: "The readings for the day, drawn from the lectionary.",                tab: "reflect", prefer: "right"  },
  { target: "reflect-prompts",      copy: "Gentle invitations to sit with the readings in prayer.",              tab: "reflect", prefer: "right",  prepareEvent: "ambo:tour-open-r1-prompts", prepareDelay: 1100 },
  { target: "reflect-discernment",  copy: "What grace has your prayer with the Word uncovered?",                 tab: "reflect", prefer: "left"   },
  { target: "reflect-notes",        copy: "Keep what comes to you as you pray.",                                 tab: "reflect", prefer: "left"   },
  { target: "write-tab",            copy: "Your space to write the homily in your own voice.",                   tab: "write",   prefer: "bottom" },
  { target: "write-discernment",    copy: "The grace you named in prayer, present as you write.",                tab: "write",   prefer: "bottom" },
  { target: "write-notes",          copy: "Your notes from prayer, here as you write.",                         tab: "write",   prefer: "bottom" },
  { target: "readings-drawer",      copy: "Pull the readings directly into your homily as you write.",           tab: "write",   prefer: "left"   },
  { target: "write-examine",        copy: "A gentle look at what you've written before you preach.",             tab: "write",   prefer: "left"   },
  { target: "preach-tab",           copy: "Where the homily is preached.",                                       tab: "preach",  prefer: "bottom" },
  { target: "my-homilies",          copy: "Your homilies, always here to return to.",                            tab: "write",   prefer: "bottom" },
];

const STORAGE_KEY = "ambo_tour_v1_complete";
const POPOVER_W   = 280;
const POPOVER_PAD = 16; // gap between target and popover (matches arrow size)
const MOBILE_BP   = 768;

// ─── Positioning ─────────────────────────────────────────────────────────────

interface PopoverPos {
  top: number;
  left: number;
  arrowDir: Dir;
  arrowOffset: number; // px from left/top of popover edge to center arrow
}

function calcPos(rect: DOMRect, prefer: Step["prefer"]): PopoverPos {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const ph = 120; // estimated popover height

  const fits = {
    bottom: rect.bottom + POPOVER_PAD + ph  < vh,
    top:    rect.top    - POPOVER_PAD - ph  > 0,
    right:  rect.right  + POPOVER_PAD + POPOVER_W < vw,
    left:   rect.left   - POPOVER_PAD - POPOVER_W > 0,
  };

  const order: Array<Step["prefer"]> = [prefer, "bottom", "top", "right", "left"];
  const dir = order.find((d) => fits[d]) ?? "bottom";

  let top = 0, left = 0, arrowDir: Dir = "none", arrowOffset = POPOVER_W / 2;

  if (dir === "bottom") {
    top  = rect.bottom + POPOVER_PAD;
    left = Math.min(Math.max(rect.left + rect.width / 2 - POPOVER_W / 2, 8), vw - POPOVER_W - 8);
    arrowDir    = "up";
    arrowOffset = rect.left + rect.width / 2 - left;
  } else if (dir === "top") {
    top  = rect.top - POPOVER_PAD - ph;
    left = Math.min(Math.max(rect.left + rect.width / 2 - POPOVER_W / 2, 8), vw - POPOVER_W - 8);
    arrowDir    = "down";
    arrowOffset = rect.left + rect.width / 2 - left;
  } else if (dir === "right") {
    top  = Math.min(Math.max(rect.top + rect.height / 2 - ph / 2, 8), vh - ph - 8);
    left = rect.right + POPOVER_PAD;
    arrowDir    = "left";
    arrowOffset = rect.top + rect.height / 2 - top;
  } else {
    top  = Math.min(Math.max(rect.top + rect.height / 2 - ph / 2, 8), vh - ph - 8);
    left = rect.left - POPOVER_PAD - POPOVER_W;
    arrowDir    = "right";
    arrowOffset = rect.top + rect.height / 2 - top;
  }

  return { top, left, arrowDir, arrowOffset: Math.max(16, Math.min(arrowOffset, POPOVER_W - 16)) };
}

// ─── Arrow ───────────────────────────────────────────────────────────────────
// Two-layer CSS triangles: outer border triangle + inner fill triangle.
// The outer sits 1px further out, in the panel border colour;
// the inner sits flush against the panel, in the surface colour.

function Arrow({ dir, offset }: { dir: Dir; offset: number }) {
  if (dir === "none") return null;

  const fill   = "var(--ambo-surface-solid)";
  const border = "var(--ambo-border-strong)";
  const fi = 13; // inner (fill) triangle size
  const fo = 15; // outer (border) triangle size — 2px bigger on each side

  const base: React.CSSProperties = { position: "absolute", width: 0, height: 0 };

  // Outer border triangle
  const outerStyles: Record<Dir, React.CSSProperties> = {
    up:    { ...base, top: -(fo),     left: offset - fo,  borderLeft: `${fo}px solid transparent`, borderRight: `${fo}px solid transparent`, borderBottom: `${fo}px solid ${border}` },
    down:  { ...base, bottom: -(fo),  left: offset - fo,  borderLeft: `${fo}px solid transparent`, borderRight: `${fo}px solid transparent`, borderTop:    `${fo}px solid ${border}` },
    left:  { ...base, left: -(fo),    top:  offset - fo,  borderTop:  `${fo}px solid transparent`, borderBottom: `${fo}px solid transparent`, borderRight: `${fo}px solid ${border}` },
    right: { ...base, right: -(fo),   top:  offset - fo,  borderTop:  `${fo}px solid transparent`, borderBottom: `${fo}px solid transparent`, borderLeft:  `${fo}px solid ${border}` },
    none:  {},
  };

  // Inner fill triangle — sits 2px closer to the panel
  const innerOffset = 2;
  const innerStyles: Record<Dir, React.CSSProperties> = {
    up:    { ...base, top: -(fi - innerOffset),    left: offset - fi,  borderLeft: `${fi}px solid transparent`, borderRight: `${fi}px solid transparent`, borderBottom: `${fi}px solid ${fill}` },
    down:  { ...base, bottom: -(fi - innerOffset), left: offset - fi,  borderLeft: `${fi}px solid transparent`, borderRight: `${fi}px solid transparent`, borderTop:    `${fi}px solid ${fill}` },
    left:  { ...base, left: -(fi - innerOffset),   top:  offset - fi,  borderTop:  `${fi}px solid transparent`, borderBottom: `${fi}px solid transparent`, borderRight: `${fi}px solid ${fill}` },
    right: { ...base, right: -(fi - innerOffset),  top:  offset - fi,  borderTop:  `${fi}px solid transparent`, borderBottom: `${fi}px solid transparent`, borderLeft:  `${fi}px solid ${fill}` },
    none:  {},
  };

  return (
    <>
      <div style={outerStyles[dir]} />
      <div style={innerStyles[dir]} />
    </>
  );
}

// ─── Props ───────────────────────────────────────────────────────────────────

interface Props {
  mode: Tab;
  setMode: (mode: Tab) => void;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function OnboardingTour({ mode, setMode }: Props) {
  const [step, setStep]       = useState(0);
  const [visible, setVisible] = useState(false);
  const [pos, setPos]         = useState<PopoverPos | null>(null);
  const [mobile, setMobile]   = useState(false);
  const [ready, setReady]     = useState(false); // false while awaiting position calculation

  // Show on first visit
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!localStorage.getItem(STORAGE_KEY)) {
      setVisible(true);
    }
  }, []);

  // Detect mobile
  useEffect(() => {
    const check = () => setMobile(window.innerWidth < MOBILE_BP);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // Listen for manual tour restart from AccountMenu
  useEffect(() => {
    const handler = () => {
      setStep(0);
      setPos(null);
      setVisible(true);
    };
    window.addEventListener("ambo:start-tour", handler);
    return () => window.removeEventListener("ambo:start-tour", handler);
  }, []);

  // Switch tab + fire any prepareEvent when the step changes
  useEffect(() => {
    if (!visible) return;
    const s = STEPS[step];
    if (s.tab !== mode) setMode(s.tab);
    if (s.prepareEvent) {
      // Small defer so the tab paint finishes first
      const t = setTimeout(() => window.dispatchEvent(new CustomEvent(s.prepareEvent!)), 60);
      return () => clearTimeout(t);
    }
  }, [step, visible]); // eslint-disable-line react-hooks/exhaustive-deps

  // Position popover after tab switch + paint
  useLayoutEffect(() => {
    if (!visible) return;

    if (mobile) {
      // Mobile bottom sheet: always ready immediately, no positioning needed
      setReady(true);
      return;
    }

    // Hide while we wait so there's no flash at the wrong location
    setPos(null);
    setReady(false);

    const position = () => {
      const el = document.querySelector(`[data-tour="${STEPS[step].target}"]`) as HTMLElement | null;
      if (el) {
        const rect = el.getBoundingClientRect();
        setPos(calcPos(rect, STEPS[step].prefer));
      }
      // Mark ready whether or not target was found — centred fallback is fine
      setReady(true);
    };

    const delay = STEPS[step].prepareDelay ?? 120;
    const t = setTimeout(position, delay);
    return () => clearTimeout(t);
  }, [step, visible, mobile, mode]);

  const dismiss = useCallback(() => {
    setVisible(false);
    localStorage.setItem(STORAGE_KEY, "true");
  }, []);

  const next = useCallback(() => {
    if (step < STEPS.length - 1) {
      setStep((s) => s + 1);
    } else {
      dismiss();
    }
  }, [step, dismiss]);

  const prev = useCallback(() => {
    if (step > 0) setStep((s) => s - 1);
  }, [step]);

  if (!visible) return null;

  const current = STEPS[step];
  const isLast  = step === STEPS.length - 1;

  // ── Mobile: bottom sheet ──────────────────────────────────────────────────
  if (mobile) {
    return (
      <>
        <div onClick={dismiss} style={{ position: "fixed", inset: 0, zIndex: 999, background: "rgba(0,0,0,0.25)" }} />
        <div style={{
          position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 1000,
          background: "var(--ambo-surface-solid)",
          borderTop: "1px solid var(--ambo-border)",
          borderRadius: "16px 16px 0 0",
          padding: "20px 20px 32px",
          boxShadow: "0 -4px 32px rgba(0,0,0,0.18)",
        }}>
          <StepContent step={step} total={STEPS.length} copy={current.copy}
            isLast={isLast} onPrev={prev} onNext={next} onDismiss={dismiss} />
        </div>
      </>
    );
  }

  // ── Desktop: positioned popover ───────────────────────────────────────────
  if (!ready) return null;

  const centered = !pos;
  const style: React.CSSProperties = centered
    ? { position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)", zIndex: 1000 }
    : { position: "fixed", top: pos.top, left: pos.left, zIndex: 1000 };

  return (
    <>
      <div onClick={dismiss} style={{ position: "fixed", inset: 0, zIndex: 999 }} />
      <div style={{
        ...style,
        width: POPOVER_W,
        background: "var(--ambo-surface-solid)",
        border: "1.5px solid var(--ambo-border-strong)",
        borderRadius: 14,
        boxShadow: "0 20px 60px rgba(0,0,0,0.18), 0 4px 16px rgba(0,0,0,0.10), 0 0 0 1px rgba(74,111,165,0.06)",
        padding: "20px 20px 16px",
      }}>
        {pos && <Arrow dir={pos.arrowDir} offset={pos.arrowOffset} />}
        <StepContent step={step} total={STEPS.length} copy={current.copy}
          isLast={isLast} onPrev={prev} onNext={next} onDismiss={dismiss} />
      </div>
    </>
  );
}

// ─── Shared step content ──────────────────────────────────────────────────────

function StepContent({ step, total, copy, isLast, onPrev, onNext, onDismiss }: {
  step: number; total: number; copy: string; isLast: boolean;
  onPrev: () => void; onNext: () => void; onDismiss: () => void;
}) {
  return (
    <>
      {/* Step counter */}
      <div style={{ fontSize: 11, color: "var(--ambo-text-muted)", marginBottom: 10, letterSpacing: "0.04em" }}>
        {step + 1} of {total}
      </div>

      {/* Copy */}
      <p style={{
        fontSize: 15,
        lineHeight: 1.6,
        color: "var(--ambo-text-primary)",
        margin: "0 0 18px",
        fontFamily: "var(--ambo-font-reading, inherit)",
      }}>
        {copy}
      </p>

      {/* Navigation */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <button
          onClick={onDismiss}
          style={{ fontSize: 12, color: "var(--ambo-text-muted)", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", padding: 0 }}
        >
          Skip tour
        </button>

        <div style={{ display: "flex", gap: 8 }}>
          {step > 0 && (
            <button onClick={onPrev} style={ghostBtn}>← Back</button>
          )}
          <button onClick={onNext} style={accentBtn}>
            {isLast ? "Done" : "Next →"}
          </button>
        </div>
      </div>
    </>
  );
}

const ghostBtn: React.CSSProperties = {
  padding: "7px 14px",
  border: "1px solid var(--ambo-border)",
  borderRadius: 100,
  background: "transparent",
  color: "var(--ambo-text-secondary)",
  fontSize: 13,
  fontWeight: 500,
  fontFamily: "inherit",
  cursor: "pointer",
};

const accentBtn: React.CSSProperties = {
  padding: "7px 16px",
  border: "none",
  borderRadius: 100,
  background: "var(--ambo-accent)",
  color: "#fff",
  fontSize: 13,
  fontWeight: 600,
  fontFamily: "inherit",
  cursor: "pointer",
};
