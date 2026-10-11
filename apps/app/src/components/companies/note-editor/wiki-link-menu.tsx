import { IconFileText, IconLink } from "@tabler/icons-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import {
  filterWikiCandidates,
  type WikiCandidate,
} from "./wiki-links";

/**
 * The note picker that opens behind `[[`.
 *
 * Anchored to the block being typed in rather than to the caret, because a `contentEditable` does
 * not expose per-character geometry cheaply and a block-level anchor lands in the right place in
 * practice. Flips upward near the bottom edge so it is never unreachable.
 */
export function WikiLinkMenu({
  notes,
  labelOf,
  currentNoteId,
  onPick,
  onClose,
  query,
  anchorId,
}: {
  notes: WikiCandidate[];
  labelOf: (candidate: WikiCandidate) => string;
  currentNoteId: string;
  onPick: (candidate: WikiCandidate) => void;
  onClose: () => void;
  query: string;
  anchorId: string;
}) {
  const [index, setIndex] = useState(0);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const items = useMemo(() => filterWikiCandidates(notes, query), [notes, query]);

  // A changed query means a different result list, so the highlight has to go back to the top —
  // otherwise Enter picks whatever happened to be highlighted for the previous letters.
  useEffect(() => {
    setIndex(0);
  }, [query]);

  useEffect(() => {
    const anchor = document.querySelector<HTMLElement>(`[data-block="${anchorId}"]`);
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    const height = 288;
    const openUp = rect.bottom + height > window.innerHeight && rect.top > height;
    setPosition({
      top: openUp ? Math.max(8, rect.top - 8) : rect.bottom + 8,
      left: Math.min(rect.left, Math.max(8, window.innerWidth - 316)),
    });
  }, [anchorId]);

  // The caret keys are handled globally because the `contentEditable` keeps focus while the menu is
  // open — a handler on the menu would never fire.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (items.length === 0) return;
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setIndex((value) => (value + 1) % items.length);
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        setIndex((value) => (value - 1 + items.length) % items.length);
      } else if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault();
        const picked = items[index];
        if (picked) onPick(picked);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [items, index, onPick, onClose]);

  // Keeps the highlighted row inside the scroll box once the list is longer than the menu.
  useEffect(() => {
    const active = listRef.current?.querySelector<HTMLElement>('[data-active="true"]');
    active?.scrollIntoView({ block: "nearest" });
  }, [index]);

  if (position === null) return null;

  return (
    <div
      className="fixed z-50 w-[300px] overflow-hidden rounded-xl border border-black/10 bg-white/95 py-1.5 shadow-lg shadow-black/10 backdrop-blur"
      ref={listRef}
      style={{ top: position.top, left: position.left }}
    >
      <p className="px-2.5 pb-1 text-[10px] font-semibold uppercase tracking-[0.06em] text-neutral-400">
        Notiz verlinken
      </p>

      {items.length === 0 ? (
        <p className="px-2.5 py-2 text-[12px] text-neutral-400">
          Keine Notiz mit „{query}" gefunden
        </p>
      ) : (
        <ul className="max-h-[248px] overflow-y-auto">
          {items.map((item, position) => (
            <li key={item.id}>
              <button
                className={cn(
                  "flex w-full items-center gap-2 px-2.5 py-1.5 text-left transition-colors",
                  position === index
                    ? "bg-neutral-100"
                    : "hover:bg-neutral-50",
                )}
                data-active={position === index}
                onMouseDown={(event) => {
                  // `mousedown` rather than `click`: the input would blur first and close the menu
                  // before a click could ever land.
                  event.preventDefault();
                  onPick(item);
                }}
                onMouseEnter={() => setIndex(position)}
                type="button"
              >
                <IconFileText className="size-3.5 shrink-0 text-neutral-400" stroke={1.75} />
                <span className="min-w-0 flex-1 truncate text-[13px] text-neutral-800">
                  {labelOf(item)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <p className="flex items-center gap-1.5 border-t border-black/6 px-2.5 pt-1.5 text-[10px] text-neutral-400">
        <IconLink className="size-3" stroke={1.75} />
        Enter zum Einfügen · Esc zum Abbrechen
      </p>
    </div>
  );
}