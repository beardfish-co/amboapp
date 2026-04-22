"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import ReflectView from "./components/ReflectView";
import WriteView from "./components/WriteView";
import PreachView from "./components/PreachView";
import HomilyList from "./components/HomilyList";

type Mode = "reflect" | "write" | "preach";

const CURRENT_ID_KEY = "ambo-current-id";

export default function AmboApp() {
  const [mode, setMode] = useState<Mode>("reflect");
  const [discernmentVersion, setDiscernmentVersion] = useState(0);
  const [signingOut, setSigningOut] = useState(false);
  const router = useRouter();

  // Multi-homily state
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  // Bumped after every autosave so HomilyList refetches next time it opens
  const [listRefreshKey, setListRefreshKey] = useState(0);
  // Tracks whether we've resolved the initial currentId (from localStorage or fallback)
  const [idHydrated, setIdHydrated] = useState(false);

  // Resolve the starting homily id on mount:
  //  1. localStorage ambo-current-id, if it still exists for this user
  //  2. Most recently edited homily for this user
  //  3. null — fresh blank draft (first save will create a row)
  useEffect(() => {
    let cancelled = false;

    (async () => {
      let resolved: string | null = null;
      let candidate: string | null = null;
      try {
        candidate = localStorage.getItem(CURRENT_ID_KEY);
      } catch { /* ignore */ }

      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          if (candidate) {
            const { data } = await supabase
              .from("homilies")
              .select("id")
              .eq("id", candidate)
              .eq("user_id", user.id)
              .maybeSingle();
            if (data?.id) resolved = data.id;
          }
          if (!resolved) {
            const { data } = await supabase
              .from("homilies")
              .select("id")
              .eq("user_id", user.id)
              .order("updated_at", { ascending: false })
              .limit(1)
              .maybeSingle();
            if (data?.id) resolved = data.id;
          }
        }
      } catch { /* offline — leave resolved as null */ }

      if (cancelled) return;

      if (resolved) {
        setCurrentId(resolved);
        try { localStorage.setItem(CURRENT_ID_KEY, resolved); } catch { /* ignore */ }
      } else {
        try { localStorage.removeItem(CURRENT_ID_KEY); } catch { /* ignore */ }
      }
      setIdHydrated(true);
    })();

    return () => { cancelled = true; };
  }, []);

  const persistCurrentId = useCallback((id: string | null) => {
    setCurrentId(id);
    try {
      if (id) localStorage.setItem(CURRENT_ID_KEY, id);
      else localStorage.removeItem(CURRENT_ID_KEY);
    } catch { /* ignore */ }
  }, []);

  const handleSignOut = async () => {
    setSigningOut(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    try {
      localStorage.removeItem(CURRENT_ID_KEY);
      localStorage.removeItem("ambo-draft");
    } catch { /* ignore */ }
    router.push("/login");
  };

  const handleSelectHomily = useCallback((id: string) => {
    persistCurrentId(id);
    setDrawerOpen(false);
    // Stay on whatever tab they were on — Reflect is a valid landing place
  }, [persistCurrentId]);

  const handleCreateHomily = useCallback(() => {
    persistCurrentId(null);
    setDrawerOpen(false);
    setMode("write");
  }, [persistCurrentId]);

  const handleSaved = useCallback(() => {
    setListRefreshKey((k) => k + 1);
  }, []);

  const openDrawer = useCallback(() => setDrawerOpen(true), []);

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
            {(["reflect", "write", "preach"] as Mode[]).map((m) => (
              <button
                key={m}
                className={`mode-pill-btn ${mode === m ? "active" : ""}`}
                onClick={() => { if (m === "write") setDiscernmentVersion(v => v + 1); setMode(m); }}
              >
                {m.charAt(0).toUpperCase() + m.slice(1)}
              </button>
            ))}
          </nav>

          {/* Sign out */}
          <button
            onClick={handleSignOut}
            disabled={signingOut}
            style={{
              border: "none",
              background: "none",
              fontSize: 12,
              color: "var(--ambo-text-muted)",
              cursor: "pointer",
              fontFamily: "inherit",
              padding: "4px 8px",
              borderRadius: 6,
              opacity: signingOut ? 0.5 : 1,
            }}
          >
            {signingOut ? "…" : "Sign out"}
          </button>
        </div>
      </header>

      {/* Main content */}
      <main style={{
        flex: 1,
        padding: "36px 0",
      }}>
        {/* All three views stay mounted once idHydrated — CSS-hidden when
            inactive. This prevents the blank-then-populated title flash that
            occurs when WriteView unmounts and remounts on every mode switch. */}
        {idHydrated && (
          <>
            <div style={{ display: mode === "reflect" ? undefined : "none" }}>
              <ReflectView
                currentId={currentId}
                onOpenList={openDrawer}
                onGoWrite={() => { setMode("write"); setDiscernmentVersion(v => v + 1); }}
              />
            </div>
            <div style={{ display: mode === "write" ? undefined : "none" }}>
              <WriteView
                currentId={currentId}
                onCurrentIdChange={persistCurrentId}
                onSaved={handleSaved}
                onOpenList={openDrawer}
                onGoReflect={() => setMode("reflect")}
                discernmentVersion={discernmentVersion}
              />
            </div>
            <div style={{ display: mode === "preach" ? undefined : "none" }}>
              <PreachView currentId={currentId} />
            </div>
          </>
        )}
      </main>

      {/* Attribution footer — present on every view */}
      <footer style={{
        padding: "16px 24px 16px",
        textAlign: "center",
      }}>
        <p style={{
          fontSize: 11,
          color: "var(--ambo-text-muted)",
          letterSpacing: "0.02em",
          margin: 0,
        }}>
          Scripture readings provided by{" "}
          <a
            href="https://universalis.com"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "var(--ambo-accent)", textDecoration: "none" }}
          >
            Universalis
          </a>
        </p>
      </footer>

      {/* Homily drawer */}
      <HomilyList
        open={drawerOpen}
        currentId={currentId}
        onClose={() => setDrawerOpen(false)}
        onSelect={handleSelectHomily}
        onCreate={handleCreateHomily}
        refreshKey={listRefreshKey}
      />
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
