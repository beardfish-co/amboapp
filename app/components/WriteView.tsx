"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getComingSunday } from "./ReadingView";
import { createClient } from "@/lib/supabase/client";

interface Paragraph {
  id: string;
  text: string;
}

// Legacy single-draft cache — still written so older Preach clients and offline
// fallback keep working. Always holds whatever homily is currently active.
const STORAGE_KEY = "ambo-draft";

interface WriteViewProps {
  // The homily to load. null means "start fresh — first save will create a row".
  currentId: string | null;
  // Called when a brand-new homily row is created so the parent can track it.
  onCurrentIdChange: (id: string) => void;
  // Called when an autosave completes; lets the parent know list ordering/titles may have changed.
  onSaved?: () => void;
  // Called when a homily is loaded; lets the parent update its cached title for the drawer.
  onLoaded?: (info: { id: string | null; title: string }) => void;
  // Open the homily list drawer.
  onOpenList: () => void;
}

function toDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

function generateId() {
  return Math.random().toString(36).slice(2, 9);
}

function parseParagraphs(text: string): Paragraph[] {
  return text
    .split("\n\n")
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => ({ id: generateId(), text: t }));
}

function joinParagraphs(paragraphs: Paragraph[]): string {
  return paragraphs.map((p) => p.text).join("\n\n");
}

