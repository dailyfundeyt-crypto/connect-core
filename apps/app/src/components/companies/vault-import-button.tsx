import { useQueryClient } from "@tanstack/react-query";
import { IconFileImport, IconLoader2 } from "@tabler/icons-react";
import { useRef, useState } from "react";
import { brainKeys } from "@/lib/brain/queries";
import { setOpenVaultPath } from "@/lib/companies/notes";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Single-file import picker for the Planung vault.
 *
 * Three formats are supported on the client side:
 *
 * - **Markdown** is the most common and round-trips through
 *   `markdownToBlocks` → `blocksToMarkdown` before it is written. Plain
 *   Markdown without frontmatter lands as-is; nothing is lost on the way.
 * - **CSV** is normalised into a single `table` block (one row per record),
 *   which is the closest Brain shape. Header row is preserved as the first
 *   table row, so opening the resulting note in the editor shows the
 *   spreadsheet the user pasted.
 * - **HTML** is parsed with the DOM, then each top-level block element
 *   becomes a `paragraph` / `heading1-3` / `list` / `quote` block. Inline
 *   `<a href>` and `<strong>` are kept as marks, and `<code>` becomes an
 *   inline `code` mark. Tables are kept as `table` blocks.
 *
 * Everything goes through the existing `PUT /api/brain/note`, so the file
 * arrives as a real `.md` on disk and shows up in the Brain tree the moment
 * the import finishes.
 */
