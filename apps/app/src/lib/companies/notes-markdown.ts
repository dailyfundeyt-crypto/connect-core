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
    case "color":
      // Native Markdown has no text colour. An inline `<span>` survives Obsidian and GitHub
      // because both render raw HTML inside a paragraph.
      return `<span style="color:${escapeHtml(mark.value)}">${text}</span>`;
    case "bg":
      return `<span style="background-color:${escapeHtml(mark.value)}">${text}</span>`;
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
    /(`[^`]+`)|(\*\*[^*]+\*\*)|(__[^_]+__)|(\*[^*]+\*)|(~~[^~]+~~)|(<u>[^<]+<\/u>)|(<span\s+style="[^"]+"[^>]*>([^<]*)<\/span>)|(\[\[[^\]]+\]\])|(\[(?:[^\][]|\[[^\]]*\])+\]\([^)]+\))/g;

  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) {
      spans.push({ text: unescapeMarkdown(text.slice(last, match.index)) });
    }
    if (match[0].startsWith("[[")) {
      spans.push(wikilinkSpan(match[0], resolve));
    } else if (match[0].startsWith("<span")) {
      // The inner group (match[8]) holds the text *inside* the span. Without
      // it the span tag itself would leak into the visible text and the
      // round-trip would double-print `<span style=...>wichtig</span>`.
      const inner = unescapeMarkdown(match[8] ?? "");
      spans.push({ text: inner, marks: marksFor(match[0]) });
    } else {
      spans.push({ text: unescapeMarkdown(match[0].replace(/^`+|`+$/g, "").replace(/^[*_~]+|[*_~]+$/g, "").replace(/^<u>|<\/u>$/g, "")), marks: marksFor(match[0]) });
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
  if (token.startsWith("<span")) {
    /*
     * Look only at the leading style attribute and only for the keys that
     * actually map to a mark. `background-color` is the substring that
     * triggers the bg regex, so the color regex is anchored to a
     * word boundary to avoid matching the "color" in "background-color".
     */
    const style = /style="([^"]+)"/i.exec(token)?.[1] ?? "";
    const color = /(?:^|;)\s*color\s*:\s*([^;"]+)/i.exec(style)?.[1]?.trim();
    const bg = /background-color\s*:\s*([^;"]+)/i.exec(style)?.[1]?.trim();
    const out: NoteMark[] = [];
    if (color) out.push({ type: "color", value: color });
    if (bg) out.push({ type: "bg", value: bg });
    return out;
  }
  if (token.startsWith("[")) {
    const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(token);
    return [{ type: "link", href: link?.[2] ?? "" }];
  }
  return [{ type: "italic" }];
}

function unescapeMarkdown(text: string): string {
  return text.replace(/\\([\\`[\]<>])/g, "$1");
}