export default function WriteView({
  currentId,
  onCurrentIdChange,
  onSaved,
  onLoaded,
  onOpenList,
}: WriteViewProps) {
  const [title, setTitle] = useState("");
  const [sundayName, setSundayName] = useState<string | null>(null);
  const [paragraphs, setParagraphs] = useState<Paragraph[]>([
    { id: generateId(), text: "" },
  ]);
  const [wordCount, setWordCount] = useState(0);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [undoStack, setUndoStack] = useState<Paragraph[][]>([]);
  const [justMoved, setJustMoved] = useState(false);

  // Autosave coordination
  const autoSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSaveRef = useRef<{ id: string | null; title: string; content: string } | null>(null);
  // draftIdRef is the DB row id for whatever is currently in state.
  // It can differ from props.currentId briefly (when currentId is null and
  // we've just created a row on first save).
  const draftIdRef = useRef<string | null>(null);
  // Which currentId (prop) have we already loaded into state?
  const loadedIdRef = useRef<string | null | undefined>(undefined);

  // Flush any pending debounced save immediately. Cancels the timer.
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
          .update({ title: pending.title, content: pending.content, updated_at: new Date().toISOString() })
          .eq("id", pending.id)
          .eq("user_id", user.id);
      } else {
        const { data } = await supabase
          .from("homilies")
          .insert({ user_id: user.id, title: pending.title, content: pending.content })
          .select("id")
          .single();
        if (data?.id) {
          draftIdRef.current = data.id;
          onCurrentIdChange(data.id);
        }
      }
    } catch { /* offline — localStorage already has it */ }
  }, [onCurrentIdChange]);

  // Load content for the current homily. Runs on mount and whenever currentId changes.
  useEffect(() => {
    // If we've already loaded this exact id (including null), skip.
    if (loadedIdRef.current === currentId) return;

    let cancelled = false;

    (async () => {
      // Flush any pending save for the previously-loaded homily before we swap.
      if (loadedIdRef.current !== undefined) {
        await flushPendingSave();
      }

      // Start-fresh case
      if (currentId === null) {
        if (cancelled) return;
        setTitle("");
        setParagraphs([{ id: generateId(), text: "" }]);
        setLastSaved(null);
        draftIdRef.current = null;
        loadedIdRef.current = null;
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify({ title: "", content: "" }));
        } catch { /* ignore */ }
        onLoaded?.({ id: null, title: "" });
        return;
      }

      // Load by id — Supabase first, localStorage as last-resort fallback
      let loaded = false;
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();

        if (user) {
          const { data } = await supabase
            .from("homilies")
            .select("id, title, content")
            .eq("id", currentId)
            .eq("user_id", user.id)
            .single();

          if (data) {
            if (cancelled) return;
            draftIdRef.current = data.id;
            const nextTitle = data.title ?? "";
            setTitle(nextTitle);
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
        // Couldn't fetch — show the blank slate for this id so the user can still type
        draftIdRef.current = currentId;
        setTitle("");
        setParagraphs([{ id: generateId(), text: "" }]);
        setLastSaved(null);
        onLoaded?.({ id: currentId, title: "" });
      }

      if (!cancelled) loadedIdRef.current = currentId;
    })();

    return () => { cancelled = true; };
  }, [currentId, flushPendingSave, onLoaded]);

  // Fetch coming Sunday name for title suggestion (once on mount)
  useEffect(() => {
    const sunday = getComingSunday();
    const dateStr = toDateString(sunday);
    fetch(`/api/readings?date=${dateStr}`)
      .then((r) => r.json())
      .then((d) => { if (d.dayName) setSundayName(d.dayName); })
      .catch(() => {});
  }, []);

  // Flush pending save when the tab is hidden / closed
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        // Best-effort — use the pending ref directly since flush is async
        flushPendingSave();
      }
    };
    window.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("beforeunload", onVisibility);
    return () => {
      window.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("beforeunload", onVisibility);
    };
  }, [flushPendingSave]);

  // Word count
  useEffect(() => {
    const allText = paragraphs.map((p) => p.text).join(" ");
    const words = allText.trim().split(/\s+/).filter(Boolean).length;
    setWordCount(words);
  }, [paragraphs]);

  // Auto-save: localStorage immediately, Supabase debounced
  const save = useCallback(
    (t: string, paras: Paragraph[]) => {
      const content = joinParagraphs(paras);

      // Always save to localStorage as fast local cache
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ title: t, content }));
      } catch { /* ignore */ }

      // Stage the save — latest wins
      pendingSaveRef.current = { id: draftIdRef.current, title: t, content };

      // Debounce the Supabase save
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
              .update({ title: pending.title, content: pending.content, updated_at: new Date().toISOString() })
              .eq("id", pending.id)
              .eq("user_id", user.id);
          } else {
            const { data } = await supabase
              .from("homilies")
              .insert({ user_id: user.id, title: pending.title, content: pending.content })
              .select("id")
              .single();
            if (data?.id) {
              draftIdRef.current = data.id;
              onCurrentIdChange(data.id);
            }
          }
          setLastSaved(new Date());
          onSaved?.();
        } catch { /* network error — localStorage already saved */ }
      }, 1200);
    },
    [onCurrentIdChange, onSaved]
  );

  const handleTitleChange = (val: string) => {
    setTitle(val);
    save(val, paragraphs);
  };

  const handleParaChange = (id: string, val: string) => {
    const updated = paragraphs.map((p) => (p.id === id ? { ...p, text: val } : p));
    setParagraphs(updated);
    save(title, updated);
  };

  const handleParaKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>, id: string) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      const idx = paragraphs.findIndex((p) => p.id === id);
      const newPara = { id: generateId(), text: "" };
      const updated = [
        ...paragraphs.slice(0, idx + 1),
        newPara,
        ...paragraphs.slice(idx + 1),
      ];
      setParagraphs(updated);
      save(title, updated);
      // Focus the new paragraph after render
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
        save(title, updated);
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

  // Drag-and-drop reordering
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
    save(title, updated);
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
    save(title, prev);
    setJustMoved(false);
  };

  const handleDragEnd = () => {
    setDragId(null);
    setDragOverId(null);
  };

  const estimatedMinutes = Math.round(wordCount / 130);

  return (
    <div className="view-fade" style={{ maxWidth: 680, margin: "0 auto", padding: "0 24px 120px" }}>

      {/* My homilies button — subtle, top */}
      <div style={{ marginBottom: 16, display: "flex", justifyContent: "flex-start" }}>
        <button
          onClick={onOpenList}
          style={{
            border: "1px solid var(--ambo-border)",
            background: "transparent",
            color: "var(--ambo-text-secondary)",
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
          }}
          title="My homilies"
        >
          <StackIcon />
          My homilies
        </button>
      </div>

      {/* Title */}
      <div style={{ marginBottom: 32 }}>
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
        {/* Sunday name suggestion — only when title is empty */}
        {!title && sundayName && (
          <button
            onClick={() => handleTitleChange(sundayName)}
            style={{
              marginTop: 8,
              border: "none",
              background: "none",
              padding: 0,
              cursor: "pointer",
              fontSize: 13,
              color: "var(--ambo-text-muted)",
              fontFamily: "inherit",
              display: "flex",
              alignItems: "center",
              gap: 5,
            }}
          >
            <span style={{ color: "var(--ambo-accent)", fontWeight: 600 }}>↑</span>
            Use Sunday: <em style={{ color: "var(--ambo-text-secondary)" }}>{sundayName}</em>
          </button>
        )}
        <div style={{
          height: 1,
          background: "var(--ambo-border)",
          marginTop: 12,
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
            {/* Drag handle */}
            <div className="ambo-drag-handle" title="Drag to reorder">
              <DragIcon />
            </div>

            {/* Textarea auto-grows */}
            <AutoTextarea
              id={`para-${para.id}`}
              value={para.text}
              onChange={(val) => handleParaChange(para.id, val)}
              onKeyDown={(e) => handleParaKeyDown(e, para.id)}
              placeholder={paragraphs.indexOf(para) === 0 ? "Begin writing your homily…" : ""}
            />
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
    </div>
  );
}

// Auto-growing textarea
function AutoTextarea({
  id,
  value,
  onChange,
  onKeyDown,
  placeholder,
}: {
  id: string;
  value: string;
  onChange: (val: string) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
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
