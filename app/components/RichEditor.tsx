"use client";

// RichEditor — Phase 2 Tiptap wrapper.
//
// Wraps @tiptap/react's useEditor + EditorContent and adds:
//  * QuoteWithCitation — custom blockquote node (Phase 2, Commit 1)
//  * DragHandle — hover-revealed grip on the left of the current block
//    that lets the priest drag paragraphs/quotes into a new order
//    (Phase 2, Commit 2).

import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { DragHandle } from "@tiptap/extension-drag-handle-react";
import { useEffect } from "react";
import QuoteWithCitation from "./QuoteWithCitation";

export type RichEditorProps = {
  // Initial HTML content to seed the editor with. We intentionally don't
  // support prop-driven updates after mount — the editor owns its state
  // once loaded. Re-key the component when the underlying homily changes.
  initialHtml: string;
  onUpdate?: (editor: Editor) => void;
  onReady?: (editor: Editor) => void;
  placeholder?: string;
};

function GripIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
    >
      <circle cx="9" cy="5" r="1.5" fill="currentColor" />
      <circle cx="15" cy="5" r="1.5" fill="currentColor" />
      <circle cx="9" cy="12" r="1.5" fill="currentColor" />
      <circle cx="15" cy="12" r="1.5" fill="currentColor" />
      <circle cx="9" cy="19" r="1.5" fill="currentColor" />
      <circle cx="15" cy="19" r="1.5" fill="currentColor" />
    </svg>
  );
}

export default function RichEditor({
  initialHtml,
  onUpdate,
  onReady,
  placeholder,
}: RichEditorProps) {
  const editor = useEditor({
    // Tiptap warns in Next.js if we try to render the editor server-side;
    // this flag tells it to skip SSR entirely.
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        // Keep only what Phase 1 needs: paragraph / bold / italic / blockquote.
        // Everything else stays on StarterKit defaults so Enter, Backspace,
        // and cursor navigation behave as priests expect.
        //
        // Phase 2: swap the stock Blockquote for our QuoteWithCitation node
        // (extends Blockquote with a `citation` attribute + NodeView).
        blockquote: false,
      }),
      QuoteWithCitation,
      Placeholder.configure({
        placeholder: placeholder ?? "",
        // Only show placeholder in the first (and only) paragraph of an
        // empty document — not on every empty line after the user has
        // started writing.
        showOnlyWhenEditable: true,
        showOnlyCurrent: false,
        includeChildren: false,
      }),
    ],
    content: initialHtml,
    editorProps: {
      attributes: {
        class: "ambo-rich-editor",
      },
    },
    onUpdate: ({ editor }) => {
      onUpdate?.(editor);
    },
  });

  useEffect(() => {
    if (editor && onReady) onReady(editor);
  }, [editor, onReady]);

  if (!editor) return null;
  return (
    <>
      <EditorContent editor={editor} />
      {/* DragHandle positions itself absolutely next to the block the
          cursor/mouse is hovering over. CSS (see globals.css .ambo-drag-handle)
          keeps it invisible until the user hovers over the editor area. */}
      <DragHandle editor={editor} className="ambo-drag-handle">
        <GripIcon />
      </DragHandle>
    </>
  );
}
