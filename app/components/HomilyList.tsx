"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { loadDayName } from "@/lib/readings";

export interface HomilyRow {
  id: string;
  title: string | null;
  content: string | null;
  sunday_date: string | null;
  updated_at: string;
  created_at: string;
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

// Shared Sunday-name cache
const sundayNameCache: Map<string, string> = (globalThis as typeof globalThis & {
  __amboSundayNameCache?: Map<string, string>;
}).__amboSundayNameCache ??= new Map<string, string>();

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

/**
 * Compute Roman Rite lectionary year (A/B/C) from a Sunday date.
 * Liturgical year begins on the First Sunday of Advent (on or after Nov 27).
 * Year A: litStart % 3 === 0 (2022, 2025, 2028…)
 * Year B: litStart % 3 === 1 (2023, 2026, 2029…)
 * Year C: litStart % 3 === 2 (2024, 2027, 2030…)
 */
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

// ── Homily card ────────────────────────────────────────────────────────────
function HomilyCard({
  h,
  isActive,
  onOpen,
  onDelete,
}: {
  h: HomilyRow;
  isActive: boolean;
  onOpen: (h: HomilyRow) => void;
  onDelete: (id: string) => void;
}) {
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
        padding: "12px 12px",
        margin: "2px 4px",
        borderRadius: 10,
        background: isActive ? "var(--ambo-accent-light)" : hovered ? "var(--ambo-surface)" : "transparent",
        border: "1px solid " + (isActive ? "var(--ambo-accent)" : "transparent"),
        cursor: "pointer",
        transition: "background 0.1s",
      }}
      onClick={() => onOpen(h)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8, marginBottom: subtitle ? 4 : 2 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: "var(--ambo-text-primary)", letterSpacing: "-0.01em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
          {title}
        </div>
        <div style={{ fontSize: 11, color: "var(--ambo-text-muted)", flexShrink: 0 }}>
          {relativeTime(h.updated_at)}
        </div>
      </div>
      {subtitle && (
        <div style={{ fontSize: 11, fontWeight: 500, color: "var(--ambo-accent)", marginBottom: 6, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {subtitle}
        </div>
      )}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ fontSize: 11, color: "var(--ambo-text-muted)" }}>
          {words} {words === 1 ? "word" : "words"}
          {h.sunday_date && <span style={{ marginLeft: 8 }}>&middot; {friendlyDate(h.sunday_date)}</span>}
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(h.id); }}
          aria-label="Delete homily"
          style={{ border: "none", background: "none", color: "var(--ambo-text-muted)", cursor: "pointer", padding: "2px 6px", borderRadius: 6, fontSize: 11, fontFamily: "inherit" }}
        >
          Delete
        </button>
      </div>
    </div>
  );
}

function SectionLabel({ label }: { label: string }) {
  return (
    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--ambo-text-muted)", padding: "12px 16px 4px" }}>
      {label}
    </div>
  );
}

