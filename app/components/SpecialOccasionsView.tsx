"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { createClient } from "@/lib/supabase/client";
import { PillButton } from "@/lib/ui/pill-button";
import { CandleIcon } from "@/lib/ui/icons";
import RichEditor from "./RichEditor";
import { DailyPreachPanel } from "./DailyPreachPanel";
import ThemeToggle from "./ThemeToggle";
import AccountMenu from "./AccountMenu";
import {
  paragraphsToHtml,
  paragraphsFromDoc,
  type Paragraph,
} from "@/lib/paragraph-tiptap";
import type { Editor } from "@tiptap/react";

// ── Types ─────────────────────────────────────────────────────────────────────
type SOMode = "write" | "preach";

export interface SpecialOccasionsViewProps {
  open: boolean;
  category: string; // 'wedding' | 'funeral' | 'baptism' | 'other'
  onClose: () => void;
  onSaved?: () => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function todayIso(): string {
  const t = new Date();
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
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

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ── Ribbon button (local — mirrors WriteView's RibbonButton) ──────────────────
function RibbonButton({
  label, kbd, onClick, children,
}: {
  label: string; kbd?: string; onClick: () => void; children: React.ReactNode;
}) {
  const [hover, setHover]     = useState(false);
  const [pressed, setPressed] = useState(false);
  const title = kbd ? `${label} · ${kbd}` : label;
  return (
    <button
      type="button"
      onMouseDown={(e) => { e.preventDefault(); setPressed(true); }}
      onMouseUp={() => setPressed(false)}
      onMouseLeave={() => { setHover(false); setPressed(false); }}
      onMouseEnter={() => setHover(true)}
      onClick={onClick}
      aria-label={label}
      title={title}
      style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        width: 26, height: 26, padding: 0,
        border: "1px solid transparent", borderRadius: 999,
        background: pressed ? "var(--ambo-accent-light)" : hover ? "rgba(0,0,0,0.04)" : "transparent",
        color: "var(--ambo-text-secondary)",
        cursor: "pointer", fontFamily: "inherit",
        transition: "background 120ms ease, color 120ms ease",
      }}
    >
      {children}
    </button>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function SpecialOccasionsView({
  open,
  category,
  onClose,
  onSaved,
}: SpecialOccasionsViewProps) {
  const [mode, setMode]               = useState<SOMode>("write");
  const [title, setTitle]             = useState("");
  const [paragraphs, setParagraphs]   = useState<Paragraph[]>([]);
  const [initialHtml, setInitialHtml] = useState("");
  const [editorMountKey, setEditorMountKey] = useState(0);
  const [headerHidden, setHeaderHidden]     = useState(false);
  const [stepLocked, setStepLocked]         = useState(false);
  const [immersiveVersion, setImmersiveVersion] = useState(0);
  const [isDesktop, setIsDesktop]           = useState(
    typeof window !== "undefined" && window.innerWidth >= 1280
  );
  const [saveStatus, setSaveStatus]   = useState<"saved" | "saving" | "unsaved">("saved");

  const editorRef     = useRef<Editor | null>(null);
  const noteIdRef     = useRef<string | null>(null);
  const saveTimerRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const categoryRef   = useRef(category);

  // Keep categoryRef in sync
  useEffect(() => { categoryRef.current = category; }, [category]);

  // Reset state when category changes (new occasion opened)
  useEffect(() => {
    if (!open) return;
    setMode("write");
    setTitle("");
    setParagraphs([]);
    setInitialHtml("");
    setEditorMountKey((k) => k + 1);
    setHeaderHidden(false);
    setStepLocked(false);
    setImmersiveVersion(0);
    setSaveStatus("saved");
    noteIdRef.current = null;
  }, [open, category]);

  // Reset on close
  useEffect(() => {
    if (!open) {
      setMode("write");
      setHeaderHidden(false);
      setStepLocked(false);
    }
  }, [open]);

  // Track desktop viewport (≥1280px — header never hides on desktop)
  useEffect(() => {
    const onResize = () => setIsDesktop(window.innerWidth >= 1280);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Escape closes (unless immersive preach)
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !stepLocked) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, stepLocked, onClose]);

  // ── Autosave ───────────────────────────────────────────────────────────────
  const save = useCallback(async (t: string, paras: Paragraph[]) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      setSaveStatus("saving");
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const content = joinParagraphs(paras);
        const payload = {
          user_id: user.id,
          note_type: "special",
          category: categoryRef.current,
          sunday_date: todayIso(),
          title: t || null,
          content: content || null,
        };

        if (noteIdRef.current) {
          await supabase
            .from("homilies")
            .update({ ...payload, updated_at: new Date().toISOString() })
            .eq("id", noteIdRef.current)
            .eq("user_id", user.id);
        } else {
          const { data } = await supabase
            .from("homilies")
            .insert(payload)
            .select("id")
            .single();
          if (data?.id) noteIdRef.current = data.id;
        }

        setSaveStatus("saved");
        onSaved?.();
      } catch {
        setSaveStatus("unsaved");
      }
    }, 1200);
  }, [onSaved]);

  // Cleanup timer on unmount
  useEffect(() => () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); }, []);

  // ── Formatting ribbon helpers ──────────────────────────────────────────────
  const applyRibbonMark = (mark: string) => {
    const editor = editorRef.current;
    if (!editor) return;
    if (mark === "**") editor.chain().focus().toggleBold().run();
    else if (mark === "_") editor.chain().focus().toggleItalic().run();
  };

  const insertQuote = () => {
    const editor = editorRef.current;
    if (!editor) return;
    // Insert a blockquote at the current position
    editor.chain().focus().toggleBlockquote().run();
  };

  const preachContent = joinParagraphs(paragraphs);

  if (!open) return null;

  return (
    <>
      <style>{`
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
          <div style={{
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
              {/* Sunday island — dimmed (Reflect not applicable to special occasions) */}
              <nav className="mode-pill" aria-label="Sunday modes (inactive)"
                style={{ opacity: 0.32, pointerEvents: "none" }}>
                {["Reflect", "Write", "Preach"].map((label) => (
                  <button key={label} className="mode-pill-btn" tabIndex={-1}>{label}</button>
                ))}
              </nav>
              {/* Special Occasions island */}
              <nav className="mode-pill" aria-label="Special Occasions modes">
                {(["write", "preach"] as SOMode[]).map((m) => (
                  <button
                    key={m}
                    className={`mode-pill-btn ${mode === m ? "active" : ""}`}
                    onClick={() => setMode(m)}
                  >
                    {m === "write" ? "Write" : "Preach"}
                  </button>
                ))}
              </nav>
            </div>

            {/* Right: ThemeToggle + AccountMenu */}
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <ThemeToggle />
              <AccountMenu
                lectionaryFamily={null}
                onSelectFamily={() => Promise.resolve()}
              />
            </div>
          </div>
        </header>

        {/* ── Scrollable content ───────────────────────────────────────────── */}
        <div style={{
          flex: 1, minHeight: 0,
          overflowY: stepLocked ? "hidden" : "auto",
          ...(stepLocked ? { display: "flex", flexDirection: "column" as const } : {}),
        }}>

          {mode === "preach" ? (
            // ── Preach mode — reuses DailyPreachPanel ──────────────────────
            <DailyPreachPanel
              content={preachContent}
              title={title || capitalise(category)}
              isDesktop={isDesktop}
              onScrollLock={(locked, isScroll) => {
                // On desktop (≥1280px) the header stays visible — pill island is the exit affordance
                setHeaderHidden(locked && !isDesktop);
                setStepLocked(locked && isScroll === false);
              }}
              onBack={() => setMode("write")}
              immersiveVersion={immersiveVersion}
            />

          ) : (
            // ── Write mode — single-column editor ──────────────────────────
            <div className="view-fade" style={{
              maxWidth: 860, margin: "0 auto",
              padding: "0 24px 56px",
            }}>

              {/* ── Secondary chrome row ──────────────────────────────────── */}
              <div style={{
                display: "flex", alignItems: "center",
                marginBottom: 32, gap: 8, paddingTop: 36, flexWrap: "wrap",
              }}>
                <PillButton
                  variant="ghost"
                  icon={
                    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }}>
                      <polyline points="10,3 4,8 10,13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  }
                  onClick={onClose}
                >
                  Exit
                </PillButton>
                <div style={{ flex: 1 }} />
                {/* Category label pill — non-interactive */}
                <PillButton
                  variant="ghost"
                  icon={<CandleIcon />}
                  style={{ cursor: "default", pointerEvents: "none" }}
                >
                  {capitalise(category)}
                </PillButton>
              </div>

              {/* ── Glass card — title + formatting ribbon + editor ─────── */}
              <div className="glass-card" style={{ padding: "44px 56px 56px" }}>

                {/* Title input */}
                <input
                  type="text"
                  placeholder="Title (optional)"
                  value={title}
                  onChange={(e) => {
                    setTitle(e.target.value);
                    save(e.target.value, paragraphs);
                  }}
                  style={{
                    width: "100%",
                    border: "none", background: "transparent", outline: "none",
                    fontFamily: "var(--ambo-font-reading)",
                    fontSize: 32, fontStyle: "italic", fontWeight: 400,
                    letterSpacing: "-0.01em",
                    color: "var(--ambo-text-primary)",
                    lineHeight: 1.2,
                    padding: 0,
                    marginBottom: 16,
                  }}
                />

                {/* Divider */}
                <div style={{ height: 1, background: "var(--ambo-border)", marginBottom: 16 }} />

                {/* Formatting ribbon — sticky below header */}
                <div style={{
                  position: "sticky", top: 72,
                  zIndex: 10, marginBottom: 24,
                  display: "flex", justifyContent: "flex-start",
                }}>
                  <div style={{
                    display: "inline-flex", alignItems: "center",
                    gap: 2, height: 34, padding: "0 5px",
                    borderRadius: 999,
                    border: "1px solid var(--ambo-border)",
                    background: "var(--ambo-surface-solid)",
                    boxShadow: "var(--ambo-shadow-sm, 0 1px 2px rgba(0,0,0,0.04))",
                  }}>
                    <RibbonButton label="Bold" kbd="⌘B" onClick={() => applyRibbonMark("**")}>
                      <span style={{ fontFamily: "var(--ambo-font-reading)", fontSize: 14, fontWeight: 700, lineHeight: 1 }}>B</span>
                    </RibbonButton>
                    <RibbonButton label="Italic" kbd="⌘I" onClick={() => applyRibbonMark("_")}>
                      <span style={{ fontFamily: "var(--ambo-font-reading)", fontSize: 14, fontStyle: "italic", lineHeight: 1 }}>I</span>
                    </RibbonButton>
                    <RibbonButton label="Quote" onClick={insertQuote}>
                      <svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 7h4v5H3zM10 7h4v5h-4z"/>
                        <path d="M7 12c0 2-2 3-2 3M14 12c0 2-2 3-2 3"/>
                      </svg>
                    </RibbonButton>
                  </div>
                </div>

                {/* Rich editor */}
                <div className="ambo-rich-editor-wrap">
                  <RichEditor
                    key={editorMountKey}
                    initialHtml={initialHtml}
                    onReady={(editor) => {
                      editorRef.current = editor;
                    }}
                    onUpdate={(editor) => {
                      const next = paragraphsFromDoc(editor.getJSON());
                      setParagraphs(next);
                      save(title, next);
                    }}
                    placeholder="Begin writing…"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── Status bar ──────────────────────────────────────────────────── */}
        {mode === "write" && (
          <div style={{
            position: "fixed", bottom: 0, left: 0, right: 0,
            padding: "12px 24px",
            background: "var(--ambo-surface-raised)",
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
            borderTop: "1px solid var(--ambo-border)",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 16,
          }}>
            <span style={{ fontSize: 12, color: "var(--ambo-text-muted)" }}>
              {saveStatus === "saving" ? "Saving…" : saveStatus === "saved" ? "Saved" : "Unsaved changes"}
            </span>
          </div>
        )}

        {/* ── Immersive Exit pill — tablet/phone only; desktop retains header ── */}
        {mode === "preach" && stepLocked && !isDesktop && (
          <div style={{
            position: "fixed", top: 16, left: "50%",
            transform: "translateX(-50%)", zIndex: 160,
          }}>
            <PillButton
              variant="ghost"
              className="preach-exit-pulse"
              onClick={() => {
                setImmersiveVersion((v) => v + 1);
                setHeaderHidden(false);
                setStepLocked(false);
              }}
              style={{ height: 34, padding: "0 14px" }}
            >
              Exit
            </PillButton>
          </div>
        )}
      </div>
    </>
  );
}
