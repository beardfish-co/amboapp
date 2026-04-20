"use client";

// RichEditor — Phase 1 Tiptap scaffold.
//
// Wraps @tiptap/react's useEditor + EditorContent behind a tiny API so the
// Write surface can swap one <textarea>-per-paragraph for a single rich-text
// editor without dragging Tiptap primitives through WriteView. Commit 1 only
// sets the file up and verifies it compiles; the actual swap happens in the
// next commit.

import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
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
        // We keep only what Phase 1 actually wants: paragraph / bold / italic
        // / blockquote. Everything else stays on StarterKit defaults so we
        // don't lose keyboard shortcuts priests might rely on (Enter,
        // Backspace, cursor navigation).
      }),
    ],
    content: initialHtml,
    editorProps: {
      attributes: {
        // Match the textarea's typography so the visual weight doesn't shift
        // between Phase 1 and the legacy view during the transition.
        class: "ambo-rich-editor",
        "data-placeholder": placeholder ?? "",
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
