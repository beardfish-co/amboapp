"use client";

// DormancyBanner — shown when a priest has been inactive for 3+ weeks.
//
// warning (3–4 weeks):  gentle nudge, full write access retained
// dormant (4+ weeks):   account in read-only mode, export CTA prominent

interface Props {
  state: "warning" | "dormant";
  weeksSinceActive: number;
  onDismiss?: () => void;
}

export default function DormancyBanner({ state, weeksSinceActive, onDismiss }: Props) {
  const weeks = Math.floor(weeksSinceActive);
  const months = Math.floor(weeksSinceActive / (365.25 / 12 / 7));

  const handleExport = async () => {
    try {
      const res = await fetch("/api/export");
      if (res.status === 404) {
        alert("You don't have any homilies to export yet.");
        return;
      }
      if (!res.ok) {
        alert("Export failed. Please try again.");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const date = new Date().toISOString().slice(0, 10);
      a.download = `ambo-homilies-${date}.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert("Export failed. Please check your connection and try again.");
    }
  };

  if (state === "warning") {
    return (
      <div style={{ margin: "0 auto 0", maxWidth: 760, padding: "0 24px" }}>
        <div style={{
          background: "var(--ambo-accent-faint)",
          border: "1px solid var(--ambo-accent-light)",
          borderRadius: "var(--ambo-radius-sm)",
          padding: "12px 16px",
          marginTop: 20,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
        }}>
          <p style={{ margin: 0, fontSize: 13, color: "var(--ambo-text-secondary)", lineHeight: 1.5 }}>
            It&rsquo;s been {months} {months === 1 ? "month" : "months"} since your last homily.{" "}
            <span style={{ color: "var(--ambo-accent)" }}>Sunday&rsquo;s readings are waiting.</span>
          </p>
          {onDismiss && (
            <button
              onClick={onDismiss}
              style={{
                border: "none",
                background: "transparent",
                fontSize: 12,
                color: "var(--ambo-text-muted)",
                cursor: "pointer",
                fontFamily: "inherit",
                padding: "4px 8px",
                borderRadius: 6,
                flexShrink: 0,
              }}
            >
              Dismiss
            </button>
          )}
        </div>
      </div>
    );
  }

  // Dormant state — read-only mode, export CTA prominent
  return (
    <div style={{ margin: "0 auto 0", maxWidth: 760, padding: "0 24px" }}>
      <div style={{
        background: "var(--ambo-surface-solid)",
        border: "1px solid var(--ambo-border-strong)",
        borderLeft: "3px solid var(--ambo-accent)",
        borderRadius: "var(--ambo-radius-sm)",
        padding: "16px 20px",
        marginTop: 20,
      }}>
        <div style={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: "var(--ambo-text-muted)",
          marginBottom: 6,
        }}>
          Reading mode
        </div>
        <p style={{ margin: "0 0 12px", fontSize: 14, color: "var(--ambo-text-primary)", lineHeight: 1.6 }}>
          Your account is in reading mode after {months} {months === 1 ? "month" : "months"} without a homily.
          You can browse and export all your work. To write again, simply start
          preparing for this Sunday.
        </p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button
            onClick={handleExport}
            style={{
              padding: "8px 16px",
              background: "var(--ambo-accent-light)",
              color: "var(--ambo-accent)",
              border: "1px solid var(--ambo-border)",
              borderRadius: "var(--ambo-radius-pill)",
              fontSize: 13,
              fontWeight: 600,
              fontFamily: "inherit",
              cursor: "pointer",
              transition: "all 0.15s",
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLButtonElement).style.background = "var(--ambo-accent)";
              (e.currentTarget as HTMLButtonElement).style.color = "#fff";
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLButtonElement).style.background = "var(--ambo-accent-light)";
              (e.currentTarget as HTMLButtonElement).style.color = "var(--ambo-accent)";
            }}
          >
            Export all homilies
          </button>
          <span style={{ fontSize: 12, color: "var(--ambo-text-muted)", alignSelf: "center", fontStyle: "italic" }}>
            Open the Write tab to start preparing for this Sunday
          </span>
        </div>
      </div>
    </div>
  );
}
