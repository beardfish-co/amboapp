"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

const STORAGE_KEY = "ambo-draft";

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

interface PreachViewProps {
  currentId: string | null;
}

function isoToCompact(iso: string): string {
  return iso.replace(/-/g, "");
}

export default function PreachView({ currentId }: PreachViewProps) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [sundayDate, setSundayDate] = useState<string | null>(null);
  const [readings, setReadings] = useState<DayReadings | null>(null);
  const [readingsOpen, setReadingsOpen] = useState(false);
  const [expandedReadingId, setExpandedReadingId] = useState<string | null>(null);
  const [fontSize, setFontSize] = useState(24);
  const [currentPara, setCurrentPara] = useState(0);
  const [paragraphs, setParagraphs] = useState<string[]>([]);
  const [isScrollMode, setIsScrollMode] = useState(true);
  const [loading, setLoading] = useState(true);

  // Load the homily (Supabase by id; or most-recent; fall back to localStorage)
  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      let loadedTitle = "";
      let loadedContent = "";
      let loadedSunday: string | null = null;
      let gotIt = false;

      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const base = supabase
            .from("homilies")
            .select("title, content, sunday_date")
            .eq("user_id", user.id);

          const { data } = currentId
            ? await base.eq("id", currentId).single()
            : await base.order("updated_at", { ascending: false }).limit(1).single();

          if (data) {
            loadedTitle = data.title ?? "";
            loadedContent = data.content ?? "";
            loadedSunday = (data.sunday_date as string | null) ?? null;
            gotIt = true;
          }
        }
      } catch { /* fall through to localStorage */ }

      if (!gotIt) {
        try {
          const saved = localStorage.getItem(STORAGE_KEY);
          if (saved) {
            const parsed = JSON.parse(saved);
            loadedTitle = parsed.title ?? "";
            loadedContent = parsed.content ?? "";
          }
        } catch { /* ignore */ }
      }

      if (cancelled) return;

      setTitle(loadedTitle);
      setContent(loadedContent);
      setSundayDate(loadedSunday);
      setReadings(null);
      setReadingsOpen(false);
      setExpandedReadingId(null);
      const paras = loadedContent
        .split("\n\n")
        .map((p: string) => p.trim())
        .filter(Boolean);
      setParagraphs(paras);
      setCurrentPara(0);
      setLoading(false);
    })();

    return () => { cancelled = true; };
  }, [currentId]);

  // Fetch readings when sundayDate is set
  useEffect(() => {
    if (!sundayDate) {
      setReadings(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/readings?date=${isoToCompact(sundayDate)}`);
        if (!res.ok) return;
        const d: DayReadings = await res.json();
        if (!cancelled) setReadings(d);
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, [sundayDate]);

  const hasContent = content.trim().length > 0;

  if (loading) {
    return (
      <div className="view-fade" style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "40vh",
        color: "var(--ambo-text-muted)",
        fontSize: 14,
      }}>
        Loading…
      </div>
    );
  }

  if (!hasContent) {
    return (
      <div
        className="view-fade"
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "60vh",
          gap: 16,
          opacity: 0.5,
        }}
      >
        <CrossIcon />
        <p style={{
          fontSize: 17,
          color: "var(--ambo-text-secondary)",
          textAlign: "center",
          maxWidth: 280,
          lineHeight: 1.6,
        }}>
          Your homily will appear here when you start writing.
        </p>
      </div>
    );
  }

  return (
    <div className="view-fade" style={{ maxWidth: 760, margin: "0 auto", padding: "0 32px 80px" }}>

      {/* Controls */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: 32,
        gap: 16,
      }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button
            onClick={() => setIsScrollMode(true)}
            style={{
              border: "1px solid " + (isScrollMode ? "var(--ambo-accent)" : "var(--ambo-border)"),
              background: isScrollMode ? "var(--ambo-accent-light)" : "transparent",
              color: isScrollMode ? "var(--ambo-accent)" : "var(--ambo-text-muted)",
              fontSize: 12,
              fontWeight: 500,
              padding: "6px 14px",
              borderRadius: 100,
              cursor: "pointer",
              fontFamily: "inherit",
              transition: "all 0.15s",
            }}
          >
            Scroll
          </button>
          <button
            onClick={() => { setIsScrollMode(false); setCurrentPara(0); }}
            style={{
              border: "1px solid " + (!isScrollMode ? "var(--ambo-accent)" : "var(--ambo-border)"),
              background: !isScrollMode ? "var(--ambo-accent-light)" : "transparent",
              color: !isScrollMode ? "var(--ambo-accent)" : "var(--ambo-text-muted)",
              fontSize: 12,
              fontWeight: 500,
              padding: "6px 14px",
              borderRadius: 100,
              cursor: "pointer",
              fontFamily: "inherit",
              transition: "all 0.15s",
            }}
          >
            Step
          </button>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button
            onClick={() => setFontSize((f) => Math.max(18, f - 2))}
            style={fontBtnStyle}
            title="Smaller"
          >
            A
          </button>
          <button
            onClick={() => setFontSize((f) => Math.min(36, f + 2))}
            style={{ ...fontBtnStyle, fontSize: 18 }}
            title="Larger"
          >
            A
          </button>
        </div>
      </div>

      {/* Readings panel (collapsible) */}
      {readings && readings.readings.length > 0 && (
        <div style={{
          marginBottom: 32,
          border: "1px solid var(--ambo-border)",
          borderRadius: 12,
          background: "var(--ambo-surface)",
          overflow: "hidden",
        }}>
          <button
            onClick={() => setReadingsOpen((v) => !v)}
            style={{
              width: "100%",
              border: "none",
              background: "transparent",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "12px 16px",
              cursor: "pointer",
              fontFamily: "inherit",
              textAlign: "left",
            }}
          >
            <span style={{
              fontSize: 12,
              fontWeight: 600,
              color: "var(--ambo-accent)",
              letterSpacing: "0.02em",
              textTransform: "uppercase",
            }}>
              Readings · {readings.dayName}
            </span>
            <span style={{ fontSize: 12, color: "var(--ambo-text-muted)" }}>
              {readingsOpen ? "Hide ▴" : "Show ▾"}
            </span>
          </button>
          {readingsOpen && (
            <div style={{ padding: "4px 16px 16px" }}>
              {readings.readings.map((r) => {
                const isOpen = expandedReadingId === r.id;
                return (
                  <div key={r.id} style={{
                    borderTop: "1px solid var(--ambo-border)",
                    padding: "10px 0",
                  }}>
                    <button
                      onClick={() => setExpandedReadingId(isOpen ? null : r.id)}
                      style={{
                        border: "none",
                        background: "transparent",
                        padding: 0,
                        cursor: "pointer",
                        fontFamily: "inherit",
                        textAlign: "left",
                        width: "100%",
                        display: "flex",
                        alignItems: "baseline",
                        justifyContent: "space-between",
                        gap: 8,
                      }}
                    >
                      <span style={{
                        fontSize: 13,
                        fontWeight: 600,
                        color: "var(--ambo-text-primary)",
                      }}>
                        {r.title}
                      </span>
                      <span style={{
                        fontSize: 12,
                        color: "var(--ambo-text-muted)",
                        fontStyle: "italic",
                      }}>
                        {r.reference}
                      </span>
                    </button>
                    {isOpen && (
                      <div style={{
                        marginTop: 10,
                        fontSize: 15,
                        lineHeight: 1.7,
                        color: "var(--ambo-text-primary)",
                        whiteSpace: "pre-wrap",
                      }}>
                        {r.heading && (
                          <div style={{
                            fontSize: 13,
                            fontStyle: "italic",
                            color: "var(--ambo-text-secondary)",
                            marginBottom: 8,
                          }}>
                            {r.heading}
                          </div>
                        )}
                        {r.text}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Title */}
      {title && (
        <h1 style={{
          fontSize: 28,
          fontWeight: 600,
          color: "var(--ambo-text-primary)",
          letterSpacing: "-0.02em",
          marginBottom: 40,
        }}>
          {title}
        </h1>
      )}

      {/* Scroll mode */}
      {isScrollMode && (
        <div>
          {paragraphs.map((para, i) => (
            <p
              key={i}
              style={{
                fontSize: fontSize,
                lineHeight: 1.85,
                color: "var(--ambo-text-primary)",
                marginBottom: "1.6em",
                letterSpacing: "0.01em",
              }}
            >
              {para}
            </p>
          ))}
        </div>
      )}

      {/* Step mode */}
      {!isScrollMode && paragraphs.length > 0 && (
        <div>
          <p style={{
            fontSize: fontSize,
            lineHeight: 1.85,
            color: "var(--ambo-text-primary)",
            letterSpacing: "0.01em",
            minHeight: "30vh",
            animation: "fadeIn 0.2s ease",
          }}>
            {paragraphs[currentPara]}
          </p>

          <div style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginTop: 48,
          }}>
            <button
              onClick={() => setCurrentPara((c) => Math.max(0, c - 1))}
              disabled={currentPara === 0}
              style={stepBtnStyle(currentPara === 0)}
            >
              ← Previous
            </button>
            <span style={{ fontSize: 13, color: "var(--ambo-text-muted)" }}>
              {currentPara + 1} of {paragraphs.length}
            </span>
            <button
              onClick={() => setCurrentPara((c) => Math.min(paragraphs.length - 1, c + 1))}
              disabled={currentPara === paragraphs.length - 1}
              style={stepBtnStyle(currentPara === paragraphs.length - 1)}
            >
              Next →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const fontBtnStyle: React.CSSProperties = {
  border: "1px solid var(--ambo-border)",
  background: "transparent",
  color: "var(--ambo-text-muted)",
  fontSize: 13,
  fontWeight: 600,
  padding: "4px 10px",
  borderRadius: 8,
  cursor: "pointer",
  fontFamily: "inherit",
  lineHeight: 1,
};

const stepBtnStyle = (disabled: boolean): React.CSSProperties => ({
  border: "1px solid " + (disabled ? "var(--ambo-border)" : "var(--ambo-accent)"),
  background: "transparent",
  color: disabled ? "var(--ambo-text-muted)" : "var(--ambo-accent)",
  fontSize: 14,
  fontWeight: 500,
  padding: "10px 22px",
  borderRadius: 100,
  cursor: disabled ? "default" : "pointer",
  fontFamily: "inherit",
  opacity: disabled ? 0.4 : 1,
  transition: "all 0.15s",
});

function CrossIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
      <rect x="14" y="4" width="4" height="24" rx="2" fill="var(--ambo-text-muted)" />
      <rect x="4" y="11" width="24" height="4" rx="2" fill="var(--ambo-text-muted)" />
    </svg>
  );
}
