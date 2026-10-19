import { useCallback, useEffect, useRef } from "react";
import type { NoteMark, NoteSpan } from "@/lib/companies/notes";
import {
  applyMarkToRange,
  blockText,
  marksInRange,
  mergeSpans,
  toggleMark,
} from "@/lib/companies/use-note-blocks";

/**
 * Inline text editing for one block.
 *
 * A `contentEditable` div rather than a `textarea`. That choice is what makes bold, links and code
 * spans possible at all: a textarea holds one flat string, and re-implementing a rich-text caret
 * inside it is the thing people usually get wrong. The cost is that the DOM is the source of truth
 * while you type, so every edit is written back to the block model synchronously and the element is
 * only re-rendered when the block identity changes (`key` on the parent).
 *
 * The browser owns the caret, which is the whole reason this works: selection, IME, spellcheck,
 * undo-by-OS and drag-to-select all keep working because nothing is re-implemented.
 */
export function InlineEditable({
  blockId,
  disabled,
  onChange,
  onFocus,
  onKeyDown,
  onPasteText,
  onSlashInput,
  placeholder,
  spans,
  tag,
}: {
  blockId: string;
  disabled?: boolean;
  onChange: (spans: NoteSpan[], caretOffset: number) => void;
  onFocus?: () => void;
  onKeyDown?: (event: React.KeyboardEvent<HTMLDivElement>) => void;
  /** Paste handler that receives plain text — used for the image path. */
  onPasteText?: (text: string, file: File | null) => void;
  /** Called after every character, so the slash menu can follow what is being typed. */
  onSlashInput?: (element: HTMLElement) => void;
  placeholder?: string;
  spans: NoteSpan[];
  /** The element to render. `div` for a block, `span` for a table cell. */
  tag?: "div" | "span";
}) {
  const ref = useRef<HTMLDivElement>(null);
  const spansRef = useRef(spans);
  spansRef.current = spans;

  /** Writes the current DOM state back as spans, without losing where the caret is. */
  const sync = useCallback(() => {
    const element = ref.current;
    if (!element) return;
    const caret = caretOffsetOf(element);
    const next = spansFromDom(element);
    onChange(next, caret);
  }, [onChange]);

  /*
   * The DOM is re-synced from the model only when the model changed from outside.
   *
   * Typing is excluded, and that exclusion is the whole reason this component works. Every
   * keystroke produces new spans through `onChange`, so a naive `element.innerHTML = spansToHtml(spans)`
   * in this effect would run after each character, move the caret to the start, and drop whatever
   * the browser had already merged into its own DOM. The last committed value is remembered so an
   * edit made anywhere else — undo, drag-and-drop, another tab — still lands.
   *
   * `null` and not `spans`: seeded with `spans` it equalled the prop by reference on the very first
   * render, the guard below returned, and the text was never written into the element at all. Every
   * block came up as an empty `contentEditable` showing only its `aria-label` placeholder — "Überschrift 1",
   * "Zitat", "Schreib etwas …" — which is a document of block *types* with none of its text. The
   * `null` seed means the first pass always paints, and from then on the identity check does its job.
   */
  const committed = useRef<NoteSpan[] | null>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    if (committed.current === spans) return;
    committed.current = spans;
    const model = spansToHtml(spans);
    if (element.innerHTML !== model) {
      /*
       * Write even while focused, but put the caret back first.
       *
       * A focused `contentEditable` is the one case that must still be rewritten: pressing Enter
       * splits the block, and the head keeps a different set of spans than the DOM currently shows.
       * Skipping the write because the element has focus left the old text in place, and the next
       * `sync()` read it straight back — so the split silently undid itself.
       */
      const offset = caretOffsetOf(element);
      element.innerHTML = model;
      if (document.activeElement === element) setCaretOffset(element, offset);
    }
  }, [spans]);

  const handleInput = useCallback(() => {
    sync();
    // The slash menu follows the text, so it has to see the DOM after the edit, not before it.
    if (onSlashInput && ref.current) onSlashInput(ref.current);
  }, [sync, onSlashInput]);

  const handlePaste = useCallback(
    (event: React.ClipboardEvent<HTMLDivElement>) => {
      const plain = event.clipboardData.getData("text/plain");
      const files = event.clipboardData.files;
      event.preventDefault();
      if (onPasteText) {
        onPasteText(plain, files?.[0] ?? null);
        return;
      }
      // Paste as plain text: pasting styled HTML from a website would bring foreign styles with it.
      insertTextAtCaret(event.currentTarget, plain);
      sync();
    },
    [onPasteText, sync],
  );

  const Tag = (tag ?? "div") as "div";

  /*
   * The ref is the whole mechanism: every edit path reads the element through it to turn DOM back
   * into spans and to place the caret. Without it `sync()` silently returns and nothing is ever
   * saved — the block looks editable and accepts keystrokes that go nowhere.
   */
  return (
    <Tag
      aria-label={placeholder}
      className={
        placeholder
          ? "min-h-[1.7em] outline-none empty:before:pointer-events-none empty:before:text-neutral-400 empty:before:content-[attr(aria-label)]"
          : "min-h-[1.7em] outline-none"
      }
      contentEditable={!disabled}
      data-block={blockId}
      onBlur={sync}
      onFocus={onFocus}
      onInput={handleInput}
      onKeyDown={onKeyDown}
      onPaste={handlePaste}
      ref={ref}
      role="textbox"
      suppressContentEditableWarning
    />
  );
}

