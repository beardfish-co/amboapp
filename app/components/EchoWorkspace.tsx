"use client";

import { useEffect, useState } from "react";

// ── Types ──────────────────────────────────────────────────────────────────

type EchoOutputType =
  | "parish-reflection"
  | "bulletin-blurb"
  | "social-post"
  | "childrens-homily"
  | "rcia-notes";

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
    id: "parish-reflection",
    label: "Parish Reflection",
    description:
      "A contemplative reflection drawn from the homily for parishioners to take home and pray with through the week.",
  },
  {
    id: "bulletin-blurb",
    label: "Bulletin Blurb",
    description:
      "A brief, warm paragraph for the Sunday bulletin — suitable for print, readable in under thirty seconds.",
  },
  {
    id: "social-post",
    label: "Social Post",
    description:
      "A short post for Facebook or the parish website, striking a single note from the homily that will travel well.",
  },
  {
    id: "childrens-homily",
    label: "Children's Homily",
    description:
      "The same Gospel truth, told simply — for children's Liturgy of the Word or a family conversation on the way home.",
  },
  {
    id: "rcia-notes",
    label: "RCIA Notes",
    description:
      "Talking points and questions for the RCIA team, connecting the Sunday readings to the catechumenate journey.",
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
  const [activeTab, setActiveTab] = useState<EchoOutputType>("parish-reflection");
  // loading is scaffolded for future wiring — not active in this shell
  const [loading] = useState(false);

  const activeTabData =
    ECHO_TABS.find((t) => t.id === activeTab) ?? ECHO_TABS[0];

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Reset to first tab whenever the workspace opens
  useEffect(() => {
    if (open) setActiveTab("parish-reflection");
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
        onClick={onClose}
        aria-hidden="true"
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(15, 20, 30, 0.45)",
          backdropFilter: "blur(6px)",
          WebkitBackdropFilter: "blur(6px)",
          zIndex: 110,
          animation: "fadeIn 460ms cubic-bezier(0.22, 1, 0.36, 1)",
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
          animation: "slideInRight 640ms cubic-bezier(0.22, 1, 0.36, 1)",
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
            onClick={onClose}
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
            <div style={{ marginBottom: 32, flexShrink: 0 }}>
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
