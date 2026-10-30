/**
 * YouTube Video Database Store (Lane 5)
 *
 * Persistence layer for `spark_yt_videos`:
 * - Supports PostgreSQL (Port 5544)
 * - In-memory cache fallback for instant offline execution and unit testing
 * - Safe upsert, status updates, and stats aggregations
 */

import postgres from "postgres";
import type {
  YtVideoRecord,
  YtTranscriptStatus,
  TranscriberSegment,
  YouTubeStats,
} from "./types";
import { resolveDatabaseUrl } from "../index/indexer";

export class YoutubeStore {
  private sql: ReturnType<typeof postgres> | null = null;
  private memoryVideos = new Map<string, YtVideoRecord>();
  private initialized = false;
  private dbUrl: string;

  constructor(customDbUrl?: string) {
    this.dbUrl = customDbUrl || resolveDatabaseUrl();
  }

  /**
   * Initializes PostgreSQL connection and verifies spark_yt_videos table.
   */
  async init(): Promise<void> {
    if (this.initialized) return;

    try {
      this.sql = postgres(this.dbUrl, {
        idle_timeout: 5,
        connect_timeout: 4,
        max: 5,
      });

      await this.ensureTable();
      await this.loadFromDb();
    } catch (err: any) {
      console.warn(
        `[YoutubeStore] Database initialization failed (${err?.message}). Running with in-memory store.`,
      );
      this.sql = null;
    }

    this.initialized = true;
  }

  /**
   * Ensures the spark_yt_videos table and indexes exist.
   */
  async ensureTable(): Promise<void> {
    if (!this.sql) return;

    await this.sql`
      CREATE TABLE IF NOT EXISTS "spark_yt_videos" (
        "video_id" text PRIMARY KEY NOT NULL,
        "channel_id" text,
        "channel_title" text,
        "folder" text NOT NULL,
        "title" text NOT NULL,
        "url" text NOT NULL,
        "published_at" timestamp with time zone,
        "transcript_status" text DEFAULT 'missing' NOT NULL,
        "transcript_text" text,
        "transcript_segments" jsonb,
        "note_path" text,
        "watched" boolean DEFAULT false NOT NULL,
        "duration_seconds" integer,
        "raw_metadata" jsonb,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL,
        "updated_at" timestamp with time zone DEFAULT now() NOT NULL
      );
    `;

    await this.sql`CREATE INDEX IF NOT EXISTS "spark_yt_videos_folder_idx" ON "spark_yt_videos" ("folder")`;
    await this.sql`CREATE INDEX IF NOT EXISTS "spark_yt_videos_channel_id_idx" ON "spark_yt_videos" ("channel_id")`;
    await this.sql`CREATE INDEX IF NOT EXISTS "spark_yt_videos_transcript_status_idx" ON "spark_yt_videos" ("transcript_status")`;
    await this.sql`CREATE INDEX IF NOT EXISTS "spark_yt_videos_url_idx" ON "spark_yt_videos" ("url")`;
  }

  /**
   * Pre-populates in-memory cache from PostgreSQL.
   */
  private async loadFromDb(): Promise<void> {
    if (!this.sql) return;

    try {
      const rows = await this.sql`
        SELECT
          video_id as "videoId",
          channel_id as "channelId",
          channel_title as "channelTitle",
          folder,
          title,
          url,
          published_at as "publishedAt",
          transcript_status as "transcriptStatus",
          transcript_text as "transcriptText",
          transcript_segments as "transcriptSegments",
          note_path as "notePath",
          watched,
          duration_seconds as "durationSeconds",
          raw_metadata as "rawMetadata",
          created_at as "createdAt",
          updated_at as "updatedAt"
        FROM spark_yt_videos
      `;

      for (const row of rows) {
        this.memoryVideos.set(row.videoId, {
          videoId: row.videoId,
          channelId: row.channelId,
          channelTitle: row.channelTitle,
          folder: row.folder,
          title: row.title,
          url: row.url,
          publishedAt: row.publishedAt ? new Date(row.publishedAt).toISOString() : null,
          transcriptStatus: row.transcriptStatus as YtTranscriptStatus,
          transcriptText: row.transcriptText,
          transcriptSegments: row.transcriptSegments as TranscriberSegment[],
          notePath: row.notePath,
          watched: Boolean(row.watched),
          durationSeconds: row.durationSeconds,
          rawMetadata: row.rawMetadata as Record<string, unknown>,
          createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : undefined,
          updatedAt: row.updatedAt ? new Date(row.updatedAt).toISOString() : undefined,
        });
      }
    } catch (err: any) {
      console.warn("[YoutubeStore] Failed to pre-load from DB:", err?.message);
    }
  }

