"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { getComingSunday } from "./ReadingView";
import { createClient } from "@/lib/supabase/client";
import ReadingsDrawer from "./ReadingsDrawer";
import { SlideReveal } from "@/lib/ui/slide-reveal";
import { PillButton } from "@/lib/ui/pill-button";
import { StackIcon as StackIconShared, BookIcon as BookIconShared, NoteIcon, ExamineIcon } from "@/lib/ui/icons";
import { loadDayName } from "@/lib/readings";
import type { Editor } from "@tiptap/react";
import RichEditor from "./RichEditor";
import {
  paragraphsToHtml,
  paragraphsFromDoc,
  type Paragraph,
} from "@/lib/paragraph-tiptap";

const STORAGE_KEY = "ambo-draft";

// Shared Sunday-name cache
const sundayNameCache: Map<string, string> = (globalThis as typeof globalThis & {
  __amboSundayNameCache?: Map<string, string>;
}).__amboSundayNameCache ??= new Map<string, string>();

interface WriteViewProps {
  readingsSource?: import("@/lib/jurisdiction").ReadingsSource;
  currentId: string | null;
  onCurrentIdChange: (id: string) => void;
  onSaved?: () => void;
  onLoaded?: (info: { id: string | null; title: string }) => void;
  onOpenList: () => void;
  onGoReflect?: () => void;
  discernmentVersion?: number;
  onFlushRef?: React.MutableRefObject<(() => Promise<void>) | null>;
  onLiveContent?: (data: { title: string; content: string }) => void;
  isDormant?: boolean;
  onReengage?: () => void;
}

