"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { selectPrompts, detectSeason } from "@/lib/prompts";

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
  const [notesOpenMobile, setNotesOpenMobile] = useState(false);
  const [lastAdded, setLastAdded] = useState<string | null>(null);

  const loadedIdRef = useRef<string | null | undefined>(undefined);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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

      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (user && currentId) {
          const { data } = await supabase
            .from("homilies")
            .select("title, notes, sunday_date")
            .eq("id", currentId)
            .eq("user_id", user.id)
            .single();
          if (data) {
            loadedTitle = data.title ?? "";
            loadedNotes = data.notes ?? "";
            loadedSunday = (data.sunday_date as string | null) ?? null;
          }
        } else if (user && !currentId) {
          const { data } = await supabase
            .from("homilies")
            .select("id, title, notes, sunday_date")
            .eq("user_id", user.id)
            .order("updated_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (data) {
            loadedTitle = data.title ?? "";
            loadedNotes = data.notes ?? "";
            loadedSunday = (data.sunday_date as string | null) ?? null;
          }
        }
      } catch {
        /* ignore; show empty state */
      }

      if (cancelled) return;
      setTitle(loadedTitle);
      setNotes(loadedNotes);
      setSundayDate(loadedSunday);
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
        if (!cancelled) setReadings(d);
      } catch {
        /* ignore */
      } finally {
        if (!cancelled) setReadingsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [sundayDate]);

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

  // Flush any pending save when the component unmounts or id swaps
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
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

          return (
            <section key={r.id} style={{ marginBottom: 56 }}>
              {/* Reading heading */}
              <div style={{
                display: "flex",
                alignItems: "baseline",
                justifyContent: "space-between",
                gap: 12,
                marginBottom: 6,
              }}>
                <h3 style={{
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: "var(--ambo-accent)",
                  margin: 0,
                }}>
                  {r.title}
                </h3>
                <span style={{
                  fontSize: 12,
                  fontStyle: "italic",
                  color: "var(--ambo-text-muted)",
                }}>
                  {r.reference}
                </span>
              </div>

              {r.heading && (
                <div style={{
                  fontSize: 14,
                  fontStyle: "italic",
                  color: "var(--ambo-text-secondary)",
                  marginBottom: 18,
                  lineHeight: 1.5,
                }}>
                  {r.heading}
                </div>
              )}

              {/* Reading body */}
              <div style={{
                fontSize: 18,
                lineHeight: 1.85,
                color: "var(--ambo-text-primary)",
                whiteSpace: "pre-wrap",
              }}>
                {paragraphs.map((p, i) => (
                  <p key={i} style={{ margin: "0 0 1em" }}>{p}</p>
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
            </section>
          );
        })}
      </div>

      {/* Notes pad (right column on desktop, bottom sheet on mobile) */}
      <aside
        className="reflect-notes"
        style={{
          position: "sticky",
          top: 80,
          alignSelf: "start",
          maxHeight: "calc(100vh - 110px)",
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

      {/* Mobile toggle for notes */}
      {notesOpenMobile && null /* placeholder for future mobile sheet */}

      <style jsx>{`
        @media (max-width: 900px) {
          .reflect-layout {
            grid-template-columns: minmax(0, 1fr) !important;
          }
          .reflect-notes {
            position: fixed !important;
            left: 16px;
            right: 16px;
            bottom: 16px;
            top: auto !important;
            max-height: 40vh !important;
            z-index: 40;
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
