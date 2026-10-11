/**
 * Markdown in both directions for note blocks.
 *
 * This is the one place that knows the block shape, which is what makes it possible to export a
 * note that survives being pasted into another tool and to import one without losing structure. It
 * is deliberately hand-written rather than pulled from a library: the block model is ours, the
 * Markdown dialect is a small subset, and a round-trip test is cheaper to reason about than the
 * lossy edges of a general parser.
 *
 * The subset covers what the editor can produce: headings, both list kinds, todos, quotes,
 * callouts, fenced code, dividers, images, tables, and the inline marks including wikilinks.
 */

import type { Note, NoteBlock, NoteMark, NoteSpan } from "./notes";
import { noteLabel } from "./notes";

/* ------------------------------------------------------------------ inline */

/** Applies one mark to a piece of text, choosing the syntax that survives a Markdown reader. */
function applyMark(text: string, mark: NoteMark): string {
  if (!text) return "";
  switch (mark.type) {
    case "bold":
      return `**${text}**`;
    case "italic":
      return `*${text}*`;
    case "underline":
      // Not core Markdown. HTML is what GitHub and Obsidian both render, so it round-trips.
      return `<u>${text}</u>`;
    case "strike":
      return `~~${text}~~`;
    case "code":
      // A backtick inside code needs a longer fence, or the code ends at the first one.
      return `\`${text.replace(/`/g, "`")}\``;
    case "link":
      return `[${text}](${mark.href})`;
    case "wikilink":
      // The target id lives on the mark, but Markdown only carries the title. Writing the id here
      // would make an exported note unreadable, so the id is restored by `resolve` on import.
      return `[[${text}]]`;
  }
}

/**
 * Order matters: code goes innermost, link outside it.
 *
 * If the link were applied first its label would contain backticks and the code pass would then
 * wrap those backticks in further backticks, which renders as literal backticks rather than code.
 */
function renderSpans(spans: NoteSpan[]): string {
  return spans
    .map((span) => {
      let text = escapeMarkdown(span.text);
      const marks = span.marks ?? [];
      if (marks.some((m) => m.type === "code")) {
        text = applyMark(text, { type: "code" });
      }
      for (const mark of marks) {
        if (mark.type === "code") continue;
        text = applyMark(text, mark);
      }
      return text;
    })
    .join("");
}

/**
 * Escapes only what would otherwise be read as syntax.
 *
 * Deliberately not `_` or `*`: a note full of `snake_case` identifiers would come back with
 * backslashes all over it if those were escaped, and they are far more common than a literal
 * asterisk in prose.
 */
function escapeMarkdown(text: string): string {
  return text.replace(/([\\`[\]<>])/g, "\\$1");
}

/**
 * Maps a note title to its id, so an imported `[[Project Helium]]` becomes a real link.
 *
 * Optional on purpose: this parser also runs for notes that have never been linked, and a title
 * that matches nothing still has to survive as visible text rather than vanish. A miss therefore
 * yields no mark, and `[[Name]]` stays exactly as typed so the typo can be spotted and fixed.
 */
export type WikilinkResolver = (title: string) => string | undefined;

/** Splits `[[Title|Alias]]` into its parts. Obsidian writes the display text after a pipe. */
function parseWikilink(token: string): { title: string; alias: string } | null {
  const inner = /^\[\[([^\]]+)\]\]$/.exec(token);
  if (!inner) return null;
  const [title, alias] = inner[1].split("|").map((part) => part.trim());
  if (!title) return null;
  return { title, alias: alias || title };
}

/** One `[[...]]` token as a span, carrying the mark only when the target actually exists. */
function wikilinkSpan(token: string, resolve?: WikilinkResolver): NoteSpan {
  const parsed = parseWikilink(token);
  if (!parsed) return { text: token };
  const noteId = resolve?.(parsed.title);
  return {
    text: parsed.alias,
    ...(noteId ? { marks: [{ type: "wikilink", noteId }] } : {}),
  };
}

/** Splits `**bold**` into marked spans. Used when importing Markdown. */
function parseInline(text: string, resolve?: WikilinkResolver): NoteSpan[] {
  const spans: NoteSpan[] = [];
  /*
   * A single regex pass over every inline construct, rather than nesting one parse inside another,
   * so `**bold with *italic* inside**` does not need recursion to get right.
   *
   * The wikilink branch is tried before the Markdown link branch, and the link branch's label
   * excludes a bare `[` — otherwise `[text](url)` and `[[Wiki]]` would be ambiguous and a wiki
   * link written right after a link would be swallowed.
   */
  const pattern =
    /(`[^`]+`)|(\*\*[^*]+\*\*)|(__[^_]+__)|(\*[^*]+\*)|(~~[^~]+~~)|(<u>[^<]+<\/u>)|(\[\[[^\]]+\]\])|(\[(?:[^\][]|\[[^\]]*\])+\]\([^)]+\))/g;

  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) {
      spans.push({ text: unescapeMarkdown(text.slice(last, match.index)) });
    }
    if (match[0].startsWith("[[")) {
      spans.push(wikilinkSpan(match[0], resolve));
    } else {
      spans.push({ text: match[0], marks: marksFor(match[0]) });
    }
    last = match.index + match[0].length;
  }
  if (last < text.length) {
    spans.push({ text: unescapeMarkdown(text.slice(last)) });
  }
  return spans.length > 0 ? spans : [{ text: "" }];
}

