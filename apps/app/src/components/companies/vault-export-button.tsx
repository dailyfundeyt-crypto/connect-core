import { IconDownload } from "@tabler/icons-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { splitFrontmatter } from "@/components/companies/vault-note-editor";
import { markdownToBlocks } from "@/lib/companies/notes-markdown";
import type { NoteBlock } from "@/lib/companies/notes";

/**
 * Dropdown for exporting the open note in three formats.
 *
 * - **Markdown** is the body the caller passes in. Round-tripping through
 *   `markdownToBlocks → blocksToMarkdown` is a no-op for plain Markdown, so
 *   the file is exported as-is — the editor's on-disk representation, with
 *   frontmatter and any block-level HTML-comment fences preserved.
 * - **HTML** renders the editor's blocks as a single static document so the
 *   output is viewable in any browser without depending on Connect.
 * - **JSON** is the raw block tree, useful for the search index, the
 *   memory graph, or any other tool that wants to inspect the structure
 *   without parsing Markdown.
 *
 * The export uses the *current* editor content (frontmatter + body), so an
 * unsaved draft is exported as the user sees it. That keeps the contract
 * "Markdown stays lossless on disk" honest: the on-disk version is also
 * what the export produces, because the editor reads its blocks back from
 * the same shape it writes.
 */
export function VaultExportButton({
  path,
  content,
  className,
}: {
  path: string;
  content: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  const exports: { id: "md" | "html" | "json"; label: string; filename: string }[] = [
    { id: "md", label: "Markdown (.md)", filename: fileNameFor(path, "md") },
    { id: "html", label: "HTML (.html)", filename: fileNameFor(path, "html") },
    { id: "json", label: "JSON (.json)", filename: fileNameFor(path, "json") },
  ];

  return (
    <div className="relative">
      <Button
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Export"
        className={cn("h-7 gap-1.5 text-[11.5px]", className)}
        onClick={() => setOpen((value) => !value)}
        size="sm"
        type="button"
        variant="outline"
      >
        <IconDownload className="size-3" stroke={1.75} />
        Export
      </Button>
      {open ? (
        <ul
          className="absolute right-0 top-full z-40 mt-1 flex min-w-[180px] flex-col gap-0.5 rounded-lg border bg-white p-1 shadow-lg dark:border-neutral-800 dark:bg-neutral-950"
          role="menu"
        >
          {exports.map((entry) => (
            <li key={entry.id}>
              <button
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12.5px] hover:bg-neutral-100 dark:hover:bg-white/10"
                onClick={() => {
                  exportAs(path, content, entry.id, entry.filename);
                  setOpen(false);
                }}
                role="menuitem"
                type="button"
              >
                {entry.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function fileNameFor(path: string, ext: string): string {
  const base = path.split("/").pop()?.replace(/\.md$/i, "") ?? "Notiz";
  return `${base}.${ext}`;
}

function exportAs(path: string, content: string, format: "md" | "html" | "json", filename: string) {
  let payload: string;
  let mime: string;
  if (format === "md") {
    // The editor's content already includes the frontmatter and any block-level
    // HTML-comment fences; the export mirrors what the editor would have
    // written on save, so re-importing the file yields the same blocks.
    payload = content;
    mime = "text/markdown;charset=utf-8";
  } else if (format === "html") {
    payload = blocksToHtml(content);
    mime = "text/html;charset=utf-8";
  } else {
    const { frontmatter, body } = splitFrontmatter(content);
    const blocks = markdownToBlocks(body);
    payload = JSON.stringify({ path, frontmatter, blocks }, null, 2);
    mime = "application/json;charset=utf-8";
  }
  const blob = new Blob([payload], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

/** Renders Markdown blocks to a single HTML document. Best-effort, not a full MD renderer. */
function blocksToHtml(content: string): string {
  const { body } = splitFrontmatter(content);
  const blocks = markdownToBlocks(body);
  const parts = blocks.map(blockToHtml).filter(Boolean);
  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<title>Notiz</title>
<style>body { font-family: ui-sans-serif, system-ui, sans-serif; max-width: 760px; margin: 3rem auto; padding: 0 1.5rem; line-height: 1.7; color: #1a1a1a; } h1, h2, h3 { line-height: 1.2; } pre { background: #f4f4f4; padding: 1rem; border-radius: 6px; overflow-x: auto; } table { border-collapse: collapse; width: 100%; } th, td { border: 1px solid #d4d4d4; padding: 0.4rem 0.6rem; } blockquote { border-left: 3px solid #d4d4d4; margin: 0; padding-left: 1rem; color: #555; }</style>
</head>
<body>
${parts.join("\n")}
</body>
</html>`;
}

function blockToHtml(block: NoteBlock): string {
  const text = (block.spans ?? []).map((span) => escapeHtml(span.text)).join("") || "";
  switch (block.type) {
    case "heading1": return `<h1>${text}</h1>`;
    case "heading2": return `<h2>${text}</h2>`;
    case "heading3": return `<h3>${text}</h3>`;
    case "paragraph": return `<p>${text}</p>`;
    case "quote": return `<blockquote>${text}</blockquote>`;
    case "code": return `<pre><code>${escapeHtml(text)}</code></pre>`;
    case "bullet":
    case "number":
      return `<ul><li>${text}</li></ul>`;
    case "todo":
      return `<p>${block.checked ? "☑" : "☐"} ${text}</p>`;
    case "divider": return `<hr>`;
    case "callout": return `<blockquote>${block.emoji ?? "💡"} ${text}</blockquote>`;
    case "image":
      return block.url ? `<p><img src="${escapeAttr(block.url)}" alt="${escapeAttr(block.caption ?? "")}"></p>` : "";
    case "table": {
      if (!block.table) return "";
      const rows = block.table.rows.map((row, index) => {
        const tag = index === 0 && block.table!.headerRow ? "th" : "td";
        const cells = row.map((cell) => `<${tag}>${escapeHtml(cell)}</${tag}>`).join("");
        return `<tr>${cells}</tr>`;
      });
      return `<table>${rows.join("")}</table>`;
    }
    case "columns": return "";
    case "audio": return block.url ? `<p><audio controls src="${escapeAttr(block.url)}"></audio></p>` : "";
    case "iframe":
      return block.url ? `<p><a href="${escapeAttr(block.url)}">${escapeHtml(block.iframeTitle ?? block.url)}</a></p>` : "";
    case "toggle":
      return `<details><summary>${text}</summary></details>`;
    default:
      return text ? `<p>${text}</p>` : "";
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeAttr(text: string): string {
  return escapeHtml(text).replace(/"/g, "&quot;");
}