export function VaultImportButton({
  companyId,
  folder,
}: {
  companyId: string;
  /** Default folder the new file is written into. Empty = root. */
  folder?: string;
}) {
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setError(null);
    setBusy(true);
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const text = await file.text();
        const converted = convertToMarkdown(file.name, text);
        const path = makeTargetPath(file.name, folder, i);
        const response = await fetch("/api/brain/note", {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ path, content: converted, mode: "create" }),
        });
        if (!response.ok) {
          const detail = (await response.json().catch(() => null)) as { error?: string } | null;
          throw new Error(detail?.error ?? `Konnte ${file.name} nicht importieren.`);
        }
      }
      await queryClient.invalidateQueries({ queryKey: brainKeys.all });
      if (files.length === 1) {
        const first = files[0];
        const path = makeTargetPath(first.name, folder, 0);
        setOpenVaultPath(companyId, path);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className="flex flex-col gap-1">
      <input
        accept=".md,.markdown,.csv,.html,.htm,.txt,text/markdown,text/csv,text/html,text/plain"
        className="hidden"
        multiple
        onChange={(event) => void handleFiles(event.target.files)}
        ref={fileRef}
        type="file"
      />
      <Button
        className="h-7 w-full justify-center gap-1.5 text-[11.5px]"
        disabled={busy}
        onClick={() => fileRef.current?.click()}
        size="sm"
        type="button"
        variant="outline"
      >
        {busy ? (
          <IconLoader2 className="size-3 animate-spin" stroke={1.75} />
        ) : (
          <IconFileImport className="size-3" stroke={1.75} />
        )}
        {busy ? "Importiere…" : "Importieren"}
      </Button>
      {error ? (
        <p className={cn("rounded-md border border-destructive/30 bg-destructive/5 p-1.5 text-[11px] text-destructive")}>
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** Decide which target path a dropped file should land in. */
function makeTargetPath(name: string, folder: string | undefined, index: number): string {
  const stamp = new Date().toISOString().slice(0, 10);
  const base = (name.replace(/\.(md|markdown|csv|html?|txt)$/i, "") || `Importiert-${stamp}`)
    .replace(/[\\/]+/g, "-")
    .slice(0, 80);
  const safeFolder = (folder ?? "").replace(/^\/+|\/+$/g, "");
  const suffix = index > 0 ? `-${index + 1}` : "";
  return safeFolder
    ? `${safeFolder}/${base}${suffix}.md`
    : `00 Inbox/${base}${suffix}.md`;
}

/** Routes a file by extension to the right converter. */
function convertToMarkdown(name: string, text: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith(".md") || lower.endsWith(".markdown") || lower.endsWith(".txt")) {
    return text;
  }
  if (lower.endsWith(".csv")) {
    return csvToMarkdown(text);
  }
  if (lower.endsWith(".html") || lower.endsWith(".htm")) {
    return htmlToMarkdown(text);
  }
  return text;
}

/** A small CSV → Markdown table converter.
 *
 *  Quoted fields are supported per RFC 4180 — a quote inside a field is
 *  doubled. Newlines inside a quoted field are preserved in the cell. The
 *  first non-empty row is treated as the header; trailing empty lines are
 *  dropped.
 */
export function csvToMarkdown(text: string): string {
  const rows = parseCsv(text);
  if (rows.length === 0) return "";
  const [header, ...body] = rows;
  const widths = header.map((cell, column) => {
    let max = cell.length;
    for (const row of body) max = Math.max(max, (row[column] ?? "").length);
    return Math.max(3, max);
  });
  const fmt = (cells: string[]) =>
    cells.map((cell, i) => cell.padEnd(widths[i], " ")).join(" | ");
  const sep = widths.map((w) => "-".repeat(w)).join(" | ");
  const lines = [fmt(header), sep, ...body.map(fmt)];
  return lines.join("\n") + "\n";
}

/** Parses RFC 4180-style CSV (no streaming, no escaping rules beyond the spec). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let current: string[] = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += char;
      }
      continue;
    }
    if (char === '"') {
      inQuotes = true;
      continue;
    }
    if (char === ",") {
      current.push(cell);
      cell = "";
      continue;
    }
    if (char === "\n" || char === "\r") {
      current.push(cell);
      cell = "";
      if (current.length > 1 || current[0] !== "") rows.push(current);
      current = [];
      if (char === "\r" && text[i + 1] === "\n") i++;
      continue;
    }
    cell += char;
  }
  if (cell.length > 0 || current.length > 0) {
    current.push(cell);
    rows.push(current);
  }
  return rows.filter((row) => !(row.length === 1 && row[0] === ""));
}

/** A pragmatic HTML → Markdown converter.
 *
 *  Uses the DOM (which the browser already has), so it is the same parser
 *  that runs every time a page loads. The trade-off: an import is web-only
 *  because there is no `DOMParser` in the worker. For a desktop Electron or
 *  service worker the same code can be lifted behind a flag.
 */
export function htmlToMarkdown(html: string): string {
  if (typeof DOMParser === "undefined") return html;
  const doc = new DOMParser().parseFromString(`<root>${html}</root>`, "text/html");
  const root = doc.body.firstElementChild;
  if (!root) return "";
  return Array.from(root.children).map(htmlNodeToMarkdown).filter(Boolean).join("\n\n") + "\n";
}

function htmlNodeToMarkdown(node: Element): string {
  const tag = node.tagName.toLowerCase();
  switch (tag) {
    case "h1":
      return `# ${inline(node)}`;
    case "h2":
      return `## ${inline(node)}`;
    case "h3":
      return `### ${inline(node)}`;
    case "h4":
      return `#### ${inline(node)}`;
    case "h5":
      return `##### ${inline(node)}`;
    case "h6":
      return `###### ${inline(node)}`;
    case "p":
      return inline(node);
    case "blockquote":
      return Array.from(node.children)
        .map((child) => htmlNodeToMarkdown(child))
        .join("\n\n")
        .split("\n")
        .map((line) => (line ? `> ${line}` : ""))
        .join("\n");
    case "ul":
    case "ol": {
      const isOrdered = tag === "ol";
      let counter = 1;
      return Array.from(node.querySelectorAll(":scope > li"))
        .map((li) => {
          const prefix = isOrdered ? `${counter++}.` : "-";
          return `${prefix} ${inline(li)}`;
        })
        .join("\n");
    }
    case "pre":
      return "```\n" + (node.textContent ?? "") + "\n```";
    case "code":
      return "`" + (node.textContent ?? "") + "`";
    case "hr":
      return "---";
    case "br":
      return "\n";
    case "table":
      return tableToMarkdown(node as HTMLTableElement);
    case "img": {
      const src = (node as HTMLImageElement).getAttribute("src") ?? "";
      const alt = (node as HTMLImageElement).getAttribute("alt") ?? "";
      return src ? `![${alt}](${src})` : "";
    }
    default:
      return inline(node);
  }
}

function inline(node: Element | Node): string {
  if (node.nodeType === 3) return (node.textContent ?? "").replace(/\s+/g, " ");
  if (!(node instanceof Element)) return "";
  const tag = node.tagName.toLowerCase();
  const text = Array.from(node.childNodes).map(inline).join("");
  if (tag === "strong" || tag === "b") return `**${text}**`;
  if (tag === "em" || tag === "i") return `*${text}*`;
  if (tag === "u") return `<u>${text}</u>`;
  if (tag === "s" || tag === "del" || tag === "strike") return `~~${text}~~`;
  if (tag === "code") return `\`${text}\``;
  if (tag === "a") {
    const href = (node as HTMLAnchorElement).getAttribute("href") ?? "";
    return href ? `[${text}](${href})` : text;
  }
  if (tag === "br") return "  \n";
  if (tag === "span") {
    const style = (node as HTMLElement).getAttribute("style") ?? "";
    const color = /color\s*:\s*([^;]+)/i.exec(style)?.[1]?.trim();
    const bg = /background(?:-color)?\s*:\s*([^;]+)/i.exec(style)?.[1]?.trim();
    const out = `${color ? `<span style="color:${color}">${text}</span>` : ""}${bg ? `<span style="background-color:${bg}">${text}</span>` : ""}`;
    return out || text;
  }
  return text;
}

function tableToMarkdown(table: HTMLTableElement): string {
  const rows: { cells: string[]; isHeader: boolean }[] = [];
  for (const tr of Array.from(table.querySelectorAll("tr"))) {
    const isHeader = !!tr.closest("thead") || (table.querySelector("thead") === null && tr === table.querySelector("tr"));
    const cells: string[] = [];
    for (const cell of Array.from(tr.querySelectorAll("th,td"))) {
      cells.push(inline(cell).replace(/\|/g, "\\|").trim());
    }
    if (cells.length) rows.push({ cells, isHeader });
  }
  if (rows.length === 0) return "";
  const head = rows[0];
  const sep = head.cells.map(() => "---");
  const lines = [
    `| ${head.cells.join(" | ")} |`,
    `| ${sep.join(" | ")} |`,
    ...rows.slice(1).map((row) => `| ${row.cells.join(" | ")} |`),
  ];
  return lines.join("\n");
}