// ── Read-only homily viewer ────────────────────────────────────────────────
function HomilyViewer({
  homily,
  onBack,
  onOpenInWrite,
}: {
  homily: HomilyRow;
  onBack: () => void;
  onOpenInWrite: (homily: HomilyRow) => void;
}) {
  const sundayName = homily.sunday_date ? sundayNameCache.get(homily.sunday_date) : undefined;
  const title = (homily.title && homily.title.trim()) || sundayName || "Untitled";
  const subtitle = homily.sunday_date
    ? `${sundayName ?? "Sunday"} · ${lectionaryYear(homily.sunday_date)}`
    : null;
  const paragraphs = parseContentParagraphs(homily.content);
  const words = wordCount(homily.content);

  return (
    <div style={{ position: "absolute", inset: 0, background: "var(--ambo-bg)", display: "flex", flexDirection: "column", animation: "slideInRight 300ms cubic-bezier(0.22, 1, 0.36, 1)", zIndex: 2 }}>
      <div style={{ padding: "16px 20px 14px", borderBottom: "1px solid var(--ambo-border)", display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
        <button onClick={onBack} aria-label="Back to list" style={{ border: "none", background: "none", color: "var(--ambo-text-muted)", cursor: "pointer", padding: "4px 2px", fontSize: 18, lineHeight: 1, flexShrink: 0 }}>
          &larr;
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "var(--ambo-text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {title}
          </div>
          {subtitle && (
            <div style={{ fontSize: 11, fontWeight: 500, color: "var(--ambo-accent)", marginTop: 2 }}>
              {subtitle}
            </div>
          )}
        </div>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: "20px 20px 0" }}>
        {paragraphs.length === 0 ? (
          <p style={{ color: "var(--ambo-text-muted)", fontSize: 13 }}>This homily has no content yet.</p>
        ) : (
          paragraphs.map((p, i) => (
            <p key={i} style={{ fontSize: 14, lineHeight: 1.75, color: "var(--ambo-text-primary)", margin: "0 0 1em" }}>{p}</p>
          ))
        )}
        <div style={{ fontSize: 11, color: "var(--ambo-text-muted)", paddingBottom: 20, marginTop: 8 }}>
          {words} {words === 1 ? "word" : "words"}
          {homily.sunday_date && ` · ${friendlyDate(homily.sunday_date)}`}
        </div>
      </div>
      <div style={{ padding: "16px 20px", borderTop: "1px solid var(--ambo-border)", display: "flex", flexDirection: "column", gap: 8, flexShrink: 0 }}>
        <button
          onClick={() => onOpenInWrite(homily)}
          style={{ width: "100%", border: "none", background: "var(--ambo-accent)", color: "white", fontSize: 13, fontWeight: 600, padding: "11px 16px", borderRadius: 100, cursor: "pointer", fontFamily: "inherit" }}
        >
          Open in Write &mdash; revised copy
        </button>
        <button
          disabled
          title="Coming soon"
          style={{ width: "100%", border: "1px solid var(--ambo-border)", background: "transparent", color: "var(--ambo-text-muted)", fontSize: 13, fontWeight: 500, padding: "11px 16px", borderRadius: 100, cursor: "default", fontFamily: "inherit", opacity: 0.5 }}
        >
          Send to Echo &mdash; coming soon
        </button>
      </div>
    </div>
  );
}

