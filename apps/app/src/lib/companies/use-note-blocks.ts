/**
 * The block editor's state, kept out of the components.
 *
 * Everything that changes the document — typing, splitting, merging, converting, dragging — goes
 * through this hook, so there is exactly one place where the block list is rewritten and the undo
 * history is pushed. Two components editing the same array is how a document ends up with two
 * blocks claiming the same id.
 */

import { useCallback, useRef, useState } from "react";
import type { NoteBlock, NoteBlockType, NoteMark, NoteSpan } from "./notes";

export const EMPTY_PARAGRAPH: NoteBlockType = "paragraph";

let counter = 0;
export function newBlockId(): string {
  counter += 1;
  return `b-${Date.now().toString(36)}-${counter.toString(36)}`;
}

export function emptyBlock(type: NoteBlockType = "paragraph"): NoteBlock {
  const base: NoteBlock = { id: newBlockId(), type, spans: [{ text: "" }] };
  switch (type) {
    case "todo":
      return { ...base, checked: false };
    case "toggle":
      return { ...base, collapsed: false, children: [] };
    case "callout":
      return { ...base, emoji: "💡" };
    case "code":
      return { ...base, language: "" };
    case "table":
      return {
        ...base,
        spans: [],
        table: {
          headerRow: true,
          rows: [
            ["", "", ""],
            ["", "", ""],
          ],
        },
      };
    default:
      return base;
  }
}

/** A note is never zero blocks: an empty document still needs one thing to click into. */
export function ensureNotEmpty(blocks: NoteBlock[]): NoteBlock[] {
  return blocks.length > 0 ? blocks : [emptyBlock("paragraph")];
}

/* --------------------------------------------------------------- history */

/**
 * Undo/redo over whole documents.
 *
 * Snapshot-based rather than command-based because blocks are small and a note is bounded - the
 * naive approach is correct here, and command-based undo would need an inverse operation for every
 * single mutation this editor can perform.
 *
 * The document is also kept in a ref, and every mutation goes through `update`. That is not an
 * optimisation: two keystrokes can land before React re-renders, and a callback closing over
 * `present` would compute the second edit from the document as it was before the first - so the
 * first character of a fast-typed word would silently vanish. Reading the live ref is what makes
 * two edits in one tick both survive.
 */
export function useHistory(initial: NoteBlock[]) {
  const [present, setPresent] = useState<NoteBlock[]>(() =>
    ensureNotEmpty(initial),
  );
  const live = useRef<NoteBlock[]>(present);
  live.current = present;

  const past = useRef<NoteBlock[][]>([]);
  const future = useRef<NoteBlock[][]>([]);
  /**
   * The last coalescing key, so a run of keystrokes in one block is a single undo step.
   *
   * A ref rather than state because it must be readable inside `update` without being a dependency
   * - including it in the callback's deps would rebuild `update` on every keystroke and defeat the
   * memoisation the editor relies on.
   */
  const lastKey = useRef<string | null>(null);

  /**
   * Applies a change to the current document and stores the result.
   *
   * `coalesceKey` merges rapid edits into one undo step: typing "hello" is five changes but one
   * thing to undo. Passing `null` starts a new step - which is what every structural change
   * (Enter, delete, drag) wants, since each is one deliberate action.
   */
  const update = useCallback(
    (recipe: (current: NoteBlock[]) => NoteBlock[], coalesceKey?: string | null) => {
      const next = ensureNotEmpty(recipe(live.current));
      const coalescing = Boolean(coalesceKey) && lastKey.current === coalesceKey;
      if (!coalescing) {
        past.current = [...past.current.slice(-49), live.current];
        future.current = [];
      }
      lastKey.current = coalesceKey ?? null;
      live.current = next;
      setPresent(next);
    },
    [],
  );

  const undo = useCallback(() => {
    const previous = past.current.pop();
    if (!previous) return;
    future.current = [live.current, ...future.current];
    live.current = previous;
    setPresent(previous);
    lastKey.current = null;
  }, []);

  const redo = useCallback(() => {
    const [next, ...rest] = future.current;
    if (!next) return;
    past.current = [...past.current, live.current];
    future.current = rest;
    live.current = next;
    setPresent(next);
    lastKey.current = null;
  }, []);

  return {
    blocks: present,
    /** Pass a recipe, not a finished array, so it sees the document as it is at call time. */
    update,
    undo,
    redo,
    canUndo: past.current.length > 0,
    canRedo: future.current.length > 0,
  };
}

