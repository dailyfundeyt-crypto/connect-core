import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { IconCheck, IconFileImport, IconLoader2, IconNote, IconX } from "@tabler/icons-react";
import { createPortal } from "react-dom";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { NoteBlockEditor } from "@/components/companies/note-editor/note-block-editor";
import type { NoteBlock } from "@/lib/companies/notes";
import { blocksToMarkdown, markdownToBlocks } from "@/lib/companies/notes-markdown";
import { brainFileQueryOptions, brainSaveNoteMutationOptions } from "@/lib/brain/queries";

function dayStamp(date: Date) {
  const part = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${part(date.getMonth() + 1)}-${part(date.getDate())}`;
}

const WINDOW_POSITION_KEY = "connect.quick-daily-note.window-position.v1";
const WINDOW_WIDTH = 460;
const WINDOW_HEIGHT = 560;

function dailyPath(day: string) {
  return `Daily/Schnellnotiz-${day}.md`;
}

function draftKey(day: string) {
  return `connect.quick-daily-note.draft.${day}`;
}

function clampWindowPosition(x: number, y: number) {
  return {
    x: Math.max(8, Math.min(x, window.innerWidth - Math.min(WINDOW_WIDTH, window.innerWidth - 16) - 8)),
    y: Math.max(8, Math.min(y, window.innerHeight - Math.min(WINDOW_HEIGHT, window.innerHeight - 16) - 8)),
  };
}

/** WYSIWYG Markdown quick note opened from the calendar widget. */
export function QuickDailyNote({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const drag = useRef<{ id: number; sx: number; sy: number; ox: number; oy: number } | null>(null);
  const [today, setToday] = useState(() => dayStamp(new Date()));
  const [position, setPosition] = useState({ x: 24, y: 120 });
  const [blocks, setBlocks] = useState<NoteBlock[] | null>(null);
  const [savedPath, setSavedPath] = useState<string | null>(null);
  const path = useMemo(() => dailyPath(today), [today]);
  const file = useQuery(brainFileQueryOptions(path));
  const saveOptions = brainSaveNoteMutationOptions(queryClient);
  const save = useMutation({
    ...saveOptions,
    onSuccess: (result) => {
      saveOptions.onSuccess(result);
      setSavedPath(result.path);
      try { window.localStorage.removeItem(draftKey(today)); } catch { /* ignore */ }
    },
  });

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(WINDOW_POSITION_KEY);
      if (stored) {
        const value = JSON.parse(stored) as { x?: number; y?: number };
        if (Number.isFinite(value.x) && Number.isFinite(value.y)) {
          setPosition(clampWindowPosition(value.x!, value.y!));
          return;
        }
      }
    } catch { /* use the default position */ }
    setPosition(clampWindowPosition(window.innerWidth - WINDOW_WIDTH - 28, 120));
  }, []);

  useEffect(() => {
    const resize = () => setPosition((current) => clampWindowPosition(current.x, current.y));
    const rollover = window.setInterval(() => {
      const nextDay = dayStamp(new Date());
      setToday((current) => current === nextDay ? current : nextDay);
    }, 30_000);
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !save.isPending) onClose();
    };
    window.addEventListener("resize", resize);
    window.addEventListener("keydown", escape);
    return () => {
      window.clearInterval(rollover);
      window.removeEventListener("resize", resize);
      window.removeEventListener("keydown", escape);
    };
  }, [onClose, save.isPending]);

  useEffect(() => {
    setBlocks(null);
    setSavedPath(null);
    if (file.isPending) return;
    let draft: string | null = null;
    try { draft = window.localStorage.getItem(draftKey(today)); } catch { /* use the saved file */ }
    const markdown = draft ?? file.data?.content ?? "";
    setBlocks(markdownToBlocks(markdown.replace(/^# \d{4}-\d{2}-\d{2}\s*\n+/, "")));
  }, [today, file.data?.path, file.isPending]);

  useEffect(() => {
    try {
      for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
        const key = window.localStorage.key(index);
        if (key?.startsWith("connect.quick-daily-note.draft.") && key !== draftKey(today)) {
          window.localStorage.removeItem(key);
        }
      }
    } catch { /* daily draft cleanup is best effort */ }
  }, [today]);

  const handleBlocksChange = useCallback((next: NoteBlock[]) => {
    setBlocks(next);
    setSavedPath(null);
    const markdown = blocksToMarkdown(next);
    try {
      if (markdown.trim()) window.localStorage.setItem(draftKey(today), markdown);
      else window.localStorage.removeItem(draftKey(today));
    } catch { /* the editor remains usable if local storage is unavailable */ }
  }, [today]);

  const saveCurrentNote = () => {
    if (!blocks?.length || save.isPending) return;
    const markdown = blocksToMarkdown(blocks).trim();
    if (!markdown) return;
    const content = `# ${today}\n\n${markdown}\n`;
    save.mutate({ path, content, mode: file.data ? "write" : "create" });
  };

  if (typeof document === "undefined") return null;

  return createPortal(
    <section
      aria-label="Schnellnotiz"
      className="fixed z-[90] flex h-[min(560px,calc(100dvh-16px))] w-[min(460px,calc(100vw-16px))] flex-col overflow-hidden rounded-[30px] border border-white/[0.10] bg-[radial-gradient(ellipse_at_50%_-20%,rgba(25,108,74,0.2),transparent_48%),linear-gradient(160deg,rgba(17,23,24,0.94),rgba(10,13,16,0.92))] text-white shadow-[0_28px_90px_-30px_rgba(0,0,0,0.86),0_0_60px_-48px_rgba(52,211,153,0.35)] animate-in fade-in-0 zoom-in-[0.98] duration-200"
      data-testid="quick-daily-note"
      role="dialog"
      style={{ left: position.x, top: position.y }}
    >
      <header
        className="flex h-12 shrink-0 touch-none select-none items-center justify-between border-b border-white/[0.08] px-4 cursor-grab active:cursor-grabbing"
        onPointerCancel={() => { drag.current = null; }}
        onPointerDown={(event) => {
          if ((event.target as HTMLElement).closest("button")) return;
          drag.current = { id: event.pointerId, sx: event.clientX, sy: event.clientY, ox: position.x, oy: position.y };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          const active = drag.current;
          if (!active || active.id !== event.pointerId) return;
          setPosition(clampWindowPosition(active.ox + event.clientX - active.sx, active.oy + event.clientY - active.sy));
        }}
        onPointerUp={(event) => {
          const active = drag.current;
          if (!active) return;
          drag.current = null;
          const next = clampWindowPosition(active.ox + event.clientX - active.sx, active.oy + event.clientY - active.sy);
          setPosition(next);
          try { window.localStorage.setItem(WINDOW_POSITION_KEY, JSON.stringify(next)); } catch { /* ignore */ }
        }}
      >
        <div className="flex min-w-0 items-center gap-2.5">
          <IconNote className="size-4 shrink-0 text-emerald-200/85" stroke={1.8} />
          <span className="truncate text-[13px] font-medium tracking-tight">Schnellnotiz</span>
          <span className="text-[11px] text-white/35">· {today}</span>
        </div>
        <button aria-label="Schließen" className="flex size-7 shrink-0 items-center justify-center rounded-full text-white/45 transition hover:bg-white/[0.08] hover:text-white" onClick={onClose} type="button">
          <IconX className="size-4" />
        </button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col px-4 pb-3 pt-2">
        <div className="mb-2 flex h-6 shrink-0 items-center justify-between text-[10px] text-white/40">
          <span>Markdown · bleibt heute erhalten</span>
          <label className="inline-flex cursor-pointer items-center gap-1 rounded px-1.5 py-1 transition hover:bg-white/[0.06] hover:text-white/75">
            <IconFileImport className="size-3" />
            .md öffnen
            <input
              accept=".md,.markdown,.txt,text/markdown,text/plain"
              className="sr-only"
              onChange={async (event) => {
                const file = event.target.files?.[0];
                if (file) {
                  setBlocks(markdownToBlocks(await file.text()));
                  setSavedPath(null);
                }
                event.currentTarget.value = "";
              }}
              type="file"
            />
          </label>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto pr-1 text-[13px] leading-6 [scrollbar-color:rgba(255,255,255,0.16)_transparent]">
          {blocks === null ? (
            <div className="flex h-full items-center justify-center text-white/40"><IconLoader2 className="size-4 animate-spin" /></div>
          ) : (
            <NoteBlockEditor blocks={blocks} onBlocksChange={handleBlocksChange} />
          )}
        </div>
        <div className="mt-2 flex min-h-8 shrink-0 items-center justify-between gap-2 border-t border-white/[0.07] pt-2">
          <div className="min-w-0 truncate text-[10px] text-white/40" aria-live="polite">
            {savedPath ? <span className="text-emerald-300/90">Gespeichert · {savedPath}</span> : null}
            {save.error ? <span className="text-rose-300">{save.error.message || "Speichern fehlgeschlagen."}</span> : null}
            {!savedPath && !save.error ? <span>Entwurf wird automatisch für heute gehalten</span> : null}
          </div>
          <button
            className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg bg-emerald-300/15 px-2.5 text-[11px] font-medium text-emerald-100 transition hover:bg-emerald-300/25 disabled:cursor-not-allowed disabled:opacity-35"
            disabled={!blocks?.length || save.isPending || !!savedPath}
            onClick={saveCurrentNote}
            type="button"
          >
            {save.isPending ? <IconLoader2 className="size-3.5 animate-spin" /> : savedPath ? <IconCheck className="size-3.5" /> : null}
            {save.isPending ? "Speichere …" : savedPath ? "Gespeichert" : "In Daily speichern"}
          </button>
        </div>
      </div>
    </section>,
    document.body,
  );
}
