"use client";

import { useEffect, useState } from "react";

interface Reading {
  id: string;
  title: string;
  reference: string;
  heading: string;
  text: string;
}

interface DayReadings {
  date: string;
  dayName: string;
  readings: Reading[];
}

// Format a Date as YYYYMMDD
function toDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

// Get the coming Sunday. Flips on Monday morning.
// If today is Sunday, return today. Otherwise return the next Sunday.
export function getComingSunday(from: Date = new Date()): Date {
  const d = new Date(from);
  d.setHours(0, 0, 0, 0);
  const dow = d.getDay(); // 0 = Sunday
  if (dow === 0) return d;
  d.setDate(d.getDate() + (7 - dow));
  return d;
}

async function fetchReadings(dateStr: string): Promise<DayReadings | null> {
  try {
    const res = await fetch(`/api/readings?date=${dateStr}`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export default function ReadingView() {
  const [sunday, setSunday] = useState<DayReadings | null>(null);
  const [today, setToday] = useState<DayReadings | null>(null);
  const [loading, setLoading] = useState(true);
  const [sundayError, setSundayError] = useState(false);
  const [showToday, setShowToday] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  const todayDate = new Date();
  todayDate.setHours(0, 0, 0, 0);
  const sundayDate = getComingSunday(todayDate);
  const isSunday = todayDate.getDay() === 0;
  const todayStr = toDateString(todayDate);
  const sundayStr = toDateString(sundayDate);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setSundayError(false);
      const [sundayData, todayData] = await Promise.all([
        fetchReadings(sundayStr),
        isSunday ? Promise.resolve(null) : fetchReadings(todayStr),
      ]);
      if (!sundayData) setSundayError(true);
      setSunday(sundayData);
      setToday(todayData);
      setLoading(false);
    }
    load();
  }, [sundayStr, todayStr, isSunday, retryKey]);

  if (loading) {
    return (
      <div className="view-fade" style={{ maxWidth: 680, margin: "0 auto", padding: "0 24px" }}>
        <LoadingCard />
        <LoadingCard />
        <LoadingCard />
      </div>
    );
  }

  return (
    <div className="view-fade" style={{ maxWidth: 680, margin: "0 auto", padding: "0 24px 80px" }}>

      {/* ── Coming Sunday — primary focus ── */}
      <section style={{ marginBottom: 48 }}>
        {/* Eyebrow */}
        <p style={{
          margin: "0 0 6px",
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: "var(--ambo-accent)",
        }}>
          {isSunday ? "Today" : "Coming Sunday"}
        </p>

        {sunday ? (
          <>
            <h2 style={{
              margin: "0 0 4px",
              fontSize: 24,
              fontWeight: 700,
              color: "var(--ambo-text-primary)",
              letterSpacing: "-0.02em",
            }}>
              {sunday.dayName}
            </h2>
            <p style={{ margin: "0 0 20px", fontSize: 12, color: "var(--ambo-text-muted)" }}>
              {sunday.date}
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {sunday.readings.map((r) => (
                <ReadingCard
                  key={r.id}
                  reading={r}
                  open={expandedId === `sun-${r.id}`}
                  onToggle={() => setExpandedId(expandedId === `sun-${r.id}` ? null : `sun-${r.id}`)}
                />
              ))}
            </div>
          </>
        ) : sundayError ? (
          <div style={{
            padding: "24px 20px",
            borderRadius: 12,
            border: "1px solid var(--ambo-border)",
            background: "rgba(255,255,255,0.4)",
            textAlign: "center",
          }}>
            <p style={{ margin: 0, fontSize: 14, color: "var(--ambo-text-muted)" }}>
              Unable to load Sunday readings right now.{" "}
              <button
                onClick={() => { setSundayError(false); setRetryKey(k => k + 1); }}
                style={{
                  border: "none", background: "none", color: "var(--ambo-accent)",
                  cursor: "pointer", fontFamily: "inherit", fontSize: 14, fontWeight: 600, padding: 0,
                }}
              >
                Retry
              </button>
            </p>
          </div>
        ) : null}
      </section>

      {/* ── Today's weekday readings — secondary, hidden by default ── */}
      {!isSunday && today && (
        <section style={{ marginBottom: 48 }}>
          <button
            onClick={() => setShowToday((s) => !s)}
            style={{
              border: "none",
              background: "none",
              padding: 0,
              cursor: "pointer",
              fontFamily: "inherit",
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginBottom: showToday ? 16 : 0,
            }}
          >
            <span style={{
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "var(--ambo-text-muted)",
            }}>
              Today — {today.dayName}
            </span>
            <ChevronIcon open={showToday} />
          </button>

          {showToday && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {today.readings.map((r) => (
                <ReadingCard
                  key={r.id}
                  reading={r}
                  open={expandedId === `today-${r.id}`}
                  onToggle={() => setExpandedId(expandedId === `today-${r.id}` ? null : `today-${r.id}`)}
                />
              ))}
            </div>
          )}
        </section>
      )}

      {/* Attribution */}
      <p style={{
        fontSize: 11,
        color: "var(--ambo-text-muted)",
        textAlign: "center",
        letterSpacing: "0.02em",
        marginTop: 8,
      }}>
        Scripture texts from{" "}
        <a
          href="https://universalis.com"
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: "var(--ambo-accent)", textDecoration: "none" }}
        >
          Universalis
        </a>
      </p>
    </div>
  );
}

