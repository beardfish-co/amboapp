"use client";

import { useEffect, useRef, useState } from "react";
import { loadReadings, type ReadingsStatus } from "@/lib/readings";

interface Reading {
  id: string;
  title: string;
  reference: string;
  heading: string;
  text: string;
}

interface DayReadings {
  date: string;
  dayName: string;
  readings: Reading[];
}

interface ReadingsDrawerProps {
  readingsSource?: import("@/lib/jurisdiction").ReadingsSource;
  open: boolean;
  sundayDate: string | null; // ISO YYYY-MM-DD
  homilyId?: string | null;  // Drives snapshot-first loading + snapshot write-back.
  onClose: () => void;
  // Inserts a quote block at the user's current focus in the editor.
  onInsert: (payload: { text: string; citation: string }) => void;
}

interface ActiveSelection {
  text: string;
  reference: string;
}

const HINT_KEY = "ambo:readings-hint-seen";

function messageForStatus(status: ReadingsStatus): string {
  if (status === "not_published") {
    return "Readings for this date aren't published yet. Universalis makes them available about nine days ahead — they'll load automatically then.";
  }
  return "Failed to load readings. Please try again in a moment.";
}

function splitReadingParagraphs(text: string): string[] {
  return text
    .split(/\n\s*\n+/)
    .map((p) => p.trim())
    .filter(Boolean);
}

// Walk up from a DOM node looking for an element with data-reading-ref
function readingRefFromNode(node: Node | null): string | null {
  let el: Node | null = node;
  while (el && el.nodeType !== 1) el = el.parentNode;
  let cur = el as HTMLElement | null;
  while (cur) {
    if (cur.dataset && cur.dataset.readingRef) return cur.dataset.readingRef;
    cur = cur.parentElement;
  }
  return null;
}

