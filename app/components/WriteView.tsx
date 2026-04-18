"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getComingSunday } from "./ReadingView";
import { createClient } from "@/lib/supabase/client";
import ReadingsDrawer from "./ReadingsDrawer";

interface Paragraph {
  id: string;
  text: string;
  kind?: "quote";
  citation?: string;
}

const STORAGE_KEY = "ambo-draft";

// Shared Sunday-name cache
const sundayNameCache: Map<string, string> = (globalThis as typeof globalThis & {
  __amboSundayNameCache?: Map<string, string>;
}).__amboSundayNameCache ??= new Map<string, string>();

interface WriteViewProps {
  currentId: string | null;
  onCurrentIdChange: (id: string) => void;
  onSaved?: () => void;
  onLoaded?: (info: { id: string | null; title: string }) => void;
  onOpenList: () => void;
}

function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseIsoDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function isoToCompact(iso: string): string {
  return iso.replace(/-/g, "");
}

function shortSundayLabel(iso: string): string {
  const d = parseIsoDate(iso);
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
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

function listSundayOptions(anchor: Date = new Date(), pastCount = 4, futureCount = 12): Date[] {
  const coming = getComingSunday(anchor);
  const out: Date[] = [];
  for (let i = -pastCount; i < futureCount; i++) {
    const d = new Date(coming);
    d.setDate(d.getDate() + i * 7);
    out.push(d);
  }
  return out;
}

function generateId() {
  return Math.random().toString(36).slice(2, 9);
}

// Parse the stored content string into Paragraphs, recognising quote blocks.
function parseParagraphs(text: string): Paragraph[] {
  return text
    .split("\n\n")
    .map((block) => block.replace(/^\s+|\s+$/g, ""))
    .filter(Boolean)
    .map((block) => {
      const lines = block.split("\n");
      const hasQuoteMarker = lines.some((l) => l.startsWith("> "));
      if (hasQuoteMarker) {
        let citation: string | undefined;
        if (lines.length > 0 && /^—\s+/.test(lines[lines.length - 1])) {
          citation = lines[lines.length - 1].replace(/^—\s+/, "").trim();
          lines.pop();
        }
        const quoteText = lines
          .map((l) => l.replace(/^>\s?/, ""))
          .join("\n")
          .trim();
        return { id: generateId(), text: quoteText, kind: "quote" as const, citation };
      }
      return { id: generateId(), text: block };
    });
}

function joinParagraphs(paragraphs: Paragraph[]): string {
  return paragraphs
    .map((p) => {
      if (p.kind === "quote") {
        const lines = (p.text ?? "").split("\n").map((l) => "> " + l).join("\n");
        const citationLine = p.citation ? "— " + p.citation : "";
        return citationLine ? lines + "\n" + citationLine : lines;
      }
      return p.text;
    })
    .join("\n\n");
}

export default function WriteView({
  currentId,
  onCurrentIdChange,
  onSaved,
  onLoaded,
  onOpenList,
}: WriteViewProps) {
  const [title, setTitle] = useState("");
  const [sundayDate, setSundayDate] = useState<string | null>(null);
  const [sundayName, setSundayName] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [readingsOpen, setReadingsOpen] = useState(false);
  const [paragraphs, setParagraphs] = useState<Paragraph[]>([
    { id: generateId(), text: "" },
  ]);
  const [wordCount, setWordCount] = useState(0);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [undoStack, setUndoStack] = useState<Paragraph[][]>([]);
  const [justMoved, setJustMoved] = useState(false);

  // Track most-recently-focused paragraph so Insert knows where to drop a quote.
  const lastFocusedParaIdRef = useRef<string | null>(null);

  // Autosave coordination
  const autoSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSaveRef = useRef<{
    id: string | null;
    title: string;
    content: string;
    sundayDate: string | null;
  } | null>(null);
  const draftIdRef = useRef<string | null>(null);
  const loadedIdRef = useRef<string | null | undefined>(undefined);

  const flushPendingSave = useCallback(async () => {
    if (autoSaveRef.current) {
      clearTimeout(autoSaveRef.current);
      autoSaveRef.current = null;
    }
    const pending = pendingSaveRef.current;
    pendingSaveRef.current = null;
    if (!pending) return;
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      if (pending.id) {
        await supabase
          .from("homilies")
          .update({
            title: pending.title,
            content: pending.content,
            sunday_date: pending.sundayDate,
            updated_at: new Date().toISOString(),
          })
          .eq("id", pending.id)
          .eq("user_id", user.id);
      } else {
        const { data } = await supabase
          .from("homilies")
          .insert({
            user_id: user.id,
            title: pending.title,
            content: pending.content,
            sunday_date: pending.sundayDate,
          })
          .select("id")
          .single();
        if (data?.id) {
          draftIdRef.current = data.id;
          onCurrentIdChange(data.id);
        }
      }
    } catch { /* offline — localStorage still has it */ }
  }, [onCurrentIdChange]);

  useEffect(() => {
    if (loadedIdRef.current === currentId) return;

    let cancelled = false;

    (async () => {
      if (loadedIdRef.current !== undefined) {
        await flushPendingSave();
      }

      if (currentId === null) {
        if (cancelled) return;
        const defaultSunday = toIsoDate(getComingSunday(new Date()));
        setTitle("");
        setParagraphs([{ id: generateId(), text: "" }]);
        setLastSaved(null);
        setSundayDate(defaultSunday);
        draftIdRef.current = null;
        loadedIdRef.current = null;
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify({ title: "", content: "" }));
        } catch { /* ignore */ }
        onLoaded?.({ id: null, title: "" });
        return;
      }

      let loaded = false;
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();

        if (user) {
          const { data } = await supabase
            .from("homilies")
            .select("id, title, content, sunday_date")
            .eq("id", currentId)
            .eq("user_id", user.id)
            .single();

          if (data) {
            if (cancelled) return;
            draftIdRef.current = data.id;
            const nextTitle = data.title ?? "";
            setTitle(nextTitle);
            setSundayDate((data.sunday_date as string | null) ?? null);
            const parsed = data.content ? parseParagraphs(data.content) : [];
            setParagraphs(parsed.length ? parsed : [{ id: generateId(), text: "" }]);
            try {
              localStorage.setItem(
                STORAGE_KEY,
                JSON.stringify({ title: nextTitle, content: data.content ?? "" })
              );
            } catch { /* ignore */ }
            onLoaded?.({ id: data.id, title: nextTitle });
            loaded = true;
          }
        }
      } catch { /* fall through */ }

      if (!loaded && !cancelled) {
        draftIdRef.current = currentId;
        setTitle("");
        setSundayDate(null);
        setParagraphs([{ id: generateId(), text: "" }]);
        setLastSaved(null);
        onLoaded?.({ id: currentId, title: "" });
      }

      if (!cancelled) loadedIdRef.current = currentId;
    })();

    return () => { cancelled = true; };
  }, [currentId, flushPendingSave, onLoaded]);

  useEffect(() => {
    if (!sundayDate) {
      setSundayName(null);
      return;
    }
    let cancelled = false;
    const cached = sundayNameCache.get(sundayDate);
    if (cached) {
      setSundayName(cached);
    } else {
      setSundayName(null);
      fetchSundayName(sundayDate).then((n) => { if (!cancelled) setSundayName(n); });
    }
    return () => { cancelled = true; };
  }, [sundayDate]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flushPendingSave();
    };
    window.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("beforeunload", onVisibility);
    return () => {
      window.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("beforeunload", onVisibility);
    };
  }, [flushPendingSave]);

  useEffect(() => {
    if (!pickerOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setPickerOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pickerOpen]);

  useEffect(() => {
    const allText = paragraphs.map((p) => p.text).join(" ");
    const words = allText.trim().split(/\s+/).filter(Boolean).length;
    setWordCount(words);
  }, [paragraphs]);

  const save = useCallback(
    (t: string, paras: Paragraph[], sd: string | null) => {
      const content = joinParagraphs(paras);

      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ title: t, content }));
      } catch { /* ignore */ }

      pendingSaveRef.current = { id: draftIdRef.current, title: t, content, sundayDate: sd };

      if (autoSaveRef.current) clearTimeout(autoSaveRef.current);
      autoSaveRef.current = setTimeout(async () => {
        autoSaveRef.current = null;
        const pending = pendingSaveRef.current;
        pendingSaveRef.current = null;
        if (!pending) return;
        try {
          const supabase = createClient();
          const { data: { user } } = await supabase.auth.getUser();
          if (!user) return;

          if (pending.id) {
            await supabase
              .from("homilies")
              .update({
                title: pending.title,
                content: pending.content,
                sunday_date: pending.sundayDate,
                updated_at: new Date().toISOString(),
              })
              .eq("id", pending.id)
              .eq("user_id", user.id);
          } else {
            const { data } = await supabase
              .from("homilies")
              .insert({
                user_id: user.id,
                title: pending.title,
                content: pending.content,
                sunday_date: pending.sundayDate,
              })
              .select("id")
              .single();
            if (data?.id) {
              draftIdRef.current = data.id;
              onCurrentIdChange(data.id);
            }
          }
          setLastSaved(new Date());
          onSaved?.();
        } catch { /* ignore */ }
      }, 1200);
    },
    [onCurrentIdChange, onSaved]
  );

  const handleTitleChange = (val: string) => {
    setTitle(val);
    save(val, paragraphs, sundayDate);
  };

  const handleParaChange = (id: string, val: string) => {
    const updated = paragraphs.map((p) => (p.id === id ? { ...p, text: val } : p));
    setParagraphs(updated);
    save(title, updated, sundayDate);
  };

  const handleParaCitationChange = (id: string, val: string) => {
    const updated = paragraphs.map((p) => (p.id === id ? { ...p, citation: val } : p));
    setParagraphs(updated);
    save(title, updated, sundayDate);
  };

  const handleSundayChange = (iso: string | null) => {
    setSundayDate(iso);
    setPickerOpen(false);
    save(title, paragraphs, iso);
  };

  const handleInsertReading = useCallback((payload: { text: string; citation: string }) => {
    // Find the insertion index: after the last-focused paragraph, or at the end.
    setParagraphs((prev) => {
      let insertAfter = prev.length - 1;
      const focusedId = lastFocusedParaIdRef.current;
      if (focusedId) {
        const idx = prev.findIndex((p) => p.id === focusedId);
        if (idx >= 0) insertAfter = idx;
      }

      const quoteP: Paragraph = {
        id: generateId(),
        text: payload.text,
        kind: "quote",
        citation: payload.citation,
      };

      // If the focused paragraph is empty body text, replace it rather than shoving it down.
      const focused = focusedId ? prev.find((p) => p.id === focusedId) : null;
      let next: Paragraph[];
      if (focused && !focused.kind && focused.text.trim() === "") {
        next = prev.map((p) => (p.id === focused.id ? quoteP : p));
        insertAfter = prev.findIndex((p) => p.id === focused.id);
      } else {
        next = [
          ...prev.slice(0, insertAfter + 1),
          quoteP,
          ...prev.slice(insertAfter + 1),
        ];
      }

      // Ensure there's a body paragraph after the quote so the user can keep typing.
      const afterIdx = next.findIndex((p) => p.id === quoteP.id) + 1;
      let nextFocusId: string;
      if (afterIdx >= next.length) {
        const newBody: Paragraph = { id: generateId(), text: "" };
        next = [...next, newBody];
        nextFocusId = newBody.id;
      } else {
        nextFocusId = next[afterIdx].id;
      }

      save(title, next, sundayDate);
      // Focus the body paragraph after the quote on next frame
      setTimeout(() => {
        const el = document.getElementById(`para-${nextFocusId}`);
        if (el) (el as HTMLTextAreaElement).focus();
      }, 20);

      return next;
    });

    setReadingsOpen(false);
  }, [save, title, sundayDate]);

  const handleParaFocus = (id: string) => {
    lastFocusedParaIdRef.current = id;
  };

  const handleParaKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>, id: string) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      const idx = paragraphs.findIndex((p) => p.id === id);
      const newPara: Paragraph = { id: generateId(), text: "" };
      const updated = [
        ...paragraphs.slice(0, idx + 1),
        newPara,
        ...paragraphs.slice(idx + 1),
      ];
      setParagraphs(updated);
      save(title, updated, sundayDate);
      setTimeout(() => {
        const el = document.getElementById(`para-${newPara.id}`);
        if (el) el.focus();
      }, 10);
    }
    if (e.key === "Backspace") {
      const para = paragraphs.find((p) => p.id === id);
      if (para && para.text === "" && paragraphs.length > 1) {
        e.preventDefault();
        const idx = paragraphs.findIndex((p) => p.id === id);
        const updated = paragraphs.filter((p) => p.id !== id);
        setParagraphs(updated);
        save(title, updated, sundayDate);
        const prevId = updated[Math.max(0, idx - 1)]?.id;
        if (prevId) {
          setTimeout(() => {
            const el = document.getElementById(`para-${prevId}`) as HTMLTextAreaElement;
            if (el) {
              el.focus();
              el.setSelectionRange(el.value.length, el.value.length);
            }
          }, 10);
        }
      }
    }
  };

  const handleDragStart = (id: string, before: Paragraph[]) => {
    setUndoStack((s) => [...s, before]);
    setDragId(id);
  };
  const handleDragOver = (e: React.DragEvent, id: string) => {
    e.preventDefault();
    setDragOverId(id);
  };
  const handleDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    if (!dragId || dragId === targetId) {
      setDragId(null);
      setDragOverId(null);
      return;
    }
    const fromIdx = paragraphs.findIndex((p) => p.id === dragId);
    const toIdx = paragraphs.findIndex((p) => p.id === targetId);
    const updated = [...paragraphs];
    const [moved] = updated.splice(fromIdx, 1);
    updated.splice(toIdx, 0, moved);
    setParagraphs(updated);
    save(title, updated, sundayDate);
    setDragId(null);
    setDragOverId(null);
    setJustMoved(true);
    setTimeout(() => setJustMoved(false), 4000);
  };
  const handleUndoMove = () => {
    if (undoStack.length === 0) return;
    const prev = undoStack[undoStack.length - 1];
    setParagraphs(prev);
    setUndoStack((s) => s.slice(0, -1));
    save(title, prev, sundayDate);
    setJustMoved(false);
  };
  const handleDragEnd = () => {
    setDragId(null);
    setDragOverId(null);
  };

  const estimatedMinutes = Math.round(wordCount / 130);
  const sundayOptions = listSundayOptions();
  const pickerLabel = sundayDate
    ? `For ${sundayName ?? shortSundayLabel(sundayDate)}`
    : "Pick a Sunday";

  return (
    <div className="view-fade" style={{ maxWidth: 680, margin: "0 auto", padding: "0 24px 120px" }}>

      {/* Top bar: My homilies + Readings */}
      <div style={{
        marginBottom: 16,
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 8,
      }}>
        <button
          onClick={onOpenList}
          style={pillBtnStyle(false)}
          title="My homilies"
        >
          <StackIcon />
          My homilies
        </button>
        <button
          onClick={() => setReadingsOpen(true)}
          style={pillBtnStyle(readingsOpen)}
          title="Open today's readings"
        >
          <BookIcon />
          Readings
        </button>
      </div>

      {/* Title */}
      <div style={{ marginBottom: 20 }}>
        <input
          value={title}
          onChange={(e) => handleTitleChange(e.target.value)}
          placeholder="Title your homily…"
          style={{
            width: "100%",
            border: "none",
            outline: "none",
            background: "transparent",
            fontSize: 26,
            fontWeight: 600,
            letterSpacing: "-0.02em",
            color: "var(--ambo-text-primary)",
            fontFamily: "inherit",
            padding: 0,
          }}
        />

        {/* Sunday pill + use-as-title */}
        <div style={{
          marginTop: 10,
          display: "flex",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 8,
          position: "relative",
        }}>
          <button
            onClick={() => setPickerOpen((v) => !v)}
            style={{
              border: "1px solid var(--ambo-border)",
              background: pickerOpen ? "var(--ambo-accent-light)" : "transparent",
              color: "var(--ambo-text-secondary)",
              fontSize: 12,
              fontWeight: 500,
              padding: "5px 10px",
              borderRadius: 100,
              cursor: "pointer",
              fontFamily: "inherit",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
            title="Change which Sunday this homily is for"
          >
            <CalendarIcon />
            <span>{pickerLabel}</span>
            <span style={{ fontSize: 10, opacity: 0.6 }}>▾</span>
          </button>

          {!title && sundayName && (
            <button
              onClick={() => handleTitleChange(sundayName)}
              style={{
                border: "none",
                background: "none",
                padding: "5px 4px",
                cursor: "pointer",
                fontSize: 12,
                color: "var(--ambo-text-muted)",
                fontFamily: "inherit",
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
              }}
              title="Use the Sunday name as the title"
            >
              <span style={{ color: "var(--ambo-accent)", fontWeight: 600 }}>↑</span>
              Use as title
            </button>
          )}

          {pickerOpen && (
            <>
              <div
                onClick={() => setPickerOpen(false)}
                style={{ position: "fixed", inset: 0, zIndex: 40 }}
              />
              <div style={{
                position: "absolute",
                top: "calc(100% + 4px)",
                left: 0,
                zIndex: 50,
                background: "var(--ambo-bg)",
                border: "1px solid var(--ambo-border)",
                borderRadius: 10,
                boxShadow: "var(--ambo-shadow-md)",
                padding: 4,
                minWidth: 240,
                maxHeight: 320,
                overflowY: "auto",
              }}>
                {sundayOptions.map((d) => {
                  const iso = toIsoDate(d);
                  const isSelected = iso === sundayDate;
                  const isPast = d.getTime() < new Date(new Date().setHours(0,0,0,0)).getTime();
                  const nameCached = sundayNameCache.get(iso);
                  return (
                    <button
                      key={iso}
                      onClick={() => handleSundayChange(iso)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 12,
                        width: "100%",
                        textAlign: "left",
                        border: "none",
                        background: isSelected ? "var(--ambo-accent-light)" : "transparent",
                        color: isSelected
                          ? "var(--ambo-accent)"
                          : isPast
                            ? "var(--ambo-text-muted)"
                            : "var(--ambo-text-primary)",
                        padding: "8px 10px",
                        borderRadius: 8,
                        cursor: "pointer",
                        fontFamily: "inherit",
                        fontSize: 13,
                        fontWeight: isSelected ? 600 : 500,
                      }}
                    >
                      <span>{shortSundayLabel(iso)}</span>
                      <span style={{
                        fontSize: 11,
                        color: "var(--ambo-text-muted)",
                        textAlign: "right",
                        maxWidth: 160,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}>
                        {nameCached ?? ""}
                      </span>
                    </button>
                  );
                })}
                <div style={{ padding: "6px 10px", borderTop: "1px solid var(--ambo-border)", marginTop: 4 }}>
                  <button
                    onClick={() => handleSundayChange(null)}
                    style={{
                      border: "none",
                      background: "transparent",
                      color: "var(--ambo-text-muted)",
                      fontSize: 12,
                      fontFamily: "inherit",
                      cursor: "pointer",
                      padding: "4px 0",
                    }}
                  >
                    No Sunday (clear)
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        <div style={{
          height: 1,
          background: "var(--ambo-border)",
          marginTop: 16,
        }} />
      </div>

      {/* Undo move toast */}
      {justMoved && (
        <div style={{
          position: "fixed",
          bottom: 100,
          left: "50%",
          transform: "translateX(-50%)",
          background: "var(--ambo-surface)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          border: "1px solid var(--ambo-border)",
          borderRadius: 100,
          padding: "10px 20px",
          display: "flex",
          alignItems: "center",
          gap: 12,
          boxShadow: "var(--ambo-shadow-md)",
          zIndex: 100,
          animation: "fadeIn 0.2s ease",
        }}>
          <span style={{ fontSize: 14, color: "var(--ambo-text-secondary)" }}>Paragraph moved</span>
          <button
            onClick={handleUndoMove}
            style={{
              border: "none",
              background: "var(--ambo-accent-light)",
              color: "var(--ambo-accent)",
              fontSize: 13,
              fontWeight: 600,
              padding: "4px 12px",
              borderRadius: 100,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            Undo
          </button>
        </div>
      )}

      {/* Paragraphs */}
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {paragraphs.map((para) => (
          <div
            key={para.id}
            className={`ambo-para-wrapper ${dragId === para.id ? "dragging" : ""} ${dragOverId === para.id && dragId !== para.id ? "drag-over" : ""}`}
            draggable
            onDragStart={() => handleDragStart(para.id, paragraphs)}
            onDragOver={(e) => handleDragOver(e, para.id)}
            onDrop={(e) => handleDrop(e, para.id)}
            onDragEnd={handleDragEnd}
            style={{ paddingLeft: 30 }}
          >
            <div className="ambo-drag-handle" title="Drag to reorder">
              <DragIcon />
            </div>

            {para.kind === "quote" ? (
              <QuoteBlock
                para={para}
                onTextChange={(val) => handleParaChange(para.id, val)}
                onCitationChange={(val) => handleParaCitationChange(para.id, val)}
                onKeyDown={(e) => handleParaKeyDown(e, para.id)}
                onFocus={() => handleParaFocus(para.id)}
              />
            ) : (
              <AutoTextarea
                id={`para-${para.id}`}
                value={para.text}
                onChange={(val) => handleParaChange(para.id, val)}
                onKeyDown={(e) => handleParaKeyDown(e, para.id)}
                onFocus={() => handleParaFocus(para.id)}
                placeholder={paragraphs.indexOf(para) === 0 ? "Begin writing your homily…" : ""}
              />
            )}
          </div>
        ))}
      </div>

      {/* Status bar */}
      <div style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        padding: "12px 24px",
        background: "rgba(238, 242, 247, 0.85)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        borderTop: "1px solid var(--ambo-border)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 16,
      }}>
        <span style={{ fontSize: 12, color: "var(--ambo-text-muted)" }}>
          {wordCount} {wordCount === 1 ? "word" : "words"}
          {wordCount > 0 && ` · ~${estimatedMinutes} min`}
        </span>
        {lastSaved && (
          <span style={{ fontSize: 12, color: "var(--ambo-text-muted)" }}>
            · Saved {lastSaved.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </span>
        )}
      </div>

      {/* Readings drawer */}
      <ReadingsDrawer
        open={readingsOpen}
        sundayDate={sundayDate}
        onClose={() => setReadingsOpen(false)}
        onInsert={handleInsertReading}
      />
    </div>
  );
}

function QuoteBlock({
  para,
  onTextChange,
  onCitationChange,
  onKeyDown,
  onFocus,
}: {
  para: Paragraph;
  onTextChange: (val: string) => void;
  onCitationChange: (val: string) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  onFocus: () => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (ref.current) {
      ref.current.style.height = "auto";
      ref.current.style.height = ref.current.scrollHeight + "px";
    }
  }, [para.text]);

  return (
    <div style={{
      borderLeft: "3px solid var(--ambo-accent)",
      paddingLeft: 16,
      margin: "6px 0",
    }}>
      <textarea
        id={`para-${para.id}`}
        ref={ref}
        value={para.text}
        onChange={(e) => onTextChange(e.target.value)}
        onKeyDown={onKeyDown}
        onFocus={onFocus}
        rows={1}
        style={{
          width: "100%",
          border: "none",
          outline: "none",
          resize: "none",
          background: "transparent",
          fontFamily: "inherit",
          fontSize: 16,
          fontStyle: "italic",
          lineHeight: 1.7,
          color: "var(--ambo-text-primary)",
          padding: "4px 0",
          overflowY: "hidden",
          display: "block",
        }}
      />
      {/* Citation */}
      <div style={{
        marginTop: 4,
        display: "flex",
        alignItems: "center",
        gap: 6,
      }}>
        <span style={{
          fontSize: 14,
          color: "var(--ambo-text-muted)",
          lineHeight: 1,
        }}>—</span>
        <input
          value={para.citation ?? ""}
          onChange={(e) => onCitationChange(e.target.value)}
          onFocus={onFocus}
          placeholder="Citation"
          style={{
            border: "none",
            outline: "none",
            background: "transparent",
            fontSize: 12,
            fontStyle: "italic",
            color: "var(--ambo-text-muted)",
            fontFamily: "inherit",
            padding: 0,
            flex: 1,
          }}
        />
      </div>
    </div>
  );
}

function AutoTextarea({
  id,
  value,
  onChange,
  onKeyDown,
  onFocus,
  placeholder,
}: {
  id: string;
  value: string;
  onChange: (val: string) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  onFocus?: () => void;
  placeholder?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (ref.current) {
      ref.current.style.height = "auto";
      ref.current.style.height = ref.current.scrollHeight + "px";
    }
  }, [value]);

  return (
    <textarea
      id={id}
      ref={ref}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={onKeyDown}
      onFocus={onFocus}
      placeholder={placeholder}
      rows={1}
      style={{
        width: "100%",
        border: "none",
        outline: "none",
        resize: "none",
        background: "transparent",
        fontFamily: "inherit",
        fontSize: 17,
        lineHeight: 1.75,
        color: "var(--ambo-text-primary)",
        padding: "4px 0",
        overflowY: "hidden",
        display: "block",
      }}
    />
  );
}

const pillBtnStyle = (active: boolean): React.CSSProperties => ({
  border: "1px solid " + (active ? "var(--ambo-accent)" : "var(--ambo-border)"),
  background: active ? "var(--ambo-accent-light)" : "transparent",
  color: active ? "var(--ambo-accent)" : "var(--ambo-text-secondary)",
  fontSize: 12,
  fontWeight: 500,
  padding: "6px 12px",
  borderRadius: 100,
  cursor: "pointer",
  fontFamily: "inherit",
  display: "flex",
  alignItems: "center",
  gap: 6,
  transition: "all 0.15s",
});

function DragIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="9" cy="5" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="15" cy="5" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="9" cy="12" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="15" cy="12" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="9" cy="19" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="15" cy="19" r="1.5" fill="currentColor" stroke="none" />
    </svg>
  );
}

function StackIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="14" height="4" rx="1" />
      <rect x="3" y="9" width="14" height="4" rx="1" />
      <rect x="3" y="15" width="14" height="2.5" rx="1" />
    </svg>
  );
}

function BookIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 4h5a2 2 0 0 1 2 2v11" />
      <path d="M16 4h-5a2 2 0 0 0-2 2v11" />
      <path d="M4 4v13h5" />
      <path d="M16 4v13h-5" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="5" width="14" height="12" rx="2" />
      <path d="M3 9h14" />
      <path d="M7 3v4M13 3v4" />
    </svg>
  );
}
