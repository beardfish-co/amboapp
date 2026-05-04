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
import { renderInline } from "@/lib/inline-markdown";
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

// ── Preach block types + parsing (mirrors PreachView) ────────────────────────
type Block =
  | { kind: "body";   text: string }
  | { kind: "breath" }
  | { kind: "quote";  text: string; citation?: string };

function parseBlocks(text: string): Block[] {
  return text
    .split("\n\n")
    .map((b) => b.replace(/[ \t]+$|^[ \t]+/g, ""))
    .map((b): Block => {
      if (b === "") return { kind: "breath" };
      const lines = b.split("\n");
      if (lines.some((l) => l.startsWith("> "))) {
        let citation: string | undefined;
        if (lines.length > 0 && /^—\s+/.test(lines[lines.length - 1])) {
          citation = lines[lines.length - 1].replace(/^—\s+/, "").trim();
          lines.pop();
        }
        const quoteText = lines.map((l) => l.replace(/^>\s?/, "")).join("\n").trim();
        return { kind: "quote", text: quoteText, citation };
      }
      return { kind: "body", text: b };
    });
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

  // ── autosizeTextarea — pins current px height, measures target via height:auto,
  // restores current, then sets target on the next animation frame so the CSS
  // height transition has two real pixel values to animate between.
  // This is called on every noteContent change (typing AND external loads).
  const autosizeTextarea = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    const current = ta.getBoundingClientRect().height;
    ta.style.height = "auto";
    const target = ta.scrollHeight;
    ta.style.height = `${current}px`;
    requestAnimationFrame(() => { ta.style.height = `${target}px`; });
  }, []);

  useEffect(() => { autosizeTextarea(); }, [noteContent, autosizeTextarea]);

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

                      {/* Writing surface — auto-sizes via ref */}
                      <textarea
                        ref={textareaRef}
                        value={noteContent}
                        onChange={(e) => handleContentChange(e.target.value)}
                        placeholder="Begin writing…"
                        style={{
                          width: "100%",
                          minHeight: 60,
                          border: "none", background: "transparent",
                          resize: "none", outline: "none", overflow: "hidden",
                          fontFamily: "var(--ambo-font-reading)",
                          fontSize: "clamp(15px, 1.5vw, 17px)",
                          lineHeight: 1.85,
                          color: noteContent.trim()
                            ? "var(--ambo-text-primary)"
                            : "var(--ambo-text-muted)",
                          caretColor: "var(--ambo-accent)",
                          transition: "height 2500ms cubic-bezier(0.16, 1, 0.3, 1), color 0.35s",
                          boxSizing: "border-box",
                        } as CSSProperties}
                        spellCheck
                        autoCapitalize="sentences"
                      />

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

// ── Preach-mode font button style (mirrors PreachView) ────────────────────────
const preachFontBtnStyle: CSSProperties = {
  border: "1px solid var(--ambo-border)", background: "transparent",
  color: "var(--ambo-text-muted)", fontSize: 13, fontWeight: 600,
  padding: "4px 10px", borderRadius: 8, cursor: "pointer",
  fontFamily: "inherit", lineHeight: 1,
};

const stepBtnStyle = (disabled: boolean): CSSProperties => ({
  border: "1px solid " + (disabled ? "var(--ambo-border)" : "var(--ambo-accent)"),
  background: "transparent",
  color: disabled ? "var(--ambo-text-muted)" : "var(--ambo-accent)",
  fontSize: 14, fontWeight: 500, padding: "10px 22px", borderRadius: 100,
  cursor: disabled ? "default" : "pointer", fontFamily: "inherit",
  opacity: disabled ? 0.4 : 1, transition: "all 0.15s",
});

