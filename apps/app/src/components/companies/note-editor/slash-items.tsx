import {
  IconBlockquote,
  IconCheck,
  IconChevronDown,
  IconCode,
  IconH1,
  IconH2,
  IconH3,
  IconList,
  IconListNumbers,
  IconMath,
  IconPhoto,
  IconTable,
  IconToggleLeft,
  IconVariable,
} from "@tabler/icons-react";
import { useEffect, useState } from "react";
import type { NoteBlockType } from "@/lib/companies/notes";

export type SlashItem = {
  id: string;
  /** What you type after `/` to reach it. */
  keywords: string[];
  label: string;
  hint?: string;
  group: string;
  icon: React.ReactNode;
  type?: NoteBlockType;
  /** Language for a code block, when the entry creates one. */
  language?: string;
};

/**
 * Everything the slash menu can insert.
 *
 * The keyword list is what Notion calls the command names — `/table`, `/todo`, `/h1` — and having
 * them is most of the value: `/t` then picking from two entries is faster than hunting through a
 * flat list of forty.
 */
export const SLASH_ITEMS: SlashItem[] = [
  { id: "text", keywords: ["text", "plain", "p"], label: "Text", group: "Basis", icon: <IconVariable className="size-4" stroke={1.5} />, type: "paragraph" },
  { id: "h1", keywords: ["h1", "heading1", "überschrift1"], label: "Überschrift 1", group: "Basis", icon: <IconH1 className="size-4" stroke={1.5} />, type: "heading1" },
  { id: "h2", keywords: ["h2", "heading2", "überschrift2"], label: "Überschrift 2", group: "Basis", icon: <IconH2 className="size-4" stroke={1.5} />, type: "heading2" },
  { id: "h3", keywords: ["h3", "heading3", "überschrift3"], label: "Überschrift 3", group: "Basis", icon: <IconH3 className="size-4" stroke={1.5} />, type: "heading3" },
  { id: "todo", keywords: ["todo", "task", "checkbox", "aufgabe"], label: "To-do-Liste", hint: "[]", group: "Liste", icon: <IconCheck className="size-4" stroke={1.5} />, type: "todo" },
  { id: "bullet", keywords: ["bullet", "ul", "liste", "punkt"], label: "Aufzählung", hint: "-", group: "Liste", icon: <IconList className="size-4" stroke={1.5} />, type: "bullet" },
  { id: "number", keywords: ["number", "ol", "nummeriert"], label: "Nummerierte Liste", hint: "1.", group: "Liste", icon: <IconListNumbers className="size-4" stroke={1.5} />, type: "number" },
  { id: "toggle", keywords: ["toggle", "klappbar"], label: "Toggle-Liste", hint: ">", group: "Liste", icon: <IconToggleLeft className="size-4" stroke={1.5} />, type: "toggle" },
  { id: "quote", keywords: ["quote", "zitat"], label: "Zitat", hint: '"', group: "Basis", icon: <IconBlockquote className="size-4" stroke={1.5} />, type: "quote" },
  { id: "callout", keywords: ["callout", "hinweis"], label: "Callout", group: "Medien", icon: <span className="text-[13px]">💡</span>, type: "callout" },
  { id: "divider", keywords: ["divider", "trenner", "linie"], label: "Trennlinie", hint: "---", group: "Basis", icon: <IconMath className="size-4" stroke={1.5} />, type: "divider" },
  { id: "code", keywords: ["code", "codeblock"], label: "Codeblock", group: "Medien", icon: <IconCode className="size-4" stroke={1.5} />, type: "code" },
  /*
   * "tabellen" alongside "tabelle": the slash filter is a substring match, so both
   * work either way, but the plural is what somebody types when they are reaching
   * for the thing rather than looking it up.
   */
  { id: "table", keywords: ["table", "tabelle", "tabellen"], label: "Tabelle", group: "Fortgeschritten", icon: <IconTable className="size-4" stroke={1.5} />, type: "table" },
  { id: "image", keywords: ["image", "bild", "foto"], label: "Bild", hint: "Einfügen oder ziehen", group: "Medien", icon: <IconPhoto className="size-4" stroke={1.5} />, type: "image" },
];

/** Markdown triggers, exactly the characters Notion uses. */
export const MARKDOWN_TRIGGERS: Array<{
  pattern: RegExp;
  type: NoteBlockType;
  /** Emoji for a callout, when the trigger creates one. */
  emoji?: string;
}> = [
  { pattern: /^#$/, type: "heading1" },
  { pattern: /^##$/, type: "heading2" },
  { pattern: /^###$/, type: "heading3" },
  { pattern: /^\[\]$/, type: "todo" },
  { pattern: /^[-*+]$/, type: "bullet" },
  { pattern: /^\d+[.)]$/, type: "number" },
  { pattern: /^>$/, type: "toggle" },
  { pattern: /^"$/, type: "quote" },
  { pattern: /^---$/, type: "divider" },
  { pattern: /^```$/, type: "code" },
];

/**
 * Filters the menu as you type.
 *
 * Matches the start of any keyword, so `/tab` finds "Tabelle" and `/ka` finds "Kopfzeile". The label
 * is matched too, because that is what someone reads on screen.
 */
export function filterSlashItems(query: string): SlashItem[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return SLASH_ITEMS;
  return SLASH_ITEMS.filter(
    (item) =>
      item.keywords.some((keyword) => keyword.startsWith(needle)) ||
      item.label.toLowerCase().includes(needle),
  );
}

export function groupSlashItems(items: SlashItem[]): Array<[string, SlashItem[]]> {
  const groups = new Map<string, SlashItem[]>();
  for (const item of items) {
    const list = groups.get(item.group);
    if (list) list.push(item);
    else groups.set(item.group, [item]);
  }
  return [...groups.entries()];
}

/**
 * Tracks which item is highlighted.
 *
 * Arrow keys and Enter live here rather than in the menu component because the menu is rendered by
 * the parent, which needs the index to decide what inserting means.
 */
export function useSlashNav(count: number) {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    setIndex(0);
  }, [count]);

  const move = (delta: number) => {
    if (count === 0) return;
    setIndex((current) => {
      const next = current + delta;
      if (next < 0) return count - 1;
      if (next >= count) return 0;
      return next;
    });
  };

  return { index, setIndex, move };
}

/**
 * Where the menu should open.
 *
 * Anchored to the block the user typed in, but flipped upward when it would fall off the bottom of
 * the viewport — a menu that opens below the fold is a menu that cannot be used.
 */
export function useMenuPosition(open: boolean, anchorId: string | null) {
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    if (!open || !anchorId) {
      setPosition(null);
      return;
    }
    const anchor = document.querySelector<HTMLElement>(`[data-block="${anchorId}"]`);
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    const height = 320;
    const openUp = rect.bottom + height > window.innerHeight && rect.top > height;
    setPosition({
      top: openUp ? rect.top - 8 : rect.bottom + 8,
      left: Math.min(rect.left, window.innerWidth - 300),
    });
  }, [open, anchorId]);

  return position;
}

export { IconChevronDown };