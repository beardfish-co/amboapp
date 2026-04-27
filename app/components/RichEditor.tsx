"use client";

// RichEditor — Tiptap wrapper for the Write surface.
//
// Drag-and-drop block reordering uses the Pointer Events API (not the
// HTML5 drag API) so it works identically on mouse (desktop) and touch
// (iPad/iPhone). The drag mechanism:
//
//   Mouse:  hover → handle appears in left margin → pointerdown on
//           handle → drag
//   Touch:  pointerdown anywhere in the 40px left-margin zone of the
//           scroller → drag begins immediately (no handle tap needed).
//           The left-margin zone acts as the implicit drag rail.
//
// A ghost div follows the pointer during drag; a blue drop-indicator
// line appears between blocks to show the insertion point.
// On drop, a single ProseMirror transaction reorders the blocks and
// the parent WriteView saves + shows the undo pill.

import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { useEffect, useRef, useState } from "react";

export type RichEditorProps = {
  initialHtml: string;
  onUpdate?: (editor: Editor) => void;
  onReady?: (editor: Editor) => void;
  onReorder?: () => void;
  onQuoteDelete?: () => void;
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

// Walk up from `node` until we find an element whose direct parent is the
// editor's contenteditable root — that is the top-level block.
function findTopLevelBlock(
  node: Node | null,
  editorEl: HTMLElement
): HTMLElement | null {
  let cur: Node | null = node;
  while (cur && cur !== editorEl) {
    if (cur instanceof HTMLElement && cur.parentElement === editorEl) return cur;
    cur = cur.parentNode;
  }
  return null;
}

// ProseMirror position of the start of the Nth top-level block.
function blockStartPos(editor: Editor, blockIndex: number): number {
  let pos = 0;
  const doc = editor.state.doc;
  for (let i = 0; i < blockIndex && i < doc.childCount; i++) {
    pos += doc.child(i).nodeSize;
  }
  return pos;
}

// Plain text of the Nth block, truncated for the ghost label.
function blockText(editor: Editor, blockIndex: number): string {
  const doc = editor.state.doc;
  if (blockIndex < 0 || blockIndex >= doc.childCount) return "";
  return doc.child(blockIndex).textContent.slice(0, 120);
}

export default function RichEditor({
  initialHtml,
  onUpdate,
  onReady,
  onReorder,
  onQuoteDelete,
  placeholder,
}: RichEditorProps) {
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({}),
      Placeholder.configure({
        placeholder: placeholder ?? "",
        showOnlyWhenEditable: true,
        showOnlyCurrent: false,
        includeChildren: false,
      }),
    ],
    content: initialHtml,
    editorProps: { attributes: { class: "ambo-rich-editor" } },
    onUpdate: ({ editor }) => { onUpdate?.(editor); },
  });

  useEffect(() => {
    if (editor && onReady) onReady(editor);
  }, [editor, onReady]);

  const scrollerRef = useRef<HTMLDivElement | null>(null);

  // Single hover handle (mouse only — touch uses the margin-zone path).
  const [handlePos, setHandlePos] = useState<HandlePos | null>(null);

  // Drop indicator line position (null = not dragging or no valid target).
  const [dropLineTop, setDropLineTop] = useState<number | null>(null);

  // Quote × button position.
  type QuoteDeletePos = { top: number; blockIndex: number };
  const [quoteDeletePos, setQuoteDeletePos] = useState<QuoteDeletePos | null>(null);

  // True while a pointer drag is in flight — suppresses mouse hover updates.
  const isDraggingRef = useRef(false);

  // ── Mouse hover → handle reveal ─────────────────────────────────────────
  useEffect(() => {
    if (!editor) return;
    const scroller = scrollerRef.current;
    const editorEl = editor.view.dom as HTMLElement;
    if (!scroller || !editorEl) return;

    const onMove = (e: MouseEvent) => {
      if (isDraggingRef.current) return;
      const sr = scroller.getBoundingClientRect();
      const inBounds =
        e.clientX >= sr.left - 36 &&
        e.clientX <= sr.right &&
        e.clientY >= sr.top - 4 &&
        e.clientY <= sr.bottom + 4;
      if (!inBounds) { setHandlePos(null); setQuoteDeletePos(null); return; }
      if (e.clientX < sr.left) return; // in left-margin strip — keep last pos
      const hit = document.elementFromPoint(e.clientX, e.clientY);
      if (!(hit instanceof Node) || !editorEl.contains(hit)) return;
      const block = findTopLevelBlock(hit, editorEl);
      if (!block) return;
      const bi = Array.from(editorEl.children).indexOf(block);
      if (bi < 0) return;
      const br = block.getBoundingClientRect();
      setHandlePos({ top: br.top - sr.top + 4, blockIndex: bi });
      if (block.tagName === "BLOCKQUOTE") {
        setQuoteDeletePos({ top: br.top - sr.top + 6, blockIndex: bi });
      } else {
        setQuoteDeletePos(null);
      }
    };

    document.addEventListener("mousemove", onMove);
    return () => document.removeEventListener("mousemove", onMove);
  }, [editor]);

  // ── Shared drag logic ────────────────────────────────────────────────────
  // Called by both the mouse handle's onPointerDown and the touch margin-zone
  // listener. `sourceIndex` is the block to drag; `startClientY` positions
  // the ghost initially.
  const startDrag = (
    sourceIndex: number,
    startClientY: number,
    editorEl: HTMLElement,
    scroller: HTMLElement,
    scrollerRect: DOMRect
  ) => {
    if (!editor) return;

    isDraggingRef.current = true;
    setHandlePos(null);
    setQuoteDeletePos(null);

    // Ghost element — follows the pointer, shows truncated block text.
    const ghost = document.createElement("div");
    ghost.className = "ambo-drag-ghost";
    ghost.textContent = blockText(editor, sourceIndex) || "…";
    ghost.style.top = `${startClientY - scrollerRect.top - 16}px`;
    scroller.appendChild(ghost);

    // Current drop target, updated on each pointermove.
    let currentTarget: DropTarget | null = null;

    const onMove = (ev: PointerEvent) => {
      ev.preventDefault();

      // Move ghost with pointer.
      ghost.style.top = `${ev.clientY - scrollerRect.top - 16}px`;

      // Hit-test underneath the ghost to find the target block.
      ghost.style.visibility = "hidden";
      const hit = document.elementFromPoint(ev.clientX, ev.clientY);
      ghost.style.visibility = "";

      if (!(hit instanceof Node) || !editorEl.contains(hit)) {
        currentTarget = null;
        setDropLineTop(null);
        return;
      }
      const block = findTopLevelBlock(hit, editorEl);
      if (!block) { currentTarget = null; setDropLineTop(null); return; }
      const bi = Array.from(editorEl.children).indexOf(block);
      if (bi < 0) { currentTarget = null; setDropLineTop(null); return; }
      const br = block.getBoundingClientRect();
      const above = ev.clientY < br.top + br.height / 2;
      currentTarget = { blockIndex: bi, above };
      setDropLineTop(
        above ? br.top - scrollerRect.top - 1 : br.bottom - scrollerRect.top - 1
      );
    };

    const onEnd = () => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onEnd);
      document.removeEventListener("pointercancel", onEnd);

      ghost.remove();
      isDraggingRef.current = false;
      setDropLineTop(null);

      if (!currentTarget || !editor) return;

      // ProseMirror transaction: remove source block, insert at dest.
      const { state } = editor;
      const { doc } = state;
      if (sourceIndex < 0 || sourceIndex >= doc.childCount) return;
      if (currentTarget.blockIndex < 0 || currentTarget.blockIndex >= doc.childCount) return;

      const destIndex = currentTarget.above
        ? currentTarget.blockIndex
        : currentTarget.blockIndex + 1;

      // No-op: dropping in same position.
      if (destIndex === sourceIndex || destIndex === sourceIndex + 1) return;

      const sourceNode = doc.child(sourceIndex);
      const sourcePos = blockStartPos(editor, sourceIndex);
      const sourceEnd = sourcePos + sourceNode.nodeSize;
      let insertPos = blockStartPos(editor, destIndex);
      // Adjust for the deletion we're about to perform.
      if (insertPos > sourceEnd) insertPos -= sourceNode.nodeSize;

      const tr = state.tr;
      tr.delete(sourcePos, sourceEnd);
      tr.insert(insertPos, sourceNode);
      editor.view.dispatch(tr);

      if (onUpdate) onUpdate(editor);
      onReorder?.();
    };

    document.addEventListener("pointermove", onMove, { passive: false });
    document.addEventListener("pointerup", onEnd);
    document.addEventListener("pointercancel", onEnd);
  };

  // ── Mouse handle pointer-down ────────────────────────────────────────────
  const onHandlePointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!editor || !handlePos) return;
    const scroller = scrollerRef.current;
    const editorEl = editor.view.dom as HTMLElement;
    if (!scroller || !editorEl) return;
    e.preventDefault();
    e.stopPropagation();
    startDrag(
      handlePos.blockIndex,
      e.clientY,
      editorEl,
      scroller,
      scroller.getBoundingClientRect()
    );
  };

  // ── Touch margin-zone drag ───────────────────────────────────────────────
  // On touch/pen devices the hover handle never appears, so we treat the
  // left 40px of the scroller as an implicit drag rail. A pointerdown there
  // begins a drag immediately without needing to see the handle first.
  useEffect(() => {
    if (!editor) return;
    const scroller = scrollerRef.current;
    const editorEl = editor.view.dom as HTMLElement;
    if (!scroller || !editorEl) return;

    const onScrollerPointerDown = (e: PointerEvent) => {
      // Mouse handled by the explicit handle button above.
      if (e.pointerType === "mouse") return;
      if (isDraggingRef.current) return;

      const sr = scroller.getBoundingClientRect();
      const localX = e.clientX - sr.left;

      // Only respond to touches in the left-margin drag zone.
      if (localX > 40) return;

      e.preventDefault();

      // Sample 60px to the right to find the block at this Y.
      const hit = document.elementFromPoint(e.clientX + 60, e.clientY);
      if (!hit || !editorEl.contains(hit as Node)) return;
      const block = findTopLevelBlock(hit as Node, editorEl);
      if (!block) return;
      const bi = Array.from(editorEl.children).indexOf(block);
      if (bi < 0) return;

      startDrag(bi, e.clientY, editorEl, scroller, sr);
    };

    scroller.addEventListener("pointerdown", onScrollerPointerDown, {
      passive: false,
    });
    return () => {
      scroller.removeEventListener("pointerdown", onScrollerPointerDown);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor]);

  if (!editor) return null;

  return (
    <div ref={scrollerRef} className="ambo-rich-editor-scroller">
      <EditorContent editor={editor} />

      {/* Mouse hover handle — hidden on touch (pointer:coarse) via CSS */}
      {handlePos && (
        <button
          type="button"
          aria-label="Drag to reorder"
          className="ambo-drag-handle"
          style={{ top: handlePos.top }}
          contentEditable={false}
          tabIndex={-1}
          onPointerDown={onHandlePointerDown}
        >
          <GripIcon />
        </button>
      )}

      {/* Drop indicator line */}
      {dropLineTop !== null && (
        <div
          className="ambo-drop-indicator"
          style={{ top: dropLineTop }}
          aria-hidden
        />
      )}

      {/* Quote × delete button */}
      {quoteDeletePos && (
        <button
          type="button"
          aria-label="Remove quote"
          className="ambo-quote-delete"
          style={{ top: quoteDeletePos.top }}
          contentEditable={false}
          tabIndex={-1}
          onClick={() => {
            if (!editor) return;
            const { state } = editor;
            const idx = quoteDeletePos.blockIndex;
            if (idx < 0 || idx >= state.doc.childCount) return;
            const pos = blockStartPos(editor, idx);
            const node = state.doc.child(idx);
            editor.view.dispatch(state.tr.delete(pos, pos + node.nodeSize));
            if (onUpdate) onUpdate(editor);
            onQuoteDelete?.();
            setQuoteDeletePos(null);
          }}
        >
          ×
        </button>
      )}
    </div>
  );
}
