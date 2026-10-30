import { z } from "zod";
import {
  BrowserFolderSchema,
  FolderLinkSchema,
  FolderNoteSchema,
  type BrowserFolder,
  type BrowserFolderKind,
  type FolderLink,
  type FolderNote,
} from "../../contracts/swarm-v3/types";

export {
  BrowserFolderSchema,
  FolderLinkSchema,
  FolderNoteSchema,
  type BrowserFolder,
  type BrowserFolderKind,
  type FolderLink,
  type FolderNote,
};

export interface FolderWithDetails extends BrowserFolder {
  links: FolderLink[];
  notes: FolderNote[];
  subfolders?: BrowserFolder[];
  instructionNote?: FolderNote | null;
}

export interface FolderContextResponse {
  folder: BrowserFolder;
  instructionNote: FolderNote | null;
  instructionText: string;
  links: Array<{
    id: string;
    url: string;
    title: string;
    noteId: string | null;
    associatedInstruction: string;
  }>;
}

export const CreateFolderInputSchema = z.object({
  id: z.string().optional(),
  parentId: z.string().nullable().optional(),
  name: z.string().min(1, "Name darf nicht leer sein"),
  kind: z.enum(["normal", "settings"]).default("normal"),
  ownerScope: z.string().default("company"),
  instructionNoteId: z.string().nullable().optional(),
});
export type CreateFolderInput = z.infer<typeof CreateFolderInputSchema>;

export const UpdateFolderInputSchema = z.object({
  name: z.string().min(1).optional(),
  kind: z.enum(["normal", "settings"]).optional(),
  ownerScope: z.string().optional(),
  instructionNoteId: z.string().nullable().optional(),
  parentId: z.string().nullable().optional(),
});
export type UpdateFolderInput = z.infer<typeof UpdateFolderInputSchema>;

export const MoveFolderInputSchema = z.object({
  folderId: z.string().min(1),
  targetParentId: z.string().nullable(),
});
export type MoveFolderInput = z.infer<typeof MoveFolderInputSchema>;

export const CreateLinkInputSchema = z.object({
  id: z.string().optional(),
  folderId: z.string().min(1),
  url: z.string().url("Muss eine gueltige URL sein"),
  title: z.string().min(1, "Titel darf nicht leer sein"),
  noteId: z.string().nullable().optional(),
});
export type CreateLinkInput = z.infer<typeof CreateLinkInputSchema>;

export const MoveLinkInputSchema = z.object({
  targetFolderId: z.string().min(1),
});
export type MoveLinkInput = z.infer<typeof MoveLinkInputSchema>;

export const AttachNoteInputSchema = z.object({
  folderId: z.string().min(1),
  noteId: z.string().min(1),
  title: z.string().optional(),
  content: z.string().optional(),
  setAsInstruction: z.boolean().default(true),
});
export type AttachNoteInput = z.infer<typeof AttachNoteInputSchema>;
