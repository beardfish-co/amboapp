"use client";

import { useCallback, useEffect, useRef, useState } from "react";

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

function VariantChips<T extends string>({ variants, active, onChange }: VariantChipsProps<T>) {
  return (
    <div
      style={{
        display: "flex",
        gap: 8,
        flexWrap: "wrap",
        marginBottom: 24,
      }}
    >
      {variants.map((v) => {
        const isActive = v.id === active;
        return (
          <button
            key={v.id}
            onClick={() => onChange(v.id)}
            style={{
              border: `1px solid ${isActive ? "var(--ambo-accent)" : "var(--ambo-border)"}`,
              background: isActive ? "var(--ambo-accent-light)" : "transparent",
              color: isActive ? "var(--ambo-accent)" : "var(--ambo-text-secondary)",
              fontSize: "var(--ambo-size-sm)",
              fontWeight: isActive ? 600 : 500,
              padding: "6px 14px",
              borderRadius: "var(--ambo-radius-pill)",
              cursor: "pointer",
              fontFamily: "var(--ambo-font-ui)",
              transition: "all var(--ambo-dur) var(--ambo-ease)",
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              lineHeight: 1,
            }}
          >
            {v.label}
            {v.hint && (
              <span
                style={{
                  fontSize: "var(--ambo-size-xs)",
                  opacity: 0.7,
                  fontWeight: 400,
                }}
              >
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

// ── Output text area ───────────────────────────────────────────────────────

interface OutputAreaProps {
  text: string;
  onChange: (text: string) => void;
  streaming: boolean;
}

function OutputArea({ text, onChange, streaming }: OutputAreaProps) {
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
        minHeight: 280,
        flex: 1,
        resize: "vertical",
        fontFamily: "var(--ambo-font-reading)",
        fontSize: "var(--ambo-size-xl)",
        lineHeight: "var(--ambo-lh-reading, 1.7)",
        color: "var(--ambo-text-primary)",
        background: "transparent",
        border: "none",
        outline: "none",
        padding: 0,
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

// ── Tab button ─────────────────────────────────────────────────────────────

interface TabButtonProps {
  tab: EchoTab;
  active: boolean;
  onClick: () => void;
}

function TabButton({ tab, active, onClick }: TabButtonProps) {
  const [hovered, setHovered] = useState(false);

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      aria-pressed={active}
      style={{
        border: "none",
        background: active
          ? "var(--ambo-surface-solid)"
          : hovered
          ? "rgba(74, 111, 165, 0.05)"
          : "transparent",
        color: active ? "var(--ambo-accent)" : "var(--ambo-text-secondary)",
        fontSize: "var(--ambo-size-md)",
        fontWeight: active ? 600 : 500,
        padding: "10px 16px",
        borderRadius: "var(--ambo-radius-sm)",
        cursor: "pointer",
        fontFamily: "var(--ambo-font-ui)",
        textAlign: "left",
        width: "100%",
        transition: "all var(--ambo-dur) var(--ambo-ease)",
        boxShadow: active ? "var(--ambo-shadow-sm)" : "none",
        lineHeight: 1.3,
        letterSpacing: active ? "-0.01em" : "0",
      }}
    >
      {tab.label}
    </button>
  );
}

// ── Main component ─────────────────────────────────────────────────────────

export default function EchoWorkspace({
  sundayLabel,
  open,
  onClose,
  homilyText,
}: EchoWorkspaceProps) {
  const [activeTab, setActiveTab] = useState<EchoOutputType>("take-into-the-week");
  const [streaming, setStreaming] = useState(false);
  const [outputText, setOutputText] = useState("");
  const [hasOutput, setHasOutput] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Variant state for tabs that support it
  const [parishVariant, setParishVariant] = useState<ParishReflectionVariant>("standard");
  const [socialVariant, setSocialVariant] = useState<SocialPostVariant>("before-sunday");
  // Closing state — true while the exit animation plays (780ms)
  const [closing, setClosing] = useState(false);

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

  // ── Generation ───────────────────────────────────────────────────────────

  const handleGenerate = useCallback(async () => {
    if (streaming) return;

    setStreaming(true);
    setHasOutput(true);
    setOutputText("");
    setError(null);

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
          setOutputText((prev) => prev + chunk);
        }
      }
    } catch (err) {
      console.error("[EchoWorkspace] generation error:", err);
      setError(err instanceof Error ? err.message : "Generation failed. Please try again.");
      setHasOutput(false);
    } finally {
      setStreaming(false);
    }
  }, [streaming, resolvedHomilyText, activeTab, resolvedVariant]);

  // Reset output when tab changes
  useEffect(() => {
    setOutputText("");
    setHasOutput(false);
    setError(null);
  }, [activeTab]);

  // ── Close logic ──────────────────────────────────────────────────────────

  const handleClose = () => {
    if (closing) return;
    setClosing(true);
    setTimeout(() => {
      setClosing(false);
      onClose();
    }, 780);
  };

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

  // Reset to first tab whenever the workspace opens
  useEffect(() => {
    if (open) {
      setActiveTab("take-into-the-week");
      setOutputText("");
      setHasOutput(false);
      setError(null);
    }
  }, [open]);

  if (!open) return null;

  return (
    <>
      {/* Keyframes injected once alongside the workspace */}
      <style>{`
        @keyframes echoComposingPulse {
          0%, 100% { opacity: 0.45; }
          50%       { opacity: 0.85; }
        }
      `}</style>

      {/* Full-screen backdrop */}
      <div
        onClick={handleClose}
        aria-hidden="true"
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(15, 20, 30, 0.45)",
          backdropFilter: "blur(6px)",
          WebkitBackdropFilter: "blur(6px)",
          zIndex: 110,
          animation: closing
            ? "fadeOut 780ms ease-in both"
            : "fadeIn 900ms ease-out both",
        }}
      />

      {/* Workspace panel — full-screen overlay, slides in from the right */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Echo — ${sundayLabel}`}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 120,
          display: "flex",
          flexDirection: "column",
          background: "var(--ambo-bg)",
          animation: closing
            ? "slideOutRight 780ms ease-in both"
            : "slideInRight 900ms ease-out both",
        }}
      >
        {/* ── Header ─────────────────────────────────────────────────────── */}
        <header
          style={{
            background: "var(--ambo-header-bg)",
            backdropFilter: "var(--ambo-blur-chrome)",
            WebkitBackdropFilter: "var(--ambo-blur-chrome)",
            borderBottom: "1px solid var(--ambo-border)",
            padding: "0 24px",
            height: 60,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 16,
            flexShrink: 0,
          }}
        >
          {/* Left: feature name + sunday label */}
          <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
            <span
              style={{
                fontFamily: "var(--ambo-font-ui)",
                fontSize: "var(--ambo-size-xs)",
                fontWeight: 700,
                letterSpacing: "var(--ambo-tracking-eyebrow-wide)",
                textTransform: "uppercase",
                color: "var(--ambo-text-muted)",
              }}
            >
              Echo
            </span>
            <span
              aria-hidden="true"
              style={{ fontSize: "var(--ambo-size-xs)", color: "var(--ambo-border)" }}
            >
              ·
            </span>
            <span
              style={{
                fontFamily: "var(--ambo-font-reading)",
                fontSize: "var(--ambo-size-lg)",
                fontStyle: "italic",
                fontWeight: 400,
                color: "var(--ambo-text-primary)",
              }}
            >
              {sundayLabel}
            </span>
          </div>

          {/* Right: close */}
          <button
            onClick={handleClose}
            aria-label="Close Echo workspace"
            style={{
              border: "1px solid var(--ambo-border)",
              background: "transparent",
              color: "var(--ambo-text-muted)",
              cursor: "pointer",
              padding: "6px 14px",
              borderRadius: "var(--ambo-radius-pill)",
              fontSize: "var(--ambo-size-sm)",
              fontWeight: 500,
              fontFamily: "var(--ambo-font-ui)",
              lineHeight: 1,
              transition: "all var(--ambo-dur) var(--ambo-ease)",
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
            onMouseEnter={(e) => {
              const btn = e.currentTarget as HTMLButtonElement;
              btn.style.color = "var(--ambo-text-primary)";
              btn.style.borderColor = "var(--ambo-border-strong)";
            }}
            onMouseLeave={(e) => {
              const btn = e.currentTarget as HTMLButtonElement;
              btn.style.color = "var(--ambo-text-muted)";
              btn.style.borderColor = "var(--ambo-border)";
            }}
          >
            <span aria-hidden="true" style={{ fontSize: 16, lineHeight: 1 }}>
              ×
            </span>
            Close
          </button>
        </header>

        {/* ── Body: sidebar tabs + output area ───────────────────────────── */}
        <div
          style={{
            flex: 1,
            display: "flex",
            minHeight: 0,
            overflow: "hidden",
          }}
        >
          {/* ── Left sidebar: output type tabs ── */}
          <aside
            aria-label="Output types"
            style={{
              width: 220,
              flexShrink: 0,
              borderRight: "1px solid var(--ambo-border)",
              display: "flex",
              flexDirection: "column",
              padding: "24px 12px",
              gap: 4,
              overflowY: "auto",
              background: "var(--ambo-surface)",
              backdropFilter: "var(--ambo-blur)",
              WebkitBackdropFilter: "var(--ambo-blur)",
            }}
          >
            {/* Sidebar label */}
            <div
              className="ambo-eyebrow"
              style={{ padding: "0 6px 10px", marginBottom: 4 }}
            >
              Output type
            </div>

            {ECHO_TABS.map((tab) => (
              <TabButton
                key={tab.id}
                tab={tab}
                active={activeTab === tab.id}
                onClick={() => setActiveTab(tab.id)}
              />
            ))}

            {/* Quiet footer note */}
            <div style={{ marginTop: "auto", paddingTop: 24 }}>
              <p
                className="ambo-affordance"
                style={{ padding: "0 6px", lineHeight: 1.55 }}
              >
                five ways to carry the word forward
              </p>
            </div>
          </aside>

          {/* ── Main output panel ── */}
          <main
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              overflowY: "auto",
              padding: "40px 48px",
            }}
          >
            {/* Output type heading row */}
            <div style={{ marginBottom: 24, flexShrink: 0 }}>
              <div
                className="ambo-eyebrow ambo-eyebrow--accent"
                style={{ marginBottom: 8 }}
              >
                {activeTabData.label}
              </div>
              <div
                style={{
                  height: 1,
                  background: "var(--ambo-rule-subtle)",
                  width: "100%",
                }}
              />
            </div>

            {/* Variant selectors — Parish Reflection */}
            {activeTab === "parish-reflection" && (
              <VariantChips
                variants={PARISH_REFLECTION_VARIANTS}
                active={parishVariant}
                onChange={(v) => {
                  setParishVariant(v);
                  // Reset output when variant changes
                  setOutputText("");
                  setHasOutput(false);
                  setError(null);
                }}
              />
            )}

            {/* Variant selectors — Social Post */}
            {activeTab === "social-post" && (
              <VariantChips
                variants={SOCIAL_POST_VARIANTS}
                active={socialVariant}
                onChange={(v) => {
                  setSocialVariant(v);
                  setOutputText("");
                  setHasOutput(false);
                  setError(null);
                }}
              />
            )}

            {/* Content card */}
            <div
              className="glass-card"
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                padding: "32px 36px",
                minHeight: 360,
                animation: "fadeIn 500ms cubic-bezier(0.22, 1, 0.36, 1)",
              }}
            >
              {/* Error state */}
              {error && !streaming && (
                <div
                  style={{
                    padding: "12px 16px",
                    background: "rgba(200, 60, 60, 0.06)",
                    border: "1px solid rgba(200, 60, 60, 0.2)",
                    borderRadius: "var(--ambo-radius-sm)",
                    marginBottom: 20,
                    fontSize: "var(--ambo-size-sm)",
                    color: "var(--ambo-text-secondary)",
                    fontFamily: "var(--ambo-font-ui)",
                  }}
                >
                  {error}
                </div>
              )}

              {/* Composing indicator — shown while streaming and no text yet */}
              {streaming && outputText.length === 0 && (
                <div style={{ marginBottom: 20 }}>
                  <ComposingIndicator />
                </div>
              )}

              {/* Output text area — shown once text starts arriving */}
              {hasOutput && outputText.length > 0 && (
                <div
                  style={{
                    flex: 1,
                    display: "flex",
                    flexDirection: "column",
                    gap: 16,
                  }}
                >
                  {/* Composing indicator above the text while still streaming */}
                  {streaming && (
                    <ComposingIndicator />
                  )}

                  <OutputArea
                    text={outputText}
                    onChange={setOutputText}
                    streaming={streaming}
                  />

                  {/* Regenerate button — shown after streaming completes */}
                  {!streaming && (
                    <div style={{ display: "flex", gap: 12, alignItems: "center", paddingTop: 8 }}>
                      <GenerateButton
                        label={activeTabData.label}
                        onClick={handleGenerate}
                        loading={streaming}
                      />
                      <span
                        className="ambo-affordance"
                        style={{ fontSize: "var(--ambo-size-sm)" }}
                      >
                        regenerate · or edit directly above
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* Empty state — shown before any generation */}
              {!hasOutput && !streaming && (
                <EmptyOutput
                  tab={activeTabData}
                  onGenerate={handleGenerate}
                  loading={streaming}
                />
              )}

              {/* Composing-only state: streaming started, no text yet, full-card centering */}
              {streaming && outputText.length === 0 && !hasOutput && (
                <div
                  style={{
                    flex: 1,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <ComposingIndicator />
                </div>
              )}
            </div>

            {/* Footer */}
            <div
              style={{
                marginTop: 20,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {!homilyText && (
                <p className="ambo-meta ambo-meta--italic" style={{ textAlign: "center" }}>
                  {/* TODO: remove this note once homily picker is wired in */}
                  Using demo homily text — select a homily to generate from your own words.
                </p>
              )}
            </div>
          </main>
        </div>
      </div>
    </>
  );
}
