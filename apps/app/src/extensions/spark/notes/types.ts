/**
 * Spark-Notizen — Datenmodell.
 *
 * Eine Notiz ist ein eigenständiger Datentyp. Sie ist bewusst KEIN
 * `ConnectProject` aus `app/src/lib/companies/projects.ts` und auch kein
 * Kanal: Projekte sind Agenten-Gruppen, Notizen sind Wissens-Inhalte. Die
 * Verknüpfung läuft über `folderId` (Projekt-ID) — eine Notiz kann in einer
 * Gruppe liegen oder lose unter „Notizen" stehen.
 *
 * Der Editor-Inhalt wird als Tiptap-JSON gespeichert, nicht als Markdown.
 * Grund: JSON ist verlustfrei, Markdown nicht (Tabellen mit Inline-Formatierung,
 * verschachtelte Listen, Aufgaben mit Zustand). Markdown wird daraus abgeleitet
 * (`markdown.ts`) und nur beim Export verwendet — siehe dort für die Grenzen.
 */

import type { JSONContent } from "@tiptap/core";

export type SparkNote = {
  id: string;
  companyId: string;
  title: string;
  /** Tiptap-Dokument. Wahrheit der Notiz. */
  content: JSONContent;
  /**
   * Gruppen-ID (`ConnectProject.id`) oder `null` für „Allgemein". Wird die
   * Gruppe gelöscht, wandert die Notiz auf `null` statt zu verschwinden —
   * siehe `store.ts`, `onProjectDeleted`.
   */
  folderId: string | null;
  /** ISO-8601. */
  createdAt: string;
  /** ISO-8601. */
  updatedAt: string;
};

/** Wie eine leere, unbenannte Notiz im Editor startet. */
export function emptyNoteContent(): JSONContent {
  return { type: "doc", content: [{ type: "paragraph" }] };
}

/** Titel, den die Sidebar anzeigt — eine unbenannte Notiz soll nicht leer wirken. */
export function noteDisplayTitle(note: Pick<SparkNote, "title">): string {
  const trimmed = note.title.trim();
  return trimmed || "Ohne Titel";
}

/**
 * Erste Textzeile aus dem Dokument — die Sidebar-Unterzeile.
 *
 * Wir gehen bewusst nur eine Ebene tief und ignorieren Tabellen: In einer
 * Tabelle steht Text, aber sie ist keine Zusammenfassung des Gedankens, und
 * eine Tabelle als Einzeiler-Vorschau ist nur Rauschen.
 */
export function notePreview(content: JSONContent, maxLength = 72): string {
  const parts: string[] = [];
  for (const node of content.content ?? []) {
    if (node.type !== "paragraph") continue;
    const text = nodeText(node);
    if (text.trim()) parts.push(text.trim());
  }
  const joined = parts.join(" ");
  if (joined.length <= maxLength) return joined;
  return `${joined.slice(0, maxLength - 1).trimEnd()}…`;
}

function nodeText(node: JSONContent): string {
  if (node.type === "text") return node.text ?? "";
  const children = node.content;
  if (!children) return "";
  return children.map(nodeText).join("");
}
