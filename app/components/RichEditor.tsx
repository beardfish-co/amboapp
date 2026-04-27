"use client";

// RichEditor — Tiptap wrapper for the Write surface.
//
// Block drag-reorder uses pointer events (works on both mouse and touch/iPad):
//
//   Mouse entry: hover → grip handle → pointerdown on handle.
//   Touch entry: pointerdown anywhere in the left 40px margin zone.
//
// During drag:
//   - A ghost card follows the cursor showing the grabbed block's text.
//   - A source-overlay div dims the grabbed block in place.
//   - A drop-indicator line (React state) appears between blocks at the
//     current insertion point. No mirror, no editor hiding — just a
//     React-rendered absolute div that's trivially reliable.
//
// On release: ProseMirror transaction reorders the actual document.

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
type QuoteDeletePos = { top: number; blockIndex: number };
type SourceOverlay = { top: number; height: number };

function findTopLevelBlock(node: Node | null, editorEl: HTMLElement): HTMLElement | null {
  let cur: Node | null = node;
  while (cur && cur !== editorEl) {
    if (cur instanceof HTMLElement && cur.parentElement === editorEl) return cur;
    cur = cur.parentNode;
  }
  return null;
}

function blockStartPos(editor: Editor, blockIndex: number): number {
  let pos = 0;
  const doc = editor.state.doc;
  for (let i = 0; i < blockIndex && i < doc.childCount; i++) {
    pos += doc.child(i).nodeSize;
  }
  return pos;
}

