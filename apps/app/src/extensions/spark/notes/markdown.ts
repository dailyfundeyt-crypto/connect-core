/**
 * Spark-Notizen — Markdown-Export und Frontmatter.
 *
 * Der Editor arbeitet auf Tiptap-JSON (siehe `types.ts` für das Warum). Das
 * hier ist die Ableitung nach außen: „Als Markdown kopieren" und der
 * spätere `.md`-Export.
 *
 * Ehrliche Grenze, damit niemand darauf vertraut, was nicht da ist: dieser
 * Serializer deckt ab, was der Editor erzeugen kann — Überschriften, Absätze,
 * Listen, Aufgabenlisten, Zitate, Code, Tabellen, Bilder, Links, Fett/Kursiv/
 * Durchgestrichen, Zitat-Code. Er ist KEIN vollständiger CommonMark-Parser.
 * Rücklesen (Markdown → JSON) ist bewusst nicht implementiert: Tiptap 3 hat
 * einen eingebauten Markdown-Parser, aber der ist an `@tiptap/markdown`
 * gebunden, und eine zweite Wahrheit beim Import wäre eine zweite Fehlerquelle.
 * Import läuft über `parseHtml` (siehe `content.ts`), was verlustfrei ist.
 */

import type { JSONContent } from "@tiptap/core";
import type { SparkNote } from "./types";

/** Bild/Video-Knoten → Markdown. `title` dient als Alt-Text. */
function serializeNode(node: JSONContent, depth: number): string {
  const children = (node.content ?? []).map((child) => child);
  const inner = () =>
    children.map((child) => serializeNode(child, depth + 1)).join("");

  switch (node.type) {
    case "doc":
      return children.map((child) => serializeNode(child, depth)).join("\n\n");

    case "paragraph":
      return inner() || "";

    case "heading": {
      const level = Math.min(
        6,
        Math.max(
          1,
          typeof node.attrs?.level === "number" ? node.attrs.level : 1,
        ),
      );
      return `${"#".repeat(level)} ${inner()}`;
    }

    case "bulletList":
      return children
        .map((child) => indentLines(serializeNode(child, depth), "- ", depth))
        .join("\n");

    case "orderedList": {
      const start =
        typeof node.attrs?.start === "number" ? node.attrs.start : 1;
      return children
        .map((child, index) =>
          indentLines(serializeNode(child, depth), `${start + index}. `, depth),
        )
        .join("\n");
    }

    case "listItem":
      return inner().replace(/\n\n/g, "\n");

    case "taskList":
      return children.map((child) => serializeNode(child, depth)).join("\n");

    case "taskItem": {
      const checked = node.attrs?.checked === true;
      const box = checked ? "[x] " : "[ ] ";
      /*
       * `inner()` kann mehrere Zeilen haben (z. B. ein Listenpunkt mit
       * Absatz und Codeblock). Der Marker gehört nur vor die erste Zeile —
       * deshalb wird er nach dem Aufteilen wieder zusammengesetzt.
       */
      return box + inner().trimStart();
    }

    case "blockquote":
      return children
        .map((child) => serializeNode(child, depth + 1))
        .join("\n\n")
        .split("\n")
        .map((line) => (line ? `> ${line}` : ">"))
        .join("\n");

    case "codeBlock": {
      const language =
        typeof node.attrs?.language === "string" ? node.attrs.language : "";
      const body = textOf(node);
      return `\`\`\`${language}\n${body}\n\`\`\``;
    }

    case "hardBreak":
      return "  \n";

    case "horizontalRule":
      return "---";

    case "image": {
      const src = typeof node.attrs?.src === "string" ? node.attrs.src : "";
      if (!src) return "";
      const alt =
        typeof node.attrs?.alt === "string" && node.attrs.alt
          ? escapeMarkdownText(node.attrs.alt)
          : "Bild";
      return `![${alt}](${src})`;
    }

    case "table":
      return serializeTable(node);

    case "text":
      return serializeText(node, depth);

    default:
      return inner();
  }
}

