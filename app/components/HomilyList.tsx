"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { loadDayName } from "@/lib/readings";

// ── Types ──────────────────────────────────────────────────────────────────
export interface HomilyRow {
  id: string;
  title: string | null;
  content: string | null;
  sunday_date: string | null;
  note_type: string | null;      // 'sunday' | 'daily' | 'special'
  liturgical_day: string | null; // e.g. "Friday of the Fourth Week of Easter"
  saint_name: string | null;     // saint name on memorial days
  updated_at: string;
  created_at: string;
}

interface SearchResult {
  id: string;
  title: string | null;
  sunday_date: string | null;
  updated_at: string;
  created_at: string;
  content: string | null;
  excerpt: string;
  layer: "content" | "thread" | "notes" | "followups";
  confidence: "strong" | "loose";
}

// Mirror of ArchiveEntry from EchoWorkspace — avoid cross-import
interface ArchiveEntry {
  id: string;
  output_type: string;
  variant: string | null;
  output_text: string;
  generated_text: string;
  homily_id: string | null;
  created_at: string;
  updated_at: string;
  homily_title: string | null;
  homily_sunday_date: string | null;
}

interface HomilyListProps {
  open: boolean;
  currentId: string | null;
  onClose: () => void;
  onSelect: (id: string) => void;
  /** Opens the existing Sunday Reflect/Write/Preach flow */
  onCreate: () => void;
  /** Opens the Daily Mass surface */
  onCreateDaily: (date: string) => void;
  onOpenInWrite: (homily: HomilyRow) => void;
  onOpenEcho: (sundayLabel: string, homilyText: string, homilyId: string) => void;
  onOpenEchoEntry: (entry: ArchiveEntry) => void;
  refreshKey?: number;
}

// ── Constants ──────────────────────────────────────────────────────────────

const SEARCH_PLACEHOLDERS = [
  "When did I preach on mercy?",
  "Anything I said about the Eucharist last Lent?",
  "That homily where I quoted Augustine",
  "Funeral homilies on hope",
  "Where I spoke about the troubled heart",
];

const LAYER_LABELS: Record<string, string> = {
  thread: "from a discernment thread",
  followups: "from follow-up notes",
  notes: "from notes",
};

const ECHO_TYPE_LABELS: Record<string, string> = {
  "take-into-the-week":    "Take Into the Week",
  "parish-reflection":     "Parish Reflection",
  "social-post":           "Social Post",
  "small-group-questions": "Small Group Questions",
  "prayer-prompt":         "Prayer Prompt",
};

// ── Shared Sunday-name cache ───────────────────────────────────────────────
const sundayNameCache: Map<string, string> = (globalThis as typeof globalThis & {
  __amboSundayNameCache?: Map<string, string>;
}).__amboSundayNameCache ??= new Map<string, string>();

