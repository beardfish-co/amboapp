"use client";

// RichEditor — Tiptap wrapper for the Write surface.
//
// Block drag-reorder uses a "mirror" technique to get animated gap feedback:
//
//   1. On drag start — snapshot all top-level blocks, hide the Tiptap editor,
//      render plain cloned divs (the mirror) in its place.
//   2. During drag — animate margin on mirror blocks to open / close the gap
//      at the current insertion point. Tiptap can't revert margins on divs it
//      doesn't own, so the animation is stable.
//   3. On drop — remove mirror, restore editor, dispatch a ProseMirror
//      transaction to reorder the actual document.
//
// Mouse entry: hover → grip handle → pointerdown on handle.
// Touch entry: pointerdown anywhere in the left 40px margin zone.

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

// Gap size (px) that opens between blocks during drag.
const GAP_PX = 56;

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
  type QuoteDeletePos = { top: number; blockIndex: number };
  const [quoteDeletePos, setQuoteDeletePos] = useState<QuoteDeletePos | null>(null);
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

  // ── Mirror drag ──────────────────────────────────────────────────────────
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

    const blockEls = Array.from(editorEl.children) as HTMLElement[];

    // Build mirror: cloned divs we can freely animate.
    const editorRect = editorEl.getBoundingClientRect();
    const mirror = document.createElement("div");
    mirror.className = "ambo-drag-mirror";
    mirror.style.position = "absolute";
    mirror.style.top = `${editorRect.top - scrollerRect.top}px`;
    mirror.style.left = `${editorRect.left - scrollerRect.left}px`;
    mirror.style.width = `${editorRect.width}px`;
    mirror.style.pointerEvents = "none";

    // Inner wrapper gets the same class as the real editor so that all
    // CSS rules (paragraph spacing, font size, blockquote styling, etc.)
    // apply identically to the mirror — without it the text shrinks and
    // block gaps disappear because the selectors don't match.
    const mirrorInner = document.createElement("div");
    mirrorInner.className = "ambo-rich-editor";
    mirrorInner.style.outline = "none";
    mirrorInner.style.pointerEvents = "none";

    blockEls.forEach((el, i) => {
      const clone = el.cloneNode(true) as HTMLElement;
      clone.style.transition = `margin 150ms ease, opacity 120ms ease`;
      clone.style.opacity = i === sourceIndex ? "0.28" : "1";
      mirrorInner.appendChild(clone);
    });

    mirror.appendChild(mirrorInner);

    // Hide Tiptap editor (preserves layout), show mirror.
    editorEl.style.visibility = "hidden";
    scroller.appendChild(mirror);

    // Ghost follows pointer.
    const ghost = document.createElement("div");
    ghost.className = "ambo-drag-ghost";
    ghost.textContent = blockText(editor, sourceIndex) || "…";
    ghost.style.top = `${startClientY - scrollerRect.top - 16}px`;
    scroller.appendChild(ghost);

    let currentGapIndex = -1;

    // Which gap index (0 = before first block, N = after Nth block) is the
    // pointer closest to, based on block midpoints in the mirror.
    const getGapIndex = (clientY: number): number => {
      const children = Array.from(mirror.children) as HTMLElement[];
      for (let i = 0; i < children.length; i++) {
        const rect = children[i].getBoundingClientRect();
        if (clientY < rect.top + rect.height / 2) return i;
      }
      return children.length;
    };

    const openGap = (gapIndex: number) => {
      if (gapIndex === currentGapIndex) return;
      currentGapIndex = gapIndex;
      const children = Array.from(mirror.children) as HTMLElement[];
      // Reset all margins.
      children.forEach((el) => {
        el.style.marginTop = "";
        el.style.marginBottom = "";
      });
      if (gapIndex < 0) return;
      // Open gap: add bottom margin to block above insertion, or top margin
      // to the first block if inserting at position 0.
      if (gapIndex === 0) {
        if (children[0]) children[0].style.marginTop = `${GAP_PX}px`;
      } else {
        if (children[gapIndex - 1]) children[gapIndex - 1].style.marginBottom = `${GAP_PX}px`;
      }
    };

    const onMove = (ev: PointerEvent) => {
      ev.preventDefault();
      ghost.style.top = `${ev.clientY - scrollerRect.top - 16}px`;

      // Only open a gap if cursor is inside the editor's bounding area.
      const er = editorEl.getBoundingClientRect();
      if (ev.clientY < er.top || ev.clientY > er.bottom + GAP_PX) {
        openGap(-1);
        return;
      }

      const gap = getGapIndex(ev.clientY);
      // Don't open a gap where the source block already sits.
      if (gap === sourceIndex || gap === sourceIndex + 1) {
        openGap(-1);
      } else {
        openGap(gap);
      }
    };

    const onEnd = () => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onEnd);
      document.removeEventListener("pointercancel", onEnd);

      const finalGap = currentGapIndex;

      // Restore editor, remove mirror and ghost.
      editorEl.style.visibility = "";
      mirror.remove();
      ghost.remove();
      isDraggingRef.current = false;

      if (finalGap < 0 || !editor) return;

      // No-op if drop is at current position.
      if (finalGap === sourceIndex || finalGap === sourceIndex + 1) return;

      // ProseMirror transaction to reorder.
      const { state } = editor;
      const { doc } = state;
      if (sourceIndex < 0 || sourceIndex >= doc.childCount) return;
      if (finalGap < 0 || finalGap > doc.childCount) return;

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