function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseIsoDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function shortSundayLabel(iso: string): string {
  const d = parseIsoDate(iso);
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

async function fetchSundayName(iso: string, homilyId?: string | null): Promise<string | null> {
  if (sundayNameCache.has(iso)) return sundayNameCache.get(iso) ?? null;
  const name = await loadDayName(iso, homilyId);
  if (name) sundayNameCache.set(iso, name);
  return name;
}

// Universalis publishes readings exactly 9 days ahead. Offering Sundays
// beyond that window is friction — the picker promises a date we can't honor.
// Count how many future Sundays fall inside the 9-day window (always at
// least next Sunday) and stop there. Mid-week the second future Sunday
// quietly appears once it enters the window.
const UNIVERSALIS_LOOKAHEAD_DAYS = 9;

function listSundayOptions(anchor: Date = new Date(), pastCount = 2): Date[] {
  const coming = getComingSunday(anchor);
  const today = new Date(anchor);
  today.setHours(0, 0, 0, 0);
  const daysUntilComing = Math.round(
    (coming.getTime() - today.getTime()) / 86_400_000,
  );
  let futureCount = 1; // always offer next Sunday
  for (let n = 1; daysUntilComing + n * 7 <= UNIVERSALIS_LOOKAHEAD_DAYS; n++) {
    futureCount++;
  }
  const out: Date[] = [];
  for (let i = -pastCount; i < futureCount; i++) {
    const d = new Date(coming);
    d.setDate(d.getDate() + i * 7);
    out.push(d);
  }
  return out;
}

function generateId() {
  return Math.random().toString(36).slice(2, 9);
}

// Parse the stored content string into Paragraphs, recognising quote blocks.
// Empty blocks are preserved — they read as "breath" in Preach.
function parseParagraphs(text: string): Paragraph[] {
  return text
    .split("\n\n")
    .map((block) => block.replace(/[ \t]+$|^[ \t]+/g, ""))
    .map((block) => {
      if (block === "") return { id: generateId(), text: "" };
      const lines = block.split("\n");
      const hasQuoteMarker = lines.some((l) => l.startsWith("> "));
      if (hasQuoteMarker) {
        let citation: string | undefined;
        if (lines.length > 0 && /^—\s+/.test(lines[lines.length - 1])) {
          citation = lines[lines.length - 1].replace(/^—\s+/, "").trim();
          lines.pop();
        }
        const quoteText = lines
          .map((l) => l.replace(/^>\s?/, ""))
          .join("\n")
          .trim();
        return { id: generateId(), text: quoteText, kind: "quote" as const, citation };
      }
      return { id: generateId(), text: block };
    });
}

function joinParagraphs(paragraphs: Paragraph[]): string {
  return paragraphs
    .map((p) => {
      if (p.kind === "quote") {
        const lines = (p.text ?? "").split("\n").map((l) => "> " + l).join("\n");
        const citationLine = p.citation ? "— " + p.citation : "";
        return citationLine ? lines + "\n" + citationLine : lines;
      }
      return p.text;
    })
    .join("\n\n");
}

export default function WriteView({
  currentId,
  onCurrentIdChange,
  onSaved,
  onLoaded,
  onOpenList,
  discernmentVersion,
  onFlushRef,
  onLiveContent,
  isDormant = false,
  onReengage,
  readingsSource = "universalis",
}: WriteViewProps) {
  // Seed title from localStorage immediately so the input is never blank
  // while the async DB fetch runs. The load effect confirms/updates the value.
  const [title, setTitle] = useState<string>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) return (JSON.parse(stored) as { title?: string }).title ?? "";
    } catch { /* ignore */ }
    return "";
  });
  const [sundayDate, setSundayDate] = useState<string | null>(null);
  const [sundayName, setSundayName] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [readingsOpen, setReadingsOpen] = useState(false);
  const [notes, setNotes] = useState("");
  // Seed — primary line only (unfolding lives in Reflect). Read-only here.
  const [seed, setSeed] = useState("");
  const [tourSeed, setTourSeed] = useState<string | null>(null); // shown during onboarding tour only
  // Sub-questions from Discernment — read-only in Write
  const [seedWhyNow, setSeedWhyNow] = useState("");
  const [seedEucharist, setSeedEucharist] = useState("");
  const [seedResponse, setSeedResponse] = useState("");

  // Tour support: open/close readings drawer during step 10
  useEffect(() => {
    const open  = () => setReadingsOpen(true);
    const close = () => setReadingsOpen(false);
    window.addEventListener("ambo:tour-open-readings",  open);
    window.addEventListener("ambo:tour-close-readings", close);
    return () => {
      window.removeEventListener("ambo:tour-open-readings",  open);
      window.removeEventListener("ambo:tour-close-readings", close);
    };
  }, []);

  // Tour support: show dummy discernment content while onboarding
  useEffect(() => {
    const TOUR_SEED = "To speak of mercy not as concept, but as encounter.";
    const show = () => setTourSeed(TOUR_SEED);
    const hide = () => setTourSeed(null);
    window.addEventListener("ambo:tour-show-discernment", show);
    window.addEventListener("ambo:tour-hide-discernment", hide);
    return () => {
      window.removeEventListener("ambo:tour-show-discernment", show);
      window.removeEventListener("ambo:tour-hide-discernment", hide);
    };
  }, []);
  const [furtherListeningOpen, setFurtherListeningOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  // Preflight "examine" — a gentle last look before preaching
  const [examineOpen, setExamineOpen] = useState(false);
  const notesSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [paragraphs, setParagraphs] = useState<Paragraph[]>([
    { id: generateId(), text: "" },
  ]);
  const [wordCount, setWordCount] = useState(0);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  // Seed HTML for the Tiptap editor. Refreshed on load; the editor owns its
  // content after that. We re-key <RichEditor> on editorMountKey so the
  // editor remounts with fresh content when switching homilies. editorMountKey
  // is updated in the same React batch as setInitialHtml so the editor always
  // receives the correct content on mount (avoids a race where key={currentId}
  // caused an early remount before the fetch completed).
  const [initialHtml, setInitialHtml] = useState<string>("<p></p>");
  // Initialise to "" so the first setEditorMountKey(data.id) is always a
  // different value, guaranteeing the editor remounts with the correct content.
  const [editorMountKey, setEditorMountKey] = useState<string>("");
  const editorRef = useRef<Editor | null>(null);
  // editorInstance mirrors editorRef into state so effects re-run when the
  // editor mounts. Set in onReady alongside the ref. Used by the citation
  // helper to track whether the cursor is inside a quote.
  const [editorInstance, setEditorInstance] = useState<Editor | null>(null);
  // Citation helper state — drives the ribbon's citation button.
  // 'none' → cursor not in a quote, button hidden.
  // 'add'  → in quote, no citation yet → clicking inserts "— " on a new line.
  // 'edit' → in quote, last paragraph already starts with "— " → clicking
  //          puts the cursor at the end of that line.
  const [citationMode, setCitationMode] = useState<"none" | "add" | "edit">("none");
  // Undo pill — transient affordance after reading insert or drag-reorder.
  const [undoPillVisible, setUndoPillVisible] = useState(false);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Autosave coordination
  const autoSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSaveRef = useRef<{
    id: string | null;
    title: string;
    content: string;
    sundayDate: string | null;
  } | null>(null);
  const draftIdRef = useRef<string | null>(null);
  const loadedIdRef = useRef<string | null | undefined>(undefined);

  const flushPendingSave = useCallback(async () => {
    if (autoSaveRef.current) {
      clearTimeout(autoSaveRef.current);
      autoSaveRef.current = null;
    }
    const pending = pendingSaveRef.current;
    pendingSaveRef.current = null;
    if (!pending) return;
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      if (pending.id) {
        await supabase
          .from("homilies")
          .update({
            title: pending.title,
            content: pending.content,
            sunday_date: pending.sundayDate,
            updated_at: new Date().toISOString(),
          })
          .eq("id", pending.id)
          .eq("user_id", user.id);
      } else {
        const { data } = await supabase
          .from("homilies")
          .insert({
            user_id: user.id,
            title: pending.title,
            content: pending.content,
            sunday_date: pending.sundayDate,
          })
          .select("id")
          .single();
        if (data?.id) {
          draftIdRef.current = data.id;
          onCurrentIdChange(data.id);
        }
      }
    } catch {
      // Restore so the online event can retry when connectivity returns
      pendingSaveRef.current = pendingSaveRef.current ?? pending;
    }
  }, [onCurrentIdChange]);

  useEffect(() => {
    if (loadedIdRef.current === currentId) return;

    // Eagerly clear title (and reset the editor key) when switching to a
    // blank new draft so the old title never lingers during flushPendingSave.
    if (currentId === null) {
      setTitle("");
      setEditorMountKey("new-" + Date.now());
    }

    let cancelled = false;

    (async () => {
      if (loadedIdRef.current !== undefined) {
        await flushPendingSave();
      }

      if (currentId === null) {
        if (cancelled) return;
        const defaultSunday = toIsoDate(getComingSunday(new Date()));
        setTitle("");
        const emptyDraft: Paragraph[] = [{ id: generateId(), text: "" }];
        setParagraphs(emptyDraft);
        setInitialHtml(paragraphsToHtml(emptyDraft));
        setEditorMountKey("new-" + Date.now());
        setLastSaved(null);
        setSundayDate(defaultSunday);
        setNotes("");
        setSeed("");
        setSeedWhyNow("");
        setSeedEucharist("");
        setSeedResponse("");
        draftIdRef.current = null;
        loadedIdRef.current = null;
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify({ title: "", content: "" }));
        } catch { /* ignore */ }
        onLoaded?.({ id: null, title: "" });
        return;
      }

      let loaded = false;
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();

        if (user) {
          const { data } = await supabase
            .from("homilies")
            .select("id, title, content, sunday_date, notes, seed, seed_why_now, seed_eucharist, seed_response")
            .eq("id", currentId)
            .eq("user_id", user.id)
            .single();

          if (data) {
            if (cancelled) return;
            draftIdRef.current = data.id;
            const nextTitle = data.title ?? "";
            setTitle(nextTitle);
            setSundayDate((data.sunday_date as string | null) ?? null);
            setNotes((data.notes as string | null) ?? "");
            setSeed((data.seed as string | null) ?? "");
            setSeedWhyNow((data.seed_why_now as string | null) ?? "");
            setSeedEucharist((data.seed_eucharist as string | null) ?? "");
            setSeedResponse((data.seed_response as string | null) ?? "");
            const parsed = data.content ? parseParagraphs(data.content) : [];
            const seeded = parsed.length ? parsed : [{ id: generateId(), text: "" }];
            setParagraphs(seeded);
            setInitialHtml(paragraphsToHtml(seeded));
            setEditorMountKey(data.id);
            try {
              localStorage.setItem(
                STORAGE_KEY,
                JSON.stringify({ title: nextTitle, content: data.content ?? "" })
              );
            } catch { /* ignore */ }
            onLoaded?.({ id: data.id, title: nextTitle });
            loaded = true;
          }
        }
      } catch { /* fall through */ }

      if (!loaded && !cancelled) {
        draftIdRef.current = currentId;
        setTitle("");
        setSundayDate(null);
        const emptyDraft: Paragraph[] = [{ id: generateId(), text: "" }];
        setParagraphs(emptyDraft);
        setInitialHtml(paragraphsToHtml(emptyDraft));
        setEditorMountKey((currentId ?? "new") + "-fallback");
        setLastSaved(null);
        setNotes("");
        setSeed("");
        setSeedWhyNow("");
        setSeedEucharist("");
        setSeedResponse("");
        onLoaded?.({ id: currentId, title: "" });
      }

      if (!cancelled) loadedIdRef.current = currentId;
    })();

    return () => { cancelled = true; };
  }, [currentId, flushPendingSave, onLoaded]);

  // Lightweight re-fetch of discernment fields whenever the priest returns to
  // Write from Reflect. discernmentVersion is bumped by page.tsx on that
  // navigation. Skips if there is no currentId or it fires on first mount
  // (version === 0, covered by the main load effect above).
  useEffect(() => {
    if (!currentId || !discernmentVersion) return;
    let cancelled = false;
    (async () => {
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user || cancelled) return;
        const { data } = await supabase
          .from("homilies")
          .select("notes, seed, seed_why_now, seed_eucharist, seed_response")
          .eq("id", currentId)
          .eq("user_id", user.id)
          .single();
        if (data && !cancelled) {
          setNotes((data.notes as string | null) ?? "");
          setSeed((data.seed as string | null) ?? "");
          setSeedWhyNow((data.seed_why_now as string | null) ?? "");
          setSeedEucharist((data.seed_eucharist as string | null) ?? "");
          setSeedResponse((data.seed_response as string | null) ?? "");
        }
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, [discernmentVersion, currentId]);

  useEffect(() => {
    if (!sundayDate) {
      setSundayName(null);
      return;
    }
    let cancelled = false;
    const cached = sundayNameCache.get(sundayDate);
    if (cached) {
      setSundayName(cached);
    } else {
      setSundayName(null);
      fetchSundayName(sundayDate, draftIdRef.current).then((n) => { if (!cancelled) setSundayName(n); });
    }
    return () => { cancelled = true; };
  }, [sundayDate]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flushPendingSave();
    };
    // Flush pending save when connectivity returns — catches offline edits
    const onOnline = () => flushPendingSave();
    window.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("beforeunload", onVisibility);
    window.addEventListener("online", onOnline);
    return () => {
      window.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("beforeunload", onVisibility);
      window.removeEventListener("online", onOnline);
    };
  }, [flushPendingSave]);

  useEffect(() => {
    if (!pickerOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setPickerOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pickerOpen]);

  useEffect(() => {
    const allText = paragraphs.map((p) => p.text).join(" ");
    const words = allText.trim().split(/\s+/).filter(Boolean).length;
    setWordCount(words);
  }, [paragraphs]);

  const save = useCallback(
    (t: string, paras: Paragraph[], sd: string | null) => {
      const content = joinParagraphs(paras);

      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ title: t, content }));
      } catch { /* ignore */ }

      // Notify PreachView of latest content immediately (no Supabase round-trip needed)
      onLiveContent?.({ title: t, content });

      pendingSaveRef.current = { id: draftIdRef.current, title: t, content, sundayDate: sd };

      if (autoSaveRef.current) clearTimeout(autoSaveRef.current);
      autoSaveRef.current = setTimeout(async () => {
        autoSaveRef.current = null;
        const pending = pendingSaveRef.current;
        pendingSaveRef.current = null;
        if (!pending) return;
        try {
          const supabase = createClient();
          const { data: { user } } = await supabase.auth.getUser();
          if (!user) return;

          if (pending.id) {
            await supabase
              .from("homilies")
              .update({
                title: pending.title,
                content: pending.content,
                sunday_date: pending.sundayDate,
                updated_at: new Date().toISOString(),
              })
              .eq("id", pending.id)
              .eq("user_id", user.id);
          } else {
            const { data } = await supabase
              .from("homilies")
              .insert({
                user_id: user.id,
                title: pending.title,
                content: pending.content,
                sunday_date: pending.sundayDate,
              })
              .select("id")
              .single();
            if (data?.id) {
              draftIdRef.current = data.id;
              onCurrentIdChange(data.id);
            }
          }
          setLastSaved(new Date());
          onSaved?.();
        } catch {
          // Restore so the online event can retry when connectivity returns
          pendingSaveRef.current = pendingSaveRef.current ?? pending;
        }
      }, 1200);
    },
    [onCurrentIdChange, onSaved]
  );

  // Expose flushPendingSave to parent so switching to Preach flushes pending writes first
  useEffect(() => {
    if (onFlushRef) onFlushRef.current = flushPendingSave;
    return () => { if (onFlushRef) onFlushRef.current = null; };
  }, [flushPendingSave, onFlushRef]);

  const handleTitleChange = (val: string) => {
    setTitle(val);
    save(val, paragraphs, sundayDate);
  };

  const handleSundayChange = (iso: string | null) => {
    setSundayDate(iso);
    setPickerOpen(false);
    save(title, paragraphs, iso);
  };

  // Show the undo pill for 5 s; dismissed on next edit or by clicking it.
  const showUndoPill = useCallback(() => {
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    setUndoPillVisible(true);
    undoTimerRef.current = setTimeout(() => setUndoPillVisible(false), 5000);
  }, []);

  const handleInsertReading = useCallback((payload: { text: string; citation: string }) => {
    const editor = editorRef.current;
    if (!editor) {
      setReadingsOpen(false);
      return;
    }

    // Build the blockquote fragment directly — a single reusable helper
    // (paragraphsToHtml) already knows how to render a quote Paragraph,
    // including the "— citation" last line. An empty paragraph after the
    // blockquote gives the priest somewhere to keep typing.
    const quoteP: Paragraph = {
      id: generateId(),
      text: payload.text,
      kind: "quote",
      citation: payload.citation,
    };
    const quoteHtml = paragraphsToHtml([quoteP]) + "<p></p>";

    // Insert at the end of the current block. If the current block is an
    // empty paragraph, insertContentAt will splice cleanly; otherwise the
    // new blockquote lands after the cursor's current block.
    const { $to } = editor.state.selection;
    const insertPos = $to.after($to.depth);

    editor
      .chain()
      .focus()
      .insertContentAt(insertPos, quoteHtml)
      .run();

    // The onUpdate handler fires from the insertContent and will sync
    // paragraphs + save; no manual setParagraphs needed here.
    showUndoPill();
    setReadingsOpen(false);
  }, [showUndoPill]);

  // Notes are saved independently from the main content save path —
  // they share the debounce pattern but their own timer and their own
  // DB update call. Prevents notes edits from racing with content edits.
  const handleNotesChange = (v: string) => {
    setNotes(v);
    if (notesSaveRef.current) clearTimeout(notesSaveRef.current);
    notesSaveRef.current = setTimeout(async () => {
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const id = draftIdRef.current;
        if (!id) return;
        await supabase
          .from("homilies")
          .update({ notes: v })
          .eq("id", id)
          .eq("user_id", user.id);
      } catch {
        /* ignore */
      }
    }, 1200);
  };

  // Citation-mode syncer. Subscribes to the editor's selection/update
  // events and computes whether the current selection sits inside a quote
  // block (and whether that quote already has a "— " citation line).
  useEffect(() => {
    const editor = editorInstance;
    if (!editor) return;
    const sync = () => {
      if (!editor.isActive("blockquote")) {
        setCitationMode("none");
        return;
      }
      const { $from } = editor.state.selection;
      let quoteDepth = -1;
      for (let d = $from.depth; d >= 0; d--) {
        if ($from.node(d).type.name === "blockquote") {
          quoteDepth = d;
          break;
        }
      }
      if (quoteDepth === -1) {
        setCitationMode("none");
        return;
      }
      const quoteNode = $from.node(quoteDepth);
      const lastPara = quoteNode.lastChild;
      const lastText = lastPara?.textContent ?? "";
      const hasCitation = /^\u2014\s/.test(lastText);
      setCitationMode(hasCitation ? "edit" : "add");
    };
    editor.on("selectionUpdate", sync);
    editor.on("update", sync);
    sync();
    return () => {
      editor.off("selectionUpdate", sync);
      editor.off("update", sync);
    };
  }, [editorInstance]);

  // Ribbon handlers — surface ⌘B / ⌘I / toggle-blockquote as buttons for
  // priests who don't know the keyboard shortcuts. StarterKit also wires the
  // shortcuts natively in the editor, so the buttons are a second way in.
  const applyRibbonMark = (mark: "**" | "*") => {
    const editor = editorRef.current;
    if (!editor) return;
    if (mark === "**") {
      editor.chain().focus().toggleBold().run();
    } else {
      editor.chain().focus().toggleItalic().run();
    }
  };

  const insertRibbonQuote = () => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.chain().focus().toggleBlockquote().run();
  };

  // Citation helper — add a "— " line to the current quote, or move the
  // cursor to the existing citation if one is already present. Storage
  // stays the Phase 1 format (trailing "— Source" paragraph inside the
  // blockquote); we're only adding an explicit affordance so priests
  // don't have to know the typing convention.
  const onCitationClick = () => {
    const editor = editorRef.current;
    if (!editor) return;
    if (!editor.isActive("blockquote")) return;
    const { $from } = editor.state.selection;
    let quoteDepth = -1;
    for (let d = $from.depth; d >= 0; d--) {
      if ($from.node(d).type.name === "blockquote") {
        quoteDepth = d;
        break;
      }
    }
    if (quoteDepth === -1) return;
    const quoteStart = $from.before(quoteDepth);
    const quoteNode = $from.node(quoteDepth);
    const quoteEnd = quoteStart + quoteNode.nodeSize;
    const lastPara = quoteNode.lastChild;
    const lastText = lastPara?.textContent ?? "";
    const hasCitation = /^\u2014\s/.test(lastText);
    if (hasCitation) {
      // Put cursor at the end of the existing citation line.
      editor
        .chain()
        .focus()
        .setTextSelection(quoteEnd - 2)
        .run();
    } else {
      // Insert a new paragraph "— " as the last child of the blockquote.
      // quoteEnd - 1 is the position just before the closing tag of the
      // blockquote (i.e. after the current last paragraph).
      editor
        .chain()
        .focus()
        .insertContentAt(quoteEnd - 1, {
          type: "paragraph",
          content: [{ type: "text", text: "\u2014 " }],
        })
        .run();
    }
  };

  const estimatedMinutes = Math.round(wordCount / 130);
  const sundayOptions = listSundayOptions();
  const pickerLabel = sundayDate
    ? `For ${sundayName ?? shortSundayLabel(sundayDate)}`
    : "Pick a Sunday";

  return (
    <div className="view-fade" style={{ maxWidth: 860, margin: "0 auto", padding: "0 24px 56px" }}>

      {/* Chrome row: [My homilies] ── spacer ── [Notes · Examine] */}
      <div className="ambo-write-chrome" style={{
        display: "flex",
        alignItems: "center",
        marginBottom: 14,
      }}>
        {/* Left: My homilies alone */}
        <PillButton variant="ghost" icon={<StackIconShared />} onClick={onOpenList} title="My homilies" data-tour="my-homilies">
          My homilies
        </PillButton>

        <div style={{ flex: 1 }} />

        {/* Right group: Notes + Examine — both pre-preach tools */}
        <div data-tour="write-notes" style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {notes.trim().length > 0 && (
            <PillButton
              variant={notesOpen ? "active" : "ghost"}
              icon={<NoteIcon />}
              onClick={() => setNotesOpen((v) => !v)}
              title="Show notes from Reflect"
            >
              Notes
            </PillButton>
          )}

          {wordCount >= 30 && (
            <PillButton
              variant={examineOpen ? "active" : "ghost"}
              icon={<ExamineIcon />}
              onClick={() => setExamineOpen((v) => !v)}
              title="A gentle last look before preaching"
              data-tour="write-examine"
            >
              Examine
            </PillButton>
          )}
        </div>
      </div>

      {/* Notes panel (from Reflect) — shared SlideReveal, matches glass panels */}
      <SlideReveal open={notesOpen} marginBottom={notesOpen ? 16 : 0}>
        <div style={{
          border: "1px solid var(--ambo-border)",
          borderRadius: "var(--ambo-radius)",
          background: "var(--ambo-surface)",
          backdropFilter: "var(--ambo-blur)",
          WebkitBackdropFilter: "var(--ambo-blur)",
          boxShadow: "var(--ambo-shadow-md)",
          overflow: "hidden",
        }}>
          <div style={{
            padding: "12px 20px",
            borderBottom: "1px solid var(--ambo-border)",
          }}>
            <span style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "var(--ambo-text-secondary)",
            }}>
              Notes
            </span>
          </div>
          <textarea
            value={notes}
            onChange={(e) => handleNotesChange(e.target.value)}
            placeholder="Your notes from Reflect. Edit freely."
            style={{
              width: "100%",
              minHeight: 140,
              maxHeight: 280,
              border: "none",
              outline: "none",
              resize: "vertical",
              padding: "14px 20px",
              background: "transparent",
              color: "var(--ambo-text-primary)",
              fontFamily: "inherit",
              fontSize: 14,
              lineHeight: 1.6,
              boxSizing: "border-box",
            }}
          />
        </div>
      </SlideReveal>

      {/* Examine panel — five gentle questions before preaching, matches glass panels */}
      <SlideReveal open={examineOpen} marginBottom={examineOpen ? 16 : 0}>
        <div style={{
          border: "1px solid var(--ambo-border)",
          borderRadius: "var(--ambo-radius)",
          background: "var(--ambo-surface)",
          backdropFilter: "var(--ambo-blur)",
          WebkitBackdropFilter: "var(--ambo-blur)",
          boxShadow: "var(--ambo-shadow-md)",
          overflow: "hidden",
        }}>
          <div style={{
            padding: "12px 20px",
            borderBottom: "1px solid var(--ambo-border)",
            display: "flex",
            alignItems: "baseline",
            justifyContent: "space-between",
          }}>
            <span style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "var(--ambo-text-secondary)",
            }}>
              Examine
            </span>
            <span style={{ fontSize: 11, color: "var(--ambo-text-muted)", fontStyle: "italic" }}>
              a last quiet look — nothing to answer
            </span>
          </div>
          <div style={{ padding: "16px 20px 20px" }}>
            {[
              {
                q: "Is there one clear invitation here?",
                s: "People are usually helped more by one living thread than by several good thoughts.",
              },
              {
                q: "Does this sound like preaching, rather than explaining?",
                s: "A homily is meant to proclaim the Word within prayer, not simply to analyse it.",
              },
              {
                q: "Will people hear the gift before the call?",
                s: "The Lord’s grace comes first. What he asks of us follows from what he has given.",
              },
              {
                q: "Has anything personal crept in that dims the Gospel?",
                s: "The preacher’s task is to let the Word stand in the light.",
              },
              {
                q: "Does this keep people close to Christ and his Church?",
                s: "It should open hearers to faith, hope, and communion, not to faction or ideology.",
              },
            ].map((item, i) => (
              <div
                key={i}
                style={{
                  padding: "10px 0",
                  borderTop: i === 0 ? "none" : "1px solid var(--ambo-border)",
                }}
              >
                <div style={{
                  fontSize: 14,
                  fontStyle: "italic",
                  color: "var(--ambo-text-primary)",
                  lineHeight: 1.5,
                  marginBottom: 4,
                }}>
                  {item.q}
                </div>
                <div style={{
                  fontSize: 12,
                  color: "var(--ambo-text-muted)",
                  lineHeight: 1.55,
                }}>
                  {item.s}
                </div>
              </div>
            ))}
          </div>
        </div>
      </SlideReveal>

      <div data-tour="write-discernment">
      {/* Discernment anchor — above the glass Panel, left-aligned.
          Shows only when the priest has named a thread. Read-only; the priest
          has committed to his thread. "Further Listening" expands sub-questions. */}
      {(tourSeed !== null || seed.trim().length > 0) && (
        <div style={{ marginBottom: 18, padding: "0 4px" }}>
          {/* Label + thread — plain display, no link back to Reflect */}
          <div>
            <span style={{
              display: "block",
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "var(--ambo-text-muted)",
              marginBottom: 6,
            }}>
              Discernment
            </span>
            <div style={{
              fontFamily: "var(--ambo-font-reading)",
              fontSize: 15,
              fontStyle: "italic",
              lineHeight: 1.55,
              color: "var(--ambo-text-secondary)",
              maxWidth: 600,
            }}>
              {tourSeed ?? seed}
            </div>
          </div>

          {/* Further Listening — only if sub-questions were answered */}
          {(seedWhyNow.trim() || seedEucharist.trim() || seedResponse.trim()) && (
            <div style={{ marginTop: 10 }}>
              <button
                onClick={() => setFurtherListeningOpen(v => !v)}
                style={{
                  border: "none",
                  background: "transparent",
                  color: "var(--ambo-text-muted)",
                  fontSize: 12,
                  padding: "2px 0",
                  cursor: "pointer",
                  fontFamily: "inherit",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  letterSpacing: "0.02em",
                }}
                aria-expanded={furtherListeningOpen}
              >
                <span style={{ fontStyle: "italic" }}>further listening</span>
                <span style={{ fontSize: 10, opacity: 0.6 }}>{furtherListeningOpen ? "–" : "+"}</span>
              </button>

              <SlideReveal open={furtherListeningOpen} marginTop={furtherListeningOpen ? 10 : 0}>
                <div style={{
                  paddingLeft: 2,
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                }}>
                  {[seedWhyNow, seedEucharist, seedResponse]
                    .filter(a => a.trim())
                    .map((a, i) => (
                      <div key={i} style={{
                        fontFamily: "var(--ambo-font-reading)",
                        fontSize: 13,
                        fontStyle: "italic",
                        lineHeight: 1.55,
                        color: "var(--ambo-text-secondary)",
                      }}>
                        {a}
                      </div>
                    ))}
                </div>
              </SlideReveal>
            </div>
          )}
        </div>
      )}

      </div>

      {/* Glass Panel: title + body live on one surface, a single sheet
          of paper inside the Ambo room. 72% glass, blur+saturate chrome. */}
      <div style={{ position: "relative" }}>
      {/* Dormancy overlay — read-only frost when account is dormant */}
      {isDormant && (
        <div style={{
          position: "absolute",
          inset: 0,
          zIndex: 10,
          background: "var(--ambo-surface)",
          backdropFilter: "blur(6px)",
          WebkitBackdropFilter: "blur(6px)",
          borderRadius: "var(--ambo-radius)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 12,
          padding: 40,
          textAlign: "center",
        }}>
          <p style={{
            margin: 0,
            fontFamily: "var(--ambo-font-ui)",
            fontSize: 15,
            color: "var(--ambo-text-secondary)",
            lineHeight: 1.6,
            maxWidth: 360,
          }}>
            Your writing space is in reading mode.
          </p>
          <p style={{
            margin: 0,
            fontFamily: "var(--ambo-font-ui)",
            fontSize: 13,
            color: "var(--ambo-text-muted)",
            fontStyle: "italic",
            marginBottom: 16,
          }}>
            Open the Reflect tab to begin preparing for Sunday — writing will unlock automatically.
          </p>
          <button
            onClick={onReengage}
            style={{
              padding: "10px 22px",
              background: "var(--ambo-accent)",
              color: "#fff",
              border: "none",
              borderRadius: "var(--ambo-radius-pill)",
              fontSize: 13,
              fontWeight: 600,
              fontFamily: "var(--ambo-font-ui)",
              cursor: "pointer",
              transition: "background 0.15s",
            }}
            onMouseEnter={e => (e.currentTarget.style.background = "var(--ambo-accent-hover)")}
            onMouseLeave={e => (e.currentTarget.style.background = "var(--ambo-accent)")}
          >
            Start writing for this Sunday
          </button>
        </div>
      )}
      <div
        className="ambo-write-panel"
        style={{
          background: "var(--ambo-surface)",
          backdropFilter: "blur(24px) saturate(1.4)",
          WebkitBackdropFilter: "blur(24px) saturate(1.4)",
          border: "1px solid var(--ambo-border)",
          borderRadius: "var(--ambo-radius)",
          boxShadow: "var(--ambo-shadow-md)",
          padding: "44px 56px 56px",
        }}
      >

      {/* Title */}
      <div style={{ marginBottom: 20 }}>
        <input
          value={title}
          onChange={(e) => handleTitleChange(e.target.value)}
          placeholder="Title your homily…"
          style={{
            width: "100%",
            border: "none",
            outline: "none",
            background: "transparent",
            fontFamily: "var(--ambo-font-reading)",
            fontSize: 32,
            fontStyle: "italic",
            fontWeight: 400,
            letterSpacing: "-0.01em",
            color: "var(--ambo-text-primary)",
            padding: 0,
          }}
        />

        {/* Sunday pill + use-as-title */}
        <div style={{
          marginTop: 10,
          display: "flex",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 8,
          position: "relative",
        }}>
          <button
            onClick={() => setPickerOpen((v) => !v)}
            style={{
              border: "1px solid var(--ambo-border)",
              background: pickerOpen ? "var(--ambo-accent-light)" : "transparent",
              color: "var(--ambo-text-secondary)",
              fontSize: 12,
              fontWeight: 500,
              padding: "5px 10px",
              borderRadius: 100,
              cursor: "pointer",
              fontFamily: "inherit",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
            title="Change which Sunday this homily is for"
          >
            <CalendarIcon />
            <span>{pickerLabel}</span>
            <span style={{ fontSize: 10, opacity: 0.6 }}>▾</span>
          </button>

          {!title && sundayName && (
            <button
              onClick={() => handleTitleChange(sundayName)}
              style={{
                border: "none",
                background: "none",
                padding: "5px 4px",
                cursor: "pointer",
                fontSize: 12,
                color: "var(--ambo-text-muted)",
                fontFamily: "inherit",
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
              }}
              title="Use the Sunday name as the title"
            >
              <span style={{ color: "var(--ambo-accent)", fontWeight: 600 }}>↑</span>
              Use as title
            </button>
          )}

          {pickerOpen && (
            <>
              <div
                onClick={() => setPickerOpen(false)}
                style={{ position: "fixed", inset: 0, zIndex: 40 }}
              />
              <div style={{
                position: "absolute",
                top: "calc(100% + 4px)",
                left: 0,
                zIndex: 50,
                background: "var(--ambo-bg)",
                border: "1px solid var(--ambo-border)",
                borderRadius: 10,
                boxShadow: "var(--ambo-shadow-md)",
                padding: 4,
                minWidth: 240,
                maxHeight: 320,
                overflowY: "auto",
              }}>
                {sundayOptions.map((d) => {
                  const iso = toIsoDate(d);
                  const isSelected = iso === sundayDate;
                  const isPast = d.getTime() < new Date(new Date().setHours(0,0,0,0)).getTime();
                  const nameCached = sundayNameCache.get(iso);
                  return (
                    <button
                      key={iso}
                      onClick={() => handleSundayChange(iso)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 12,
                        width: "100%",
                        textAlign: "left",
                        border: "none",
                        background: isSelected ? "var(--ambo-accent-light)" : "transparent",
                        color: isSelected
                          ? "var(--ambo-accent)"
                          : isPast
                            ? "var(--ambo-text-muted)"
                            : "var(--ambo-text-primary)",
                        padding: "8px 10px",
                        borderRadius: 8,
                        cursor: "pointer",
                        fontFamily: "inherit",
                        fontSize: 13,
                        fontWeight: isSelected ? 600 : 500,
                      }}
                    >
                      <span>{shortSundayLabel(iso)}</span>
                      <span style={{
                        fontSize: 11,
                        color: "var(--ambo-text-muted)",
                        textAlign: "right",
                        maxWidth: 160,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}>
                        {nameCached ?? ""}
                      </span>
                    </button>
                  );
                })}
                <div style={{ padding: "6px 10px", borderTop: "1px solid var(--ambo-border)", marginTop: 4 }}>
                  <button
                    onClick={() => handleSundayChange(null)}
                    style={{
                      border: "none",
                      background: "transparent",
                      color: "var(--ambo-text-muted)",
                      fontSize: 12,
                      fontFamily: "inherit",
                      cursor: "pointer",
                      padding: "4px 0",
                    }}
                  >
                    No Sunday (clear)
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        <div style={{
          height: 1,
          background: "var(--ambo-border)",
          marginTop: 16,
        }} />
      </div>

      {/* Formatting ribbon — a pill holding bold / italic / quote. Matches the
          pill language the rest of the app uses (Sunday pill, drawer toggles).
          Sits inside the panel above the paragraphs; pins just below the page
          header once scrolled past. Keyboard shortcuts ⌘B / ⌘I still work. */}
      <div
        style={{
          position: "sticky",
          top: 72,
          zIndex: 20,
          marginBottom: 20,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 2,
            height: 34,
            padding: "0 5px",
            borderRadius: 999,
            border: "1px solid var(--ambo-border)",
            background: "var(--ambo-surface)",
            backdropFilter: "blur(20px) saturate(1.4)",
            WebkitBackdropFilter: "blur(20px) saturate(1.4)",
            boxShadow: "var(--ambo-shadow-sm, 0 1px 2px rgba(0,0,0,0.04))",
          }}
        >
        <RibbonButton
          label="Bold"
          kbd="⌘B"
          onClick={() => applyRibbonMark("**")}
        >
          <span style={{
            fontFamily: "var(--ambo-font-reading)",
            fontSize: 14,
            fontWeight: 700,
            lineHeight: 1,
          }}>B</span>
        </RibbonButton>
        <RibbonButton
          label="Italic"
          kbd="⌘I"
          onClick={() => applyRibbonMark("*")}
        >
          <span style={{
            fontFamily: "var(--ambo-font-reading)",
            fontSize: 14,
            fontStyle: "italic",
            lineHeight: 1,
          }}>I</span>
        </RibbonButton>
        <RibbonButton
          label="Quote block"
          onClick={insertRibbonQuote}
        >
          <QuoteGlyph />
        </RibbonButton>
        {citationMode !== "none" && (
          <RibbonButton
            label={citationMode === "edit" ? "Edit citation" : "Add citation"}
            onClick={onCitationClick}
          >
            <CitationGlyph />
          </RibbonButton>
        )}
        </div>
        <PillButton
          variant={readingsOpen ? "active" : "ghost"}
          icon={<BookIconShared />}
          onClick={() => setReadingsOpen(true)}
          data-tour="readings-drawer"
          title="Open today’s readings"
          style={{
            height: 34,
            padding: "0 12px",
            lineHeight: "1",
            boxShadow: "var(--ambo-shadow-sm, 0 1px 2px rgba(0,0,0,0.04))",
            ...(readingsOpen ? {} : {
              background: "var(--ambo-surface)",
              backdropFilter: "blur(20px) saturate(1.4)",
              WebkitBackdropFilter: "blur(20px) saturate(1.4)",
            }),
          }}
        >
          Readings
        </PillButton>
      </div>

      {/* Paragraphs — single Tiptap editor owns all paragraph flow now.
          Re-keyed on currentId so switching homilies remounts with fresh
          content. StarterKit wires ⌘B / ⌘I / Enter / Backspace natively. */}
      <div className="ambo-rich-editor-wrap">
        <RichEditor
          key={editorMountKey}
          initialHtml={initialHtml}
          onReady={(editor) => {
            editorRef.current = editor;
            setEditorInstance(editor);
          }}
          onReorder={showUndoPill}
          onQuoteDelete={showUndoPill}
          onUpdate={(editor) => {
            const next = paragraphsFromDoc(editor.getJSON());
            setParagraphs(next);
            save(title, next, sundayDate);
            // Any edit dismisses the undo pill.
            if (undoTimerRef.current) { clearTimeout(undoTimerRef.current); undoTimerRef.current = null; }
            setUndoPillVisible(false);
          }}
          placeholder="Begin writing your homily…"
        />
      </div>
      </div>
      {/* /Glass Panel */}
      </div>
      {/* /Dormancy wrapper */}

      {/* Undo pill — shown after reading insert or drag-reorder */}
      {undoPillVisible && (
        <div
          style={{
            position: "fixed",
            bottom: 56,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 50,
          }}
        >
          <PillButton
            variant="active"
            style={{
              background: "var(--ambo-accent)",
              borderColor: "var(--ambo-accent-hover)",
              color: "#fff",
              boxShadow: "0 2px 14px rgba(74,111,165,0.40)",
            }}
            onClick={() => {
              editorRef.current?.chain().focus().undo().run();
              if (undoTimerRef.current) { clearTimeout(undoTimerRef.current); undoTimerRef.current = null; }
              setUndoPillVisible(false);
            }}
          >
            ↩ Undo
          </PillButton>
        </div>
      )}

      {/* Status bar */}
      <div style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        padding: "12px 24px",
        background: "var(--ambo-surface-raised)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        borderTop: "1px solid var(--ambo-border)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 16,
      }}>
        <span style={{ fontSize: 12, color: "var(--ambo-text-muted)" }}>
          {wordCount} {wordCount === 1 ? "word" : "words"}
          {wordCount > 0 && ` · ~${estimatedMinutes} min`}
        </span>
        {lastSaved && (
          <span style={{ fontSize: 12, color: "var(--ambo-text-muted)" }}>
            · Saved {lastSaved.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </span>
        )}
      </div>

      {/* Readings drawer */}
      <ReadingsDrawer
        open={readingsOpen}
        sundayDate={sundayDate}
        homilyId={draftIdRef.current}
        readingsSource={readingsSource}
        onClose={() => setReadingsOpen(false)}
        onInsert={handleInsertReading}
      />
    </div>
  );
}

const pillBtnStyle = (active: boolean): React.CSSProperties => ({
  border: "1px solid " + (active ? "var(--ambo-accent)" : "var(--ambo-border)"),
  background: active ? "var(--ambo-accent-light)" : "transparent",
  color: active ? "var(--ambo-accent)" : "var(--ambo-text-secondary)",
  fontSize: 12,
  fontWeight: 500,
  padding: "6px 12px",
  borderRadius: 100,
  cursor: "pointer",
  fontFamily: "inherit",
  display: "flex",
  alignItems: "center",
  gap: 6,
  transition: "all 0.15s",
});

function StackIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="14" height="4" rx="1" />
      <rect x="3" y="9" width="14" height="4" rx="1" />
      <rect x="3" y="15" width="14" height="2.5" rx="1" />
    </svg>
  );
}

function BookIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 4h5a2 2 0 0 1 2 2v11" />
      <path d="M16 4h-5a2 2 0 0 0-2 2v11" />
      <path d="M4 4v13h5" />
      <path d="M16 4v13h-5" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="5" width="14" height="12" rx="2" />
      <path d="M3 9h14" />
      <path d="M7 3v4M13 3v4" />
    </svg>
  );
}

// RibbonButton — small ghost-styled button used in the Write formatting ribbon.
// Wider affordance than a bare glyph, but quiet enough to sit inside the panel
// without announcing itself. Hover and active states are subtle; the button
// communicates "available tool" rather than "primary action".
function RibbonButton({
  label,
  kbd,
  onClick,
  children,
}: {
  label: string;
  kbd?: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  const [hover, setHover] = useState(false);
  const [pressed, setPressed] = useState(false);
  const title = kbd ? `${label} · ${kbd}` : label;
  return (
    <button
      type="button"
      onMouseDown={(e) => {
        // Prevent the button from stealing focus from the textarea.
        e.preventDefault();
        setPressed(true);
      }}
      onMouseUp={() => setPressed(false)}
      onMouseLeave={() => { setHover(false); setPressed(false); }}
      onMouseEnter={() => setHover(true)}
      onClick={onClick}
      aria-label={label}
      title={title}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: 26,
        height: 26,
        padding: 0,
        border: "1px solid transparent",
        borderRadius: 999,
        background: pressed
          ? "var(--ambo-accent-light)"
          : hover
          ? "rgba(0, 0, 0, 0.04)"
          : "transparent",
        color: "var(--ambo-text-secondary)",
        cursor: "pointer",
        fontFamily: "inherit",
        transition: "background 120ms ease, color 120ms ease",
      }}
    >
      {children}
    </button>
  );
}

// QuoteGlyph — a tiny blockquote mark: a vertical stroke to the left with a
// short opening quotation. Reads as "insert a quoted block."
function QuoteGlyph() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 5v10" />
      <path d="M9 7c-1.5 0.5 -2.5 1.8 -2.5 3.5 0 1.2 0.9 2 2 2 1 0 1.8 -0.7 1.8 -1.8 0 -1 -0.7 -1.7 -1.7 -1.7" />
      <path d="M15 7c-1.5 0.5 -2.5 1.8 -2.5 3.5 0 1.2 0.9 2 2 2 1 0 1.8 -0.7 1.8 -1.8 0 -1 -0.7 -1.7 -1.7 -1.7" />
    </svg>
  );
}

// CitationGlyph — em-dash paired with a short underscore. Visually echoes
// the "— Source" convention so priests recognise what the button will do.
function CitationGlyph() {
  return (
    <svg width="14" height="10" viewBox="0 0 20 14" fill="none" aria-hidden>
      <line x1="3" y1="5" x2="10" y2="5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <line x1="4" y1="10" x2="17" y2="10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" opacity="0.55" />
    </svg>
  );
}

