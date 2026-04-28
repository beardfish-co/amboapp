"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { loadDayName } from "@/lib/readings";

// ── Types ──────────────────────────────────────────────────────────────────
export interface HomilyRow {
  id: string;
  title: string | null;
  content: string | null;
  sunday_date: string | null;
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

type DrawerTab = "my-homilies" | "echo";

interface HomilyListProps {
  open: boolean;
  currentId: string | null;
  onClose: () => void;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onOpenInWrite: (homily: HomilyRow) => void;
  refreshKey?: number;
}

// ── Constants ──────────────────────────────────────────────────────────────

/** Rotating placeholder examples for the search bar */
const SEARCH_PLACEHOLDERS = [
  "When did I preach on mercy?",
  "something about despair and hope",
  "Emmaus and the breaking of bread",
  "the woman who lost her coin",
  "finding meaning in suffering",
  "what did I say about disillusionment?",
];

/**
 * Layer labels — shown only when the match came from a non-content layer.
 * "content" is the homily itself; no label needed.
 */
const LAYER_LABELS: Record<string, string> = {
  thread: "from a discernment thread",
  followups: "from follow-up notes",
  notes: "from notes",
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

// ── Sub-components ─────────────────────────────────────────────────────────

/** A single card in the browse list (no search query) */
interface HomilyCardProps {
  h: HomilyRow;
  isActive: boolean;
  onOpen: (h: HomilyRow) => void;
  onDelete: (id: string) => void;
}

function HomilyCard({ h, isActive, onOpen, onDelete }: HomilyCardProps) {
  const [hovered, setHovered] = useState(false);

  const sundayName = h.sunday_date ? sundayNameCache.get(h.sunday_date) : undefined;
  const title = (h.title && h.title.trim()) || sundayName || "Untitled";
  const subtitle = h.sunday_date
    ? `${sundayName ?? "Sunday"} · ${lectionaryYear(h.sunday_date)}`
    : null;
  const words = wordCount(h.content);

  return (
    <div
      style={{
        position: "relative",
        padding: "12px 14px",
        margin: "2px 4px",
        borderRadius: 12,
        background: isActive
          ? "rgba(74, 111, 165, 0.08)"
          : hovered
          ? "rgba(74, 111, 165, 0.05)"
          : "transparent",
        border: "1px solid " + (isActive
          ? "rgba(74, 111, 165, 0.25)"
          : hovered
          ? "rgba(74, 111, 165, 0.12)"
          : "transparent"),
        cursor: "pointer",
        transition: "background 0.15s, border-color 0.15s",
      }}
      onClick={() => onOpen(h)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Title — Newsreader serif italic */}
      <div style={{
        display: "flex",
        alignItems: "baseline",
        justifyContent: "space-between",
        gap: 8,
        marginBottom: subtitle ? 3 : 2,
      }}>
        <div style={{
          fontFamily: "var(--ambo-font-reading)",
          fontSize: 15,
          fontStyle: "italic",
          fontWeight: 400,
          color: "var(--ambo-text-primary)",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          flex: 1,
        }}>
          {title}
        </div>
        <div style={{ fontSize: 11, color: "var(--ambo-text-muted)", flexShrink: 0 }}>
          {relativeTime(h.updated_at)}
        </div>
      </div>

      {subtitle && (
        <div style={{
          fontSize: 11,
          fontWeight: 500,
          color: "var(--ambo-accent)",
          marginBottom: 6,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          opacity: 0.8,
        }}>
          {subtitle}
        </div>
      )}

      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}>
        <div style={{ fontSize: 11, color: "var(--ambo-text-muted)" }}>
          {words} {words === 1 ? "word" : "words"}
          {h.sunday_date && (
            <span style={{ marginLeft: 8 }}>· {friendlyDate(h.sunday_date)}</span>
          )}
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(h.id); }}
          aria-label="Delete homily"
          style={{
            border: "none",
            background: "none",
            color: "var(--ambo-text-muted)",
            cursor: "pointer",
            padding: "2px 6px",
            borderRadius: 6,
            fontSize: 11,
            fontFamily: "inherit",
            opacity: 0.7,
          }}
        >
          Delete
        </button>
      </div>
    </div>
  );
}

