"use client";

// RichEditor — Tiptap wrapper for the Write surface.
//
// Drag-and-drop block reordering uses Pointer Events (not HTML5 drag API)
// so it works on both mouse (desktop) and touch (iPad/iPhone).
//
// IMPORTANT: after pointerdown the browser implicitly captures the pointer
// to the target element, so document-level pointermove never fires unless
// we explicitly release that capture. releasePointerCapture() is called in
// both drag entry points (handle pointerdown + touch margin pointerdown).

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

function blockStartPos(editor: Editor, blockIndex: number): number {
  let pos = 0;
  const doc = editor.state.doc;
  for (let i = 0; i < blockIndex && i < doc.childCount; i++) {
    pos += doc.child(i).nodeSize;
  }
  return pos;
}

// Full text content of a block — no truncation here; CSS clamps the ghost display.
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
  const [dropLineTop, setDropLineTop] = useState<number | null>(null);
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

  // ── Core drag logic ──────────────────────────────────────────────────────
  // Shared by mouse-handle path and touch-margin path.
  // Caller must release pointer capture BEFORE calling this so that
  // document-level pointermove receives events.
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

    // Dim the source block inline (class approach has selector specificity issues).
    const blocks = Array.from(editorEl.children) as HTMLElement[];
    const sourceBlockEl = blocks[sourceIndex] as HTMLElement | undefined;
    if (sourceBlockEl) {
      sourceBlockEl.style.opacity = "0.25";
      sourceBlockEl.style.transition = "opacity 0.12s ease";
    }

    // Ghost — follows pointer, shows full block text (CSS clamps display).
    const ghost = document.createElement("div");
    ghost.className = "ambo-drag-ghost";
    ghost.textContent = blockText(editor, sourceIndex) || "…";
    ghost.style.top = `${startClientY - scrollerRect.top - 16}px`;
    scroller.appendChild(ghost);

    let currentTarget: DropTarget | null = null;

    const onMove = (ev: PointerEvent) => {
      ev.preventDefault();

      // Move ghost.
      ghost.style.top = `${ev.clientY - scrollerRect.top - 16}px`;

      // Hit-test: ghost has pointer-events:none so elementFromPoint finds
      // whatever is underneath it without needing to hide it.
      const hit = document.elementFromPoint(ev.clientX, ev.clientY);
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

      // Open a visual gap by adding margin to the target block.
      // Reset all first, then apply to the current target.
      const GAP = 48;
      Array.from(editorEl.children).forEach((el) => {
        (el as HTMLElement).style.marginTop = "";
        (el as HTMLElement).style.marginBottom = "";
      });
      if (above) {
        block.style.marginTop = `${GAP}px`;
        block.style.transition = "margin 0.12s ease";
      } else {
        block.style.marginBottom = `${GAP}px`;
        block.style.transition = "margin 0.12s ease";
      }

      // Re-measure after margin change for accurate drop line position.
      const brUpdated = block.getBoundingClientRect();
      setDropLineTop(
        above
          ? brUpdated.top - scrollerRect.top - 2
          : brUpdated.bottom - scrollerRect.top - GAP + 2
      );
    };

    const onEnd = () => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onEnd);
      document.removeEventListener("pointercancel", onEnd);

      ghost.remove();
      // Restore source block opacity.
      if (sourceBlockEl) {
        sourceBlockEl.style.opacity = "";
        sourceBlockEl.style.transition = "";
      }
      // Remove gap margin from whichever block was the drop target.
      Array.from(editorEl.children).forEach((el) => {
        (el as HTMLElement).style.marginTop = "";
        (el as HTMLElement).style.marginBottom = "";
        (el as HTMLElement).style.transition = "";
      });
      isDraggingRef.current = false;
      setDropLineTop(null);

      if (!currentTarget || !editor) return;

      const { state } = editor;
      const { doc } = state;
      if (sourceIndex < 0 || sourceIndex >= doc.childCount) return;
      if (currentTarget.blockIndex < 0 || currentTarget.blockIndex >= doc.childCount) return;

      const destIndex = currentTarget.above
        ? currentTarget.blockIndex
        : currentTarget.blockIndex + 1;
      if (destIndex === sourceIndex || destIndex === sourceIndex + 1) return;

      const sourceNode = doc.child(sourceIndex);
      const sourcePos = blockStartPos(editor, sourceIndex);
      const sourceEnd = sourcePos + sourceNode.nodeSize;
      let insertPos = blockStartPos(editor, destIndex);
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
    // Release implicit pointer capture so document receives pointermove.
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
      const localX = e.clientX - sr.left;
      if (localX > 40) return;
      e.preventDefault();
      // Release capture so document pointermove fires.
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

      {dropLineTop !== null && (
        <div
          className="ambo-drop-indicator"
          style={{ top: dropLineTop }}
          aria-hidden
        />
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
