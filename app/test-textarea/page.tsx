"use client";

import { useState, useRef } from "react";
import TextareaAutosize from "react-textarea-autosize";

// Wrapper-driven growth component:
// The textarea grows instantly (no transition on it).
// The wrapper div animates max-height from the previous height to the new height.
// Text never repositions because the textarea's own height never transitions.
function WrapperGrown({
  value,
  onChange,
  placeholder,
  textareaStyle,
  wrapperStyle,
}: {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  placeholder: string;
  textareaStyle?: Omit<React.CSSProperties, 'height'>;
  wrapperStyle?: Omit<React.CSSProperties, 'height'>;
}) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const currentHeightRef = useRef<number>(0);

  return (
    <div
      ref={wrapperRef}
      style={{
        overflow: "hidden",
        // Start at 0 so the first onHeightChange sets it correctly.
        // transition on max-height: the wrapper reveals more content as the
        // textarea grows — the textarea itself never animates height.
        transition: "max-height 1000ms ease-in-out",
        ...wrapperStyle,
      }}
    >
      <TextareaAutosize
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        onHeightChange={(height) => {
          const wrapper = wrapperRef.current;
          if (!wrapper) return;
          // Snap the wrapper to the new height when content shrinks or on first load,
          // ease it open when content grows.
          if (height > currentHeightRef.current) {
            // Growing — let the CSS transition animate max-height upward
            wrapper.style.maxHeight = `${height}px`;
          } else {
            // Shrinking or first paint — snap immediately (disable transition momentarily)
            wrapper.style.transition = "none";
            wrapper.style.maxHeight = `${height}px`;
            // Re-enable transition after the frame commits
            requestAnimationFrame(() => {
              if (wrapperRef.current) {
                wrapperRef.current.style.transition = "max-height 1000ms ease-in-out";
              }
            });
          }
          currentHeightRef.current = height;
        }}
        style={{
          display: "block",
          width: "100%",
          // No height transition — the textarea grows instantly.
          // The wrapper's max-height transition does the visual easing.
          ...textareaStyle,
        }}
      />
    </div>
  );
}

export default function TestTextareaPage() {
  const [value, setValue] = useState("");
  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => setValue(e.target.value);

  const baseStyle: React.CSSProperties = {
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
    <div style={{
      minHeight: "100svh",
      background: "#f7f9fc",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "flex-start",
      paddingTop: 80,
      fontFamily: "Georgia, serif",
    }}>
      <h1 style={{ fontSize: 16, fontWeight: 400, color: "#666", marginBottom: 8 }}>
        TextareaAutosize — transition variants
      </h1>
      <p style={{ fontSize: 13, color: "#999", marginBottom: 48 }}>
        All four share the same typed value. Type until text wraps.
      </p>

      {/* 1. Minimal — library + height transition directly on textarea */}
      <div style={{ width: 480, marginBottom: 48 }}>
        <p style={{ fontSize: 11, color: "#999", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.08em" }}>
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

      {/* 2. Flex column — matches Discernment card structure + height transition */}
      <div style={{ width: 480, marginBottom: 48 }}>
        <p style={{ fontSize: 11, color: "#999", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.08em" }}>
          2 — Flex column (height transition on textarea)
        </p>
        <div style={{
          display: "flex",
          flexDirection: "column",
          border: "1px solid #ccc",
          borderRadius: 8,
          background: "#fff",
          overflow: "hidden",
          padding: "16px 18px",
        }}>
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

      {/* 3. Control — no transition (instant snap, no displacement expected) */}
      <div style={{ width: 480, marginBottom: 48 }}>
        <p style={{ fontSize: 11, color: "#999", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.08em" }}>
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

      {/* 4. Wrapper-driven — textarea grows instantly, wrapper max-height transitions */}
      <div style={{ width: 480, marginBottom: 80 }}>
        <p style={{ fontSize: 11, color: "#999", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.08em" }}>
          4 — Wrapper-driven (max-height on wrapper, no transition on textarea)
        </p>
        <div style={{
          border: "1px solid #ccc",
          borderRadius: 8,
          background: "#fff",
          padding: "12px 16px",
        }}>
          <WrapperGrown
            value={value}
            onChange={handleChange}
            placeholder="Type here until the text wraps…"
            textareaStyle={{
              ...baseStyle,
              padding: 0,
              background: "transparent",
            }}
          />
        </div>
      </div>
    </div>
  );
}