// ── Section label ──────────────────────────────────────────────────────────────

function SectionLabel({
  eyebrow,
  title,
  date,
  accent = false,
}: {
  eyebrow: string;
  title: string;
  date: string;
  accent?: boolean;
}) {
  return (
    <div style={{ marginBottom: 16 }}>
      <p style={{
        margin: "0 0 4px",
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: "0.12em",
        textTransform: "uppercase",
        color: accent ? "var(--ambo-accent)" : "var(--ambo-text-muted)",
      }}>
        {eyebrow}
      </p>
      <h2 style={{
        margin: "0 0 2px",
        fontSize: accent ? 22 : 18,
        fontWeight: accent ? 600 : 500,
        color: "var(--ambo-text-primary)",
        letterSpacing: "-0.01em",
      }}>
        {title}
      </h2>
      <p style={{
        margin: 0,
        fontSize: 12,
        color: "var(--ambo-text-muted)",
      }}>
        {date}
      </p>
    </div>
  );
}

// ── Reading card ───────────────────────────────────────────────────────────────

function ReadingCard({
  reading,
  open,
  onToggle,
}: {
  reading: Reading;
  open: boolean;
  onToggle: () => void;
}) {
  const isGospel = reading.id === "gospel";
  const isPsalm = reading.id === "ps";

  return (
    <div
      className="glass-card"
      style={{
        overflow: "hidden",
        cursor: "pointer",
        border: isGospel ? "1px solid rgba(74, 111, 165, 0.3)" : undefined,
      }}
      onClick={onToggle}
    >
      {/* Header */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "16px 20px",
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{
            margin: "0 0 3px",
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: isGospel ? "var(--ambo-accent)" : "var(--ambo-text-muted)",
          }}>
            {reading.title}
          </p>
          <p style={{
            margin: 0,
            fontSize: 14,
            fontWeight: 500,
            color: "var(--ambo-text-primary)",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}>
            {reading.reference}
          </p>
          {reading.heading && !open && (
            <p style={{
              margin: "2px 0 0",
              fontSize: 12,
              color: "var(--ambo-text-muted)",
              fontStyle: "italic",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}>
              {reading.heading}
            </p>
          )}
        </div>
        <ChevronIcon open={open} />
      </div>

      {/* Expanded text */}
      {open && (
        <div style={{ padding: "0 20px 20px" }}>
          <div className="ambo-divider" style={{ marginBottom: 16 }} />
          {reading.heading && (
            <p style={{
              margin: "0 0 14px",
              fontSize: 13,
              fontStyle: "italic",
              color: "var(--ambo-text-secondary)",
              lineHeight: 1.5,
            }}>
              {reading.heading}
            </p>
          )}
          <p style={{
            margin: 0,
            fontFamily: "var(--ambo-font-reading)",
            fontSize: "var(--ambo-size-lg)",
            lineHeight: "var(--ambo-lh-reading)",
            color: "var(--ambo-text-primary)",
            fontStyle: isPsalm ? "italic" : "normal",
            whiteSpace: "pre-line",
          }}>
            {reading.text}
          </p>
        </div>
      )}
    </div>
  );
}

// ── Loading skeleton ───────────────────────────────────────────────────────────

function LoadingCard() {
  return (
    <div className="glass-card" style={{ padding: "16px 20px", marginBottom: 10 }}>
      <div style={{
        height: 10,
        width: 80,
        background: "var(--ambo-border)",
        borderRadius: 4,
        marginBottom: 8,
      }} />
      <div style={{
        height: 14,
        width: 160,
        background: "var(--ambo-border)",
        borderRadius: 4,
      }} />
    </div>
  );
}

// ── Chevron ────────────────────────────────────────────────────────────────────

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="16" height="16" viewBox="0 0 24 24" fill="none"
      stroke="var(--ambo-text-muted)" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round"
      style={{
        transform: open ? "rotate(180deg)" : "rotate(0deg)",
        transition: "transform 0.2s ease",
        flexShrink: 0,
        marginLeft: 12,
      }}
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}
