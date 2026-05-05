"use client";

import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { PillButton } from "@/lib/ui/pill-button";
import { renderInline } from "@/lib/inline-markdown";

// ── Block types & parser ───────────────────────────────────────────────────────
export type Block =
  | { kind: "body";   text: string }
  | { kind: "breath" }
  | { kind: "quote";  text: string; citation?: string };

export function parseBlocks(text: string): Block[] {
  return text
    .split("\n\n")
    .map((b) => b.replace(/[ \t]+$|^[ \t]+/g, ""))
    .map((b): Block => {
      if (b === "") return { kind: "breath" };
      const lines = b.split("\n");
      if (lines.some((l) => l.startsWith("> "))) {
        let citation: string | undefined;
        if (lines.length > 0 && /^—\s+/.test(lines[lines.length - 1])) {
          citation = lines[lines.length - 1].replace(/^—\s+/, "").trim();
          lines.pop();
        }
        const quoteText = lines.map((l) => l.replace(/^>\s?/, "")).join("\n").trim();
        return { kind: "quote", text: quoteText, citation };
      }
      return { kind: "body", text: b };
    });
}

// ── Style constants ────────────────────────────────────────────────────────────
const preachFontBtnStyle: CSSProperties = {
  border: "1px solid var(--ambo-border)", background: "transparent",
  color: "var(--ambo-text-muted)", fontSize: 13, fontWeight: 600,
  padding: "4px 10px", borderRadius: 8, cursor: "pointer",
  fontFamily: "inherit", lineHeight: 1,
};

const stepBtnStyle = (disabled: boolean): CSSProperties => ({
  border: "1px solid " + (disabled ? "var(--ambo-border)" : "var(--ambo-accent)"),
  background: "transparent",
  color: disabled ? "var(--ambo-text-muted)" : "var(--ambo-accent)",
  fontSize: 14, fontWeight: 500, padding: "10px 22px", borderRadius: 100,
  cursor: disabled ? "default" : "pointer", fontFamily: "inherit",
  opacity: disabled ? 0.4 : 1, transition: "all 0.15s",
});

// ── Quote block (mirrors PreachView's QuoteDisplay) ────────────────────────────
function DailyQuoteBlock({
  block, fontSize,
}: { block: Extract<Block, { kind: "quote" }>; fontSize: number }) {
  return (
    <div style={{
      margin: "0 0 1.6em",
      borderLeft: "3px solid var(--ambo-accent)",
      paddingLeft: 18, paddingTop: 4, paddingBottom: 4,
    }}>
      <p style={{
        fontFamily: "var(--ambo-font-reading)", fontSize,
        lineHeight: "var(--ambo-lh-reading)", color: "var(--ambo-text-primary)",
        letterSpacing: "0.01em", fontStyle: "italic", margin: 0, whiteSpace: "pre-wrap",
      }}>
        {renderInline(block.text)}
      </p>
      {block.citation && (
        <div style={{
          marginTop: 10, fontSize: Math.max(13, Math.round(fontSize * 0.6)),
          color: "var(--ambo-text-muted)", fontStyle: "normal", letterSpacing: "0.01em",
        }}>
          — {block.citation}
        </div>
      )}
    </div>
  );
}

// ── DailyPreachPanel — full Preach chrome shared by Daily and Special Occasions ─
export interface DailyPreachPanelProps {
  content: string;
  title: string;
  onScrollLock: (locked: boolean, isScrollMode?: boolean) => void;
  /** Returns to the Write surface */
  onBack: () => void;
  /** Incremented by the overlay when the Exit pill fires */
  immersiveVersion: number;
  /** True on ≥1280px viewports; header stays visible so it never needs hiding */
  isDesktop?: boolean;
}

