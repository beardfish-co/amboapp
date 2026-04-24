"use client";

// Route-level error boundary for the main app page.
// Next.js App Router renders this automatically when page.tsx throws.

import { useEffect } from "react";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[Ambo] Page-level error:", error);
  }, [error]);

  return (
    <div style={{
      height: "100svh",
      background: "var(--ambo-bg)",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: "24px",
      gap: 20,
    }}>
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
        <rect x="9" y="2" width="6" height="12" rx="1.5" fill="var(--ambo-accent)" opacity="0.5" />
        <rect x="5" y="10" width="14" height="2.5" rx="1.25" fill="var(--ambo-accent)" opacity="0.5" />
        <rect x="11" y="14.5" width="2" height="7.5" rx="1" fill="var(--ambo-accent)" opacity="0.3" />
        <rect x="8" y="21" width="8" height="1.5" rx="0.75" fill="var(--ambo-accent)" opacity="0.25" />
      </svg>
      <p style={{
        fontSize: 15,
        color: "var(--ambo-text-secondary)",
        textAlign: "center",
        lineHeight: 1.6,
        maxWidth: 300,
        margin: 0,
      }}>
        Something went wrong. Your work is saved — please try again.
      </p>
      <button
        onClick={reset}
        style={{
          border: "none",
          background: "var(--ambo-accent)",
          color: "#fff",
          fontSize: 14,
          fontWeight: 600,
          padding: "10px 24px",
          borderRadius: 100,
          cursor: "pointer",
          fontFamily: "inherit",
        }}
      >
        Try again
      </button>
    </div>
  );
}
