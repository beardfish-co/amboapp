"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { selectPrompts, detectSeason } from "@/lib/prompts";
import type { CatenaBlock } from "@/lib/catena";
import { SlideReveal } from "@/lib/ui/slide-reveal";
import { PillButton } from "@/lib/ui/pill-button";
import { StackIcon, CalendarIcon } from "@/lib/ui/icons";
import { loadReadings, type ReadingsStatus } from "@/lib/readings";

interface Reading {
  id: string;
  title: string;
  reference: string;
  heading: string;
  text: string;
}

interface DayReadings {
  date: string;
  dayName: string;
  readings: Reading[];
}

interface ReflectViewProps {
  currentId: string | null;
  onOpenList: () => void;
  onGoWrite: () => void;
}

type ReadingSlot = "r1" | "ps" | "r2" | "gospel";

function isReadingSlot(id: string): id is ReadingSlot {
  return id === "r1" || id === "ps" || id === "r2" || id === "gospel";
}

// AI-generated prompt shape from /api/reflect-prompts. The `basis` line is
// rendered under the prompt as an italic sub-note ("drawn from ..."). `mood`
// and `pressure` are the generator's hidden textual reasoning; they're not
// shown but travel with the payload so we can inspect them in dev tools.
interface AiPrompt {
  prompt: string;
  basis: string;
  mood: string;
  pressure: string;
}
type AiPromptSet = Record<ReadingSlot, AiPrompt[]>;

function splitReadingParagraphs(text: string): string[] {
  return text
    .split(/\n\s*\n+/)
    .map((p) => p.trim())
    .filter(Boolean);
}

