"use client";

import type { SparkNote } from "@/extensions/spark/notes/types";

/**
 * Wandelt Gruppen-IDs in Namen um, damit eine Notiz ihren Speicherort lesbar
 * zeigt, ohne den Gruppen-Store in einer reinen Anzeigefunktion zu laden.
 *
 * `Record<string, string>` statt `Map`: der Store liefert Objekte, und ein
 * Lookup mit zwei Zugriffen ist hier billiger als eine Umwandlung.
 */
export type FolderNames = Record<string, string>;

export function folderName(
  folderId: string | null,
  names: FolderNames,
): string {
  if (!folderId) return "Allgemein";
  return names[folderId] ?? "Allgemein";
}

/** Wie die Sidebar eine Notiz beschriftet. */
export function noteLabel(note: SparkNote): string {
  const trimmed = note.title.trim();
  if (trimmed) return trimmed;
  return "Ohne Titel";
}
