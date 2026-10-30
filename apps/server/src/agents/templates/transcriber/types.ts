/**
 * Transcriber Agent Types (Swarm-v3 Lane 4)
 * Instagram Reels -> getthescript.app -> Tool-Extraction -> Spark Folders
 */

import {
  type TranscriberJob,
  type TranscriberJobStatus,
  type TranscriberToolExtracted,
  type CreateTranscriberJobRequest,
  type TranscriberJobResponse,
  type ListTranscriberJobsResponse,
  type BrowserFolder,
  type FolderLink,
  type FolderNote,
} from "../../../contracts/swarm-v3";

export type {
  TranscriberJob,
  TranscriberJobStatus,
  TranscriberToolExtracted,
  CreateTranscriberJobRequest,
  TranscriberJobResponse,
  ListTranscriberJobsResponse,
  BrowserFolder,
  FolderLink,
  FolderNote,
};

export interface InstagramTranscriptionResult {
  url: string;
  transcript: string;
  source: "browser" | "api" | "cached";
  durationSeconds?: number;
}

export interface ToolExtractionResult {
  name: string;
  url?: string;
  purpose: string;
  targetCategory?: string;
  isDuplicate?: boolean;
}

export interface TranscriberExecutionPlan {
  jobId: string;
  targetFolder: {
    id: string;
    name: string;
    isNew: boolean;
  };
  tools: ToolExtractionResult[];
  linksToAdd: Array<{
    url: string;
    title: string;
    noteTitle: string;
    noteContent: string;
  }>;
  skippedDuplicates: string[];
  dryRun: boolean;
}

export interface SparkSeedResult {
  success: boolean;
  userEmail: string;
  userId?: string;
  folderId: string;
  folderName: string;
  linksCreated: Array<{ id: string; title: string; url: string }>;
  notesCreated: Array<{ id: string; title: string }>;
  emailSent: false; // Explicitly guaranteed: Keine E-Mail senden
  timestamp: string;
}
