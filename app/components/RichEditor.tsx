"use client";

// RichEditor — Tiptap wrapper for the Write surface.
//
// Block drag-reorder is implemented entirely through ProseMirror decorations.
//
// Two decorations live in a single plugin (dragPluginKey):
//   1. Decoration.node on the source block → adds class "ambo-drag-source" (dims it).
//   2. Decoration.widget at the gap position → a <div> that animates open,
//      causing the surrounding blocks to spread apart naturally.

import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import { Extension } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { useEffect, useRef, useState } from "react";

export type RichEditorProps = {
  initialHtml: string;
  onUpdate?: (editor: Editor) => void;
  onReady?: (editor: Editor) => void;
  onReorder?: () => void;
  onQuoteDelete?: () => void;
  placeholder?: string;
};

// ── ProseMirror drag plugin ──────────────────────────────────────────────────

interface DragPluginState {
  sourceIndex: number;
  gapIndex: number;
}

const dragPluginKey = new PluginKey<DragPluginState>("amboBlockDrag");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function posOfBlock(doc: any, blockIndex: number): number {
  let pos = 0;
  for (let i = 0; i < blockIndex; i++) pos += doc.child(i).nodeSize;
  return pos;
}

function makeDragPlugin() {
  return new Plugin<DragPluginState>({
    key: dragPluginKey,

    state: {
      init: () => ({ sourceIndex: -1, gapIndex: -1 }),
      apply(tr, prev) {
        const meta = tr.getMeta(dragPluginKey) as Partial<DragPluginState> | undefined;
        if (meta != null) {
          return {
            sourceIndex: meta.sourceIndex ?? prev.sourceIndex,
            gapIndex:    meta.gapIndex    ?? prev.gapIndex,
          };
        }
        return prev;
      },
    },

    props: {
      decorations(state) {
        const pluginState = dragPluginKey.getState(state);
        if (!pluginState || pluginState.sourceIndex < 0) return DecorationSet.empty;

        const { sourceIndex, gapIndex } = pluginState;
        const { doc } = state;
        const decos: Decoration[] = [];

        // 1. Node decoration — dims the block being dragged.
        if (sourceIndex < doc.childCount) {
          const from = posOfBlock(doc, sourceIndex);
          const to   = from + doc.child(sourceIndex).nodeSize;
          decos.push(Decoration.node(from, to, { class: "ambo-drag-source" }));
        }

        // 2. Widget decoration — animated gap at the insertion point.
        if (gapIndex >= 0) {
          const insertPos = posOfBlock(doc, Math.min(gapIndex, doc.childCount));
          decos.push(
            Decoration.widget(
              insertPos,
              () => {
                const el = document.createElement("div");
                el.className = "ambo-drag-gap";
                requestAnimationFrame(() => {
                  void el.offsetHeight;
                  el.classList.add("ambo-drag-gap--open");
                });
                return el;
              },
              // Fresh key per position so PM creates a new element each time
              // the gap moves, giving a new expand animation.
              { side: -1, key: `drag-gap-${gapIndex}` }
            )
          );
        }

        return DecorationSet.create(doc, decos);
      },
    },
  });
}

const DragReorderExtension = Extension.create({
  name: "dragReorder",
  addProseMirrorPlugins() {
    return [makeDragPlugin()];
  },
});

// ── Shared helpers ───────────────────────────────────────────────────────────

function GripIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="9"  cy="5"  r="1.5" fill="currentColor" />
      <circle cx="15" cy="5"  r="1.5" fill="currentColor" />
      <circle cx="9"  cy="12" r="1.5" fill="currentColor" />
      <circle cx="15" cy="12" r="1.5" fill="currentColor" />
      <circle cx="9"  cy="19" r="1.5" fill="currentColor" />
      <circle cx="15" cy="19" r="1.5" fill="currentColor" />
    </svg>
  );
}

type HandlePos      = { top: number; blockIndex: number };
type QuoteDeletePos = { top: number; blockIndex: number };

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

