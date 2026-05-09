"use client";

import { useState } from "react";
import TextareaAutosize from "react-textarea-autosize";

export default function TestTextareaPage() {
  const [value, setValue] = useState("");

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
      <h1 style={{ fontSize: 16, fontWeight: 400, color: "#666", marginBottom: 32 }}>
        Minimal TextareaAutosize — transition test
      </h1>

      {/* Minimal: just the library + same transition, no other wrappers */}
      <div style={{ width: 480, marginBottom: 60 }}>
        <p style={{ fontSize: 11, color: "#999", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.08em" }}>
          Minimal — no parent flex/grid
        </p>
        <TextareaAutosize
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Type here until the text wraps to a second line…"
          style={{
            width: "100%",
            border: "1px solid #ccc",
            borderRadius: 8,
            outline: "none",
            resize: "none",
            overflow: "hidden",
            background: "#fff",
            color: "#111",
            fontFamily: "Georgia, serif",
            fontSize: 16,
            lineHeight: 1.65,
            padding: "12px 16px",
            transition: "height 1000ms ease-in-out",
            verticalAlign: "top",
          }}
        />
      </div>

      {/* Same thing inside a flex column — matches Discernment card structure */}
      <div style={{ width: 480, marginBottom: 60 }}>
        <p style={{ fontSize: 11, color: "#999", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.08em" }}>
          Inside flex column (matches card structure)
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
            onChange={(e) => setValue(e.target.value)}
            placeholder="Type here until the text wraps to a second line…"
            style={{
              width: "100%",
              border: "none",
              outline: "none",
              resize: "none",
              overflow: "hidden",
              background: "transparent",
              color: "#111",
              fontFamily: "Georgia, serif",
              fontSize: 16,
              fontStyle: "italic",
              lineHeight: 1.65,
              padding: 0,
              transition: "height 1000ms ease-in-out",
              verticalAlign: "top",
            }}
          />
        </div>
      </div>

      {/* Without the transition — control group */}
      <div style={{ width: 480 }}>
        <p style={{ fontSize: 11, color: "#999", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.08em" }}>
          Control — no transition (should snap with no displacement)
        </p>
        <TextareaAutosize
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Type here until the text wraps to a second line…"
          style={{
            width: "100%",
            border: "1px solid #ccc",
            borderRadius: 8,
            outline: "none",
            resize: "none",
            overflow: "hidden",
            background: "#fff",
            color: "#111",
            fontFamily: "Georgia, serif",
            fontSize: 16,
            lineHeight: 1.65,
            padding: "12px 16px",
            verticalAlign: "top",
          }}
        />
      </div>
    </div>
  );
}
