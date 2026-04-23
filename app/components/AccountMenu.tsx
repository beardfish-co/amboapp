"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

export default function AccountMenu() {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const [changing, setChanging] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [signingOut, setSigningOut] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // Load current user email
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      setEmail(data.user?.email ?? null);
    });
  }, []);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
        setChanging(false);
        setNewEmail("");
        setMessage("");
        setError("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const handleChangeEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmail.trim() || newEmail.trim() === email) return;
    setSaving(true);
    setError("");
    setMessage("");
    const supabase = createClient();
    const { error: updateError } = await supabase.auth.updateUser({
      email: newEmail.trim().toLowerCase(),
    });
    setSaving(false);
    if (updateError) {
      setError(updateError.message || "Something went wrong. Please try again.");
    } else {
      setMessage(`Confirmation sent to ${newEmail.trim()}. Click the link in that email to confirm.`);
      setChanging(false);
      setNewEmail("");
    }
  };

  const handleSignOut = async () => {
    setSigningOut(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  };

  return (
    <div ref={menuRef} style={{ position: "relative" }}>
      {/* Trigger button */}
      <button
        onClick={() => { setOpen((v) => !v); setChanging(false); setMessage(""); setError(""); }}
        style={{
          border: "1px solid var(--ambo-border)",
          background: open ? "var(--ambo-accent-light)" : "transparent",
          color: open ? "var(--ambo-accent)" : "var(--ambo-text-muted)",
          borderRadius: 100,
          width: 32,
          height: 32,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          transition: "all 0.15s",
          flexShrink: 0,
        }}
        title="Account"
      >
        <PersonIcon />
      </button>

      {/* Dropdown */}
      {open && (
        <div style={{
          position: "absolute",
          top: "calc(100% + 8px)",
          right: 0,
          width: 280,
          background: "var(--ambo-surface)",
          border: "1px solid var(--ambo-border)",
          borderRadius: 12,
          boxShadow: "var(--ambo-shadow-md)",
          overflow: "hidden",
          zIndex: 100,
        }}>
          {/* Email display */}
          <div style={{
            padding: "14px 16px",
            borderBottom: "1px solid var(--ambo-border)",
          }}>
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--ambo-text-muted)", marginBottom: 3 }}>
              Signed in as
            </div>
            <div style={{ fontSize: 13, color: "var(--ambo-text-primary)", fontWeight: 500, wordBreak: "break-all" }}>
              {email ?? "…"}
            </div>
          </div>

          {/* Success message */}
          {message && (
            <div style={{ padding: "12px 16px", fontSize: 13, color: "var(--ambo-accent)", lineHeight: 1.5, borderBottom: "1px solid var(--ambo-border)" }}>
              {message}
            </div>
          )}

          {/* Change email */}
          <div style={{ padding: "8px 0" }}>
            {!changing ? (
              <button
                onClick={() => { setChanging(true); setMessage(""); }}
                style={menuItemStyle}
              >
                Change email
              </button>
            ) : (
              <form onSubmit={handleChangeEmail} style={{ padding: "8px 16px 12px" }}>
                <label style={{ display: "block", fontSize: 11, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--ambo-text-muted)", marginBottom: 6 }}>
                  New email address
                </label>
                <input
                  type="email"
                  value={newEmail}
                  onChange={(e) => { setNewEmail(e.target.value); setError(""); }}
                  placeholder="new@email.com"
                  autoFocus
                  required
                  style={{
                    width: "100%",
                    padding: "9px 12px",
                    border: "1px solid var(--ambo-border)",
                    borderRadius: 8,
                    background: "rgba(255,255,255,0.6)",
                    fontSize: 14,
                    color: "var(--ambo-text-primary)",
                    fontFamily: "inherit",
                    outline: "none",
                    boxSizing: "border-box",
                    marginBottom: error ? 6 : 10,
                  }}
                  onFocus={(e) => e.target.style.borderColor = "var(--ambo-accent)"}
                  onBlur={(e) => e.target.style.borderColor = "var(--ambo-border)"}
                />
                {error && (
                  <p style={{ fontSize: 12, color: "#c0392b", margin: "0 0 8px" }}>{error}</p>
                )}
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    type="submit"
                    disabled={saving || !newEmail.trim() || newEmail.trim() === email}
                    style={{
                      flex: 1,
                      padding: "8px",
                      background: saving || !newEmail.trim() || newEmail.trim() === email ? "var(--ambo-border)" : "var(--ambo-accent)",
                      color: saving || !newEmail.trim() || newEmail.trim() === email ? "var(--ambo-text-muted)" : "#fff",
                      border: "none",
                      borderRadius: 8,
                      fontSize: 13,
                      fontWeight: 600,
                      fontFamily: "inherit",
                      cursor: saving || !newEmail.trim() ? "default" : "pointer",
                    }}
                  >
                    {saving ? "Sending…" : "Send confirmation"}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setChanging(false); setNewEmail(""); setError(""); }}
                    style={{
                      padding: "8px 12px",
                      background: "transparent",
                      border: "1px solid var(--ambo-border)",
                      borderRadius: 8,
                      fontSize: 13,
                      color: "var(--ambo-text-muted)",
                      fontFamily: "inherit",
                      cursor: "pointer",
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}
          </div>

          {/* About */}
          <div style={{ borderTop: "1px solid var(--ambo-border)", padding: "8px 0" }}>
            <button
              onClick={() => { setOpen(false); router.push("/about"); }}
              style={menuItemStyle}
            >
              About Ambo
            </button>
          </div>

          {/* Sign out */}
          <div style={{ borderTop: "1px solid var(--ambo-border)", padding: "8px 0" }}>
            <button
              onClick={handleSignOut}
              disabled={signingOut}
              style={{ ...menuItemStyle, color: "#c0392b" }}
            >
              {signingOut ? "Signing out…" : "Sign out"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const menuItemStyle: React.CSSProperties = {
  display: "block",
  width: "100%",
  padding: "8px 16px",
  border: "none",
  background: "transparent",
  textAlign: "left",
  fontSize: 13,
  color: "var(--ambo-text-primary)",
  fontFamily: "inherit",
  cursor: "pointer",
};

function PersonIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
    </svg>
  );
}
