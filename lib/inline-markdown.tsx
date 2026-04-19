// Minimal inline markdown for Ambo — only **bold** and *italic*.
// Not a general markdown parser: no links, code, lists. Deliberate.
//
// Used in Preach to render emphasis the priest added via Cmd+B / Cmd+I
// in Write. In Write the asterisks are visible in the textarea; in Preach
// they resolve into styled spans.

import type { ReactNode } from "react";

// Pattern order matters: bold before italic so ** doesn't greedy-match as *.
// Both patterns require non-space immediately inside the markers so that
// stray asterisks in prose don't accidentally start a span.
const BOLD = /\*\*(\S(?:.*?\S)?)\*\*/;
const ITALIC = /\*(\S(?:.*?\S)?)\*/;

function splitOne(input: string, pattern: RegExp, wrap: (inner: ReactNode, key: string) => ReactNode): ReactNode[] {
  const out: ReactNode[] = [];
  let remaining = input;
  let i = 0;
  while (remaining.length > 0) {
    const m = remaining.match(pattern);
    if (!m || m.index === undefined) {
      out.push(remaining);
      break;
    }
    if (m.index > 0) out.push(remaining.slice(0, m.index));
    out.push(wrap(m[1], `m-${i}`));
    remaining = remaining.slice(m.index + m[0].length);
    i++;
  }
  return out;
}

export function renderInline(text: string): ReactNode[] {
  // First bold, then italic. Because bold chunks are already React nodes,
  // we only apply italic to the remaining string pieces.
  const boldPass = splitOne(text, BOLD, (inner, key) => (
    <strong key={`b-${key}`}>{inner}</strong>
  ));

  const out: ReactNode[] = [];
  boldPass.forEach((node, bi) => {
    if (typeof node === "string") {
      splitOne(node, ITALIC, (inner, key) => (
        <em key={`i-${bi}-${key}`}>{inner}</em>
      )).forEach((n, ii) => {
        if (typeof n === "string") {
          out.push(<span key={`t-${bi}-${ii}`}>{n}</span>);
        } else {
          out.push(n);
        }
      });
    } else {
      out.push(node);
    }
  });
  return out;
}
