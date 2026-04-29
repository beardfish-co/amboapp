"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// ── Archive types ──────────────────────────────────────────────────────────

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

// ── Action row ─────────────────────────────────────────────────────────────

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
  const linkStyle: React.CSSProperties = {
    background: "none",
    border: "none",
    padding: 0,
    cursor: "pointer",
    fontFamily: "var(--ambo-font-ui)",
    fontSize: "var(--ambo-size-sm)",
    color: "var(--ambo-text-muted)",
    transition: "color var(--ambo-dur) var(--ambo-ease)",
    lineHeight: 1,
  };

  const separatorStyle: React.CSSProperties = {
    color: "var(--ambo-border)",
    userSelect: "none" as const,
    fontSize: "var(--ambo-size-sm)",
    lineHeight: 1,
  };

  const feedbackStyle: React.CSSProperties = {
    fontFamily: "var(--ambo-font-reading)",
    fontSize: "var(--ambo-size-sm)",
    fontStyle: "italic",
    color: "var(--ambo-text-muted)",
    animation: "fadeIn 200ms ease-out both",
  };

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        paddingTop: 12,
        flexWrap: "wrap",
      }}
    >
      {/* Save */}
      {saveStatus === "saved" ? (
        <span style={feedbackStyle}>Saved</span>
      ) : (
        <button
          onClick={onSave}
          disabled={saveStatus === "saving"}
          style={{
            ...linkStyle,
            opacity: saveStatus === "saving" ? 0.5 : 1,
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--ambo-accent)"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--ambo-text-muted)"; }}
        >
          {saveStatus === "saving" ? "Saving…" : savedId ? "Save again" : "Save"}
        </button>
      )}

      <span aria-hidden="true" style={separatorStyle}>·</span>

      {/* Copy */}
      {copyStatus === "copied" ? (
        <span style={feedbackStyle}>Copied</span>
      ) : (
        <button
          onClick={onCopy}
          style={linkStyle}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--ambo-accent)"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--ambo-text-muted)"; }}
        >
          Copy
        </button>
      )}

      <span aria-hidden="true" style={separatorStyle}>·</span>

      {/* Download */}
      <button
        onClick={onDownload}
        style={linkStyle}
        onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--ambo-accent)"; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--ambo-text-muted)"; }}
      >
        Download
      </button>

      <span aria-hidden="true" style={separatorStyle}>·</span>

      {/* Email */}
      <button
        onClick={onEmail}
        style={linkStyle}
        onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--ambo-accent)"; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--ambo-text-muted)"; }}
      >
        Email
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

// ── Tab button ─────────────────────────────────────────────────────────────

interface TabButtonProps {
  tab: EchoTab;
  active: boolean;
  onClick: () => void;
  dimmed?: boolean;
}

function TabButton({ tab, active, onClick, dimmed }: TabButtonProps) {
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
        opacity: dimmed ? 0.4 : 1,
        pointerEvents: dimmed ? "none" : "auto",
      }}
    >
      {tab.label}
    </button>
  );
}

// ── Archive entry card ─────────────────────────────────────────────────────

interface ArchiveEntryCardProps {
  entry: ArchiveEntry;
  onOpen: (entry: ArchiveEntry) => void;
}