/* --------------------------------------------------------------- DOM <-> spans */

function spansToHtml(spans: NoteSpan[]): string {
  if (spans.length === 0 || spans.every((s) => s.text.length === 0)) return "";
  return spans
    .map((span) => {
      const text = escapeHtml(span.text).replace(/\n/g, "<br>");
      if (!span.marks || span.marks.length === 0) return text;
      // Applied inside-out so a link wraps bold the way it reads.
      return span.marks
        .reduce<string>(
          (html, mark) => wrapMark(html, mark),
          text,
        );
    })
    .join("");
}

function wrapMark(html: string, mark: NoteMark): string {
  switch (mark.type) {
    case "bold":
      return `<strong>${html}</strong>`;
    case "italic":
      return `<em>${html}</em>`;
    case "underline":
      return `<u>${html}</u>`;
    case "strike":
      return `<s>${html}</s>`;
    case "code":
      return `<code>${html}</code>`;
    case "link":
      return `<a href="${escapeHtml(mark.href)}">${html}</a>`;
    case "wikilink":
      /*
       * `href="#note-"` rather than a real URL: the editor handles the click itself, and a scheme
       * the browser would try to follow would either reload the page or open a new tab. The id is
       * in the fragment, which is also how the click handler finds its way back to the store.
       */
      return `<a data-wikilink="${escapeHtml(mark.noteId)}" href="#note-${escapeHtml(mark.noteId)}">${html}</a>`;
    case "color":
      // The colour is read back through `marksOfElement` by inspecting the inline style, so a
      // round-trip through the DOM does not lose the value.
      return `<span style="color:${escapeHtml(mark.value)}">${html}</span>`;
    case "bg":
      return `<span style="background-color:${escapeHtml(mark.value)}">${html}</span>`;
  }
}

/**
 * Reads the DOM back into spans.
 *
 * Walks text nodes rather than `innerHTML` because the browser freely renests the markup: typing
 * inside a `<strong>` that already had a `<strong>` inside it produces whatever nesting it likes,
 * and only the flattened text order is meaningful.
 */