function blockText(editor: Editor, blockIndex: number): string {
  const doc = editor.state.doc;
  if (blockIndex < 0 || blockIndex >= doc.childCount) return "";
  return doc.child(blockIndex).textContent;
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
  const [handlePos, setHandlePos] = useState<HandlePos | null>(null);
  const [quoteDeletePos, setQuoteDeletePos] = useState<QuoteDeletePos | null>(null);
  const isDraggingRef = useRef(false);

  // Drag visual state — React-driven so they're always in sync with layout.
  const [dropLineTop, setDropLineTop] = useState<number | null>(null);
  const [sourceOverlay, setSourceOverlay] = useState<SourceOverlay | null>(null);

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
        e.clientX >= sr.left - 36 && e.clientX <= sr.right &&
        e.clientY >= sr.top - 4 && e.clientY <= sr.bottom + 4;
      if (!inBounds) { setHandlePos(null); setQuoteDeletePos(null); return; }
      if (e.clientX < sr.left) return;
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

  // ── Core drag logic ──────────────────────────────────────────────────────
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

    // Snapshot block rects before any DOM changes (viewport coordinates,
    // matching ev.clientY throughout the drag).
    const blockEls = Array.from(editorEl.children) as HTMLElement[];
    const blockRects = blockEls.map(el => el.getBoundingClientRect());

    // Dim the source block via a React-state overlay div (no Tiptap DOM touch).
    setSourceOverlay({
      top: blockRects[sourceIndex].top - scrollerRect.top,
      height: blockRects[sourceIndex].height,
    });

    // Ghost card follows the pointer (imperative div for zero-lag response).
    const ghost = document.createElement("div");
    ghost.className = "ambo-drag-ghost";
    ghost.textContent = blockText(editor, sourceIndex) || "…";
    ghost.style.top = `${startClientY - scrollerRect.top - 16}px`;
    scroller.appendChild(ghost);

    // Use a plain object (not a React ref) so onMove and onEnd share
    // the same mutable slot without any closure staleness.
    const gapState = { current: -1 };

    // Which gap does this clientY land in?
    // Gap 0 = before block 0, gap N = after block N-1.
    const getGapIndex = (clientY: number): number => {
      for (let i = 0; i < blockRects.length; i++) {
        if (clientY < blockRects[i].top + blockRects[i].height / 2) return i;
      }
      return blockRects.length;
    };

    // Converts a gap index to a scroller-relative Y position for the
    // drop indicator line.
    const gapToLineTop = (gapIndex: number): number => {
      if (gapIndex === 0) return blockRects[0].top - scrollerRect.top - 1;
      if (gapIndex >= blockRects.length)
        return blockRects[blockRects.length - 1].bottom - scrollerRect.top - 1;
      // Midpoint of the space between the two neighbouring blocks.
      const above = blockRects[gapIndex - 1].bottom;
      const below = blockRects[gapIndex].top;
      return (above + below) / 2 - scrollerRect.top;
    };

    const onMove = (ev: PointerEvent) => {
      ev.preventDefault();
      ghost.style.top = `${ev.clientY - scrollerRect.top - 16}px`;

      const gap = getGapIndex(ev.clientY);
      gapState.current = gap;

      // Suppress indicator when dropping in the current position is a no-op.
      if (gap === sourceIndex || gap === sourceIndex + 1) {
        setDropLineTop(null);
      } else {
        setDropLineTop(gapToLineTop(gap));
      }
    };

    const onEnd = () => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onEnd);
      document.removeEventListener("pointercancel", onEnd);

      const finalGap = gapState.current;

      ghost.remove();
      setDropLineTop(null);
      setSourceOverlay(null);
      isDraggingRef.current = false;

      // No-op guards.
      if (!editor) return;
      if (finalGap < 0) return;
      if (finalGap === sourceIndex || finalGap === sourceIndex + 1) return;

      const { state } = editor;
      const { doc } = state;
      if (sourceIndex < 0 || sourceIndex >= doc.childCount) return;
      if (finalGap > doc.childCount) return;

      const sourceNode = doc.child(sourceIndex);
      const sourcePos = blockStartPos(editor, sourceIndex);
      const sourceEnd = sourcePos + sourceNode.nodeSize;
      let insertPos = blockStartPos(editor, finalGap);
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
    e.currentTarget.releasePointerCapture(e.pointerId);
    startDrag(
      handlePos.blockIndex,
      e.clientY,
      editorEl,
      scroller,
      scroller.getBoundingClientRect()
    );
  };

  // ── Touch left-margin drag rail ──────────────────────────────────────────
  useEffect(() => {
    if (!editor) return;
    const scroller = scrollerRef.current;
    const editorEl = editor.view.dom as HTMLElement;
    if (!scroller || !editorEl) return;

    const onScrollerPointerDown = (e: PointerEvent) => {
      if (e.pointerType === "mouse") return;
      if (isDraggingRef.current) return;
      const sr = scroller.getBoundingClientRect();
      if (e.clientX - sr.left > 40) return;
      e.preventDefault();
      scroller.releasePointerCapture(e.pointerId);
      const hit = document.elementFromPoint(e.clientX + 60, e.clientY);
      if (!hit || !editorEl.contains(hit as Node)) return;
      const block = findTopLevelBlock(hit as Node, editorEl);
      if (!block) return;
      const bi = Array.from(editorEl.children).indexOf(block);
      if (bi < 0) return;
      startDrag(bi, e.clientY, editorEl, scroller, sr);
    };

    scroller.addEventListener("pointerdown", onScrollerPointerDown, { passive: false });
    return () => scroller.removeEventListener("pointerdown", onScrollerPointerDown);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor]);

  if (!editor) return null;

  return (
    <div ref={scrollerRef} className="ambo-rich-editor-scroller">
      <EditorContent editor={editor} />

      {/* Dims the block being dragged without touching Tiptap's DOM */}
      {sourceOverlay && (
        <div
          className="ambo-drag-source-overlay"
          style={{ top: sourceOverlay.top, height: sourceOverlay.height }}
          aria-hidden
        />
      )}

      {/* Insertion point indicator */}
      {dropLineTop !== null && (
        <div
          className="ambo-drop-indicator"
          style={{ top: dropLineTop }}
          aria-hidden
        />
      )}

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
