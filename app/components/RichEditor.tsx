"use client";

// RichEditor — Tiptap wrapper for the Write surface.
//
// Phase 1 scaffolded the Tiptap editor. Phase 2 adds a hover-revealed
// drag handle for reordering top-level blocks. Implementation rolls its
// own drag — no ProseMirror plugin registration — because the upstream
// @tiptap/extension-drag-handle-react races the initial content load
// in our Next 16 / React 19 / Tiptap 3 stack and silently blanks
// existing homilies (reverted in earlier Phase 2 attempt).
//
// Commit 1 (7a66702 / bce4ad9 / c459e39 / 6d93350): handle visibility
// with document-level mousemove tracking.
// Commit 2 (this file): HTML5 drag events on the handle, drop indicator
// while dragging, transaction-based block reorder on drop.

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

type HandlePos = { top: number; blockIndex: number };
type DropTarget = { blockIndex: number; above: boolean };

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

// Start position (in ProseMirror coords) of the Nth top-level block in
// the current doc. Sums the sizes of preceding children.
function blockStartPos(editor: Editor, blockIndex: number): number {
  let pos = 0;
  const doc = editor.state.doc;
  for (let i = 0; i < blockIndex && i < doc.childCount; i++) {
    pos += doc.child(i).nodeSize;
  }
  return pos;
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

  // --- Hover-revealed drag handle ---
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const [handlePos, setHandlePos] = useState<HandlePos | null>(null);

  // --- Drag state (refs so event handlers see fresh values without
  //     recreating the closure on every render) ---
  const draggingIndexRef = useRef<number | null>(null);
  const dropTargetRef = useRef<DropTarget | null>(null);
  const [dropLineTop, setDropLineTop] = useState<number | null>(null);

  // Track hovered block via document-level mousemove (see Commit 1c).
  useEffect(() => {
    if (!editor) return;
    const scroller = scrollerRef.current;
    const editorEl = editor.view.dom as HTMLElement;
    if (!scroller || !editorEl) return;

    const onMove = (e: MouseEvent) => {
      // Suppress hover updates while a drag is in flight — the drop
      // indicator takes over visually.
      if (draggingIndexRef.current !== null) return;
      const scrollerRect = scroller.getBoundingClientRect();
      const inBounds =
        e.clientX >= scrollerRect.left - 36 &&
        e.clientX <= scrollerRect.right &&
        e.clientY >= scrollerRect.top - 4 &&
        e.clientY <= scrollerRect.bottom + 4;
      if (!inBounds) {
        setHandlePos(null);
        return;
      }
      // Left-margin strip: keep last-known position stable.
      if (e.clientX < scrollerRect.left) return;
      const hit = document.elementFromPoint(e.clientX, e.clientY);
      if (!(hit instanceof Node) || !editorEl.contains(hit)) return;
      const block = findTopLevelBlock(hit, editorEl);
      if (!block) return;
      const blockIndex = Array.from(editorEl.children).indexOf(block);
      if (blockIndex < 0) return;
      const blockRect = block.getBoundingClientRect();
      setHandlePos({
        top: blockRect.top - scrollerRect.top + 4,
        blockIndex,
      });
    };

    document.addEventListener("mousemove", onMove);
    return () => {
      document.removeEventListener("mousemove", onMove);
    };
  }, [editor]);

  // Drag: dragover (anywhere over editor) updates drop indicator; drop
  // reorders. Listen on the scroller with capture so we see events
  // before ProseMirror's own drop handler.
  useEffect(() => {
    if (!editor) return;
    const scroller = scrollerRef.current;
    const editorEl = editor.view.dom as HTMLElement;
    if (!scroller || !editorEl) return;

    const onDragOver = (e: DragEvent) => {
      if (draggingIndexRef.current === null) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
      const hit = document.elementFromPoint(e.clientX, e.clientY);
      if (!(hit instanceof Node) || !editorEl.contains(hit)) {
        dropTargetRef.current = null;
        setDropLineTop(null);
        return;
      }
      const block = findTopLevelBlock(hit, editorEl);
      if (!block) {
        dropTargetRef.current = null;
        setDropLineTop(null);
        return;
      }
      const blockIndex = Array.from(editorEl.children).indexOf(block);
      if (blockIndex < 0) return;
      const blockRect = block.getBoundingClientRect();
      const scrollerRect = scroller.getBoundingClientRect();
      const midY = blockRect.top + blockRect.height / 2;
      const above = e.clientY < midY;
      dropTargetRef.current = { blockIndex, above };
      setDropLineTop(
        above
          ? blockRect.top - scrollerRect.top - 1
          : blockRect.bottom - scrollerRect.top - 1
      );
    };

    const onDrop = (e: DragEvent) => {
      if (draggingIndexRef.current === null) return;
      e.preventDefault();
      e.stopPropagation();
      const sourceIndex = draggingIndexRef.current;
      const target = dropTargetRef.current;
      draggingIndexRef.current = null;
      dropTargetRef.current = null;
      setDropLineTop(null);
      if (!target) return;

      const state = editor.state;
      const doc = state.doc;
      if (sourceIndex < 0 || sourceIndex >= doc.childCount) return;
      if (target.blockIndex < 0 || target.blockIndex >= doc.childCount) return;

      // Compute the intended destination block index. Dropping "above"
      // target N means inserting as the new block N; "below" means N+1.
      const destIndex = target.above ? target.blockIndex : target.blockIndex + 1;

      // No-op checks: if the source is already where we'd drop it, skip.
      if (destIndex === sourceIndex || destIndex === sourceIndex + 1) return;

      const sourceNode = doc.child(sourceIndex);
      const sourcePos = blockStartPos(editor, sourceIndex);
      const sourceEnd = sourcePos + sourceNode.nodeSize;
      let insertPos = blockStartPos(editor, destIndex);

      // Adjust insertPos for the deletion we're about to perform.
      if (insertPos > sourceEnd) {
        insertPos -= sourceNode.nodeSize;
      }

      const tr = state.tr;
      tr.delete(sourcePos, sourceEnd);
      tr.insert(insertPos, sourceNode);
      editor.view.dispatch(tr);

      // Notify WriteView (it persists on every update).
      if (onUpdate) onUpdate(editor);
    };

    // Capture phase so we intercept before ProseMirror's bubble-phase
    // handlers would try to treat this as content insertion.
    scroller.addEventListener("dragover", onDragOver, true);
    scroller.addEventListener("drop", onDrop, true);
    return () => {
      scroller.removeEventListener("dragover", onDragOver, true);
      scroller.removeEventListener("drop", onDrop, true);
    };
  }, [editor, onUpdate]);

  const onHandleDragStart = (e: React.DragEvent<HTMLButtonElement>) => {
    if (!editor || !handlePos) {
      e.preventDefault();
      return;
    }
    draggingIndexRef.current = handlePos.blockIndex;
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = "move";
      // Firefox requires any setData call to actually start a drag.
      e.dataTransfer.setData("application/x-ambo-block", String(handlePos.blockIndex));
      // Use a 1x1 transparent drag image — the browser default shows a
      // distracting preview of the whole handle button.
      try {
        const img = new Image();
        img.src =
          "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
        e.dataTransfer.setDragImage(img, 0, 0);
      } catch {
        /* setDragImage unsupported on some engines — drop silently */
      }
    }
  };

  const onHandleDragEnd = () => {
    draggingIndexRef.current = null;
    dropTargetRef.current = null;
    setDropLineTop(null);
  };

  if (!editor) return null;
  return (
    <div ref={scrollerRef} className="ambo-rich-editor-scroller">
      <EditorContent editor={editor} />
      {handlePos && (
        <button
          type="button"
          aria-label="Drag to reorder"
          className="ambo-drag-handle"
          style={{ top: handlePos.top }}
          contentEditable={false}
          draggable
          onDragStart={onHandleDragStart}
          onDragEnd={onHandleDragEnd}
          tabIndex={-1}
        >
          <GripIcon />
        </button>
      )}
      {dropLineTop !== null && (
        <div
          className="ambo-drop-indicator"
          style={{ top: dropLineTop }}
          aria-hidden
        />
      )}
    </div>
  );
}