// ── Utility helpers ────────────────────────────────────────────────────────
function parseIsoDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function friendlyDate(iso: string): string {
  const d = parseIsoDate(iso);
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function relativeTime(iso: string): string {
  const diff = Math.max(0, Date.now() - new Date(iso).getTime());
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function wordCount(content: string | null): number {
  if (!content) return 0;
  return content.trim().split(/\s+/).filter(Boolean).length;
}

function lectionaryYear(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const isAfterAdvent = (m === 11 && d >= 27) || m === 12;
  const litStart = isAfterAdvent ? y : y - 1;
  return "Year " + ["A", "B", "C"][litStart % 3];
}

function fourWeeksAgoIso(): string {
  const d = new Date();
  d.setDate(d.getDate() - 28);
  return d.toISOString().slice(0, 10);
}

function parseContentParagraphs(content: string | null): string[] {
  if (!content) return [];
  return content.split(/\n+/).map((s) => s.trim()).filter(Boolean);
}

// Format variant string for display
function variantLabel(variant: string | null): string {
  if (!variant) return "";
  switch (variant) {
    case "short":          return "Short · ~80w";
    case "standard":       return "Standard · ~175w";
    case "longer":         return "Longer · ~350w";
    case "before-sunday":  return "Before Sunday";
    case "after-sunday":   return "After Sunday";
    default: return variant.charAt(0).toUpperCase() + variant.slice(1).replace(/-/g, " ");
  }
}

// ── Echo output type icon (mirrors EchoWorkspace EchoTabIcon) ─────────────
function EchoTypeIcon({ type }: { type: string }) {
  const s = { width: 13, height: 13, display: "block" as const, flexShrink: 0 };
  switch (type) {
    case "take-into-the-week":
      return <svg {...s} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M5 10h10M11 6l4 4-4 4"/></svg>;
    case "parish-reflection":
      return <svg {...s} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M5 3h7l4 4v10a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/><path d="M12 3v4h4M7 11h6M7 14h4"/></svg>;
    case "social-post":
      return <svg {...s} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="15" cy="5" r="2"/><circle cx="5" cy="10" r="2"/><circle cx="15" cy="15" r="2"/><path d="M7 9l6-3M7 11l6 3"/></svg>;
    case "small-group-questions":
      return <svg {...s} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H8l-4 3V14z"/></svg>;
    case "prayer-prompt":
      return <svg {...s} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M10 3v14M4 8h12"/></svg>;
    default:
      return <svg {...s} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="3" width="12" height="14" rx="1"/></svg>;
  }
}

// ── Sub-components ─────────────────────────────────────────────────────────

interface ArchiveCardProps {
  id: string;
  title: string | null;
  sunday_date: string | null;
  note_type?: string | null;
  liturgical_day?: string | null;
  updated_at: string;
  content: string | null;
  onOpen: () => void;
  onDelete: (id: string) => void;
  excerpt?: string;
  layer?: "content" | "thread" | "notes" | "followups";
  confidence?: "strong" | "loose";
  onOpenEcho?: (sundayLabel: string, homilyText: string, homilyId: string) => void;
  onEchoInteract?: () => void;
}

function ArchiveCard({
  id, title, sunday_date, note_type, liturgical_day, updated_at, content,
  onOpen, onDelete,
  excerpt, layer, confidence, onOpenEcho, onEchoInteract,
}: ArchiveCardProps) {
  const sundayName = sunday_date ? sundayNameCache.get(sunday_date) : undefined;
  const isDaily = note_type === "daily";
  const displayTitle = (title && title.trim()) || (isDaily ? liturgical_day : sundayName) || "Untitled";
  const subtitle = sunday_date
    ? `${sundayName ?? "Sunday"} · ${lectionaryYear(sunday_date)}`
    : null;
  const isSearchResult = excerpt !== undefined;
  const isLoose = confidence === "loose";
  const layerLabel = layer && layer !== "content" ? LAYER_LABELS[layer] : null;
  const words = wordCount(content);

  return (
    <div
      className="glass-card"
      style={{
        padding: "18px 22px 16px",
        margin: "0 0 8px",
        cursor: "pointer",
        transition: "box-shadow 0.15s",
      }}
      onClick={() => { onEchoInteract?.(); onOpen(); }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.boxShadow = "var(--ambo-shadow-lg)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.boxShadow = "var(--ambo-shadow-md)";
      }}
    >
      {/* Title + timestamp */}
      <div style={{
        display: "flex",
        alignItems: "baseline",
        justifyContent: "space-between",
        gap: 10,
        marginBottom: subtitle ? 4 : 10,
      }}>
        <div style={{
          fontFamily: "var(--ambo-font-reading)",
          fontSize: 16,
          fontStyle: "italic",
          fontWeight: 500,
          color: "var(--ambo-text-primary)",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          flex: 1,
        }}>
          {displayTitle}
        </div>
        <div style={{ fontSize: 11, color: "var(--ambo-text-muted)", flexShrink: 0 }}>
          {relativeTime(updated_at)}
        </div>
      </div>

      {subtitle && (
        <div style={{
          fontSize: 11,
          fontWeight: 500,
          color: "var(--ambo-accent)",
          marginBottom: 10,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          opacity: 0.85,
        }}>
          {subtitle}
        </div>
      )}

      {isSearchResult && excerpt && (
        <div style={{
          fontSize: 13,
          color: "var(--ambo-text-secondary)",
          lineHeight: 1.65,
          marginBottom: 14,
          display: "-webkit-box",
          WebkitLineClamp: 3,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
        }}>
          {excerpt}
        </div>
      )}

      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 8,
      }}>
        <div style={{
          fontSize: 11,
          color: "var(--ambo-text-muted)",
          display: "flex",
          gap: 8,
          flexWrap: "wrap",
        }}>
          {isSearchResult ? (
            <>
              {layerLabel && <span style={{ fontStyle: "italic" }}>{layerLabel}</span>}
              {isLoose && <span style={{ fontStyle: "italic", opacity: 0.75 }}>loosely related</span>}
            </>
          ) : (
            <>
              <span>{words} {words === 1 ? "word" : "words"}</span>
              {sunday_date && <span>· {friendlyDate(sunday_date)}</span>}
            </>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          {onOpenEcho && subtitle && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onEchoInteract?.();
                onOpenEcho(subtitle, content ?? "", id);
              }}
              aria-label="Open Echo for this homily"
              style={{
                border: "1px solid rgba(74, 111, 165, 0.3)",
                background: "transparent",
                color: "var(--ambo-accent)",
                cursor: "pointer",
                padding: "2px 8px",
                borderRadius: 100,
                fontSize: 11,
                fontFamily: "inherit",
                fontWeight: 500,
                opacity: 0.8,
                flexShrink: 0,
                transition: "opacity 0.15s",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")}
              onMouseLeave={(e) => (e.currentTarget.style.opacity = "0.8")}
            >
              Echo
            </button>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(id); }}
            aria-label="Delete homily"
            style={{
              border: "none", background: "none", color: "var(--ambo-text-muted)",
              cursor: "pointer", padding: "2px 6px", borderRadius: 6,
              fontSize: 11, fontFamily: "inherit", opacity: 0.7, flexShrink: 0,
            }}
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

function SectionLabel({ label }: { label: string }) {
  return (
    <div style={{
      fontSize: 10,
      fontWeight: 700,
      letterSpacing: "0.08em",
      textTransform: "uppercase",
      color: "var(--ambo-text-muted)",
      padding: "12px 4px 6px",
      opacity: 0.7,
    }}>
      {label}
    </div>
  );
}

// ── Echoes section — expandable in reading view ────────────────────────────

interface EchoesSectionProps {
  homilyId: string;
  onOpenEchoEntry: (entry: ArchiveEntry) => void;
}

function EchoesSection({ homilyId, onOpenEchoEntry }: EchoesSectionProps) {
  const [outputs, setOutputs] = useState<ArchiveEntry[] | null>(null);
  const [expanded, setExpanded] = useState(false);

  // Fetch echoes for this homily on mount
  useEffect(() => {
    fetch(`/api/echo/archive?homilyId=${encodeURIComponent(homilyId)}`)
      .then((r) => r.json())
      .then(({ outputs: rows }) => setOutputs(rows ?? []))
      .catch(() => setOutputs([]));
  }, [homilyId]);

  // Don't render until we know there are echoes
  if (!outputs || outputs.length === 0) return null;

  const count = outputs.length;

  // Animation easing — deliberately slow, contemplative breath
  // Expand: 1400ms ease-out (inhale). Collapse: 1100ms ease-in (exhale).
  const dur     = expanded ? 1400 : 1100;
  const ease    = expanded ? "cubic-bezier(0.22, 1, 0.36, 1)" : "cubic-bezier(0.55, 0, 1, 0.45)";
  const transFn = `${dur}ms ${ease}`;

  return (
    <>
      <style>{`
        @media print {
          .echoes-section-collapsed { display: none !important; }
          .echo-row-preview { display: none !important; }
          .echo-print-full { display: block !important; }
          .echoes-print-block { display: block !important; }
        }
        .echo-print-full { display: none; }
        .echoes-print-block { display: none; }
      `}</style>

      {/* Section rule */}
      <div style={{
        height: 1,
        background: "var(--ambo-rule-subtle, rgba(74,111,165,0.12))",
        margin: "48px 0 0",
      }} />

      {/* Toggle line */}
      <button
        onClick={() => setExpanded((v) => !v)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          background: "none",
          border: "none",
          padding: "20px 0 0",
          cursor: "pointer",
          fontFamily: "var(--ambo-font-reading)",
          fontSize: "clamp(13px, 2vw, 14px)",
          fontStyle: "italic",
          color: "var(--ambo-text-muted)",
          lineHeight: 1.4,
          width: "100%",
          textAlign: "left",
        }}
        aria-expanded={expanded}
      >
        {/* Chevron — rotates with same timing as section */}
        <svg
          width="14" height="14" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2"
          strokeLinecap="round" strokeLinejoin="round"
          style={{
            flexShrink: 0,
            transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
            transition: `transform ${transFn}`,
          }}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
        <span>
          {expanded ? "↑" : "↓"} echoes from this homily ({count})
        </span>
      </button>

      {/* Expandable body — grid-template-rows trick for height animation */}
      <div
        className={expanded ? undefined : "echoes-section-collapsed"}
        style={{
          display: "grid",
          gridTemplateRows: expanded ? "1fr" : "0fr",
          opacity: expanded ? 1 : 0,
          transition: `grid-template-rows ${transFn}, opacity ${transFn}`,
        }}
      >
        <div style={{ overflow: "hidden" }}>
          <div style={{ paddingTop: 8, paddingBottom: 32 }}>
            {outputs.map((entry) => {
              const typeLabel = ECHO_TYPE_LABELS[entry.output_type] ?? entry.output_type;
              const vLabel = variantLabel(entry.variant);
              const savedAt = relativeTime(entry.created_at);
              const fullText = entry.output_text ?? entry.generated_text ?? "";

              return (
                <div key={entry.id}>
                  {/* Screen row — visible when expanded */}
                  <button
                    className="echo-row-preview"
                    onClick={() => onOpenEchoEntry(entry)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      width: "100%",
                      textAlign: "left",
                      background: "none",
                      border: "none",
                      borderBottom: "1px solid var(--ambo-rule-subtle, rgba(74,111,165,0.1))",
                      padding: "14px 0",
                      cursor: "pointer",
                      fontFamily: "var(--ambo-font-ui)",
                    }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.opacity = "0.7"; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.opacity = "1"; }}
                  >
                    {/* Icon */}
                    <span style={{ color: "var(--ambo-text-muted)", flexShrink: 0 }}>
                      <EchoTypeIcon type={entry.output_type} />
                    </span>

                    {/* Label + variant */}
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{
                        fontSize: 13,
                        fontStyle: "italic",
                        color: "var(--ambo-text-primary)",
                      }}>
                        {typeLabel}
                      </span>
                      {vLabel && (
                        <span style={{
                          fontSize: 11,
                          color: "var(--ambo-text-muted)",
                          marginLeft: 6,
                        }}>
                          {vLabel}
                        </span>
                      )}
                    </span>

                    {/* Date */}
                    <span style={{
                      fontSize: 11,
                      color: "var(--ambo-text-muted)",
                      flexShrink: 0,
                      marginRight: 6,
                    }}>
                      {savedAt}
                    </span>

                    {/* Right chevron */}
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                      stroke="var(--ambo-text-muted)" strokeWidth="2"
                      strokeLinecap="round" strokeLinejoin="round"
                      style={{ flexShrink: 0 }}>
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                  </button>

                  {/* Print-only full content */}
                  <div className="echo-print-full" style={{ paddingBottom: 24 }}>
                    <p style={{
                      fontFamily: "Georgia, serif",
                      fontSize: 10,
                      fontWeight: 700,
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                      color: "#777",
                      margin: "0 0 6px",
                    }}>
                      {typeLabel}{vLabel ? ` · ${vLabel}` : ""}
                    </p>
                    <p style={{
                      fontFamily: "Georgia, serif",
                      fontSize: 12,
                      lineHeight: 1.75,
                      color: "#111",
                      margin: 0,
                      whiteSpace: "pre-line",
                    }}>
                      {fullText}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Print block — heading + all full-content echoes (only when expanded, via print CSS) */}
      <div className="echoes-print-block">
        <hr style={{ margin: "32px 0 24px", border: "none", borderTop: "1px solid #ccc" }} />
        <p style={{
          fontFamily: "Georgia, serif",
          fontSize: 13,
          fontStyle: "italic",
          color: "#555",
          margin: "0 0 20px",
        }}>
          Echoes from this homily
        </p>
      </div>
    </>
  );
}

// ── Reading view ───────────────────────────────────────────────────────────
interface ReadingViewProps {
  homily: HomilyRow | SearchResult;
  closing: boolean;
  onClose: () => void;
  onOpenInWrite: (homily: HomilyRow) => void;
  onOpenEcho?: (sundayLabel: string, homilyText: string, homilyId: string) => void;
  onOpenEchoEntry: (entry: ArchiveEntry) => void;
}

function ReadingView({ homily, closing, onClose, onOpenInWrite, onOpenEcho, onOpenEchoEntry }: ReadingViewProps) {
  const sundayName = homily.sunday_date
    ? sundayNameCache.get(homily.sunday_date)
    : undefined;
  const title = (homily.title && homily.title.trim()) || sundayName || "Untitled";
  const subtitle = homily.sunday_date
    ? `${sundayName ?? "Sunday"} · ${lectionaryYear(homily.sunday_date)}`
    : null;
  const paragraphs = parseContentParagraphs(homily.content);
  const words = wordCount(homily.content);

  const homilyRow: HomilyRow = {
    id: homily.id,
    title: homily.title,
    content: homily.content,
    sunday_date: homily.sunday_date,
    note_type: (homily as HomilyRow).note_type ?? "sunday",
    liturgical_day: (homily as HomilyRow).liturgical_day ?? null,
    saint_name: (homily as HomilyRow).saint_name ?? null,
    updated_at: homily.updated_at,
    created_at: homily.created_at,
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const anim = closing
    ? "rvFadeOut 2000ms cubic-bezier(0.6, 0, 1, 1) both"
    : "rvFadeIn 780ms ease-out both";

  return (
    <>
      <style>{`
        @keyframes rvFadeIn  { from { opacity: 0 } to { opacity: 1 } }
        @keyframes rvFadeOut { from { opacity: 1 } to { opacity: 0 } }
      `}</style>

      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 200,
          background: "rgba(10, 15, 25, 0.17)",
          overflowY: "auto",
          display: "flex",
          justifyContent: "center",
          alignItems: "flex-start",
          padding: "clamp(0px, 7vh, 72px) clamp(0px, 7vw, 100px)",
          animation: anim,
        }}
      >
        <div
          id="ambo-reading-print"
          onClick={(e) => e.stopPropagation()}
          style={{
            width: "min(760px, 100%)",
            minHeight: "min(500px, 70vh)",
            padding: "48px clamp(24px, 5vw, 52px) 72px",
            background: "var(--ambo-surface-reading)",
            backdropFilter: "blur(22px) saturate(1.4)",
            WebkitBackdropFilter: "blur(22px) saturate(1.4)",
            border: "1px solid var(--ambo-border)",
            borderRadius: "clamp(0px, 2vw, 20px)",
            boxShadow: "var(--ambo-shadow-lg)",
            flexShrink: 0,
          }}
        >
          {/* Top chrome */}
          <div style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 40,
          }}>
            <button
              onClick={onClose}
              aria-label="Close reading view"
              style={{
                border: "none",
                background: "none",
                color: "var(--ambo-text-muted)",
                cursor: "pointer",
                fontSize: 22,
                lineHeight: 1,
                padding: 0,
                display: "flex",
                alignItems: "center",
                gap: 6,
                fontFamily: "inherit",
              }}
            >
              ‹
            </button>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              {onOpenEcho && subtitle && (
                <button
                  onClick={() => onOpenEcho(subtitle, homily.content ?? "", homily.id)}
                  style={{
                    border: "1px solid rgba(74, 111, 165, 0.35)",
                    background: "transparent",
                    color: "var(--ambo-accent)",
                    cursor: "pointer",
                    fontSize: 12,
                    fontWeight: 500,
                    fontFamily: "inherit",
                    padding: "5px 14px",
                    borderRadius: 100,
                  }}
                >
                  Echo
                </button>
              )}
              <button
                onClick={() => window.print()}
                style={{
                  border: "none",
                  background: "none",
                  color: "var(--ambo-text-muted)",
                  cursor: "pointer",
                  fontSize: 13,
                  fontFamily: "inherit",
                  opacity: 0.7,
                  padding: 0,
                }}
                onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")}
                onMouseLeave={(e) => (e.currentTarget.style.opacity = "0.7")}
              >
                Print
              </button>
              <button
                onClick={() => { onClose(); onOpenInWrite(homilyRow); }}
                style={{
                  border: "none",
                  background: "none",
                  color: "var(--ambo-accent)",
                  cursor: "pointer",
                  fontSize: 13,
                  fontFamily: "inherit",
                  opacity: 0.8,
                  padding: 0,
                }}
              >
                Edit
              </button>
            </div>
          </div>

          {/* Title */}
          <h1 style={{
            fontFamily: "var(--ambo-font-reading)",
            fontSize: "clamp(22px, 4vw, 28px)",
            fontStyle: "italic",
            fontWeight: 500,
            color: "var(--ambo-text-primary)",
            lineHeight: 1.25,
            margin: "0 0 10px",
            letterSpacing: "-0.01em",
          }}>
            {title}
          </h1>

          {subtitle && (
            <div style={{
              fontSize: 13,
              fontWeight: 500,
              color: "var(--ambo-accent)",
              opacity: 0.85,
              marginBottom: 6,
            }}>
              {subtitle}
            </div>
          )}
          <div style={{
            fontSize: 12,
            color: "var(--ambo-text-muted)",
            marginBottom: 44,
          }}>
            {words} {words === 1 ? "word" : "words"}
            {homily.sunday_date && ` · ${friendlyDate(homily.sunday_date)}`}
          </div>

          {/* Body */}
          {paragraphs.length === 0 ? (
            <p style={{
              fontFamily: "var(--ambo-font-reading)",
              fontSize: 16,
              fontStyle: "italic",
              color: "var(--ambo-text-muted)",
            }}>
              This homily has no content yet.
            </p>
          ) : (
            paragraphs.map((p, i) => (
              <p key={i} style={{
                fontFamily: "var(--ambo-font-reading)",
                fontSize: "clamp(15px, 2.5vw, 17px)",
                lineHeight: 1.85,
                color: "var(--ambo-text-primary)",
                margin: "0 0 1.2em",
              }}>
                {p}
              </p>
            ))
          )}

          {/* Echoes section — shown only when this homily has saved outputs */}
          <EchoesSection
            homilyId={homily.id}
            onOpenEchoEntry={onOpenEchoEntry}
          />
        </div>
      </div>
    </>
  );
}

