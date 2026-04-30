"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// ── Archive types ──────────────────────────────────────────────────────────

export interface ArchiveEntry {
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

// ── Types ──────────────────────────────────────────────────────────────────

type EchoOutputType =
  | "take-into-the-week"
  | "parish-reflection"
  | "social-post"
  | "small-group-questions"
  | "prayer-prompt";

// Parish Reflection length variants
type ParishReflectionVariant = "short" | "standard" | "longer";
const PARISH_REFLECTION_VARIANTS: { id: ParishReflectionVariant; label: string; hint: string }[] = [
  { id: "short",    label: "Short",    hint: "~80 words" },
  { id: "standard", label: "Standard", hint: "~175 words" },
  { id: "longer",   label: "Longer",   hint: "~350 words" },
];

// Social Post timing variants
type SocialPostVariant = "before-sunday" | "after-sunday";
const SOCIAL_POST_VARIANTS: { id: SocialPostVariant; label: string }[] = [
  { id: "before-sunday", label: "Before Sunday" },
  { id: "after-sunday",  label: "After Sunday" },
];

interface EchoTab {
  id: EchoOutputType;
  label: string;
  description: string;
}

interface EchoWorkspaceProps {
  /** e.g. "5th Sunday of Easter · Year C" */
  sundayLabel: string;
  open: boolean;
  onClose: () => void;
  /**
   * The priest's homily text, used as the source for Echo generation.
   * TODO: wire this from the homily picker when that feature is implemented.
   * For now a demo placeholder is used if this prop is absent.
   */
  homilyText?: string;
  /** UUID of the source homily, passed through to the save API when present */
  homilyId?: string;
  /** Pre-load a saved Echo output into the workspace (from Archive in drawer) */
  initialEntry?: ArchiveEntry;
}

// ── Constants ──────────────────────────────────────────────────────────────

const ECHO_TABS: EchoTab[] = [
  {
    id: "take-into-the-week",
    label: "Take Into the Week",
    description:
      "A spoken reflection for the end of Mass — a single, quiet note the congregation can carry home. Around fifty to eighty words.",
  },
  {
    id: "parish-reflection",
    label: "Parish Reflection",
    description:
      "For newsletters and bulletins. A contemplative reflection drawn from the homily — available in Short, Standard, and Longer lengths.",
  },
  {
    id: "social-post",
    label: "Social Post",
    description:
      "For Facebook, Instagram, or the parish website. One resonant note from the homily, shaped for social sharing — before or after Sunday.",
  },
  {
    id: "small-group-questions",
    label: "Small Group Questions",
    description:
      "Three to five discussion questions for faith-sharing groups, drawing the homily into lived conversation.",
  },
  {
    id: "prayer-prompt",
    label: "Prayer Prompt",
    description:
      "A short prayer drawn from the homily — forty to eighty words — for personal or communal use through the week.",
  },
];

// ── Small icons for each Echo output type ─────────────────────────────────
function EchoTabIcon({ id }: { id: EchoOutputType }) {
  const s = { width: 12, height: 12, display: "block" as const, flexShrink: 0 };
  switch (id) {
    case "take-into-the-week":
      return <svg {...s} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M5 10h10M11 6l4 4-4 4"/></svg>;
    case "parish-reflection":
      return <svg {...s} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M5 3h7l4 4v10a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/><path d="M12 3v4h4M7 11h6M7 14h4"/></svg>;
    case "social-post":
      return <svg {...s} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="15" cy="5" r="2"/><circle cx="5" cy="10" r="2"/><circle cx="15" cy="15" r="2"/><path d="M7 9l6-3M7 11l6 3"/></svg>;
    case "small-group-questions":
      return <svg {...s} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H8l-4 3V14z"/></svg>;
    case "prayer-prompt":
      return <svg {...s} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M10 3v14M4 8h12"/></svg>;
    default: return null;
  }
}

// Per-output-type textarea minimum height (px)
function outputMinHeight(type: EchoOutputType): number {
  switch (type) {
    case "take-into-the-week": return 160;
    case "parish-reflection":  return 300;
    case "social-post":        return 160;
    case "small-group-questions": return 260;
    case "prayer-prompt":      return 140;
  }
}

// Human-readable labels for output types
const OUTPUT_TYPE_LABELS: Record<string, string> = {
  "take-into-the-week": "Take Into the Week",
  "parish-reflection": "Parish Reflection",
  "social-post": "Social Post",
  "small-group-questions": "Small Group Questions",
  "prayer-prompt": "Prayer Prompt",
};

/**
 * Demo homily text used when no homilyText prop is provided.
 * TODO: replace with the real homily when the homily picker is wired in.
 */
const DEMO_HOMILY_TEXT = `Brothers and sisters, today's Gospel brings us face to face with a question that echoes through every human heart: "Do you love me?" Three times the Lord asks Peter, and three times Peter answers — not with the polished confidence of before the passion, but with the vulnerability of a man who knows his own weakness. "Lord, you know everything; you know that I love you."

There is something profound happening here. Jesus does not ask Peter to prove himself, to demonstrate his worthiness, to make up for his threefold denial with some great act of penance. He simply asks Peter to stand in the truth of his love — however imperfect, however fragile — and then to act from that love. "Feed my sheep."

This is the shape of Christian mission. It does not begin with our accomplishments or our certainty. It begins with our response to the Lord's question. And the answer he is looking for is not perfection — it is honesty. The Church is built not on Peter's heroism but on Peter's love, and on Christ's faithfulness to that love even when Peter could not be faithful to himself.

As we leave Mass today, the Lord asks us the same question. Not "Have you been perfect?" Not "Have you never failed?" But simply: do you love me? And if we can say yes — however quietly, however tentatively — then the next word follows: go, and feed.`;

// ── Composing state ────────────────────────────────────────────────────────

function ComposingIndicator() {
  return (
    <p
      style={{
        fontFamily: "var(--ambo-font-reading)",
        fontSize: "var(--ambo-size-lg)",
        fontStyle: "italic",
        color: "var(--ambo-text-muted)",
        margin: 0,
        animation: "echoComposingPulse 2s ease-in-out infinite",
      }}
    >
      Composing&hellip;
    </p>
  );
}

// ── Variant chip selector ──────────────────────────────────────────────────

interface VariantChipsProps<T extends string> {
  variants: { id: T; label: string; hint?: string }[];
  active: T;
  onChange: (v: T) => void;
}

function VariantChips<T extends string>({ variants, active, onChange, echoPillStyle }: VariantChipsProps<T> & { echoPillStyle: (a: boolean) => React.CSSProperties }) {
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
      {variants.map((v) => {
        const isActive = v.id === active;
        return (
          <button
            key={v.id}
            onClick={() => onChange(v.id)}
            style={echoPillStyle(isActive)}
          >
            {v.label}
            {v.hint && (
              <span style={{ fontSize: 11, opacity: 0.7, fontWeight: 400 }}>
                {v.hint}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ── Generate button ────────────────────────────────────────────────────────

interface GenerateButtonProps {
  label: string;
  onClick: () => void;
  loading: boolean;
}

function GenerateButton({ label, onClick, loading }: GenerateButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      style={{
        border: "1px solid var(--ambo-accent)",
        background: "var(--ambo-accent-light)",
        color: "var(--ambo-accent)",
        fontSize: "var(--ambo-size-md)",
        fontWeight: 500,
        padding: "11px 28px",
        borderRadius: "var(--ambo-radius-pill)",
        cursor: loading ? "default" : "pointer",
        fontFamily: "var(--ambo-font-ui)",
        opacity: loading ? 0.6 : 1,
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        transition: "all var(--ambo-dur) var(--ambo-ease)",
      }}
    >
      <span style={{ fontSize: 14 }}>✦</span>
      Generate {label}
    </button>
  );
}

// ── Empty / placeholder state ──────────────────────────────────────────────

interface EmptyOutputProps {
  tab: EchoTab;
  onGenerate: () => void;
  loading: boolean;
}

function EmptyOutput({ tab, onGenerate, loading }: EmptyOutputProps) {
  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "48px 32px",
        textAlign: "center",
        gap: 20,
        animation: "fadeIn 500ms cubic-bezier(0.22, 1, 0.36, 1)",
      }}
    >
      {/* Quiet glyph */}
      <div
        aria-hidden="true"
        style={{
          width: 52,
          height: 52,
          borderRadius: "50%",
          border: "1px solid var(--ambo-border)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--ambo-text-muted)",
          fontSize: 20,
          background: "var(--ambo-surface)",
          backdropFilter: "var(--ambo-blur)",
          WebkitBackdropFilter: "var(--ambo-blur)",
          flexShrink: 0,
        }}
      >
        ✦
      </div>

      <div style={{ maxWidth: 340 }}>
        <p
          style={{
            fontFamily: "var(--ambo-font-reading)",
            fontSize: "var(--ambo-size-xl)",
            fontStyle: "italic",
            color: "var(--ambo-text-primary)",
            margin: "0 0 10px",
            lineHeight: "var(--ambo-lh-snug)",
          }}
        >
          {tab.label}
        </p>
        <p
          style={{
            fontSize: "var(--ambo-size-md)",
            color: "var(--ambo-text-secondary)",
            lineHeight: "var(--ambo-lh-body)",
            margin: "0 0 28px",
          }}
        >
          {tab.description}
        </p>

        <GenerateButton label={tab.label} onClick={onGenerate} loading={loading} />
      </div>
    </div>
  );
}

// ── No-selection empty state ───────────────────────────────────────────────

function NoSelectionState() {
  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "48px 0",
        animation: "fadeIn 500ms cubic-bezier(0.22, 1, 0.36, 1)",
      }}
    >
      <p
        style={{
          fontFamily: "var(--ambo-font-reading)",
          fontSize: "var(--ambo-size-3xl)",
          fontStyle: "italic",
          fontWeight: 400,
          color: "var(--ambo-text-primary)",
          margin: "0 0 10px",
          lineHeight: 1.2,
          textAlign: "center",
        }}
      >
        Echo
      </p>
      <p
        style={{
          fontFamily: "var(--ambo-font-ui)",
          fontSize: "var(--ambo-size-sm)",
          color: "var(--ambo-text-muted)",
          margin: 0,
          lineHeight: "var(--ambo-lh-snug)",
          textAlign: "center",
        }}
      >
        Five ways to carry the word forward.
      </p>
    </div>
  );
}

// ── Output text area ───────────────────────────────────────────────────────

interface OutputAreaProps {
  text: string;
  onChange: (text: string) => void;
  streaming: boolean;
  minHeight?: number;
}

function OutputArea({ text, onChange, streaming, minHeight = 280 }: OutputAreaProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom while streaming
  useEffect(() => {
    if (streaming && textareaRef.current) {
      textareaRef.current.scrollTop = textareaRef.current.scrollHeight;
    }
  }, [text, streaming]);

  return (
    <textarea
      ref={textareaRef}
      value={text}
      onChange={(e) => onChange(e.target.value)}
      readOnly={streaming}
      style={{
        width: "100%",
        minHeight,
        /* Text container fills card height — do not remove flex: 1.
           Without it the textarea occupies only minHeight px, leaving empty
           whitespace below. The echo-scroll parent is a flex column with
           height: 100%, so flex: 1 here expands the textarea to fill the
           available card interior. See AMBO Echo workspace spec. */
        flex: 1,
        resize: "none",
        fontFamily: "var(--ambo-font-reading)",
        fontSize: "var(--ambo-size-lg)",
        lineHeight: 1.85,
        color: "var(--ambo-text-primary)",
        background: "transparent",
        border: "none",
        outline: "none",
        padding: "8px 0",
        margin: 0,
        boxSizing: "border-box",
        caretColor: "var(--ambo-accent)",
        fontFeatureSettings: '"kern", "liga", "onum"',
        // Subtle cursor hint that the text is editable after streaming
        cursor: streaming ? "default" : "text",
      }}
      aria-label="Generated output — editable"
      spellCheck
    />
  );
}

// ── Action row — pills ─────────────────────────────────────────────────────

interface ActionRowProps {
  savedId: string | null;
  saveStatus: "idle" | "saving" | "saved" | "error";
  copyStatus: "idle" | "copied";
  onSave: () => void;
  onCopy: () => void;
  onDownload: () => void;
  onEmail: () => void;
}

function ActionRow({
  savedId,
  saveStatus,
  copyStatus,
  onSave,
  onCopy,
  onDownload,
  onEmail,
}: ActionRowProps) {
  const ghostPill: React.CSSProperties = {
    fontFamily: "var(--ambo-font-ui)",
    fontSize: 13,
    fontWeight: 500,
    padding: "8px 16px",
    borderRadius: "var(--ambo-radius-pill)",
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    transition: "all 150ms var(--ambo-ease)",
    letterSpacing: "0.01em",
    whiteSpace: "nowrap",
    lineHeight: 1,
    border: "1px solid var(--ambo-border)",
    background: "transparent",
    color: "var(--ambo-text-secondary)",
  };

  const feedbackStyle: React.CSSProperties = {
    fontFamily: "var(--ambo-font-reading)",
    fontSize: "var(--ambo-size-sm)",
    fontStyle: "italic",
    color: "var(--ambo-text-muted)",
    animation: "fadeIn 200ms ease-out both",
    lineHeight: 1,
  };

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        marginTop: 0,
        flexWrap: "wrap",
      }}
    >
      {/* Save */}
      {saveStatus === "saved" ? (
        <span style={feedbackStyle}>saved</span>
      ) : (
        <button
          onClick={onSave}
          disabled={saveStatus === "saving"}
          style={{ ...ghostPill, opacity: saveStatus === "saving" ? 0.5 : 1 }}
        >
          <svg width={12} height={12} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ display: "block", flexShrink: 0 }}>
            <path d="M5 3h10a1 1 0 0 1 1 1v13l-6-3-6 3V4a1 1 0 0 1 1-1z"/>
          </svg>
          {saveStatus === "saving" ? "saving…" : savedId ? "save again" : "save"}
        </button>
      )}

      {/* Copy */}
      {copyStatus === "copied" ? (
        <span style={feedbackStyle}>copied</span>
      ) : (
        <button
          onClick={onCopy}
          style={ghostPill}
        >
          <svg width={12} height={12} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ display: "block", flexShrink: 0 }}>
            <rect x="7" y="7" width="10" height="10" rx="1"/>
            <path d="M3 13V4a1 1 0 0 1 1-1h9"/>
          </svg>
          copy
        </button>
      )}

      {/* Download */}
      <button
        onClick={onDownload}
        style={ghostPill}
      >
        <svg width={12} height={12} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ display: "block", flexShrink: 0 }}>
          <path d="M10 3v10M6 9l4 4 4-4"/>
          <path d="M3 15h14v2H3z"/>
        </svg>
        download
      </button>

      {/* Email */}
      <button
        onClick={onEmail}
        style={ghostPill}
      >
        <svg width={12} height={12} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ display: "block", flexShrink: 0 }}>
          <rect x="2" y="4" width="16" height="12" rx="1"/>
          <path d="M2 7l8 5 8-5"/>
        </svg>
        email
      </button>

      {/* Save error */}
      {saveStatus === "error" && (
        <span
          style={{
            ...feedbackStyle,
            color: "rgba(200,60,60,0.8)",
            marginLeft: 4,
          }}
        >
          Save failed — try again
        </span>
      )}
    </div>
  );
}

