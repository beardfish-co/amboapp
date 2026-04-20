"use client";

// RichEditor — Tiptap wrapper for the Write surface.
//
// Wraps @tiptap/react's useEditor + EditorContent and adds
// @tiptap/extension-drag-handle-react's hover-revealed grip on the left
// of the current block (Phase 2, Commit 2).
//
// NOTE: the custom QuoteWithCitation node introduced in Phase 2 Commit 1
// was reverted — existing content failed to render through its NodeView.
// We'll revisit citation UX separately; for now, citations stay as the
// trailing "— Source" line inside the quote block (Phase 1 behavior).

import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { DragHandle } from "@tiptap/extension-drag-handle-react";
import { useEffect } from "react";

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
        // Keep StarterKit defaults: paragraph / bold / italic / blockquote
        // plus Enter / Backspace / cursor behaviour priests expect.
      }),
      Placeholder.configure({
        placeholder: placeholder ?? "",
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
      <DragHandle editor={editor} className="ambo-drag-handle">
        <GripIcon />
      </DragHandle>
    </>
  );
}
