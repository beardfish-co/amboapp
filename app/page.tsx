"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import AccountMenu from "@/app/components/AccountMenu";
import ErrorBoundary from "@/app/components/ErrorBoundary";
import ReflectView from "./components/ReflectView";
import WriteView from "./components/WriteView";
import PreachView from "./components/PreachView";
import HomilyList from "./components/HomilyList";
import OnboardingTour from "./components/OnboardingTour";
import ThemeToggle from "./components/ThemeToggle";
import DormancyBanner from "./components/DormancyBanner";
import SubscriptionBanner from "./components/SubscriptionBanner";
import JurisdictionPicker from "./components/JurisdictionPicker";
import {
  LectionaryFamily,
  ReadingsSource,
  SOURCE_ATTRIBUTION,
  sourceForFamily,
} from "@/lib/jurisdiction";

type Mode = "reflect" | "write" | "preach";

const CURRENT_ID_KEY = "ambo-current-id";

export default function AmboApp() {
  const [mode, setMode] = useState<Mode>("reflect");
  const [discernmentVersion, setDiscernmentVersion] = useState(0);
  const [preachVersion, setPreachVersion] = useState(0);
  const [liveContent, setLiveContent] = useState<{ title: string; content: string } | null>(null);
  const flushWriteRef = useRef<(() => Promise<void>) | null>(null);
  const router = useRouter();

  // Multi-homily state
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [listRefreshKey, setListRefreshKey] = useState(0);
  const [idHydrated, setIdHydrated] = useState(false);

  // Dormancy state — computed at app load from last homily activity
  type DormancyState = "active" | "warning" | "dormant";
  const [dormancyState, setDormancyState] = useState<DormancyState>("active");
  const [weeksSinceActive, setWeeksSinceActive] = useState(0);
  const [dormancyDismissed, setDormancyDismissed] = useState(false);

  // Subscription state
  interface SubscriptionData {
    status: string;
    trial_end: string | null;
    current_period_end: string | null;
    stripe_customer_id: string | null;
  }
  const [subscription, setSubscription] = useState<SubscriptionData | null>(null);

  // Jurisdiction state
  // null = not yet loaded from auth; undefined = loaded, not set (show picker)
  const [lectionaryFamily, setLectionaryFamily] = useState<LectionaryFamily | null | undefined>(null);
  const [showPicker, setShowPicker] = useState(false);

  const readingsSource: ReadingsSource =
    lectionaryFamily ? sourceForFamily(lectionaryFamily) : "universalis";

  // ── Auth + jurisdiction hydration ──────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    (async () => {
      let resolved: string | null = null;
      let candidate: string | null = null;
      try { candidate = localStorage.getItem(CURRENT_ID_KEY); } catch { /* ignore */ }

      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();

        if (user) {
          // Load jurisdiction from user metadata
          const family = (user.user_metadata?.lectionary_family as LectionaryFamily) ?? undefined;
          if (!cancelled) {
            setLectionaryFamily(family ?? null);
            // Show picker if not set — brief delay so the app is visible first
            if (!family) setTimeout(() => setShowPicker(true), 300);
          }

          // Resolve starting homily id
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

          // ── Dormancy check ───────────────────────────────────────────
          // Find the most recent homily activity for this priest.
          // If inactive 3–4 weeks → warning banner; 4+ weeks → read-only.
          try {
            const { data: lastActive } = await supabase
              .from("homilies")
              .select("updated_at")
              .eq("user_id", user.id)
              .order("updated_at", { ascending: false })
              .limit(1)
              .maybeSingle();

            const lastDate = lastActive?.updated_at
              ? new Date(lastActive.updated_at)
              : new Date(user.created_at);   // no homilies yet — use signup date

            const msPerWeek = 7 * 24 * 60 * 60 * 1000;
            const weeks = (Date.now() - lastDate.getTime()) / msPerWeek;
            // Dormancy thresholds: warn at 15 months (~65 weeks), dormant at 18 months (~78 weeks)
            const WEEKS_WARNING = 15 * (365.25 / 12 / 7); // ~65.2 weeks
            const WEEKS_DORMANT = 18 * (365.25 / 12 / 7); // ~78.3 weeks

            if (!cancelled) {
              setWeeksSinceActive(weeks);
              if (weeks >= WEEKS_DORMANT) setDormancyState("dormant");
              else if (weeks >= WEEKS_WARNING) setDormancyState("warning");
              else setDormancyState("active");
            }
          } catch { /* offline — ignore dormancy check */ }
        }
      } catch { /* offline — leave as defaults */ }

      // Fetch / initialise subscription row
      try {
        const subRes = await fetch("/api/stripe/subscription");
        if (subRes.ok) {
          const subData = await subRes.json();
          if (!cancelled) setSubscription(subData);
        }
      } catch { /* offline — ignore */ }

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

  // ── Jurisdiction selection ─────────────────────────────────────────────────
  const handleSelectFamily = useCallback(async (family: LectionaryFamily) => {
    const supabase = createClient();
    await supabase.auth.updateUser({ data: { lectionary_family: family } });
    setLectionaryFamily(family);
    setShowPicker(false);
  }, []);

  // ── Homily management ──────────────────────────────────────────────────────
  const persistCurrentId = useCallback((id: string | null) => {
    setCurrentId(id);
    try {
      if (id) localStorage.setItem(CURRENT_ID_KEY, id);
      else localStorage.removeItem(CURRENT_ID_KEY);
    } catch { /* ignore */ }
  }, []);

  const handleSelectHomily = useCallback((id: string) => {
    persistCurrentId(id);
    setDrawerOpen(false);
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

  // Tour support: open/close homilies drawer during step 13
  useEffect(() => {
    const open  = () => setDrawerOpen(true);
    const close = () => setDrawerOpen(false);
    window.addEventListener("ambo:tour-open-homilies",  open);
    window.addEventListener("ambo:tour-close-homilies", close);
    return () => {
      window.removeEventListener("ambo:tour-open-homilies",  open);
      window.removeEventListener("ambo:tour-close-homilies", close);
    };
  }, []);

  const attribution = SOURCE_ATTRIBUTION[readingsSource];

  // Subscription helpers
  const isSubscriptionActive = (() => {
    if (!subscription) return true; // loading — assume active to avoid false paywall
    if (subscription.status === "active") return true;
    if (subscription.status === "trialing" && subscription.trial_end) {
      return new Date(subscription.trial_end).getTime() > Date.now();
    }
    return false;
  })();

  const handleUpgrade = async (priceId: string) => {
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priceId }),
      });
      const { url } = await res.json();
      if (url) window.location.href = url;
    } catch { /* ignore */ }
  };

  const handleManageBilling = async () => {
    try {
      const res = await fetch("/api/stripe/portal", { method: "POST" });
      const { url } = await res.json();
      if (url) window.location.href = url;
    } catch { /* ignore */ }
  };

  return (
    <div style={{
      height: "100svh",
      background: "var(--ambo-bg)",
      display: "flex",
      flexDirection: "column",
      overflow: "hidden",
    }}>

      {/* Jurisdiction picker — onboarding overlay */}
      {showPicker && (
        <JurisdictionPicker
          mode="onboarding"
          current={lectionaryFamily}
          onSelect={handleSelectFamily}
        />
      )}

      {/* Header */}
      <header style={{
        position: "sticky",
        top: 0,
        zIndex: 50,
        background: "var(--ambo-surface-raised)",
        backdropFilter: "blur(20px) saturate(1.4)",
        WebkitBackdropFilter: "blur(20px) saturate(1.4)",
        borderBottom: "1px solid var(--ambo-border)",
      }}>
        <div className="ambo-header-inner" style={{
          maxWidth: 760,
          margin: "0 auto",
          padding: "0 24px",
          height: 60,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <AmboLogo />
            <span className="ambo-wordmark" style={{
              fontSize: 19,
              fontWeight: 600,
              letterSpacing: "-0.02em",
              color: "var(--ambo-text-primary)",
            }}>
              Ambo
            </span>
          </div>

          <nav className="mode-pill" data-tour="nav-tabs">
            {(["reflect", "write", "preach"] as Mode[]).map((m) => (
              <button
                key={m}
                data-tour={`${m}-tab`}
                className={`mode-pill-btn ${mode === m ? "active" : ""}`}
                onClick={async () => {
                  if (m === "preach") {
                    await flushWriteRef.current?.();
                    setPreachVersion(v => v + 1);
                  }
                  if (m === "write") setDiscernmentVersion(v => v + 1);
                  setMode(m);
                }}
              >
                {m.charAt(0).toUpperCase() + m.slice(1)}
              </button>
            ))}
          </nav>

          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <ThemeToggle />
            <AccountMenu
              lectionaryFamily={lectionaryFamily}
              onSelectFamily={handleSelectFamily}
            />
          </div>
        </div>
      </header>

      {/* Dormancy banner */}
      {!dormancyDismissed && dormancyState !== "active" && (
        <DormancyBanner
          state={dormancyState}
          weeksSinceActive={weeksSinceActive}
          onDismiss={dormancyState === "warning" ? () => setDormancyDismissed(true) : undefined}
        />
      )}

      {/* Subscription banner — trial warning or paywall */}
      {subscription && (
        <SubscriptionBanner
          subscription={subscription}
          onUpgrade={handleUpgrade}
          onManage={handleManageBilling}
        />
      )}

      {/* Main content */}
      <main style={{
        flex: 1,
        minHeight: 0,
        overflowY: "auto",
        scrollbarGutter: "stable" as any,
        padding: mode === "preach" ? "36px 0 0" : "36px 0",
      }}>
        {idHydrated && (
          <>
            <div className="view-wrapper view-wrapper--reflect" style={{ display: mode === "reflect" ? undefined : "none" }}>
              <ErrorBoundary label="Reflect">
              <ReflectView
                currentId={currentId}
                readingsSource={readingsSource}
                onOpenList={openDrawer}
                onGoWrite={() => { setMode("write"); setDiscernmentVersion(v => v + 1); }}
              />
              </ErrorBoundary>
            </div>
            <div className="view-wrapper view-wrapper--write" style={{ display: mode === "write" ? undefined : "none" }}>
              <ErrorBoundary label="Write">
              <WriteView
                currentId={currentId}
                readingsSource={readingsSource}
                onCurrentIdChange={persistCurrentId}
                onSaved={handleSaved}
                onOpenList={openDrawer}
                onGoReflect={() => setMode("reflect")}
                discernmentVersion={discernmentVersion}
                onFlushRef={flushWriteRef}
                onLiveContent={setLiveContent}
                isDormant={dormancyState === "dormant" || !isSubscriptionActive}
                onReengage={isSubscriptionActive ? () => { setDormancyState("active"); setDormancyDismissed(true); } : undefined}
              />
              </ErrorBoundary>
            </div>
            <div className="view-wrapper view-wrapper--preach" style={{ display: mode === "preach" ? undefined : "none", height: "100%", minHeight: 0 }}>
              <ErrorBoundary label="Preach">
              <PreachView currentId={currentId} preachVersion={preachVersion} liveContent={liveContent} />
              </ErrorBoundary>
            </div>
          </>
        )}
      </main>

      {/* Attribution footer */}
      <footer style={{ padding: "16px 24px", textAlign: "center" }}>
        <p style={{
          fontSize: 11,
          color: "var(--ambo-text-muted)",
          letterSpacing: "0.02em",
          margin: 0,
        }}>
          Scripture readings provided by{" "}
          <a
            href={attribution.url}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "var(--ambo-accent)", textDecoration: "none" }}
          >
            {attribution.name}
          </a>
        </p>
      </footer>

      {/* Homily drawer */}
      <ErrorBoundary label="HomilyList">
      <HomilyList
        open={drawerOpen}
        currentId={currentId}
        onClose={() => setDrawerOpen(false)}
        onSelect={handleSelectHomily}
        onCreate={handleCreateHomily}
        refreshKey={listRefreshKey}
      />
      </ErrorBoundary>

      {/* Onboarding tour */}
      <OnboardingTour mode={mode} setMode={setMode} />
    </div>
  );
}

function AmboLogo() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <rect x="9" y="2" width="6" height="12" rx="1.5" fill="var(--ambo-accent)" opacity="0.85" />
      <rect x="5" y="10" width="14" height="2.5" rx="1.25" fill="var(--ambo-accent)" />
      <rect x="11" y="14.5" width="2" height="7.5" rx="1" fill="var(--ambo-accent)" opacity="0.6" />
      <rect x="8" y="21" width="8" height="1.5" rx="0.75" fill="var(--ambo-accent)" opacity="0.5" />
    </svg>
  );
}
