"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import JurisdictionPicker from "@/app/components/JurisdictionPicker";
import {
  LectionaryFamily,
  JURISDICTION_OPTIONS,
} from "@/lib/jurisdiction";

interface Props {
  lectionaryFamily?: LectionaryFamily | null;
  onSelectFamily: (family: LectionaryFamily) => Promise<void>;
}

export default function AccountMenu({ lectionaryFamily, onSelectFamily }: Props) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const [changing, setChanging] = useState(false);
  const [changingTranslation, setChangingTranslation] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [signingOut, setSigningOut] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");
  const menuRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      setEmail(data.user?.email ?? null);
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        closeMenu();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const closeMenu = () => {
    setOpen(false);
    setChanging(false);
    setChangingTranslation(false);
    setNewEmail("");
    setMessage("");
    setError("");
    setConfirmDelete(false);
    setDeleteError("");
  };

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


  const handleExport = async () => {
    setExporting(true);
    setExportError("");
    try {
      const res = await fetch("/api/export");
      if (res.status === 404) {
        setExportError("No homilies to export yet.");
        setExporting(false);
        return;
      }
      if (!res.ok) {
        setExportError("Export failed. Please try again.");
        setExporting(false);
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const date = new Date().toISOString().slice(0, 10);
      a.download = `ambo-homilies-${date}.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setExportError("Export failed. Check your connection and try again.");
    }
    setExporting(false);
  };

  const handleSignOut = async () => {
    setSigningOut(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  };

  const handleDeleteAccount = async () => {
    setDeleting(true);
    setDeleteError("");
    try {
      const resp = await fetch("/api/delete-account", { method: "POST" });
      const result = await resp.json() as { ok?: boolean; error?: string };
      if (!resp.ok || !result.ok) {
        setDeleteError(result.error ?? "Something went wrong. Please contact us.");
        setDeleting(false);
        return;
      }
      // Account deleted — go to login
      router.push("/login");
    } catch {
      setDeleteError("Network error. Please try again.");
      setDeleting(false);
    }
  };

  // Find the label for the current family
  const currentOption = JURISDICTION_OPTIONS.find(o => o.family === lectionaryFamily);

  return (
    <div ref={menuRef} style={{ position: "relative" }}>
      <button
        onClick={() => { setOpen((v) => !v); setChanging(false); setChangingTranslation(false); setMessage(""); setError(""); }}
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

      {open && (
        <div style={{
          position: "absolute",
          top: "calc(100% + 8px)",
          right: 0,
          width: 300,
          background: "var(--ambo-surface-solid)",
          border: "1px solid var(--ambo-border)",
          borderRadius: 12,
          boxShadow: "var(--ambo-shadow-md)",
          overflow: "hidden",
          zIndex: 100,
        }}>

          {/* Email */}
          <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--ambo-border)" }}>
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--ambo-text-muted)", marginBottom: 3 }}>
              Signed in as
            </div>
            <div style={{ fontSize: 13, color: "var(--ambo-text-primary)", fontWeight: 500, wordBreak: "break-all" }}>
              {email ?? "…"}
            </div>
          </div>

          {message && (
            <div style={{ padding: "12px 16px", fontSize: 13, color: "var(--ambo-accent)", lineHeight: 1.5, borderBottom: "1px solid var(--ambo-border)" }}>
              {message}
            </div>
          )}

          {/* Change email */}
          <div style={{ padding: "8px 0", borderBottom: "1px solid var(--ambo-border)" }}>
            {!changing ? (
              <button onClick={() => { setChanging(true); setChangingTranslation(false); setMessage(""); }} style={menuItemStyle}>
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
                    background: "var(--ambo-surface-raised)",
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
                {error && <p style={{ fontSize: 12, color: "#c0392b", margin: "0 0 8px" }}>{error}</p>}
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    type="submit"
                    disabled={saving || !newEmail.trim() || newEmail.trim() === email}
                    style={{
                      flex: 1, padding: "8px",
                      background: saving || !newEmail.trim() || newEmail.trim() === email ? "var(--ambo-border)" : "var(--ambo-accent)",
                      color: saving || !newEmail.trim() || newEmail.trim() === email ? "var(--ambo-text-muted)" : "#fff",
                      border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, fontFamily: "inherit",
                      cursor: saving || !newEmail.trim() ? "default" : "pointer",
                    }}
                  >
                    {saving ? "Sending…" : "Send confirmation"}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setChanging(false); setNewEmail(""); setError(""); }}
                    style={{ padding: "8px 12px", background: "transparent", border: "1px solid var(--ambo-border)", borderRadius: 8, fontSize: 13, color: "var(--ambo-text-muted)", fontFamily: "inherit", cursor: "pointer" }}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}
          </div>

          {/* Reading translation */}
          <div style={{ padding: "8px 0", borderBottom: "1px solid var(--ambo-border)" }}>
            {!changingTranslation ? (
              <button
                onClick={() => { setChangingTranslation(true); setChanging(false); }}
                style={menuItemStyle}
              >
                <span style={{ display: "block" }}>Reading translation</span>
                {currentOption && (
                  <span style={{ display: "block", fontSize: 11, color: "var(--ambo-text-muted)", marginTop: 1 }}>
                    {currentOption.label}
                  </span>
                )}
              </button>
            ) : (
              <div style={{ padding: "8px 16px 12px" }}>
                <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--ambo-text-muted)", marginBottom: 10 }}>
                  Reading translation
                </div>
                <JurisdictionPicker
                  mode="settings"
                  current={lectionaryFamily}
                  onSelect={onSelectFamily}
                  onDismiss={() => setChangingTranslation(false)}
                />
                <button
                  onClick={() => setChangingTranslation(false)}
                  style={{ marginTop: 10, fontSize: 12, color: "var(--ambo-text-muted)", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", padding: 0 }}
                >
                  Cancel
                </button>
              </div>
            )}
          </div>


          {/* Export homilies */}
          <div style={{ padding: "8px 0", borderBottom: "1px solid var(--ambo-border)" }}>
            {exportError ? (
              <div style={{ padding: "8px 16px" }}>
                <p style={{ fontSize: 12, color: "#c0392b", margin: "0 0 6px" }}>{exportError}</p>
                <button
                  onClick={() => setExportError("")}
                  style={{ fontSize: 12, color: "var(--ambo-text-muted)", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", padding: 0 }}
                >
                  Dismiss
                </button>
              </div>
            ) : (
              <button
                onClick={handleExport}
                disabled={exporting}
                style={{ ...menuItemStyle, color: exporting ? "var(--ambo-text-muted)" : "var(--ambo-text-primary)" }}
              >
                {exporting ? "Preparing export…" : "Export all homilies"}
              </button>
            )}
          </div>

          {/* Take the tour */}
          <div style={{ padding: "8px 0", borderBottom: "1px solid var(--ambo-border)" }}>
            <button
              onClick={() => {
                closeMenu();
                localStorage.removeItem("ambo_tour_v1_complete");
                window.dispatchEvent(new CustomEvent("ambo:start-tour"));
              }}
              style={menuItemStyle}
            >
              Take the tour
            </button>
          </div>

          {/* About */}
          <div style={{ padding: "8px 0", borderBottom: "1px solid var(--ambo-border)" }}>
            <button onClick={() => { closeMenu(); router.push("/about"); }} style={menuItemStyle}>
              About Ambo
            </button>
          </div>

          {/* Delete account */}
          <div style={{ padding: "8px 0", borderBottom: "1px solid var(--ambo-border)" }}>
            {!confirmDelete ? (
              <button
                onClick={() => { setConfirmDelete(true); setChanging(false); setChangingTranslation(false); }}
                style={{ ...menuItemStyle, color: "var(--ambo-text-muted)", fontSize: 12 }}
              >
                Delete account
              </button>
            ) : (
              <div style={{ padding: "10px 16px 12px" }}>
                <p style={{ fontSize: 12, color: "var(--ambo-text-secondary)", lineHeight: 1.5, margin: "0 0 10px" }}>
                  This will permanently delete your account and all your homilies. This cannot be undone.
                </p>
                {deleteError && (
                  <p style={{ fontSize: 12, color: "#c0392b", margin: "0 0 8px" }}>{deleteError}</p>
                )}
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    onClick={handleDeleteAccount}
                    disabled={deleting}
                    style={{
                      flex: 1, padding: "8px",
                      background: deleting ? "var(--ambo-border)" : "#c0392b",
                      color: deleting ? "var(--ambo-text-muted)" : "#fff",
                      border: "none", borderRadius: 8, fontSize: 12, fontWeight: 600,
                      fontFamily: "inherit", cursor: deleting ? "default" : "pointer",
                    }}
                  >
                    {deleting ? "Deleting…" : "Yes, delete everything"}
                  </button>
                  <button
                    onClick={() => { setConfirmDelete(false); setDeleteError(""); }}
                    style={{ padding: "8px 12px", background: "transparent", border: "1px solid var(--ambo-border)", borderRadius: 8, fontSize: 12, color: "var(--ambo-text-muted)", fontFamily: "inherit", cursor: "pointer" }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Sign out */}
          <div style={{ padding: "8px 0", borderBottom: "1px solid var(--ambo-border)" }}>
            <button onClick={handleSignOut} disabled={signingOut} style={{ ...menuItemStyle, color: "#c0392b" }}>
              {signingOut ? "Signing out…" : "Sign out"}
            </button>
          </div>

          {/* Privacy / Terms */}
          <div style={{ padding: "10px 16px", display: "flex", gap: 12 }}>
            <a href="/privacy" style={{ fontSize: 11, color: "var(--ambo-text-muted)", textDecoration: "none" }}>Privacy</a>
            <a href="/terms" style={{ fontSize: 11, color: "var(--ambo-text-muted)", textDecoration: "none" }}>Terms</a>
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
