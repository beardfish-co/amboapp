"use client";

// MobileEchoWorkspace — three-screen sequential Echo flow for mobile viewports.
// Screen 1: Output type selection
// Screen 2: Variant selection (Parish Reflection / Social Post only)
// Screen 3: Generation, editing, and action pills

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

// ── Shared types (mirrored from EchoWorkspace) ────────────────────────────────

interface ArchiveEntry {
  id: string;
  output_type: string;
  variant: string | null;
  output_text: string;
  generated_text: string;
  homily_id: string | null;
  created_at: string;
  updated_at: string;
  homily_title: string | null;
  homily_sunday_date: string | null;
}

type EchoOutputType =
  | "take-into-the-week"
  | "parish-reflection"
  | "social-post"
  | "small-group-questions"
  | "prayer-prompt";

type ParishReflectionVariant = "short" | "standard" | "longer";
type SocialPostVariant       = "before-sunday" | "after-sunday";

export interface MobileEchoWorkspaceProps {
  sundayLabel:   string;
  open:          boolean;
  onClose:       () => void;
  homilyText?:   string;
  homilyId?:     string;
  initialEntry?: ArchiveEntry;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const DEMO_MODE_ENABLED =
  process.env.NEXT_PUBLIC_AMBO_DEMO_MODE_ENABLED === "true";

const DEMO_HOMILY_TEXT = `Brothers and sisters, today's Gospel brings us face to face with a question that echoes through every human heart: "Do you love me?"`;

const OUTPUT_TYPES: {
  id: EchoOutputType;
  label: string;
  desc: string;
  hasVariant: boolean;
}[] = [
  { id: "take-into-the-week",    label: "Take Into the Week",    desc: "A spoken reflection for the end of Mass",      hasVariant: false },
  { id: "parish-reflection",     label: "Parish Reflection",     desc: "For newsletters and bulletins",                hasVariant: true  },
  { id: "social-post",           label: "Social Post",           desc: "For Facebook, Instagram, parish socials",      hasVariant: true  },
  { id: "small-group-questions", label: "Small Group Questions", desc: "Discussion questions for groups",              hasVariant: false },
  { id: "prayer-prompt",         label: "Prayer Prompt",         desc: "A short prayer for the week",                 hasVariant: false },
];

const PARISH_VARIANTS: { id: ParishReflectionVariant; label: string; desc: string }[] = [
  { id: "short",    label: "Short",    desc: "Around 80 words"   },
  { id: "standard", label: "Standard", desc: "Around 175 words"  },
  { id: "longer",   label: "Longer",   desc: "Around 350 words"  },
];

const SOCIAL_VARIANTS: { id: SocialPostVariant; label: string; desc: string }[] = [
  { id: "before-sunday", label: "Before Sunday", desc: "Anticipating the homily" },
  { id: "after-sunday",  label: "After Sunday",  desc: "Echoing the homily"      },
];

type MobileScreen = "type-select" | "variant-select" | "generation";

const TRANSITION_MS = 700;

// ── Small type icons (matching EchoWorkspace desktop icons) ───────────────────

function TypeIcon({ id }: { id: EchoOutputType }) {
  const s: React.CSSProperties = { width: 18, height: 18, display: "block", flexShrink: 0, color: "var(--ambo-accent)" };
  switch (id) {
    case "take-into-the-week":
      return <svg style={s} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M5 10h10M11 6l4 4-4 4"/></svg>;
    case "parish-reflection":
      return <svg style={s} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M5 3h7l4 4v10a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/><path d="M12 3v4h4M7 11h6M7 14h4"/></svg>;
    case "social-post":
      return <svg style={s} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="15" cy="5" r="2"/><circle cx="5" cy="10" r="2"/><circle cx="15" cy="15" r="2"/><path d="M7 9l6-3M7 11l6 3"/></svg>;
    case "small-group-questions":
      return <svg style={s} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H8l-4 3V14z"/></svg>;
    case "prayer-prompt":
      return <svg style={s} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M10 3v14M4 8h12"/></svg>;
    default: return null;
  }
}

// ── Pill action icons ─────────────────────────────────────────────────────────

function SaveIcon()     { return <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4a1 1 0 0 1 1-1h8l4 4v9a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V4z"/><rect x="7" y="13" width="6" height="4" rx="0.5"/><rect x="7" y="3" width="5" height="3" rx="0.5"/></svg>; }
function CopyIcon()     { return <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="7" y="7" width="10" height="10" rx="2"/><path d="M3 13V5a2 2 0 0 1 2-2h8"/></svg>; }
function DownloadIcon() { return <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M10 3v10M6 9l4 4 4-4"/><path d="M3 16h14"/></svg>; }
function EmailIcon()    { return <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="16" height="13" rx="2"/><path d="M2 7l8 5 8-5"/></svg>; }
function BackIcon()     { return <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5l-6 5 6 5"/></svg>; }
function CloseIcon()    { return <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M5 5l10 10M15 5L5 15"/></svg>; }

// ── Main component ─────────────────────────────────────────────────────────────

export default function MobileEchoWorkspace({
  sundayLabel,
  open,
  onClose,
  homilyText,
  homilyId,
  initialEntry,
}: MobileEchoWorkspaceProps) {

  // ── Screen navigation state ──────────────────────────────────────────────────
  const [currentScreen, setCurrentScreen]   = useState<MobileScreen>("type-select");
  const [exitingScreen,  setExitingScreen]   = useState<MobileScreen | null>(null);
  const [screenKey,      setScreenKey]       = useState(0);  // increments on each nav
  const [direction,      setDirection]       = useState<"forward" | "backward">("forward");

  // ── Selection state ──────────────────────────────────────────────────────────
  const [selectedType,     setSelectedType]     = useState<EchoOutputType>("take-into-the-week");
  const [parishVariant,    setParishVariant]    = useState<ParishReflectionVariant>("standard");
  const [socialVariant,    setSocialVariant]    = useState<SocialPostVariant>("before-sunday");

  // ── Generation state ─────────────────────────────────────────────────────────
  const [streaming,        setStreaming]        = useState(false);
  const [outputText,       setOutputText]       = useState("");
  const [generatedText,    setGeneratedText]    = useState("");
  const [hasOutput,        setHasOutput]        = useState(false);
  const [error,            setError]            = useState<string | null>(null);

  // ── Composing animation state ────────────────────────────────────────────────
  const [composingVisible, setComposingVisible] = useState(false);
  const [composingExiting, setComposingExiting] = useState(false);
  const composingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // ── Save / copy state ────────────────────────────────────────────────────────
  const [savedId,       setSavedId]       = useState<string | null>(null);
  const [saveStatus,    setSaveStatus]    = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [copyStatus,    setCopyStatus]    = useState<"idle" | "copied">("idle");

  // ── Unsaved edits guard ──────────────────────────────────────────────────────
  const [pendingAction, setPendingAction] = useState<"back" | "close" | "regenerate" | null>(null);

  // ── Workspace close animation ────────────────────────────────────────────────
  const [closing, setClosing] = useState(false);

  // ── Homily text (fetched from DB when homilyId present, homilyText absent) ───
  const [fetchedHomilyText, setFetchedHomilyText] = useState("");

  const resolvedHomilyText: string | null =
    homilyText && homilyText.trim().length > 0 ? homilyText
    : fetchedHomilyText.trim().length > 0      ? fetchedHomilyText
    : DEMO_MODE_ENABLED                        ? DEMO_HOMILY_TEXT
    : null;

  // Fetch homily from DB when homilyId present but homilyText absent
  useEffect(() => {
    if (!open) { setFetchedHomilyText(""); return; }
    if (homilyText && homilyText.trim().length > 0) return;
    if (!homilyId) return;
    const supabase = createClient();
    supabase.from("homilies").select("content").eq("id", homilyId).single()
      .then(({ data, error: err }) => {
        if (err) { console.error("[MobileEcho] homily fetch:", err.message); return; }
        if (data?.content) setFetchedHomilyText(data.content);
      });
  }, [open, homilyId, homilyText]);

  // ── Resolved variant for generation ─────────────────────────────────────────
  const resolvedVariant =
    selectedType === "parish-reflection" ? parishVariant
    : selectedType === "social-post"     ? socialVariant
    : undefined;

  // ── Unsaved edits detection ──────────────────────────────────────────────────
  const hasUnsavedEdits =
    hasOutput && !streaming && outputText.length > 0 && outputText !== generatedText;

  // ── Screen navigation ────────────────────────────────────────────────────────
  const navigateTo = useCallback((screen: MobileScreen, dir: "forward" | "backward") => {
    setExitingScreen(currentScreen);
    setDirection(dir);
    setCurrentScreen(screen);
    setScreenKey(k => k + 1);
    setTimeout(() => setExitingScreen(null), TRANSITION_MS + 50);
  }, [currentScreen]);

  // ── Generation ────────────────────────────────────────────────────────────────
  const handleGenerate = useCallback(async () => {
    if (streaming) return;
    if (!resolvedHomilyText) {
      setError("Could not load this homily. Please try again, or contact support if the problem persists.");
      return;
    }
    setStreaming(true);
    setHasOutput(true);
    setOutputText("");
    setGeneratedText("");
    setSavedId(null);
    setSaveStatus("idle");
    setError(null);
    let accumulated = "";
    try {
      const res = await fetch("/api/echo/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ homilyText: resolvedHomilyText, outputType: selectedType, variant: resolvedVariant }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error ?? `Server error ${res.status}`);
      }
      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response body");
      const decoder = new TextDecoder();
      let done = false;
      while (!done) {
        const { value, done: readerDone } = await reader.read();
        done = readerDone;
        if (value) { const chunk = decoder.decode(value, { stream: !done }); accumulated += chunk; setOutputText(p => p + chunk); }
      }
      setGeneratedText(accumulated);
    } catch (err) {
      console.error("[MobileEcho] generation error:", err);
      setError(err instanceof Error ? err.message : "Generation failed. Please try again.");
      setHasOutput(false);
    } finally {
      setStreaming(false);
    }
  }, [streaming, resolvedHomilyText, selectedType, resolvedVariant]);

  // ── Composing animation (mirrors desktop) ────────────────────────────────────
  useEffect(() => {
    if (streaming) {
      if (composingTimerRef.current) { clearTimeout(composingTimerRef.current); composingTimerRef.current = null; }
      setComposingVisible(true);
      setComposingExiting(false);
    } else if (composingVisible) {
      setComposingExiting(true);
      composingTimerRef.current = setTimeout(() => {
        setComposingVisible(false);
        setComposingExiting(false);
        composingTimerRef.current = null;
      }, 650);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streaming]);

  // ── Textarea auto-resize — grows with content so parent div scrolls ─────────
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = ta.scrollHeight + "px";
  }, [outputText]);

  // ── Save ──────────────────────────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    if (saveStatus === "saving" || !hasOutput || outputText.trim().length === 0) return;
    setSaveStatus("saving");
    try {
      const res = await fetch("/api/echo/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          outputType: selectedType,
          variant: resolvedVariant ?? null,
          generatedText: generatedText || outputText,
          outputText,
          homilyId: homilyId ?? undefined,
        }),
      });
      if (!res.ok) throw new Error(`Save failed: ${res.status}`);
      const { id } = await res.json();
      setSavedId(id);
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 2000);
    } catch (err) {
      console.error("[MobileEcho] save error:", err);
      setSaveStatus("error");
    }
  }, [saveStatus, hasOutput, outputText, selectedType, resolvedVariant, generatedText, homilyId]);

  // ── Copy ──────────────────────────────────────────────────────────────────────
  const handleCopy = useCallback(async () => {
    if (!outputText) return;
    try {
      await navigator.clipboard.writeText(outputText);
      setCopyStatus("copied");
      setTimeout(() => setCopyStatus("idle"), 1500);
    } catch (err) { console.error("[MobileEcho] clipboard error:", err); }
  }, [outputText]);

  // ── Download ──────────────────────────────────────────────────────────────────
  const handleDownload = useCallback(async () => {
    if (!outputText) return;
    const typeLabels: Record<EchoOutputType, string> = {
      "take-into-the-week": "Take Into the Week", "parish-reflection": "Parish Reflection",
      "social-post": "Social Post", "small-group-questions": "Small Group Questions",
      "prayer-prompt": "Prayer Prompt",
    };
    const shortLabel  = sundayLabel.split("·")[0].trim();
    const dateStr     = new Date().toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" });
    const attribution = `From a homily preached on the ${sundayLabel.replace(" ·", ",")}, ${dateStr}`;
    const filename    = `Echo - ${typeLabels[selectedType]} - ${shortLabel} - ${dateStr}.docx`;
    try {
      const res = await fetch("/api/echo/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: outputText, outputType: selectedType, attribution }),
      });
      if (!res.ok) throw new Error(`Download API returned ${res.status}`);
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href = url; a.download = filename;
      document.body.appendChild(a); a.click();
      document.body.removeChild(a); URL.revokeObjectURL(url);
    } catch (err) {
      console.error("[MobileEcho] download error:", err);
      const blob = new Blob([outputText], { type: "text/plain;charset=utf-8" });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href = url; a.download = filename.replace(".docx", ".txt");
      document.body.appendChild(a); a.click();
      document.body.removeChild(a); URL.revokeObjectURL(url);
    }
  }, [outputText, sundayLabel, selectedType]);

  // ── Email ──────────────────────────────────────────────────────────────────────
  const handleEmail = useCallback(() => {
    if (!outputText) return;
    const typeLabels: Record<EchoOutputType, string> = {
      "take-into-the-week": "Take Into the Week", "parish-reflection": "Parish Reflection",
      "social-post": "Social Post", "small-group-questions": "Small Group Questions",
      "prayer-prompt": "Prayer Prompt",
    };
    const subject = `${typeLabels[selectedType]} — ${sundayLabel}`;
    window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(outputText)}`;
  }, [outputText, selectedType, sundayLabel]);

  // ── Guard helpers ─────────────────────────────────────────────────────────────
  const guardIfUnsaved = useCallback((action: "back" | "close" | "regenerate"): boolean => {
    if (hasUnsavedEdits) { setPendingAction(action); return true; }
    return false;
  }, [hasUnsavedEdits]);

  const handleGuardSave = useCallback(async () => {
    const action = pendingAction;
    await handleSave();
    if (action === "close") {
      setClosing(true);
      setTimeout(() => { setClosing(false); onClose(); }, 780);
    } else if (action === "regenerate") {
      setOutputText(""); setGeneratedText(""); setSavedId(null); setSaveStatus("idle");
      handleGenerate();
    } else if (action === "back") {
      // navigate back after saving
      const prevScreen: MobileScreen =
        currentScreen === "generation"
          ? (OUTPUT_TYPES.find(t => t.id === selectedType)?.hasVariant ? "variant-select" : "type-select")
          : "type-select";
      navigateTo(prevScreen, "backward");
    }
    setPendingAction(null);
  }, [pendingAction, handleSave, handleGenerate, onClose, currentScreen, selectedType, navigateTo]);

  const handleGuardDiscard = useCallback(() => {
    const action = pendingAction;
    setOutputText(generatedText); setSaveStatus("idle");
    setPendingAction(null);
    if (action === "close") {
      setClosing(true);
      setTimeout(() => { setClosing(false); onClose(); }, 780);
    } else if (action === "regenerate") {
      setOutputText(""); setGeneratedText(""); setSavedId(null); setSaveStatus("idle");
      handleGenerate();
    } else if (action === "back") {
      const prevScreen: MobileScreen =
        currentScreen === "generation"
          ? (OUTPUT_TYPES.find(t => t.id === selectedType)?.hasVariant ? "variant-select" : "type-select")
          : "type-select";
      navigateTo(prevScreen, "backward");
    }
  }, [pendingAction, generatedText, handleGenerate, onClose, currentScreen, selectedType, navigateTo]);

  const handleGuardCancel = useCallback(() => setPendingAction(null), []);

  // ── Close ──────────────────────────────────────────────────────────────────────
  const handleClose = useCallback(() => {
    if (closing) return;
    if (guardIfUnsaved("close")) return;
    setClosing(true);
    setTimeout(() => { setClosing(false); onClose(); }, 780);
  }, [closing, guardIfUnsaved, onClose]);

  // ── Back navigation ────────────────────────────────────────────────────────────
  const handleBack = useCallback(() => {
    if (currentScreen === "generation" && guardIfUnsaved("back")) return;
    const prevScreen: MobileScreen =
      currentScreen === "generation"
        ? (OUTPUT_TYPES.find(t => t.id === selectedType)?.hasVariant ? "variant-select" : "type-select")
        : "type-select";
    navigateTo(prevScreen, "backward");
  }, [currentScreen, selectedType, guardIfUnsaved, navigateTo]);

  // ── Type row tap ───────────────────────────────────────────────────────────────
  const handleTypeSelect = useCallback((type: EchoOutputType) => {
    const typeData = OUTPUT_TYPES.find(t => t.id === type)!;
    setSelectedType(type);
    // Reset generation state for a fresh run
    setOutputText(""); setGeneratedText(""); setHasOutput(false);
    setError(null); setSavedId(null); setSaveStatus("idle");
    if (typeData.hasVariant) {
      navigateTo("variant-select", "forward");
    } else {
      navigateTo("generation", "forward");
    }
  }, [navigateTo]);

  // ── Variant row tap ────────────────────────────────────────────────────────────
  const handleVariantSelect = useCallback((variant: ParishReflectionVariant | SocialPostVariant) => {
    if (selectedType === "parish-reflection") setParishVariant(variant as ParishReflectionVariant);
    else setSocialVariant(variant as SocialPostVariant);
    navigateTo("generation", "forward");
  }, [selectedType, navigateTo]);

  // ── Regenerate ─────────────────────────────────────────────────────────────────
  const handleRegenerate = useCallback(() => {
    if (guardIfUnsaved("regenerate")) return;
    setOutputText(""); setGeneratedText(""); setSavedId(null); setSaveStatus("idle");
    handleGenerate();
  }, [guardIfUnsaved, handleGenerate]);

  // ── Reset and pre-load on open ─────────────────────────────────────────────────
  useEffect(() => {
    if (open) {
      if (initialEntry) {
        // Pre-load saved echo — land directly on Screen 3
        setSelectedType(initialEntry.output_type as EchoOutputType);
        if (initialEntry.output_type === "parish-reflection" && initialEntry.variant)
          setParishVariant(initialEntry.variant as ParishReflectionVariant);
        if (initialEntry.output_type === "social-post" && initialEntry.variant)
          setSocialVariant(initialEntry.variant as SocialPostVariant);
        setOutputText(initialEntry.output_text ?? initialEntry.generated_text ?? "");
        setGeneratedText(initialEntry.output_text ?? initialEntry.generated_text ?? "");
        setHasOutput(true);
        setSavedId(initialEntry.id);
        setCurrentScreen("generation");
      } else {
        setCurrentScreen("type-select");
        setSelectedType("take-into-the-week");
        setOutputText(""); setGeneratedText(""); setHasOutput(false);
      }
      setError(null); setSavedId(initialEntry?.id ?? null);
      setSaveStatus("idle"); setCopyStatus("idle"); setPendingAction(null);
      setExitingScreen(null); setScreenKey(0);
      if (composingTimerRef.current) { clearTimeout(composingTimerRef.current); composingTimerRef.current = null; }
      setComposingVisible(false); setComposingExiting(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // ── Auto-generate when landing on generation screen ───────────────────────────
  const didAutoGenerate = useRef(false);
  useEffect(() => {
    if (currentScreen === "generation" && !hasOutput && !initialEntry) {
      if (!didAutoGenerate.current) {
        didAutoGenerate.current = true;
        handleGenerate();
      }
    } else {
      didAutoGenerate.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentScreen]);

  if (!open) return null;

  // ── Shared styles ──────────────────────────────────────────────────────────────

  const screenAnim = (role: "enter" | "exit"): string => {
    if (role === "enter") return direction === "forward" ? "slideInRight" : "slideInLeft";
    return direction === "forward" ? "slideOutLeft" : "slideOutRight";
  };

  const containerStyle: React.CSSProperties = {
    position:   "fixed",
    inset:      0,
    zIndex:     200,
    background: "var(--ambo-bg)",
    overflow:   "hidden",
    animation:  closing ? `fadeOut 780ms ease-out both` : `fadeIn 600ms ease-out both`,
  };

  const screenStyle = (role: "enter" | "exit"): React.CSSProperties => ({
    position:  "absolute",
    inset:     0,
    display:   "flex",
    flexDirection: "column",
    animation: `${screenAnim(role)} ${TRANSITION_MS}ms cubic-bezier(0.22, 1, 0.36, 1) both`,
  });

  // Restrained source title shown in every top bar
  const sourceTitle = `from your ${sundayLabel.toLowerCase()} homily`;

  // ── Top bar shared sub-components ────────────────────────────────────────────

  const topBarBase: React.CSSProperties = {
    display: "flex", alignItems: "flex-start", justifyContent: "space-between",
    padding: "18px 20px 14px",
    flexShrink: 0,
    borderBottom: "1px solid var(--ambo-border)",
    background:  "var(--ambo-bg)",
    minHeight:   72,
  };

  const sourceTitleStyle: React.CSSProperties = {
    fontFamily:  "var(--ambo-font-reading)",
    fontSize:    13,
    fontStyle:   "italic",
    fontWeight:  400,
    color:       "var(--ambo-text-muted)",
    letterSpacing: "0.01em",
    lineHeight:  1.35,
    flex:        1,
    paddingTop:  2,
  };

  const iconBtnStyle: React.CSSProperties = {
    background: "none", border: "none", cursor: "pointer",
    padding:    6, borderRadius: 8, lineHeight: 0,
    color:      "var(--ambo-text-muted)",
    flexShrink: 0,
  };

  // ── Row shared style ──────────────────────────────────────────────────────────
  const rowStyle: React.CSSProperties = {
    display:    "flex",
    alignItems: "center",
    gap:        16,
    padding:    "20px 24px",
    cursor:     "pointer",
    background: "none",
    border:     "none",
    width:      "100%",
    textAlign:  "left",
    borderBottom: "1px solid var(--ambo-rule-subtle)",
    WebkitTapHighlightColor: "transparent",
    transition: "background 120ms ease",
    minHeight:  76,
  };

  // ── Pill action button ────────────────────────────────────────────────────────
  const pillStyle = (active?: boolean): React.CSSProperties => ({
    display:    "inline-flex",
    alignItems: "center",
    gap:        5,
    padding:    "9px 14px",
    borderRadius: "var(--ambo-radius-pill)",
    border:     "1px solid var(--ambo-border)",
    background: active ? "var(--ambo-surface-solid)" : "transparent",
    boxShadow:  active ? "var(--ambo-shadow-sm)" : "none",
    color:      active ? "var(--ambo-accent)" : "var(--ambo-text-secondary)",
    fontFamily: "var(--ambo-font-ui)",
    fontSize:   12,
    fontWeight: 500,
    cursor:     hasOutput && !streaming ? "pointer" : "default",
    opacity:    hasOutput && !streaming ? 1 : 0.4,
    transition: "all 200ms var(--ambo-ease)",
    whiteSpace: "nowrap",
    WebkitTapHighlightColor: "transparent",
    letterSpacing: "0.01em",
    lineHeight: 1,
  });

  // ── Render ────────────────────────────────────────────────────────────────────

  const labelFor = (type: EchoOutputType) => OUTPUT_TYPES.find(t => t.id === type)?.label ?? type;
  const variantLabel =
    selectedType === "parish-reflection"
      ? PARISH_VARIANTS.find(v => v.id === parishVariant)?.label
      : selectedType === "social-post"
      ? SOCIAL_VARIANTS.find(v => v.id === socialVariant)?.label
      : undefined;

  const typeVariantLabel = variantLabel ? `${labelFor(selectedType)} · ${variantLabel}` : labelFor(selectedType);

  return (
    <div style={containerStyle}>

      {/* ── Exiting screen (animates out simultaneously) ────────────────── */}
      {exitingScreen && (
        <div key={`exit-${screenKey}`} style={screenStyle("exit")}>
          {exitingScreen === "type-select"    && <Screen1Content />}
          {exitingScreen === "variant-select" && <Screen2Content />}
          {exitingScreen === "generation"     && <Screen3Content />}
        </div>
      )}

      {/* ── Current screen (animates in) ───────────────────────────────── */}
      <div key={`enter-${screenKey}`} style={screenStyle("enter")}>
        {currentScreen === "type-select"    && <Screen1Content />}
        {currentScreen === "variant-select" && <Screen2Content />}
        {currentScreen === "generation"     && <Screen3Content />}
      </div>

      {/* ── Unsaved-edits guard overlay ─────────────────────────────────── */}
      {pendingAction && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 300,
          background: "rgba(39, 53, 72, 0.45)",
          display: "flex", alignItems: "flex-end",
          animation: "fadeIn 200ms ease-out both",
        }}>
          <div style={{
            width: "100%", background: "var(--ambo-surface-solid)",
            borderRadius: "20px 20px 0 0",
            padding: "28px 24px calc(28px + env(safe-area-inset-bottom))",
            boxShadow: "var(--ambo-shadow-lg)",
            animation: "slideInUp 300ms cubic-bezier(0.22, 1, 0.36, 1) both",
          }}>
            <p style={{ fontFamily: "var(--ambo-font-ui)", fontSize: 16, fontWeight: 600, color: "var(--ambo-text-primary)", marginBottom: 8 }}>
              Unsaved edits
            </p>
            <p style={{ fontFamily: "var(--ambo-font-ui)", fontSize: 14, color: "var(--ambo-text-secondary)", marginBottom: 28, lineHeight: 1.5 }}>
              You have unsaved edits. Save before continuing?
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <button onClick={handleGuardSave} style={{
                width: "100%", padding: "14px", borderRadius: "var(--ambo-radius)",
                background: "var(--ambo-accent)", border: "none",
                color: "#fff", fontFamily: "var(--ambo-font-ui)", fontSize: 15, fontWeight: 600,
                cursor: "pointer",
              }}>Save</button>
              <button onClick={handleGuardDiscard} style={{
                width: "100%", padding: "14px", borderRadius: "var(--ambo-radius)",
                background: "transparent", border: "1px solid var(--ambo-border)",
                color: "var(--ambo-text-secondary)", fontFamily: "var(--ambo-font-ui)", fontSize: 15, fontWeight: 500,
                cursor: "pointer",
              }}>Discard</button>
              <button onClick={handleGuardCancel} style={{
                width: "100%", padding: "14px", borderRadius: "var(--ambo-radius)",
                background: "transparent", border: "none",
                color: "var(--ambo-text-muted)", fontFamily: "var(--ambo-font-ui)", fontSize: 15,
                cursor: "pointer",
              }}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  // ── Screen 1: Output type selection ──────────────────────────────────────────
  function Screen1Content() {
    return (
      <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
        {/* Top bar */}
        <div style={{ ...topBarBase, justifyContent: "space-between" }}>
          <div style={{ flex: 1 }}>
            <p style={sourceTitleStyle}>{sourceTitle}</p>
          </div>
          <button onClick={handleClose} style={iconBtnStyle} aria-label="Close Echo">
            <CloseIcon />
          </button>
        </div>

        {/* Title block */}
        <div style={{ padding: "36px 24px 24px", textAlign: "center", flexShrink: 0 }}>
          <p style={{
            fontFamily: "var(--ambo-font-reading)", fontSize: 26, fontStyle: "italic",
            fontWeight: 400, color: "var(--ambo-text-primary)", marginBottom: 8, letterSpacing: "-0.01em",
          }}>
            Echo
          </p>
          <p style={{
            fontFamily: "var(--ambo-font-reading)", fontSize: 14, fontStyle: "italic",
            fontWeight: 400, color: "var(--ambo-text-muted)", letterSpacing: "0.01em",
          }}>
            five ways to carry the word forward
          </p>
        </div>

        {/* Output type rows */}
        <div style={{ flex: 1, overflowY: "auto" }}>
          {OUTPUT_TYPES.map((type) => (
            <button
              key={type.id}
              style={rowStyle}
              onClick={() => handleTypeSelect(type.id)}
              onMouseDown={e => (e.currentTarget.style.background = "var(--ambo-accent-faint)")}
              onMouseUp={e   => (e.currentTarget.style.background = "none")}
              onMouseLeave={e => (e.currentTarget.style.background = "none")}
              onTouchStart={e => (e.currentTarget.style.background = "var(--ambo-accent-faint)")}
              onTouchEnd={e   => (e.currentTarget.style.background = "none")}
            >
              <div style={{ flexShrink: 0, paddingTop: 1 }}>
                <TypeIcon id={type.id} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{
                  fontFamily: "var(--ambo-font-ui)", fontSize: 15, fontWeight: 500,
                  color: "var(--ambo-text-primary)", marginBottom: 3, letterSpacing: "0.01em",
                }}>
                  {type.label}
                </p>
                <p style={{
                  fontFamily: "var(--ambo-font-ui)", fontSize: 13, fontWeight: 400,
                  color: "var(--ambo-text-muted)", lineHeight: 1.4,
                }}>
                  {type.desc}
                </p>
              </div>
              <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="var(--ambo-text-muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, opacity: 0.5 }}>
                <path d="M8 5l5 5-5 5"/>
              </svg>
            </button>
          ))}
        </div>
      </div>
    );
  }

  // ── Screen 2: Variant selection ───────────────────────────────────────────────
  function Screen2Content() {
    const variants = selectedType === "parish-reflection" ? PARISH_VARIANTS : SOCIAL_VARIANTS;
    const prompt   = selectedType === "parish-reflection" ? "How long?" : "When are you sharing this?";
    return (
      <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
        {/* Top bar */}
        <div style={{ ...topBarBase }}>
          <button onClick={handleBack} style={{ ...iconBtnStyle, marginRight: 8, marginTop: 1 }} aria-label="Back">
            <BackIcon />
          </button>
          <div style={{ flex: 1 }}>
            <p style={sourceTitleStyle}>{sourceTitle}</p>
            <p style={{
              fontFamily: "var(--ambo-font-ui)", fontSize: 12, fontWeight: 500,
              color: "var(--ambo-text-secondary)", marginTop: 4, letterSpacing: "0.02em",
              textTransform: "lowercase",
            }}>
              {labelFor(selectedType)}
            </p>
          </div>
          <button onClick={handleClose} style={{ ...iconBtnStyle, marginTop: 1 }} aria-label="Close Echo">
            <CloseIcon />
          </button>
        </div>

        {/* Prompt */}
        <div style={{ padding: "36px 24px 24px", textAlign: "center", flexShrink: 0 }}>
          <p style={{
            fontFamily: "var(--ambo-font-reading)", fontSize: 20, fontStyle: "italic",
            fontWeight: 400, color: "var(--ambo-text-primary)", letterSpacing: "0.01em",
          }}>
            {prompt}
          </p>
        </div>

        {/* Variant rows */}
        <div style={{ flex: 1, overflowY: "auto" }}>
          {variants.map((v) => (
            <button
              key={v.id}
              style={rowStyle}
              onClick={() => handleVariantSelect(v.id as ParishReflectionVariant | SocialPostVariant)}
              onMouseDown={e => (e.currentTarget.style.background = "var(--ambo-accent-faint)")}
              onMouseUp={e   => (e.currentTarget.style.background = "none")}
              onMouseLeave={e => (e.currentTarget.style.background = "none")}
              onTouchStart={e => (e.currentTarget.style.background = "var(--ambo-accent-faint)")}
              onTouchEnd={e   => (e.currentTarget.style.background = "none")}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{
                  fontFamily: "var(--ambo-font-ui)", fontSize: 15, fontWeight: 500,
                  color: "var(--ambo-text-primary)", marginBottom: 3,
                }}>
                  {v.label}
                </p>
                <p style={{
                  fontFamily: "var(--ambo-font-ui)", fontSize: 13, fontWeight: 400,
                  color: "var(--ambo-text-muted)", lineHeight: 1.4,
                }}>
                  {v.desc}
                </p>
              </div>
              <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="var(--ambo-text-muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, opacity: 0.5 }}>
                <path d="M8 5l5 5-5 5"/>
              </svg>
            </button>
          ))}
        </div>
      </div>
    );
  }

  // ── Screen 3: Generation and result ──────────────────────────────────────────
  function Screen3Content() {
    // Try Again slides in at completion via max-height transition.
    // Because the card is flex:1, as Try Again grows the card eases shorter —
    // the flex layout distributes the space change automatically, giving a
    // synchronised, animated card resize with no extra work.
    const tryAgainVisible = hasOutput && !streaming;

    return (
      <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
        {/* Top bar */}
        <div style={{ ...topBarBase, flexDirection: "column", gap: 4 }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", width: "100%" }}>
            <button onClick={handleBack} style={{ ...iconBtnStyle, marginRight: 8, marginTop: 1 }} aria-label="Back">
              <BackIcon />
            </button>
            <div style={{ flex: 1 }}>
              <p style={sourceTitleStyle}>{sourceTitle}</p>
              <p style={{
                fontFamily: "var(--ambo-font-ui)", fontSize: 12, fontWeight: 500,
                color: "var(--ambo-text-secondary)", marginTop: 4, letterSpacing: "0.02em",
              }}>
                {typeVariantLabel}
              </p>
            </div>
            <button onClick={handleClose} style={{ ...iconBtnStyle, marginTop: 1 }} aria-label="Close Echo">
              <CloseIcon />
            </button>
          </div>
        </div>

        {/* White card — structurally fixed. flex:1 fills all space between top
            bar and action area. Card eases shorter when Try Again slides in
            (flex redistribution is automatic and smooth). */}
        <div style={{
          flex: 1, margin: "16px 16px 0", borderRadius: "var(--ambo-radius-lg)",
          background: "var(--ambo-surface-solid)", boxShadow: "var(--ambo-shadow-md)",
          display: "flex", flexDirection: "column", overflow: "hidden",
          minHeight: 0,
        }}>
          {/* Scroll container — flex:1 + minHeight:0 is the standard pattern
              for a flex child that needs to scroll. minHeight:0 allows it to
              shrink below its natural content height so overflow:auto works. */}
          <div style={{
            flex: 1, minHeight: 0,
            overflowY: "auto",
            display: "flex", flexDirection: "column",
            padding: "24px 20px",
          }}>
            {/* Composing indicator — collapses + fades at completion */}
            {composingVisible && (
              <div style={{
                overflow: "hidden",
                maxHeight: composingExiting ? 0 : 40,
                opacity:   composingExiting ? 0 : 1,
                marginBottom: composingExiting ? 0 : 16,
                flexShrink: 0,
                transition: "max-height 1400ms cubic-bezier(0.22, 1, 0.36, 1), opacity 1200ms ease-out, margin-bottom 1400ms cubic-bezier(0.22, 1, 0.36, 1)",
              }}>
                <p style={{
                  fontFamily: "var(--ambo-font-reading)", fontSize: 14, fontStyle: "italic",
                  color: "var(--ambo-text-muted)", letterSpacing: "0.03em",
                }}>
                  Composing…
                </p>
              </div>
            )}

            {/* Error */}
            {error && (
              <p style={{
                fontFamily: "var(--ambo-font-ui)", fontSize: 14,
                color: "#c0392b", lineHeight: 1.5,
              }}>
                {error}
              </p>
            )}

            {/* Output textarea — ref-driven auto-resize so the scroll container
                (not the textarea) handles overflow. Short outputs fill the card
                with empty space below; long outputs cause the parent to scroll. */}
            {hasOutput && !error && (
              <textarea
                ref={textareaRef}
                value={outputText}
                onChange={e => setOutputText(e.target.value)}
                readOnly={streaming}
                style={{
                  width: "100%",
                  height: "auto",   // managed by the resize effect
                  minHeight: "100%", // at least fills the scroll container
                  resize: "none", border: "none", outline: "none",
                  background: "transparent",
                  fontFamily: "var(--ambo-font-reading)", fontSize: 16,
                  lineHeight: 1.7, color: "var(--ambo-text-primary)",
                  letterSpacing: "0.01em",
                  paddingBottom: 24,
                  boxSizing: "border-box",
                  overflowY: "hidden", // parent div does the scrolling
                }}
                aria-label="Generated text"
              />
            )}

            {/* Empty state — only before generation begins */}
            {!hasOutput && !error && (
              <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <p style={{
                  fontFamily: "var(--ambo-font-reading)", fontSize: 14, fontStyle: "italic",
                  color: "var(--ambo-text-muted)",
                }}>
                  Preparing…
                </p>
              </div>
            )}
          </div>
        </div>

        {/* ── Action area ────────────────────────────────────────────────────
            Pills are always fully visible — present from the moment Screen 3
            opens. Try Again slides in at completion via max-height + opacity,
            and the card eases shorter to match via flex redistribution. */}
        <div style={{
          flexShrink: 0,
          padding: "0 16px calc(16px + env(safe-area-inset-bottom))",
          display: "flex", flexDirection: "column",
          background: "var(--ambo-bg)",
        }}>
          {/* Try again — max-height slides it into the layout at completion.
              The growing height pushes the card (flex:1) to ease shorter,
              synchronised with the composing fade and text rise. */}
          <div style={{
            overflow: "hidden",
            maxHeight: tryAgainVisible ? 40 : 0,
            opacity:   tryAgainVisible ? 1 : 0,
            transition: "max-height 1400ms cubic-bezier(0.22, 1, 0.36, 1), opacity 1200ms ease-out",
          }}>
            <div style={{ textAlign: "center", paddingTop: 8 }}>
              <button
                onClick={handleRegenerate}
                style={{
                  background: "none", border: "none", cursor: "pointer",
                  fontFamily: "var(--ambo-font-ui)", fontSize: 12,
                  color: "var(--ambo-text-muted)", letterSpacing: "0.02em",
                  padding: "4px 8px",
                }}
              >
                ↺ try again
              </button>
            </div>
          </div>

          {/* Action pills — always visible at full opacity */}
          <div style={{
            display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap",
            paddingTop: 10, paddingBottom: 6,
          }}>
            <button onClick={handleSave} style={pillStyle(saveStatus === "saved")} disabled={!hasOutput || streaming}>
              <SaveIcon />
              <span>{saveStatus === "saving" ? "saving…" : saveStatus === "saved" ? "saved" : saveStatus === "error" ? "error" : "save"}</span>
            </button>
            <button onClick={handleCopy} style={pillStyle(copyStatus === "copied")} disabled={!hasOutput || streaming}>
              <CopyIcon />
              <span>{copyStatus === "copied" ? "copied" : "copy"}</span>
            </button>
            <button onClick={handleDownload} style={pillStyle()} disabled={!hasOutput || streaming}>
              <DownloadIcon />
              <span>download</span>
            </button>
            <button onClick={handleEmail} style={pillStyle()} disabled={!hasOutput || streaming}>
              <EmailIcon />
              <span>email</span>
            </button>
          </div>
        </div>
      </div>
    );
  }
}
