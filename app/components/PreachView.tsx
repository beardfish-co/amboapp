"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { renderInline } from "@/lib/inline-markdown";
import { PillButton } from "@/lib/ui/pill-button";

const STORAGE_KEY = "ambo-draft";



interface PreachViewProps {
  currentId: string | null;
  preachVersion?: number;
  liveContent?: { title: string; content: string } | null;
}

type Block =
  | { kind: "body"; text: string }
  | { kind: "breath" }
  | { kind: "quote"; text: string; citation?: string };

function parseBlocks(text: string): Block[] {
  return text
    .split("\n\n")
    .map((block) => block.replace(/[ \t]+$|^[ \t]+/g, ""))
    .map((block): Block => {
      if (block === "") return { kind: "breath" };
      const lines = block.split("\n");
      const hasQuoteMarker = lines.some((l) => l.startsWith("> "));
      if (hasQuoteMarker) {
        let citation: string | undefined;
        if (lines.length > 0 && /^—\s+/.test(lines[lines.length - 1])) {
          citation = lines[lines.length - 1].replace(/^—\s+/, "").trim();
          lines.pop();
        }
        const quoteText = lines
          .map((l) => l.replace(/^>\s?/, ""))
          .join("\n")
          .trim();
        return { kind: "quote", text: quoteText, citation };
      }
      return { kind: "body", text: block };
    });
}

