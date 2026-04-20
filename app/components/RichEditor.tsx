"use client";

// RichEditor — Phase 1 Tiptap scaffold.
//
// Wraps @tiptap/react's useEditor + EditorContent behind a tiny API so the
// Write surface can swap one <textarea>-per-paragraph for a single rich-text
// editor without dragging Tiptap primitives through WriteView.

import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
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
      }),
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
  return <EditorContent editor={editor} />;
}
