"use client";

import { useEffect, useState } from "react";

type Theme = "light" | "dark" | "system";

const STORAGE_KEY = "ambo-theme";

function getSystemDark(): boolean {
  return typeof window !== "undefined" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === "dark")  { root.setAttribute("data-theme", "dark");  return; }
  if (theme === "light") { root.setAttribute("data-theme", "light"); return; }
  root.removeAttribute("data-theme");
}

// Keep the <meta name="theme-color"> tags in sync with the effective in-app theme.
// The tags Next.js renders use OS-level prefers-color-scheme media queries, which
// won't match when the user overrides the theme in-app.  We stamp all of them to
// the single effective colour so the Dynamic Island always reflects the app's
// actual background, regardless of whether the OS and in-app modes agree.
function syncThemeColorMeta(isDark: boolean) {
  if (typeof document === "undefined") return;
  const color = isDark ? "#0F1824" : "#EEF2F7";
  document.querySelectorAll('meta[name="theme-color"]').forEach(el => {
    (el as HTMLMetaElement).content = color;
  });
}

export default function ThemeToggle() {
  // null during SSR; resolved client-side
  const [theme, setTheme] = useState<Theme | null>(null);

  // Hydrate from localStorage once on mount; sync meta tags immediately so the
  // Dynamic Island colour is correct from the very first paint after JS loads.
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY) as Theme | null;
    const resolved = saved ?? "system";
    setTheme(resolved);
    const isDark = resolved === "dark" || (resolved === "system" && getSystemDark());
    syncThemeColorMeta(isDark);
  }, []);

  const handleClick = () => {
    if (theme === null) return;

    // Cycle: follow current *effective* appearance
    const isDark = theme === "dark" || (theme === "system" && getSystemDark());
    const next: Theme = isDark ? "light" : "dark";

    applyTheme(next);
    syncThemeColorMeta(next === "dark");
    try { localStorage.setItem(STORAGE_KEY, next); } catch { /* ignore */ }
    setTheme(next);
  };

  // Don't render until hydrated — prevents mismatch
  if (theme === null) return <div style={{ width: 32 }} />;

  const isDark = theme === "dark" || (theme === "system" && getSystemDark());

  return (
    <button
      onClick={handleClick}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      style={{
        width: 32,
        height: 32,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        border: "none",
        background: "none",
        cursor: "pointer",
        borderRadius: 8,
        color: "var(--ambo-text-muted)",
        transition: "color 150ms, background 150ms",
        flexShrink: 0,
      }}
      onMouseEnter={e => (e.currentTarget.style.background = "var(--ambo-accent-light)")}
      onMouseLeave={e => (e.currentTarget.style.background = "none")}
    >
      {isDark ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}

function SunIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="5" />
      <line x1="12" y1="1"  x2="12" y2="3"  />
      <line x1="12" y1="21" x2="12" y2="23" />
      <line x1="4.22" y1="4.22"  x2="5.64" y2="5.64"  />
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
      <line x1="1"  y1="12" x2="3"  y2="12" />
      <line x1="21" y1="12" x2="23" y2="12" />
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
      <line x1="18.36" y1="5.64"  x2="19.78" y2="4.22"  />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3a7 7 0 0 0 9.79 9.79z" />
    </svg>
  );
}
