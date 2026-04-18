"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;

    setLoading(true);
    setError("");

    const supabase = createClient();
    const { error: authError } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    setLoading(false);

    if (authError) {
      setError("Something went wrong. Please try again.");
    } else {
      setSent(true);
    }
  };

  return (
    <div style={{
      minHeight: "100vh",
      background: "var(--ambo-bg)",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: "24px",
    }}>

      {/* Logo */}
      <div style={{ marginBottom: 40, textAlign: "center" }}>
        <AmboLogo />
        <h1 style={{
          marginTop: 12,
          fontSize: 28,
          fontWeight: 600,
          letterSpacing: "-0.02em",
          color: "var(--ambo-text-primary)",
        }}>
          Ambo
        </h1>
        <p style={{
          marginTop: 6,
          fontSize: 15,
          color: "var(--ambo-text-secondary)",
        }}>
          A place to write your homily
        </p>
      </div>

      {/* Card */}
      <div className="glass-card" style={{
        width: "100%",
        maxWidth: 380,
        padding: "32px 28px",
      }}>
        {sent ? (
          /* Sent state */
          <div style={{ textAlign: "center" }}>
            <div style={{
              width: 48,
              height: 48,
              borderRadius: "50%",
              background: "var(--ambo-accent-light)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 20px",
            }}>
              <EnvelopeIcon />
            </div>
            <h2 style={{
              fontSize: 18,
              fontWeight: 600,
              color: "var(--ambo-text-primary)",
              margin: "0 0 8px",
            }}>
              Check your email
            </h2>
            <p style={{
              fontSize: 14,
              color: "var(--ambo-text-secondary)",
              lineHeight: 1.6,
              margin: "0 0 24px",
            }}>
              We sent a sign-in link to <strong>{email}</strong>. Click it and you&apos;ll be in.
            </p>
            <button
              onClick={() => { setSent(false); setEmail(""); }}
              style={ghostBtnStyle}
            >
              Use a different email
            </button>
          </div>
        ) : (
          /* Email form */
          <form onSubmit={handleSubmit}>
            <h2 style={{
              fontSize: 18,
              fontWeight: 600,
              color: "var(--ambo-text-primary)",
              margin: "0 0 6px",
            }}>
              Sign in
            </h2>
            <p style={{
              fontSize: 14,
              color: "var(--ambo-text-secondary)",
              margin: "0 0 24px",
              lineHeight: 1.5,
            }}>
              Enter your email and we&apos;ll send you a sign-in link — no password needed.
            </p>

            <label style={{
              display: "block",
              fontSize: 12,
              fontWeight: 600,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              color: "var(--ambo-text-muted)",
              marginBottom: 8,
            }}>
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              required
              autoFocus
              style={{
                width: "100%",
                padding: "12px 14px",
                border: "1px solid var(--ambo-border)",
                borderRadius: "var(--ambo-radius-sm)",
                background: "rgba(255,255,255,0.6)",
                fontSize: 16,
                color: "var(--ambo-text-primary)",
                fontFamily: "inherit",
                outline: "none",
                boxSizing: "border-box",
                marginBottom: error ? 8 : 20,
                transition: "border-color 0.15s",
              }}
              onFocus={(e) => e.target.style.borderColor = "var(--ambo-accent)"}
              onBlur={(e) => e.target.style.borderColor = "var(--ambo-border)"}
            />

            {error && (
              <p style={{
                fontSize: 13,
                color: "#c0392b",
                margin: "0 0 16px",
              }}>
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading || !email.trim()}
              style={{
                width: "100%",
                padding: "13px",
                background: loading || !email.trim()
                  ? "var(--ambo-border)"
                  : "var(--ambo-accent)",
                color: loading || !email.trim()
                  ? "var(--ambo-text-muted)"
                  : "#fff",
                border: "none",
                borderRadius: "var(--ambo-radius-sm)",
                fontSize: 15,
                fontWeight: 600,
                fontFamily: "inherit",
                cursor: loading || !email.trim() ? "default" : "pointer",
                transition: "background 0.15s",
              }}
            >
              {loading ? "Sending…" : "Send sign-in link"}
            </button>
          </form>
        )}
      </div>

      <p style={{
        marginTop: 32,
        fontSize: 12,
        color: "var(--ambo-text-muted)",
        textAlign: "center",
        maxWidth: 320,
        lineHeight: 1.6,
      }}>
        Your homilies are private and only visible to you.
      </p>
    </div>
  );
}

const ghostBtnStyle: React.CSSProperties = {
  border: "1px solid var(--ambo-border)",
  background: "transparent",
  color: "var(--ambo-text-secondary)",
  fontSize: 13,
  fontWeight: 500,
  padding: "9px 18px",
  borderRadius: 100,
  cursor: "pointer",
  fontFamily: "inherit",
};

function AmboLogo() {
  return (
    <svg width="40" height="40" viewBox="0 0 24 24" fill="none">
      <rect x="9" y="2" width="6" height="12" rx="1.5" fill="var(--ambo-accent)" opacity="0.85" />
      <rect x="5" y="10" width="14" height="2.5" rx="1.25" fill="var(--ambo-accent)" />
      <rect x="11" y="14.5" width="2" height="7.5" rx="1" fill="var(--ambo-accent)" opacity="0.6" />
      <rect x="8" y="21" width="8" height="1.5" rx="0.75" fill="var(--ambo-accent)" opacity="0.5" />
    </svg>
  );
}

function EnvelopeIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
      stroke="var(--ambo-accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <polyline points="2,4 12,13 22,4" />
    </svg>
  );
}