/** A card returned by the semantic search */
interface SearchResultCardProps {
  result: SearchResult;
  onOpen: (r: SearchResult) => void;
  onDelete: (id: string) => void;
}

function SearchResultCard({ result, onOpen, onDelete }: SearchResultCardProps) {
  const [hovered, setHovered] = useState(false);
  const isLoose = result.confidence === "loose";

  const sundayName = result.sunday_date ? sundayNameCache.get(result.sunday_date) : undefined;
  const title = (result.title && result.title.trim()) || sundayName || "Untitled";
  const subtitle = result.sunday_date
    ? `${sundayName ?? "Sunday"} · ${lectionaryYear(result.sunday_date)}`
    : null;
  const layerLabel = result.layer !== "content" ? LAYER_LABELS[result.layer] : null;

  return (
    <div
      style={{
        position: "relative",
        padding: "12px 14px",
        margin: "2px 4px",
        borderRadius: 12,
        background: hovered
          ? "rgba(74, 111, 165, 0.05)"
          : "transparent",
        border: "1px solid " + (hovered
          ? "rgba(74, 111, 165, 0.12)"
          : "rgba(74, 111, 165, 0.08)"),
        cursor: "pointer",
        transition: "background 0.15s, border-color 0.15s",
        opacity: isLoose ? 0.78 : 1,
      }}
      onClick={() => onOpen(result)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Title */}
      <div style={{
        display: "flex",
        alignItems: "baseline",
        justifyContent: "space-between",
        gap: 8,
        marginBottom: subtitle ? 3 : (result.excerpt ? 6 : 2),
      }}>
        <div style={{
          fontFamily: "var(--ambo-font-reading)",
          fontSize: isLoose ? 14 : 15,
          fontStyle: "italic",
          fontWeight: 400,
          color: "var(--ambo-text-primary)",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          flex: 1,
        }}>
          {title}
        </div>
        <div style={{ fontSize: 11, color: "var(--ambo-text-muted)", flexShrink: 0 }}>
          {relativeTime(result.updated_at)}
        </div>
      </div>

      {subtitle && (
        <div style={{
          fontSize: 11,
          fontWeight: 500,
          color: "var(--ambo-accent)",
          marginBottom: result.excerpt ? 6 : 2,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          opacity: 0.8,
        }}>
          {subtitle}
        </div>
      )}

      {/* Excerpt — body typeface, no quotes, no italic */}
      {result.excerpt && (
        <div style={{
          fontSize: isLoose ? 12 : 13,
          color: "var(--ambo-text-secondary)",
          lineHeight: 1.6,
          marginBottom: 8,
          display: "-webkit-box",
          WebkitLineClamp: 3,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
        }}>
          {result.excerpt}
        </div>
      )}

      {/* Footer row */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 8,
      }}>
        <div style={{ fontSize: 11, color: "var(--ambo-text-muted)", display: "flex", gap: 8, flexWrap: "wrap" }}>
          {/* Layer label — italic, only for non-content matches */}
          {layerLabel && (
            <span style={{ fontStyle: "italic" }}>{layerLabel}</span>
          )}
          {/* Loose relation label */}
          {isLoose && (
            <span style={{ fontStyle: "italic", opacity: 0.75 }}>loosely related</span>
          )}
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(result.id); }}
          aria-label="Delete homily"
          style={{
            border: "none",
            background: "none",
            color: "var(--ambo-text-muted)",
            cursor: "pointer",
            padding: "2px 6px",
            borderRadius: 6,
            fontSize: 11,
            fontFamily: "inherit",
            opacity: 0.7,
            flexShrink: 0,
          }}
        >
          Delete
        </button>
      </div>
    </div>
  );
}