/** Tabellen flach aus Zellen, wie es GFM erwartet. */
function serializeTable(node: JSONContent): string {
  const rows = (node.content ?? []).filter((row) => row.type === "tableRow");
  if (rows.length === 0) return "";

  const rendered = rows.map((row) =>
    (row.content ?? []).map((cell) => {
      const body = (cell.content ?? [])
        .map((child) => serializeNode(child, 0))
        .join("")
        .replace(/\n/g, " ")
        .replace(/\|/g, "\\|")
        .trim();
      return body || " ";
    }),
  );

  const columns = Math.max(...rendered.map((row) => row.length));
  const pad = (row: string[]) => {
    const copy = [...row];
    while (copy.length < columns) copy.push(" ");
    return copy;
  };

  const lines: string[] = [];
  const header = pad(rendered[0]);
  lines.push(`| ${header.join(" | ")} |`);
  lines.push(`| ${header.map(() => "---").join(" | ")} |`);
  for (const row of rendered.slice(1)) {
    lines.push(`| ${pad(row).join(" | ")} |`);
  }
  return lines.join("\n");
}

/** Listen-Marker an jede Zeile hängen, damit tiefe Ebenen erhalten bleiben. */
function indentLines(value: string, marker: string, depth: number): string {
  const pad = "  ".repeat(Math.max(0, depth - 1));
  return value
    .split("\n")
    .map((line, index) => (index === 0 ? `${marker}${line}` : `${pad}${line}`))
    .join("\n");
}

/**
 * Text mit seinen Marks als Markdown.
 *
 * Reihenfolge ist nicht beliebig: `code` muss außen liegen, weil ein
 * fettes `code`-Segment sonst als `` **`code`** `` herauskäme, was kein
 * Parser zurückgibt.
 */
function serializeText(node: JSONContent, depth: number): string {
  const raw = node.text ?? "";
  if (!raw) return "";

  const marks = new Set(
    (node.marks ?? [])
      .map((mark) => mark.type)
      .filter((type): type is string => typeof type === "string"),
  );

  /*
   * Verschachtelte Listen: Prosemirror gibt uns hier nur Text, die Tiefe
   * steckt in einer umgebenden `listItem`-Klammer. Wir verlassen uns darauf,
   * dass `indentLines` die Zeilen einrückt, und ergänzen nur die Fugenzeilen.
   */
  let value = escapeMarkdownText(raw);
  if (depth > 0) value = value.replace(/\n/g, "\n  ");

  if (marks.has("code")) return `\`${raw}\``;
  if (marks.has("bold")) value = `**${value}**`;
  if (marks.has("italic")) value = `_${value}_`;
  if (marks.has("strike")) value = `~~${value}~~`;

  const link = (node.marks ?? []).find((mark) => mark.type === "link");
  if (link) {
    const href = typeof link.attrs?.href === "string" ? link.attrs.href : "";
    if (href) value = `[${value}](${href})`;
  }

  return value;
}

/**
 * Zeichen, die Markdown-Struktur bedeuten, entkommen.
 *
 * Kein voller Regex-Escape: `*`/`_` in normalem Fließtext zu escaped sieht
 * in der Quelle unschön aus (`2 * 3`), und der Export ist für Lesbarkeit
 * gedacht, nicht für Parser-Sicherheit. Escaped werden nur die Zeichen, die
 * beim Wieder-Einlesen zu einer Struktur führen würden.
 */
function escapeMarkdownText(value: string): string {
  return value.replace(/([\\`[\]])/g, "\\$1");
}

function textOf(node: JSONContent): string {
  if (node.type === "text") return node.text ?? "";
  return (node.content ?? []).map(textOf).join("");
}

function toFrontmatterValue(value: unknown): string {
  if (typeof value === "boolean" || typeof value === "number") {
    return String(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => JSON.stringify(String(item))).join(", ")}]`;
  }
  return JSON.stringify(String(value));
}

/**
 * YAML-Frontmatter — Obsidian-/Notion-tauglich.
 *
 * Das ist der Interop-Punkt mit Dateien, die jemand in Obsidian öffnen oder
 * mit einem Skript lesen will; Connect selbst liest es nicht zurück.
 */
export function toMarkdown(note: SparkNote): string {
  const body = serializeNode(note.content, 0)
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  const lines = [
    "---",
    `id: ${toFrontmatterValue(note.id)}`,
    `title: ${toFrontmatterValue(note.title || "Ohne Titel")}`,
    `created: ${toFrontmatterValue(note.createdAt)}`,
    `updated: ${toFrontmatterValue(note.updatedAt)}`,
  ];
  lines.push("---", "", body, "");
  return lines.join("\n");
}

/** Dateiname, wenn die Notiz als `.md` exportiert wird. */
export function noteFileName(note: SparkNote): string {
  const base = note.title
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, " ")
    .slice(0, 80)
    .trim();
  return `${base || "Ohne Titel"}.md`;
}