function fmtSundayShort(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso + "T12:00:00");
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function ReflectView({
  currentId,
  onOpenList,
  onGoWrite,
}: ReflectViewProps) {
  const [sundayDate, setSundayDate] = useState<string | null>(null);
  const [title, setTitle] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [readings, setReadings] = useState<DayReadings | null>(null);
  const [loading, setLoading] = useState(true);
  const [readingsLoading, setReadingsLoading] = useState(false);
  const [readingsStatus, setReadingsStatus] = useState<ReadingsStatus>("unavailable");
  // Today's weekday readings — shown below the Sunday set when today isn't Sunday.
  const [todayReadings, setTodayReadings] = useState<DayReadings | null>(null);
  const [showTodayReadings, setShowTodayReadings] = useState<boolean>(false);
  const [todayOpenBodies, setTodayOpenBodies] = useState<Set<string>>(new Set());
  const [expandedSlot, setExpandedSlot] = useState<string | null>(null);
  const [aiPromptsData, setAiPromptsData] = useState<{ date: string; data: AiPromptSet } | null>(null);
  // Stale-guard: prompts only surface if they were generated for the Sunday
  // currently being viewed. Otherwise the render falls back to the
  // deterministic prompt bank until the fresh fetch lands.
  const aiPrompts: AiPromptSet | null =
    aiPromptsData && aiPromptsData.date === sundayDate ? aiPromptsData.data : null;
  // Which reading cards are expanded (body shown). Default: gospel open.
  const [openBodies, setOpenBodies] = useState<Set<string>>(new Set(["gospel"]));
  const [fathersExpanded, setFathersExpanded] = useState<boolean>(false);
  const [catenaBlocks, setCatenaBlocks] = useState<CatenaBlock[] | null>(null);
  const [catenaLoading, setCatenaLoading] = useState<boolean>(false);
  // Seed — the Directory's "one principal grace" externalised as 4 lines
  const [seed, setSeed] = useState<string>("");
  const [seedWhyNow, setSeedWhyNow] = useState<string>("");
  const [seedEucharist, setSeedEucharist] = useState<string>("");
  const [seedResponse, setSeedResponse] = useState<string>("");
  const [seedExpanded, setSeedExpanded] = useState<boolean>(false);
  const [notesOpenMobile, setNotesOpenMobile] = useState(false);
  const [lastAdded, setLastAdded] = useState<string | null>(null);

  const loadedIdRef = useRef<string | null | undefined>(undefined);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Per-column debounced save timers — used by seed fields and any future single-column saves
  const fieldTimerRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const draftIdRef = useRef<string | null>(null);
  const notesRef = useRef<HTMLTextAreaElement | null>(null);
  const threadRef = useRef<HTMLTextAreaElement | null>(null);

  // Load the homily (sunday_date, notes, title) for currentId
  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      setExpandedSlot(null);

      let loadedSunday: string | null = null;
      let loadedNotes = "";
      let loadedTitle = "";
      let loadedSeed = "";
      let loadedSeedWhy = "";
      let loadedSeedEu = "";
      let loadedSeedResp = "";

      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (user && currentId) {
          const { data } = await supabase
            .from("homilies")
            .select("title, notes, sunday_date, seed, seed_why_now, seed_eucharist, seed_response")
            .eq("id", currentId)
            .eq("user_id", user.id)
            .single();
          if (data) {
            loadedTitle = data.title ?? "";
            loadedNotes = data.notes ?? "";
            loadedSunday = (data.sunday_date as string | null) ?? null;
            loadedSeed = (data.seed as string | null) ?? "";
            loadedSeedWhy = (data.seed_why_now as string | null) ?? "";
            loadedSeedEu = (data.seed_eucharist as string | null) ?? "";
            loadedSeedResp = (data.seed_response as string | null) ?? "";
          }
        } else if (user && !currentId) {
          const { data } = await supabase
            .from("homilies")
            .select("id, title, notes, sunday_date, seed, seed_why_now, seed_eucharist, seed_response")
            .eq("user_id", user.id)
            .order("updated_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (data) {
            loadedTitle = data.title ?? "";
            loadedNotes = data.notes ?? "";
            loadedSunday = (data.sunday_date as string | null) ?? null;
            loadedSeed = (data.seed as string | null) ?? "";
            loadedSeedWhy = (data.seed_why_now as string | null) ?? "";
            loadedSeedEu = (data.seed_eucharist as string | null) ?? "";
            loadedSeedResp = (data.seed_response as string | null) ?? "";
          }
        }
      } catch {
        /* ignore; show empty state */
      }

      if (cancelled) return;
      setTitle(loadedTitle);
      setNotes(loadedNotes);
      setSundayDate(loadedSunday);
      setSeed(loadedSeed);
      setSeedWhyNow(loadedSeedWhy);
      setSeedEucharist(loadedSeedEu);
      setSeedResponse(loadedSeedResp);
      // open the seed panel automatically only if the priest has started writing one
      setSeedExpanded(Boolean(loadedSeedWhy || loadedSeedEu || loadedSeedResp));
      loadedIdRef.current = currentId ?? null;
      draftIdRef.current = currentId ?? null;
      setLoading(false);
    })();

    return () => { cancelled = true; };
  }, [currentId]);

  // Fetch readings when sundayDate changes.
  // Prefer the homily's readings_snapshot (archival durability) and fall back
  // to Universalis; see lib/readings.ts for the full policy.
  useEffect(() => {
    if (!sundayDate) {
      setReadings(null);
      setReadingsStatus("unavailable");
      return;
    }
    let cancelled = false;
    setReadingsLoading(true);
    (async () => {
      const { payload, status } = await loadReadings(sundayDate, currentId);
      if (cancelled) return;
      setReadingsStatus(status);
      if (payload) {
        setReadings(payload);
        // Default: gospel open, others closed. Priest can expand as needed.
        setOpenBodies(new Set(["gospel"]));
      }
      setReadingsLoading(false);
    })();
    return () => { cancelled = true; };
  }, [sundayDate, currentId]);

  // Fetch AI-generated reflective prompts for this Sunday. One call per day,
  // shared across all priests (cached server-side in day_prompts). On failure
  // we leave aiPrompts null and the render falls back to the deterministic
  // prompt bank (selectPrompts from lib/prompts).
  useEffect(() => {
    if (!sundayDate) return;
    const targetDate = sundayDate;
    let cancelled = false;
    (async () => {
      try {
        const resp = await fetch(`/api/reflect-prompts?date=${targetDate}`, {
          cache: "no-store",
        });
        if (!resp.ok) return;
        const data = (await resp.json()) as { prompts: AiPromptSet | null };
        if (cancelled) return;
        if (data.prompts) setAiPromptsData({ date: targetDate, data: data.prompts });
      } catch {
        // Silent fallback — the deterministic prompts still render.
      }
    })();
    return () => { cancelled = true; };
  }, [sundayDate]);

  // Fetch today's weekday readings (only when today isn't Sunday).
  // Kept separate from the Sunday fetch so the Sunday homily prep doesn't
  // wait on the weekday lookup.
  useEffect(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const isSunday = today.getDay() === 0;
    if (isSunday) {
      setTodayReadings(null);
      return;
    }
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, "0");
    const d = String(today.getDate()).padStart(2, "0");
    const todayIso = `${y}-${m}-${d}`;
    let cancelled = false;
    (async () => {
      const { payload } = await loadReadings(todayIso);
      if (!cancelled && payload) setTodayReadings(payload);
    })();
    return () => { cancelled = true; };
  }, []);

  // Fetch Catena Aurea when the Gospel reading arrives
  useEffect(() => {
    if (!readings) {
      setCatenaBlocks(null);
      return;
    }
    const gospel = readings.readings.find((r) => r.id === "gospel");
    if (!gospel || !gospel.reference) {
      setCatenaBlocks(null);
      return;
    }
    let cancelled = false;
    setCatenaLoading(true);
    setCatenaBlocks(null);
    setFathersExpanded(false);
    (async () => {
      try {
        const res = await fetch(`/api/catena?ref=${encodeURIComponent(gospel.reference)}`);
        if (!res.ok) return;
        const d: { blocks?: CatenaBlock[] } = await res.json();
        if (!cancelled) setCatenaBlocks(d.blocks ?? []);
      } catch {
        /* no catena available — gracefully absent */
      } finally {
        if (!cancelled) setCatenaLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [readings]);

  // Persist notes (debounced, 1.2s)
  const saveNotes = useCallback((value: string) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const id = draftIdRef.current;
        if (!id) return; // no homily yet — Write view creates rows
        await supabase
          .from("homilies")
          .update({ notes: value })
          .eq("id", id)
          .eq("user_id", user.id);
      } catch {
        /* ignore */
      }
    }, 1200);
  }, []);

  // Generic per-column debounced save (used for seed fields).
  const saveField = useCallback((column: string, value: string) => {
    const timers = fieldTimerRef.current;
    const existing = timers.get(column);
    if (existing) clearTimeout(existing);
    const t = setTimeout(async () => {
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const id = draftIdRef.current;
        if (!id) return;
        await supabase
          .from("homilies")
          .update({ [column]: value })
          .eq("id", id)
          .eq("user_id", user.id);
      } catch {
        /* ignore */
      } finally {
        timers.delete(column);
      }
    }, 1200);
    timers.set(column, t);
  }, []);

  // Auto-size the notes textarea whenever notes loads from DB
  useEffect(() => {
    const el = notesRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = el.scrollHeight + "px";
  }, [notes]);

  // Collapse sub-questions if the priest clears the thread
  useEffect(() => {
    if (!seed.trim()) setSeedExpanded(false);
  }, [seed]);

  // Auto-size the thread textarea whenever seed changes (handles initial load
  // from DB as well as live typing — the onChange handler covers typing, but
  // the effect catches the first render with a pre-existing thread value).
  useEffect(() => {
    const el = threadRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = el.scrollHeight + "px";
  }, [seed]);

  // Flush any pending save when the component unmounts or id swaps
  useEffect(() => {
    const fieldTimers = fieldTimerRef.current;
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      fieldTimers.forEach((t) => clearTimeout(t));
      fieldTimers.clear();
    };
  }, []);

  const handleNotesChange = (v: string) => {
    setNotes(v);
    saveNotes(v);
  };

  // Append a prompt/quote to notes with attribution
  const appendToNotes = useCallback((sourceTitle: string, text: string) => {
    setNotes((prev) => {
      const prefix = prev.trim().length > 0 ? prev.replace(/\s+$/, "") + "\n\n" : "";
      const block = `— ${sourceTitle}\n${text}\n\n`;
      const next = prefix + block;
      saveNotes(next);
      return next;
    });
    setLastAdded(text);
    setNotesOpenMobile(true);
    setTimeout(() => setLastAdded(null), 2000);
    // Focus the notes pad at the bottom, ready for the priest to type
    setTimeout(() => {
      const el = notesRef.current;
      if (el) {
        el.focus();
        el.setSelectionRange(el.value.length, el.value.length);
        el.scrollTop = el.scrollHeight;
      }
    }, 40);
  }, [saveNotes]);

  const season = detectSeason(readings?.dayName);

  const emptyNoSunday = !sundayDate && !loading;
  // Right column wakes up together: active when either the thread or notes has content
  const discernmentActive = seed.trim().length > 0 || notes.trim().length > 0;

  return (
    <div
      className="reflect-layout"
      style={{
        maxWidth: 1180,
        margin: "0 auto",
        padding: "0 24px 120px",
        display: "grid",
        gridTemplateColumns: "minmax(0, 760fr) minmax(0, 320fr)",
        gap: 32,
        alignItems: "start",
      }}
    >
      {/* Primary column: the readings */}
      <div>
        {/* Top strip — chrome row with My homilies (left) and the Sunday pill (right).
            Matches the chrome row on Write, so the priest feels the same horizon
            whether they're reading or writing. */}
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          marginBottom: 32,
          flexWrap: "wrap",
        }}>
          <PillButton variant="ghost" icon={<StackIcon />} onClick={onOpenList}>
            My homilies
          </PillButton>
          <div style={{ flex: 1 }} />
          {sundayDate ? (
            <PillButton variant="ghost" icon={<CalendarIcon />} onClick={onGoWrite}>
              {readings?.dayName ?? "Readings"} · {fmtSundayShort(sundayDate)}
            </PillButton>
          ) : (
            <PillButton variant="ghost" icon={<CalendarIcon />} onClick={onGoWrite}>
              No Sunday yet
            </PillButton>
          )}
        </div>

        {loading && (
          <div style={{ fontSize: 14, color: "var(--ambo-text-muted)", padding: "40px 0" }}>
            Loading…
          </div>
        )}

        {!loading && emptyNoSunday && (
          <div style={{
            padding: "48px 24px",
            textAlign: "center",
            border: "1px dashed var(--ambo-border)",
            borderRadius: 16,
            background: "var(--ambo-surface)",
            color: "var(--ambo-text-secondary)",
          }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: "var(--ambo-text-primary)", marginBottom: 6 }}>
              Pick a Sunday for this homily
            </div>
            <div style={{ fontSize: 13, color: "var(--ambo-text-muted)", marginBottom: 18, lineHeight: 1.6 }}>
              Set the Sunday in Write (the date pill under the title) and the readings will appear here.
            </div>
            <div style={{ display: "inline-flex", gap: 8 }}>
              <button onClick={onGoWrite} style={btnPrimaryStyle}>Go to Write</button>
              <button onClick={onOpenList} style={btnGhostStyle}>Pick another homily</button>
            </div>
          </div>
        )}

        {!loading && sundayDate && readingsLoading && !readings && (
          <div style={{ fontSize: 14, color: "var(--ambo-text-muted)", padding: "40px 0" }}>
            Loading readings…
          </div>
        )}

        {!loading && sundayDate && !readingsLoading && !readings && readingsStatus === "not_published" && (
          <div className="glass-card" style={{
            padding: "28px 28px 30px",
            marginBottom: 32,
            fontSize: 14,
            lineHeight: 1.6,
            color: "var(--ambo-text-secondary)",
          }}>
            <div style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "var(--ambo-text-muted)",
              marginBottom: 10,
            }}>
              Readings not yet published
            </div>
            <div>
              Universalis publishes readings about nine days ahead. We'll load this Sunday's
              readings automatically as soon as they're available — your seed, notes, and
              title will stay intact in the meantime.
            </div>
          </div>
        )}

        {!loading && sundayDate && !readingsLoading && !readings && readingsStatus === "unavailable" && (
          <div style={{ fontSize: 14, color: "var(--ambo-text-muted)", padding: "40px 0" }}>
            Readings temporarily unavailable. Please try again in a moment.
          </div>
        )}

        {!loading && readings && readings.readings.map((r) => {
          const slot: ReadingSlot | null = isReadingSlot(r.id) ? r.id : null;
          const paragraphs = splitReadingParagraphs(r.text);
          // Prefer AI-generated prompts (text-specific, with sub-note basis);
          // fall back to the deterministic prompt bank when the API path
          // hasn't (yet) returned or when no slot is matched.
          const prompts: AiPrompt[] = slot
            ? (aiPrompts?.[slot] && aiPrompts[slot].length > 0
              ? aiPrompts[slot]
              : selectPrompts(slot, season, `${readings.date}|${r.id}`, 3).map((text) => ({
                  prompt: text,
                  basis: "",
                  mood: "",
                  pressure: "",
                })))
            : [];
          const expanded = expandedSlot === r.id;

          const bodyOpen = openBodies.has(r.id);
          const isGospel = r.id === "gospel";
          const toggleBody = () => {
            setOpenBodies((prev) => {
              const next = new Set(prev);
              if (next.has(r.id)) next.delete(r.id);
              else next.add(r.id);
              return next;
            });
          };

          return (
            <section
              key={r.id}
              className="glass-card reflect-reading-card"
              style={{
                marginBottom: 32,
                overflow: "hidden",
              }}
            >
              {/* Clickable header — title / reference / heading */}
              <div
                role="button"
                tabIndex={0}
                onClick={toggleBody}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    toggleBody();
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
                  {/* Line 1: eyebrow + inline ref chip */}
                  <div>
                    <span style={{
                      fontSize: 11,
                      fontWeight: 700,
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                      color: isGospel ? "var(--ambo-accent)" : "var(--ambo-text-muted)",
                    }}>
                      {r.title}
                    </span>
                    <span style={{
                      fontSize: 12,
                      fontStyle: "italic",
                      color: "var(--ambo-text-muted)",
                      marginLeft: 10,
                    }}>
                      {r.reference}
                    </span>
                  </div>
                  {/* Line 2: italic Newsreader subhead — always visible, reading or closed */}
                  {r.heading && (
                    <div style={{
                      fontFamily: "var(--ambo-font-reading)",
                      fontSize: 13,
                      fontStyle: "italic",
                      color: "var(--ambo-text-secondary)",
                      lineHeight: 1.5,
                    }}>
                      {r.heading}
                    </div>
                  )}
                </div>
                <span
                  aria-hidden="true"
                  style={{
                    fontSize: 16,
                    color: "var(--ambo-text-muted)",
                    transition: "transform 200ms var(--ambo-ease)",
                    transform: bodyOpen ? "rotate(90deg)" : "rotate(0deg)",
                    flexShrink: 0,
                  }}
                >
                  ›
                </span>
              </div>

              <SlideReveal open={bodyOpen}>
                <div style={{ height: 1, background: "var(--ambo-rule-subtle)" }} />
                <div style={{ padding: "26px 24px 28px", animation: "fadeIn 0.15s ease" }}>
                  {/* Reading body — the calmest type on the page. 17/2.05, 28px between paragraphs. */}
                  <div style={{
                    fontFamily: "var(--ambo-font-reading)",
                    fontSize: 17,
                    lineHeight: 2.05,
                    color: "var(--ambo-text-primary)",
                    fontStyle: r.id === "ps" ? "italic" : "normal",
                    whiteSpace: "pre-wrap",
                  }}>
                    {paragraphs.map((para, i) => (
                      <p key={i} style={{ margin: "0 0 28px" }}>{para}</p>
                    ))}
                  </div>

              {/* Discreet affordance row */}
              {prompts.length > 0 && (
                <>
                  <div style={{
                    height: 1,
                    background: "var(--ambo-border)",
                    margin: "20px 0 10px",
                  }} />
                  <button
                    onClick={() => setExpandedSlot(expanded ? null : r.id)}
                    style={affordanceStyle}
                    aria-expanded={expanded}
                  >
                    <span style={{ fontStyle: "italic" }}>reflect</span>
                    <span style={{ fontSize: 10, opacity: 0.6 }}>{expanded ? "–" : "+"}</span>
                  </button>

                  <SlideReveal open={expanded} marginTop={expanded ? 12 : 0}>
                    <div style={{
                      paddingLeft: 12,
                      borderLeft: "2px solid var(--ambo-accent-light)",
                    }}>
                      {prompts.map((p) => (
                        <div key={p.prompt} style={{
                          display: "flex",
                          alignItems: "flex-start",
                          justifyContent: "space-between",
                          gap: 10,
                          padding: "6px 0",
                        }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{
                              fontSize: 14,
                              fontStyle: "italic",
                              color: "var(--ambo-text-secondary)",
                              lineHeight: 1.55,
                            }}>
                              {p.prompt}
                            </div>
                            {p.basis && (
                              <div style={{
                                fontSize: 11,
                                color: "var(--ambo-text-muted)",
                                lineHeight: 1.4,
                                marginTop: 2,
                                opacity: 0.75,
                              }}>
                                {p.basis}
                              </div>
                            )}
                          </div>
                          <button
                            onClick={() => appendToNotes(`${r.title} · ${r.reference}`, p.prompt)}
                            style={sendToNotesStyle}
                            title="Add to your notes"
                          >
                            → note
                          </button>
                        </div>
                      ))}
                    </div>
                  </SlideReveal>
                </>
              )}

              {/* Fathers (Catena Aurea) — Gospel only, discreet affordance */}
              {r.id === "gospel" && catenaBlocks && catenaBlocks.length > 0 && (
                <>
                  <div style={{
                    height: 1,
                    background: "var(--ambo-border)",
                    margin: prompts.length > 0 ? "4px 0 10px" : "20px 0 10px",
                  }} />
                  <button
                    onClick={() => setFathersExpanded((v) => !v)}
                    style={affordanceStyle}
                    aria-expanded={fathersExpanded}
                  >
                    <span style={{ fontStyle: "italic" }}>fathers</span>
                    <span style={{ fontSize: 10, opacity: 0.55 }}>
                      {catenaBlocks.reduce((n, b) => n + b.entries.length, 0)}
                    </span>
                    <span style={{ fontSize: 10, opacity: 0.6 }}>{fathersExpanded ? "–" : "+"}</span>
                  </button>

                  <SlideReveal open={fathersExpanded} marginTop={fathersExpanded ? 12 : 0}>
                    <div style={{
                      paddingLeft: 12,
                      borderLeft: "2px solid var(--ambo-accent-light)",
                    }}>
                      {catenaBlocks.map((block, bi) => (
                        <div key={bi} style={{ marginBottom: bi === catenaBlocks.length - 1 ? 0 : 16 }}>
                          <div style={{
                            fontSize: 11,
                            fontWeight: 600,
                            letterSpacing: "0.04em",
                            textTransform: "uppercase",
                            color: "var(--ambo-text-muted)",
                            marginBottom: 6,
                          }}>
                            v. {block.verseStart}{block.verseEnd !== block.verseStart ? `–${block.verseEnd}` : ""}
                          </div>
                          {block.entries.map((ent, ei) => (
                            <div key={ei} style={{
                              display: "flex",
                              alignItems: "baseline",
                              justifyContent: "space-between",
                              gap: 10,
                              padding: "6px 0",
                            }}>
                              <div style={{
                                fontSize: 13,
                                color: "var(--ambo-text-secondary)",
                                lineHeight: 1.55,
                                flex: 1,
                              }}>
                                <span style={{
                                  fontWeight: 600,
                                  color: "var(--ambo-text-primary)",
                                  marginRight: 6,
                                }}>
                                  {ent.father ?? "—"}
                                </span>
                                {ent.citation && (
                                  <span style={{
                                    fontSize: 11,
                                    color: "var(--ambo-text-muted)",
                                    fontStyle: "italic",
                                    marginRight: 6,
                                  }}>
                                    ({ent.citation})
                                  </span>
                                )}
                                <span style={{ fontStyle: "italic" }}>{ent.text}</span>
                              </div>
                              <button
                                onClick={() => {
                                  const cite = ent.father
                                    ? `${ent.father}${ent.citation ? `, ${ent.citation}` : ""} — ${r.reference}`
                                    : `${r.reference}`;
                                  appendToNotes(cite, ent.text);
                                }}
                                style={sendToNotesStyle}
                                title="Add to your notes"
                              >
                                → note
                              </button>
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  </SlideReveal>
                </>
              )}

              {/* Subtle loading hint for Gospel's fathers (only if fetch is in-flight) */}
              {r.id === "gospel" && catenaLoading && !catenaBlocks && (
                <div style={{
                  marginTop: 12,
                  fontSize: 11,
                  color: "var(--ambo-text-muted)",
                }}>
                  <span style={{ opacity: 0.6 }}>loading patristic commentary…</span>
                </div>
              )}
                </div>
              </SlideReveal>
            </section>
          );
        })}

        {/* ── Today's weekday readings — quiet secondary section below Sunday ──
            Not the Sunday set the priest is preparing; just a prayerful
            ground note for the day itself, collapsed by default. */}
        {todayReadings && todayReadings.readings.length > 0 && (
          <section style={{ marginTop: 16, marginBottom: 24 }}>
            <button
              onClick={() => setShowTodayReadings((v) => !v)}
              style={{
                border: "none",
                background: "transparent",
                padding: "6px 0",
                cursor: "pointer",
                fontFamily: "inherit",
                display: "flex",
                alignItems: "center",
                gap: 8,
                color: "var(--ambo-text-muted)",
              }}
              aria-expanded={showTodayReadings}
            >
              <span style={{
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
              }}>
                Today — {todayReadings.dayName}
              </span>
              <span style={{
                display: "inline-block",
                transform: showTodayReadings ? "rotate(90deg)" : "rotate(0deg)",
                transition: "transform 200ms var(--ambo-ease)",
                fontSize: 11,
                lineHeight: 1,
              }}>
                ›
              </span>
            </button>

            <SlideReveal open={showTodayReadings} marginTop={showTodayReadings ? 16 : 0}>
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {todayReadings.readings.map((r) => {
                  const isOpen = todayOpenBodies.has(r.id);
                  const isGospel = r.id === "gospel";
                  const toggle = () => {
                    setTodayOpenBodies((prev) => {
                      const next = new Set(prev);
                      if (next.has(r.id)) next.delete(r.id);
                      else next.add(r.id);
                      return next;
                    });
                  };
                  return (
                    <section
                      key={r.id}
                      className="glass-card"
                      style={{ overflow: "hidden" }}
                    >
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={toggle}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            toggle();
                          }
                        }}
                        aria-expanded={isOpen}
                        style={{
                          padding: isOpen ? "18px 24px" : "16px 24px",
                          cursor: "pointer",
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "baseline",
                          gap: 16,
                          transition: "padding 200ms var(--ambo-ease)",
                        }}
                      >
                        <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0, flex: 1 }}>
                          <div>
                            <span style={{
                              fontSize: 10,
                              fontWeight: 700,
                              letterSpacing: "0.08em",
                              textTransform: "uppercase",
                              color: isGospel ? "var(--ambo-accent)" : "var(--ambo-text-muted)",
                            }}>
                              {r.title}
                            </span>
                            <span style={{
                              fontSize: 11,
                              fontStyle: "italic",
                              color: "var(--ambo-text-muted)",
                              marginLeft: 10,
                            }}>
                              {r.reference}
                            </span>
                          </div>
                          {r.heading && (
                            <div style={{
                              fontFamily: "var(--ambo-font-reading)",
                              fontSize: 13,
                              fontStyle: "italic",
                              lineHeight: 1.5,
                              color: "var(--ambo-text-secondary)",
                            }}>
                              {r.heading}
                            </div>
                          )}
                        </div>
                        <span style={{
                          display: "inline-block",
                          transform: isOpen ? "rotate(90deg)" : "rotate(0deg)",
                          transition: "transform 200ms var(--ambo-ease)",
                          fontSize: 13,
                          color: "var(--ambo-text-muted)",
                          lineHeight: 1,
                        }}>
                          ›
                        </span>
                      </div>

                      <SlideReveal open={isOpen}>
                        <div style={{
                          height: 1,
                          background: "var(--ambo-border)",
                          margin: "0 24px",
                        }} />
                        <div style={{ padding: "20px 24px 24px" }}>
                          {splitReadingParagraphs(r.text).map((p, i) => (
                            <p key={i} style={{
                              fontFamily: "var(--ambo-font-reading)",
                              fontSize: 16,
                              lineHeight: 1.95,
                              color: "var(--ambo-text-primary)",
                              fontStyle: r.id === "psalm" ? "italic" : "normal",
                              margin: "0 0 22px",
                            }}>
                              {p}
                            </p>
                          ))}
                        </div>
                      </SlideReveal>
                    </section>
                  );
                })}
              </div>
            </SlideReveal>
          </section>
        )}
      </div>

      {/* Right column: Discernment panel + Notes pad */}
      <div
        className="reflect-side"
        style={{
          position: "sticky",
          top: 80,
          alignSelf: "start",
          maxHeight: "calc(100vh - 110px)",
          display: "flex",
          flexDirection: "column",
          gap: 12,
          overflow: "visible",
        }}
      >
        {/* DISCERNMENT panel */}
        <div
          className="reflect-seed glass-card"
          style={{
            background: "var(--ambo-surface)",
            boxShadow: "var(--ambo-shadow-md)",
            overflow: "hidden",
            flexShrink: 0,
            transition: "background 0.4s ease, border-color 0.4s ease",
          }}
        >
          {/* Panel heading */}
          <div style={{
            padding: "14px 18px 12px",
            borderBottom: "1px solid var(--ambo-rule-subtle)",
          }}>
            <span style={{
              fontSize: 13,
              fontWeight: 600,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "var(--ambo-text-secondary)",
            }}>
              Discernment
            </span>
          </div>

          <div style={{ padding: "16px 18px" }}>
            {/* Hinge label */}
            <label style={{
              display: "block",
              fontSize: 11,
              fontStyle: "italic",
              color: "var(--ambo-text-muted)",
              marginBottom: 8,
              lineHeight: 1.4,
            }}>
              What is the one thread I am being given?
            </label>

            {/* Hinge field — italic Newsreader, auto-grows with content */}
            <textarea
              ref={threadRef}
              value={seed}
              onChange={(e) => {
                setSeed(e.target.value);
                saveField("seed", e.target.value);
                // Grow the field instantly as the priest types
                e.target.style.height = "auto";
                e.target.style.height = e.target.scrollHeight + "px";
              }}
              placeholder="A thread, when one has come."
              disabled={!currentId}
              rows={1}
              style={{
                width: "100%",
                border: "none",
                outline: "none",
                resize: "none",
                overflow: "hidden",
                background: "transparent",
                color: "var(--ambo-text-primary)",
                fontFamily: "var(--ambo-font-reading)",
                fontSize: 16,
                fontStyle: "italic",
                lineHeight: 1.65,
                padding: 0,
              }}
            />

            {/* Single expanding wrapper — height opens as one motion, content fades within */}
            <div style={{
              maxHeight: seed.trim() ? "280px" : "0px",
              overflow: "hidden",
              transition: "max-height 3.2s ease-in-out 0.6s",
            }}>

              {/* Deeper questions — opacity only, height handled by parent */}
              <div style={{
                opacity: seed.trim() ? 1 : 0,
                pointerEvents: seed.trim() ? "auto" : "none",
                transition: "opacity 1.6s ease 0.6s",
              }}>
                <button
                  onClick={() => setSeedExpanded((v) => !v)}
                  style={{
                    border: "none",
                    background: "transparent",
                    padding: "8px 0 2px",
                    cursor: "pointer",
                    fontFamily: "inherit",
                    display: "flex",
                    alignItems: "center",
                    gap: 5,
                    color: "var(--ambo-text-muted)",
                  }}
                  aria-expanded={seedExpanded}
                >
                  <span style={{
                    display: "inline-block",
                    fontSize: 13,
                    transition: "transform 200ms var(--ambo-ease)",
                    transform: seedExpanded ? "rotate(90deg)" : "rotate(0deg)",
                    lineHeight: 1,
                  }}>
                    ›
                  </span>
                  <span style={{
                    fontSize: 11,
                    fontStyle: "italic",
                    letterSpacing: "0.02em",
                  }}>
                    Questions for deeper listening
                  </span>
                </button>

                <SlideReveal open={seedExpanded} marginTop={seedExpanded ? 10 : 0}>
                  <div style={{
                    paddingTop: 4,
                    display: "flex",
                    flexDirection: "column",
                    gap: 10,
                  }}>
                    {[
                      { value: seedWhyNow,    set: setSeedWhyNow,    col: "seed_why_now",   placeholder: "Why do my people need this now?" },
                      { value: seedEucharist, set: setSeedEucharist, col: "seed_eucharist", placeholder: "How does this lead toward the Eucharist?" },
                      { value: seedResponse,  set: setSeedResponse,  col: "seed_response",  placeholder: "What is the Lord asking of these people?" },
                    ].map((f) => (
                      <textarea
                        key={f.col}
                        value={f.value}
                        onChange={(e) => { f.set(e.target.value); saveField(f.col, e.target.value); }}
                        placeholder={f.placeholder}
                        disabled={!currentId}
                        rows={2}
                        style={{
                          width: "100%",
                          border: "none",
                          outline: "none",
                          resize: "none",
                          background: "transparent",
                          color: "var(--ambo-text-secondary)",
                          fontFamily: "var(--ambo-font-reading)",
                          fontSize: 13,
                          fontStyle: "italic",
                          lineHeight: 1.55,
                          padding: 0,
                        }}
                      />
                    ))}
                  </div>
                </SlideReveal>
              </div>

              {/* Carry affordance — opacity only, fades in after deeper questions */}
              <div style={{
                opacity: seed.trim() ? 1 : 0,
                pointerEvents: seed.trim() ? "auto" : "none",
                transition: "opacity 1.2s ease 1.4s",
              }}>
              <div style={{
                marginTop: 12,
                paddingTop: 12,
                borderTop: "1px solid var(--ambo-rule-subtle)",
              }}>
              <button
                onClick={async () => {
                  if (!seed.trim()) return;
                  const timers = fieldTimerRef.current;
                  const existing = timers.get("seed");
                  if (existing) { clearTimeout(existing); timers.delete("seed"); }
                  try {
                    const supabase = createClient();
                    const { data: { user } } = await supabase.auth.getUser();
                    if (user && draftIdRef.current) {
                      await supabase
                        .from("homilies")
                        .update({ seed })
                        .eq("id", draftIdRef.current)
                        .eq("user_id", user.id);
                    }
                  } catch { /* ignore — thread already debouncing */ }
                  onGoWrite();
                }}
                style={{
                  border: "none",
                  background: "transparent",
                  color: "var(--ambo-text-muted)",
                  fontSize: 12,
                  fontStyle: "italic",
                  fontFamily: "inherit",
                  padding: 0,
                  cursor: "pointer",
                  letterSpacing: "0.02em",
                }}
              >
                Carry this thread into Write →
              </button>
            </div>
            </div>
            </div>
          </div>
        </div>

        {/* Notes pad — unchanged */}
        <aside
          className="reflect-notes"
          style={{
            flex: 1,
            minHeight: 0,
            display: "flex",
            flexDirection: "column",
            border: "1px solid var(--ambo-border)",
            borderRadius: 14,
            background: notes.trim() ? "var(--ambo-surface)" : "transparent",
            boxShadow: notes.trim() ? "var(--ambo-shadow-sm)" : "none",
            overflow: "hidden",
            transition: "background 0.4s ease, box-shadow 0.4s ease",
          }}
        >
        <div style={{
          padding: "14px 18px 12px",
          borderBottom: "1px solid var(--ambo-border)",
        }}>
          <span style={{
            fontSize: 13,
            fontWeight: 600,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "var(--ambo-text-secondary)",
          }}>
            Notes
          </span>
        </div>
        <textarea
          ref={notesRef}
          value={notes}
          onChange={(e) => {
            handleNotesChange(e.target.value);
            e.target.style.height = "auto";
            e.target.style.height = e.target.scrollHeight + "px";
          }}
          placeholder={
            currentId
              ? "Jot what's stirring. Tap any prompt to send it here."
              : "Create or pick a homily in Write to start taking notes."
          }
          disabled={!currentId}
          rows={1}
          style={{
            border: "none",
            outline: "none",
            resize: "none",
            overflow: "hidden",
            padding: 14,
            background: "transparent",
            color: "var(--ambo-text-primary)",
            fontFamily: "inherit",
            fontSize: 14,
            lineHeight: 1.6,
          }}
        />
        {lastAdded && (
          <div style={{
            padding: "8px 14px",
            borderTop: "1px solid var(--ambo-border)",
            fontSize: 11,
            color: "var(--ambo-accent)",
            background: "var(--ambo-accent-light)",
            animation: "fadeIn 0.15s ease",
          }}>
            Added to notes
          </div>
        )}
        </aside>
      </div>

      {/* Mobile toggle for notes */}
      {notesOpenMobile && null /* placeholder for future mobile sheet */}

      <style jsx>{`
        @media (max-width: 900px) {
          .reflect-layout {
            grid-template-columns: minmax(0, 1fr) !important;
          }
          .reflect-side {
            order: -1;
            position: static !important;
            max-height: none !important;
            overflow: visible !important;
          }
          .reflect-notes {
            min-height: 280px;
          }
        }
      `}</style>
    </div>
  );
}