/** Section divider label */
function SectionLabel({ label }: { label: string }) {
  return (
    <div style={{
      fontSize: 10,
      fontWeight: 700,
      letterSpacing: "0.08em",
      textTransform: "uppercase",
      color: "var(--ambo-text-muted)",
      padding: "12px 18px 4px",
      opacity: 0.7,
    }}>
      {label}
    </div>
  );
}

// ── Homily Viewer overlay ──────────────────────────────────────────────────
interface HomilyViewerProps {
  homily: HomilyRow | SearchResult;
  onBack: () => void;
  onOpenInWrite: (homily: HomilyRow) => void;
}

function HomilyViewer({ homily, onBack, onOpenInWrite }: HomilyViewerProps) {
  const sundayName = homily.sunday_date
    ? sundayNameCache.get(homily.sunday_date)
    : undefined;
  const title = (homily.title && homily.title.trim()) || sundayName || "Untitled";
  const subtitle = homily.sunday_date
    ? `${sundayName ?? "Sunday"} · ${lectionaryYear(homily.sunday_date)}`
    : null;
  const paragraphs = parseContentParagraphs(homily.content);
  const words = wordCount(homily.content);

  // Cast to HomilyRow for onOpenInWrite — the function just needs the core fields
  const homilyRow: HomilyRow = {
    id: homily.id,
    title: homily.title,
    content: homily.content,
    sunday_date: homily.sunday_date,
    updated_at: homily.updated_at,
    created_at: homily.created_at,
  };

  return (
    /* Soft overlay — fades in over the list, no heavy chrome */
    <div style={{
      position: "absolute",
      inset: 0,
      /* slightly translucent so the reader knows they're in context */
      background: "rgba(238, 242, 247, 0.97)",
      backdropFilter: "blur(6px)",
      WebkitBackdropFilter: "blur(6px)",
      display: "flex",
      flexDirection: "column",
      animation: "fadeIn 220ms cubic-bezier(0.22, 1, 0.36, 1)",
      zIndex: 2,
    }}>
      {/* Viewer header — minimal */}
      <div style={{
        padding: "16px 20px 14px",
        borderBottom: "1px solid var(--ambo-border)",
        display: "flex",
        alignItems: "center",
        gap: 12,
        flexShrink: 0,
      }}>
        <button
          onClick={onBack}
          aria-label="Back to list"
          style={{
            border: "none",
            background: "none",
            color: "var(--ambo-text-muted)",
            cursor: "pointer",
            padding: "4px 2px",
            fontSize: 18,
            lineHeight: 1,
            flexShrink: 0,
          }}
        >
          ←
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontFamily: "var(--ambo-font-reading)",
            fontSize: 15,
            fontStyle: "italic",
            fontWeight: 400,
            color: "var(--ambo-text-primary)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}>
            {title}
          </div>
          {subtitle && (
            <div style={{
              fontSize: 11,
              fontWeight: 500,
              color: "var(--ambo-accent)",
              marginTop: 2,
              opacity: 0.8,
            }}>
              {subtitle}
            </div>
          )}
        </div>
      </div>

      {/* Body */}
      <div style={{
        flex: 1,
        overflowY: "auto",
        padding: "24px 22px 0",
      }}>
        {paragraphs.length === 0 ? (
          <p style={{ color: "var(--ambo-text-muted)", fontSize: 13 }}>
            This homily has no content yet.
          </p>
        ) : (
          paragraphs.map((p, i) => (
            <p key={i} style={{
              fontSize: 14,
              lineHeight: 1.8,
              color: "var(--ambo-text-primary)",
              margin: "0 0 1.1em",
            }}>
              {p}
            </p>
          ))
        )}
        <div style={{
          fontSize: 11,
          color: "var(--ambo-text-muted)",
          paddingBottom: 24,
          marginTop: 8,
          opacity: 0.7,
        }}>
          {words} {words === 1 ? "word" : "words"}
          {homily.sunday_date && ` · ${friendlyDate(homily.sunday_date)}`}
        </div>
      </div>

      {/* Actions */}
      <div style={{
        padding: "16px 20px",
        borderTop: "1px solid var(--ambo-border)",
        display: "flex",
        flexDirection: "column",
        gap: 8,
        flexShrink: 0,
      }}>
        <button
          onClick={() => onOpenInWrite(homilyRow)}
          style={{
            width: "100%",
            border: "none",
            background: "var(--ambo-accent)",
            color: "white",
            fontSize: 13,
            fontWeight: 600,
            padding: "11px 16px",
            borderRadius: 100,
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          Open in Write
        </button>
        <button
          disabled
          title="Coming soon"
          style={{
            width: "100%",
            border: "1px solid var(--ambo-border)",
            background: "transparent",
            color: "var(--ambo-text-muted)",
            fontSize: 13,
            fontWeight: 500,
            padding: "11px 16px",
            borderRadius: 100,
            cursor: "default",
            fontFamily: "inherit",
            opacity: 0.5,
          }}
        >
          Send to Echo
        </button>
      </div>
    </div>
  );
}

// ── Echo panel ─────────────────────────────────────────────────────────────
function EchoPanel() {
  return (
    <div style={{
      flex: 1,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: "40px 32px",
      textAlign: "center",
      gap: 16,
    }}>
      <div style={{
        width: 48,
        height: 48,
        borderRadius: "50%",
        background: "var(--ambo-surface)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 22,
      }}>
        ✦
      </div>
      <div>
        <div style={{
          fontFamily: "var(--ambo-font-reading)",
          fontSize: 17,
          fontStyle: "italic",
          color: "var(--ambo-text-primary)",
          marginBottom: 8,
        }}>
          Echo
        </div>
        <div style={{
          fontSize: 13,
          color: "var(--ambo-text-secondary)",
          lineHeight: 1.65,
          maxWidth: 260,
        }}>
          Take a completed homily and carry it forward — bulletin notes,
          parish reflections, and more. Coming soon.
        </div>
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────
export default function HomilyList({
  open,
  currentId,
  onClose,
  onSelect,
  onCreate,
  onOpenInWrite,
  refreshKey = 0,
}: HomilyListProps) {
  const [tab, setTab] = useState<DrawerTab>("my-homilies");
  const [homilies, setHomilies] = useState<HomilyRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[] | null>(null);
  const [searchStatus, setSearchStatus] = useState<"idle" | "listening" | "done" | "error">("idle");
  const [viewingHomily, setViewingHomily] = useState<HomilyRow | SearchResult | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  const [searchFocused, setSearchFocused] = useState(false);
  const [, bumpNames] = useState(0);

  const loadedForKey = useRef<number | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const placeholderTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

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
          .select("id, title, content, sunday_date, updated_at, created_at")
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

  // ── Keyboard handling ──────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (viewingHomily) setViewingHomily(null);
        else if (confirmDeleteId) setConfirmDeleteId(null);
        else onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, viewingHomily, confirmDeleteId]);

  // ── Reset on close ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!open) {
      setViewingHomily(null);
      setSearchQuery("");
      setSearchResults(null);
      setSearchStatus("idle");
    }
  }, [open]);

  // ── Rotating placeholder ───────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    placeholderTimerRef.current = setInterval(() => {
      if (!searchQuery && !searchFocused) {
        setPlaceholderIndex((i) => (i + 1) % SEARCH_PLACEHOLDERS.length);
      }
    }, 3500);
    return () => {
      if (placeholderTimerRef.current) clearInterval(placeholderTimerRef.current);
    };
  }, [open, searchQuery, searchFocused]);

  // ── Semantic search with debounce ──────────────────────────────────────
  const runSearch = useCallback(async (query: string) => {
    if (!query.trim()) {
      setSearchResults(null);
      setSearchStatus("idle");
      return;
    }
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
    if (!q) {
      setSearchResults(null);
      setSearchStatus("idle");
      return;
    }
    setSearchStatus("listening");
    searchTimerRef.current = setTimeout(() => runSearch(q), 650);
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, [searchQuery, runSearch]);

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

  if (!open) return null;

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
        aria-label="Archive"
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          bottom: 0,
          width: "min(380px, 88vw)",
          background: "var(--ambo-bg)",
          borderRight: "1px solid var(--ambo-border)",
          zIndex: 100,
          display: "flex",
          flexDirection: "column",
          boxShadow: "var(--ambo-shadow-md)",
          animation: "slideInLeft 640ms cubic-bezier(0.22, 1, 0.36, 1)",
          overflow: "hidden",
        } as React.CSSProperties}
      >
        {/* Header — mode-pill tabs matching main app */}
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
            <nav className="mode-pill">
              {(["my-homilies", "echo"] as DrawerTab[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`mode-pill-btn ${tab === t ? "active" : ""}`}
                  style={{ padding: "6px 14px", fontSize: 13 }}
                >
                  {t === "my-homilies" ? "My Homilies" : "Echo"}
                </button>
              ))}
            </nav>
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
              }}
            >
              ×
            </button>
          </div>
        </div>

        {/* Panel content */}
        {tab === "my-homilies" ? (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0, position: "relative" }}>

            {/* Search bar — underline style, no icon, italic placeholder */}
            <div style={{ padding: "16px 18px 10px", flexShrink: 0 }}>
              <div style={{
                display: "flex",
                alignItems: "center",
                gap: 0,
                borderBottom: `1px solid ${searchFocused
                  ? "var(--ambo-accent)"
                  : "rgba(74, 111, 165, 0.25)"}`,
                paddingBottom: 2,
                transition: "border-color 0.2s",
                marginBottom: 12,
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
                    flex: 1,
                    border: "none",
                    background: "transparent",
                    color: "var(--ambo-text-primary)",
                    fontSize: 13,
                    fontStyle: "italic",
                    padding: "8px 0",
                    outline: "none",
                    fontFamily: "var(--ambo-font-ui)",
                  }}
                />
                {searchQuery && (
                  <button
                    onClick={() => { setSearchQuery(""); searchInputRef.current?.focus(); }}
                    style={{
                      border: "none",
                      background: "none",
                      color: "var(--ambo-text-muted)",
                      cursor: "pointer",
                      fontSize: 16,
                      lineHeight: 1,
                      padding: "0 4px",
                      flexShrink: 0,
                    }}
                  >
                    ×
                  </button>
                )}
              </div>

              {/* New homily button — only when not actively searching */}
              {!isSearchActive && (
                <button
                  onClick={onCreate}
                  style={{
                    width: "100%",
                    border: "1px dashed rgba(74, 111, 165, 0.3)",
                    background: "transparent",
                    color: "var(--ambo-accent)",
                    fontSize: 13,
                    fontWeight: 600,
                    padding: "10px 14px",
                    borderRadius: 10,
                    cursor: "pointer",
                    fontFamily: "inherit",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 6,
                    opacity: 0.85,
                    transition: "opacity 0.15s",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")}
                  onMouseLeave={(e) => (e.currentTarget.style.opacity = "0.85")}
                >
                  <span style={{ fontSize: 16, lineHeight: 1 }}>+</span>
                  New homily
                </button>
              )}
            </div>

            {/* Homily list / search results */}
            <div style={{ flex: 1, overflowY: "auto", padding: "0 8px 20px" }}>

              {/* Loading states */}
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

              {/* Listening state — contemplative, fades in */}
              {isSearchActive && searchStatus === "listening" && (
                <div style={{
                  padding: "32px 20px",
                  textAlign: "center",
                  animation: "fadeIn 400ms ease",
                }}>
                  <div style={{
                    fontFamily: "var(--ambo-font-reading)",
                    fontSize: 15,
                    fontStyle: "italic",
                    color: "var(--ambo-text-muted)",
                  }}>
                    Listening…
                  </div>
                </div>
              )}

              {/* Search results */}
              {isSearchActive && searchStatus === "done" && searchResults && (
                <>
                  {searchResults.length === 0 ? (
                    <div style={{
                      padding: "32px 20px",
                      textAlign: "center",
                    }}>
                      <div style={{
                        fontFamily: "var(--ambo-font-reading)",
                        fontSize: 14,
                        fontStyle: "italic",
                        color: "var(--ambo-text-muted)",
                        lineHeight: 1.7,
                      }}>
                        Nothing found in the archive.
                      </div>
                    </div>
                  ) : (
                    <>
                      <SectionLabel label={`${searchResults.length} ${searchResults.length === 1 ? "result" : "results"}`} />
                      {searchResults.map((r) => (
                        <SearchResultCard
                          key={r.id}
                          result={r}
                          onOpen={setViewingHomily}
                          onDelete={(id) => setConfirmDeleteId(id)}
                        />
                      ))}
                    </>
                  )}
                </>
              )}

              {/* Error state */}
              {isSearchActive && searchStatus === "error" && (
                <div style={{ padding: "32px 20px", textAlign: "center" }}>
                  <div style={{
                    fontFamily: "var(--ambo-font-reading)",
                    fontSize: 14,
                    fontStyle: "italic",
                    color: "var(--ambo-text-muted)",
                  }}>
                    The archive is unavailable just now.
                  </div>
                </div>
              )}

              {/* Browse mode — Recent + Archive sections */}
              {!isSearchActive && homilies && homilies.length === 0 && !loadError && (
                <div style={{ padding: "32px 20px", fontSize: 13, color: "var(--ambo-text-muted)", textAlign: "center", lineHeight: 1.6 }}>
                  No homilies yet.<br />Start a new one above.
                </div>
              )}

              {!isSearchActive && recentHomilies.length > 0 && (
                <>
                  <SectionLabel label="Recent" />
                  {recentHomilies.map((h) => (
                    <HomilyCard
                      key={h.id}
                      h={h}
                      isActive={h.id === currentId}
                      onOpen={setViewingHomily}
                      onDelete={(id) => setConfirmDeleteId(id)}
                    />
                  ))}
                </>
              )}

              {!isSearchActive && olderHomilies.length > 0 && (
                <>
                  <SectionLabel label={recentHomilies.length > 0 ? "Archive" : "All Homilies"} />
                  {olderHomilies.map((h) => (
                    <HomilyCard
                      key={h.id}
                      h={h}
                      isActive={h.id === currentId}
                      onOpen={setViewingHomily}
                      onDelete={(id) => setConfirmDeleteId(id)}
                    />
                  ))}
                </>
              )}
            </div>

            {/* Read-only viewer — soft overlay, fades in */}
            {viewingHomily && (
              <HomilyViewer
                homily={viewingHomily}
                onBack={() => setViewingHomily(null)}
                onOpenInWrite={(h) => {
                  setViewingHomily(null);
                  onOpenInWrite(h);
                }}
              />
            )}
          </div>
        ) : (
          <EchoPanel />
        )}
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
                position: "fixed",
                inset: 0,
                background: "rgba(15, 20, 30, 0.45)",
                backdropFilter: "blur(3px)",
                WebkitBackdropFilter: "blur(3px)",
                zIndex: 120,
                animation: "fadeIn 180ms ease",
              }}
            />
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="delete-modal-title"
              style={{
                position: "fixed",
                inset: 0,
                margin: "auto",
                height: "fit-content",
                zIndex: 121,
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
                fontSize: 16, fontStyle: "italic", color: "var(--ambo-text-primary)",
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
                    color: "var(--ambo-text-secondary)", cursor: isDeleting ? "default" : "pointer",
                    padding: "9px 20px", borderRadius: 100, fontSize: 13, fontWeight: 500,
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
                    cursor: isDeleting ? "default" : "pointer", padding: "9px 20px",
                    borderRadius: 100, fontSize: 13, fontWeight: 600,
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