// ── Component ────────────────────────────────────────────────────────────────

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
      DragReorderExtension,
    ],
    content: initialHtml,
    editorProps: { attributes: { class: "ambo-rich-editor" } },
    onUpdate: ({ editor }) => { onUpdate?.(editor); },
  });

  useEffect(() => {
    if (editor && onReady) onReady(editor);
  }, [editor, onReady]);

  const scrollerRef  = useRef<HTMLDivElement | null>(null);
  const [handlePos,      setHandlePos]      = useState<HandlePos | null>(null);
  const [quoteDeletePos, setQuoteDeletePos] = useState<QuoteDeletePos | null>(null);
  const isDraggingRef = useRef(false);

  // ── Mouse hover → handle reveal ───────────────────────────────────────────
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
        e.clientY >= sr.top  - 4  && e.clientY <= sr.bottom + 4;
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

  // ── Core drag logic ───────────────────────────────────────────────────────
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

    const blockEls   = Array.from(editorEl.children) as HTMLElement[];
    const blockRects = blockEls.map(el => el.getBoundingClientRect());

    editor.view.dispatch(
      editor.view.state.tr.setMeta(dragPluginKey, { sourceIndex, gapIndex: -1 })
    );

    const ghost = document.createElement("div");
    ghost.className = "ambo-drag-ghost";
    ghost.textContent = blockText(editor, sourceIndex) || "…";
    ghost.style.top = `${startClientY - scrollerRect.top - 16}px`;
    scroller.appendChild(ghost);

    const gapState = { current: -1 };
    let rafId: number | null = null;

    const getGapIndex = (clientY: number): number => {
      for (let i = 0; i < blockRects.length; i++) {
        if (clientY < blockRects[i].top + blockRects[i].height / 2) return i;
      }
      return blockRects.length;
    };

    const onMove = (ev: PointerEvent) => {
      ev.preventDefault();
      ghost.style.top = `${ev.clientY - scrollerRect.top - 16}px`;

      const gap = getGapIndex(ev.clientY);
      const validGap = (gap === sourceIndex || gap === sourceIndex + 1) ? -1 : gap;

      if (validGap === gapState.current) return;
      gapState.current = validGap;

      if (rafId !== null) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        rafId = null;
        if (!editor) return;
        editor.view.dispatch(
          editor.view.state.tr.setMeta(dragPluginKey, { sourceIndex, gapIndex: validGap })
        );
      });
    };

    const onEnd = () => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup",   onEnd);
      document.removeEventListener("pointercancel", onEnd);
      if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }

      const finalGap = gapState.current;
      ghost.remove();
      isDraggingRef.current = false;

      if (editor) {
        editor.view.dispatch(
          editor.view.state.tr.setMeta(dragPluginKey, { sourceIndex: -1, gapIndex: -1 })
        );
      }

      if (finalGap < 0 || !editor) return;
      if (finalGap === sourceIndex || finalGap === sourceIndex + 1) return;

      const { state } = editor;
      const { doc }   = state;
      if (sourceIndex < 0 || sourceIndex >= doc.childCount) return;
      if (finalGap > doc.childCount) return;

      const sourceNode = doc.child(sourceIndex);
      const sourcePos  = blockStartPos(editor, sourceIndex);
      const sourceEnd  = sourcePos + sourceNode.nodeSize;
      let insertPos    = blockStartPos(editor, finalGap);
      if (insertPos > sourceEnd) insertPos -= sourceNode.nodeSize;

      const tr = state.tr;
      tr.delete(sourcePos, sourceEnd);
      tr.insert(insertPos, sourceNode);
      editor.view.dispatch(tr);

      if (onUpdate) onUpdate(editor);
      onReorder?.();
    };

    document.addEventListener("pointermove", onMove, { passive: false });
    document.addEventListener("pointerup",   onEnd);
    document.addEventListener("pointercancel", onEnd);
  };

  // ── Mouse handle pointer-down ─────────────────────────────────────────────
  const onHandlePointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!editor || !handlePos) return;
    const scroller = scrollerRef.current;
    const editorEl = editor.view.dom as HTMLElement;
    if (!scroller || !editorEl) return;
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.releasePointerCapture(e.pointerId);
    startDrag(handlePos.blockIndex, e.clientY, editorEl, scroller, scroller.getBoundingClientRect());
  };

  // ── Touch left-margin drag rail ───────────────────────────────────────────
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
            const pos  = blockStartPos(editor, idx);
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