export default function ReadingsDrawer({
  open,
  sundayDate,
  homilyId,
  onClose,
  onInsert,
  readingsSource = "universalis",
}: ReadingsDrawerProps) {
  const [data, setData] = useState<DayReadings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [selection, setSelection] = useState<ActiveSelection | null>(null);
  // Instruction hint — shown once, can be re-surfaced via "?" icon
  const [hintSeen, setHintSeen] = useState(true);   // default true — read from localStorage on mount
  const [hintVisible, setHintVisible] = useState(false);
  const bodyRef = useRef<HTMLDivElement | null>(null);

  // Read hint-seen flag from localStorage on mount
  useEffect(() => {
    try {
      const seen = typeof window !== "undefined" && localStorage.getItem(HINT_KEY);
      if (!seen) {
        setHintSeen(false);
        setHintVisible(true);
      }
    } catch { /* private mode or blocked */ }
  }, []);

  const dismissHint = () => {
    setHintVisible(false);
    setHintSeen(true);
    try { localStorage.setItem(HINT_KEY, "1"); } catch { /* ignore */ }
  };

  const toggleHint = () => {
    setHintVisible((v) => !v);
  };

  useEffect(() => {
    if (!open || !sundayDate) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setData(null);
    setSelection(null);

    (async () => {
      const { payload, status } = await loadReadings(sundayDate, homilyId, readingsSource);
      if (cancelled) return;
      if (payload) {
        setData(payload);
      } else {
        setError(messageForStatus(status));
      }
      setLoading(false);
    })();

    return () => { cancelled = true; };
  }, [open, sundayDate, homilyId]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Track the user's text selection inside the drawer body
  useEffect(() => {
    if (!open) return;

    const update = () => {
      const sel = typeof window !== "undefined" ? window.getSelection() : null;
      if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
        setSelection(null);
        return;
      }
      const body = bodyRef.current;
      if (!body) { setSelection(null); return; }
      const range = sel.getRangeAt(0);
      if (!body.contains(range.startContainer)) { setSelection(null); return; }
      const text = sel.toString().trim();
      if (!text) { setSelection(null); return; }
      const ref =
        readingRefFromNode(range.startContainer) ??
        readingRefFromNode(range.endContainer) ??
        "";
      setSelection({ text, reference: ref });
    };

    document.addEventListener("selectionchange", update);
    return () => document.removeEventListener("selectionchange", update);
  }, [open]);

  if (!open) return null;

  const handleInsertSelection = () => {
    if (!selection || !selection.text) return;
    onInsert({ text: selection.text, citation: selection.reference });
    setSelection(null);
    if (typeof window !== "undefined") window.getSelection()?.removeAllRanges();
  };

  return (
    <>
      {/* Backdrop — identical to My Homilies drawer */}
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(15, 20, 30, 0.24)",
          backdropFilter: "blur(4px)",
          WebkitBackdropFilter: "blur(4px)",
          zIndex: 90,
          animation: "fadeIn 460ms cubic-bezier(0.22, 1, 0.36, 1)",
        }}
      />

      {/* Drawer */}
      <aside
        role="dialog"
        aria-label="Readings for this homily"
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          bottom: 0,
          width: "min(440px, 92vw)",
          background: "var(--ambo-bg)",
          borderLeft: "1px solid var(--ambo-border)",
          zIndex: 100,
          display: "flex",
          flexDirection: "column",
          boxShadow: "var(--ambo-shadow-md)",
          animation: "slideInRight 640ms cubic-bezier(0.22, 1, 0.36, 1)",
        }}
      >
        {/* ── Header ── */}
        <div style={{
          padding: "16px 20px 14px",
          borderBottom: "1px solid var(--ambo-border)",
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 12,
          flexShrink: 0,
        }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            {/* Quiet "readings" eyebrow — same style as FIRST READING labels on Reflect */}
            <div style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "var(--ambo-text-muted)",
              opacity: 0.7,
              marginBottom: 4,
            }}>
              readings
            </div>
            {/* Liturgical day — italic serif primary title */}
            <h2 style={{
              fontFamily: "var(--ambo-font-reading)",
              fontSize: 17,
              fontStyle: "italic",
              fontWeight: 500,
              letterSpacing: "-0.01em",
              color: "var(--ambo-text-primary)",
              margin: 0,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}>
              {data?.dayName ?? (loading ? "…" : "Readings")}
            </h2>
          </div>

          {/* Right side: "?" hint icon + close × */}
          <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
            {sundayDate && data && (
              <button
                onClick={toggleHint}
                aria-label="How to use readings"
                title="How to insert readings"
                style={{
                  border: "none",
                  background: "none",
                  fontSize: 13,
                  lineHeight: 1,
                  color: hintVisible ? "var(--ambo-accent)" : "var(--ambo-text-muted)",
                  cursor: "pointer",
                  padding: "4px 6px",
                  borderRadius: 6,
                  opacity: hintVisible ? 1 : 0.6,
                  fontFamily: "inherit",
                  transition: "opacity 0.15s",
                }}
              >
                ?
              </button>
            )}
            <button
              onClick={onClose}
              aria-label="Close"
              style={{
                border: "none",
                background: "none",
                fontSize: 20,
                lineHeight: 1,
                color: "var(--ambo-text-muted)",
                cursor: "pointer",
                padding: 4,
                borderRadius: 6,
                flexShrink: 0,
              }}
            >
              ×
            </button>
          </div>
        </div>

        {/* ── Instruction hint (once-only, dismissable) ── */}
        {hintVisible && (
          <div style={{
            padding: "10px 20px 12px",
            borderBottom: "1px solid var(--ambo-border)",
            animation: "fadeIn 200ms ease",
          }}>
            <p style={{
              margin: 0,
              fontSize: 12,
              fontStyle: "italic",
              color: "var(--ambo-text-muted)",
              lineHeight: 1.55,
            }}>
              highlight to insert a phrase, or tap <em>insert</em> for the whole passage.
            </p>
            {!hintSeen && (
              <button
                onClick={dismissHint}
                style={{
                  marginTop: 6,
                  border: "none",
                  background: "none",
                  fontSize: 11,
                  color: "var(--ambo-text-muted)",
                  opacity: 0.6,
                  cursor: "pointer",
                  padding: 0,
                  fontFamily: "inherit",
                }}
              >
                got it
              </button>
            )}
          </div>
        )}

        {/* ── Body ── */}
        <div
          ref={bodyRef}
          style={{ flex: 1, overflowY: "auto", padding: "12px 16px 80px" }}
        >
          {!sundayDate && (
            <EmptyState
              title="No Sunday set"
              body="Pick a Sunday for this homily to load its readings. Use the date pill under the title."
            />
          )}

          {sundayDate && loading && (
            <div style={{
              fontSize: 13,
              fontStyle: "italic",
              color: "var(--ambo-text-muted)",
              padding: 20,
              textAlign: "center",
            }}>
              Loading…
            </div>
          )}

          {sundayDate && error && (
            <EmptyState title="Couldn't load readings" body={error} />
          )}

          {sundayDate && data && data.readings.map((r) => {
            const paragraphs = splitReadingParagraphs(r.text);
            return (
              <ReadingCard
                key={r.id}
                reading={r}
                paragraphs={paragraphs}
                onInsert={onInsert}
              />
            );
          })}
        </div>

        {/* ── Floating insert-selection bar ── */}
        {selection && (
          <div style={{
            position: "absolute",
            left: 12,
            right: 12,
            bottom: 12,
            background: "var(--ambo-surface)",
            backdropFilter: "blur(16px) saturate(1.3)",
            WebkitBackdropFilter: "blur(16px) saturate(1.3)",
            border: "1px solid var(--ambo-border)",
            borderRadius: 14,
            padding: "10px 14px",
            display: "flex",
            alignItems: "center",
            gap: 10,
            boxShadow: "var(--ambo-shadow-md)",
            animation: "fadeIn 200ms ease",
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: "var(--ambo-text-muted)",
                opacity: 0.7,
                marginBottom: 3,
              }}>
                selection
              </div>
              <div style={{
                fontSize: 12,
                color: "var(--ambo-text-secondary)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                fontStyle: "italic",
                fontFamily: "var(--ambo-font-reading)",
              }}>
                "{selection.text}"
              </div>
            </div>
            <button
              onMouseDown={(e) => e.preventDefault()}
              onClick={handleInsertSelection}
              style={{
                border: "1px solid var(--ambo-border)",
                background: "transparent",
                color: "var(--ambo-text-secondary)",
                fontSize: 12,
                fontStyle: "italic",
                fontFamily: "inherit",
                padding: "6px 14px",
                borderRadius: 100,
                cursor: "pointer",
                flexShrink: 0,
                transition: "opacity 0.15s",
              }}
            >
              insert
            </button>
          </div>
        )}
      </aside>
    </>
  );
}

