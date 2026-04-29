"use client";

import { useEffect, useState } from "react";

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

// ── Skeleton / loading state ───────────────────────────────────────────────

function OutputSkeleton() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 12,
        animation: "fadeIn 400ms ease",
      }}
      aria-label="Generating output…"
      role="status"
    >
      {[100, 88, 95, 72, 80].map((w, i) => (
        <div
          key={i}
          style={{
            height: 14,
            width: `${w}%`,
            borderRadius: 6,
            background: "var(--ambo-border)",
            opacity: 0.6,
            animation: `echoSkeletonPulse 1.6s ease-in-out ${i * 160}ms infinite`,
          }}
        />
      ))}
      <div
        style={{
          height: 14,
          width: "60%",
          borderRadius: 6,
          background: "var(--ambo-border)",
          opacity: 0.6,
          animation: "echoSkeletonPulse 1.6s ease-in-out 800ms infinite",
        }}
      />
    </div>
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

// ── Empty / placeholder state ──────────────────────────────────────────────

interface EmptyOutputProps {
  tab: EchoTab;
}

function EmptyOutput({ tab }: EmptyOutputProps) {
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

        {/* Generate button — disabled / non-functional in this shell */}
        <button
          disabled
          title="Coming soon — Echo generation will be available shortly"
          style={{
            border: "1px solid var(--ambo-border)",
            background: "transparent",
            color: "var(--ambo-text-muted)",
            fontSize: "var(--ambo-size-md)",
            fontWeight: 500,
            padding: "11px 28px",
            borderRadius: "var(--ambo-radius-pill)",
            cursor: "not-allowed",
            fontFamily: "var(--ambo-font-ui)",
            opacity: 0.55,
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <span style={{ fontSize: 14 }}>✦</span>
          Generate {tab.label}
        </button>

        <p
          className="ambo-affordance"
          style={{ marginTop: 16 }}
        >
          generation coming soon
        </p>
      </div>
    </div>
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
}: EchoWorkspaceProps) {
  const [activeTab, setActiveTab] = useState<EchoOutputType>("take-into-the-week");
  // loading is scaffolded for future wiring — not active in this shell
  const [loading] = useState(false);
  // Variant state for tabs that support it
  const [parishVariant, setParishVariant] = useState<ParishReflectionVariant>("standard");
  const [socialVariant, setSocialVariant] = useState<SocialPostVariant>("before-sunday");
  // Closing state — true while the exit animation plays (540ms)
  const [closing, setClosing] = useState(false);

  const activeTabData =
    ECHO_TABS.find((t) => t.id === activeTab) ?? ECHO_TABS[0];

  // Initiate close: play exit animation then unmount
  const handleClose = () => {
    if (closing) return;
    setClosing(true);
    setTimeout(() => {
      setClosing(false);
      onClose();
    }, 540);
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
    if (open) setActiveTab("take-into-the-week");
  }, [open]);

  if (!open) return null;

  return (
    <>
      {/* Skeleton keyframe — injected once alongside the workspace */}
      <style>{`
        @keyframes echoSkeletonPulse {
          0%, 100% { opacity: 0.35; }
          50%       { opacity: 0.65; }
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
            ? "fadeOut 540ms ease-in both"
            : "fadeIn 780ms ease-out both",
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
            ? "slideOutRight 540ms ease-in both"
            : "slideInRight 780ms ease-out both",
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
                onChange={setParishVariant}
              />
            )}

            {/* Variant selectors — Social Post */}
            {activeTab === "social-post" && (
              <VariantChips
                variants={SOCIAL_POST_VARIANTS}
                active={socialVariant}
                onChange={setSocialVariant}
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
              {loading ? (
                <OutputSkeleton />
              ) : (
                <EmptyOutput tab={activeTabData} />
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
              <p className="ambo-meta ambo-meta--italic" style={{ textAlign: "center" }}>
                Echo generation coming soon.
              </p>
            </div>
          </main>
        </div>
      </div>
    </>
  );
}