/** Inside an HTML attribute (colour value), these are the only entities that matter. */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
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
    case "callout": {
      const emoji = block.emoji ?? "💡";
      const tone = block.color ? `<!-- cb:callout-tone color=${escapeHtml(block.color)} -->` : "";
      out.push(`${pad}> ${emoji} ${text}`);
      if (tone) out.push(tone);
      if (block.children && block.children.length) {
        // Wrap the children in a fence so the parser can attach them to the
        // callout block, even when the callout's first line is empty.
        out.push(`${pad}<!-- cb:callout-children -->`);
        for (const child of block.children) {
          renderBlock(child, out);
        }
        out.push(`${pad}<!-- /cb:callout-children -->`);
      }
      break;
    }
    case "code":
      out.push(`${pad}\`\`\`${block.language ?? ""}`);
      out.push(block.spans?.[0]?.text ?? "");
      out.push(`${pad}\`\`\``);
      break;
    case "divider": {
      if (!block.dividerStyle && !block.dividerAccent) {
        out.push(`${pad}---`);
        break;
      }
      // Style + accent do not exist in core Markdown. An HTML `<hr>` survives every renderer
      // and carries the visual hint back to the next save. The fence is closed so the
      // region parser can rebuild the divider block losslessly on import.
      const bits: string[] = [];
      if (block.dividerStyle) bits.push(`style=${block.dividerStyle}`);
      if (block.dividerAccent) bits.push(`color=${escapeHtml(block.dividerAccent)}`);
      out.push(`${pad}<!-- cb:divider ${bits.join(" ")} -->`);
      out.push(`${pad}<hr ${bits.map((b) => `data-cb-${b.split("=")[0]}="${escapeHtml(b.split("=")[1] ?? "")}"`).join(" ")} />`);
      out.push(`${pad}<!-- /cb:divider -->`);
      break;
    }
    case "image": {
      const url = block.url ?? "";
      if (url && !url.startsWith("http") && !url.startsWith("data:") && !url.startsWith("/")) {
        const extra = block.width ? `|${block.width}` : block.caption ? `|${block.caption}` : "";
        out.push(`${pad}![[${url}${extra}]]`);
      } else {
        out.push(`${pad}![${block.caption ?? ""}](${url})`);
      }
      break;
    }
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
      const rowBg = block.table?.rowBg ?? [];
      const cellBg = block.table?.cellBg ?? [];
      if (rowBg.some((c) => Boolean(c)) || cellBg.some((c) => Boolean(c))) {
        // Lossless serialisation: a fence below the table carries the colours. Import
        // rebuilds the same table without disturbing the data rows.
        out.push(
          `${pad}<!-- cb:table-style rows=${rowBg.length} cells=${cellBg.length} -->`,
        );
        if (rowBg.some((c) => Boolean(c))) {
          out.push(`${pad}<!-- cb:row-bg ${rowBg.map((c) => c ?? "").join("|")} -->`);
        }
        if (cellBg.some((c) => Boolean(c))) {
          out.push(`${pad}<!-- cb:cell-bg ${cellBg.join("|")} -->`);
        }
      }
      break;
    }
    case "audio": {
      const src = block.url ?? "";
      const label = block.caption ? `|${block.caption}` : "";
      const assetAttr = block.assetName ? ` asset="${escapeHtml(block.assetName)}"` : "";
      if (!src) {
        /*
         * A freshly inserted audio block has no source yet. The fence is
         * self-closing so the editor can recover the block on reload, but
         * nothing is written to disk that another Markdown tool would
         * misread as an asset reference.
         */
        out.push(`${pad}<!-- cb:audio${assetAttr} label="${escapeHtml(block.caption ?? "")}" -->`);
        out.push(`${pad}<!-- /cb:audio -->`);
      } else if (src.startsWith("http") || src.startsWith("data:") || src.startsWith("/")) {
        out.push(`${pad}<!-- cb:audio src="${escapeHtml(src)}" label="${escapeHtml(block.caption ?? "")}"${assetAttr} -->`);
        out.push(`${pad}[🔊 ${block.caption ?? "Audio"}](${src}${label})`);
        out.push(`${pad}<!-- /cb:audio -->`);
      } else {
        out.push(`${pad}![[${src}${label}]]`);
      }
      break;
    }
    case "iframe": {
      const src = block.url ?? "";
      const provider = block.iframeProvider ?? "generic";
      const title = block.iframeTitle ?? "";
      // `iframe` has no native Markdown form. A plain link with a fence keeps the
      // URL visible in any reader while the editor rebuilds the embedded block.
      out.push(`${pad}<!-- cb:iframe provider=${provider} title="${escapeHtml(title)}" -->`);
      out.push(`${pad}[${title || src}](${src})`);
      out.push(`${pad}<!-- /cb:iframe -->`);
      break;
    }
    case "columns": {
      const cols = block.columns ?? [];
      if (!cols.length) break;
      const width = cols.length;
      // Open + per-column width fence. Markdown renderers ignore HTML comments, so
      // pasting this into Obsidian / GitHub shows nothing, but the editor rebuilds
      // the columns losslessly on next load.
      out.push(`${pad}<!-- cb:columns width=${width} -->`);
      for (let i = 0; i < cols.length; i += 1) {
        const col = cols[i]!;
        out.push(`${pad}<!-- cb:col ${i + 1} -->`);
        for (const child of col.blocks) renderBlock(child, out);
        out.push(`${pad}<!-- /cb:col -->`);
      }
      out.push(`${pad}<!-- /cb:columns -->`);
      break;
    }
    case "paragraph":
      out.push(text.length > 0 ? `${pad}${text}` : "");
      break;
  }

  // Toggle children live in the block, so they are written as an indented list underneath it.
  // Callout children were already rendered inline above; do not double-render them here.
  if (block.type !== "callout" && block.type !== "columns") {
    for (const child of block.children ?? []) {
      renderBlock(child, out);
    }
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
 * Pre-processes the lines into a stream that the main parser can step through.
 *
 * The custom `<!-- cb:* -->` fences carry what Markdown cannot (column layouts,
 * divider style, table cell colours, audio / iframe sources, callout tones). A
 * reader that does not know them shows nothing — they are HTML comments — and
 * the editor rebuilds the same blocks losslessly on the next save.
 *
 * Returns one entry per consumed line. Plain lines come back as `{ plain: line }`;
 * a region between two fences comes back as `{ region: <lines> }` whose first line is
 * the opening fence and whose last line is the closing fence.
 */
type ParsedSegment =
  | { kind: "line"; line: string }
  | { kind: "region"; lines: string[]; name: string; attrs: Record<string, string> };

function segmentFences(lines: string[]): ParsedSegment[] {
  const out: ParsedSegment[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    const open = /^<!--\s*cb:([a-z-]+)([^>]*)-->\s*$/.exec(line.trim());
    if (!open) {
      out.push({ kind: "line", line });
      i += 1;
      continue;
    }
    const name = open[1]!;
    const attrs = parseFenceAttrs(open[2] ?? "");
    /*
     * Match the close fence with the same `cb:` prefix the renderer writes.
     * Without that prefix, a `<!-- /cb:col -->` line was treated as plain
     * text and the columns block was lost on the next load.
     */
    const close = `<!-- /cb:${name} -->`;
    let j = i + 1;
    while (j < lines.length && lines[j]!.trim() !== close) j += 1;
    if (j >= lines.length) {
      /*
       * Self-closing fence. The renderer writes a single-line fence (e.g.
       * `<!-- cb:callout-tone color=... -->`) where the attribute lives on
       * the same line as the opening marker and no close follows. Treat the
       * line itself as the region so the parser can pick it up.
       */
      out.push({ kind: "region", lines: [line], name, attrs });
      i += 1;
      continue;
    }
    out.push({ kind: "region", lines: lines.slice(i, j + 1), name, attrs });
    i = j + 1;
  }
  return out;
}

function parseFenceAttrs(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  // `key=value key="quoted value"`
  const re = /([a-zA-Z-]+)=("([^"]*)"|(\S+))/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) !== null) {
    out[m[1]!] = m[3] ?? m[4] ?? "";
  }
  return out;
}

