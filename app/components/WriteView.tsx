"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface Paragraph {
  id: string;
  text: string;
}

const STORAGE_KEY = "ambo-draft";

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

export default function WriteView() {
  const [title, setTitle] = useState("");
  const [paragraphs, setParagraphs] = useState<Paragraph[]>([
    { id: generateId(), text: "" },
  ]);
  const [wordCount, setWordCount] = useState(0);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [undoStack, setUndoStack] = useState<Paragraph[][]>([]);
  const [justMoved, setJustMoved] = useState(false);
  const autoSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const { title: t, content } = JSON.parse(saved);
        if (t) setTitle(t);
        if (content) {
          const parsed = parseParagraphs(content);
          setParagraphs(parsed.length ? parsed : [{ id: generateId(), text: "" }]);
        }
      }
    } catch {
      // fresh start
    }
  }, []);

  // Word count
  useEffect(() => {
    const allText = paragraphs.map((p) => p.text).join(" ");
    const words = allText.trim().split(/\s+/).filter(Boolean).length;
    setWordCount(words);
  }, [paragraphs]);

  // Auto-save with debounce
  const save = useCallback(
    (t: string, paras: Paragraph[]) => {
      if (autoSaveRef.current) clearTimeout(autoSaveRef.current);
      autoSaveRef.current = setTimeout(() => {
        try {
          localStorage.setItem(
            STORAGE_KEY,
            JSON.stringify({ title: t, content: joinParagraphs(paras) })
          );
          setLastSaved(new Date());
        } catch {
          // storage error
        }
      }, 800);
    },
    []
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
