import { IconList } from "@tabler/icons-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { NoteBlock } from "@/lib/companies/notes";
import { blockText } from "@/lib/companies/use-note-blocks";
import { cn } from "@/lib/utils";

/**
 * A live table-of-contents for the open note.
 *
 * Each `heading{1,2,3}` block becomes one entry, in document order. The list
 * follows the editor as the user types: it is recomputed from the same
 * `blocks` array the editor renders, so there is no separate DOM to keep in
 * sync. Clicking an entry scrolls the matching block into view; each block
 * already carries `data-block-row` from `NoteBlockEditor`, which is what the
 * scroller uses to find it.
 */
export function NoteTableOfContents({
  blocks,
  containerRef,
}: {
  blocks: NoteBlock[];
  containerRef: React.RefObject<HTMLElement | null>;
}) {
  // Memoised so the IntersectionObserver effect below can use it as a stable
  // dependency. Without this the array is rebuilt on every render, the effect
  // tears down and recreates the observer, the observer fires setActive, and
  // the cycle repeats until React trips the nested-update guard (#185).
  const entries = useMemo(
    () =>
      blocks
        .filter((block) => block.type === "heading1" || block.type === "heading2" || block.type === "heading3")
        .map((block) => ({
          id: block.id,
          level: block.type === "heading1" ? 1 : block.type === "heading2" ? 2 : 3,
          text: blockText(block).trim() || "Ohne Titel",
        })),
    [blocks],
  );

  const [active, setActive] = useState<string | null>(entries[0]?.id ?? null);
  // Mirror `active` in a ref so the IntersectionObserver can read the latest
  // value without taking `active` as a dependency (which would re-create the
  // observer on every selection and loop React's nested-update guard).
  const activeRef = useRef<string | null>(active);
  activeRef.current = active;

  // Keep the active entry in sync with the latest entries list, but only when
  // the document has changed underneath us. Re-seeding on every render is the
  // path that locked the editor into an update loop.
  useEffect(() => {
    setActive((current) => current ?? entries[0]?.id ?? null);
  }, [entries]);

  /*
   * Track which heading is currently in view. The IntersectionObserver runs
   * against the editor's own scroll container, so the active row follows the
   * user's actual scroll rather than the rendered position relative to the
   * viewport.
   */
  useEffect(() => {
    if (!entries.length) return;
    const scroller = containerRef.current;
    if (!scroller) return;
    const targets = entries
      .map((entry) => scroller.querySelector(`[data-block-row="${entry.id}"]`))
      .filter((node): node is Element => node instanceof Element);
    if (!targets.length) return;
    const visible = new Map<string, number>();
    // Read the current `active` lazily so the effect does not need to take it
    // as a dependency. Taking it would mean every setActive re-runs the effect
    // which then re-creates the observer -- the exact loop the memoised
    // `entries` above is meant to prevent.
    const observer = new IntersectionObserver(
      (records) => {
        for (const record of records) {
          const id = (record.target as HTMLElement).dataset.blockRow;
          if (!id) continue;
          if (record.isIntersecting) {
            visible.set(id, record.intersectionRatio);
          } else {
            visible.delete(id);
          }
        }
        if (!visible.size) return;
        // The first entry still on screen wins; the rest of the list stays put
        // while the user scrolls within the section.
        const winner = entries.find((entry) => visible.has(entry.id));
        if (!winner) return;
        if (winner.id === activeRef.current) return;
        setActive(winner.id);
      },
      { root: scroller, rootMargin: "0px 0px -60% 0px", threshold: [0, 0.5, 1] },
    );
    for (const target of targets) observer.observe(target);
    return () => observer.disconnect();
  }, [entries, containerRef]);

  if (entries.length < 2) return null;

  const scrollTo = (id: string) => {
    const scroller = containerRef.current;
    if (!scroller) return;
    const target = scroller.querySelector(`[data-block-row="${id}"]`);
    if (!(target instanceof HTMLElement)) return;
    const scrollerRect = scroller.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    scroller.scrollBy({
      top: targetRect.top - scrollerRect.top - 24,
      behavior: "smooth",
    });
    setActive(id);
  };

  return (
    <nav
      aria-label="Inhaltsverzeichnis"
      className="sticky top-3 hidden max-h-[calc(100vh-3rem)] w-56 shrink-0 overflow-y-auto pr-2 text-[12.5px] xl:block"
    >
      <p className="mb-2 flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/60">
        <IconList className="size-3" stroke={1.75} />
        Inhalt
      </p>
      <ul className="flex flex-col gap-0.5">
        {entries.map((entry) => (
          <li key={entry.id}>
            <button
              className={cn(
                "block w-full truncate rounded-md px-2 py-1 text-left transition-colors",
                entry.level > 1 && "pl-4",
                entry.level > 2 && "pl-7 text-[11.5px]",
                active === entry.id
                  ? "bg-neutral-900/5 font-medium text-neutral-900 dark:bg-white/10 dark:text-white"
                  : "text-muted-foreground hover:bg-neutral-900/5 hover:text-neutral-900 dark:hover:bg-white/5 dark:hover:text-white",
              )}
              onClick={() => scrollTo(entry.id)}
              type="button"
            >
              {entry.text}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}