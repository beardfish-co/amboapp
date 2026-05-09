"use client";

import { useState, useRef, useCallback } from "react";
import TextareaAutosize from "react-textarea-autosize";

// ── Types ────────────────────────────────────────────────────────────────────
type TextareaStyle = Omit<React.CSSProperties, "height">;

interface ReadoutState {
  t: number;
  clientHeight: number;
  scrollHeight: number;
  scrollTop: number;
  styleHeight: string;
  selectionStart: number | null;
}

// ── WrapperGrown component ───────────────────────────────────────────────────
function WrapperGrown({
  value,
  onChange,
  placeholder,
  textareaStyle,
  onReadout,
}: {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  placeholder: string;
  textareaStyle?: TextareaStyle;
  onReadout?: (r: ReadoutState) => void;
}) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const currentHeightRef = useRef<number>(0);
  const rafLoopRef = useRef<number | null>(null);
  const inputTimeRef = useRef<number>(0);

  const startReadoutLoop = useCallback(() => {
    if (rafLoopRef.current !== null) cancelAnimationFrame(rafLoopRef.current);
    inputTimeRef.current = performance.now();

    const loop = () => {
      const el = textareaRef.current;
      if (!el || !onReadout) return;
      const t = performance.now() - inputTimeRef.current;
      const entry: ReadoutState = {
        t: Math.round(t),
        clientHeight: el.clientHeight,
        scrollHeight: el.scrollHeight,
        scrollTop: el.scrollTop,
        styleHeight: el.style.height,
        selectionStart: el.selectionStart,
      };
      // Console log
      console.log("[textarea-diag]", JSON.stringify(entry));
      // On-screen readout
      onReadout(entry);
      if (t < 1200) {
        rafLoopRef.current = requestAnimationFrame(loop);
      }
    };
    rafLoopRef.current = requestAnimationFrame(loop);
  }, [onReadout]);

  return (
    <div
      ref={wrapperRef}
      className="test-textarea-wrapper"
      style={{
        overflow: "hidden",
        transition: "max-height 1000ms ease-in-out",
      }}
    >
      <TextareaAutosize
        ref={textareaRef}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className="test-textarea-element"
        onInput={startReadoutLoop}
        onHeightChange={(height) => {
          const wrapper = wrapperRef.current;
          if (!wrapper) return;
          if (height > currentHeightRef.current) {
            wrapper.style.maxHeight = `${height}px`;
          } else {
            wrapper.style.transition = "none";
            wrapper.style.maxHeight = `${height}px`;
            requestAnimationFrame(() => {
              if (wrapperRef.current) {
                wrapperRef.current.style.transition =
                  "max-height 1000ms ease-in-out";
              }
            });
          }
          currentHeightRef.current = height;
        }}
        style={{
          display: "block",
          width: "100%",
          ...textareaStyle,
        }}
      />
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default function TestTextareaPage() {
  const [value, setValue] = useState("");
  const [readout, setReadout] = useState<ReadoutState | null>(null);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) =>
    setValue(e.target.value);

  const baseStyle: TextareaStyle = {
    border: "none",
    outline: "none",
    resize: "none",
    overflow: "hidden",
    background: "transparent",
    color: "#111",
    fontFamily: "Georgia, serif",
    fontSize: 16,
    lineHeight: 1.65,
    verticalAlign: "top",
  };

  return (
    <>
      {/* Diagnostic CSS — test page only, never production */}
      <style>{`
        .test-textarea-element { outline: 2px solid red !important; }
        .test-textarea-wrapper { outline: 2px solid blue !important; }
      `}</style>

      <div
        style={{
          minHeight: "100svh",
          background: "#f7f9fc",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "flex-start",
          paddingTop: 80,
          paddingBottom: 120,
          fontFamily: "Georgia, serif",
        }}
      >
        <h1
          style={{ fontSize: 16, fontWeight: 400, color: "#666", marginBottom: 8 }}
        >
          TextareaAutosize — transition variants
        </h1>
        <p style={{ fontSize: 13, color: "#999", marginBottom: 48 }}>
          All four share the same typed value. Type until text wraps.
        </p>

        {/* 1 — Minimal */}
        <div style={{ width: 480, marginBottom: 48 }}>
          <p
            style={{
              fontSize: 11,
              color: "#999",
              marginBottom: 8,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
            }}
          >
            1 — Minimal (height transition on textarea)
          </p>
          <TextareaAutosize
            value={value}
            onChange={handleChange}
            placeholder="Type here until the text wraps…"
            style={{
              ...baseStyle,
              width: "100%",
              border: "1px solid #ccc",
              borderRadius: 8,
              padding: "12px 16px",
              background: "#fff",
              transition: "height 1000ms ease-in-out",
            }}
          />
        </div>

        {/* 2 — Flex column */}
        <div style={{ width: 480, marginBottom: 48 }}>
          <p
            style={{
              fontSize: 11,
              color: "#999",
              marginBottom: 8,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
            }}
          >
            2 — Flex column (height transition on textarea)
          </p>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              border: "1px solid #ccc",
              borderRadius: 8,
              background: "#fff",
              overflow: "hidden",
              padding: "16px 18px",
            }}
          >
            <TextareaAutosize
              value={value}
              onChange={handleChange}
              placeholder="Type here until the text wraps…"
              style={{
                ...baseStyle,
                width: "100%",
                padding: 0,
                fontStyle: "italic",
                transition: "height 1000ms ease-in-out",
              }}
            />
          </div>
        </div>

        {/* 3 — Control (no transition) */}
        <div style={{ width: 480, marginBottom: 48 }}>
          <p
            style={{
              fontSize: 11,
              color: "#999",
              marginBottom: 8,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
            }}
          >
            3 — Control (no transition)
          </p>
          <TextareaAutosize
            value={value}
            onChange={handleChange}
            placeholder="Type here until the text wraps…"
            style={{
              ...baseStyle,
              width: "100%",
              border: "1px solid #ccc",
              borderRadius: 8,
              padding: "12px 16px",
              background: "#fff",
            }}
          />
        </div>

        {/* 4 — Wrapper-driven (instrumented) */}
        <div style={{ width: 480, marginBottom: 24 }}>
          <p
            style={{
              fontSize: 11,
              color: "#999",
              marginBottom: 8,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
            }}
          >
            4 — Wrapper-driven (max-height on wrapper · red=textarea · blue=wrapper)
          </p>
          <div
            style={{
              border: "1px solid #ccc",
              borderRadius: 8,
              background: "#fff",
              padding: "12px 16px",
            }}
          >
            <WrapperGrown
              value={value}
              onChange={handleChange}
              placeholder="Type here until the text wraps…"
              textareaStyle={{ ...baseStyle, padding: 0 }}
              onReadout={setReadout}
            />
          </div>
        </div>

        {/* On-screen readout panel */}
        <div
          style={{
            width: 480,
            fontFamily: "monospace",
            fontSize: 12,
            background: readout ? "#1a1a2e" : "#eee",
            color: readout ? "#00ff88" : "#999",
            borderRadius: 8,
            padding: "12px 16px",
            lineHeight: 1.8,
            minHeight: 120,
            transition: "background 0.2s",
          }}
        >
          {readout ? (
            <>
              <div>
                <span style={{ color: "#888" }}>t ms:          </span>
                {readout.t}
              </div>
              <div>
                <span style={{ color: "#888" }}>clientHeight:  </span>
                <strong style={{ color: readout.scrollTop > 0 ? "#ff4444" : "#00ff88" }}>
                  {readout.clientHeight}
                </strong>
              </div>
              <div>
                <span style={{ color: "#888" }}>scrollHeight:  </span>
                {readout.scrollHeight}
              </div>
              <div>
                <span style={{ color: "#888" }}>scrollTop:     </span>
                <strong style={{ color: readout.scrollTop > 0 ? "#ff4444" : "#00ff88" }}>
                  {readout.scrollTop}
                </strong>
              </div>
              <div>
                <span style={{ color: "#888" }}>style.height:  </span>
                {readout.styleHeight || "(unset)"}
              </div>
              <div>
                <span style={{ color: "#888" }}>selectionStart:</span>
                {readout.selectionStart}
              </div>
            </>
          ) : (
            <div style={{ paddingTop: 8 }}>
              Readout will appear here after you type in variant 4.
              <br />
              scrollTop and clientHeight highlight red if non-zero / unexpected.
            </div>
          )}
        </div>
      </div>
    </>
  );
}