/* --------------------------------------------------------------- edits */

export function updateBlock(
  blocks: NoteBlock[],
  id: string,
  patch: Partial<NoteBlock>,
): NoteBlock[] {
  return blocks.map((block) =>
    block.id === id ? { ...block, ...patch } : withNested(block, id, patch),
  );
}

function withNested(
  block: NoteBlock,
  id: string,
  patch: Partial<NoteBlock>,
): NoteBlock {
  if (!block.children?.length) return block;
  return {
    ...block,
    children: block.children.map((child) =>
      child.id === id ? { ...child, ...patch } : withNested(child, id, patch),
    ),
  };
}

/** Every block in document order, toggles expanded, so ids can be found without a second walk. */
export function flatten(blocks: NoteBlock[]): NoteBlock[] {
  return blocks.flatMap((block) => [
    block,
    ...flatten(block.children ?? []),
  ]);
}

export function findBlock(
  blocks: NoteBlock[],
  id: string,
): NoteBlock | null {
  for (const block of blocks) {
    if (block.id === id) return block;
    const nested = findBlock(block.children ?? [], id);
    if (nested) return nested;
  }
  return null;
}

/** Removes a block wherever it is, and returns it so a caller can undo the delete. */
export function removeBlock(
  blocks: NoteBlock[],
  id: string,
): { blocks: NoteBlock[]; removed: NoteBlock | null } {
  const direct = blocks.findIndex((block) => block.id === id);
  if (direct >= 0) {
    const removed = blocks[direct];
    return {
      blocks: [...blocks.slice(0, direct), ...blocks.slice(direct + 1)],
      removed,
    };
  }
  let removed: NoteBlock | null = null;
  const next = blocks.map((block) => {
    if (removed || !block.children?.length) return block;
    const result = removeBlock(block.children, id);
    if (result.removed) removed = result.removed;
    return { ...block, children: result.blocks };
  });
  return { blocks: next, removed };
}

/**
 * Inserts `block` right after `afterId`, or at the end when `afterId` is null.
 *
 * Toggle children are searched too, so pressing Enter inside a collapsed toggle's content puts the
 * new block there rather than at the end of the document.
 */
export function insertAfter(
  blocks: NoteBlock[],
  afterId: string | null,
  block: NoteBlock,
): NoteBlock[] {
  if (afterId === null) return [...blocks, block];
  const index = blocks.findIndex((item) => item.id === afterId);
  if (index >= 0) {
    return [
      ...blocks.slice(0, index + 1),
      block,
      ...blocks.slice(index + 1),
    ];
  }
  let inserted = false;
  const next = blocks.map((item) => {
    if (inserted || !item.children?.length) return item;
    const result = insertAfter(item.children, afterId, block);
    if (result.length !== item.children.length) inserted = true;
    return { ...item, children: result };
  });
  return next;
}

/** The block above `id`, for Up-arrow navigation. */
export function previousBlock(
  blocks: NoteBlock[],
  id: string,
): NoteBlock | null {
  const flat = flatten(blocks);
  const index = flat.findIndex((block) => block.id === id);
  return index > 0 ? flat[index - 1] : null;
}

export function nextBlock(
  blocks: NoteBlock[],
  id: string,
): NoteBlock | null {
  const flat = flatten(blocks);
  const index = flat.findIndex((block) => block.id === id);
  return index >= 0 && index < flat.length - 1 ? flat[index + 1] : null;
}

/* --------------------------------------------------------------- marks */

/**
 * Whether a selection already carries a mark.
 *
 * "Already" means every selected span has it. Toggling therefore adds to a mixed selection rather
 * than removing from half of it — bolding a partly-bold word should bold all of it.
 */
export function hasMark(spans: NoteSpan[], mark: NoteMark): boolean {
  if (spans.length === 0) return false;
  return spans.every((span) =>
    (span.marks ?? []).some((existing) => sameMark(existing, mark)),
  );
}