// ── Echo panel ─────────────────────────────────────────────────────────────
function EchoPanel() {
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 32px", textAlign: "center", gap: 16 }}>
      <div style={{ width: 48, height: 48, borderRadius: "50%", background: "var(--ambo-surface)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>
        &#10022;
      </div>
      <div>
        <div style={{ fontSize: 15, fontWeight: 600, color: "var(--ambo-text-primary)", marginBottom: 8 }}>Echo</div>
        <div style={{ fontSize: 13, color: "var(--ambo-text-secondary)", lineHeight: 1.65, maxWidth: 260 }}>
          Take a completed homily and carry it forward &mdash; bulletin notes, parish reflections, and more. Coming soon.
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
  const [viewingHomily, setViewingHomily] = useState<HomilyRow | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [, bumpNames] = useState(0);
  const loadedForKey = useRef<number | null>(null);

  // suppress unused warning — onSelect kept for API compatibility
  void onSelect;

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
        if (!cancelled) { setHomilies(data ?? []); loadedForKey.current = refreshKey; }
      } catch (e) {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : "Failed to load");
      }
    })();
    return () => { cancelled = true; };
  }, [open, refreshKey, homilies]);

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

  useEffect(() => {
    if (!open) { setViewingHomily(null); setSearchQuery(""); }
  }, [open]);

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      await supabase.from("homilies").delete().eq("id", id).eq("user_id", user.id);
      setHomilies((prev) => prev ? prev.filter((h) => h.id !== id) : prev);
      if (viewingHomily?.id === id) setViewingHomily(null);
    } catch { /* ignore */ }
    finally { setDeletingId(null); setConfirmDeleteId(null); }
  };

  // Basic text search — semantic pgvector search added in task #31
  const filteredHomilies = (() => {
    if (!homilies) return null;
    const q = searchQuery.trim().toLowerCase();
    if (!q) return homilies;
    return homilies.filter((h) => {
      const nameMatch = (h.sunday_date ? (sundayNameCache.get(h.sunday_date) ?? "") : "").toLowerCase().includes(q);
      return (h.title ?? "").toLowerCase().includes(q) || (h.content ?? "").toLowerCase().includes(q) || nameMatch;
    });
  })();

  const cutoff = fourWeeksAgoIso();
  const recentHomilies = filteredHomilies?.filter((h) => h.sunday_date && h.sunday_date >= cutoff) ?? [];
  const olderHomilies = filteredHomilies?.filter((h) => !h.sunday_date || h.sunday_date < cutoff) ?? [];
  const isSearching = searchQuery.trim().length > 0;

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(15,20,30,0.24)", backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)", zIndex: 90, animation: "fadeIn 460ms cubic-bezier(0.22,1,0.36,1)" }} />

      {/* Drawer */}
      <aside
        role="dialog"
        aria-label="Archive"
        style={{ position: "fixed", top: 0, left: 0, bottom: 0, width: "min(380px,88vw)", background: "var(--ambo-bg)", borderRight: "1px solid var(--ambo-border)", zIndex: 100, display: "flex", flexDirection: "column", boxShadow: "var(--ambo-shadow-md)", animation: "slideInLeft 640ms cubic-bezier(0.22,1,0.36,1)", overflow: "hidden" }}
      >
        {/* Header */}
        <div style={{ padding: "16px 20px 0", borderBottom: "1px solid var(--ambo-border)", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <div style={{ display: "flex", gap: 0, background: "var(--ambo-surface)", borderRadius: 10, padding: 3 }}>
              {(["my-homilies", "echo"] as DrawerTab[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  style={{ border: "none", background: tab === t ? "var(--ambo-bg)" : "transparent", color: tab === t ? "var(--ambo-text-primary)" : "var(--ambo-text-muted)", fontSize: 12, fontWeight: tab === t ? 600 : 500, padding: "6px 12px", borderRadius: 8, cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s", boxShadow: tab === t ? "var(--ambo-shadow-sm)" : "none" }}
                >
                  {t === "my-homilies" ? "My Homilies" : "Echo"}
                </button>
              ))}
            </div>
            <button onClick={onClose} aria-label="Close" style={{ border: "none", background: "none", fontSize: 20, lineHeight: 1, color: "var(--ambo-text-muted)", cursor: "pointer", padding: 4, borderRadius: 6 }}>
              &times;
            </button>
          </div>
        </div>

        {tab === "my-homilies" ? (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0, position: "relative" }}>
            {/* Search + New */}
            <div style={{ padding: "12px 12px 8px", flexShrink: 0 }}>
              <div style={{ display: "flex", alignItems: "center", background: "var(--ambo-surface)", borderRadius: 10, border: "1px solid var(--ambo-border)", padding: "0 12px", marginBottom: 8, gap: 8 }}>
                <span style={{ color: "var(--ambo-text-muted)", fontSize: 14, flexShrink: 0 }}>&#9906;</span>
                <input
                  type="text"
                  placeholder="When did I preach on mercy?"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{ flex: 1, border: "none", background: "transparent", color: "var(--ambo-text-primary)", fontSize: 13, padding: "10px 0", outline: "none", fontFamily: "inherit" }}
                />
                {searchQuery && (
                  <button onClick={() => setSearchQuery("")} style={{ border: "none", background: "none", color: "var(--ambo-text-muted)", cursor: "pointer", fontSize: 16, lineHeight: 1, padding: 0, flexShrink: 0 }}>&times;</button>
                )}
              </div>
              <button
                onClick={onCreate}
                style={{ width: "100%", border: "1px dashed var(--ambo-border)", background: "transparent", color: "var(--ambo-accent)", fontSize: 13, fontWeight: 600, padding: "10px 14px", borderRadius: 10, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}
              >
                <span style={{ fontSize: 16, lineHeight: 1 }}>+</span> New homily
              </button>
            </div>

            {/* List */}
            <div style={{ flex: 1, overflowY: "auto", padding: "0 8px 20px" }}>
              {homilies === null && !loadError && (
                <div style={{ padding: 20, fontSize: 13, color: "var(--ambo-text-muted)", textAlign: "center" }}>Loading&hellip;</div>
              )}
              {loadError && (
                <div style={{ padding: 20, fontSize: 13, color: "var(--ambo-text-muted)", textAlign: "center" }}>Couldn&apos;t load homilies. {loadError}</div>
              )}
              {homilies && homilies.length === 0 && !loadError && (
                <div style={{ padding: "32px 20px", fontSize: 13, color: "var(--ambo-text-muted)", textAlign: "center", lineHeight: 1.6 }}>No homilies yet.<br />Start a new one above.</div>
              )}
              {filteredHomilies && filteredHomilies.length === 0 && isSearching && (
                <div style={{ padding: "32px 20px", fontSize: 13, color: "var(--ambo-text-muted)", textAlign: "center", lineHeight: 1.6 }}>No homilies found.<br />Try different words.</div>
              )}

              {!isSearching && recentHomilies.length > 0 && (
                <><SectionLabel label="Recent" />{recentHomilies.map((h) => <HomilyCard key={h.id} h={h} isActive={h.id === currentId} onOpen={setViewingHomily} onDelete={(id) => setConfirmDeleteId(id)} />)}</>
              )}
              {!isSearching && olderHomilies.length > 0 && (
                <><SectionLabel label={recentHomilies.length > 0 ? "Archive" : "All Homilies"} />{olderHomilies.map((h) => <HomilyCard key={h.id} h={h} isActive={h.id === currentId} onOpen={setViewingHomily} onDelete={(id) => setConfirmDeleteId(id)} />)}</>
              )}
              {isSearching && filteredHomilies && filteredHomilies.map((h) => (
                <HomilyCard key={h.id} h={h} isActive={h.id === currentId} onOpen={setViewingHomily} onDelete={(id) => setConfirmDeleteId(id)} />
              ))}
            </div>

            {/* Viewer panel */}
            {viewingHomily && (
              <HomilyViewer
                homily={viewingHomily}
                onBack={() => setViewingHomily(null)}
                onOpenInWrite={(h) => { setViewingHomily(null); onOpenInWrite(h); }}
              />
            )}
          </div>
        ) : (
          <EchoPanel />
        )}
      </aside>

      {/* Delete confirmation modal */}
      {confirmDeleteId && (() => {
        const target = homilies?.find((h) => h.id === confirmDeleteId);
        const title = (target?.title && target.title.trim()) || "Untitled";
        const isDeleting = deletingId === confirmDeleteId;
        return (
          <>
            <div onClick={() => { if (!isDeleting) setConfirmDeleteId(null); }} style={{ position: "fixed", inset: 0, background: "rgba(15,20,30,0.45)", backdropFilter: "blur(3px)", WebkitBackdropFilter: "blur(3px)", zIndex: 120, animation: "fadeIn 180ms ease" }} />
            <div role="dialog" aria-modal="true" aria-labelledby="delete-modal-title" style={{ position: "fixed", inset: 0, margin: "auto", height: "fit-content", zIndex: 121, background: "var(--ambo-bg)", border: "1px solid var(--ambo-border)", borderRadius: 18, boxShadow: "var(--ambo-shadow-md)", padding: "28px 28px 24px", width: "min(360px,90vw)", animation: "fadeIn 180ms ease" }}>
              <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#c0392b", margin: "0 0 10px" }}>Delete homily</p>
              <p id="delete-modal-title" style={{ fontSize: 16, fontWeight: 600, color: "var(--ambo-text-primary)", margin: "0 0 8px", lineHeight: 1.35 }}>&ldquo;{title}&rdquo;</p>
              <p style={{ fontSize: 13, color: "var(--ambo-text-secondary)", lineHeight: 1.55, margin: "0 0 24px" }}>This will permanently delete the homily and all its notes. This cannot be undone.</p>
              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                <button onClick={() => setConfirmDeleteId(null)} disabled={isDeleting} style={{ border: "1px solid var(--ambo-border)", background: "transparent", color: "var(--ambo-text-secondary)", cursor: isDeleting ? "default" : "pointer", padding: "9px 20px", borderRadius: 100, fontSize: 13, fontWeight: 500, fontFamily: "inherit", opacity: isDeleting ? 0.5 : 1 }}>Cancel</button>
                <button onClick={() => handleDelete(confirmDeleteId)} disabled={isDeleting} style={{ border: "none", background: "#c0392b", color: "white", cursor: isDeleting ? "default" : "pointer", padding: "9px 20px", borderRadius: 100, fontSize: 13, fontWeight: 600, fontFamily: "inherit", opacity: isDeleting ? 0.6 : 1, minWidth: 80 }}>{isDeleting ? "Deleting…" : "Delete"}</button>
              </div>
            </div>
          </>
        );
      })()}
    </>
  );
}
