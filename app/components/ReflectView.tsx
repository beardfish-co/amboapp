"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { selectPrompts, detectSeason } from "@/lib/prompts";
import type { CatenaBlock } from "@/lib/catena";

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

function isoToCompact(iso: string): string {
  return iso.replace(/-/g, "");
}

function isReadingSlot(id: string): id is ReadingSlot {
  return id === "r1" || id === "ps" || id === "r2" || id === "gospel";
}

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
  const [expandedSlot, setExpandedSlot] = useState<string | null>(null);
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
      setSeedExpanded(Boolean(loadedSeed || loadedSeedWhy || loadedSeedEu || loadedSeedResp));
      loadedIdRef.current = currentId ?? null;
      draftIdRef.current = currentId ?? null;
      setLoading(false);
    })();

    return () => { cancelled = true; };
  }, [currentId]);

  // Fetch readings when sundayDate changes
  useEffect(() => {
    if (!sundayDate) {
      setReadings(null);
      return;
    }
    let cancelled = false;
    setReadingsLoading(true);
    (async () => {
      try {
        const res = await fetch(`/api/readings?date=${isoToCompact(sundayDate)}`);
        if (!res.ok) return;
        const d: DayReadings = await res.json();
        if (!cancelled) {
          setReadings(d);
          // Default: gospel open, others closed. Priest can expand as needed.
          setOpenBodies(new Set(["gospel"]));
        }
      } catch {
        /* ignore */
      } finally {
        if (!cancelled) setReadingsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [sundayDate]);

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

  return (
    <div
      className="reflect-layout"
      style={{
        maxWidth: 1180,
        margin: "0 auto",
        padding: "0 24px 120px",
        display: "grid",
        gridTemplateColumns: "minmax(0, 1fr) 320px",
        gap: 32,
        alignItems: "start",
      }}
    >
      {/* Primary column: the readings */}
      <div>
        {/* Sunday chip */}
        <div style={{ marginBottom: 28, display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
          {sundayDate ? (
            <>
              <span style={{
                fontSize: 12,
                fontWeight: 600,
                color: "var(--ambo-accent)",
                letterSpacing: "0.05em",
                textTransform: "uppercase",
              }}>
                {readings?.dayName ?? "Readings"}
              </span>
              <span style={{ fontSize: 12, color: "var(--ambo-text-muted)" }}>
                · {fmtSundayShort(sundayDate)}
              </span>
              {title && (
                <span style={{ fontSize: 12, color: "var(--ambo-text-muted)", marginLeft: "auto" }}>
                  {title}
                </span>
              )}
            </>
          ) : (
            <span style={{ fontSize: 12, color: "var(--ambo-text-muted)" }}>
              No Sunday yet
            </span>
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

        {!loading && readings && readings.readings.map((r) => {
          const slot: ReadingSlot | null = isReadingSlot(r.id) ? r.id : null;
          const paragraphs = splitReadingParagraphs(r.text);
          const prompts = slot
            ? selectPrompts(slot, season, `${readings.date}|${r.id}`, 3)
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
                marginBottom: 20,
                overflow: "hidden",
                border: isGospel ? "1px solid rgba(74, 111, 165, 0.3)" : undefined,
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
                  padding: "16px 20px",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    display: "flex",
                    alignItems: "baseline",
                    justifyContent: "space-between",
                    gap: 12,
                  }}>
                    <h3 style={{
                      fontSize: 11,
                      fontWeight: 700,
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                      color: isGospel ? "var(--ambo-accent)" : "var(--ambo-text-muted)",
                      margin: 0,
                    }}>
                      {r.title}
                    </h3>
                    <span style={{
                      fontSize: 12,
                      fontStyle: "italic",
                      color: "var(--ambo-text-muted)",
                      whiteSpace: "nowrap",
                    }}>
                      {r.reference}
                    </span>
                  </div>
                  {r.heading && !bodyOpen && (
                    <div style={{
                      marginTop: 4,
                      fontSize: 13,
                      fontStyle: "italic",
                      color: "var(--ambo-text-muted)",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}>
                      {r.heading}
                    </div>
                  )}
                </div>
                <span
                  aria-hidden="true"
                  style={{
                    fontSize: 14,
                    color: "var(--ambo-text-muted)",
                    transition: "transform 0.2s ease",
                    transform: bodyOpen ? "rotate(90deg)" : "rotate(0deg)",
                    flexShrink: 0,
                  }}
                >
                  ›
                </span>
              </div>

              {bodyOpen && (
                <div style={{ padding: "0 20px 20px", animation: "fadeIn 0.15s ease" }}>
                  <div style={{
                    height: 1,
                    background: "var(--ambo-border)",
                    marginBottom: 16,
                  }} />
                  {r.heading && (
                    <div style={{
                      marginBottom: 14,
                      fontSize: 13,
                      fontStyle: "italic",
                      color: "var(--ambo-text-secondary)",
                      lineHeight: 1.55,
                    }}>
                      {r.heading}
                    </div>
                  )}

                  {/* Reading body */}
                  <div style={{
                    fontFamily: "var(--ambo-font-reading)",
                    fontSize: "var(--ambo-size-xl)",
                    lineHeight: "var(--ambo-lh-reading)",
                    color: "var(--ambo-text-primary)",
                    fontStyle: r.id === "ps" ? "italic" : "normal",
                    whiteSpace: "pre-wrap",
                  }}>
                    {paragraphs.map((para, i) => (
                      <p key={i} style={{ margin: "0 0 1em" }}>{para}</p>
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

                  {expanded && (
                    <div style={{
                      marginTop: 12,
                      paddingLeft: 12,
                      borderLeft: "2px solid var(--ambo-accent-light)",
                      animation: "fadeIn 0.15s ease",
                    }}>
                      {prompts.map((text) => (
                        <div key={text} style={{
                          display: "flex",
                          alignItems: "baseline",
                          justifyContent: "space-between",
                          gap: 10,
                          padding: "6px 0",
                        }}>
                          <div style={{
                            fontSize: 14,
                            fontStyle: "italic",
                            color: "var(--ambo-text-secondary)",
                            lineHeight: 1.55,
                            flex: 1,
                          }}>
                            {text}
                          </div>
                          <button
                            onClick={() => appendToNotes(`${r.title} · ${r.reference}`, text)}
                            style={sendToNotesStyle}
                            title="Add to your notes"
                          >
                            → note
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
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

                  {fathersExpanded && (
                    <div style={{
                      marginTop: 12,
                      paddingLeft: 12,
                      borderLeft: "2px solid var(--ambo-accent-light)",
                      animation: "fadeIn 0.15s ease",
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
                  )}
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
              )}
            </section>
          );
        })}
      </div>

      {/* Right column: seed panel + notes pad */}
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
          overflow: "hidden",
        }}
      >
        {/* Seed panel — the Directory's "one principal grace", discreet and optional */}
        <div
          className="reflect-seed"
          style={{
            border: "1px solid var(--ambo-border)",
            borderRadius: 14,
            background: "var(--ambo-surface)",
            overflow: "hidden",
            flexShrink: 0,
          }}
        >
          <div style={{
            padding: "12px 14px",
            borderBottom: seedExpanded ? "1px solid var(--ambo-border)" : "none",
            display: "flex",
            alignItems: "baseline",
            justifyContent: "space-between",
            gap: 8,
          }}>
            <span style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "var(--ambo-text-secondary)",
            }}>
              Seed
            </span>
            <button
              onClick={() => setSeedExpanded((v) => !v)}
              disabled={!currentId}
              style={{
                border: "none",
                background: "transparent",
                fontSize: 11,
                color: "var(--ambo-text-muted)",
                cursor: currentId ? "pointer" : "default",
                padding: 0,
                fontStyle: "italic",
                fontFamily: "inherit",
              }}
              aria-expanded={seedExpanded}
            >
              {seedExpanded ? "hide" : (seed ? "show" : "begin")}
            </button>
          </div>

          {seedExpanded && (
            <div style={{ padding: "12px 14px", animation: "fadeIn 0.15s ease" }}>
              {/* Primary seed — the central grace/mystery */}
              <textarea
                value={seed}
                onChange={(e) => { setSeed(e.target.value); saveField("seed", e.target.value); }}
                placeholder="What is the central grace or mystery of this Sunday?"
                disabled={!currentId}
                rows={2}
                style={{
                  width: "100%",
                  border: "none",
                  outline: "none",
                  resize: "none",
                  background: "transparent",
                  color: "var(--ambo-text-primary)",
                  fontFamily: "inherit",
                  fontSize: 15,
                  fontStyle: "italic",
                  lineHeight: 1.55,
                  padding: 0,
                }}
              />

              <div style={{
                height: 1,
                background: "var(--ambo-border)",
                margin: "10px 0 6px",
                opacity: 0.6,
              }} />

              {/* Three quieter unfolding questions */}
              {[
                { value: seedWhyNow, set: setSeedWhyNow, col: "seed_why_now", placeholder: "Why do these people need this now?" },
                { value: seedEucharist, set: setSeedEucharist, col: "seed_eucharist", placeholder: "How does this prepare them for the Eucharist?" },
                { value: seedResponse, set: setSeedResponse, col: "seed_response", placeholder: "What concrete response is the Lord asking?" },
              ].map((f) => (
                <textarea
                  key={f.col}
                  value={f.value}
                  onChange={(e) => { f.set(e.target.value); saveField(f.col, e.target.value); }}
                  placeholder={f.placeholder}
                  disabled={!currentId}
                  rows={1}
                  style={{
                    width: "100%",
                    border: "none",
                    outline: "none",
                    resize: "none",
                    background: "transparent",
                    color: "var(--ambo-text-secondary)",
                    fontFamily: "inherit",
                    fontSize: 12,
                    lineHeight: 1.5,
                    padding: "4px 0",
                  }}
                />
              ))}
            </div>
          )}

          {!seedExpanded && seed && (
            <div style={{
              padding: "8px 14px 12px",
              fontSize: 13,
              fontStyle: "italic",
              color: "var(--ambo-text-secondary)",
              lineHeight: 1.5,
            }}>
              {seed}
            </div>
          )}
        </div>

        {/* Notes pad */}
        <aside
          className="reflect-notes"
          style={{
            flex: 1,
            minHeight: 0,
            display: "flex",
            flexDirection: "column",
            border: "1px solid var(--ambo-border)",
            borderRadius: 14,
            background: "var(--ambo-surface)",
            overflow: "hidden",
          }}
        >
        <div style={{
          padding: "12px 14px",
          borderBottom: "1px solid var(--ambo-border)",
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
        }}>
          <span style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "var(--ambo-text-secondary)",
          }}>
            Notes
          </span>
          <span style={{ fontSize: 11, color: "var(--ambo-text-muted)" }}>
            private — doesn't print
          </span>
        </div>
        <textarea
          ref={notesRef}
          value={notes}
          onChange={(e) => handleNotesChange(e.target.value)}
          placeholder={
            currentId
              ? "Jot what's stirring. Tap any prompt to send it here."
              : "Create or pick a homily in Write to start taking notes."
          }
          disabled={!currentId}
          style={{
            flex: 1,
            border: "none",
            outline: "none",
            resize: "none",
            padding: 14,
            background: "transparent",
            color: "var(--ambo-text-primary)",
            fontFamily: "inherit",
            fontSize: 14,
            lineHeight: 1.6,
            minHeight: 360,
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