export function sameMark(a: NoteMark, b: NoteMark): boolean {
  if (a.type !== b.type) return false;
  if (a.type === "link" && b.type === "link") return a.href === b.href;
  return true;
}

/** Adds or removes a mark across a set of spans, merging neighbours afterwards. */
export function toggleMark(
  spans: NoteSpan[],
  mark: NoteMark,
): NoteSpan[] {
  const turnOn = !hasMark(spans, mark);
  return mergeSpans(
    spans.map((span) => {
      const marks = span.marks ?? [];
      const without = marks.filter((existing) => !sameMark(existing, mark));
      return {
        ...span,
        marks: turnOn ? [...without, mark] : without,
      };
    }),
  );
}

/**
 * Collapses adjacent spans that render identically.
 *
 * Without this every keystroke appends a span and a typed word becomes thirty DOM nodes. `marks`
 * is omitted entirely when empty so the common case — plain text — stores as plain text.
 */
export function mergeSpans(spans: NoteSpan[]): NoteSpan[] {
  const out: NoteSpan[] = [];
  for (const span of spans) {
    const previous = out[out.length - 1];
    const sameMarks = JSON.stringify(previous?.marks ?? []) ===
      JSON.stringify(span.marks ?? []);
    if (previous && sameMarks) {
      previous.text += span.text;
    } else {
      out.push(
        span.marks && span.marks.length > 0
          ? { text: span.text, marks: [...span.marks] }
          : { text: span.text },
      );
    }
  }
  return out;
}

/** Applies a mark to a character range within a block's spans. */
export function applyMarkToRange(
  spans: NoteSpan[],
  from: number,
  to: number,
  mark: NoteMark | null,
): NoteSpan[] {
  if (from === to) return spans;
  const start = Math.min(from, to);
  const end = Math.max(from, to);
  const out: NoteSpan[] = [];
  let offset = 0;

  for (const span of spans) {
    const spanStart = offset;
    const spanEnd = offset + span.text.length;
    offset = spanEnd;

    // No overlap: the span passes through untouched.
    if (spanEnd <= start || spanStart >= end) {
      out.push(span);
      continue;
    }

    const localStart = Math.max(0, start - spanStart);
    const localEnd = Math.min(span.text.length, end - spanStart);
    const before = span.text.slice(0, localStart);
    const middle = span.text.slice(localStart, localEnd);
    const after = span.text.slice(localEnd);

    const marks = (span.marks ?? []).filter(
      (existing) => !mark || !sameMark(existing, mark),
    );
    const nextMarks = mark
      ? [...marks, mark]
      : marks;

    if (before) out.push({ text: before, ...marksOf(span, marks) });
    if (middle) {
      out.push({
        text: middle,
        ...(nextMarks.length > 0 ? { marks: nextMarks } : {}),
      });
    }
    if (after) out.push({ text: after, ...marksOf(span, marks) });
  }

  return mergeSpans(out);
}

function marksOf(span: NoteSpan, marks: NoteMark[]): { marks?: NoteMark[] } {
  // Splice the given marks into the span's own, dropping duplicates.
  const merged = (span.marks ?? []).filter(
    (existing) => !marks.some((next) => sameMark(existing, next)),
  );
  const all = [...merged, ...marks];
  return all.length > 0 ? { marks: all } : {};
}

/** Which marks apply across a selection, for deciding what the toolbar shows as active. */
export function marksInRange(
  spans: NoteSpan[],
  from: number,
  to: number,
): NoteMark[] {
  if (from === to) return [];
  const start = Math.min(from, to);
  const end = Math.max(from, to);
  const collected = new Map<string, NoteMark>();
  let offset = 0;
  for (const span of spans) {
    const spanStart = offset;
    const spanEnd = offset + span.text.length;
    offset = spanEnd;
    if (spanEnd <= start || spanStart >= end) continue;
    for (const mark of span.marks ?? []) {
      collected.set(JSON.stringify(mark), mark);
    }
  }
  return [...collected.values()];
}

/** The plain text of a block, for measuring and for the sidebar label. */
export function blockText(block: NoteBlock): string {
  return (block.spans ?? []).map((span) => span.text).join("");
}