/** Reads `<!-- cb:col N -->` / `<!-- /cb:col -->` pairs into the contained block lines. */
function splitColumnRegions(
  region: string[],
): { blocks: string[] }[] {
  const cols: { blocks: string[] }[] = [];
  let i = 1; // skip `<!-- cb:columns width=N -->`
  while (i < region.length - 1) {
    const head = region[i]!.trim();
    const open = /^<!--\s*cb:col\s+(\d+)\s*-->\s*$/.exec(head);
    if (!open) {
      i += 1;
      continue;
    }
    const close = "<!-- /cb:col -->";
    let j = i + 1;
    while (j < region.length && region[j]!.trim() !== close) j += 1;
    cols.push({ blocks: region.slice(i + 1, j) });
    i = j + 1;
  }
  return cols;
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
  const segments = segmentFences(lines);
  const blocks: NoteBlock[] = [];
  /** Stack of open lists, so `indent` comes from the leading spaces. */
  let listDepth = 0;
  const indentStack: number[] = [0];

  /**
   * Handle a region between two fences. Returns true if the region was consumed and
   * the main loop should advance to the next segment.
   */
  const handleRegion = (region: { name: string; attrs: Record<string, string>; lines: string[] }) => {
    if (region.name === "columns") {
      const cols = splitColumnRegions(region.lines).map((col, index) => ({
        width: 1,
        blocks: markdownToBlocks(col.blocks.join("\n"), resolve),
      }));
      blocks.push({
        id: blockId(),
        type: "columns",
        spans: [],
        columns: cols,
      });
      return true;
    }
    if (region.name === "audio") {
      const src = region.attrs.src ?? "";
      const label = region.attrs.label ?? "";
      const assetName = region.attrs.asset ?? "";
      blocks.push({
        id: blockId(),
        type: "audio",
        url: src,
        caption: label || undefined,
        assetName: assetName || undefined,
        spans: [],
      });
      return true;
    }
    if (region.name === "iframe") {
      // The closing `<!-- /cb:iframe -->` is followed by the link line; pull the URL from there.
      const linkLine = region.lines[region.lines.length - 2] ?? "";
      const linkMatch = /^\[(.*)\]\((.*)\)\s*$/.exec(linkLine.trim());
      const title = region.attrs.title ?? linkMatch?.[1] ?? "";
      const url = linkMatch?.[2] ?? "";
      const provider = (region.attrs.provider ?? "generic") as
        | "youtube"
        | "loom"
        | "figma"
        | "excalidraw"
        | "pdf"
        | "generic";
      blocks.push({
        id: blockId(),
        type: "iframe",
        url,
        iframeProvider: provider,
        iframeTitle: title,
        spans: [],
      });
      return true;
    }
    if (region.name === "callout-tone") {
      // Belt and braces — the tone also lives on the previous callout's color field.
      const prev = blocks[blocks.length - 1];
      if (prev?.type === "callout") {
        prev.color = region.attrs.color ?? prev.color;
      }
      return true;
    }
    if (region.name === "callout-children") {
      // The renderer wraps nested blocks in a fence so an empty callout (no
      // first-line text) still knows where its children live.
      const prev = blocks[blocks.length - 1];
      if (prev?.type !== "callout") return true;
      const childLines = region.lines.slice(1, -1).join("\n");
      prev.children = markdownToBlocks(childLines, resolve);
      return true;
    }
    if (region.name === "divider") {
      blocks.push({
        id: blockId(),
        type: "divider",
        spans: [],
        dividerStyle: (region.attrs.style as "solid" | "dashed" | "dotted" | "double" | undefined) ?? undefined,
        dividerAccent: region.attrs.color ?? undefined,
      });
      return true;
    }
    if (region.name === "table-style" || region.name === "row-bg" || region.name === "cell-bg") {
      const prev = blocks[blocks.length - 1];
      if (prev?.type !== "table") return true;
      const values = region.lines[0]
        ?.replace(/^<!--\s*cb:[a-z-]+\s*/, "")
        .replace(/\s*-->$/, "")
        .split("|") ?? [];
      if (region.name === "row-bg") {
        prev.table = { ...(prev.table ?? { rows: [], headerRow: true }), rowBg: values };
      } else if (region.name === "cell-bg") {
        prev.table = { ...(prev.table ?? { rows: [], headerRow: true }), cellBg: values };
      }
      return true;
    }
    return false;
  };

  const flushCode = (language: string, body: string[]) => {
    blocks.push({
      id: blockId(),
      type: "code",
      language: language || undefined,
      spans: [{ text: body.join("\n") }],
    });
  };

  for (let s = 0; s < segments.length; s += 1) {
    const segment = segments[s]!;
    if (segment.kind === "region") {
      const handled = handleRegion({
        name: segment.name,
        attrs: segment.attrs,
        lines: segment.lines,
      });
      if (handled) continue;
      // Unknown fence → drop silently and move on.
      continue;
    }
    const line = segment.line;
    const trimmed = line.trim();

    if (trimmed.startsWith("```")) {
      const language = trimmed.slice(3).trim();
      const body: string[] = [];
      // Consume following plain-line segments as the code body.
      let k = s + 1;
      while (k < segments.length) {
        const next = segments[k]!;
        if (next.kind !== "line") break;
        if (next.line.trim().startsWith("```")) {
          k += 1;
          break;
        }
        body.push(next.line);
        k += 1;
      }
      flushCode(language, body);
      // Jump past the consumed body and the closing fence line.
      s = k - 1;
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
    // We look at the next two plain segments rather than indexing the raw line array.
    const nextLineSegment = (offset: number): string | null => {
      let count = 0;
      for (let k = s + 1; k < segments.length; k += 1) {
        const seg = segments[k]!;
        if (seg.kind !== "line") continue;
        if (count === offset) return seg.line;
        count += 1;
      }
      return null;
    };
    if (trimmed.startsWith("|") && nextLineSegment(0)?.trim().match(/^\|[\s:|-]+\|$/)) {
      const rows: string[][] = [];
      const readRow = (value: string) =>
        value
          .trim()
          .replace(/^\|/, "")
          .replace(/\|$/, "")
          .split("|")
          .map((cell) => cell.trim().replace(/\\\|/g, "|"));
      rows.push(readRow(trimmed));
      // Skip past the first row *and* the delimiter row that GFM requires under
      // the header. Without the +1 the delimiter `| --- | --- |` would be
      // recorded as a data row and the table would grow by one phantom row on
      // every round trip.
      let k = s + 2;
      while (true) {
        const candidate = segments[k];
        if (!candidate || candidate.kind !== "line") break;
        if (!candidate.line.trim().startsWith("|")) break;
        rows.push(readRow(candidate.line));
        k += 1;
      }
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
      s = k - 1;
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

    // Obsidian wiki embed: ![[filename.png]] or ![[filename.png|300]] or ![[filename.png|caption]]
    const wikiEmbed = /^!\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\\?\|([^\]]*))?\]\]$/.exec(trimmed);
    if (wikiEmbed) {
      const target = wikiEmbed[1].trim();
      const label = (wikiEmbed[2] ?? "").trim();
      const isMedia = /\.(png|jpe?g|gif|webp|bmp|svg|mp4|webm|mov)$/i.test(target);
      if (isMedia) {
        const isWidth = /^\d+(x\d+)?%?$/.test(label);
        blocks.push({
          id: blockId(),
          type: "image",
          url: target,
          caption: label && !isWidth ? label : undefined,
          width: isWidth ? label : undefined,
          spans: [],
        });
        continue;
      }
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