export function spansFromDom(root: HTMLElement): NoteSpan[] {
  const spans: NoteSpan[] = [];
  const walk = (node: Node, marks: NoteMark[]) => {
    if (node.nodeType === Node.TEXT_NODE) {
      if (node.textContent) {
        spans.push({ text: node.textContent, ...(marks.length > 0 ? { marks: [...marks] } : {}) });
      }
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const element = node as HTMLElement;
    if (element.tagName === "BR") {
      spans.push({ text: "\n", ...(marks.length > 0 ? { marks: [...marks] } : {}) });
      return;
    }
    const next = [...marks, ...marksOfElement(element)];
    for (const child of Array.from(element.childNodes)) {
      walk(child, next);
    }
  };
  walk(root, []);
  return mergeSpans(spans);
}

function marksOfElement(element: HTMLElement): NoteMark[] {
  const marks: NoteMark[] = [];
  switch (element.tagName) {
    case "STRONG":
    case "B":
      marks.push({ type: "bold" });
      break;
    case "EM":
    case "I":
      marks.push({ type: "italic" });
      break;
    case "U":
      marks.push({ type: "underline" });
      break;
    case "S":
    case "STRIKE":
    case "DEL":
      marks.push({ type: "strike" });
      break;
    case "CODE":
      marks.push({ type: "code" });
      break;
    case "SPAN": {
      /*
       * Colour and background are read back from inline styles. The wrap order is the same
       * one the writer used (color before bg), so a single span with both reads two marks
       * in the same order. Two separate spans would also work — the merge step joins them
       * anyway — but a single-element wrap keeps the DOM lean.
       */
      const color = element.style.color;
      const bg = element.style.backgroundColor;
      if (color) marks.push({ type: "color", value: color });
      if (bg) marks.push({ type: "bg", value: bg });
      break;
    }
    case "A": {
      const href = element.getAttribute("href");
      if (!href) break;
      /*
       * A wikilink is identified by its own attribute, not by the `#note-` prefix. Reading it back
       * from the href would mean re-parsing a value the DOM layer only invented for the browser.
       */
      const wikilink = element.getAttribute("data-wikilink");
      if (wikilink) {
        marks.push({ type: "wikilink", noteId: wikilink });
        break;
      }
      marks.push({ type: "link", href });
      break;
    }
  }
  return marks;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/* --------------------------------------------------------------- caret */

/**
 * Character offset of the caret inside an element, walking its text nodes.
 *
 * Returns the length of the element's text when the selection is not inside it — which is the case
 * whenever the element is not focused, and also when an event is dispatched programmatically. For
 * every caller here, "no caret to be found" means "the caret belongs after the content", so that is
 * the right answer rather than an offset of 0 that would split every line at its first character.
 */
export function caretOffsetOf(element: HTMLElement): number {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return element.textContent?.length ?? 0;
  const range = selection.getRangeAt(0);
  // A selection outside the element cannot be turned into an offset relative to it.
  if (!element.contains(range.endContainer)) return element.textContent?.length ?? 0;
  const before = range.cloneRange();
  before.selectNodeContents(element);
  before.setEnd(range.endContainer, range.endOffset);
  return before.toString().length;
}

/** Puts the caret at a character offset, creating the text node if the element is empty. */
export function setCaretOffset(element: HTMLElement, offset: number): void {
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  let remaining = offset;
  let node = walker.nextNode();
  let last: Node | null = null;

  while (node) {
    const length = node.textContent?.length ?? 0;
    last = node;
    if (remaining <= length) {
      const range = document.createRange();
      range.setStart(node, remaining);
      range.collapse(true);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      return;
    }
    remaining -= length;
    node = walker.nextNode();
  }

  // Past the end — put it after the last text node, which is where an empty block wants it.
  if (last) {
    const range = document.createRange();
    range.setStart(last, last.textContent?.length ?? 0);
    range.collapse(true);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  }
}

export function focusBlock(blockId: string, caretOffset?: number): void {
  const element = document.querySelector<HTMLElement>(
    `[data-block="${blockId}"]`,
  );
  if (!element) return;
  element.focus();
  if (typeof caretOffset === "number") {
    setCaretOffset(element, caretOffset);
  } else {
    const range = document.createRange();
    range.selectNodeContents(element);
    range.collapse(false);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  }
}

function insertTextAtCaret(element: HTMLElement, text: string): void {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) {
    element.textContent = text;
    return;
  }
  const range = selection.getRangeAt(0);
  range.deleteContents();
  const node = document.createTextNode(text);
  range.insertNode(node);
  range.setStartAfter(node);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
}

/**
 * Applies a mark to the browser selection.
 *
 * `execCommand` is deprecated but it is still the only API that can mark a live selection inside a
 * `contentEditable` — the alternative is re-implementing selection and caret preservation by hand,
 * which is a large amount of code to get subtly wrong. It is used only for the browser's own
 * editing commands, never for anything security relevant.
 */
export function applyMarkToSelection(
  element: HTMLElement,
  mark: NoteMark,
): boolean {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed) return false;

  // `code` and `link` have no browser command — they are applied through the model instead, so the
  // caller falls back to re-rendering the block with the mark on the right spans.
  switch (mark.type) {
    case "bold":
      return document.execCommand("bold");
    case "italic":
      return document.execCommand("italic");
    case "underline":
      return document.execCommand("underline");
    case "strike":
      return document.execCommand("strikeThrough");
    default:
      return false;
  }
}

export { blockText, applyMarkToRange, marksInRange, toggleMark };