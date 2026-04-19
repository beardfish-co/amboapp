"use client";

import { useEffect, useRef, useState } from "react";

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
  open: boolean;
  sundayDate: string | null; // ISO YYYY-MM-DD
  onClose: () => void;
  // Inserts a quote block at the user's current focus in the editor.
  onInsert: (payload: { text: string; citation: string }) => void;
}

interface ActiveSelection {
  text: string;
  reference: string;
}

function isoToCompact(iso: string): string {
  return iso.replace(/-/g, "");
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
  onClose,
  onInsert,
}: ReadingsDrawerProps) {
  const [data, setData] = useState<DayReadings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [selection, setSelection] = useState<ActiveSelection | null>(null);
  const bodyRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open || !sundayDate) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setData(null);
    setSelection(null);

    (async () => {
      try {
        const res = await fetch(`/api/readings?date=${isoToCompact(sundayDate)}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json: DayReadings = await res.json();
        if (!cancelled) setData(json);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load readings");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [open, sundayDate]);

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
      if (!body) {
        setSelection(null);
        return;
      }
      const range = sel.getRangeAt(0);
      // Only count selections that start inside the drawer body
      if (!body.contains(range.startContainer)) {
        setSelection(null);
        return;
      }
      const text = sel.toString().trim();
      if (!text) {
        setSelection(null);
        return;
      }
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
    // Clear the actual browser selection too
    if (typeof window !== "undefined") window.getSelection()?.removeAllRanges();
  };

  return (
    <>
      {/* Backdrop */}
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
        {/* Header */}
        <div style={{
          padding: "20px 20px 14px",
          borderBottom: "1px solid var(--ambo-border)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}>
          <div style={{ minWidth: 0 }}>
            <h2 style={{
              fontSize: 15,
              fontWeight: 600,
              letterSpacing: "-0.01em",
              color: "var(--ambo-text-primary)",
              margin: 0,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}>
              Readings
            </h2>
            {data?.dayName && (
              <div style={{
                fontSize: 12,
                color: "var(--ambo-text-muted)",
                marginTop: 2,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}>
                {data.dayName}
              </div>
            )}
          </div>
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

        {/* Hint when no selection is active */}
        {sundayDate && data && !selection && (
          <div style={{
            padding: "10px 20px",
            fontSize: 12,
            color: "var(--ambo-text-muted)",
            borderBottom: "1px solid var(--ambo-border)",
            background: "var(--ambo-surface)",
            lineHeight: 1.5,
          }}>
            Highlight any text to insert just that piece, or use Insert to drop in a whole paragraph.
          </div>
        )}

        {/* Body */}
        <div ref={bodyRef} style={{ flex: 1, overflowY: "auto", padding: "16px 20px 80px" }}>
          {!sundayDate && (
            <EmptyState
              title="No Sunday set"
              body="Pick a Sunday for this homily to load its readings. Use the date pill under the title."
            />
          )}

          {sundayDate && loading && (
            <div style={{ fontSize: 13, color: "var(--ambo-text-muted)", padding: 20, textAlign: "center" }}>
              Loading readings…
            </div>
          )}

          {sundayDate && error && (
            <EmptyState
              title="Couldn’t load readings"
              body={`The readings service didn’t respond (${error}). Check your connection and try again.`}
            />
          )}

          {sundayDate && data && data.readings.map((r) => {
            const paragraphs = splitReadingParagraphs(r.text);
            return (
              <section
                key={r.id}
                data-reading-id={r.id}
                data-reading-ref={r.reference}
                style={{ marginBottom: 28 }}
              >
                {/* Reading head */}
                <div style={{
                  display: "flex",
                  alignItems: "baseline",
                  justifyContent: "space-between",
                  gap: 8,
                  marginBottom: 4,
                }}>
                  <h3 style={{
                    fontSize: 12,
                    fontWeight: 600,
                    letterSpacing: "0.05em",
                    textTransform: "uppercase",
                    color: "var(--ambo-accent)",
                    margin: 0,
                  }}>
                    {r.title}
                  </h3>
                  <span style={{
                    fontSize: 11,
                    fontStyle: "italic",
                    color: "var(--ambo-text-muted)",
                  }}>
                    {r.reference}
                  </span>
                </div>

                {r.heading && (
                  <div style={{
                    fontSize: 12,
                    fontStyle: "italic",
                    color: "var(--ambo-text-secondary)",
                    marginBottom: 8,
                  }}>
                    {r.heading}
                  </div>
                )}

                {/* Insert whole reading */}
                {paragraphs.length > 1 && (
                  <button
                    onClick={() => onInsert({
                      text: paragraphs.join("\n\n"),
                      citation: r.reference,
                    })}
                    style={insertAllStyle}
                    title="Insert the full reading as a quote"
                  >
                    + Insert whole reading
                  </button>
                )}

                {/* Paragraph list */}
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {paragraphs.map((para, i) => (
                    <div
                      key={i}
                      style={{
                        position: "relative",
                        paddingRight: 72,
                      }}
                    >
                      <p style={{
                        fontFamily: "var(--ambo-font-reading)",
                        fontSize: "var(--ambo-size-lg)",
                        lineHeight: "var(--ambo-lh-reading)",
                        color: "var(--ambo-text-primary)",
                        margin: 0,
                        whiteSpace: "pre-wrap",
                      }}>
                        {para}
                      </p>
                      <button
                        onMouseDown={(e) => e.preventDefault() /* don't steal selection */}
                        onClick={() => onInsert({ text: para, citation: r.reference })}
                        style={insertBtnStyle}
                        title="Insert this paragraph as a quote"
                      >
                        Insert
                      </button>
                    </div>
                  ))}
                </div>
              </section>
            );
          })}
        </div>

        {/* Floating Insert-selection action bar */}
        {selection && (
          <div style={{
            position: "absolute",
            left: 16,
            right: 16,
            bottom: 16,
            background: "var(--ambo-bg)",
            border: "1px solid var(--ambo-accent)",
            borderRadius: 14,
            padding: "10px 12px",
            display: "flex",
            alignItems: "center",
            gap: 10,
            boxShadow: "var(--ambo-shadow-md)",
            animation: "fadeIn 460ms cubic-bezier(0.22, 1, 0.36, 1)",
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: 11,
                fontWeight: 600,
                color: "var(--ambo-accent)",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                marginBottom: 2,
              }}>
                Selection
              </div>
              <div style={{
                fontSize: 12,
                color: "var(--ambo-text-secondary)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                fontStyle: "italic",
              }}>
                “{selection.text}”
              </div>
            </div>
            <button
              onMouseDown={(e) => e.preventDefault() /* preserve selection until click fires */}
              onClick={handleInsertSelection}
              style={{
                border: "none",
                background: "var(--ambo-accent)",
                color: "white",
                fontSize: 12,
                fontWeight: 600,
                padding: "7px 14px",
                borderRadius: 100,
                cursor: "pointer",
                fontFamily: "inherit",
                flexShrink: 0,
              }}
            >
              Insert selection
            </button>
          </div>
        )}
      </aside>
    </>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div style={{ padding: "32px 8px", textAlign: "center" }}>
      <div style={{
        fontSize: 14,
        fontWeight: 600,
        color: "var(--ambo-text-primary)",
        marginBottom: 6,
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

const insertBtnStyle: React.CSSProperties = {
  position: "absolute",
  top: 0,
  right: 0,
  border: "1px solid var(--ambo-border)",
  background: "var(--ambo-bg)",
  color: "var(--ambo-accent)",
  fontSize: 11,
  fontWeight: 600,
  padding: "4px 10px",
  borderRadius: 100,
  cursor: "pointer",
  fontFamily: "inherit",
  transition: "all 0.15s",
};

const insertAllStyle: React.CSSProperties = {
  border: "1px dashed var(--ambo-border)",
  background: "transparent",
  color: "var(--ambo-accent)",
  fontSize: 11,
  fontWeight: 600,
  padding: "5px 10px",
  borderRadius: 100,
  cursor: "pointer",
  fontFamily: "inherit",
  marginBottom: 10,
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
};
