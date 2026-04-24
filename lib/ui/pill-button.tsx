"use client";

// PillButton — the chrome pill used in top strips and affordance rows.
// Three variants: ghost (default, bordered, transparent fill),
// active (accent border + light accent fill + accent text),
// primary (same as active — the verb-first pill).

import type { CSSProperties, ReactNode } from "react";

type Variant = "ghost" | "active" | "primary";

type Props = {
  children: ReactNode;
  variant?: Variant;
  icon?: ReactNode;
  onClick?: () => void;
  title?: string;
  disabled?: boolean;
  style?: CSSProperties;
  "data-tour"?: string;
};

const base: CSSProperties = {
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
};

const variants: Record<Variant, CSSProperties> = {
  ghost: {
    border: "1px solid var(--ambo-border)",
    background: "transparent",
    color: "var(--ambo-text-secondary)",
  },
  active: {
    border: "1px solid var(--ambo-accent)",
    background: "var(--ambo-accent-light)",
    color: "var(--ambo-accent)",
  },
  primary: {
    border: "1px solid var(--ambo-accent)",
    background: "var(--ambo-accent-light)",
    color: "var(--ambo-accent)",
  },
};

export function PillButton({
  children,
  variant = "ghost",
  icon,
  onClick,
  title,
  disabled,
  style,
  "data-tour": dataTour,
}: Props) {
  return (
    <button
      onClick={onClick}
      title={title}
      disabled={disabled}
      data-tour={dataTour}
      className="mode-pill-btn"
      style={{
        ...base,
        ...variants[variant],
        opacity: disabled ? 0.5 : 1,
        cursor: disabled ? "default" : "pointer",
        ...style,
      }}
    >
      {icon}
      <span>{children}</span>
    </button>
  );
}