export function DailyPreachPanel({ content, title, onScrollLock, onBack, immersiveVersion, isDesktop: _isDesktop }: DailyPreachPanelProps) {
  const [fontSize, setFontSize]             = useState(24);
  const [currentBlock, setCurrentBlock]     = useState(0);
  const [blocks, setBlocks]                 = useState<Block[]>(() => parseBlocks(content));
  const [isScrollMode, setIsScrollMode]     = useState(true);
  const [committedMode, setCommittedMode]   = useState<null | "scroll" | "step">(null);
  const [isPhone, setIsPhone]               = useState(false);
  const [stepContainerH, setStepContainerH] = useState(400);
  const stepContainerRef = useRef<HTMLDivElement>(null);
  const blockRefsArr     = useRef<(HTMLDivElement | null)[]>([]);
  const isFirstStep      = useRef(true);

  const maxFontSize     = isPhone ? 28 : 36;
  const hasContent      = content.trim().length > 0;
  const displayFontSize = Math.min(fontSize, maxFontSize);

  // Update blocks when content changes (priest switches to Preach tab)
  useEffect(() => {
    setBlocks(parseBlocks(content));
    setCurrentBlock(0);
    setCommittedMode(null);
    onScrollLock(false);
    isFirstStep.current = true;
  }, [content]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reset committed mode when the overlay fires its Exit pill
  useEffect(() => {
    if (immersiveVersion === 0) return; // skip on mount
    setCommittedMode(null);
    setIsScrollMode(true);
    isFirstStep.current = true;
  }, [immersiveVersion]); // eslint-disable-line react-hooks/exhaustive-deps

  // Detect phone viewport
  useEffect(() => {
    const check = () => setIsPhone(window.innerWidth < 640);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // Smooth sine scroll
  const smoothScrollTo = (el: HTMLElement, to: number, dur: number) => {
    const from  = el.scrollTop;
    const delta = to - from;
    if (Math.abs(delta) < 1) return;
    const start = performance.now();
    const ease  = (t: number) => -(Math.cos(Math.PI * t) - 1) / 2;
    const tick  = (now: number) => {
      const t = Math.min((now - start) / dur, 1);
      el.scrollTop = from + delta * ease(t);
      if (t < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };

  // Centre active block in step mode
  useEffect(() => {
    if (isScrollMode) return;
    const block     = blockRefsArr.current[currentBlock];
    const container = stepContainerRef.current;
    if (!block || !container) return;
    const cRect = container.getBoundingClientRect();
    const bRect = block.getBoundingClientRect();
    const target = block.clientHeight > container.clientHeight
      ? container.scrollTop + (bRect.top - cRect.top) - 16
      : container.scrollTop + (bRect.top + bRect.height / 2) - (cRect.top + cRect.height / 2);
    if (isFirstStep.current) {
      container.scrollTop = target;
      isFirstStep.current = false;
    } else {
      smoothScrollTo(container, target, 650);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentBlock, isScrollMode]);

  // Prevent scroll hijack in step mode
  useEffect(() => {
    if (isScrollMode) return;
    const el = stepContainerRef.current;
    const preventWheel = (e: WheelEvent) => e.preventDefault();
    const preventTouch = (e: TouchEvent) => e.preventDefault();
    if (el) el.addEventListener("wheel", preventWheel, { passive: false });
    document.addEventListener("touchmove", preventTouch, { passive: false });
    return () => {
      if (el) el.removeEventListener("wheel", preventWheel);
      document.removeEventListener("touchmove", preventTouch);
    };
  }, [isScrollMode]);

  // Track step container height
  useEffect(() => {
    if (isScrollMode) return;
    const el = stepContainerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setStepContainerH(el.clientHeight));
    ro.observe(el);
    setStepContainerH(el.clientHeight);
    return () => ro.disconnect();
  }, [isScrollMode]);

  return (
    <div
      className="view-fade preach-print-root"
      style={{
        maxWidth: 840, margin: "0 auto",
        padding: isScrollMode ? "36px 20px 80px" : "36px 20px 0",
        ...(isScrollMode ? {} : { flex: 1, minHeight: 0, display: "flex", flexDirection: "column" as const }),
        ["--print-font-size" as string]: `${displayFontSize}px`,
      }}
    >
      {/* ── Controls bar — hidden in immersive mode ──────────────────────────── */}
      {committedMode === null && (
      <div className="preach-controls" style={{
        display: "flex", alignItems: "center",
        justifyContent: "space-between",
        marginBottom: 20, gap: 16,
      }}>
        {/* Left: Back | Scroll | Step */}
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <PillButton
            variant="ghost"
            className={committedMode !== null ? "preach-exit-pulse" : undefined}
            onClick={() => {
              if (committedMode !== null) {
                setCommittedMode(null);
                setIsScrollMode(true);
                onScrollLock(false);
              } else {
                onBack();
              }
            }}
            icon={
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }}>
                <polyline points="10,3 4,8 10,13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            }
            style={{ height: 34, padding: "0 14px" }}
          >
            {committedMode !== null ? "Exit" : "Back"}
          </PillButton>
          <PillButton
            variant={isScrollMode && committedMode !== null ? "active" : "ghost"}
            onClick={() => { setIsScrollMode(true); setCommittedMode("scroll"); onScrollLock(true, true); }}
            icon={
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }}>
                <line x1="2" y1="3.5" x2="14" y2="3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                <line x1="2" y1="7.5" x2="14" y2="7.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                <line x1="2" y1="11.5" x2="9" y2="11.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                <polyline points="11,9.5 13.5,12 11,14.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            }
            style={{
              height: 34, padding: "0 14px",
              ...(isScrollMode && committedMode !== null ? { border: "1px solid rgba(74,111,165,0.45)", background: "var(--ambo-accent-faint)" } : {}),
            }}
          >
            Scroll
          </PillButton>
          <PillButton
            variant={!isScrollMode && committedMode !== null ? "active" : "ghost"}
            onClick={() => { setIsScrollMode(false); setCurrentBlock(0); isFirstStep.current = true; setCommittedMode("step"); onScrollLock(true, false); }}
            icon={
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }}>
                <polyline points="3.5,4 9,8 3.5,12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                <line x1="12.5" y1="4" x2="12.5" y2="12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
              </svg>
            }
            style={{
              height: 34, padding: "0 14px",
              ...(!isScrollMode && committedMode !== null ? { border: "1px solid rgba(74,111,165,0.45)", background: "var(--ambo-accent-faint)" } : {}),
            }}
          >
            Step
          </PillButton>
        </div>

        {/* Right: A / A / Print */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button onClick={() => setFontSize(f => Math.max(18, f - 2))} style={preachFontBtnStyle} title="Smaller">A</button>
          <button onClick={() => setFontSize(f => Math.min(maxFontSize, f + 2))} style={{ ...preachFontBtnStyle, fontSize: 18 }} title="Larger">A</button>
          <PillButton
            variant="ghost"
            onClick={() => window.print()}
            title="Print or save as PDF"
            className="preach-print-btn"
            icon={
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }}>
                <rect x="3" y="1" width="10" height="5" rx="1" fill="currentColor" opacity="0.7" />
                <rect x="1" y="5" width="14" height="7" rx="1.5" fill="currentColor" />
                <rect x="3" y="9" width="10" height="6" rx="1" fill="var(--ambo-bg)" />
                <rect x="5" y="11" width="6" height="1.2" rx="0.6" fill="currentColor" opacity="0.5" />
                <rect x="5" y="13" width="4" height="1.2" rx="0.6" fill="currentColor" opacity="0.5" />
                <circle cx="12.5" cy="7.5" r="0.8" fill="var(--ambo-bg)" />
              </svg>
            }
            style={{ height: 34, padding: "0 14px", marginLeft: 4 }}
          >
            Print
          </PillButton>
        </div>
      </div>
      )}

      {/* ── Scroll mode ───────────────────────────────────────────────────────── */}
      {isScrollMode && (
        <div className="glass-card" style={{ padding: "56px 28px", marginBottom: 40 }}>
          {title && (
            <p style={{
              fontFamily: "var(--ambo-font-reading)",
              fontSize: 24, fontStyle: "italic", fontWeight: 400,
              letterSpacing: "-0.01em", lineHeight: 1.3,
              color: "var(--ambo-text-primary)", marginBottom: 32,
            }}>
              {title}
            </p>
          )}
          {!hasContent ? (
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              minHeight: 180,
            }}>
              <p style={{
                fontFamily: "var(--ambo-font-reading)", fontSize: 17,
                fontStyle: "italic", color: "var(--ambo-text-muted)", opacity: 0.6,
                margin: 0,
              }}>
                No reflection written yet.
              </p>
            </div>
          ) : (
            <div>
              {blocks.map((block, i) => {
                if (block.kind === "quote")  return <DailyQuoteBlock key={i} block={block} fontSize={displayFontSize} />;
                if (block.kind === "breath") return <div key={i} aria-hidden style={{ height: "1.8em", marginBottom: "1.6em" }} />;
                return (
                  <p key={i} style={{
                    fontFamily: "var(--ambo-font-reading)", fontSize: displayFontSize,
                    lineHeight: "var(--ambo-lh-reading)", color: "var(--ambo-text-primary)",
                    marginBottom: "2em", letterSpacing: "0.01em", whiteSpace: "pre-wrap",
                  }}>
                    {renderInline(block.text)}
                  </p>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Step mode ─────────────────────────────────────────────────────────── */}
      {!isScrollMode && (() => {
        const stepBlocks = blocks.filter(
          (b): b is Extract<Block, { kind: "body" | "quote" }> => b.kind !== "breath",
        );
        if (stepBlocks.length === 0) {
          return (
            <div className="glass-card" style={{ padding: "56px 28px" }}>
              {title && (
                <p style={{
                  fontFamily: "var(--ambo-font-reading)", fontSize: 24,
                  fontStyle: "italic", fontWeight: 400, color: "var(--ambo-text-primary)",
                  marginBottom: 32,
                }}>
                  {title}
                </p>
              )}
              <p style={{
                fontFamily: "var(--ambo-font-reading)", fontSize: 17,
                fontStyle: "italic", color: "var(--ambo-text-muted)", opacity: 0.6,
              }}>
                No reflection written yet.
              </p>
            </div>
          );
        }
        const safeIdx = Math.min(currentBlock, stepBlocks.length - 1);
        const halfH   = Math.round(stepContainerH / 2);

        return (
          <div className="glass-card" style={{
            flex: 1, display: "flex", flexDirection: "column", minHeight: 0,
            overflow: "hidden", padding: 0,
          }}>
            {title && (
              <p style={{
                fontSize: 12, fontWeight: 700, letterSpacing: "0.06em",
                textTransform: "uppercase", color: "var(--ambo-text-muted)",
                margin: 0, padding: "20px 28px 0", flexShrink: 0,
              }}>
                {title}
              </p>
            )}

            <div
              ref={stepContainerRef}
              style={{ flex: 1, minHeight: 0, overflowY: "scroll", scrollbarWidth: "none" }}
              className="step-scroll-container"
            >
              <div style={{ padding: `${halfH}px 28px` }}>
                {stepBlocks.map((block, i) => {
                  const dist    = Math.abs(i - safeIdx);
                  const opacity = dist === 0 ? 1 : dist === 1 ? 0.5 : dist === 2 ? 0.22 : 0.06;
                  return (
                    <div
                      key={i}
                      ref={(el) => { blockRefsArr.current[i] = el; }}
                      style={{
                        opacity,
                        transition: "opacity 0.7s ease",
                        marginBottom: i < stepBlocks.length - 1 ? 48 : 0,
                        pointerEvents: i === safeIdx ? undefined : "none",
                      }}
                    >
                      {block.kind === "quote" ? (
                        <DailyQuoteBlock block={block} fontSize={displayFontSize} />
                      ) : (
                        <p style={{
                          fontFamily: "var(--ambo-font-reading)", fontSize: displayFontSize,
                          lineHeight: "var(--ambo-lh-reading)", color: "var(--ambo-text-primary)",
                          letterSpacing: "0.01em", whiteSpace: "pre-wrap", margin: 0,
                        }}>
                          {renderInline(block.text)}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Navigation bar */}
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "16px 28px 24px", flexShrink: 0,
              borderTop: "1px solid var(--ambo-border)",
            }}>
              <button
                onClick={() => setCurrentBlock(c => Math.max(0, c - 1))}
                disabled={safeIdx === 0}
                style={stepBtnStyle(safeIdx === 0)}
              >
                ← Previous
              </button>
              <span style={{ fontSize: 13, color: "var(--ambo-text-muted)" }}>
                {safeIdx + 1} of {stepBlocks.length}
              </span>
              <button
                onClick={() => setCurrentBlock(c => Math.min(stepBlocks.length - 1, c + 1))}
                disabled={safeIdx === stepBlocks.length - 1}
                style={stepBtnStyle(safeIdx === stepBlocks.length - 1)}
              >
                Next →
              </button>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
