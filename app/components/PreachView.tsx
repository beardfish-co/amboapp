"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "ambo-draft";

export default function PreachView() {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [fontSize, setFontSize] = useState(24);
  const [currentPara, setCurrentPara] = useState(0);
  const [paragraphs, setParagraphs] = useState<string[]>([]);
  const [isScrollMode, setIsScrollMode] = useState(true);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const { title: t, content: c } = JSON.parse(saved);
        if (t) setTitle(t);
        if (c) {
          setContent(c);
          const paras = c
            .split("\n\n")
            .map((p: string) => p.trim())
            .filter(Boolean);
          setParagraphs(paras);
        }
      }
    } catch {
      // no saved draft
    }
  }, []);

  const hasContent = content.trim().length > 0;

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

      {/* Controls — subtle, top right */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: 40,
        gap: 16,
      }}>
        {/* Mode toggle */}
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

        {/* Font size */}
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

      {/* Scroll mode — full text */}
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

      {/* Step mode — one paragraph at a time */}
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
