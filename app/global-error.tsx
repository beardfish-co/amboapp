"use client";

// Global error boundary — catches errors in the root layout itself.
// Must include <html> and <body> since the layout is bypassed.

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[Ambo] Global error:", error);
  }, [error]);

  return (
    <html lang="en">
      <body style={{ margin: 0, background: "#EEF2F7", fontFamily: "system-ui, sans-serif" }}>
        <div style={{
          height: "100svh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "24px",
          gap: 20,
        }}>
          <p style={{
            fontSize: 15,
            color: "#4a5568",
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
              background: "#4A6FA5",
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
      </body>
    </html>
  );
}