export default function PreachView({ currentId, preachVersion, liveContent }: PreachViewProps) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");

  // Mirror live content from WriteView instantly — no Supabase round-trip needed
  useEffect(() => {
    if (!liveContent) return;
    setTitle(liveContent.title);
    setContent(liveContent.content);
    setBlocks(parseBlocks(liveContent.content));
    setCurrentBlock(0);
  }, [liveContent]);
  const [sundayDate, setSundayDate] = useState<string | null>(null);
  const [fontSize, setFontSize] = useState(24);
  const [currentBlock, setCurrentBlock] = useState(0);
  const [blocks, setBlocks] = useState<Block[]>([]);
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
      setBlocks(parseBlocks(loadedContent));
      setCurrentBlock(0);
      setLoading(false);
    })();

    return () => { cancelled = true; };
  }, [currentId, preachVersion]);


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
    <div className="view-fade preach-print-root" style={{ maxWidth: 840, margin: "0 auto", padding: isScrollMode ? "0 20px 80px" : "0 20px 0", ...(isScrollMode ? {} : { height: "100%", minHeight: 0, display: "flex", flexDirection: "column" as const }), ["--print-font-size" as string]: `${fontSize}px` }}>

      {/* Controls */}
      <div className="preach-controls" style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: 20,
        gap: 16,
      }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <PillButton
            variant={isScrollMode ? "active" : "ghost"}
            onClick={() => setIsScrollMode(true)}
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
              ...(isScrollMode ? {
                border: "1px solid rgba(74, 111, 165, 0.45)",
                background: "var(--ambo-accent-faint)",
              } : {}),
            }}
          >
            Scroll
          </PillButton>
          <PillButton
            variant={!isScrollMode ? "active" : "ghost"}
            onClick={() => { setIsScrollMode(false); setCurrentBlock(0); }}
            icon={
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }}>
                <polyline points="3.5,4 9,8 3.5,12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                <line x1="12.5" y1="4" x2="12.5" y2="12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
              </svg>
            }
            style={{
              height: 34, padding: "0 14px",
              ...(!isScrollMode ? {
                border: "1px solid rgba(74, 111, 165, 0.45)",
                background: "var(--ambo-accent-faint)",
              } : {}),
            }}
          >
            Step
          </PillButton>
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
          <PillButton
            variant="ghost"
            onClick={() => window.print()}
            title="Print or save as PDF"
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


      {/* White panel — holds the design language. The seed, title, and
          homily body all sit on the same ambo-surface card used across the
          rest of the app. Chrome (font controls, back button, readings
          drawer) stays outside the panel. */}
      <div
        className="glass-card"
        style={{
          padding: isScrollMode ? "56px 28px" : "56px 28px 36px",
          marginBottom: isScrollMode ? 40 : 0,
          ...(isScrollMode ? {} : { flex: 1, display: "flex", flexDirection: "column" as const, minHeight: 0 }),
        }}
      >
      {/* Title */}
      {title && (
        <h1 style={{
          fontSize: 28,
          fontWeight: 600,
          flexShrink: 0,
          color: "var(--ambo-text-primary)",
          letterSpacing: "-0.02em",
          marginBottom: 48,
        }}>
          {title}
        </h1>
      )}

      {/* Scroll mode */}
      {isScrollMode && (
        <div>
          {blocks.map((block, i) => {
            if (block.kind === "quote") {
              return <QuoteDisplay key={i} block={block} fontSize={fontSize} />;
            }
            if (block.kind === "breath") {
              // A kept-blank paragraph becomes visible room to breathe.
              return (
                <div
                  key={i}
                  aria-hidden
                  style={{ height: "1.8em", marginBottom: "1.6em" }}
                />
              );
            }
            return (
              <p
                key={i}
                style={{
                  fontFamily: "var(--ambo-font-reading)",
                  fontSize: fontSize,
                  lineHeight: "var(--ambo-lh-reading)",
                  color: "var(--ambo-text-primary)",
                  marginBottom: "2em",
                  letterSpacing: "0.01em",
                  whiteSpace: "pre-wrap",
                }}
              >
                {renderInline(block.text)}
              </p>
            );
          })}
        </div>
      )}

      {/* Step mode — breath blocks are skipped, they don't merit their own step */}
      {!isScrollMode && (() => {
        const stepBlocks = blocks.filter(
          (b): b is Extract<Block, { kind: "body" | "quote" }> => b.kind !== "breath",
        );
        if (stepBlocks.length === 0) return null;
        const safeIdx = Math.min(currentBlock, stepBlocks.length - 1);
        const active = stepBlocks[safeIdx];
        return (
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              minHeight: 0,
            }}
          >
            <div style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              animation: "fadeIn 0.3s ease",
            }}>
              <div style={{ width: "100%" }}>
                {active.kind === "quote" ? (
                  <QuoteDisplay block={active} fontSize={fontSize} />
                ) : (
                  <p style={{
                    fontFamily: "var(--ambo-font-reading)",
                    fontSize: fontSize,
                    lineHeight: "var(--ambo-lh-reading)",
                    color: "var(--ambo-text-primary)",
                    letterSpacing: "0.01em",
                    whiteSpace: "pre-wrap",
                    margin: 0,
                  }}>
                    {renderInline(active.text)}
                  </p>
                )}
              </div>
            </div>

            <div style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              paddingTop: 24,
              paddingBottom: 16,
            }}>
              <button
                onClick={() => setCurrentBlock((c) => Math.max(0, c - 1))}
                disabled={safeIdx === 0}
                style={stepBtnStyle(safeIdx === 0)}
              >
                ← Previous
              </button>
              <span style={{ fontSize: 13, color: "var(--ambo-text-muted)" }}>
                {safeIdx + 1} of {stepBlocks.length}
              </span>
              <button
                onClick={() => setCurrentBlock((c) => Math.min(stepBlocks.length - 1, c + 1))}
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

      <style>{`
        @media print {
          /* Always print in light mode — no dark backgrounds wasting ink */
          :root {
            --ambo-bg:           white !important;
            --ambo-surface:      white !important;
            --ambo-surface-solid: white !important;
            --ambo-text-primary:  black !important;
            --ambo-text-secondary: #444 !important;
            --ambo-text-muted:    #666 !important;
            --ambo-border:        #ccc !important;
            --ambo-accent:        #4A6FA5 !important;
            --ambo-accent-light:  rgba(74, 111, 165, 0.12) !important;
          }

          /* Hide all app chrome */
          header, footer, nav, .mode-pill, .preach-controls, .preach-readings-panel {
            display: none !important;
          }

          /* Bust open the fixed-height page shell so all content can flow */
          html, body {
            height: auto !important;
            overflow: visible !important;
            background: white !important;
            color: black !important;
            color-scheme: light !important;
          }

          /* Bust open the fixed-height page shell */
          body > div,
          body > div > main {
            height: auto !important;
            overflow: visible !important;
            flex: none !important;
            min-height: 0 !important;
          }

          /* Hide the other view wrappers — only show preach */
          .view-wrapper--reflect,
          .view-wrapper--write {
            display: none !important;
          }

          /* Show the preach wrapper */
          .view-wrapper--preach {
            display: block !important;
            height: auto !important;
            overflow: visible !important;
          }

          /* The homily content itself — no backgrounds, no boxes */
          .preach-print-root {
            max-width: 100% !important;
            padding: 0 !important;
            height: auto !important;
            min-height: 0 !important;
            display: block !important;
            overflow: visible !important;
          }

          /* Strip all card/panel backgrounds and borders */
          .preach-print-root .glass-card,
          .preach-print-root > * {
            background: transparent !important;
            box-shadow: none !important;
            border: none !important;
            border-radius: 0 !important;
            backdrop-filter: none !important;
            -webkit-backdrop-filter: none !important;
            padding: 0 !important;
            margin-bottom: 0 !important;
          }

          /* Keep the seed quote left-border but make it subtle */
          .preach-print-root .glass-card > div:first-child {
            border-left: 1px solid #999 !important;
            padding-left: 12px !important;
          }

          .preach-print-root p {
            font-size: var(--print-font-size) !important;
            color: black !important;
          }

          .preach-print-root h1 {
            font-size: calc(var(--print-font-size) * 1.3) !important;
            color: black !important;
          }
        }
      `}</style>
    </div>
  );
}

function QuoteDisplay({
  block,
  fontSize,
}: {
  block: Extract<Block, { kind: "quote" }>;
  fontSize: number;
}) {
  return (
    <div
      style={{
        margin: "0 0 1.6em",
        borderLeft: "3px solid var(--ambo-accent)",
        paddingLeft: 18,
        paddingTop: 4,
        paddingBottom: 4,
      }}
    >
      <p
        style={{
          fontFamily: "var(--ambo-font-reading)",
          fontSize: fontSize,
          lineHeight: "var(--ambo-lh-reading)",
          color: "var(--ambo-text-primary)",
          letterSpacing: "0.01em",
          fontStyle: "italic",
          margin: 0,
          whiteSpace: "pre-wrap",
        }}
      >
        {renderInline(block.text)}
      </p>
      {block.citation && (
        <div
          style={{
            marginTop: 10,
            fontSize: Math.max(13, Math.round(fontSize * 0.6)),
            color: "var(--ambo-text-muted)",
            fontStyle: "normal",
            letterSpacing: "0.01em",
          }}
        >
          — {block.citation}
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