// ── One-time Echo onboarding tooltip ──────────────────────────────────────

interface EchoTooltipProps {
  onDismiss: () => void;
}

function EchoTooltip({ onDismiss }: EchoTooltipProps) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 8,
        padding: "0 0 14px",
        animation: "fadeIn 600ms ease-out both",
      }}
    >
      <p style={{
        fontFamily: "var(--ambo-font-reading)",
        fontStyle: "italic",
        fontSize: 12,
        color: "var(--ambo-text-muted)",
        margin: 0,
        lineHeight: 1.5,
        opacity: 0.75,
      }}>
        Tap echo on any homily to carry your words forward.
      </p>
      <button
        onClick={onDismiss}
        aria-label="Dismiss"
        style={{
          border: "none",
          background: "none",
          color: "var(--ambo-text-muted)",
          cursor: "pointer",
          fontSize: 14,
          lineHeight: 1,
          padding: "0 2px",
          flexShrink: 0,
          opacity: 0.5,
        }}
        onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.9")}
        onMouseLeave={(e) => (e.currentTarget.style.opacity = "0.5")}
      >
        ×
      </button>
    </div>
  );
}

// ── Daily day-picker helpers ──────────────────────────────────────────────

/**
 * Returns the next `count` non-Sunday ISO date strings starting from today.
 * The priest picks one of these in the drawer before the Daily surface opens.
 */
