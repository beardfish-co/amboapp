"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export interface HomilyRow {
  id: string;
  title: string | null;
  content: string | null;
  sunday_date: string | null;
  updated_at: string;
  created_at: string;
}

interface HomilyListProps {
  open: boolean;
  currentId: string | null;
  onClose: () => void;
  onSelect: (id: string) => void;
  onCreate: () => void;
  refreshKey?: number;
}

// Shared Sunday-name cache (same Map WriteView uses)
const sundayNameCache: Map<string, string> = (globalThis as typeof globalThis & {
  __amboSundayNameCache?: Map<string, string>;
}).__amboSundayNameCache ??= new Map<string, string>();

function isoToCompact(iso: string): string {
  return iso.replace(/-/g, "");
}

function parseIsoDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function shortSundayLabel(iso: string): string {
  const d = parseIsoDate(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

async function fetchSundayName(iso: string): Promise<string | null> {
  if (sundayNameCache.has(iso)) return sundayNameCache.get(iso) ?? null;
  try {
    const res = await fetch(`/api/readings?date=${isoToCompact(iso)}`);
    if (!res.ok) return null;
    const d = await res.json();
    const name = (d.dayName as string | undefined) ?? null;
    if (name) sundayNameCache.set(iso, name);
    return name;
  } catch {
    return null;
  }
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diff = Math.max(0, now - then);
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

function previewOf(content: string | null): string {
  if (!content) return "Empty";
  const firstLine = content.split("\n").map((s) => s.trim()).filter(Boolean)[0] ?? "";
  if (!firstLine) return "Empty";
  return firstLine.length > 60 ? firstLine.slice(0, 60) + "…" : firstLine;
}

function wordCount(content: string | null): number {
  if (!content) return 0;
  return content.trim().split(/\s+/).filter(Boolean).length;
}

export default function HomilyList({
  open,
  currentId,
  onClose,
  onSelect,
  onCreate,
  refreshKey = 0,
}: HomilyListProps) {
  const [homilies, setHomilies] = useState<HomilyRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  // Re-render when Sunday names are fetched
  const [, bumpNames] = useState(0);
  const loadedForKey = useRef<number | null>(null);

  useEffect(() => {
    if (!open) return;
    if (loadedForKey.current === refreshKey && homilies !== null) return;

    let cancelled = false;
    (async () => {
      setLoadError(null);
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          if (!cancelled) setLoadError("Not signed in");
          return;
        }
        const { data, error } = await supabase
          .from("homilies")
          .select("id, title, content, sunday_date, updated_at, created_at")
          .eq("user_id", user.id)
          .order("updated_at", { ascending: false });

        if (error) throw error;
        if (!cancelled) {
          setHomilies(data ?? []);
          loadedForKey.current = refreshKey;
        }
      } catch (e) {
        if (!cancelled) {
          const msg = e instanceof Error ? e.message : "Failed to load";
          setLoadError(msg);
        }
      }
    })();

    return () => { cancelled = true; };
  }, [open, refreshKey, homilies]);

  // When the homily list loads, kick off Sunday-name fetches for any rows that don't have a cached name
  useEffect(() => {
    if (!open || !homilies) return;
    let cancelled = false;
    const unique = Array.from(
      new Set(homilies.map((h) => h.sunday_date).filter((s): s is string => !!s && !sundayNameCache.has(s)))
    );
    if (unique.length === 0) return;
    (async () => {
      for (const iso of unique) {
        const name = await fetchSundayName(iso);
        if (name && !cancelled) bumpNames((n) => n + 1);
      }
    })();
    return () => { cancelled = true; };
  }, [open, homilies]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (confirmDeleteId) setConfirmDeleteId(null);
        else onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, confirmDeleteId]);

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      await supabase
        .from("homilies")
        .delete()
        .eq("id", id)
        .eq("user_id", user.id);
      setHomilies((prev) => (prev ? prev.filter((h) => h.id !== id) : prev));
    } catch {
      /* keep the row visible — user can try again */
    } finally {
      setDeletingId(null);
      setConfirmDeleteId(null);
    }
  };

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
          animation: "fadeIn 0.15s ease",
        }}
      />

      {/* Drawer */}
      <aside
        role="dialog"
        aria-label="My homilies"
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
          animation: "slideInLeft 0.2s ease",
        }}
      >
        <div style={{
          padding: "20px 20px 14px",
          borderBottom: "1px solid var(--ambo-border)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}>
          <h2 style={{
            fontSize: 15,
            fontWeight: 600,
            letterSpacing: "-0.01em",
            color: "var(--ambo-text-primary)",
            margin: 0,
          }}>
            My homilies
          </h2>
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

        <div style={{ padding: "12px 12px 8px" }}>
          <button
            onClick={onCreate}
            style={{
              width: "100%",
              border: "1px dashed var(--ambo-border)",
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
              transition: "all 0.15s",
            }}
          >
            <span style={{ fontSize: 16, lineHeight: 1 }}>+</span>
            New homily
          </button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "4px 8px 20px" }}>
          {homilies === null && !loadError && (
            <div style={{ padding: 20, fontSize: 13, color: "var(--ambo-text-muted)", textAlign: "center" }}>
              Loading…
            </div>
          )}

          {loadError && (
            <div style={{ padding: 20, fontSize: 13, color: "var(--ambo-text-muted)", textAlign: "center" }}>
              Couldn’t load homilies. {loadError}
            </div>
          )}

          {homilies && homilies.length === 0 && !loadError && (
            <div style={{ padding: "32px 20px", fontSize: 13, color: "var(--ambo-text-muted)", textAlign: "center", lineHeight: 1.6 }}>
              No homilies yet.<br />Start a new one above.
            </div>
          )}

          {homilies && homilies.map((h) => {
            const isActive = h.id === currentId;
            const title = (h.title && h.title.trim()) || "Untitled";
            const preview = previewOf(h.content);
            const words = wordCount(h.content);
            const confirming = confirmDeleteId === h.id;
            const sundayName = h.sunday_date ? sundayNameCache.get(h.sunday_date) : undefined;
            const sundaySubtitle = h.sunday_date
              ? `${sundayName ?? "Sunday"} · ${shortSundayLabel(h.sunday_date)}`
              : null;

            return (
              <div
                key={h.id}
                style={{
                  position: "relative",
                  padding: "12px 12px",
                  margin: "2px 4px",
                  borderRadius: 10,
                  background: isActive ? "var(--ambo-accent-light)" : "transparent",
                  border: "1px solid " + (isActive ? "var(--ambo-accent)" : "transparent"),
                  cursor: "pointer",
                  transition: "background 0.1s",
                }}
                onClick={() => { if (!confirming) onSelect(h.id); }}
                onMouseEnter={(e) => {
                  if (!isActive) e.currentTarget.style.background = "var(--ambo-surface)";
                }}
                onMouseLeave={(e) => {
                  if (!isActive) e.currentTarget.style.background = "transparent";
                }}
              >
                <div style={{
                  display: "flex",
                  alignItems: "baseline",
                  justifyContent: "space-between",
                  gap: 8,
                  marginBottom: 4,
                }}>
                  <div style={{
                    fontSize: 14,
                    fontWeight: 600,
                    color: "var(--ambo-text-primary)",
                    letterSpacing: "-0.01em",
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
                {sundaySubtitle && (
                  <div style={{
                    fontSize: 11,
                    fontWeight: 500,
                    color: "var(--ambo-accent)",
                    marginBottom: 4,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}>
                    {sundaySubtitle}
                  </div>
                )}
                <div style={{
                  fontSize: 12,
                  color: "var(--ambo-text-secondary)",
                  lineHeight: 1.5,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  marginBottom: 4,
                }}>
                  {preview}
                </div>
                <div style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}>
                  <div style={{ fontSize: 11, color: "var(--ambo-text-muted)" }}>
                    {words} {words === 1 ? "word" : "words"}
                  </div>
                  {!confirming && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setConfirmDeleteId(h.id);
                      }}
                      aria-label="Delete homily"
                      title="Delete"
                      style={{
                        border: "none",
                        background: "none",
                        color: "var(--ambo-text-muted)",
                        cursor: "pointer",
                        padding: "2px 6px",
                        borderRadius: 6,
                        fontSize: 11,
                        fontFamily: "inherit",
                      }}
                    >
                      Delete
                    </button>
                  )}
                  {confirming && (
                    <div style={{ display: "flex", gap: 6 }}>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setConfirmDeleteId(null);
                        }}
                        style={{
                          border: "1px solid var(--ambo-border)",
                          background: "transparent",
                          color: "var(--ambo-text-secondary)",
                          cursor: "pointer",
                          padding: "3px 10px",
                          borderRadius: 100,
                          fontSize: 11,
                          fontFamily: "inherit",
                        }}
                      >
                        Cancel
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(h.id);
                        }}
                        disabled={deletingId === h.id}
                        style={{
                          border: "none",
                          background: "#c0392b",
                          color: "white",
                          cursor: deletingId === h.id ? "default" : "pointer",
                          padding: "3px 10px",
                          borderRadius: 100,
                          fontSize: 11,
                          fontWeight: 600,
                          fontFamily: "inherit",
                          opacity: deletingId === h.id ? 0.6 : 1,
                        }}
                      >
                        {deletingId === h.id ? "…" : "Delete"}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </aside>
    </>
  );
}
