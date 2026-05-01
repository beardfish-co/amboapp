"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { loadReadings } from "@/lib/readings";
import type { ReadingsPayload } from "@/lib/readings";
import type { LectionaryFamily } from "@/lib/jurisdiction";

// ── US feast-day substitution ─────────────────────────────────────────────────
//
// On these dates, US priests who would normally receive Evangelizo (NAB) are
// instead served Universalis with the "usa" prefix, because the feast is
// US-specific and Evangelizo doesn't carry jurisdiction-specific calendars.
// The date format is MM-DD for annual feasts; variable dates (Thanksgiving)
// are computed separately.

const US_FEAST_SUBSTITUTIONS: Record<string, string> = {
  "12-08": "Immaculate Conception — Solemnity (moved to Dec 9 when Dec 8 falls on Sunday)",
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

/** Returns the ISO date string of Thanksgiving (fourth Thursday of November) for a given year. */
function thanksgivingDate(year: number): string {
  const nov1 = new Date(year, 10, 1);
  const dayOfWeek = nov1.getDay(); // 0=Sun, 4=Thu
  const firstThursday = dayOfWeek <= 4 ? 4 - dayOfWeek + 1 : 11 - dayOfWeek + 4 + 1;
  const thanksgiving = new Date(year, 10, firstThursday + 21); // +21 = fourth Thursday
  return `${year}-11-${String(thanksgiving.getDate()).padStart(2, "0")}`;
}

function isUsFeastSubstitution(isoDate: string): boolean {
  const [, mm, dd] = isoDate.split("-");
  const key = `${mm}-${dd}`;
  if (US_FEAST_SUBSTITUTIONS[key]) return true;
  // Thanksgiving
  const year = Number(isoDate.slice(0, 4));
  if (isoDate === thanksgivingDate(year)) return true;
  return false;
}

// ── Jurisdiction → Universalis prefix mapping ─────────────────────────────────
//
// Maps the priest's lectionary_family to the best available Universalis prefix.
// Fine-grained jurisdiction (diocese level) is a future profile enhancement.
// For je_jerusalem priests we currently use the universal calendar — they share
// the same pericopes as the national calendars for most days; jurisdiction-specific
// feasts are a future improvement.

function universalisJurisdiction(family: LectionaryFamily | null | undefined): string | undefined {
  switch (family) {
    case "gb_esv":    return "europe.england";
    case "ca_nrsv":   return "canada";
    case "india_esv": return "asia.india";
    // je_jerusalem covers Ireland, Australia, NZ — unknown which without a finer profile field.
    // Fall through to universal calendar for now.
    default:          return undefined;
  }
}

// ── Day picker helpers ────────────────────────────────────────────────────────

function todayIso(): string {
  const t = new Date();
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
}

function isoToDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function dateToIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Generate the next `count` non-Sunday dates starting from `startIso` (inclusive).
 */
function buildDayOptions(startIso: string, count: number): string[] {
  const options: string[] = [];
  const cursor = isoToDate(startIso);
  while (options.length < count) {
    if (cursor.getDay() !== 0) {
      options.push(dateToIso(cursor));
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return options;
}

const WEEKDAY_ABBR = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_ABBR   = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function dayPickerLabel(iso: string, todayStr: string): { top: string; bottom: string } {
  if (iso === todayStr) return { top: "Today", bottom: "" };
  const d = isoToDate(iso);
  const tomorrow = isoToDate(todayStr);
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (dateToIso(tomorrow) === iso) return { top: "Tom.", bottom: String(d.getDate()) };
  return { top: WEEKDAY_ABBR[d.getDay()], bottom: `${MONTH_ABBR[d.getMonth()]} ${d.getDate()}` };
}

// ── Component ─────────────────────────────────────────────────────────────────

interface DailyMassViewProps {
  open: boolean;
  onClose: () => void;
  lectionaryFamily: LectionaryFamily | null | undefined;
}

type DailyMode = "daily" | "preach";

interface UnsavedGuard {
  pendingAction: "close" | { date: string };
}

export default function DailyMassView({ open, onClose, lectionaryFamily }: DailyMassViewProps) {
  const today = todayIso();
  const [dayOptions, setDayOptions] = useState<string[]>(() => buildDayOptions(today, 7));
  const [selectedDate, setSelectedDate] = useState<string>(today);
  const [mode, setMode] = useState<DailyMode>("daily");

  const [readings, setReadings] = useState<ReadingsPayload | null>(null);
  const [readingsLoading, setReadingsLoading] = useState(false);
  const [readingsUnavailable, setReadingsUnavailable] = useState(false);
  const [usFeastSubstitution, setUsFeastSubstitution] = useState(false);

  const [noteContent, setNoteContent] = useState("");
  const [noteId, setNoteId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [hasUnsaved, setHasUnsaved] = useState(false);
  const [isFocused, setIsFocused] = useState(false);

  const [unsavedGuard, setUnsavedGuard] = useState<UnsavedGuard | null>(null);

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentNoteRef = useRef<{ date: string; id: string | null; content: string }>({
    date: today,
    id: null,
    content: "",
  });
  const closingRef = useRef(false);

  // ── Reset on each fresh open ─────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    const t = todayIso();
    setDayOptions(buildDayOptions(t, 7));
    setSelectedDate(t);
    setMode("daily");
    setReadings(null);
    setReadingsLoading(false);
    setReadingsUnavailable(false);
    setNoteContent("");
    setNoteId(null);
    setHasUnsaved(false);
    setUnsavedGuard(null);
    currentNoteRef.current = { date: t, id: null, content: "" };
    closingRef.current = false;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // ── Fetch readings when date changes ─────────────────────────────────────
  useEffect(() => {
    if (!open || !selectedDate) return;
    let cancelled = false;

    const isUs = lectionaryFamily === "us_nab";
    const isSubstitution = isUs && isUsFeastSubstitution(selectedDate);
    setUsFeastSubstitution(isSubstitution);

    setReadingsLoading(true);
    setReadingsUnavailable(false);

    (async () => {
      let source: "universalis" | "evangelizo" = isUs && !isSubstitution ? "evangelizo" : "universalis";
      let jurisdiction: string | undefined =
        isSubstitution ? "usa" : universalisJurisdiction(lectionaryFamily);

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
        sunday_date: date,                // date the readings are for
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

  // ── Content change ────────────────────────────────────────────────────────
  const handleContentChange = useCallback((value: string) => {
    setNoteContent(value);
    setHasUnsaved(true);
    currentNoteRef.current = { ...currentNoteRef.current, content: value };
    scheduleSave(value);
  }, [scheduleSave]);

  // ── Date change with unsaved guard ────────────────────────────────────────
  const requestDateChange = useCallback((date: string) => {
    if (hasUnsaved) {
      setUnsavedGuard({ pendingAction: { date } });
    } else {
      setSelectedDate(date);
    }
  }, [hasUnsaved]);

  // ── Close with unsaved guard ──────────────────────────────────────────────
  const requestClose = useCallback(() => {
    if (hasUnsaved) {
      setUnsavedGuard({ pendingAction: "close" });
    } else {
      onClose();
    }
  }, [hasUnsaved, onClose]);

  // ── Guard resolution ──────────────────────────────────────────────────────
  const guardSave = useCallback(async () => {
    await flushSave();
    if (!unsavedGuard) return;
    const action = unsavedGuard.pendingAction;
    setUnsavedGuard(null);
    if (action === "close") onClose();
    else setSelectedDate(action.date);
  }, [flushSave, unsavedGuard, onClose]);

  const guardDiscard = useCallback(() => {
    if (saveTimerRef.current) { clearTimeout(saveTimerRef.current); saveTimerRef.current = null; }
    setHasUnsaved(false);
    if (!unsavedGuard) return;
    const action = unsavedGuard.pendingAction;
    setUnsavedGuard(null);
    if (action === "close") onClose();
    else setSelectedDate(action.date);
  }, [unsavedGuard, onClose]);

  const guardCancel = useCallback(() => setUnsavedGuard(null), []);

  // ── Keyboard: Escape → close ──────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (unsavedGuard) guardCancel();
        else requestClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, unsavedGuard, guardCancel, requestClose]);

  // ── Cleanup timer on unmount ──────────────────────────────────────────────
  useEffect(() => () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); }, []);

  if (!open) return null;

  // ── Readings panel content ────────────────────────────────────────────────
  // Filter to Daily Mass readings only: r1, ps, gospel. No second reading, no acclamation.
  const dailyReadings = readings?.readings.filter(r => ["r1", "ps", "gospel"].includes(r.id)) ?? [];

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      {/* Full-screen overlay */}
      <div style={{
        position: "fixed",
        inset: 0,
        zIndex: 150,
        background: "var(--ambo-bg)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}>

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <header style={{
          background: "var(--ambo-header-bg)",
          backdropFilter: "blur(20px) saturate(1.4)",
          WebkitBackdropFilter: "blur(20px) saturate(1.4)",
          borderBottom: "1px solid var(--ambo-border)",
          paddingTop: "env(safe-area-inset-top)",
          flexShrink: 0,
        }}>
          <div style={{
            height: 60,
            maxWidth: 1180,
            margin: "0 auto",
            padding: "0 16px",
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}>
            {/* Back chevron */}
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
                padding: "0 4px",
                flexShrink: 0,
                display: "flex",
                alignItems: "center",
              }}
            >
              ‹
            </button>

            {/* Islands row */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1 }}>
              {/* Greyed Sunday island — visible but non-functional */}
              <nav
                className="mode-pill"
                aria-label="Sunday modes (inactive)"
                style={{ opacity: 0.32, pointerEvents: "none" }}
              >
                {["Reflect", "Write", "Preach"].map((label) => (
                  <button key={label} className="mode-pill-btn" tabIndex={-1}>
                    {label}
                  </button>
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
                    {m.charAt(0).toUpperCase() + m.slice(1)}
                  </button>
                ))}
              </nav>
            </div>

            {/* Saving indicator */}
            {saving && (
              <div style={{
                fontSize: 11,
                color: "var(--ambo-text-muted)",
                fontStyle: "italic",
                opacity: 0.6,
                flexShrink: 0,
              }}>
                Saving…
              </div>
            )}
          </div>
        </header>

        {/* ── Day picker ──────────────────────────────────────────────────── */}
        {mode === "daily" && (
          <div style={{
            flexShrink: 0,
            borderBottom: "1px solid var(--ambo-border)",
            background: "var(--ambo-header-bg)",
          }}>
            <div style={{
              maxWidth: 1180,
              margin: "0 auto",
              padding: "10px 16px",
              display: "flex",
              gap: 6,
              overflowX: "auto",
              scrollbarWidth: "none",
            }}>
              {dayOptions.map((iso) => {
                const isSelected = iso === selectedDate;
                const labels = dayPickerLabel(iso, today);
                return (
                  <button
                    key={iso}
                    onClick={() => requestDateChange(iso)}
                    style={{
                      flexShrink: 0,
                      minWidth: 52,
                      padding: "6px 10px",
                      borderRadius: 8,
                      border: isSelected
                        ? "1.5px solid var(--ambo-accent)"
                        : "1px solid var(--ambo-border)",
                      background: isSelected
                        ? "var(--ambo-accent-faint)"
                        : "transparent",
                      color: isSelected
                        ? "var(--ambo-accent)"
                        : "var(--ambo-text-secondary)",
                      cursor: "pointer",
                      fontFamily: "inherit",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: 1,
                      transition: "all 0.12s",
                    }}
                  >
                    <span style={{
                      fontSize: 12,
                      fontWeight: isSelected ? 600 : 500,
                      lineHeight: 1.2,
                    }}>
                      {labels.top}
                    </span>
                    {labels.bottom && (
                      <span style={{ fontSize: 10, opacity: 0.75, lineHeight: 1.2 }}>
                        {labels.bottom}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Main content area ────────────────────────────────────────────── */}
        <div style={{
          flex: 1,
          minHeight: 0,
          display: "flex",
          flexDirection: "row",
          overflow: "hidden",
        }}>

          {/* ── Readings panel (hidden in Preach mode) ────────────────────── */}
          {mode === "daily" && (
            <div style={{
              width: "clamp(260px, 37%, 420px)",
              flexShrink: 0,
              borderRight: "1px solid var(--ambo-border)",
              overflowY: "auto",
              padding: "28px 24px 48px",
              display: "flex",
              flexDirection: "column",
              gap: 0,
            }}
            // On mobile, readings panel is hidden in favour of the writing surface.
            // The writing surface is always visible; priest scrolls up to see readings.
            // This is handled via CSS media query below.
            className="daily-readings-panel"
            >
              {/* US feast substitution note */}
              {usFeastSubstitution && (
                <div style={{
                  fontSize: 12,
                  color: "var(--ambo-text-muted)",
                  fontStyle: "italic",
                  marginBottom: 18,
                  lineHeight: 1.55,
                  padding: "8px 12px",
                  background: "var(--ambo-accent-faint)",
                  borderRadius: 6,
                }}>
                  Today's readings are shown in the Jerusalem Bible because NAB lectionary data is not available for this feast.
                </div>
              )}

              {readingsLoading && (
                <div style={{
                  fontFamily: "var(--ambo-font-reading)",
                  fontSize: 14,
                  fontStyle: "italic",
                  color: "var(--ambo-text-muted)",
                  paddingTop: 12,
                }}>
                  Loading…
                </div>
              )}

              {!readingsLoading && readingsUnavailable && (
                <div style={{
                  fontFamily: "var(--ambo-font-reading)",
                  fontSize: 14,
                  fontStyle: "italic",
                  color: "var(--ambo-text-muted)",
                  lineHeight: 1.65,
                }}>
                  Readings could not be loaded. Please check your connection.
                </div>
              )}

              {!readingsLoading && !readingsUnavailable && !readings && (
                <div style={{
                  fontFamily: "var(--ambo-font-reading)",
                  fontSize: 14,
                  fontStyle: "italic",
                  color: "var(--ambo-text-muted)",
                  lineHeight: 1.65,
                }}>
                  Readings not yet available for this date.
                </div>
              )}

              {readings && !readingsLoading && (
                <>
                  {/* Saint of the day — prominent header when present */}
                  {readings.saint && (
                    <div style={{
                      fontFamily: "var(--ambo-font-reading)",
                      fontSize: 18,
                      fontStyle: "italic",
                      fontWeight: 500,
                      color: "var(--ambo-text-primary)",
                      lineHeight: 1.3,
                      marginBottom: 6,
                    }}>
                      {readings.saint}
                    </div>
                  )}

                  {/* Liturgical day label */}
                  <div style={{
                    fontSize: 12,
                    fontWeight: 500,
                    color: "var(--ambo-accent)",
                    letterSpacing: "0.01em",
                    marginBottom: 28,
                    opacity: 0.85,
                  }}>
                    {readings.dayName}
                  </div>

                  {/* Readings: r1, psalm, gospel */}
                  {dailyReadings.map((reading, idx) => (
                    <div key={reading.id} style={{ marginBottom: idx < dailyReadings.length - 1 ? 32 : 0 }}>
                      {/* Reading label + citation */}
                      <div style={{ marginBottom: 8 }}>
                        <span style={{
                          fontSize: 10,
                          fontWeight: 700,
                          letterSpacing: "0.08em",
                          textTransform: "uppercase",
                          color: "var(--ambo-text-muted)",
                          opacity: 0.7,
                        }}>
                          {reading.title}
                        </span>
                        {reading.reference && (
                          <span style={{
                            fontSize: 11,
                            color: "var(--ambo-accent)",
                            marginLeft: 8,
                            opacity: 0.8,
                          }}>
                            {reading.reference}
                          </span>
                        )}
                      </div>

                      {/* Heading (Universalis only, often absent on weekdays) */}
                      {reading.heading && (
                        <div style={{
                          fontSize: 13,
                          fontStyle: "italic",
                          color: "var(--ambo-text-secondary)",
                          marginBottom: 10,
                          lineHeight: 1.45,
                        }}>
                          {reading.heading}
                        </div>
                      )}

                      {/* Reading text — split into paragraphs */}
                      {reading.text.split(/\n\n+/).map((para, pi) => (
                        <p key={pi} style={{
                          fontFamily: "var(--ambo-font-reading)",
                          fontSize: 15,
                          lineHeight: 1.85,
                          color: "var(--ambo-text-primary)",
                          margin: "0 0 0.8em",
                        }}>
                          {para.replace(/\n/g, " ").trim()}
                        </p>
                      ))}
                    </div>
                  ))}
                </>
              )}
            </div>
          )}

          {/* ── Writing surface ──────────────────────────────────────────────── */}
          <div style={{
            flex: 1,
            minWidth: 0,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}>
            {mode === "preach" ? (
              // ── Preach sub-mode: full-screen writing at larger type ───────
              <div style={{
                flex: 1,
                overflowY: "auto",
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
              // ── Daily sub-mode: writing surface ───────────────────────────
              <div style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                padding: "28px 32px 48px",
                overflow: "hidden",
              }}>
                {/* "Reflection" label */}
                <div style={{
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: "var(--ambo-text-muted)",
                  marginBottom: 16,
                  opacity: isFocused || noteContent.trim() ? 0.7 : 0.4,
                  transition: "opacity 0.3s",
                }}>
                  Reflection
                </div>

                {/* Plain-text writing area */}
                <textarea
                  value={noteContent}
                  onChange={(e) => handleContentChange(e.target.value)}
                  onFocus={() => setIsFocused(true)}
                  onBlur={() => setIsFocused(false)}
                  placeholder="Begin writing…"
                  style={{
                    flex: 1,
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
                    overflowY: "auto",
                    WebkitOverflowScrolling: "touch",
                  } as React.CSSProperties}
                  spellCheck
                  autoCapitalize="sentences"
                />
              </div>
            )}
          </div>
        </div>

        {/* ── Mobile: stacked layout override (readings above, writing below) ── */}
        <style>{`
          @media (max-width: 639px) {
            .daily-readings-panel {
              width: 100% !important;
              border-right: none !important;
              border-bottom: 1px solid var(--ambo-border) !important;
              max-height: 45vh;
              flex-shrink: 0 !important;
            }
            /* In Daily mode on mobile: main content area becomes a column */
            .daily-main-area {
              flex-direction: column !important;
            }
          }
        `}</style>

      </div>

      {/* ── Unsaved-edits guard modal ──────────────────────────────────────── */}
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
              <button
                onClick={guardCancel}
                style={{
                  border: "1px solid var(--ambo-border)",
                  background: "transparent",
                  color: "var(--ambo-text-secondary)",
                  cursor: "pointer",
                  padding: "9px 16px", borderRadius: 100,
                  fontSize: 13, fontWeight: 500, fontFamily: "inherit",
                }}
              >
                Cancel
              </button>
              <button
                onClick={guardDiscard}
                style={{
                  border: "1px solid var(--ambo-border)",
                  background: "transparent",
                  color: "var(--ambo-text-muted)",
                  cursor: "pointer",
                  padding: "9px 16px", borderRadius: 100,
                  fontSize: 13, fontWeight: 500, fontFamily: "inherit",
                }}
              >
                Discard
              </button>
              <button
                onClick={guardSave}
                style={{
                  border: "none",
                  background: "var(--ambo-accent)",
                  color: "white",
                  cursor: "pointer",
                  padding: "9px 20px", borderRadius: 100,
                  fontSize: 13, fontWeight: 600, fontFamily: "inherit",
                }}
              >
                Save
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