function marksFor(token: string): NoteMark[] {
  if (token.startsWith("`")) return [{ type: "code" }];
  if (token.startsWith("**") || token.startsWith("__"))
    return [{ type: "bold" }];
  if (token.startsWith("<u>")) return [{ type: "underline" }];
  if (token.startsWith("~~")) return [{ type: "strike" }];
  if (token.startsWith("[")) {
    const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(token);
    return [{ type: "link", href: link?.[2] ?? "" }];
  }
  return [{ type: "italic" }];
}

function unescapeMarkdown(text: string): string {
  return text.replace(/\\([\\`[\]<>])/g, "$1");
}

/* ------------------------------------------------------------------ blocks */

const INDENT = "  ";

function indentOf(block: NoteBlock): string {
  return INDENT.repeat(Math.max(0, block.indent ?? 0));
}

function isPlainText(block: NoteBlock): boolean {
  return (block.spans ?? []).every(
    (span) =>
      (span.marks ?? []).length === 0 ||
      (span.marks ?? []).every(
        (m) => m.type === "code" || m.type === "link" || m.type === "wikilink",
      ),
  );
}

/**
 * One block to Markdown.
 *
 * Multi-line text becomes a lazy continuation or, inside a list, a new bullet — a single newline is
 * what a Markdown reader expects there, and using `\n\n` would split one paragraph into two.
 */
function renderBlock(block: NoteBlock, out: string[]): void {
  const pad = indentOf(block);
  const text = renderSpans(block.spans ?? []);

  switch (block.type) {
    case "heading1":
      out.push(`${pad}# ${text}`);
      break;
    case "heading2":
      out.push(`${pad}## ${text}`);
      break;
    case "heading3":
      out.push(`${pad}### ${text}`);
      break;
    case "bullet":
      out.push(`${pad}- ${text}`);
      break;
    case "number":
      out.push(`${pad}1. ${text}`);
      break;
    case "todo":
      out.push(`${pad}- [${block.checked ? "x" : " "}] ${text}`);
      break;
    case "quote":
      out.push(`${pad}> ${text}`);
      break;
    case "callout":
      out.push(`${pad}> ${block.emoji ?? "\u{1F4A1}"} ${text}`);
      break;
    case "code":
      out.push(`${pad}\`\`\`${block.language ?? ""}`);
      out.push(block.spans?.[0]?.text ?? "");
      out.push(`${pad}\`\`\``);
      break;
    case "divider":
      out.push(`${pad}---`);
      break;
    case "image":
      out.push(`${pad}![${block.caption ?? ""}](${block.url ?? ""})`);
      break;
    case "toggle":
      out.push(`${pad}- ${text}`);
      break;
    case "table": {
      const rows = block.table?.rows ?? [];
      if (rows.length === 0) break;
      const width = Math.max(...rows.map((row) => row.length));
      const cells = (row: string[]) =>
        [...row, ...Array(width - row.length).fill("")].map((cell) =>
          String(cell).replace(/\|/g, "\\|").replace(/\n/g, " "),
        );
      out.push(`${pad}| ${cells(rows[0]).join(" | ")} |`);
      // GFM needs a delimiter row; without it the header row is read as ordinary data.
      out.push(`${pad}| ${Array(width).fill("---").join(" | ")} |`);
      for (const row of rows.slice(1)) {
        out.push(`${pad}| ${cells(row).join(" | ")} |`);
      }
      break;
    }
    case "paragraph":
      out.push(text.length > 0 ? `${pad}${text}` : "");
      break;
  }

  // Toggle children live in the block, so they are written as an indented list underneath it.
  for (const child of block.children ?? []) {
    renderBlock(child, out);
  }
}

export function blocksToMarkdown(blocks: NoteBlock[]): string {
  const out: string[] = [];
  for (const block of blocks) {
    // A blank paragraph is an empty line, and a list must not be split by one.
    if (block.type === "paragraph" && isPlainText(block) && !block.spans?.length) {
      continue;
    }
    renderBlock(block, out);
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

export function plainTextOf(blocks: NoteBlock[]): string {
  return blocks
    .map((block) => (block.spans ?? []).map((s) => s.text).join(""))
    .filter((line) => line.length > 0)
    .join("\n");
}

/** Every note id a block tree links to, walking toggle children as well. */
export function linkedNoteIds(blocks: NoteBlock[]): Set<string> {
  const ids = new Set<string>();
  const walk = (list: NoteBlock[]) => {
    for (const block of list) {
      for (const span of block.spans ?? []) {
        for (const mark of span.marks ?? []) {
          if (mark.type === "wikilink") ids.add(mark.noteId);
        }
      }
      if (block.children?.length) walk(block.children);
    }
  };
  walk(blocks);
  return ids;
}

/**
 * Builds the resolver that turns a pasted `[[Title]]` into a live link.
 *
 * Lives here rather than in the panel because it needs `noteLabel`, which is the same rule the
 * sidebar uses to name a note — a resolver that disagreed with it would resolve a title the user
 * can see in the sidebar but not here.
 */
export function wikilinkResolver(notes: Note[]): WikilinkResolver {
  return (title: string) => {
    const wanted = title.trim().toLowerCase();
    if (!wanted) return undefined;
    const match = notes.find((note) => noteLabel(note).toLowerCase() === wanted);
    return match?.id;
  };
}

/** Notes that link to `targetId`, found by walking every note's block tree. */
export function backlinksFor(
  notes: Note[],
  targetId: string,
  blocksOf: (note: Note) => NoteBlock[],
): Note[] {
  return notes.filter(
    (note) => note.id !== targetId && linkedNoteIds(blocksOf(note)).has(targetId),
  );
}

/* ------------------------------------------------------------------ import */

let sequence = 0;

/** Ids only have to be unique inside one note, and stable across a save/load round trip. */
function blockId(): string {
  sequence += 1;
  return `b-${Date.now().toString(36)}-${sequence.toString(36)}`;
}

/**
 * Markdown to blocks.
 *
 * Covers what the editor writes. Anything it does not recognise becomes a paragraph, which is the
 * right failure: the text survives, only the formatting is lost, and the user can see that and fix
 * it. Silently dropping a line would be worse.
 */
export function markdownToBlocks(
  markdown: string,
  resolve?: WikilinkResolver,
): NoteBlock[] {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const blocks: NoteBlock[] = [];
  /** Stack of open lists, so `indent` comes from the leading spaces. */
  let listDepth = 0;
  const indentStack: number[] = [0];

  const flushCode = (language: string, body: string[]) => {
    blocks.push({
      id: blockId(),
      type: "code",
      language: language || undefined,
      spans: [{ text: body.join("\n") }],
    });
  };

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed.startsWith("```")) {
      const language = trimmed.slice(3).trim();
      const body: string[] = [];
      i += 1;
      while (i < lines.length && !lines[i].trim().startsWith("```")) {
        body.push(lines[i]);
        i += 1;
      }
      flushCode(language, body);
      continue;
    }

    if (trimmed.length === 0) {
      listDepth = 0;
      indentStack.length = 1;
      indentStack[0] = 0;
      continue;
    }

    if (trimmed === "---" || trimmed === "***" || trimmed === "___") {
      blocks.push({ id: blockId(), type: "divider", spans: [] });
      continue;
    }

    const heading = /^(#{1,3})\s+(.*)$/.exec(trimmed);
    if (heading) {
      const level = heading[1].length;
      blocks.push({
        id: blockId(),
        type: level === 1 ? "heading1" : level === 2 ? "heading2" : "heading3",
        spans: parseInline(heading[2], resolve),
      });
      continue;
    }

    // A table is a row starting with a pipe, and needs a delimiter row under the first one.
    if (trimmed.startsWith("|") && lines[i + 1]?.trim().match(/^\|[\s:|-]+\|$/)) {
      const rows: string[][] = [];
      const readRow = (value: string) =>
        value
          .trim()
          .replace(/^\|/, "")
          .replace(/\|$/, "")
          .split("|")
          .map((cell) => cell.trim().replace(/\\\|/g, "|"));
      rows.push(readRow(trimmed));
      i += 2;
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        rows.push(readRow(lines[i]));
        i += 1;
      }
      i -= 1;
      const width = Math.max(...rows.map((row) => row.length));
      blocks.push({
        id: blockId(),
        type: "table",
        spans: [],
        table: {
          rows: rows.map((row) => [
            ...row,
            ...Array(width - row.length).fill(""),
          ]),
          headerRow: true,
        },
      });
      continue;
    }

    const todo = /^([-*])\s+\[([ xX])\]\s+(.*)$/.exec(trimmed);
    if (todo) {
      blocks.push({
        id: blockId(),
        type: "todo",
        checked: todo[2].toLowerCase() === "x",
        spans: parseInline(todo[3], resolve),
      });
      continue;
    }

    const quote = /^>\s?(.*)$/.exec(trimmed);
    if (quote) {
      const body = quote[1];
      // `> 💡 text` came from a callout on the way out, so it comes back as one.
      const callout =
        /^(\p{Extended_Pictographic}|\p{Emoji_Presentation})\s?(.*)$/u.exec(
          body,
        );
      if (callout) {
        blocks.push({
          id: blockId(),
          type: "callout",
          emoji: callout[1],
          spans: parseInline(callout[2], resolve),
        });
      } else {
        blocks.push({
          id: blockId(),
          type: "quote",
          spans: parseInline(body, resolve),
        });
      }
      continue;
    }

    const image = /^!\[([^\]]*)\]\(([^)]+)\)$/.exec(trimmed);
    if (image) {
      blocks.push({
        id: blockId(),
        type: "image",
        url: image[2],
        caption: image[1] || undefined,
        spans: [],
      });
      continue;
    }

    const bullet = /^([-*+])\s+(.*)$/.exec(trimmed);
    if (bullet) {
      const indent = line.length - line.trimStart().length;
      listDepth = updateDepth(indentStack, indent);
      blocks.push({
        id: blockId(),
        type: "bullet",
        indent: listDepth,
        spans: parseInline(bullet[2], resolve),
      });
      continue;
    }

    const numbered = /^\d+[.)]\s+(.*)$/.exec(trimmed);
    if (numbered) {
      const indent = line.length - line.trimStart().length;
      listDepth = updateDepth(indentStack, indent);
      blocks.push({
        id: blockId(),
        type: "number",
        indent: listDepth,
        spans: parseInline(numbered[1], resolve),
      });
      continue;
    }

    blocks.push({
      id: blockId(),
      type: "paragraph",
      indent: listDepth > 0 ? listDepth : undefined,
      spans: parseInline(trimmed, resolve),
    });
  }

  return blocks;
}

/**
 * Nesting level for a list line, by its indentation.
 *
 * A `2`-space step is what the exporter writes, but pasted Markdown uses 4, so anything wider than
 * the current level counts as exactly one level deeper. That keeps `deeply nested` pasted lists
 * from becoming six levels of indentation in the editor.
 */
function updateDepth(stack: number[], indent: number): number {
  const top = stack[stack.length - 1];
  if (indent > top) {
    stack.push(indent);
    return stack.length - 1;
  }
  while (stack.length > 1 && indent < stack[stack.length - 1]) {
    stack.pop();
  }
  return stack.length - 1;
}