/** Contract v06 – Änderungen nur durch A00/Integrator */

export type SparkMcpToolName =
  | "folder_create"
  | "folder_rename"
  | "folder_move"
  | "folder_mark_settings"
  | "link_add"
  | "link_move"
  | "note_create"
  | "note_read"
  | "note_update"
  | "note_trash"
  | "note_attach_to_folder"
  | "folder_context";

/**
 * Regel: Notiz im selben Ordner wie Links = Arbeitsanweisung für diese Links.
 */
export interface FolderContext {
  folderId: string;
  path: string[];
  links: {
    id: string;
    url: string;
    title: string;
  }[];
  notes: {
    id: string;
    title: string;
    excerpt: string;
  }[];
  instructions?: string;
}