  /**
   * Upserts a single YouTube video record.
   */
  async upsertVideo(video: YtVideoRecord): Promise<YtVideoRecord> {
    await this.init();

    const now = new Date().toISOString();
    const updatedRecord: YtVideoRecord = {
      ...video,
      createdAt: video.createdAt || now,
      updatedAt: now,
    };

    // Update in-memory cache
    this.memoryVideos.set(video.videoId, updatedRecord);

    // Persist to Postgres
    if (this.sql) {
      try {
        await this.sql`
          INSERT INTO spark_yt_videos (
            video_id,
            channel_id,
            channel_title,
            folder,
            title,
            url,
            published_at,
            transcript_status,
            transcript_text,
            transcript_segments,
            note_path,
            watched,
            duration_seconds,
            raw_metadata,
            created_at,
            updated_at
          ) VALUES (
            ${updatedRecord.videoId},
            ${updatedRecord.channelId ?? null},
            ${updatedRecord.channelTitle ?? null},
            ${updatedRecord.folder},
            ${updatedRecord.title},
            ${updatedRecord.url},
            ${updatedRecord.publishedAt ? new Date(updatedRecord.publishedAt) : null},
            ${updatedRecord.transcriptStatus},
            ${updatedRecord.transcriptText ?? null},
            ${updatedRecord.transcriptSegments ? JSON.stringify(updatedRecord.transcriptSegments) : null},
            ${updatedRecord.notePath ?? null},
            ${updatedRecord.watched},
            ${updatedRecord.durationSeconds ?? null},
            ${updatedRecord.rawMetadata ? JSON.stringify(updatedRecord.rawMetadata) : null},
            ${new Date(updatedRecord.createdAt!)},
            ${new Date(updatedRecord.updatedAt!)}
          )
          ON CONFLICT (video_id) DO UPDATE SET
            channel_id = EXCLUDED.channel_id,
            channel_title = EXCLUDED.channel_title,
            folder = EXCLUDED.folder,
            title = EXCLUDED.title,
            url = EXCLUDED.url,
            published_at = EXCLUDED.published_at,
            transcript_status = CASE 
              WHEN spark_yt_videos.transcript_status = 'available' THEN spark_yt_videos.transcript_status 
              ELSE EXCLUDED.transcript_status 
            END,
            transcript_text = COALESCE(spark_yt_videos.transcript_text, EXCLUDED.transcript_text),
            transcript_segments = COALESCE(spark_yt_videos.transcript_segments, EXCLUDED.transcript_segments),
            note_path = COALESCE(spark_yt_videos.note_path, EXCLUDED.note_path),
            watched = EXCLUDED.watched,
            duration_seconds = EXCLUDED.duration_seconds,
            raw_metadata = EXCLUDED.raw_metadata,
            updated_at = EXCLUDED.updated_at
        `;
      } catch (err: any) {
        console.warn(`[YoutubeStore] DB upsert failed for video ${video.videoId}:`, err?.message);
      }
    }

    return updatedRecord;
  }

