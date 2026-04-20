"use client";

// QuoteWithCitation — Phase 2 custom Tiptap node.
//
// Extends the default Blockquote node with a single `citation` attribute,
// rendered in-editor as a dedicated italic input below the quote body.
//
// Wire-format on disk is unchanged: joinParagraphs still serialises a quote
// as  "> body-line-1\n> body-line-2\n— Citation"  so the DB migration stays
// zero. The attribute lives only in the editor HTML / JSON, where Phase 1's
// trailing "— …" paragraph used to live.
//
// Storage shape in editor JSON:
//   { type: "blockquote", attrs: { citation: "Psalm 46:10" }, content: [
//       { type: "paragraph", content: [{ type: "text", text: "Be still …" }] },
//     ] }
//
// HTML parseable form (what paragraphsToHtml emits and what Tiptap stores):
//   <blockquote data-citation="Psalm 46:10">
//     <p>Be still and know that I am God.</p>
//   </blockquote>

import Blockquote from "@tiptap/extension-blockquote";
import {
  NodeViewContent,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type NodeViewProps,
} from "@tiptap/react";
import type { KeyboardEvent } from "react";

function QuoteNodeView({ node, updateAttributes }: NodeViewProps) {
  const citation = (node.attrs.citation ?? "") as string;

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    // Don't let ProseMirror hijack typing in the citation input.
    e.stopPropagation();
    if (e.key === "Enter") {
      e.preventDefault();
      (e.currentTarget as HTMLInputElement).blur();
    }
  };

  return (
    <NodeViewWrapper as="blockquote" className="ambo-quote">
      {/* Quote body — a real paragraph content area managed by ProseMirror. */}
      <NodeViewContent className="ambo-quote-body" />
      {/* Citation — rendered outside NodeViewContent so ProseMirror leaves it
          alone. contentEditable=false is belt-and-suspenders; <input> values
          are already managed by React, not ProseMirror. */}
      <div className="ambo-quote-citation-row" contentEditable={false}>
        <span className="ambo-quote-dash" aria-hidden>—</span>
        <input
          className="ambo-quote-citation"
          type="text"
          value={citation}
          placeholder="Citation"
          onChange={(e) => updateAttributes({ citation: e.target.value })}
          onKeyDown={handleKeyDown}
        />
      </div>
    </NodeViewWrapper>
  );
}

export const QuoteWithCitation = Blockquote.extend({
  addAttributes() {
    return {
      citation: {
        default: null,
        // Null citations don't emit the attribute at all — keeps the HTML
        // clean for quotes that have no citation.
        parseHTML: (el) => el.getAttribute("data-citation"),
        renderHTML: (attrs) =>
          attrs.citation ? { "data-citation": attrs.citation } : {},
      },
    };
  },
  addNodeView() {
    return ReactNodeViewRenderer(QuoteNodeView);
  },
});

export default QuoteWithCitation;
