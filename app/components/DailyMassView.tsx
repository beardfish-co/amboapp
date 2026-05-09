"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { createClient } from "@/lib/supabase/client";
import { loadReadings } from "@/lib/readings";
import type { ReadingsPayload } from "@/lib/readings";
import type { LectionaryFamily } from "@/lib/jurisdiction";
import { SOURCE_ATTRIBUTION } from "@/lib/jurisdiction";
import { PillButton } from "@/lib/ui/pill-button";
import { StackIcon, CalendarIcon } from "@/lib/ui/icons";
import { SlideReveal } from "@/lib/ui/slide-reveal";
import { BreathingPanel } from "@/lib/ui/breathing-panel";
import TextareaAutosize from "react-textarea-autosize";
import ThemeToggle from "./ThemeToggle";
import AccountMenu from "./AccountMenu";
import { DailyPreachPanel } from "./DailyPreachPanel";

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

// ── Day-title resolution — saint > liturgical name > date fallback ────────────
// Same string used in contextual pill and writing-card display title.
function resolveTitle(readings: ReadingsPayload | null, iso: string): string {
  if (readings?.saint)   return readings.saint;
  if (readings?.dayName) return readings.dayName;
  // Date fallback — "Thursday 7 May"
  const d = isoToDate(iso);
  const weekday  = d.toLocaleDateString(undefined, { weekday: "long" });
  const dayNum   = d.getDate();
  const month    = d.toLocaleDateString(undefined, { month: "long" });
  return `${weekday} ${dayNum} ${month}`;
}

// ── Component ─────────────────────────────────────────────────────────────────

interface DailyMassViewProps {
  open: boolean;
  onClose: () => void;
  lectionaryFamily: LectionaryFamily | null | undefined;
  /** Date selected by the priest in the drawer day picker. Always provided before open=true. */
  initialDate: string;
  onSelectFamily?: (family: LectionaryFamily) => Promise<void>;
  /** Opens the My Homilies drawer over Daily */
  onOpenList?: () => void;
}

type DailyMode = "daily" | "preach";

interface UnsavedGuard {
  pendingAction: "close";
}

