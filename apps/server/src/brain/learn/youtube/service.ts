/**
 * YouTube Learn Service (Lane 5)
 *
 * Core orchestrator for:
 * 1. Focus-tube-filter import (Supabase REST, JSON export, Curated Seed)
 * 2. Multi-tiered transcription with timestamped segments
 * 3. Safe Spark vault note creation under _spark/youtube/ and proposal queues
 * 4. Linking into Browser-Folders (swarm-v3 Lane 3)
 * 5. Triggering indexing into Lane 1 for semantic Q&A citations
 */

import type {
  YtVideoRecord,
  FocusTubeImportOptions,
  FocusTubeImportResult,
  VideoTranscribeOptions,
  NoteGenerationOptions,
  NoteGenerationResult,
  YouTubeStats,
  YtTranscriptStatus,
} from "./types";
import { YoutubeStore, getYoutubeStore } from "./store";
import {
  fetchYouTubeTranscript,
  extractVideoId,
  buildTimestampUrl,
} from "./captions";
import {
  fetchFocusTubeFromSupabase,
  parseFocusTubeJson,
  getFocusTubeSeedDataset,
  mapFocusTubeToVideoRecords,
} from "./focus-tube";
import { createOrUpdateVideoNote } from "./note-generator";
import { BrowserFoldersLinker, getBrowserFoldersLinker } from "./browser-folders-linker";
import { getSparkIndexer } from "../index/indexer";

export class YoutubeLearnService {
  private store: YoutubeStore;
  private linker: BrowserFoldersLinker;

  constructor(options?: { store?: YoutubeStore; linker?: BrowserFoldersLinker }) {
    this.store = options?.store || getYoutubeStore();
    this.linker = options?.linker || getBrowserFoldersLinker();
  }

  /**
   * Imports videos and folders from focus-tube-filter (via Supabase REST, JSON, or Preset).
   */
  async importVideos(options: FocusTubeImportOptions): Promise<FocusTubeImportResult> {
    const errors: string[] = [];
    let exportData: ReturnType<typeof getFocusTubeSeedDataset>;

    if (options.supabaseUrl && options.anonKey) {
      try {
        exportData = await fetchFocusTubeFromSupabase(
          options.supabaseUrl,
          options.anonKey,
        );
      } catch (err: any) {
        errors.push(`Supabase fetch failed: ${err?.message}`);
        exportData = {
          channel_folders: [],
          youtube_channels: [],
          cached_videos: [],
          watchlist_videos: [],
          watched_videos: [],
          saved_links: [],
        };
      }
    } else if (options.jsonData) {
      try {
        exportData = parseFocusTubeJson(options.jsonData);
      } catch (err: any) {
        errors.push(`JSON parse failed: ${err?.message}`);
        exportData = {
          channel_folders: [],
          youtube_channels: [],
          cached_videos: [],
          watchlist_videos: [],
          watched_videos: [],
          saved_links: [],
        };
      }
    } else {
      exportData = getFocusTubeSeedDataset();
    }

    const { folders, videos } = mapFocusTubeToVideoRecords(exportData, {
      targetFolderPrefix: options.targetFolderPrefix || "YouTube",
    });

    if (videos.length === 0) {
      return {
        success: false,
        importedFoldersCount: 0,
        importedVideosCount: 0,
        transcribedCount: 0,
        notesCreatedCount: 0,
        browserFolderLinksCount: 0,
        folders: [],
        videos: [],
        errors: [...errors, "No valid YouTube videos found in input data."],
      };
    }

    // 1. Save all videos to store
    await this.store.upsertVideos(videos);

    let transcribedCount = 0;
    let notesCreatedCount = 0;
    let browserFolderLinksCount = 0;

    // 2. Process transcription & note generation
    const autoTranscribe = options.autoTranscribe ?? true;
    const createNotes = options.createNotes ?? true;
    const linkBrowserFolders = options.linkBrowserFolders ?? true;

    for (const video of videos) {
      try {
        // A. Transcribe if enabled
        if (autoTranscribe) {
          const transcript = await fetchYouTubeTranscript(video.videoId, {
            preferredLang: "de",
            title: video.title,
          });
          if (transcript && transcript.text) {
            video.transcriptStatus = "available";
            video.transcriptText = transcript.text;
            video.transcriptSegments = transcript.segments || [];
            await this.store.updateTranscript(
              video.videoId,
              "available",
              video.transcriptText,
              video.transcriptSegments,
            );
            transcribedCount++;
          }
        }

        // B. Generate Note in _spark/youtube/... if enabled
        if (createNotes) {
          const noteRes = await createOrUpdateVideoNote(video, {
            targetMode: "direct_spark",
          });
          if (noteRes.success && noteRes.notePath) {
            video.notePath = noteRes.notePath;
            await this.store.updateNotePath(video.videoId, noteRes.notePath);
            notesCreatedCount++;

            // Trigger indexer in Lane 1 for immediate searchability
            try {
              const indexer = getSparkIndexer();
              await indexer.indexNote(noteRes.notePath);
            } catch (idxErr: any) {
              console.warn(
                `[YoutubeLearnService] Indexing failed for note ${noteRes.notePath}:`,
                idxErr?.message,
              );
            }
          }
        }

        // C. Link to Browser-Folders if enabled
        if (linkBrowserFolders) {
          const linkRes = await this.linker.linkVideo(video);
          if (linkRes.linkId) {
            browserFolderLinksCount++;
          }
        }
      } catch (procErr: any) {
        errors.push(`Processing failed for video ${video.videoId}: ${procErr?.message}`);
      }
    }

    const folderNames = Array.from(folders.values());

    return {
      success: true,
      importedFoldersCount: folderNames.length,
      importedVideosCount: videos.length,
      transcribedCount,
      notesCreatedCount,
      browserFolderLinksCount,
      folders: folderNames,
      videos,
      errors,
    };
  }

