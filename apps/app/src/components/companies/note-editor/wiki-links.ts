import type { NoteSpan } from "@/lib/companies/notes";

/**
 * Obsidian-style `[[` links.
 *
 * Typing `[[` opens a list of the other notes, picking one turns the typed text into a real link
 * and a click on a rendered link opens the target. Everything here is driven by the note list
 * rather than a separate index, so a note that was created a moment ago is linkable immediately.
 */

/** One note offered behind `[[`. `folderLabel` is optional and only used for a subtitle. */
export type WikiCandidate = {
  id: string;
  title: string;
  folderLabel?: string;
};

/** What `detectWikiQuery` found: where the `[[` starts and how much has been typed since. */
export type WikiPickerState = {
  /** Character offset of the opening `[[` within the block's flat text. */
  start: number;
  query: string;
};

/**
 * Detects an unfinished `[[` immediately before the caret.
 *
 * The opening brackets must not be escaped (`\[[`) and the query must not contain a newline, so a
 * paragraph that legitimately writes about brackets does not open a menu. Returns null when the
 * caret is not inside one, which is the common case and must stay cheap.
 */
export function detectWikiQuery(text: string, caret: number): WikiPickerState | null {
  if (caret < 2 || caret > text.length) return null;
  const before = text.slice(0, caret);
  const open = before.lastIndexOf("[[");
  if (open === -1) return null;
  // Anything between the brackets disqualifies it.
  const query = before.slice(open + 2);
  if (query.includes("]]") || query.includes("\n")) return null;
  // A `]` right after would have closed the link already.
  if (query.includes("[")) return null;
  // Escaped brackets are literal text.
  if (open > 0 && before[open - 1] === "\\") return null;
  return { start: open, query };
}

/** Ranked matches. Exact title first, then prefix, then substring — the order Obsidian uses. */
export function filterWikiCandidates(
  candidates: WikiCandidate[],
  query: string,
): WikiCandidate[] {
  const q = query.trim().toLowerCase();
  if (!q) return candidates.slice(0, 8);
  const exact: WikiCandidate[] = [];
  const prefix: WikiCandidate[] = [];
  const contains: WikiCandidate[] = [];
  for (const candidate of candidates) {
    const title = candidate.title.toLowerCase();
    if (title === q) exact.push(candidate);
    else if (title.startsWith(q)) prefix.push(candidate);
    else if (title.includes(q)) contains.push(candidate);
  }
  return [...exact, ...prefix, ...contains].slice(0, 8);
}

/**
 * Replaces the `[[query` with a linked span.
 *
 * The brackets go away and what is left is a span carrying the `wikilink` mark, which is what the
 * editor renders as a clickable link. Trailing text after the caret is preserved by returning only
 * the head; the caller re-inserts the rest.
 */
export function applyWikiLink(
  spans: NoteSpan[],
  start: number,
  length: number,
  title: string,
  noteId: string,
): { spans: NoteSpan[]; caret: number } {
  const head = textBefore(spans, start);
  const tail = textAfter(spans, start + length);
  const next: NoteSpan[] = [...head, { text: title, marks: [{ type: "wikilink", noteId }] }, ...tail];
  // The caret goes right after the inserted title, measured in the flat text of the result.
  const caret = textLength(head) + title.length;
  return { spans: next, caret };
}

function textLength(spans: NoteSpan[]): number {
  return spans.reduce((sum, span) => sum + span.text.length, 0);
}

/** The spans covering the first `count` characters, cut exactly at `count`. */
function textBefore(spans: NoteSpan[], count: number): NoteSpan[] {
  const out: NoteSpan[] = [];
  let seen = 0;
  for (const span of spans) {
    if (seen >= count) break;
    const take = Math.min(span.text.length, count - seen);
    if (take > 0) {
      out.push({ ...span, text: span.text.slice(0, take) });
      seen += take;
    }
  }
  return out;
}

/** The spans after the first `count` characters. */
function textAfter(spans: NoteSpan[], count: number): NoteSpan[] {
  const out: NoteSpan[] = [];
  let seen = 0;
  for (const span of spans) {
    const start = seen;
    seen += span.text.length;
    if (seen <= count) continue;
    const cut = Math.max(0, count - start);
    const text = span.text.slice(cut);
    if (text.length > 0) out.push({ ...span, text });
  }
  return out;
}

/** The flat text of a span list — the same string the caret offset is measured against. */
export function spansToText(spans: NoteSpan[]): string {
  return spans.map((span) => span.text).join("");
}