export default function DailyMassView({
  open, onClose, lectionaryFamily, initialDate, onSelectFamily, onOpenList,
}: DailyMassViewProps) {
  const today = todayIso();
  const [selectedDate, setSelectedDate] = useState<string>(initialDate);
  const [mode, setMode] = useState<DailyMode>("daily");

  const [readings, setReadings] = useState<ReadingsPayload | null>(null);
  const [readingsLoading, setReadingsLoading] = useState(false);
  const [readingsUnavailable, setReadingsUnavailable] = useState(false);
  const [usFeastSubstitution, setUsFeastSubstitution] = useState(false);

  // All reading cards start collapsed on Daily (unlike Sunday Reflect)
  const [openBodies, setOpenBodies] = useState<Set<string>>(() => new Set());

  const [noteContent, setNoteContent] = useState("");
  // Drives the BreathingPanel height for the writing surface below
  // (panel-breathing pattern from /test-textarea variant 5).
  const [noteHeight, setNoteHeight] = useState<number>(0);
  const [noteId, setNoteId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [hasUnsaved, setHasUnsaved] = useState(false);
  const [unsavedGuard, setUnsavedGuard] = useState<UnsavedGuard | null>(null);

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const textareaRef    = useRef<HTMLTextAreaElement>(null);
  const readingsColRef = useRef<HTMLDivElement>(null);
  const writingCardRef = useRef<HTMLDivElement>(null);

  // Writing card min-height — measured from left column when all cards are closed
  const [minWritingCardHeight, setMinWritingCardHeight] = useState(0);

  const currentNoteRef = useRef<{ date: string; id: string | null; content: string }>({
    date: initialDate, id: null, content: "",
  });

  // ── isActive: writing card lifts when the priest focuses or types ──────────
  const isActive = noteContent.trim().length > 0;

  // ── headerHidden: immersive preach mode collapses the header ─────────────
  const [headerHidden, setHeaderHidden] = useState(false);
  const [stepLocked, setStepLocked]     = useState(false);
  const [isDesktop, setIsDesktop]       = useState(
    typeof window !== "undefined" && window.innerWidth >= 1280
  );
  // Incremented when the DailyMassView-level Exit pill fires; resets DailyPreachPanel
  const [immersiveVersion, setImmersiveVersion] = useState(0);

  // ── Track desktop viewport ───────────────────────────────────────────────────
  useEffect(() => {
    const onResize = () => setIsDesktop(window.innerWidth >= 1280);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // ── Reset on each fresh open ──────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    setSelectedDate(initialDate);
    setMode("daily");
    setReadings(null);
    setReadingsLoading(false);
    setReadingsUnavailable(false);
    setOpenBodies(new Set());          // all collapsed on load
    setNoteContent("");
    setNoteId(null);
    setHasUnsaved(false);
    setUnsavedGuard(null);
    setHeaderHidden(false);
    setStepLocked(false);
    setIsDesktop(typeof window !== "undefined" && window.innerWidth >= 1280);
    setImmersiveVersion(0);
    setMinWritingCardHeight(0);
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
    setOpenBodies(new Set());          // reset on date change too

    (async () => {
      const source: "universalis" | "evangelizo" =
        isUs && !isSubstitution ? "evangelizo" : "universalis";
      const jurisdiction: string | undefined =
        isSubstitution ? "usa" : universalisJurisdiction(lectionaryFamily);
      const result = await loadReadings(selectedDate, null, source, jurisdiction);
      if (cancelled) return;
      if (
        result.status === "not_published" ||
        result.status === "unavailable" ||
        !result.payload
      ) {
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


  // ── Align writing card bottom with Gospel card bottom ───────────────────────
  useEffect(() => {
    if (readingsLoading || !readings) return;
    const readingsEl = readingsColRef.current;
    const writingEl  = writingCardRef.current;
    if (!readingsEl || !writingEl) return;

    const id = requestAnimationFrame(() => {
      const lastCard = readingsEl.lastElementChild as HTMLElement | null;
      if (!lastCard) return;
      const gospelBottom = lastCard.getBoundingClientRect().bottom;
      const writingTop   = writingEl.getBoundingClientRect().top;
      const target = gospelBottom - writingTop;
      if (target > 0) setMinWritingCardHeight(target);
    });

    return () => cancelAnimationFrame(id);
  }, [readingsLoading, readings]);

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

  // ── lastUserTyped: tracks content set by user keystrokes vs external loads.
  // handleContentChange sets this alongside setNoteContent (batched into the
  // same render); anything that updates noteContent without setting this (DB
  // load, date change, nav back from Preach) leaves it !== noteContent — that
  // mismatch is how we detect an external load and tell BreathingPanel to snap
  // rather than animate between unrelated content heights.
  const [lastUserTyped, setLastUserTyped] = useState<string | null>(null);
  const isExternalLoad = lastUserTyped !== noteContent;

  const handleContentChange = useCallback((value: string) => {
    setLastUserTyped(value); // batched with setNoteContent so isExternalLoad === false in next render
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

  const guardSave    = useCallback(async () => { await flushSave(); setUnsavedGuard(null); onClose(); }, [flushSave, onClose]);
  const guardDiscard = useCallback(() => {
    if (saveTimerRef.current) { clearTimeout(saveTimerRef.current); saveTimerRef.current = null; }
    setHasUnsaved(false); setUnsavedGuard(null); onClose();
  }, [onClose]);
  const guardCancel  = useCallback(() => setUnsavedGuard(null), []);

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

  useEffect(() => () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); }, []);

  void noteId; // used only via currentNoteRef

  if (!open) return null;

  const dailyReadings = readings?.readings.filter(r => ["r1", "ps", "gospel"].includes(r.id)) ?? [];
  const dayTitle      = readingsLoading ? "" : resolveTitle(readings, selectedDate);
  const wordCount        = noteContent.trim().split(/\s+/).filter(Boolean).length;
  const estimatedMinutes = Math.round(wordCount / 130);
  const noReadings    = !readingsLoading && (readingsUnavailable || !readings);

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
        .step-scroll-container::-webkit-scrollbar { display: none; }
      `}</style>

      {/* ── Full-screen overlay ──────────────────────────────────────────── */}
      <div style={{
        position: "fixed", inset: 0, zIndex: 150,
        background: "var(--ambo-bg)",
        display: "flex", flexDirection: "column", overflow: "hidden",
      }}>

        {/* ── Primary header — hides in immersive preach mode ─────────────── */}
        <header style={{
          background: "var(--ambo-header-bg)",
          backdropFilter: "blur(20px) saturate(1.4)",
          WebkitBackdropFilter: "blur(20px) saturate(1.4)",
          borderBottom: "1px solid var(--ambo-border)",
          paddingTop: headerHidden ? 0 : "env(safe-area-inset-top)",
          flexShrink: 0,
          maxHeight: headerHidden ? 0 : 200,
          opacity: headerHidden ? 0 : 1,
          overflow: "hidden",
          transition: "max-height 400ms cubic-bezier(0.4, 0, 0.2, 1), opacity 300ms cubic-bezier(0.4, 0, 0.2, 1), padding-top 400ms cubic-bezier(0.4, 0, 0.2, 1)",
        }}>
          <div className="ambo-header-inner" style={{
            height: 60, maxWidth: 1180, margin: "0 auto",
            padding: "0 24px", display: "flex",
            alignItems: "center", justifyContent: "space-between",
          }}>
            {/* Left: logo + wordmark */}
            <div style={{ display: "flex", alignItems: "center", gap: 0 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/ambo-mark-64.png" alt="Ambo" width={32} height={32}
                style={{ display: "block", objectFit: "contain", transform: "translateY(-4px)" }}
              />
              <span
                className="ambo-wordmark"
                style={{
                  fontSize: 22, fontWeight: 400,
                  fontFamily: "var(--font-newsreader), Georgia, serif",
                  color: "var(--ambo-accent)", letterSpacing: "-0.01em",
                  lineHeight: 1, userSelect: "none",
                }}
              >
                ambo
              </span>
            </div>

            {/* Centre: mode islands */}
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <nav className="mode-pill" aria-label="Sunday modes (inactive)"
                style={{ opacity: 0.32, pointerEvents: "none" }}>
                {["Reflect", "Write", "Preach"].map((label) => (
                  <button key={label} className="mode-pill-btn" tabIndex={-1}>{label}</button>
                ))}
              </nav>
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
        <div style={{
          flex: 1, minHeight: 0,
          overflowY: stepLocked ? "hidden" : "auto",
          ...(stepLocked ? { display: "flex", flexDirection: "column" as const } : {}),
        }}>

          {mode === "preach" ? (
            // ── Daily Preach — full PreachView chrome ─────────────────
            <DailyPreachPanel
              content={noteContent}
              title={dayTitle}
              isDesktop={isDesktop}
              onScrollLock={(locked, isScroll) => {
                // On desktop (≥1280px) the header stays visible — pill island is the exit affordance
                setHeaderHidden(locked && !isDesktop);
                setStepLocked(locked && isScroll === false);
              }}
              onBack={() => setMode("daily")}
              immersiveVersion={immersiveVersion}
            />

          ) : (
            // ── Daily mode — two-column layout ────────────────────────
            <div className="view-fade" style={{
              maxWidth: 1180, margin: "0 auto",
              padding: "36px clamp(16px, 3vw, 40px) 56px",
            }}>

              {/* ── Secondary chrome row ──────────────────────────────── */}
              <div style={{
                display: "flex", alignItems: "center",
                marginBottom: 32, gap: 8, flexWrap: "wrap",
              }}>
                <PillButton variant="ghost" icon={<StackIcon />} onClick={() => onOpenList?.()}>
                  My homilies
                </PillButton>
                <PillButton
                  variant="ghost"
                  icon={
                    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }}>
                      <polyline points="10,3 4,8 10,13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  }
                  onClick={requestClose}
                >
                  Exit
                </PillButton>
                <div style={{ flex: 1 }} />
                {/* Contextual pill — day title only, no day-relative prefix */}
                {readingsLoading ? (
                  <PillButton
                    variant="ghost"
                    icon={<CalendarIcon />}
                    style={{
                      cursor: "default", pointerEvents: "none",
                      opacity: 0.45,
                      transition: "opacity 600ms ease-in-out",
                    }}
                  >
                    Loading…
                  </PillButton>
                ) : (
                  <PillButton
                    variant="ghost"
                    icon={<CalendarIcon />}
                    style={{
                      cursor: "default", pointerEvents: "none",
                      overflow: "hidden", textOverflow: "ellipsis",
                      maxWidth: "min(280px, 48vw)",
                      transition: "opacity 600ms ease-in-out",
                    }}
                  >
                    {dayTitle}
                  </PillButton>
                )}
              </div>

              {/* ── Two-column grid ───────────────────────────────────── */}
              <div className="daily-layout">

                {/* ── Left column: reading cards ─────────────────────── */}
                <div ref={readingsColRef}>
                  {/* Unavailability notice */}
                  {noReadings && (
                    <div style={{
                      fontSize: 11, color: "var(--ambo-text-muted)",
                      fontStyle: "italic", marginBottom: 12, opacity: 0.7,
                    }}>
                      {readingsUnavailable
                        ? "Readings unavailable — try again"
                        : "Readings not yet published for this date"}
                    </div>
                  )}

                  {/* US feast substitution note */}
                  {!readingsLoading && usFeastSubstitution && readings && (
                    <div style={{
                      fontSize: 11, color: "var(--ambo-text-muted)",
                      fontStyle: "italic", marginBottom: 12, lineHeight: 1.55,
                      padding: "8px 10px", background: "var(--ambo-accent-faint)",
                      borderRadius: 6,
                    }}>
                      Today's readings are shown in the Jerusalem Bible — NAB data is not available for this feast.
                    </div>
                  )}

                  {/* Loading skeletons */}
                  {readingsLoading && (
                    <>
                      {["r1", "ps", "gospel"].map((id, idx) => (
                        <div key={id} className="glass-card" style={{
                          marginBottom: idx < 2 ? 16 : 0,
                          padding: "18px 24px", opacity: 0.4,
                        }}>
                          <div style={{
                            height: 11,
                            width: idx === 0 ? "45%" : idx === 1 ? "28%" : "38%",
                            background: "var(--ambo-text-muted)",
                            borderRadius: 4, opacity: 0.4,
                          }} />
                        </div>
                      ))}
                    </>
                  )}

                  {/* Reading cards — all start collapsed */}
                  {!readingsLoading && dailyReadings.map((r, idx) => {
                    const bodyOpen  = openBodies.has(r.id);
                    const paragraphs = r.text.split(/\n\n+/);
                    return (
                      <section key={r.id} className="glass-card" style={{
                        marginBottom: idx < dailyReadings.length - 1 ? 16 : 0,
                        }}>
                        <div
                          role="button" tabIndex={0}
                          onClick={() => toggleBody(r.id)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleBody(r.id); }
                          }}
                          aria-expanded={bodyOpen}
                          style={{
                            padding: bodyOpen ? "20px 24px" : "18px 24px",
                            cursor: "pointer", display: "flex",
                            justifyContent: "space-between", alignItems: "baseline",
                            gap: 16, transition: "padding 200ms var(--ambo-ease)",
                          }}
                        >
                          <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0, flex: 1 }}>
                            <div>
                              <span style={{
                                fontSize: 11, fontWeight: 700,
                                letterSpacing: "0.08em", textTransform: "uppercase",
                                color: "var(--ambo-text-muted)",
                              }}>
                                {r.title}
                              </span>
                              {r.reference && (
                                <span style={{
                                  fontSize: 12, fontStyle: "italic",
                                  color: "var(--ambo-text-muted)", marginLeft: 10,
                                }}>
                                  {r.reference}
                                </span>
                              )}
                            </div>
                            {r.heading && (
                              <div style={{
                                fontFamily: "var(--ambo-font-reading)",
                                fontSize: 13, fontStyle: "italic",
                                color: "var(--ambo-text-secondary)", lineHeight: 1.5,
                              }}>
                                {r.heading}
                              </div>
                            )}
                          </div>
                          <span style={{
                            fontSize: 16, color: "var(--ambo-text-muted)",
                            transition: "transform 200ms var(--ambo-ease)",
                            transform: bodyOpen ? "rotate(90deg)" : "rotate(0deg)",
                            flexShrink: 0,
                          }}>›</span>
                        </div>

                        <SlideReveal open={bodyOpen}>
                          <div style={{ height: 1, background: "var(--ambo-rule-subtle)" }} />
                          <div style={{ padding: "26px 24px 28px" }}>
                            {paragraphs.map((para, i) => (
                              <p key={i} style={{
                                fontFamily: "var(--ambo-font-reading)", fontSize: 17,
                                lineHeight: 2.05, color: "var(--ambo-text-primary)",
                                margin: `0 0 ${i < paragraphs.length - 1 ? 16 : 0}px`,
                              }}>
                                {para.replace(/\n/g, " ").trim()}
                              </p>
                            ))}
                          </div>
                        </SlideReveal>
                      </section>
                    );
                  })}

                  {/* Unavailable fallback card */}
                  {noReadings && (
                    <div className="glass-card" style={{
                      padding: "28px 24px",
                      fontFamily: "var(--ambo-font-reading)",
                      fontSize: 14, fontStyle: "italic",
                      color: "var(--ambo-text-muted)",
                    }}>
                      You can still write your reflection below — readings will appear when they become available.
                    </div>
                  )}
                </div>

                {/* ── Right column: writing card ──────────────────────── */}
                <div>
                  {/* Writing panel — dormant matches Notes panel; lifts on active */}
                  <div
                    ref={writingCardRef}
                    className="ambo-write-panel"
                    style={{
                      minHeight: minWritingCardHeight > 0 ? minWritingCardHeight : undefined,
                      display: "flex", flexDirection: "column",
                      position: "relative",
                      border: "1px solid var(--ambo-border)",
                      borderRadius: 14,
                      background: isActive ? "var(--ambo-surface)" : "transparent",
                      backdropFilter: isActive ? "blur(24px) saturate(1.4)" : "none",
                      WebkitBackdropFilter: isActive ? "blur(24px) saturate(1.4)" : "none",
                      boxShadow: isActive ? "var(--ambo-shadow-sm)" : "none",
                      opacity: isActive ? 1 : 0.68,
                      transition: "background 2000ms cubic-bezier(0.4, 0, 0.2, 1), box-shadow 2000ms cubic-bezier(0.4, 0, 0.2, 1), opacity 2000ms cubic-bezier(0.4, 0, 0.2, 1)",
                      padding: "32px 40px 48px",
                    }}
                  >
                      {/* Italic display title */}
                      <div style={{
                        fontFamily: "var(--ambo-font-reading)",
                        fontSize: "clamp(18px, 2vw, 26px)",
                        fontStyle: "italic", fontWeight: 400,
                        letterSpacing: "-0.01em", lineHeight: 1.25,
                        color: isActive
                          ? "var(--ambo-text-primary)"
                          : "var(--ambo-text-muted)",
                        transition: "color 2000ms cubic-bezier(0.4, 0, 0.2, 1)",
                        marginBottom: 20,
                        minHeight: 30,
                      }}>
                        {readingsLoading ? " " : (dayTitle || " ")}
                      </div>

                      {/* Divider */}
                      <div style={{
                        height: 1,
                        background: "var(--ambo-rule-subtle)",
                        marginBottom: 28,
                      }} />

                      {/* Writing surface — panel-breathing pattern (variant 5).
                          BreathingPanel eases its height toward the textarea's
                          reported height; the textarea itself is inert. The
                          `transition: "none"` override during external loads
                          (snapPanel === true) skips the 2000ms ease so the
                          panel doesn't animate between unrelated date contents. */}
                      <BreathingPanel
                        height={noteHeight}
                        transition={isExternalLoad ? "none" : undefined}
                      >
                        <TextareaAutosize
                          ref={textareaRef}
                          value={noteContent}
                          onChange={(e) => handleContentChange(e.target.value)}
                          onHeightChange={setNoteHeight}
                          minRows={2}
                          placeholder="Begin writing…"
                          style={{
                            width: "100%",
                            border: "none", background: "transparent",
                            resize: "none", outline: "none", overflow: "hidden",
                            padding: 0,
                            fontFamily: "var(--ambo-font-reading)",
                            fontSize: "clamp(15px, 1.5vw, 17px)",
                            lineHeight: 1.85,
                            color: noteContent.trim()
                              ? "var(--ambo-text-primary)"
                              : "var(--ambo-text-muted)",
                            caretColor: "var(--ambo-accent)",
                            transition: "color 0.35s",
                            boxSizing: "border-box",
                            verticalAlign: "top",
                          }}
                          spellCheck
                          autoCapitalize="sentences"
                        />
                      </BreathingPanel>

                      {/* Word count — absolutely positioned so it never affects card height */}
                      <div style={{
                        position: "absolute",
                        bottom: 16,
                        left: 0,
                        right: 0,
                        textAlign: "center",
                        fontSize: 12,
                        color: "var(--ambo-text-muted)",
                        opacity: wordCount >= 1 ? 0.7 : 0,
                        transition: "opacity 2000ms cubic-bezier(0.4, 0, 0.2, 1)",
                        pointerEvents: "none",
                      }}>
                        {wordCount >= 1 && (
                          <>
                            {wordCount} {wordCount === 1 ? "word" : "words"}
                            {wordCount >= 30 && ` · ~${estimatedMinutes} min`}
                          </>
                        )}
                      </div>

                  </div>
                </div>

              </div>
            </div>
          )}
        </div>

        {/* ── Attribution footer — always visible at overlay bottom, matches Sunday page ── */}
        {(() => {
          const attributionSource = (lectionaryFamily === "us_nab" && !usFeastSubstitution) ? "evangelizo" : "universalis";
          const attr = SOURCE_ATTRIBUTION[attributionSource];
          return (
            <footer style={{
              flexShrink: 0, padding: "10px 24px", textAlign: "center",
            }}>
              <p style={{
                fontSize: 11, color: "var(--ambo-text-muted)",
                letterSpacing: "0.02em", margin: 0,
              }}>
                Scripture readings provided by{" "}
                <a
                  href={attr.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: "var(--ambo-accent)", textDecoration: "none" }}
                >
                  {attr.name}
                </a>
              </p>
            </footer>
          );
        })()}
      </div>

      {/* ── Immersive Exit pill — rendered at overlay level (not inside DailyPreachPanel)
           so position:fixed is relative to viewport with no stacking-context issues ── */}
      {mode === "preach" && headerHidden && (
        <div style={{
          position: "fixed",
          top: "calc(20px + env(safe-area-inset-top))",
          left: 20,
          zIndex: 201,
        }}>
          <PillButton
            variant="ghost"
            className="daily-exit-pulse"
            onClick={() => {
              setHeaderHidden(false);
              setImmersiveVersion(v => v + 1);
            }}
            icon={
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }}>
                <polyline points="10,3 4,8 10,13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            }
            style={{ height: 34, padding: "0 14px" }}
          >
            Exit
          </PillButton>
        </div>
      )}

      {/* word count is now rendered inside the writing card */}

      {/* ── Unsaved-edits guard modal ────────────────────────────────────── */}
      {unsavedGuard && (
        <>
          <div onClick={guardCancel} style={{
            position: "fixed", inset: 0,
            background: "rgba(15, 20, 30, 0.45)",
            backdropFilter: "blur(3px)", WebkitBackdropFilter: "blur(3px)",
            zIndex: 300,
          }} />
          <div role="dialog" aria-modal="true" aria-labelledby="daily-guard-title" style={{
            position: "fixed", inset: 0, margin: "auto", height: "fit-content",
            zIndex: 301, background: "var(--ambo-bg)",
            border: "1px solid var(--ambo-border)", borderRadius: 18,
            boxShadow: "var(--ambo-shadow-md)", padding: "28px 28px 24px",
            width: "min(360px, 90vw)",
          }}>
            <p id="daily-guard-title" style={{
              fontFamily: "var(--ambo-font-reading)", fontSize: 16,
              fontStyle: "italic", color: "var(--ambo-text-primary)",
              margin: "0 0 8px", lineHeight: 1.35,
            }}>
              You have unsaved notes.
            </p>
            <p style={{
              fontSize: 13, color: "var(--ambo-text-secondary)",
              lineHeight: 1.55, margin: "0 0 24px",
            }}>
              Save before leaving, or discard your changes.
            </p>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={guardCancel} style={guardBtnStyle}>Cancel</button>
              <button onClick={guardDiscard} style={guardBtnStyle}>Discard</button>
              <button onClick={guardSave} style={guardSaveBtnStyle}>Save</button>
            </div>
          </div>
        </>
      )}
    </>
  );
}

// ── Guard modal button styles ─────────────────────────────────────────────────
const guardBtnStyle: CSSProperties = {
  border: "1px solid var(--ambo-border)", background: "transparent",
  color: "var(--ambo-text-secondary)", cursor: "pointer",
  padding: "9px 16px", borderRadius: 100,
  fontSize: 13, fontWeight: 500, fontFamily: "inherit",
};
const guardSaveBtnStyle: CSSProperties = {
  border: "none", background: "var(--ambo-accent)", color: "white", cursor: "pointer",
  padding: "9px 20px", borderRadius: 100,
  fontSize: 13, fontWeight: 600, fontFamily: "inherit",
};