function buildDailyOptions(count = 7): string[] {
  const options: string[] = [];
  const cursor = new Date();
  cursor.setHours(0, 0, 0, 0);
  while (options.length < count) {
    if (cursor.getDay() !== 0) {
      const y = cursor.getFullYear();
      const m = String(cursor.getMonth() + 1).padStart(2, "0");
      const d = String(cursor.getDate()).padStart(2, "0");
      options.push(`${y}-${m}-${d}`);
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return options;
}

function dailyOptionLabel(iso: string): { main: string; sub: string } {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const y = today.getFullYear();
  const m = String(today.getMonth() + 1).padStart(2, "0");
  const d = String(today.getDate()).padStart(2, "0");
  const todayStr = `${y}-${m}-${d}`;
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const ty = tomorrow.getFullYear();
  const tm = String(tomorrow.getMonth() + 1).padStart(2, "0");
  const td = String(tomorrow.getDate()).padStart(2, "0");
  const tomorrowStr = `${ty}-${tm}-${td}`;

  const dt = new Date(iso + "T00:00:00");
  if (iso === todayStr) return { main: "Today", sub: dt.toLocaleDateString(undefined, { weekday: "long" }) };
  if (iso === tomorrowStr) return { main: "Tomorrow", sub: dt.toLocaleDateString(undefined, { weekday: "long" }) };
  return {
    main: dt.toLocaleDateString(undefined, { weekday: "long" }),
    sub: dt.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
  };
}

// ── Main component ─────────────────────────────────────────────────────────
export default function HomilyList({
  open,
  currentId,
  onClose,
  onSelect,
  onCreate,
  onCreateDaily,
  onOpenInWrite,
  onOpenEcho,
  onOpenEchoEntry,
  refreshKey = 0,
}: HomilyListProps) {
  const [homilies, setHomilies] = useState<HomilyRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[] | null>(null);
  const [searchStatus, setSearchStatus] = useState<"idle" | "listening" | "done" | "error">("idle");
  const [viewingHomily, setViewingHomily] = useState<HomilyRow | SearchResult | null>(null);
  const [closingReading, setClosingReading] = useState(false);
  const [closingDrawer, setClosingDrawer] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  const [searchFocused, setSearchFocused] = useState(false);
  const [, bumpNames] = useState(0);
  const [dailyPickerOpen, setDailyPickerOpen] = useState(false);

  // One-time Echo onboarding tooltip state
  const [showTooltip, setShowTooltip] = useState(false);
  const tooltipChecked = useRef(false);

  const loadedForKey = useRef<number | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Check tooltip state on first drawer open ───────────────────────────
  useEffect(() => {
    if (!open || tooltipChecked.current) return;
    tooltipChecked.current = true;
    (async () => {
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const dismissed = user.user_metadata?.echo_onboarding_dismissed;
        if (!dismissed) setShowTooltip(true);
      } catch { /* silently skip */ }
    })();
  }, [open]);

  const dismissTooltip = useCallback(async () => {
    setShowTooltip(false);
    try {
      const supabase = createClient();
      await supabase.auth.updateUser({ data: { echo_onboarding_dismissed: true } });
    } catch { /* silently skip */ }
  }, []);

  // ── Load homilies ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    if (loadedForKey.current === refreshKey && homilies !== null) return;

    let cancelled = false;
    (async () => {
      setLoadError(null);
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { if (!cancelled) setLoadError("Not signed in"); return; }
        const { data, error } = await supabase
          .from("homilies")
          .select("id, title, content, sunday_date, note_type, liturgical_day, saint_name, updated_at, created_at")
          .eq("user_id", user.id)
          .order("sunday_date", { ascending: false, nullsFirst: false });
        if (error) throw error;
        if (!cancelled) {
          setHomilies(data ?? []);
          loadedForKey.current = refreshKey;
        }
      } catch (e) {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : "Failed to load");
      }
    })();
    return () => { cancelled = true; };
  }, [open, refreshKey, homilies]);

  // ── Fetch Sunday names ─────────────────────────────────────────────────
  useEffect(() => {
    if (!open || !homilies) return;
    let cancelled = false;
    const targets = homilies
      .filter((h) => !!h.sunday_date && !sundayNameCache.has(h.sunday_date as string))
      .map((h) => ({ id: h.id, iso: h.sunday_date as string }));
    if (targets.length === 0) return;
    (async () => {
      for (const t of targets) {
        if (cancelled) return;
        const name = await loadDayName(t.iso, t.id);
        if (cancelled) return;
        if (name) { sundayNameCache.set(t.iso, name); bumpNames((n) => n + 1); }
      }
    })();
    return () => { cancelled = true; };
  }, [open, homilies]);

  // ── Close drawer with animation ────────────────────────────────────────
  const handleCloseDrawer = useCallback(() => {
    setClosingDrawer(true);
    setTimeout(() => {
      setClosingDrawer(false);
      onClose();
    }, 780);
  }, [onClose]);

  // ── Keyboard: Escape ──────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (viewingHomily) closeReading();
        else if (confirmDeleteId) setConfirmDeleteId(null);
        else handleCloseDrawer();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, handleCloseDrawer, viewingHomily, confirmDeleteId]);

  // ── Reset on close ─────────────────────────────────────────────────────
  // Do NOT reset viewingHomily while closingReading=true — the reading view
  // is still animating out and must stay mounted for the full duration.
  // It will be cleared by its own timeout once the animation completes.
  useEffect(() => {
    if (!open && !closingReading) {
      setViewingHomily(null);
      setSearchQuery("");
      setSearchResults(null);
      setSearchStatus("idle");
      setDailyPickerOpen(false);
    }
  }, [open, closingReading]);

  // ── Static placeholder ─────────────────────────────────────────────────
  useEffect(() => {
    if (open) setPlaceholderIndex(Math.floor(Math.random() * SEARCH_PLACEHOLDERS.length));
  }, [open]);

  // ── Focus search on open ───────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => searchInputRef.current?.focus(), 150);
    return () => clearTimeout(t);
  }, [open]);

  // ── Semantic search with debounce ──────────────────────────────────────
  const runSearch = useCallback(async (query: string) => {
    if (!query.trim()) { setSearchResults(null); setSearchStatus("idle"); return; }
    setSearchStatus("listening");
    try {
      const res = await fetch("/api/search-homilies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });
      if (!res.ok) throw new Error(`${res.status}`);
      const json = await res.json();
      setSearchResults(json.results ?? []);
      setSearchStatus("done");
    } catch {
      setSearchResults([]);
      setSearchStatus("error");
    }
  }, []);

  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    const q = searchQuery.trim();
    if (!q) { setSearchResults(null); setSearchStatus("idle"); return; }
    setSearchStatus("listening");
    searchTimerRef.current = setTimeout(() => runSearch(q), 650);
    return () => { if (searchTimerRef.current) clearTimeout(searchTimerRef.current); };
  }, [searchQuery, runSearch]);

  // ── Close reading view ─────────────────────────────────────────────────
  const closeReading = useCallback(() => {
    setClosingReading(true);
    setTimeout(() => {
      setViewingHomily(null);
      setClosingReading(false);
    }, 2000);
  }, []);

  // ── Delete handler ─────────────────────────────────────────────────────
  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      await supabase.from("homilies").delete().eq("id", id).eq("user_id", user.id);
      setHomilies((prev) => prev ? prev.filter((h) => h.id !== id) : prev);
      setSearchResults((prev) => prev ? prev.filter((r) => r.id !== id) : prev);
      if (viewingHomily?.id === id) setViewingHomily(null);
    } catch { /* keep row visible */ }
    finally { setDeletingId(null); setConfirmDeleteId(null); }
  };

  // ── Browse list split ──────────────────────────────────────────────────
  const cutoff = fourWeeksAgoIso();
  const recentHomilies = (homilies ?? []).filter(
    (h) => h.sunday_date && h.sunday_date >= cutoff
  );
  const olderHomilies = (homilies ?? []).filter(
    (h) => !h.sunday_date || h.sunday_date < cutoff
  );

  const isSearchActive = searchQuery.trim().length > 0;

  if (!open && !closingDrawer && !closingReading) return null;

  return (
    <>
      {/* Reading view — fixed overlay covering the whole app */}
      {viewingHomily && (
        <ReadingView
          homily={viewingHomily}
          closing={closingReading}
          onClose={closeReading}
          onOpenInWrite={(h) => {
            setViewingHomily(null);
            setClosingReading(false);
            onOpenInWrite(h);
          }}
          onOpenEcho={(label, text, hId) => {
            // Start reading view exit animation (2000ms ease-in fade — stays
            // visible for the first ~800ms, then accelerates away. Ensures the view
            // is clearly present when Echo arrives at t=600ms.)
            setClosingReading(true);
            // Open Echo workspace at t=600ms (40% through the reading view fade).
            // ~900ms of simultaneous visibility — reading view still clearly
            // present and dissolving as Echo workspace fully arrives.
            setTimeout(() => {
              onOpenEcho(label, text, hId);
            }, 600);
            // Unmount reading view after its animation completes
            setTimeout(() => {
              setViewingHomily(null);
              setClosingReading(false);
            }, 2000);
          }}
          onOpenEchoEntry={(entry) => {
            setViewingHomily(null);
            setClosingReading(false);
            onOpenEchoEntry(entry);
          }}
        />
      )}

      {/* Drawer backdrop */}
      <div
        onClick={handleCloseDrawer}
        style={{
          position: "fixed", inset: 0,
          background: "rgba(15, 20, 30, 0.24)",
          backdropFilter: "blur(4px)",
          WebkitBackdropFilter: "blur(4px)",
          zIndex: 90,
          animation: closingDrawer
            ? "fadeOut 780ms ease-out both"
            : "fadeIn 780ms ease-out",
        }}
      />

      {/* Drawer */}
      <aside
        role="dialog"
        aria-label="My Homilies"
        style={{
          position: "fixed",
          top: 0, left: 0, bottom: 0,
          width: "min(400px, 100vw)",
          background: "var(--ambo-bg)",
          borderRight: "1px solid var(--ambo-border)",
          zIndex: 100,
          display: "flex",
          flexDirection: "column",
          boxShadow: "var(--ambo-shadow-md)",
          animation: closingDrawer
            ? "slideOutLeft 780ms ease-out both"
            : "slideInLeft 780ms ease-out",
          overflow: "hidden",
        } as React.CSSProperties}
      >
        {/* Header — title + close button */}
        <div style={{
          padding: "16px 20px 0",
          borderBottom: "1px solid var(--ambo-border)",
          flexShrink: 0,
        }}>
          <div style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 14,
          }}>
            <p style={{
              fontFamily: "var(--ambo-font-reading)",
              fontStyle: "italic",
              fontWeight: 500,
              fontSize: 18,
              color: "var(--ambo-text-primary)",
              margin: 0,
              lineHeight: 1.2,
            }}>
              My Homilies
            </p>
            <button
              onClick={handleCloseDrawer}
              aria-label="Close"
              style={{
                border: "none", background: "none",
                fontSize: 20, lineHeight: 1,
                color: "var(--ambo-text-muted)",
                cursor: "pointer", padding: 4, borderRadius: 6,
              }}
            >
              ×
            </button>
          </div>
        </div>

        {/* My Homilies panel — single mode */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>

          {/* Search bar + new button */}
          <div style={{ padding: "16px 20px 12px", flexShrink: 0 }}>
            <div style={{
              display: "flex",
              alignItems: "center",
              borderBottom: `1px solid ${searchFocused ? "var(--ambo-accent)" : "rgba(74, 111, 165, 0.25)"}`,
              paddingBottom: 2,
              transition: "border-color 0.2s",
              marginBottom: 14,
            }}>
              <input
                ref={searchInputRef}
                type="text"
                placeholder={SEARCH_PLACEHOLDERS[placeholderIndex]}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onFocus={() => setSearchFocused(true)}
                onBlur={() => setSearchFocused(false)}
                style={{
                  flex: 1, border: "none", background: "transparent",
                  color: "var(--ambo-text-primary)",
                  fontSize: 13, fontStyle: "italic",
                  padding: "8px 0", outline: "none",
                  fontFamily: "var(--ambo-font-ui)",
                }}
              />
              {searchQuery && (
                <button
                  onClick={() => { setSearchQuery(""); searchInputRef.current?.focus(); }}
                  style={{
                    border: "none", background: "none",
                    color: "var(--ambo-text-muted)",
                    cursor: "pointer", fontSize: 16, lineHeight: 1,
                    padding: "0 4px", flexShrink: 0,
                  }}
                >
                  ×
                </button>
              )}
            </div>

            {/* One-time onboarding tooltip — below search, above New button */}
            {showTooltip && !isSearchActive && (
              <EchoTooltip onDismiss={dismissTooltip} />
            )}

            {!isSearchActive && (
              <div>
                {/* "New homily" label — quiet italic header above the three pills */}
                <div style={{
                  fontSize: 11,
                  fontStyle: "italic",
                  color: "var(--ambo-text-muted)",
                  marginBottom: 8,
                  opacity: 0.75,
                }}>
                  New homily
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  {/* Sunday — opens the existing Reflect/Write/Preach flow */}
                  <button
                    onClick={onCreate}
                    style={{
                      flex: 1,
                      border: "1px solid rgba(74, 111, 165, 0.28)",
                      background: "transparent",
                      color: "var(--ambo-accent)",
                      fontSize: 12, fontWeight: 500,
                      padding: "8px 6px", borderRadius: 8,
                      cursor: "pointer", fontFamily: "inherit",
                      opacity: 0.85,
                      transition: "opacity 0.15s, background 0.15s",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.opacity = "1";
                      e.currentTarget.style.background = "var(--ambo-accent-faint)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.opacity = "0.85";
                      e.currentTarget.style.background = "transparent";
                    }}
                  >
                    Sunday
                  </button>
                  {/* Daily — shows day picker dropdown */}
                  <div style={{ position: "relative", flex: 1 }}>
                    <button
                      onClick={() => setDailyPickerOpen(v => !v)}
                      style={{
                        width: "100%",
                        border: dailyPickerOpen
                          ? "1px solid rgba(74, 111, 165, 0.55)"
                          : "1px solid rgba(74, 111, 165, 0.28)",
                        background: dailyPickerOpen ? "var(--ambo-accent-faint)" : "transparent",
                        color: "var(--ambo-accent)",
                        fontSize: 12, fontWeight: 500,
                        padding: "8px 6px", borderRadius: 8,
                        cursor: "pointer", fontFamily: "inherit",
                        opacity: 0.85,
                        transition: "opacity 0.15s, background 0.15s",
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 4,
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.opacity = "1";
                        if (!dailyPickerOpen) e.currentTarget.style.background = "var(--ambo-accent-faint)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.opacity = "0.85";
                        if (!dailyPickerOpen) e.currentTarget.style.background = "transparent";
                      }}
                    >
                      Daily
                      <span style={{ fontSize: 9, opacity: 0.7 }}>{dailyPickerOpen ? "▴" : "▾"}</span>
                    </button>

                    {/* Day picker dropdown — matches WriteView Sunday date picker style exactly */}
                    {dailyPickerOpen && (
                      <>
                        <div
                          onClick={() => setDailyPickerOpen(false)}
                          style={{ position: "fixed", inset: 0, zIndex: 40 }}
                        />
                        <div style={{
                          position: "absolute",
                          top: "calc(100% + 4px)",
                          left: 0,
                          zIndex: 50,
                          background: "var(--ambo-bg)",
                          border: "1px solid var(--ambo-border)",
                          borderRadius: 10,
                          boxShadow: "var(--ambo-shadow-md)",
                          padding: 4,
                          minWidth: 220,
                        }}>
                          {buildDailyOptions().map((iso) => {
                            const labels = dailyOptionLabel(iso);
                            return (
                              <button
                                key={iso}
                                onClick={() => {
                                  setDailyPickerOpen(false);
                                  onCreateDaily(iso);
                                }}
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "space-between",
                                  gap: 10,
                                  width: "100%",
                                  textAlign: "left",
                                  border: "none",
                                  background: "transparent",
                                  color: "var(--ambo-text-primary)",
                                  padding: "8px 10px",
                                  borderRadius: 8,
                                  cursor: "pointer",
                                  fontFamily: "inherit",
                                  fontSize: 13,
                                  fontWeight: 500,
                                  transition: "background 0.1s",
                                }}
                                onMouseEnter={(e) => (e.currentTarget.style.background = "var(--ambo-accent-faint)")}
                                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                              >
                                <span>{labels.main}</span>
                                <span style={{
                                  fontSize: 11,
                                  color: "var(--ambo-text-muted)",
                                  flexShrink: 0,
                                }}>
                                  {labels.sub}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </>
                    )}
                  </div>
                  {/* Special Occasion — stub, not yet implemented */}
                  <button
                    disabled
                    title="Coming soon"
                    style={{
                      flex: 1,
                      border: "1px solid rgba(74, 111, 165, 0.15)",
                      background: "transparent",
                      color: "var(--ambo-text-muted)",
                      fontSize: 12, fontWeight: 500,
                      padding: "8px 6px", borderRadius: 8,
                      cursor: "not-allowed", fontFamily: "inherit",
                      opacity: 0.45,
                    }}
                  >
                    Occasion
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* List / results */}
          <div style={{ flex: 1, overflowY: "auto", padding: "0 16px 24px" }}>

            {homilies === null && !loadError && !isSearchActive && (
              <div style={{ padding: 20, fontSize: 13, color: "var(--ambo-text-muted)", textAlign: "center" }}>
                Loading…
              </div>
            )}

            {loadError && (
              <div style={{ padding: 20, fontSize: 13, color: "var(--ambo-text-muted)", textAlign: "center" }}>
                Couldn&apos;t load homilies. {loadError}
              </div>
            )}

            {isSearchActive && searchStatus === "listening" && (
              <div style={{ padding: "36px 20px", textAlign: "center", animation: "fadeIn 400ms ease" }}>
                <div style={{
                  fontFamily: "var(--ambo-font-reading)",
                  fontSize: 15, fontStyle: "italic",
                  color: "var(--ambo-text-muted)",
                }}>
                  Listening…
                </div>
              </div>
            )}

            {isSearchActive && searchStatus === "done" && searchResults && (
              searchResults.length === 0 ? (
                <div style={{ padding: "36px 20px", textAlign: "center" }}>
                  <div style={{
                    fontFamily: "var(--ambo-font-reading)",
                    fontSize: 14, fontStyle: "italic",
                    color: "var(--ambo-text-muted)", lineHeight: 1.7,
                  }}>
                    Nothing found in the archive.
                  </div>
                </div>
              ) : (
                <>
                  <SectionLabel label={`${searchResults.length} ${searchResults.length === 1 ? "result" : "results"}`} />
                  {searchResults.map((r) => (
                    <ArchiveCard
                      key={r.id}
                      id={r.id}
                      title={r.title}
                      sunday_date={r.sunday_date}
                      updated_at={r.updated_at}
                      content={r.content}
                      excerpt={r.excerpt}
                      layer={r.layer}
                      confidence={r.confidence}
                      onOpen={() => setViewingHomily(r)}
                      onDelete={(id) => setConfirmDeleteId(id)}
                      onOpenEcho={onOpenEcho}
                      onEchoInteract={showTooltip ? dismissTooltip : undefined}
                    />
                  ))}
                </>
              )
            )}

            {isSearchActive && searchStatus === "error" && (
              <div style={{ padding: "36px 20px", textAlign: "center" }}>
                <div style={{
                  fontFamily: "var(--ambo-font-reading)",
                  fontSize: 14, fontStyle: "italic", color: "var(--ambo-text-muted)",
                }}>
                  The archive is unavailable just now.
                </div>
              </div>
            )}

            {!isSearchActive && homilies && homilies.length === 0 && !loadError && (
              <div style={{
                padding: "36px 20px", fontSize: 13,
                color: "var(--ambo-text-muted)", textAlign: "center", lineHeight: 1.6,
              }}>
                No homilies yet.<br />Start a new one above.
              </div>
            )}

            {!isSearchActive && recentHomilies.length > 0 && (
              <>
                <SectionLabel label="Recent" />
                {recentHomilies.map((h) => (
                  <ArchiveCard
                    key={h.id}
                    id={h.id}
                    title={h.title}
                    sunday_date={h.sunday_date}
                        note_type={h.note_type}
                        liturgical_day={h.liturgical_day}
                    updated_at={h.updated_at}
                    content={h.content}
                    onOpen={() => setViewingHomily(h)}
                    onDelete={(id) => setConfirmDeleteId(id)}
                    onOpenEcho={onOpenEcho}
                    onEchoInteract={showTooltip ? dismissTooltip : undefined}
                  />
                ))}
              </>
            )}

            {!isSearchActive && olderHomilies.length > 0 && (
              <>
                <SectionLabel label={recentHomilies.length > 0 ? "Archive" : "All Homilies"} />
                {olderHomilies.map((h) => (
                  <ArchiveCard
                    key={h.id}
                    id={h.id}
                    title={h.title}
                    sunday_date={h.sunday_date}
                        note_type={h.note_type}
                        liturgical_day={h.liturgical_day}
                    updated_at={h.updated_at}
                    content={h.content}
                    onOpen={() => setViewingHomily(h)}
                    onDelete={(id) => setConfirmDeleteId(id)}
                    onOpenEcho={onOpenEcho}
                    onEchoInteract={showTooltip ? dismissTooltip : undefined}
                  />
                ))}
              </>
            )}
          </div>
        </div>
      </aside>

      {/* ── Delete confirmation modal ── */}
      {confirmDeleteId && (() => {
        const target = homilies?.find((h) => h.id === confirmDeleteId);
        const title = (target?.title && target.title.trim()) || "Untitled";
        const isDeleting = deletingId === confirmDeleteId;
        return (
          <>
            <div
              onClick={() => { if (!isDeleting) setConfirmDeleteId(null); }}
              style={{
                position: "fixed", inset: 0,
                background: "rgba(15, 20, 30, 0.45)",
                backdropFilter: "blur(3px)",
                WebkitBackdropFilter: "blur(3px)",
                zIndex: 220,
                animation: "fadeIn 180ms ease",
              }}
            />
            <div
              role="dialog" aria-modal="true"
              aria-labelledby="delete-modal-title"
              style={{
                position: "fixed", inset: 0,
                margin: "auto", height: "fit-content",
                zIndex: 221,
                background: "var(--ambo-bg)",
                border: "1px solid var(--ambo-border)",
                borderRadius: 18,
                boxShadow: "var(--ambo-shadow-md)",
                padding: "28px 28px 24px",
                width: "min(360px, 90vw)",
                animation: "fadeIn 180ms ease",
              }}
            >
              <p style={{
                fontSize: 11, fontWeight: 700, letterSpacing: "0.08em",
                textTransform: "uppercase", color: "#c0392b", margin: "0 0 10px",
              }}>
                Delete homily
              </p>
              <p id="delete-modal-title" style={{
                fontFamily: "var(--ambo-font-reading)",
                fontSize: 16, fontStyle: "italic",
                color: "var(--ambo-text-primary)",
                margin: "0 0 8px", lineHeight: 1.35,
              }}>
                {title}
              </p>
              <p style={{
                fontSize: 13, color: "var(--ambo-text-secondary)",
                lineHeight: 1.55, margin: "0 0 24px",
              }}>
                This will permanently delete the homily and all its notes. This cannot be undone.
              </p>
              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                <button
                  onClick={() => setConfirmDeleteId(null)}
                  disabled={isDeleting}
                  style={{
                    border: "1px solid var(--ambo-border)", background: "transparent",
                    color: "var(--ambo-text-secondary)",
                    cursor: isDeleting ? "default" : "pointer",
                    padding: "9px 20px", borderRadius: 100,
                    fontSize: 13, fontWeight: 500,
                    fontFamily: "inherit", opacity: isDeleting ? 0.5 : 1,
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleDelete(confirmDeleteId)}
                  disabled={isDeleting}
                  style={{
                    border: "none", background: "#c0392b", color: "white",
                    cursor: isDeleting ? "default" : "pointer",
                    padding: "9px 20px", borderRadius: 100,
                    fontSize: 13, fontWeight: 600,
                    fontFamily: "inherit", opacity: isDeleting ? 0.6 : 1, minWidth: 80,
                  }}
                >
                  {isDeleting ? "Deleting…" : "Delete"}
                </button>
              </div>
            </div>
          </>
        );
      })()}
    </>
  );
}
