/**
 * Spark-Learn YouTube Integration Types (Lane 5)
 *
 * Models for focus-tube-filter import, YouTube transcript processing,
 * database records, and Spark note generation.
 */

import { z } from "zod";
import {
  type YtTranscriptStatus,
  YtTranscriptStatusSchema,
  type YtVideo,
  YtVideoSchema,
  type TranscriberSegment,
  type TranscriberResult,
} from "../contracts";

export {
  type YtTranscriptStatus,
  YtTranscriptStatusSchema,
  type YtVideo,
  YtVideoSchema,
  type TranscriberSegment,
  type TranscriberResult,
};

/* ========================================================================== */
/* Focus-Tube-Filter Supabase Tables Schema                                   */
/* ========================================================================== */

export const FocusTubeFolderSchema = z.object({
  id: z.string(),
  name: z.string(),
  icon: z.string().optional(),
  color: z.string().optional(),
  sort_order: z.number().optional(),
  created_at: z.string().optional(),
});
export type FocusTubeFolder = z.infer<typeof FocusTubeFolderSchema>;

export const FocusTubeChannelSchema = z.object({
  id: z.string(),
  folder_id: z.string().optional().nullable(),
  channel_id: z.string().optional().nullable(),
  name: z.string().optional().nullable(),
  title: z.string().optional().nullable(),
  category: z.string().optional().nullable(),
  daily_video_goal: z.number().optional().nullable(),
  custom_url: z.string().optional().nullable(),
  thumbnail_url: z.string().optional().nullable(),
  created_at: z.string().optional(),
});
export type FocusTubeChannel = z.infer<typeof FocusTubeChannelSchema>;

export const FocusTubeCachedVideoSchema = z.object({
  id: z.string(),
  video_id: z.string(),
  channel_id: z.string().optional().nullable(),
  channel_title: z.string().optional().nullable(),
  title: z.string(),
  url: z.string().optional().nullable(),
  thumbnail_url: z.string().optional().nullable(),
  published_at: z.string().optional().nullable(),
  duration: z.union([z.string(), z.number()]).optional().nullable(),
  duration_seconds: z.number().int().optional().nullable(),
  view_count: z.number().optional().nullable(),
  folder_id: z.string().optional().nullable(),
  folder_name: z.string().optional().nullable(),
  created_at: z.string().optional(),
});
export type FocusTubeCachedVideo = z.infer<typeof FocusTubeCachedVideoSchema>;

export const FocusTubeWatchlistVideoSchema = z.object({
  id: z.string(),
  video_id: z.string(),
  user_id: z.string().optional().nullable(),
  added_at: z.string().optional().nullable(),
  folder_id: z.string().optional().nullable(),
});
export type FocusTubeWatchlistVideo = z.infer<typeof FocusTubeWatchlistVideoSchema>;

export const FocusTubeWatchedVideoSchema = z.object({
  id: z.string(),
  video_id: z.string(),
  user_id: z.string().optional().nullable(),
  watched_at: z.string().optional().nullable(),
});
export type FocusTubeWatchedVideo = z.infer<typeof FocusTubeWatchedVideoSchema>;

export const FocusTubeSavedLinkSchema = z.object({
  id: z.string(),
  url: z.string(),
  title: z.string().optional().nullable(),
  folder_id: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  created_at: z.string().optional(),
});
export type FocusTubeSavedLink = z.infer<typeof FocusTubeSavedLinkSchema>;

export const FocusTubeExportSchema = z.object({
  channel_folders: z.array(FocusTubeFolderSchema).optional().default([]),
  youtube_channels: z.array(FocusTubeChannelSchema).optional().default([]),
  cached_videos: z.array(FocusTubeCachedVideoSchema).optional().default([]),
  watchlist_videos: z.array(FocusTubeWatchlistVideoSchema).optional().default([]),
  watched_videos: z.array(FocusTubeWatchedVideoSchema).optional().default([]),
  saved_links: z.array(FocusTubeSavedLinkSchema).optional().default([]),
});
export type FocusTubeExport = z.infer<typeof FocusTubeExportSchema>;

/* ========================================================================== */
/* Database & Record Models                                                   */
/* ========================================================================== */

export interface YtVideoRecord {
  videoId: string;
  channelId?: string | null;
  channelTitle?: string | null;
  folder: string;
  title: string;
  url: string;
  publishedAt?: string | null;
  transcriptStatus: YtTranscriptStatus;
  transcriptText?: string | null;
  transcriptSegments?: TranscriberSegment[] | null;
  notePath?: string | null;
  watched: boolean;
  durationSeconds?: number | null;
  rawMetadata?: Record<string, unknown> | null;
  createdAt?: string;
  updatedAt?: string;
}

/* ========================================================================== */
/* Service Input & Output Models                                              */
/* ========================================================================== */

export interface FocusTubeImportOptions {
  supabaseUrl?: string;
  anonKey?: string;
  jsonData?: unknown;
  targetFolderPrefix?: string; // Default: 'YouTube'
  autoTranscribe?: boolean;
  createNotes?: boolean;
  linkBrowserFolders?: boolean;
}

export interface FocusTubeImportResult {
  success: boolean;
  importedFoldersCount: number;
  importedVideosCount: number;
  transcribedCount: number;
  notesCreatedCount: number;
  browserFolderLinksCount: number;
  folders: string[];
  videos: YtVideoRecord[];
  errors: string[];
}

export interface VideoTranscribeOptions {
  force?: boolean;
  language?: string;
}

export interface NoteGenerationOptions {
  targetMode?: "direct_spark" | "proposal"; // 'direct_spark' writes to _spark/youtube/, 'proposal' queues to spark_proposals
  folderPrefix?: string; // e.g. "YouTube"
}

export interface NoteGenerationResult {
  success: boolean;
  notePath?: string;
  fullPath?: string;
  proposalId?: string;
  content: string;
  timestampLinkCount: number;
  error?: string;
}

export interface YouTubeStats {
  totalVideos: number;
  totalTranscribed: number;
  totalMissingTranscripts: number;
  totalWatched: number;
  totalDurationSeconds: number;
  folders: { folder: string; count: number }[];
}