// ── Reading card — glass surface matching the My Homilies drawer cards ────────
interface ReadingCardProps {
  reading: Reading;
  paragraphs: string[];
  onInsert: (payload: { text: string; citation: string }) => void;
}

function ReadingCard({ reading: r, paragraphs, onInsert }: ReadingCardProps) {
  return (
    <div
      className="glass-card"
      data-reading-id={r.id}
      data-reading-ref={r.reference}
      style={{
        padding: "16px 20px 18px",
        margin: "0 0 10px",
      }}
    >
      {/* Reading label + citation — same eyebrow style as Reflect page */}
      <div style={{
        display: "flex",
        alignItems: "baseline",
        justifyContent: "space-between",
        gap: 8,
        marginBottom: r.heading ? 4 : 12,
      }}>
        <span style={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: "var(--ambo-text-muted)",
        }}>
          {r.title}
        </span>
        <span style={{
          fontSize: 11,
          fontStyle: "italic",
          color: "var(--ambo-text-muted)",
          opacity: 0.75,
          flexShrink: 0,
        }}>
          {r.reference}
        </span>
      </div>

      {r.heading && (
        <div style={{
          fontFamily: "var(--ambo-font-reading)",
          fontSize: 13,
          fontStyle: "italic",
          color: "var(--ambo-text-secondary)",
          marginBottom: 10,
          lineHeight: 1.5,
        }}>
          {r.heading}
        </div>
      )}

      {/* Paragraphs */}
      <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
        {paragraphs.map((para, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "space-between",
              gap: 12,
              paddingBottom: 12,
            }}
          >
            <p style={{
              fontFamily: "var(--ambo-font-reading)",
              fontSize: "var(--ambo-size-lg)",
              lineHeight: "var(--ambo-lh-reading)",
              color: "var(--ambo-text-primary)",
              margin: 0,
              whiteSpace: "pre-wrap",
              flex: 1,
            }}>
              {para}
            </p>
            {/* Quiet italic "insert" link — visually recessive, functionally available */}
            <button
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onInsert({ text: para, citation: r.reference })}
              title="Insert this paragraph"
              style={{
                border: "none",
                background: "none",
                fontSize: 11,
                fontStyle: "italic",
                fontFamily: "inherit",
                color: "var(--ambo-text-muted)",
                opacity: 0.55,
                cursor: "pointer",
                padding: "4px 0",
                flexShrink: 0,
                lineHeight: 1,
                transition: "opacity 0.15s",
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.opacity = "0.9"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.opacity = "0.55"; }}
            >
              insert
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Empty / error state ───────────────────────────────────────────────────────
function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div style={{ padding: "32px 8px", textAlign: "center" }}>
      <div style={{
        fontFamily: "var(--ambo-font-reading)",
        fontSize: 15,
        fontStyle: "italic",
        color: "var(--ambo-text-primary)",
        marginBottom: 8,
      }}>
        {title}
      </div>
      <div style={{
        fontSize: 13,
        color: "var(--ambo-text-muted)",
        lineHeight: 1.6,
      }}>
        {body}
      </div>
    </div>
  );
}
