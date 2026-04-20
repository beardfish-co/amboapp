"use client";

// RichEditor — Tiptap wrapper for the Write surface.
//
// Phase 1 scaffolded the Tiptap editor. Phase 2 adds a hover-revealed
// drag handle for reordering top-level blocks. The handle is a plain
// React element rendered alongside EditorContent — it does NOT register
// a ProseMirror plugin. (The first Phase 2 attempt used
// @tiptap/extension-drag-handle-react; its internal
// editor.registerPlugin call raced the initial content load and silently
// blanked existing homilies. We reverted it and rolled our own.)
//
// Commit 1 of Phase 2 v2: visibility only — the handle appears next to
// the hovered block but has no drag behaviour yet. Drag logic lands in
// Commit 2.

import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { useEffect, useRef, useState } from "react";

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
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="9" cy="5" r="1.5" fill="currentColor" />
      <circle cx="15" cy="5" r="1.5" fill="currentColor" />
      <circle cx="9" cy="12" r="1.5" fill="currentColor" />
      <circle cx="15" cy="12" r="1.5" fill="currentColor" />
      <circle cx="9" cy="19" r="1.5" fill="currentColor" />
      <circle cx="15" cy="19" r="1.5" fill="currentColor" />
    </svg>
  );
}

type HandlePos = { top: number };

// Walks up from `node` until it finds an element whose parent is the
// editor's contenteditable root — that's the top-level block (a <p>, a
// <blockquote>, etc.). Returns null if the cursor isn't over a block.
function findTopLevelBlock(node: Node | null, editorEl: HTMLElement): HTMLElement | null {
  let cur: Node | null = node;
  while (cur && cur !== editorEl) {
    if (cur instanceof HTMLElement && cur.parentElement === editorEl) {
      return cur;
    }
    cur = cur.parentNode;
  }
  return null;
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

  // --- Hover-revealed drag handle (no drag behaviour in Commit 1) ---
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const [handlePos, setHandlePos] = useState<HandlePos | null>(null);

  useEffect(() => {
    if (!editor) return;
    const scroller = scrollerRef.current;
    const editorEl = editor.view.dom as HTMLElement;
    if (!scroller || !editorEl) return;

    // Listen on document (not scroller) because the handle is absolutely
    // positioned at left: -32px, outside the scroller's layout box. A
    // scroller-level mouseleave fires as soon as the cursor crosses the
    // left edge on its way to grab the handle, which would unmount the
    // handle before the cursor arrived.
    const onMove = (e: MouseEvent) => {
      const scrollerRect = scroller.getBoundingClientRect();
      // Expanded hit area: include the ~36px left margin where the
      // handle floats, plus a small vertical slack.
      const inBounds =
        e.clientX >= scrollerRect.left - 36 &&
        e.clientX <= scrollerRect.right &&
        e.clientY >= scrollerRect.top - 4 &&
        e.clientY <= scrollerRect.bottom + 4;
      if (!inBounds) {
        setHandlePos(null);
        return;
      }
      // While the cursor is in the handle's margin (or on the handle
      // itself), keep the current position stable so the user can reach
      // and grab it.
      if (e.clientX < scrollerRect.left) return;
      const hit = document.elementFromPoint(e.clientX, e.clientY);
      if (!(hit instanceof Node) || !editorEl.contains(hit)) return;
      const block = findTopLevelBlock(hit, editorEl);
      if (!block) return;
      const blockRect = block.getBoundingClientRect();
      // Align handle with the first line of the block (top + 4px to
      // centre the grip against the baseline).
      setHandlePos({ top: blockRect.top - scrollerRect.top + 4 });
    };

    document.addEventListener("mousemove", onMove);
    return () => {
      document.removeEventListener("mousemove", onMove);
    };
  }, [editor]);

  if (!editor) return null;
  return (
    <div ref={scrollerRef} className="ambo-rich-editor-scroller">
      <EditorContent editor={editor} />
      {handlePos && (
        <button
          type="button"
          aria-label="Drag to reorder (not yet wired up)"
          className="ambo-drag-handle"
          style={{ top: handlePos.top }}
          contentEditable={false}
          // Commit 1 intentionally has no onClick / draggable. The handle
          // is visual-only until Commit 2 wires drag-to-reorder.
          tabIndex={-1}
        >
          <GripIcon />
        </button>
      )}
    </div>
  );
}
