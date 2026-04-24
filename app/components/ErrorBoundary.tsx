"use client";

// Reusable error boundary for wrapping individual views and panels.
// Uses a class component — React's error boundary API requires it.
//
// Usage:
//   <ErrorBoundary label="Reflect">
//     <ReflectView ... />
//   </ErrorBoundary>
//
// On error, renders a calm inline fallback with a reset button.
// The label is used only in the console error log, not shown to the priest.

import { Component, ReactNode } from "react";

interface Props {
  children: ReactNode;
  label?: string; // for console logging only
}

interface State {
  hasError: boolean;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error(`[Ambo] Error in ${this.props.label ?? "component"}:`, error, info.componentStack);
  }

  reset = () => {
    this.setState({ hasError: false });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          padding: "40px 24px",
          textAlign: "center",
          color: "var(--ambo-text-secondary)",
        }}>
          <p style={{
            fontSize: 15,
            marginBottom: 20,
            lineHeight: 1.6,
            color: "var(--ambo-text-secondary)",
          }}>
            Something didn't load correctly.
          </p>
          <button
            onClick={this.reset}
            style={{
              border: "1px solid var(--ambo-border)",
              background: "transparent",
              color: "var(--ambo-text-secondary)",
              fontSize: 13,
              padding: "8px 20px",
              borderRadius: 100,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
