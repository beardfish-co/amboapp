"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { createClient } from "@/lib/supabase/client";
import { loadReadings } from "@/lib/readings";
import type { ReadingsPayload } from "@/lib/readings";
import type { LectionaryFamily } from "@/lib/jurisdiction";
import { PillButton } from "@/lib/ui/pill-button";
import { StackIcon, CalendarIcon } from "@/lib/ui/icons";
import { SlideReveal } from "@/lib/ui/slide-reveal";
import ThemeToggle from "./ThemeToggle";
import AccountMenu from "./AccountMenu";

// ── US feast-day substitution ─────────────────────────────────────────────────
const US_FEAST_SUBSTITUTIONS: Record<string, string> = {
  "12-08": "Immaculate Conception — Solemnity",
  "12-12": "Our Lady of Guadalupe — Feast",
  "07-04": "Independence Day — optional observance",
  "01-04": "Saint Elizabeth Ann Seton — Feast",
  "01-05": "Saint John Neumann — Feast",
  "01-06": "Blessed André Bessette — Optional Memorial",
  "05-15": "Saint Isidore the Farmer — Optional Memorial",
  "07-14": "Saint Kateri Tekakwitha — Feast",
  "07-01": "Blessed Junípero Serra — Optional Memorial",
  "09-09": "Saint Peter Claver — Feast",
  "10-19": "Saints John de Brébeuf and Isaac Jogues — Feast",
  "11-13": "Saint Frances Xavier Cabrini — Feast",
};

function thanksgivingDate(year: number): string {
  const nov1 = new Date(year, 10, 1);
  const dayOfWeek = nov1.getDay();
  const firstThursday = dayOfWeek <= 4 ? 4 - dayOfWeek + 1 : 11 - dayOfWeek + 4 + 1;
  const thanksgiving = new Date(year, 10, firstThursday + 21);
  return `${year}-11-${String(thanksgiving.getDate()).padStart(2, "0")}`;
}

function isUsFeastSubstitution(isoDate: string): boolean {
  const [, mm, dd] = isoDate.split("-");
  if (US_FEAST_SUBSTITUTIONS[`${mm}-${dd}`]) return true;
  const year = Number(isoDate.slice(0, 4));
  return isoDate === thanksgivingDate(year);
}

// ── Jurisdiction → Universalis prefix ────────────────────────────────────────
function universalisJurisdiction(family: LectionaryFamily | null | undefined): string | undefined {
  switch (family) {
    case "gb_esv":    return "europe.england";
    case "ca_nrsv":   return "canada";
    case "india_esv": return "asia.india";
    default:          return undefined;
  }
}

// ── Date helpers ─────────────────────────────────────────────────────────────
function todayIso(): string {
  const t = new Date();
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
}

function isoToDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function shortDayLabel(iso: string, todayStr: string): string {
  if (iso === todayStr) return "Today";
  const d = isoToDate(iso);
  const tomorrow = isoToDate(todayStr);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowIso = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, "0")}-${String(tomorrow.getDate()).padStart(2, "0")}`;
  if (iso === tomorrowIso) return "Tomorrow";
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

// ── Component ─────────────────────────────────────────────────────────────────

interface DailyMassViewProps {
  open: boolean;
  onClose: () => void;
  lectionaryFamily: LectionaryFamily | null | undefined;
  /** Date selected by the priest in the drawer day picker. Always provided before open=true. */
  initialDate: string;
  onSelectFamily?: (family: LectionaryFamily) => Promise<void>;
}

type DailyMode = "daily" | "preach";

interface UnsavedGuard {
  pendingAction: "close";
}

export default function DailyMassView({ open, onClose, lectionaryFamily, initialDate, onSelectFamily }: DailyMassViewProps) {
  const today = todayIso();
  const [selectedDate, setSelectedDate] = useState<string>(initialDate);
  const [mode, setMode] = useState<DailyMode>("daily");

  const [readings, setReadings] = useState<ReadingsPayload | null>(null);
  const [readingsLoading, setReadingsLoading] = useState(false);
  const [readingsUnavailable, setReadingsUnavailable] = useState(false);
  const [usFeastSubstitution, setUsFeastSubstitution] = useState(false);

  // Which reading card bodies are expanded
  const [openBodies, setOpenBodies] = useState<Set<string>>(() => new Set(["r1"]));

  const [noteContent, setNoteContent] = useState("");
  const [noteId, setNoteId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [hasUnsaved, setHasUnsaved] = useState(false);
  const [isFocused, setIsFocused] = useState(false);

  const [unsavedGuard, setUnsavedGuard] = useState<UnsavedGuard | null>(null);

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentNoteRef = useRef<{ date: string; id: string | null; content: string }>({
    date: initialDate,
    id: null,
    content: "",
  });

  // ── Reset on each fresh open ──────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    setSelectedDate(initialDate);
    setMode("daily");
    setReadings(null);
    setReadingsLoading(false);
    setReadingsUnavailable(false);
    setOpenBodies(new Set(["r1"]));
    setNoteContent("");
    setNoteId(null);
    setHasUnsaved(false);
    setUnsavedGuard(null);
    currentNoteRef.current = { date: initialDate, id: null, content: "" };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialDate]);

  // ── Fetch readings when date changes ──────────────────────────────────────
  useEffect(() => {
    if (!open || !selectedDate) return;
    let cancelled = false;

    const isUs = lectionaryFamily === "us_nab";
    const isSubstitution = isUs && isUsFeastSubstitution(selectedDate);
    setUsFeastSubstitution(isSubstitution);
    setReadingsLoading(true);
    setReadingsUnavailable(false);
    setOpenBodies(new Set(["r1"]));

    (async () => {
      const source: "universalis" | "evangelizo" = isUs && !isSubstitution ? "evangelizo" : "universalis";
      const jurisdiction: string | undefined = isSubstitution ? "usa" : universalisJurisdiction(lectionaryFamily);
      const result = await loadReadings(selectedDate, null, source, jurisdiction);
      if (cancelled) return;
      if (result.status === "not_published" || result.status === "unavailable" || !result.payload) {
        setReadings(null);
        setReadingsUnavailable(result.status === "unavailable");
      } else {
        setReadings(result.payload);
        setReadingsUnavailable(false);
      }
      setReadingsLoading(false);
    })();

    return () => { cancelled = true; };
  }, [open, selectedDate, lectionaryFamily]);

  // ── Load existing note for selected date ──────────────────────────────────
  useEffect(() => {
    if (!open || !selectedDate) return;
    let cancelled = false;

    (async () => {
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user || cancelled) return;

        const { data } = await supabase
          .from("homilies")
          .select("id, content")
          .eq("user_id", user.id)
          .eq("note_type", "daily")
          .eq("sunday_date", selectedDate)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (cancelled) return;

        if (data) {
          setNoteId(data.id);
          setNoteContent(data.content ?? "");
          currentNoteRef.current = { date: selectedDate, id: data.id, content: data.content ?? "" };
        } else {
          setNoteId(null);
          setNoteContent("");
          currentNoteRef.current = { date: selectedDate, id: null, content: "" };
        }
        setHasUnsaved(false);
      } catch {
        // offline — leave content empty
      }
    })();

    return () => { cancelled = true; };
  }, [open, selectedDate]);

  // ── Auto-save ─────────────────────────────────────────────────────────────
  const persistNote = useCallback(async (
    content: string,
    date: string,
    existingId: string | null,
    readingsPayload: ReadingsPayload | null,
  ): Promise<string | null> => {
    if (!content.trim()) return existingId;
    setSaving(true);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return existingId;

      const row = {
        user_id: user.id,
        note_type: "daily",
        sunday_date: date,
        title: readingsPayload?.saint || readingsPayload?.dayName || "",
        content,
        liturgical_day: readingsPayload?.dayName ?? "",
        saint_name: readingsPayload?.saint ?? "",
        readings_snapshot: readingsPayload ?? null,
        readings_snapshot_date: readingsPayload ? date : null,
        updated_at: new Date().toISOString(),
      };

      if (existingId) {
        await supabase.from("homilies").update(row).eq("id", existingId);
        return existingId;
      } else {
        const { data } = await supabase
          .from("homilies")
          .insert({ ...row, created_at: new Date().toISOString() })
          .select("id")
          .single();
        return data?.id ?? null;
      }
    } catch {
      return existingId;
    } finally {
      setSaving(false);
    }
  }, []);

  const scheduleSave = useCallback((content: string) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      const ref = currentNoteRef.current;
      const newId = await persistNote(content, ref.date, ref.id, readings);
      if (newId && !ref.id) {
        setNoteId(newId);
        currentNoteRef.current = { ...ref, id: newId };
      }
      setHasUnsaved(false);
    }, 1200);
  }, [persistNote, readings]);

  const flushSave = useCallback(async () => {
    if (saveTimerRef.current) { clearTimeout(saveTimerRef.current); saveTimerRef.current = null; }
    const ref = currentNoteRef.current;
    if (!ref.content.trim()) return;
    const newId = await persistNote(ref.content, ref.date, ref.id, readings);
    if (newId && !ref.id) {
      setNoteId(newId);
      currentNoteRef.current = { ...ref, id: newId };
    }
    setHasUnsaved(false);
  }, [persistNote, readings]);

  const handleContentChange = useCallback((value: string) => {
    setNoteContent(value);
    setHasUnsaved(true);
    currentNoteRef.current = { ...currentNoteRef.current, content: value };
    scheduleSave(value);
  }, [scheduleSave]);

  const toggleBody = useCallback((id: string) => {
    setOpenBodies(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // ── Close with unsaved guard ──────────────────────────────────────────────
  const requestClose = useCallback(() => {
    if (hasUnsaved) {
      setUnsavedGuard({ pendingAction: "close" });
    } else {
      onClose();
    }
  }, [hasUnsaved, onClose]);

  const guardSave = useCallback(async () => {
    await flushSave();
    setUnsavedGuard(null);
    onClose();
  }, [flushSave, onClose]);

  const guardDiscard = useCallback(() => {
    if (saveTimerRef.current) { clearTimeout(saveTimerRef.current); saveTimerRef.current = null; }
    setHasUnsaved(false);
    setUnsavedGuard(null);
    onClose();
  }, [onClose]);

  const guardCancel = useCallback(() => setUnsavedGuard(null), []);

  // ── Keyboard: Escape → close ──────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (unsavedGuard) { guardCancel(); return; }
        requestClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, unsavedGuard, guardCancel, requestClose]);

  // ── Cleanup timer on unmount ──────────────────────────────────────────────
  useEffect(() => () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); }, []);

  // Suppress lint — noteId is used in currentNoteRef only
  void noteId;

  if (!open) return null;

  const dailyReadings = readings?.readings.filter(r => ["r1", "ps", "gospel"].includes(r.id)) ?? [];
  const displayTitle = readings?.saint || readings?.dayName || shortDayLabel(selectedDate, today);
  const wordCount = noteContent.trim().split(/\s+/).filter(Boolean).length;
  const contextLabel = `${shortDayLabel(selectedDate, today)}${readings?.saint ? ` · ${readings.saint}` : ""}`;

  return (
    <>
      <style>{`
        .daily-layout {
          display: grid;
          grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr);
          gap: 32px;
          align-items: start;
        }
        @media (max-width: 880px) {
          .daily-layout {
            grid-template-columns: minmax(0, 1fr) !important;
          }
        }
        .daily-reading-card-btn {
          width: 100%;
          border: none;
          background: none;
          text-align: left;
        }
      `}</style>

      {/* ── Full-screen overlay ──────────────────────────────────────────── */}
      <div style={{
        position: "fixed",
        inset: 0,
        zIndex: 150,
        background: "var(--ambo-bg)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}>

        {/* ── Primary header ────────────────────────────────────────────── */}
        <header style={{
          background: "var(--ambo-header-bg)",
          backdropFilter: "blur(20px) saturate(1.4)",
          WebkitBackdropFilter: "blur(20px) saturate(1.4)",
          borderBottom: "1px solid var(--ambo-border)",
          paddingTop: "env(safe-area-inset-top)",
          flexShrink: 0,
        }}>
          <div className="ambo-header-inner" style={{
            height: 60,
            maxWidth: 1180,
            margin: "0 auto",
            padding: "0 24px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}>

            {/* Left: back chevron + logo + wordmark */}
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <button
                onClick={requestClose}
                aria-label="Return to Sunday surface"
                style={{
                  border: "none",
                  background: "none",
                  color: "var(--ambo-text-muted)",
                  cursor: "pointer",
                  fontSize: 24,
                  lineHeight: 1,
                  padding: "0 6px 0 0",
                  flexShrink: 0,
                  display: "flex",
                  alignItems: "center",
                }}
              >
                ‹
              </button>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/ambo-mark-64.png"
                alt="Ambo"
                width={32}
                height={32}
                style={{ display: "block", objectFit: "contain", transform: "translateY(-4px)" }}
              />
              <span
                className="ambo-wordmark"
                style={{
                  fontSize: 22,
                  fontWeight: 400,
                  fontFamily: "var(--font-newsreader), Georgia, serif",
                  color: "var(--ambo-accent)",
                  letterSpacing: "-0.01em",
                  lineHeight: 1,
                  userSelect: "none",
                }}
              >
                ambo
              </span>
            </div>

            {/* Centre: mode islands */}
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {/* Greyed Sunday island */}
              <nav className="mode-pill" aria-label="Sunday modes (inactive)" style={{ opacity: 0.32, pointerEvents: "none" }}>
                {["Reflect", "Write", "Preach"].map((label) => (
                  <button key={label} className="mode-pill-btn" tabIndex={-1}>{label}</button>
                ))}
              </nav>
              {/* Active Daily island */}
              <nav className="mode-pill" aria-label="Daily modes">
                {(["daily", "preach"] as DailyMode[]).map((m) => (
                  <button
                    key={m}
                    className={`mode-pill-btn ${mode === m ? "active" : ""}`}
                    onClick={() => setMode(m)}
                  >
                    {m === "daily" ? "Daily" : "Preach"}
                  </button>
                ))}
              </nav>
            </div>

            {/* Right: ThemeToggle + AccountMenu */}
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <ThemeToggle />
              <AccountMenu
                lectionaryFamily={lectionaryFamily}
                onSelectFamily={onSelectFamily ?? (() => Promise.resolve())}
              />
            </div>

          </div>
        </header>

        {/* ── Scrollable content ───────────────────────────────────────── */}
        <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>

          {mode === "preach" ? (
            // ── Preach sub-mode ────────────────────────────────────────
            <div style={{
              maxWidth: 860,
              margin: "0 auto",
              padding: "clamp(32px, 6vh, 72px) clamp(24px, 7vw, 96px)",
            }}>
              {noteContent.trim() ? (
                noteContent.split(/\n\n+/).map((para, i) => (
                  <p key={i} style={{
                    fontFamily: "var(--ambo-font-reading)",
                    fontSize: "clamp(20px, 2.5vw, 28px)",
                    lineHeight: 1.75,
                    color: "var(--ambo-text-primary)",
                    margin: "0 0 1.2em",
                  }}>
                    {para.replace(/\n/g, " ").trim()}
                  </p>
                ))
              ) : (
                <p style={{
                  fontFamily: "var(--ambo-font-reading)",
                  fontSize: "clamp(16px, 2vw, 22px)",
                  fontStyle: "italic",
                  color: "var(--ambo-text-muted)",
                  opacity: 0.5,
                }}>
                  No reflection written yet.
                </p>
              )}
            </div>

          ) : (
            // ── Daily sub-mode — two-column layout ────────────────────
            <div className="view-fade" style={{
              maxWidth: 1180,
              margin: "0 auto",
              padding: "clamp(24px, 4vh, 48px) clamp(16px, 3vw, 40px) 56px",
            }}>

              {/* ── Secondary chrome row ──────────────────────────────── */}
              <div style={{
                display: "flex",
                alignItems: "center",
                marginBottom: 28,
                gap: 10,
                flexWrap: "wrap",
              }}>
                <PillButton variant="ghost" icon={<StackIcon />} onClick={requestClose}>
                  My homilies
                </PillButton>
                <div style={{ flex: 1 }} />
                <PillButton
                  variant="ghost"
                  icon={<CalendarIcon />}
                  style={{ cursor: "default", pointerEvents: "none" }}
                >
                  {contextLabel}
                </PillButton>
              </div>

              {/* ── Two-column grid ───────────────────────────────────── */}
              <div className="daily-layout">

                {/* ── Left column: reading cards ─────────────────────── */}
                <div>
                  {/* Loading skeletons */}
                  {readingsLoading && (
                    <>
                      {["r1", "ps", "gospel"].map((id, idx) => (
                        <div
                          key={id}
                          className="glass-card"
                          style={{
                            marginBottom: idx < 2 ? 16 : 0,
                            padding: "18px 24px",
                            opacity: 0.45,
                          }}
                        >
                          <div style={{
                            height: 11,
                            width: idx === 0 ? "45%" : idx === 1 ? "28%" : "38%",
                            background: "var(--ambo-text-muted)",
                            borderRadius: 4,
                            opacity: 0.4,
                          }} />
                        </div>
                      ))}
                    </>
                  )}

                  {/* Unavailable / not published */}
                  {!readingsLoading && (readingsUnavailable || (!readings && dailyReadings.length === 0)) && (
                    <div className="glass-card" style={{ padding: "28px 28px" }}>
                      {usFeastSubstitution && (
                        <div style={{
                          fontSize: 11,
                          color: "var(--ambo-text-muted)",
                          fontStyle: "italic",
                          marginBottom: 16,
                          lineHeight: 1.55,
                          padding: "8px 10px",
                          background: "var(--ambo-accent-faint)",
                          borderRadius: 6,
                        }}>
                          Today's readings are shown in the Jerusalem Bible — NAB data is not available for this feast.
                        </div>
                      )}
                      <div style={{
                        fontFamily: "var(--ambo-font-reading)",
                        fontSize: 14,
                        fontStyle: "italic",
                        color: "var(--ambo-text-muted)",
                      }}>
                        {readingsUnavailable
                          ? "Readings are temporarily unavailable. Please check your connection."
                          : "Readings are not yet published for this date."}
                      </div>
                    </div>
                  )}

                  {/* Reading cards */}
                  {!readingsLoading && dailyReadings.map((r, idx) => {
                    const bodyOpen = openBodies.has(r.id);
                    const paragraphs = r.text.split(/\n\n+/);
                    return (
                      <section
                        key={r.id}
                        className="glass-card"
                        style={{
                          marginBottom: idx < dailyReadings.length - 1 ? 16 : 0,
                          overflow: "hidden",
                        }}
                      >
                        {/* Card header — tap to expand/collapse */}
                        <div
                          role="button"
                          tabIndex={0}
                          onClick={() => toggleBody(r.id)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              toggleBody(r.id);
                            }
                          }}
                          aria-expanded={bodyOpen}
                          style={{
                            padding: bodyOpen ? "20px 24px" : "18px 24px",
                            cursor: "pointer",
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "baseline",
                            gap: 16,
                            transition: "padding 200ms var(--ambo-ease)",
                          }}
                        >
                          <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0, flex: 1 }}>
                            <span style={{
                              fontSize: 11,
                              fontWeight: 700,
                              letterSpacing: "0.08em",
                              textTransform: "uppercase",
                              color: "var(--ambo-text-muted)",
                            }}>
                              {r.title}
                            </span>
                            {r.reference && (
                              <span style={{
                                fontSize: 12,
                                fontStyle: "italic",
                                color: "var(--ambo-text-muted)",
                                marginLeft: 10,
                              }}>
                                {r.reference}
                              </span>
                            )}
                          </div>
                          <span style={{
                            fontSize: 16,
                            color: "var(--ambo-text-muted)",
                            transition: "transform 200ms var(--ambo-ease)",
                            transform: bodyOpen ? "rotate(90deg)" : "rotate(0deg)",
                            flexShrink: 0,
                          }}>
                            ›
                          </span>
                        </div>

                        {/* Collapsible body */}
                        <SlideReveal open={bodyOpen}>
                          <div style={{ height: 1, background: "var(--ambo-rule-subtle)" }} />
                          <div style={{ padding: "26px 24px 28px" }}>
                            {paragraphs.map((para, i) => (
                              <p
                                key={i}
                                style={{
                                  fontFamily: "var(--ambo-font-reading)",
                                  fontSize: 17,
                                  lineHeight: 2.05,
                                  color: "var(--ambo-text-primary)",
                                  margin: `0 0 ${i < paragraphs.length - 1 ? 16 : 0}px`,
                                }}
                              >
                                {para.replace(/\n/g, " ").trim()}
                              </p>
                            ))}
                          </div>
                        </SlideReveal>
                      </section>
                    );
                  })}
                </div>

                {/* ── Right column: writing card ──────────────────────── */}
                <div>
                  <div
                    className="ambo-write-panel"
                    style={{
                      background: "var(--ambo-surface)",
                      backdropFilter: "blur(24px) saturate(1.4)",
                      WebkitBackdropFilter: "blur(24px) saturate(1.4)",
                      border: "1px solid var(--ambo-border)",
                      borderRadius: "var(--ambo-radius)",
                      boxShadow: "var(--ambo-shadow-md)",
                      padding: "32px 40px 48px",
                    }}
                  >

                    {/* Display title — italic, reading font */}
                    <div style={{
                      fontFamily: "var(--ambo-font-reading)",
                      fontSize: "clamp(20px, 2vw, 28px)",
                      fontStyle: "italic",
                      fontWeight: 400,
                      letterSpacing: "-0.01em",
                      lineHeight: 1.2,
                      color: readingsLoading ? "var(--ambo-text-muted)" : "var(--ambo-text-primary)",
                      opacity: readingsLoading ? 0.4 : 1,
                      transition: "opacity 0.25s",
                      marginBottom: 14,
                    }}>
                      {readingsLoading ? "Loading…" : displayTitle}
                    </div>

                    {/* Date + saint tactile pill */}
                    <div style={{ marginBottom: 18 }}>
                      <PillButton
                        variant="ghost"
                        icon={<CalendarIcon />}
                        style={{ cursor: "default", pointerEvents: "none" }}
                      >
                        {contextLabel}
                      </PillButton>
                    </div>

                    {/* Divider */}
                    <div style={{
                      height: 1,
                      background: "var(--ambo-rule-subtle)",
                      marginBottom: 28,
                    }} />

                    {/* Writing surface */}
                    <textarea
                      value={noteContent}
                      onChange={(e) => handleContentChange(e.target.value)}
                      onFocus={() => setIsFocused(true)}
                      onBlur={() => setIsFocused(false)}
                      placeholder="Begin writing…"
                      style={{
                        width: "100%",
                        minHeight: 280,
                        border: "none",
                        background: "transparent",
                        resize: "none",
                        outline: "none",
                        fontFamily: "var(--ambo-font-reading)",
                        fontSize: "clamp(15px, 1.5vw, 17px)",
                        lineHeight: 1.85,
                        color: noteContent.trim() || isFocused
                          ? "var(--ambo-text-primary)"
                          : "var(--ambo-text-muted)",
                        caretColor: "var(--ambo-accent)",
                        transition: "color 0.35s",
                        boxSizing: "border-box",
                      } as CSSProperties}
                      spellCheck
                      autoCapitalize="sentences"
                    />

                    {/* Footer: word count + saving indicator */}
                    <div style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      marginTop: 14,
                      minHeight: 18,
                    }}>
                      {noteContent.trim() && (
                        <span style={{ fontSize: 11, color: "var(--ambo-text-muted)", opacity: 0.5 }}>
                          {wordCount} {wordCount === 1 ? "word" : "words"}
                        </span>
                      )}
                      {saving && (
                        <span style={{ fontSize: 11, color: "var(--ambo-text-muted)", fontStyle: "italic", opacity: 0.55 }}>
                          Saving…
                        </span>
                      )}
                    </div>

                  </div>
                </div>

              </div>
            </div>
          )}

        </div>
      </div>

      {/* ── Unsaved-edits guard modal ────────────────────────────────────── */}
      {unsavedGuard && (
        <>
          <div
            onClick={guardCancel}
            style={{
              position: "fixed", inset: 0,
              background: "rgba(15, 20, 30, 0.45)",
              backdropFilter: "blur(3px)",
              WebkitBackdropFilter: "blur(3px)",
              zIndex: 300,
            }}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="daily-guard-title"
            style={{
              position: "fixed", inset: 0,
              margin: "auto", height: "fit-content",
              zIndex: 301,
              background: "var(--ambo-bg)",
              border: "1px solid var(--ambo-border)",
              borderRadius: 18,
              boxShadow: "var(--ambo-shadow-md)",
              padding: "28px 28px 24px",
              width: "min(360px, 90vw)",
            }}
          >
            <p id="daily-guard-title" style={{
              fontFamily: "var(--ambo-font-reading)",
              fontSize: 16,
              fontStyle: "italic",
              color: "var(--ambo-text-primary)",
              margin: "0 0 8px",
              lineHeight: 1.35,
            }}>
              You have unsaved notes.
            </p>
            <p style={{
              fontSize: 13,
              color: "var(--ambo-text-secondary)",
              lineHeight: 1.55,
              margin: "0 0 24px",
            }}>
              Save before leaving, or discard your changes.
            </p>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={guardCancel} style={{
                border: "1px solid var(--ambo-border)",
                background: "transparent",
                color: "var(--ambo-text-secondary)",
                cursor: "pointer",
                padding: "9px 16px", borderRadius: 100,
                fontSize: 13, fontWeight: 500, fontFamily: "inherit",
              }}>
                Cancel
              </button>
              <button onClick={guardDiscard} style={{
                border: "1px solid var(--ambo-border)",
                background: "transparent",
                color: "var(--ambo-text-muted)",
                cursor: "pointer",
                padding: "9px 16px", borderRadius: 100,
                fontSize: 13, fontWeight: 500, fontFamily: "inherit",
              }}>
                Discard
              </button>
              <button onClick={guardSave} style={{
                border: "none",
                background: "var(--ambo-accent)",
                color: "white",
                cursor: "pointer",
                padding: "9px 20px", borderRadius: 100,
                fontSize: 13, fontWeight: 600, fontFamily: "inherit",
              }}>
                Save
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