// ── Unsaved edits guard ────────────────────────────────────────────────────

interface UnsavedGuardProps {
  onSave: () => void;
  onDiscard: () => void;
  onCancel: () => void;
  saving: boolean;
}

function UnsavedGuard({ onSave, onDiscard, onCancel, saving }: UnsavedGuardProps) {
  const pillStyle: React.CSSProperties = {
    background: "none",
    border: "1px solid var(--ambo-border)",
    borderRadius: "var(--ambo-radius-pill)",
    padding: "5px 14px",
    fontSize: "var(--ambo-size-sm)",
    fontFamily: "var(--ambo-font-ui)",
    fontWeight: 500,
    color: "var(--ambo-text-secondary)",
    cursor: "pointer",
    transition: "all var(--ambo-dur) var(--ambo-ease)",
    lineHeight: 1,
  };

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "12px 16px",
        background: "var(--ambo-surface)",
        border: "1px solid var(--ambo-border)",
        borderRadius: "var(--ambo-radius-sm)",
        flexWrap: "wrap",
        animation: "fadeIn 200ms ease-out both",
        marginBottom: 16,
      }}
    >
      <span
        style={{
          fontFamily: "var(--ambo-font-reading)",
          fontSize: "var(--ambo-size-md)",
          fontStyle: "italic",
          color: "var(--ambo-text-secondary)",
          flexShrink: 0,
        }}
      >
        You have unsaved edits.
      </span>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button
          onClick={onSave}
          disabled={saving}
          style={{
            ...pillStyle,
            opacity: saving ? 0.5 : 1,
            color: "var(--ambo-accent)",
            borderColor: "var(--ambo-accent)",
            background: "var(--ambo-accent-light)",
          }}
        >
          {saving ? "Saving…" : "Save"}
        </button>

        <button
          onClick={onDiscard}
          style={pillStyle}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--ambo-text-primary)"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--ambo-text-secondary)"; }}
        >
          Discard
        </button>

        <button
          onClick={onCancel}
          style={pillStyle}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--ambo-text-primary)"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--ambo-text-secondary)"; }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────

