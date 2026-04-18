"use client";

import { useState } from "react";
import ReadingView from "./components/ReadingView";
import WriteView from "./components/WriteView";
import PreachView from "./components/PreachView";

type Mode = "read" | "write" | "preach";

export default function AmboApp() {
  const [mode, setMode] = useState<Mode>("read");

  return (
    <div style={{
      minHeight: "100vh",
      background: "var(--ambo-bg)",
      display: "flex",
      flexDirection: "column",
    }}>

      {/* Header */}
      <header style={{
        position: "sticky",
        top: 0,
        zIndex: 50,
        background: "rgba(238, 242, 247, 0.85)",
        backdropFilter: "blur(20px) saturate(1.4)",
        WebkitBackdropFilter: "blur(20px) saturate(1.4)",
        borderBottom: "1px solid var(--ambo-border)",
      }}>
        <div style={{
          maxWidth: 760,
          margin: "0 auto",
          padding: "0 24px",
          height: 60,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}>
          {/* Logo / wordmark */}
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <AmboLogo />
            <span style={{
              fontSize: 19,
              fontWeight: 600,
              letterSpacing: "-0.02em",
              color: "var(--ambo-text-primary)",
            }}>
              Ambo
            </span>
          </div>

          {/* Mode switcher */}
          <nav className="mode-pill">
            {(["read", "write", "preach"] as Mode[]).map((m) => (
              <button
                key={m}
                className={`mode-pill-btn ${mode === m ? "active" : ""}`}
                onClick={() => setMode(m)}
              >
                {m.charAt(0).toUpperCase() + m.slice(1)}
              </button>
            ))}
          </nav>
        </div>
      </header>

      {/* Main content */}
      <main style={{
        flex: 1,
        padding: "36px 0",
      }}>
        {mode === "read" && <ReadingView />}
        {mode === "write" && <WriteView />}
        {mode === "preach" && <PreachView />}
      </main>
    </div>
  );
}

function AmboLogo() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      {/* Stylised ambo — a lectern shape */}
      <rect x="9" y="2" width="6" height="12" rx="1.5" fill="var(--ambo-accent)" opacity="0.85" />
      <rect x="5" y="10" width="14" height="2.5" rx="1.25" fill="var(--ambo-accent)" />
      <rect x="11" y="14.5" width="2" height="7.5" rx="1" fill="var(--ambo-accent)" opacity="0.6" />
      <rect x="8" y="21" width="8" height="1.5" rx="0.75" fill="var(--ambo-accent)" opacity="0.5" />
    </svg>
  );
}
