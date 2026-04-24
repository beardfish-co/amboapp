"use client";

// JurisdictionPicker — shown on first launch (when no lectionary family is set)
// and accessible from the account menu to change later.
//
// Two modes:
//   "onboarding"  — full-screen overlay, cannot be dismissed without choosing
//   "settings"    — inline panel inside the account menu dropdown

import { useState } from "react";
import {
  JURISDICTION_OPTIONS,
  LectionaryFamily,
} from "@/lib/jurisdiction";

interface Props {
  mode: "onboarding" | "settings";
  current?: LectionaryFamily | null;
  onSelect: (family: LectionaryFamily) => Promise<void>;
  onDismiss?: () => void;  // only used in settings mode
}

export default function JurisdictionPicker({ mode, current, onSelect, onDismiss }: Props) {
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState<LectionaryFamily | null>(current ?? null);

  const handleSelect = async (family: LectionaryFamily) => {
    setSelected(family);
    setSaving(true);
    await onSelect(family);
    setSaving(false);
    if (mode === "settings") onDismiss?.();
  };

  const inner = (
    <div style={{
      width: "100%",
      maxWidth: mode === "onboarding" ? 420 : "100%",
      margin: mode === "onboarding" ? "0 auto" : undefined,
      padding: mode === "onboarding" ? "0 24px" : undefined,
    }}>
      {mode === "onboarding" && (
        <>
          <h2 style={{
            margin: "0 0 8px",
            fontSize: 22,
            fontWeight: 700,
            letterSpacing: "-0.02em",
            color: "var(--ambo-text-primary)",
          }}>
            Where do you celebrate Mass?
          </h2>
          <p style={{
            margin: "0 0 28px",
            fontSize: 14,
            color: "var(--ambo-text-muted)",
            lineHeight: 1.6,
          }}>
            Different bishops' conferences use different approved translations.
            Ambo will show you the readings in the right text for your territory.
          </p>
        </>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {JURISDICTION_OPTIONS.map((opt) => {
          const isSelected = selected === opt.family;
          const isSavingThis = saving && isSelected;

          return (
            <button
              key={opt.family}
              onClick={() => opt.available && !saving && handleSelect(opt.family)}
              disabled={!opt.available || saving}
              style={{
                width: "100%",
                padding: "12px 16px",
                border: `1px solid ${isSelected ? "var(--ambo-accent)" : "var(--ambo-border)"}`,
                borderRadius: 10,
                background: isSelected
                  ? "var(--ambo-accent-light)"
                  : "var(--ambo-surface-solid)",
                textAlign: "left",
                cursor: opt.available && !saving ? "pointer" : "default",
                opacity: opt.available ? 1 : 0.55,
                display: "flex",
                flexDirection: "column",
                gap: 2,
                fontFamily: "inherit",
                transition: "border-color 0.15s, background 0.15s",
              }}
            >
              <span style={{
                fontSize: 14,
                fontWeight: 600,
                color: isSelected
                  ? "var(--ambo-accent)"
                  : opt.available
                  ? "var(--ambo-text-primary)"
                  : "var(--ambo-text-secondary)",
              }}>
                {isSavingThis ? "Saving…" : opt.label}
              </span>
              <span style={{
                fontSize: 12,
                color: isSelected ? "var(--ambo-accent)" : "var(--ambo-text-secondary)",
              }}>
                {opt.sublabel}
              </span>
            </button>
          );
        })}
      </div>

      {mode === "onboarding" && (
        <p style={{
          marginTop: 20,
          fontSize: 12,
          color: "var(--ambo-text-muted)",
          lineHeight: 1.5,
          textAlign: "center",
        }}>
          You can change this at any time in your account settings.
        </p>
      )}
    </div>
  );

  if (mode === "settings") return inner;

  // Onboarding: full-screen overlay
  return (
    <div style={{
      position: "fixed",
      inset: 0,
      zIndex: 200,
      background: "var(--ambo-bg)",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: "40px 0",
      overflowY: "auto",
    }}>
      {inner}
    </div>
  );
}