const affordanceStyle: React.CSSProperties = {
  border: "none",
  background: "transparent",
  color: "var(--ambo-text-muted)",
  fontSize: 12,
  padding: "2px 0",
  cursor: "pointer",
  fontFamily: "inherit",
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  letterSpacing: "0.02em",
};

const sendToNotesStyle: React.CSSProperties = {
  border: "none",
  background: "transparent",
  color: "var(--ambo-accent)",
  fontSize: 11,
  fontWeight: 500,
  padding: "2px 6px",
  borderRadius: 6,
  cursor: "pointer",
  fontFamily: "inherit",
  flexShrink: 0,
  opacity: 0.75,
  transition: "opacity 0.15s",
};

const btnPrimaryStyle: React.CSSProperties = {
  border: "none",
  background: "var(--ambo-accent)",
  color: "white",
  fontSize: 13,
  fontWeight: 600,
  padding: "8px 18px",
  borderRadius: 100,
  cursor: "pointer",
  fontFamily: "inherit",
};

const btnGhostStyle: React.CSSProperties = {
  border: "1px solid var(--ambo-border)",
  background: "transparent",
  color: "var(--ambo-text-secondary)",
  fontSize: 13,
  padding: "8px 16px",
  borderRadius: 100,
  cursor: "pointer",
  fontFamily: "inherit",
};