export default function EchoWorkspace({
  sundayLabel,
  open,
  onClose,
  homilyText,
  homilyId,
  initialEntry,
}: EchoWorkspaceProps) {
  const [activeTab, setActiveTab] = useState<EchoOutputType>("take-into-the-week");
  const [tabSelected, setTabSelected] = useState(false);
  const [streaming, setStreaming] = useState(false);
  // outputText: what's in the textarea (editable by priest)
  const [outputText, setOutputText] = useState("");
  // generatedText: the original AI output, set once when streaming completes
  const [generatedText, setGeneratedText] = useState("");
  const [hasOutput, setHasOutput] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Variant state for tabs that support it
  const [parishVariant, setParishVariant] = useState<ParishReflectionVariant>("standard");
  const [socialVariant, setSocialVariant] = useState<SocialPostVariant>("before-sunday");
  // Closing state — true while the exit animation plays (780ms)
  const [closing, setClosing] = useState(false);
  // Action row state
  const [savedId, setSavedId] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied">("idle");
  // Unsaved edits guard: what action was interrupted
  const [pendingAction, setPendingAction] = useState<{
    type: "tab-switch" | "variant-switch" | "close" | "regenerate";
    payload?: unknown;
  } | null>(null);

  // Ref: when true, the next render after a variant state update will auto-regenerate.
  // Set when the priest switches variants while output already exists.
  const triggerVariantRegenRef = useRef(false);

  // Composing indicator animation state:
  // composingVisible stays true during streaming + during the exit animation after streaming ends.
  // composingExiting triggers the simultaneous fade-out + height collapse when generation completes.
  const [composingVisible, setComposingVisible] = useState(false);
  const [composingExiting, setComposingExiting] = useState(false);
  const composingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const activeTabData =
    ECHO_TABS.find((t) => t.id === activeTab) ?? ECHO_TABS[0];

  // Resolve the homily text to use — prop or demo placeholder.
  const resolvedHomilyText = homilyText && homilyText.trim().length > 0
    ? homilyText
    : DEMO_HOMILY_TEXT;

  // Resolve the variant for the current tab.
  const resolvedVariant =
    activeTab === "parish-reflection"
      ? parishVariant
      : activeTab === "social-post"
      ? socialVariant
      : undefined;

  // Whether the priest has made edits that differ from the last saved/generated state.
  const hasUnsavedEdits =
    hasOutput &&
    !streaming &&
    outputText.length > 0 &&
    outputText !== generatedText &&
    saveStatus !== "saved";

  // Whether the current tab has variant chips (used to animate the chip row in/out)
  const showVariants =
    tabSelected &&
    (activeTab === "parish-reflection" || activeTab === "social-post");

  // ── Generation ───────────────────────────────────────────────────────────

  const handleGenerate = useCallback(async () => {
    if (streaming) return;

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
        body: JSON.stringify({
          homilyText: resolvedHomilyText,
          outputType: activeTab,
          variant: resolvedVariant,
        }),
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
        if (value) {
          const chunk = decoder.decode(value, { stream: !done });
          accumulated += chunk;
          setOutputText((prev) => prev + chunk);
        }
      }

      // Lock in the generated text once streaming completes
      setGeneratedText(accumulated);
    } catch (err) {
      console.error("[EchoWorkspace] generation error:", err);
      setError(err instanceof Error ? err.message : "Generation failed. Please try again.");
      setHasOutput(false);
    } finally {
      setStreaming(false);
    }
  }, [streaming, resolvedHomilyText, activeTab, resolvedVariant]);

  // ── Auto-regenerate on variant change ───────────────────────────────────

  // When the priest switches a variant chip while output exists, we set
  // triggerVariantRegenRef and update the variant state. On the next render
  // after state has settled (parishVariant / socialVariant updated), this
  // effect fires handleGenerate so the priest never has to tap Generate again
  // after a variant switch.
  useEffect(() => {
    if (triggerVariantRegenRef.current) {
      triggerVariantRegenRef.current = false;
      handleGenerate();
    }
  }, [parishVariant, socialVariant, handleGenerate]);

  // ── Composing animation — tracks streaming state ──────────────────────────
  // Stay fully visible throughout streaming; when streaming ends, fade out and
  // collapse height simultaneously so the text eases upward into its final position.
  useEffect(() => {
    if (streaming) {
      if (composingTimerRef.current) {
        clearTimeout(composingTimerRef.current);
        composingTimerRef.current = null;
      }
      setComposingVisible(true);
      setComposingExiting(false);
    } else if (composingVisible) {
      // Streaming just ended — trigger the exit: fade + height collapse over 600ms
      setComposingExiting(true);
      composingTimerRef.current = setTimeout(() => {
        setComposingVisible(false);
        setComposingExiting(false);
        composingTimerRef.current = null;
      }, 650);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streaming]);

  // ── Save ─────────────────────────────────────────────────────────────────

  const handleSave = useCallback(async () => {
    if (saveStatus === "saving" || !hasOutput || outputText.trim().length === 0) return;

    setSaveStatus("saving");

    try {
      const res = await fetch("/api/echo/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          outputType: activeTab,
          variant: resolvedVariant ?? null,
          generatedText: generatedText || outputText, // fallback if generatedText wasn't set
          outputText,
          homilyId: homilyId ?? undefined,
        }),
      });

      if (!res.ok) {
        throw new Error(`Save failed: ${res.status}`);
      }

      const { id } = await res.json();
      setSavedId(id);
      setSaveStatus("saved");

      // Fade back to idle after 2 seconds
      setTimeout(() => setSaveStatus("idle"), 2000);
    } catch (err) {
      console.error("[EchoWorkspace] save error:", err);
      setSaveStatus("error");
    }
  }, [saveStatus, hasOutput, outputText, activeTab, resolvedVariant, generatedText, homilyId]);

  // ── Copy ─────────────────────────────────────────────────────────────────

  const handleCopy = useCallback(async () => {
    if (!outputText) return;
    try {
      await navigator.clipboard.writeText(outputText);
      setCopyStatus("copied");
      setTimeout(() => setCopyStatus("idle"), 1500);
    } catch (err) {
      console.error("[EchoWorkspace] clipboard error:", err);
    }
  }, [outputText]);

  // ── Download ──────────────────────────────────────────────────────────────

  const handleDownload = useCallback(async () => {
    if (!outputText) return;

    // Human-readable type labels for filename and attribution
    const typeLabels: Record<EchoOutputType, string> = {
      "take-into-the-week":    "Take Into the Week",
      "parish-reflection":     "Parish Reflection",
      "social-post":           "Social Post",
      "small-group-questions": "Small Group Questions",
      "prayer-prompt":         "Prayer Prompt",
    };
    const typeLabel = typeLabels[activeTab];

    // Liturgical day (drop "· Year X" suffix for the filename)
    const shortLabel = sundayLabel.split("·")[0].trim();

    // Date string for filename and attribution
    const dateStr = new Date().toLocaleDateString("en-AU", {
      day: "numeric", month: "long", year: "numeric",
    });

    // Attribution line inside the document
    // sundayLabel is e.g. "Fifth Sunday of Easter · Year C"
    const attribution = `From a homily preached on the ${sundayLabel.replace(" ·", ",")}, ${dateStr}`;

    // Readable filename
    const filename = `Echo - ${typeLabel} - ${shortLabel} - ${dateStr}.docx`;

    try {
      const res = await fetch("/api/echo/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: outputText, outputType: activeTab, attribution }),
      });
      if (!res.ok) throw new Error(`Download API returned ${res.status}`);

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("[EchoWorkspace] download error:", err);
      // Fallback: plain text
      const blob = new Blob([outputText], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename.replace(".docx", ".txt");
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  }, [outputText, sundayLabel, activeTab]);

  // ── Email ─────────────────────────────────────────────────────────────────

  const handleEmail = useCallback(() => {
    if (!outputText) return;

    // Build a human-readable subject line from the output type + sunday label
    const typeLabels: Record<EchoOutputType, string> = {
      "take-into-the-week": "Take Into the Week",
      "parish-reflection": "Parish Reflection",
      "social-post": "Social Post",
      "small-group-questions": "Small Group Questions",
      "prayer-prompt": "Prayer Prompt",
    };
    const subject = `${typeLabels[activeTab]} — ${sundayLabel}`;
    window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(outputText)}`;
  }, [outputText, activeTab, sundayLabel]);

  // ── Guard helpers ─────────────────────────────────────────────────────────

  /**
   * Returns true if we should show the guard and have set pendingAction.
   * Returns false if there are no unsaved edits (caller can proceed immediately).
   */
  const guardIfUnsaved = useCallback(
    (action: { type: "tab-switch" | "variant-switch" | "close" | "regenerate"; payload?: unknown }): boolean => {
      if (hasUnsavedEdits) {
        setPendingAction(action);
        return true;
      }
      return false;
    },
    [hasUnsavedEdits],
  );

  /** Execute the pending action after Save or Discard */
  const executePendingAction = useCallback(
    (action: typeof pendingAction) => {
      if (!action) return;
      setPendingAction(null);

      if (action.type === "tab-switch") {
        const tabId = action.payload as EchoOutputType;
        setActiveTab(tabId);
        setTabSelected(true);
        setOutputText("");
        setGeneratedText("");
        setHasOutput(false);
        setError(null);
        setSavedId(null);
        setSaveStatus("idle");
      } else if (action.type === "variant-switch") {
        const { tab, variant } = action.payload as {
          tab: "parish-reflection" | "social-post";
          variant: string;
        };
        // Guard was cleared (save or discard): auto-regenerate with the new variant.
        triggerVariantRegenRef.current = true;
        if (tab === "parish-reflection") {
          setParishVariant(variant as ParishReflectionVariant);
        } else {
          setSocialVariant(variant as SocialPostVariant);
        }
        setOutputText("");
        setGeneratedText("");
        // Keep hasOutput true so composing state shows during regen.
        setError(null);
        setSavedId(null);
        setSaveStatus("idle");
      } else if (action.type === "close") {
        if (closing) return;
        setClosing(true);
        setTimeout(() => {
          setClosing(false);
          onClose();
        }, 750);
      } else if (action.type === "regenerate") {
        setOutputText("");
        setGeneratedText("");
        setSavedId(null);
        setSaveStatus("idle");
        handleGenerate();
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [closing, onClose],
  );

  const handleGuardSave = useCallback(async () => {
    await handleSave();
    // After save completes, execute the pending action
    // (saveStatus will update async, so we capture the action first)
    const action = pendingAction;
    executePendingAction(action);
  }, [handleSave, pendingAction, executePendingAction]);

  const handleGuardDiscard = useCallback(() => {
    const action = pendingAction;
    // Reset edits to the generated text
    setOutputText(generatedText);
    setSaveStatus("idle");
    executePendingAction(action);
  }, [pendingAction, generatedText, executePendingAction]);

  const handleGuardCancel = useCallback(() => {
    setPendingAction(null);
  }, []);

  // ── Regenerate ────────────────────────────────────────────────────────────

  const handleRegenerate = useCallback(() => {
    // If the priest has unsaved edits, ask before wiping the textarea.
    if (guardIfUnsaved({ type: "regenerate" })) return;
    // No unsaved edits (or output was just generated / already saved):
    // clear state and regenerate immediately.
    setOutputText("");
    setGeneratedText("");
    setSavedId(null);
    setSaveStatus("idle");
    handleGenerate();
  }, [guardIfUnsaved, handleGenerate]);

  // ── Tab switch ────────────────────────────────────────────────────────────

  const handleTabClick = useCallback(
    (tabId: EchoOutputType) => {
      if (tabId === activeTab && tabSelected) return;
      if (guardIfUnsaved({ type: "tab-switch", payload: tabId })) return;
      setActiveTab(tabId);
      setTabSelected(true);
      setOutputText("");
      setGeneratedText("");
      setHasOutput(false);
      setError(null);
      setSavedId(null);
      setSaveStatus("idle");
    },
    [activeTab, tabSelected, guardIfUnsaved],
  );

  // ── Variant switch ────────────────────────────────────────────────────────

  const handleParishVariantChange = useCallback(
    (v: ParishReflectionVariant) => {
      if (v === parishVariant) return;
      if (
        guardIfUnsaved({
          type: "variant-switch",
          payload: { tab: "parish-reflection", variant: v },
        })
      )
        return;
      // If we already have output, flag for auto-regeneration after state updates.
      if (hasOutput) triggerVariantRegenRef.current = true;
      setParishVariant(v);
      setOutputText("");
      setGeneratedText("");
      // Keep hasOutput true during regen so composing state shows; only clear when starting fresh.
      if (!hasOutput) setHasOutput(false);
      setError(null);
      setSavedId(null);
      setSaveStatus("idle");
    },
    [parishVariant, guardIfUnsaved, hasOutput],
  );

  const handleSocialVariantChange = useCallback(
    (v: SocialPostVariant) => {
      if (v === socialVariant) return;
      if (
        guardIfUnsaved({
          type: "variant-switch",
          payload: { tab: "social-post", variant: v },
        })
      )
        return;
      if (hasOutput) triggerVariantRegenRef.current = true;
      setSocialVariant(v);
      setOutputText("");
      setGeneratedText("");
      if (!hasOutput) setHasOutput(false);
      setError(null);
      setSavedId(null);
      setSaveStatus("idle");
    },
    [socialVariant, guardIfUnsaved, hasOutput],
  );

  // ── Close logic ──────────────────────────────────────────────────────────

  const handleClose = useCallback(() => {
    if (closing) return;
    if (guardIfUnsaved({ type: "close" })) return;
    setClosing(true);
    setTimeout(() => {
      setClosing(false);
      onClose();
    }, 750);
  }, [closing, guardIfUnsaved, onClose]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, closing]);

  // Reset on open; if an initialEntry is provided, pre-load it
  useEffect(() => {
    if (open) {
      if (initialEntry) {
        setActiveTab(initialEntry.output_type as EchoOutputType);
        setTabSelected(true);
        setOutputText(initialEntry.output_text ?? initialEntry.generated_text ?? "");
        setGeneratedText(initialEntry.output_text ?? initialEntry.generated_text ?? "");
        setHasOutput(true);
        setSavedId(initialEntry.id);
        if (initialEntry.output_type === "parish-reflection" && initialEntry.variant) {
          setParishVariant(initialEntry.variant as ParishReflectionVariant);
        }
        if (initialEntry.output_type === "social-post" && initialEntry.variant) {
          setSocialVariant(initialEntry.variant as SocialPostVariant);
        }
      } else {
        setActiveTab("take-into-the-week");
        setTabSelected(false);
        setOutputText("");
        setGeneratedText("");
        setHasOutput(false);
      }
      setError(null);
      setSavedId(initialEntry?.id ?? null);
      setSaveStatus("idle");
      setCopyStatus("idle");
      setPendingAction(null);
      // Reset composing animation state
      if (composingTimerRef.current) {
        clearTimeout(composingTimerRef.current);
        composingTimerRef.current = null;
      }
      setComposingVisible(false);
      setComposingExiting(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  // ── Echo pill style — matches PillButton ghost/active exactly ───────────
  const echoPillBase: React.CSSProperties = {
    fontFamily: "var(--ambo-font-ui)",
    fontSize: 13,
    fontWeight: 500,
    padding: "8px 16px",
    borderRadius: "var(--ambo-radius-pill)",
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    transition: "all 150ms var(--ambo-ease)",
    letterSpacing: "0.01em",
    whiteSpace: "nowrap",
    lineHeight: 1,
    border: "none",
    background: "none",
  };
  const echoPillStyle = (isActive: boolean): React.CSSProperties => ({
    ...echoPillBase,
    border: isActive ? "1px solid var(--ambo-accent)" : "1px solid var(--ambo-border)",
    background: isActive ? "var(--ambo-accent-light)" : "transparent",
    color: isActive ? "var(--ambo-accent)" : "var(--ambo-text-secondary)",
  });

  return (
    <>
      {/* Keyframes + scrollbar suppression */}
      <style>{`
        @keyframes echoComposingPulse {
          0%, 100% { opacity: 0.45; }
          50%       { opacity: 0.85; }
        }
        @keyframes echoActionFadeIn {
          0%   { opacity: 0; }
          100% { opacity: 1; }
        }
        .echo-scroll::-webkit-scrollbar { display: none; }
        .echo-scroll { scrollbar-width: none; -ms-overflow-style: none; }
      `}</style>

      {/* Scrim — same treatment as reading view */}
      <div
        onClick={handleClose}
        aria-hidden="true"
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(10, 15, 25, 0.55)",
          backdropFilter: "blur(8px)",
          WebkitBackdropFilter: "blur(8px)",
          zIndex: 110,
          animation: closing
            ? "fadeOut 750ms ease-in both"
            : "fadeIn 1000ms ease-out both",
        }}
      />

      {/* Workspace panel — contained modal, slides in from right */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Echo — ${sundayLabel}`}
        style={{
          position: "fixed",
          // Desktop: generous margins. Mobile: full screen.
          top: "clamp(0px, 3.5vh, 36px)",
          bottom: "clamp(0px, 3.5vh, 36px)",
          left: "clamp(0px, 7vw, 100px)",
          right: "clamp(0px, 7vw, 100px)",
          zIndex: 120,
          display: "flex",
          flexDirection: "column",
          background: "var(--ambo-surface-reading)",
          backdropFilter: "blur(22px) saturate(1.4)",
          WebkitBackdropFilter: "blur(22px) saturate(1.4)",
          border: "1px solid var(--ambo-border)",
          borderRadius: "clamp(0px, 2vw, 20px)",
          boxShadow: "var(--ambo-shadow-lg)",
          maxWidth: "min(900px, 100%)",
          // Centre horizontally within the margins
          marginLeft: "auto",
          marginRight: "auto",
          overflow: "hidden",
          animation: closing
            ? "slideOutRight 750ms ease-in both"
            : "slideInRight 1000ms ease-out both",
        }}
      >
        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div
          style={{
            padding: "16px 32px 0",
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 16,
            flexShrink: 0,
          }}
        >
          {/* Left: quiet italic source line */}
          <p
            style={{
              fontFamily: "var(--ambo-font-reading)",
              fontStyle: "italic",
              fontSize: "var(--ambo-size-md)",
              fontWeight: 500,
              color: "var(--ambo-text-secondary)",
              margin: 0,
              lineHeight: 1.4,
            }}
          >
            from your {sundayLabel} homily
          </p>

          {/* Right: simple × close button */}
          <button
            onClick={handleClose}
            aria-label="Close Echo workspace"
            style={{
              border: "none",
              background: "none",
              color: "var(--ambo-text-muted)",
              fontSize: 18,
              cursor: "pointer",
              padding: "0 0 0 8px",
              lineHeight: 1,
              flexShrink: 0,
              transition: "color var(--ambo-dur) var(--ambo-ease)",
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--ambo-text-primary)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--ambo-text-muted)"; }}
          >
            ×
          </button>
        </div>

        {/* ── Output type pills row ───────────────────────────────────────── */}
        <div
          style={{
            padding: "16px 32px 0",
            display: "flex",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 8,
            flexShrink: 0,
          }}
        >
          {ECHO_TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => handleTabClick(tab.id)}
              aria-pressed={tabSelected && activeTab === tab.id}
              style={echoPillStyle(tabSelected && activeTab === tab.id)}
            >
              <EchoTabIcon id={tab.id} />
              {tab.label}
            </button>
          ))}

        </div>

        {/* ── Body ────────────────────────────────────────────────────────────── */}
        <div
          style={{
            flex: 1,
            minHeight: 0,
            overflow: "visible",
            display: "flex",
            flexDirection: "column",
            padding: "0 32px 0",
          }}
        >
          {/* Content panel — white card always present */}
          <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>

              {/* Chrome on grey surface: guard, variant chips, error */}
              {tabSelected && pendingAction && (
                <div style={{ paddingTop: 20 }}>
                  <UnsavedGuard
                    onSave={handleGuardSave}
                    onDiscard={handleGuardDiscard}
                    onCancel={handleGuardCancel}
                    saving={saveStatus === "saving"}
                  />
                </div>
              )}

              {/* Variant chips — animated in/out via grid-template-rows trick.
                   Height eases open/closed; opacity fades in sync.
                   The card beneath responds naturally as available space changes. */}
              {tabSelected && (
                <div
                  style={{
                    display: "grid",
                    gridTemplateRows: showVariants ? "1fr" : "0fr",
                    opacity: showVariants ? 1 : 0,
                    transition:
                      "grid-template-rows 420ms var(--ambo-ease), opacity 280ms var(--ambo-ease)",
                  }}
                >
                  {/* overflow:hidden on the grid child is what makes 0fr actually clip */}
                  <div style={{ overflow: "hidden" }}>
                    <div style={{ paddingTop: 16 }}>
                      {activeTab === "parish-reflection" && (
                        <VariantChips
                          variants={PARISH_REFLECTION_VARIANTS}
                          active={parishVariant}
                          onChange={handleParishVariantChange}
                          echoPillStyle={echoPillStyle}
                        />
                      )}
                      {activeTab === "social-post" && (
                        <VariantChips
                          variants={SOCIAL_POST_VARIANTS}
                          active={socialVariant}
                          onChange={handleSocialVariantChange}
                          echoPillStyle={echoPillStyle}
                        />
                      )}
                    </div>
                  </div>
                </div>
              )}

              {tabSelected && error && !streaming && (
                <div
                  style={{
                    marginTop: 16,
                    padding: "12px 16px",
                    background: "rgba(200, 60, 60, 0.06)",
                    border: "1px solid rgba(200, 60, 60, 0.2)",
                    borderRadius: "var(--ambo-radius-sm)",
                    fontSize: "var(--ambo-size-sm)",
                    color: "var(--ambo-text-secondary)",
                    fontFamily: "var(--ambo-font-ui)",
                  }}
                >
                  {error}
                </div>
              )}

              {/* ── White card — stable, fixed, always present ─────────── */}
              {/* Content scrolls inside; card itself never moves or resizes    */}
              <div style={{
                flex: 1,
                minHeight: 0,
                marginTop: 16,
                marginBottom: 8,
                background: "var(--ambo-surface-solid)",
                borderRadius: "var(--ambo-radius)",
                boxShadow: "var(--ambo-shadow-md)",
                overflow: "hidden",
                position: "relative",
              }}>
                <div
                  className="echo-scroll"
                  style={{
                    height: "100%",
                    overflowY: "auto",
                    padding: "16px 28px 24px",
                    display: "flex",
                    flexDirection: "column",
                  }}
                >
                  {/* No tab selected — workspace empty state, centred in card */}
                  {!tabSelected && <NoSelectionState />}

                  {tabSelected && (
                    <>
                      {/* Composing indicator — visible for the full duration of streaming.
                          When streaming completes, composingExiting=true triggers a
                          simultaneous fade-out (opacity→0) and height collapse (maxHeight→0)
                          over 600ms ease-out. The text textarea sits below in the same flex
                          column, so it naturally eases upward as the indicator collapses —
                          one continuous gesture, not two separate UI events.
                          After 650ms the element unmounts (composingVisible=false). */}
                      {composingVisible && (
                        <div
                          style={{
                            flexShrink: 0,
                            overflow: "hidden",
                            maxHeight: composingExiting ? "0px" : "60px",
                            opacity: composingExiting ? 0 : 1,
                            marginTop: composingExiting ? 0 : 16,
                            pointerEvents: "none",
                            transition: composingExiting
                              ? "max-height 600ms ease-out, opacity 600ms ease-out, margin-top 600ms ease-out"
                              : "none",
                          }}
                        >
                          <ComposingIndicator />
                        </div>
                      )}

                      {/* Output text area — fades in as text first arrives */}
                      {hasOutput && outputText.length > 0 && (
                        <>
                          {/* Wrap in a keyed div so the fade-in fires once on first appearance */}
                          <div
                            key="output-area"
                            style={{
                              flex: 1,
                              display: "flex",
                              flexDirection: "column",
                              animation: "fadeIn 500ms ease-out both",
                            }}
                          >
                            <OutputArea
                              text={outputText}
                              onChange={setOutputText}
                              streaming={streaming}
                              minHeight={outputMinHeight(activeTab)}
                            />
                          </div>

                          {!streaming && (
                            <button
                              onClick={handleRegenerate}
                              style={{
                                background: "none",
                                border: "none",
                                padding: 0,
                                cursor: "pointer",
                                fontFamily: "var(--ambo-font-ui)",
                                fontSize: "var(--ambo-size-sm)",
                                color: "var(--ambo-text-muted)",
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 5,
                                marginTop: 12,
                                marginBottom: 4,
                                transition: "color var(--ambo-dur) var(--ambo-ease)",
                                alignSelf: "flex-start",
                                animation: "fadeIn 600ms ease-out 200ms both",
                              }}
                              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--ambo-accent)"; }}
                              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--ambo-text-muted)"; }}
                              aria-label="Regenerate output"
                            >
                              <span aria-hidden="true" style={{ fontSize: "0.9em", lineHeight: 1 }}>&#x21BA;</span>
                              try again
                            </button>
                          )}
                        </>
                      )}

                      {/* Empty state — tab selected, no generation yet */}
                      {!hasOutput && !streaming && (
                        <EmptyOutput
                          tab={activeTabData}
                          onGenerate={handleGenerate}
                          loading={streaming}
                        />
                      )}
                    </>
                  )}
                </div>
              </div>

              {!homilyText && (
                <p
                  className="ambo-meta"
                  style={{ textAlign: "left", marginTop: 12, fontStyle: "italic" }}
                >
                  Using demo homily text — select a homily to generate from your own words.
                </p>
              )}
          </div>
        </div>

        {/* ── Action footer — permanent structure, always present ── */}
        <div
            style={{
              flexShrink: 0,
              padding: "8px 32px 8px",
              background: "transparent",
              opacity: hasOutput ? 1 : 0.35,
              transition: "opacity 0.6s ease",
            }}
          >
            <ActionRow
              savedId={savedId}
              saveStatus={saveStatus}
              copyStatus={copyStatus}
              onSave={handleSave}
              onCopy={handleCopy}
              onDownload={handleDownload}
              onEmail={handleEmail}
            />
        </div>
      </div>
    </>
  );
}