  /**
   * Upserts multiple videos in batch.
   */
  async upsertVideos(videos: YtVideoRecord[]): Promise<YtVideoRecord[]> {
    const results: YtVideoRecord[] = [];
    for (const v of videos) {
      results.push(await this.upsertVideo(v));
    }
    return results;
  }

  /**
   * Retrieves a single video by its YouTube ID.
   */
  async getVideo(videoId: string): Promise<YtVideoRecord | null> {
    await this.init();
    return this.memoryVideos.get(videoId) || null;
  }

  /**
   * Lists all videos matching optional filters.
   */
  async listVideos(filter?: {
    folder?: string;
    transcriptStatus?: YtTranscriptStatus;
    watched?: boolean;
    search?: string;
  }): Promise<YtVideoRecord[]> {
    await this.init();

    let list = Array.from(this.memoryVideos.values());

    if (filter?.folder) {
      const f = filter.folder.toLowerCase();
      list = list.filter((v) => v.folder.toLowerCase().includes(f));
    }
    if (filter?.transcriptStatus) {
      list = list.filter((v) => v.transcriptStatus === filter.transcriptStatus);
    }
    if (filter?.watched !== undefined) {
      list = list.filter((v) => v.watched === filter.watched);
    }
    if (filter?.search) {
      const q = filter.search.toLowerCase();
      list = list.filter(
        (v) =>
          v.title.toLowerCase().includes(q) ||
          v.videoId.toLowerCase().includes(q) ||
          (v.channelTitle && v.channelTitle.toLowerCase().includes(q)),
      );
    }

    // Sort by createdAt descending
    return list.sort((a, b) => {
      const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return tb - ta;
    });
  }

  /**
   * Updates transcript status and content for a video.
   */
  async updateTranscript(
    videoId: string,
    status: YtTranscriptStatus,
    transcriptText?: string,
    transcriptSegments?: TranscriberSegment[],
  ): Promise<YtVideoRecord | null> {
    const video = await this.getVideo(videoId);
    if (!video) return null;

    video.transcriptStatus = status;
    if (transcriptText !== undefined) video.transcriptText = transcriptText;
    if (transcriptSegments !== undefined) video.transcriptSegments = transcriptSegments;
    video.updatedAt = new Date().toISOString();

    return this.upsertVideo(video);
  }

  /**
   * Updates notePath for a video.
   */
  async updateNotePath(videoId: string, notePath: string): Promise<YtVideoRecord | null> {
    const video = await this.getVideo(videoId);
    if (!video) return null;

    video.notePath = notePath;
    video.updatedAt = new Date().toISOString();

    return this.upsertVideo(video);
  }

  /**
   * Computes summary statistics.
   */
  async getStats(): Promise<YouTubeStats> {
    await this.init();

    const all = Array.from(this.memoryVideos.values());
    const folderMap = new Map<string, number>();

    let totalTranscribed = 0;
    let totalWatched = 0;
    let totalSeconds = 0;

    for (const v of all) {
      folderMap.set(v.folder, (folderMap.get(v.folder) || 0) + 1);
      if (v.transcriptStatus === "available") totalTranscribed++;
      if (v.watched) totalWatched++;
      if (v.durationSeconds) totalSeconds += v.durationSeconds;
    }

    const folders = Array.from(folderMap.entries()).map(([folder, count]) => ({
      folder,
      count,
    }));

    return {
      totalVideos: all.length,
      totalTranscribed,
      totalMissingTranscripts: all.length - totalTranscribed,
      totalWatched,
      totalDurationSeconds: totalSeconds,
      folders,
    };
  }

  /**
   * Cleans up resources.
   */
  async close(): Promise<void> {
    if (this.sql) {
      await this.sql.end();
      this.sql = null;
    }
  }
}

let defaultStoreInstance: YoutubeStore | null = null;

export function getYoutubeStore(dbUrl?: string): YoutubeStore {
  if (!defaultStoreInstance) {
    defaultStoreInstance = new YoutubeStore(dbUrl);
  }
  return defaultStoreInstance;
}