// ── DailyPreachPanel — full Sunday Preach chrome for Daily ───────────────────
interface DailyPreachPanelProps {
  content: string;
  title: string;
  onScrollLock: (locked: boolean, isScrollMode?: boolean) => void;
  /** Returns to Daily Write */
  onBack: () => void;
  /** Incremented by DailyMassView when the overlay-level Exit pill fires */
  immersiveVersion: number;
  /** True when viewport ≥ 1280px — controls bar stays visible, no immersive collapse */
  isDesktop: boolean;
}
function DailyPreachPanel({ content, title, onScrollLock, onBack, immersiveVersion, isDesktop }: DailyPreachPanelProps) {
  const [fontSize, setFontSize]             = useState(24);
  const [currentBlock, setCurrentBlock]     = useState(0);
  const [blocks, setBlocks]                 = useState<Block[]>(() => parseBlocks(content));
  const [isScrollMode, setIsScrollMode]     = useState(true);
  const [committedMode, setCommittedMode]   = useState<null | "scroll" | "step">(null);
  const [isPhone, setIsPhone]               = useState(false);
  const [stepContainerH, setStepContainerH] = useState(400);
  const stepContainerRef = useRef<HTMLDivElement>(null);
  const blockRefsArr     = useRef<(HTMLDivElement | null)[]>([]);
  const isFirstStep      = useRef(true);

  const maxFontSize    = isPhone ? 28 : 36;
  const hasContent     = content.trim().length > 0;
  const displayFontSize = Math.min(fontSize, maxFontSize);

  // Update blocks when content changes (priest switches to Preach tab)
  useEffect(() => {
    setBlocks(parseBlocks(content));
    setCurrentBlock(0);
    setCommittedMode(null);
    onScrollLock(false);
    isFirstStep.current = true;
  }, [content]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reset committed mode when DailyMassView overlay fires its Exit pill
  useEffect(() => {
    if (immersiveVersion === 0) return; // skip on mount
    setCommittedMode(null);
    setIsScrollMode(true);
    isFirstStep.current = true;
  }, [immersiveVersion]); // eslint-disable-line react-hooks/exhaustive-deps

  // Detect phone viewport
  useEffect(() => {
    const check = () => setIsPhone(window.innerWidth < 640);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // Smooth sine scroll
  const smoothScrollTo = (el: HTMLElement, to: number, dur: number) => {
    const from = el.scrollTop;
    const delta = to - from;
    if (Math.abs(delta) < 1) return;
    const start = performance.now();
    const ease  = (t: number) => -(Math.cos(Math.PI * t) - 1) / 2;
    const tick  = (now: number) => {
      const t = Math.min((now - start) / dur, 1);
      el.scrollTop = from + delta * ease(t);
      if (t < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };

  // Centre active block in step mode
  useEffect(() => {
    if (isScrollMode) return;
    const block     = blockRefsArr.current[currentBlock];
    const container = stepContainerRef.current;
    if (!block || !container) return;
    const cRect = container.getBoundingClientRect();
    const bRect = block.getBoundingClientRect();
    const target = block.clientHeight > container.clientHeight
      ? container.scrollTop + (bRect.top - cRect.top) - 16
      : container.scrollTop + (bRect.top + bRect.height / 2) - (cRect.top + cRect.height / 2);
    if (isFirstStep.current) {
      container.scrollTop = target;
      isFirstStep.current = false;
    } else {
      smoothScrollTo(container, target, 650);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentBlock, isScrollMode]);

  // Prevent scroll hijack in step mode
  useEffect(() => {
    if (isScrollMode) return;
    const el = stepContainerRef.current;
    const preventWheel = (e: WheelEvent)  => e.preventDefault();
    const preventTouch = (e: TouchEvent)  => e.preventDefault();
    if (el) el.addEventListener("wheel", preventWheel, { passive: false });
    document.addEventListener("touchmove", preventTouch, { passive: false });
    return () => {
      if (el) el.removeEventListener("wheel", preventWheel);
      document.removeEventListener("touchmove", preventTouch);
    };
  }, [isScrollMode]);

  // Track step container height
  useEffect(() => {
    if (isScrollMode) return;
    const el = stepContainerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setStepContainerH(el.clientHeight));
    ro.observe(el);
    setStepContainerH(el.clientHeight);
    return () => ro.disconnect();
  }, [isScrollMode]);

  return (
    <div
      className="view-fade preach-print-root"
      style={{
        maxWidth: 840, margin: "0 auto",
        padding: isScrollMode ? "36px 20px 80px" : "36px 20px 0",
        ...(isScrollMode ? {} : { flex: 1, minHeight: 0, display: "flex", flexDirection: "column" as const }),
        ["--print-font-size" as string]: `${displayFontSize}px`,
      }}
    >
      {/* ── Controls bar — always visible in all modes (default, Scroll, Step) ── */}
      <div className="preach-controls" style={{
        display: "flex", alignItems: "center",
        justifyContent: "space-between",
        marginBottom: 20, gap: 16,
      }}>
        {/* Left: Exit | Scroll | Step */}
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {/* Back — always visible, always returns to Daily Write */}
          <PillButton
            variant="ghost"
            onClick={onBack}
            icon={
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }}>
                <polyline points="10,3 4,8 10,13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            }
            style={{ height: 34, padding: "0 14px" }}
          >
            Back
          </PillButton>
          <PillButton
            variant={isScrollMode && committedMode !== null ? "active" : "ghost"}
            onClick={() => { setIsScrollMode(true); setCommittedMode("scroll"); onScrollLock(true, true); }}
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
              ...(isScrollMode && committedMode !== null ? { border: "1px solid rgba(74,111,165,0.45)", background: "var(--ambo-accent-faint)" } : {}),
            }}
          >
            Scroll
          </PillButton>
          <PillButton
            variant={!isScrollMode && committedMode !== null ? "active" : "ghost"}
            onClick={() => { setIsScrollMode(false); setCurrentBlock(0); isFirstStep.current = true; setCommittedMode("step"); onScrollLock(true, false); }}
            icon={
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }}>
                <polyline points="3.5,4 9,8 3.5,12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                <line x1="12.5" y1="4" x2="12.5" y2="12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
              </svg>
            }
            style={{
              height: 34, padding: "0 14px",
              ...(!isScrollMode && committedMode !== null ? { border: "1px solid rgba(74,111,165,0.45)", background: "var(--ambo-accent-faint)" } : {}),
            }}
          >
            Step
          </PillButton>
        </div>

        {/* Right: A / A / Print */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button onClick={() => setFontSize(f => Math.max(18, f - 2))} style={preachFontBtnStyle} title="Smaller">A</button>
          <button onClick={() => setFontSize(f => Math.min(maxFontSize, f + 2))} style={{ ...preachFontBtnStyle, fontSize: 18 }} title="Larger">A</button>
          <PillButton
            variant="ghost"
            onClick={() => window.print()}
            title="Print or save as PDF"
            className="preach-print-btn"
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

      {/* ── Scroll mode ──────────────────────────────────────────────────── */}
      {isScrollMode && (
        <div className="glass-card" style={{ padding: "56px 28px", marginBottom: 40 }}>
          {title && (
            <p style={{
              fontFamily: "var(--ambo-font-reading)",
              fontSize: 24, fontStyle: "italic", fontWeight: 400,
              letterSpacing: "-0.01em", lineHeight: 1.3,
              color: "var(--ambo-text-primary)", marginBottom: 32,
            }}>
              {title}
            </p>
          )}
          {!hasContent ? (
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              minHeight: 180,
            }}>
              <p style={{
                fontFamily: "var(--ambo-font-reading)", fontSize: 17,
                fontStyle: "italic", color: "var(--ambo-text-muted)", opacity: 0.6,
                margin: 0,
              }}>
                No reflection written yet.
              </p>
            </div>
          ) : (
            <div>
              {blocks.map((block, i) => {
                if (block.kind === "quote")  return <DailyQuoteBlock key={i} block={block} fontSize={displayFontSize} />;
                if (block.kind === "breath") return <div key={i} aria-hidden style={{ height: "1.8em", marginBottom: "1.6em" }} />;
                return (
                  <p key={i} style={{
                    fontFamily: "var(--ambo-font-reading)", fontSize: displayFontSize,
                    lineHeight: "var(--ambo-lh-reading)", color: "var(--ambo-text-primary)",
                    marginBottom: "2em", letterSpacing: "0.01em", whiteSpace: "pre-wrap",
                  }}>
                    {renderInline(block.text)}
                  </p>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Step mode ────────────────────────────────────────────────────── */}
      {!isScrollMode && (() => {
        const stepBlocks = blocks.filter(
          (b): b is Extract<Block, { kind: "body" | "quote" }> => b.kind !== "breath",
        );
        if (stepBlocks.length === 0) {
          return (
            <div className="glass-card" style={{ padding: "56px 28px" }}>
              {title && (
                <p style={{
                  fontFamily: "var(--ambo-font-reading)", fontSize: 24,
                  fontStyle: "italic", fontWeight: 400, color: "var(--ambo-text-primary)",
                  marginBottom: 32,
                }}>
                  {title}
                </p>
              )}
              <p style={{
                fontFamily: "var(--ambo-font-reading)", fontSize: 17,
                fontStyle: "italic", color: "var(--ambo-text-muted)", opacity: 0.6,
              }}>
                No reflection written yet.
              </p>
            </div>
          );
        }
        const safeIdx = Math.min(currentBlock, stepBlocks.length - 1);
        const halfH   = Math.round(stepContainerH / 2);

        return (
          <div className="glass-card" style={{
            flex: 1, display: "flex", flexDirection: "column", minHeight: 0,
            overflow: "hidden", padding: 0,
          }}>
            {title && (
              <p style={{
                fontSize: 12, fontWeight: 700, letterSpacing: "0.06em",
                textTransform: "uppercase", color: "var(--ambo-text-muted)",
                margin: 0, padding: "20px 28px 0", flexShrink: 0,
              }}>
                {title}
              </p>
            )}

            <div
              ref={stepContainerRef}
              style={{ flex: 1, minHeight: 0, overflowY: "scroll", scrollbarWidth: "none" }}
              className="step-scroll-container"
            >
              <div style={{ padding: `${halfH}px 28px` }}>
                {stepBlocks.map((block, i) => {
                  const dist    = Math.abs(i - safeIdx);
                  const opacity = dist === 0 ? 1 : dist === 1 ? 0.5 : dist === 2 ? 0.22 : 0.06;
                  return (
                    <div
                      key={i}
                      ref={(el) => { blockRefsArr.current[i] = el; }}
                      style={{
                        opacity,
                        transition: "opacity 0.7s ease",
                        marginBottom: i < stepBlocks.length - 1 ? 48 : 0,
                        pointerEvents: i === safeIdx ? undefined : "none",
                      }}
                    >
                      {block.kind === "quote" ? (
                        <DailyQuoteBlock block={block} fontSize={displayFontSize} />
                      ) : (
                        <p style={{
                          fontFamily: "var(--ambo-font-reading)", fontSize: displayFontSize,
                          lineHeight: "var(--ambo-lh-reading)", color: "var(--ambo-text-primary)",
                          letterSpacing: "0.01em", whiteSpace: "pre-wrap", margin: 0,
                        }}>
                          {renderInline(block.text)}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Navigation bar */}
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "16px 28px 24px", flexShrink: 0,
              borderTop: "1px solid var(--ambo-border)",
            }}>
              <button
                onClick={() => setCurrentBlock(c => Math.max(0, c - 1))}
                disabled={safeIdx === 0}
                style={stepBtnStyle(safeIdx === 0)}
              >
                ← Previous
              </button>
              <span style={{ fontSize: 13, color: "var(--ambo-text-muted)" }}>
                {safeIdx + 1} of {stepBlocks.length}
              </span>
              <button
                onClick={() => setCurrentBlock(c => Math.min(stepBlocks.length - 1, c + 1))}
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
  );
}

// ── Quote block (mirrors PreachView's QuoteDisplay) ────────────────────────
function DailyQuoteBlock({
  block, fontSize,
}: { block: Extract<Block, { kind: "quote" }>; fontSize: number }) {
  return (
    <div style={{
      margin: "0 0 1.6em",
      borderLeft: "3px solid var(--ambo-accent)",
      paddingLeft: 18, paddingTop: 4, paddingBottom: 4,
    }}>
      <p style={{
        fontFamily: "var(--ambo-font-reading)", fontSize,
        lineHeight: "var(--ambo-lh-reading)", color: "var(--ambo-text-primary)",
        letterSpacing: "0.01em", fontStyle: "italic", margin: 0, whiteSpace: "pre-wrap",
      }}>
        {renderInline(block.text)}
      </p>
      {block.citation && (
        <div style={{
          marginTop: 10, fontSize: Math.max(13, Math.round(fontSize * 0.6)),
          color: "var(--ambo-text-muted)", fontStyle: "normal", letterSpacing: "0.01em",
        }}>
          — {block.citation}
        </div>
      )}
    </div>
  );
}