function ArchiveEntryCard({ entry, onOpen }: ArchiveEntryCardProps) {
  const [hovered, setHovered] = useState(false);

  const typeLabel = OUTPUT_TYPE_LABELS[entry.output_type] ?? entry.output_type;
  const variantLabel = entry.variant
    ? ` · ${entry.variant.charAt(0).toUpperCase() + entry.variant.slice(1).replace(/-/g, " ")}`
    : "";

  const preview = entry.output_text.slice(0, 120).trim();

  const sourceLabel = entry.homily_title
    ? `From your "${entry.homily_title}"`
    : entry.homily_sunday_date
    ? `From your ${entry.homily_sunday_date}`
    : "Standalone output";

  const savedDate = new Date(entry.created_at).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return (
    <button
      onClick={() => onOpen(entry)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "block",
        width: "100%",
        textAlign: "left",
        background: hovered
          ? "var(--ambo-surface-solid)"
          : "var(--ambo-surface)",
        border: "1px solid var(--ambo-border)",
        borderRadius: "var(--ambo-radius-sm)",
        padding: "18px 22px",
        cursor: "pointer",
        transition: "all var(--ambo-dur) var(--ambo-ease)",
        backdropFilter: "var(--ambo-blur)",
        WebkitBackdropFilter: "var(--ambo-blur)",
        boxShadow: hovered ? "var(--ambo-shadow-sm)" : "none",
      }}
    >
      {/* Type label */}
      <div
        style={{
          fontFamily: "var(--ambo-font-ui)",
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: "var(--ambo-text-muted)",
          marginBottom: 8,
        }}
      >
        {typeLabel}{variantLabel}
      </div>

      {/* Preview text */}
      <p
        style={{
          fontFamily: "var(--ambo-font-reading)",
          fontSize: "var(--ambo-size-md)",
          fontStyle: "italic",
          color: "var(--ambo-text-primary)",
          margin: "0 0 10px",
          lineHeight: "var(--ambo-lh-snug)",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {preview}{entry.output_text.length > 120 ? "…" : ""}
      </p>

      {/* Source + date row */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
        }}
      >
        <span
          style={{
            fontFamily: "var(--ambo-font-ui)",
            fontSize: "var(--ambo-size-sm)",
            color: "var(--ambo-text-muted)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {sourceLabel}
        </span>
        <span
          style={{
            fontFamily: "var(--ambo-font-ui)",
            fontSize: "var(--ambo-size-sm)",
            color: "var(--ambo-text-muted)",
            flexShrink: 0,
          }}
        >
          {savedDate}
        </span>
      </div>
    </button>
  );
}

// ── Archive view ───────────────────────────────────────────────────────────

interface ArchiveViewProps {
  entries: ArchiveEntry[];
  loading: boolean;
  error: string | null;
  filter: "all" | "by-type";
  onFilterChange: (f: "all" | "by-type") => void;
  onOpen: (entry: ArchiveEntry) => void;
}

function ArchiveView({
  entries,
  loading,
  error,
  filter,
  onFilterChange,
  onOpen,
}: ArchiveViewProps) {
  const filterPillStyle = (active: boolean): React.CSSProperties => ({
    border: `1px solid ${active ? "var(--ambo-accent)" : "var(--ambo-border)"}`,
    background: active ? "var(--ambo-accent-light)" : "transparent",
    color: active ? "var(--ambo-accent)" : "var(--ambo-text-secondary)",
    fontSize: "var(--ambo-size-sm)",
    fontWeight: active ? 600 : 500,
    padding: "5px 14px",
    borderRadius: "var(--ambo-radius-pill)",
    cursor: "pointer",
    fontFamily: "var(--ambo-font-ui)",
    transition: "all var(--ambo-dur) var(--ambo-ease)",
    lineHeight: 1,
  });

  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        overflowY: "auto",
        padding: "40px 48px",
        animation: "fadeIn 400ms ease-out",
      }}
    >
      {/* Eyebrow */}
      <div
        style={{
          fontFamily: "var(--ambo-font-ui)",
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: "var(--ambo-text-muted)",
          marginBottom: 20,
        }}
      >
        your echo archive
      </div>

      {/* Filter pills */}
      <div
        style={{
          display: "flex",
          gap: 8,
          marginBottom: 28,
          flexWrap: "wrap",
        }}
      >
        <button
          style={filterPillStyle(filter === "all")}
          onClick={() => onFilterChange("all")}
        >
          All
        </button>
        <button
          style={filterPillStyle(filter === "by-type")}
          onClick={() => onFilterChange("by-type")}
        >
          By type
        </button>
        {/* By homily — future enhancement */}
        <button
          style={{
            ...filterPillStyle(false),
            opacity: 0.4,
            cursor: "default",
            pointerEvents: "none",
          }}
          disabled
        >
          By homily
        </button>
      </div>

      {/* Loading state */}
      {loading && (
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
          Loading archive&hellip;
        </p>
      )}

      {/* Error state */}
      {!loading && error && (
        <p
          style={{
            fontFamily: "var(--ambo-font-ui)",
            fontSize: "var(--ambo-size-md)",
            color: "rgba(200,60,60,0.8)",
            margin: 0,
          }}
        >
          {error}
        </p>
      )}

      {/* Empty state */}
      {!loading && !error && entries.length === 0 && (
        <p
          style={{
            fontFamily: "var(--ambo-font-reading)",
            fontSize: "var(--ambo-size-lg)",
            fontStyle: "italic",
            color: "var(--ambo-text-muted)",
            margin: 0,
          }}
        >
          No outputs saved yet. Generate something and tap Save.
        </p>
      )}

      {/* Entry list — All */}
      {!loading && !error && entries.length > 0 && filter === "all" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {entries.map((entry) => (
            <ArchiveEntryCard key={entry.id} entry={entry} onOpen={onOpen} />
          ))}
        </div>
      )}

      {/* Entry list — By type */}
      {!loading && !error && entries.length > 0 && filter === "by-type" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>
          {(["take-into-the-week", "parish-reflection", "social-post", "small-group-questions", "prayer-prompt"] as const).map((type) => {
            const group = entries.filter((e) => e.output_type === type);
            if (group.length === 0) return null;
            return (
              <div key={type}>
                <div
                  style={{
                    fontFamily: "var(--ambo-font-ui)",
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: "0.1em",
                    textTransform: "uppercase",
                    color: "var(--ambo-text-muted)",
                    marginBottom: 12,
                    paddingBottom: 8,
                    borderBottom: "1px solid var(--ambo-rule-subtle)",
                  }}
                >
                  {OUTPUT_TYPE_LABELS[type]}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {group.map((entry) => (
                    <ArchiveEntryCard key={entry.id} entry={entry} onOpen={onOpen} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
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
}: EchoWorkspaceProps) {
  const [activeTab, setActiveTab] = useState<EchoOutputType>("take-into-the-week");
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
    type: "tab-switch" | "variant-switch" | "close";
    payload?: unknown;
  } | null>(null);

  // ── Archive state ─────────────────────────────────────────────────────────
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [archiveFilter, setArchiveFilter] = useState<"all" | "by-type">("all");
  const [archiveOutputs, setArchiveOutputs] = useState<ArchiveEntry[]>([]);
  const [archiveLoading, setArchiveLoading] = useState(false);
  const [archiveError, setArchiveError] = useState<string | null>(null);

  // Ref: when true, the next render after a variant state update will auto-regenerate.
  // Set when the priest switches variants while output already exists.
  const triggerVariantRegenRef = useRef(false);

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

  // ── Archive fetch ─────────────────────────────────────────────────────────

  const fetchArchive = useCallback(async () => {
    setArchiveLoading(true);
    setArchiveError(null);
    try {
      const res = await fetch("/api/echo/archive");
      if (!res.ok) throw new Error(`Archive fetch failed: ${res.status}`);
      const { outputs } = await res.json();
      setArchiveOutputs(outputs ?? []);
    } catch (err) {
      console.error("[EchoWorkspace] archive fetch error:", err);
      setArchiveError("Could not load archive. Please try again.");
    } finally {
      setArchiveLoading(false);
    }
  }, []);

  // Fetch when archive opens
  useEffect(() => {
    if (archiveOpen) {
      fetchArchive();
    }
  }, [archiveOpen, fetchArchive]);

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

      // Re-fetch archive so it stays current after a save
      fetchArchive();

      // Fade back to idle after 2 seconds
      setTimeout(() => setSaveStatus("idle"), 2000);
    } catch (err) {
      console.error("[EchoWorkspace] save error:", err);
      setSaveStatus("error");
    }
  }, [saveStatus, hasOutput, outputText, activeTab, resolvedVariant, generatedText, homilyId, fetchArchive]);

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

  const handleDownload = useCallback(() => {
    if (!outputText) return;

    // Slugify the sundayLabel for the filename
    const slug = sundayLabel
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");

    // Build output-type segment
    const typeSlug = activeTab;

    const filename = `echo-${typeSlug}-${slug}.txt`;
    const blob = new Blob([outputText], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
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
    (action: { type: "tab-switch" | "variant-switch" | "close"; payload?: unknown }): boolean => {
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
        }, 780);
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

  // ── Tab switch ────────────────────────────────────────────────────────────

  const handleTabClick = useCallback(
    (tabId: EchoOutputType) => {
      if (tabId === activeTab) return;
      if (guardIfUnsaved({ type: "tab-switch", payload: tabId })) return;
      setActiveTab(tabId);
      setOutputText("");
      setGeneratedText("");
      setHasOutput(false);
      setError(null);
      setSavedId(null);
      setSaveStatus("idle");
    },
    [activeTab, guardIfUnsaved],
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
    }, 780);
  }, [closing, guardIfUnsaved, onClose]);

  // ── Archive open entry ────────────────────────────────────────────────────

  const handleArchiveOpen = useCallback((entry: ArchiveEntry) => {
    // Load entry back into the editing area
    setActiveTab(entry.output_type as EchoOutputType);
    setOutputText(entry.output_text);
    setGeneratedText(entry.generated_text);
    setHasOutput(true);
    setSavedId(entry.id);
    setSaveStatus("idle");
    setError(null);
    setPendingAction(null);

    // Restore variant
    if (entry.output_type === "parish-reflection" && entry.variant) {
      setParishVariant(entry.variant as ParishReflectionVariant);
    } else if (entry.output_type === "social-post" && entry.variant) {
      setSocialVariant(entry.variant as SocialPostVariant);
    }

    setArchiveOpen(false);
  }, []);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (archiveOpen) {
          setArchiveOpen(false);
        } else {
          handleClose();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, closing, archiveOpen]);

  // Reset to first tab whenever the workspace opens
  useEffect(() => {
    if (open) {
      setActiveTab("take-into-the-week");
      setOutputText("");
      setGeneratedText("");
      setHasOutput(false);
      setError(null);
      setSavedId(null);
      setSaveStatus("idle");
      setCopyStatus("idle");
      setPendingAction(null);
      setArchiveOpen(false);
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
          {/* Left: feature name + sunday label + archive link */}
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
            <span
              aria-hidden="true"
              style={{ fontSize: "var(--ambo-size-xs)", color: "var(--ambo-border)" }}
            >
              ·
            </span>
            {/* Archive affordance */}
            <button
              onClick={() => setArchiveOpen((v) => !v)}
              style={{
                background: "none",
                border: "none",
                padding: 0,
                cursor: "pointer",
                fontFamily: "var(--ambo-font-ui)",
                fontSize: "var(--ambo-size-xs)",
                fontWeight: archiveOpen ? 600 : 500,
                color: archiveOpen ? "var(--ambo-accent)" : "var(--ambo-text-muted)",
                transition: "color var(--ambo-dur) var(--ambo-ease)",
                lineHeight: 1,
                letterSpacing: "0.02em",
              }}
              onMouseEnter={(e) => {
                if (!archiveOpen) (e.currentTarget as HTMLButtonElement).style.color = "var(--ambo-text-secondary)";
              }}
              onMouseLeave={(e) => {
                if (!archiveOpen) (e.currentTarget as HTMLButtonElement).style.color = "var(--ambo-text-muted)";
              }}
              aria-pressed={archiveOpen}
            >
              Archive
            </button>
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

        {/* ── Body: sidebar tabs + output area (or archive) ──────────────── */}
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
                onClick={() => handleTabClick(tab.id)}
                dimmed={archiveOpen}
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

          {/* ── Main content: archive view or output panel ── */}
          {archiveOpen ? (
            <ArchiveView
              entries={archiveOutputs}
              loading={archiveLoading}
              error={archiveError}
              filter={archiveFilter}
              onFilterChange={setArchiveFilter}
              onOpen={handleArchiveOpen}
            />
          ) : (
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

              {/* Unsaved edits guard — shown above variant selectors */}
              {pendingAction && (
                <UnsavedGuard
                  onSave={handleGuardSave}
                  onDiscard={handleGuardDiscard}
                  onCancel={handleGuardCancel}
                  saving={saveStatus === "saving"}
                />
              )}

              {/* Variant selectors — Parish Reflection */}
              {activeTab === "parish-reflection" && (
                <VariantChips
                  variants={PARISH_REFLECTION_VARIANTS}
                  active={parishVariant}
                  onChange={handleParishVariantChange}
                />
              )}

              {/* Variant selectors — Social Post */}
              {activeTab === "social-post" && (
                <VariantChips
                  variants={SOCIAL_POST_VARIANTS}
                  active={socialVariant}
                  onChange={handleSocialVariantChange}
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
                      minHeight={outputMinHeight(activeTab)}
                    />

                    {/* Action row + regenerate — shown after streaming completes */}
                    {!streaming && (
                      <>
                        <ActionRow
                          savedId={savedId}
                          saveStatus={saveStatus}
                          copyStatus={copyStatus}
                          onSave={handleSave}
                          onCopy={handleCopy}
                          onDownload={handleDownload}
                          onEmail={handleEmail}
                        />

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
                      </>
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
          )}
        </div>
      </div>
    </>
  );
}