  /**
   * One-click Definition of Done (DoD) Seed Runner:
   * Imports 1 curated folder with 5 videos, fetches transcripts with timestamps,
   * creates notes under _spark/YouTube/..., links to Browser-Folders, and indexes them in Lane 1.
   */
  async runSeedDoD(): Promise<FocusTubeImportResult> {
    return this.importVideos({
      jsonData: getFocusTubeSeedDataset(),
      targetFolderPrefix: "YouTube",
      autoTranscribe: true,
      createNotes: true,
      linkBrowserFolders: true,
    });
  }

  /**
   * Imports a single YouTube video by URL or Video-ID.
   */
  async importSingleVideo(
    urlOrId: string,
    options?: { folder?: string; autoTranscribe?: boolean },
  ): Promise<YtVideoRecord> {
    const videoId = extractVideoId(urlOrId);
    if (!videoId) {
      throw new Error(`Ungültige YouTube URL oder Video-ID: ${urlOrId}`);
    }

    const folder = options?.folder || "YouTube/Allgemein";
    const url = `https://www.youtube.com/watch?v=${videoId}`;

    // Create initial record
    const record: YtVideoRecord = {
      videoId,
      folder,
      title: `YouTube Video (${videoId})`,
      url,
      transcriptStatus: "missing",
      watched: false,
    };

    await this.store.upsertVideo(record);

    if (options?.autoTranscribe !== false) {
      await this.transcribeVideo(videoId);
    }

    const updated = await this.store.getVideo(videoId);
    return updated || record;
  }

  /**
   * Transcribes a single video by its YouTube ID.
   */
  async transcribeVideo(
    videoId: string,
    options?: VideoTranscribeOptions,
  ): Promise<{
    success: boolean;
    video?: YtVideoRecord;
    segmentsCount: number;
    error?: string;
  }> {
    const video = await this.store.getVideo(videoId);
    if (!video) {
      throw new Error(`Video ${videoId} nicht gefunden.`);
    }

    if (video.transcriptStatus === "available" && !options?.force) {
      return {
        success: true,
        video,
        segmentsCount: video.transcriptSegments?.length || 0,
      };
    }

    await this.store.updateTranscript(videoId, "fetching");

    try {
      const result = await fetchYouTubeTranscript(videoId, {
        preferredLang: options?.language || "de",
        title: video.title,
      });

      const updated = await this.store.updateTranscript(
        videoId,
        "available",
        result.text,
        result.segments || [],
      );

      // If a note already existed, regenerate it with the new timestamped transcript
      if (updated && updated.notePath) {
        await createOrUpdateVideoNote(updated, { targetMode: "direct_spark" });
        try {
          const indexer = getSparkIndexer();
          await indexer.indexNote(updated.notePath);
        } catch {}
      }

      return {
        success: true,
        video: updated || undefined,
        segmentsCount: result.segments?.length || 0,
      };
    } catch (err: any) {
      await this.store.updateTranscript(videoId, "failed");
      return {
        success: false,
        segmentsCount: 0,
        error: err?.message || String(err),
      };
    }
  }

  /**
   * Generates or updates the Markdown note for a video.
   */
  async generateNoteForVideo(
    videoId: string,
    options?: NoteGenerationOptions,
  ): Promise<NoteGenerationResult> {
    const video = await this.store.getVideo(videoId);
    if (!video) {
      throw new Error(`Video ${videoId} nicht gefunden.`);
    }

    const res = await createOrUpdateVideoNote(video, options);
    if (res.success && res.notePath) {
      await this.store.updateNotePath(videoId, res.notePath);
      await this.linker.linkVideo({ ...video, notePath: res.notePath });

      // Trigger indexer in Lane 1
      try {
        const indexer = getSparkIndexer();
        await indexer.indexNote(res.notePath);
      } catch {}
    }

    return res;
  }

  /**
   * Lists all videos matching filter parameters.
   */
  async listVideos(filter?: {
    folder?: string;
    transcriptStatus?: YtTranscriptStatus;
    watched?: boolean;
    search?: string;
  }): Promise<YtVideoRecord[]> {
    return this.store.listVideos(filter);
  }

  /**
   * Retrieves single video by ID.
   */
  async getVideo(videoId: string): Promise<YtVideoRecord | null> {
    return this.store.getVideo(videoId);
  }

  /**
   * Returns aggregated statistics.
   */
  async getStats(): Promise<YouTubeStats> {
    return this.store.getStats();
  }
}

let defaultServiceInstance: YoutubeLearnService | null = null;

export function getYoutubeLearnService(): YoutubeLearnService {
  if (!defaultServiceInstance) {
    defaultServiceInstance = new YoutubeLearnService();
  }
  return defaultServiceInstance;
}
