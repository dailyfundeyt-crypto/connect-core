/**
 * Focus-Tube-Filter Import & Parser (Lane 5)
 *
 * Imports folders, channels, and videos from Stefan's focus-tube-filter app:
 * - Read-only Supabase REST API client (no secrets committed)
 * - JSON export parser (for manual export/import)
 * - Curated Focus-Tube Seed dataset for DoD verification
 */

import {
  type FocusTubeExport,
  FocusTubeExportSchema,
  type FocusTubeFolder,
  type FocusTubeCachedVideo,
  type YtVideoRecord,
} from "./types";
import { extractVideoId } from "./captions";

/* ========================================================================== */
/* Supabase REST Client (Read-Only)                                           */
/* ========================================================================== */

export async function fetchFocusTubeFromSupabase(
  supabaseUrl: string,
  anonKey: string,
): Promise<FocusTubeExport> {
  const cleanUrl = supabaseUrl.replace(/\/+$/, "");
  const headers = {
    apikey: anonKey,
    Authorization: `Bearer ${anonKey}`,
    "Content-Type": "application/json",
  };

  const fetchTable = async (table: string): Promise<any[]> => {
    try {
      const res = await fetch(`${cleanUrl}/rest/v1/${table}?select=*`, {
        headers,
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) {
        console.warn(`[FocusTubeImport] Table ${table} returned status ${res.status}`);
        return [];
      }
      return await res.json();
    } catch (err: any) {
      console.warn(`[FocusTubeImport] Failed to fetch table ${table}:`, err?.message);
      return [];
    }
  };

  const [
    channel_folders,
    youtube_channels,
    cached_videos,
    watchlist_videos,
    watched_videos,
    saved_links,
  ] = await Promise.all([
    fetchTable("channel_folders"),
    fetchTable("youtube_channels"),
    fetchTable("cached_videos"),
    fetchTable("watchlist_videos"),
    fetchTable("watched_videos"),
    fetchTable("saved_links"),
  ]);

  return FocusTubeExportSchema.parse({
    channel_folders,
    youtube_channels,
    cached_videos,
    watchlist_videos,
    watched_videos,
    saved_links,
  });
}

/* ========================================================================== */
/* JSON Parser                                                                */
/* ========================================================================== */

export function parseFocusTubeJson(rawData: unknown): FocusTubeExport {
  if (typeof rawData === "string") {
    const parsed = JSON.parse(rawData);
    return FocusTubeExportSchema.parse(parsed);
  }
  return FocusTubeExportSchema.parse(rawData);
}

/* ========================================================================== */
/* Curated Seed Dataset (5 Videos for DoD & Verification)                     */
/* ========================================================================== */

export function getFocusTubeSeedDataset(): FocusTubeExport {
  const folderId = "folder_ai_fullstack_2026";
  const folderName = "AI & Modern Web";

  const channelFolders: FocusTubeFolder[] = [
    {
      id: folderId,
      name: folderName,
      icon: "brain-circuit",
      color: "#3b82f6",
      sort_order: 1,
      created_at: "2026-10-22T10:00:00Z",
    },
  ];

  const cachedVideos: FocusTubeCachedVideo[] = [
    {
      id: "vid_1",
      video_id: "kCc8FmEb1nY",
      channel_id: "UCXUPKJOtp_1Yg1aBfZtL_tw",
      channel_title: "Andrej Karpathy",
      title: "Let's build GPT: from scratch, in code, spelled out.",
      url: "https://www.youtube.com/watch?v=kCc8FmEb1nY",
      published_at: "2023-01-17T18:00:00Z",
      duration_seconds: 7530,
      folder_id: folderId,
      folder_name: folderName,
    },
    {
      id: "vid_2",
      video_id: "AdNJ3fyNyAo",
      channel_id: "UCfA3v8b6wOls5EwW1Z36pGQ",
      channel_title: "Rich Harris",
      title: "Rethinking Reactivity",
      url: "https://www.youtube.com/watch?v=AdNJ3fyNyAo",
      published_at: "2019-05-02T14:30:00Z",
      duration_seconds: 2240,
      folder_id: folderId,
      folder_name: folderName,
    },
    {
      id: "vid_3",
      video_id: "Zjzb-k5vJbg",
      channel_id: "UCZphfaKqA9v2hP3mZ4A9v2w",
      channel_title: "Lee Robinson",
      title: "Next.js App Router Architecture & React Server Components",
      url: "https://www.youtube.com/watch?v=Zjzb-k5vJbg",
      published_at: "2024-03-12T16:00:00Z",
      duration_seconds: 1890,
      folder_id: folderId,
      folder_name: folderName,
    },
    {
      id: "vid_4",
      video_id: "7qKkY-p7GVs",
      channel_id: "UCXZCJLdBC09xxGZ6gcdrc6A",
      channel_title: "OpenAI",
      title: "Whisper: Robust Speech Recognition via Weakly Supervised Pre-training",
      url: "https://www.youtube.com/watch?v=7qKkY-p7GVs",
      published_at: "2022-09-21T17:00:00Z",
      duration_seconds: 1650,
      folder_id: folderId,
      folder_name: folderName,
    },
    {
      id: "vid_5",
      video_id: "V1po0BT771s",
      channel_id: "UClbWJ96DvdPj_h49wP42W_Q",
      channel_title: "Anders Hejlsberg",
      title: "TypeScript Evolution: Type System Architecture & Compiler Performance",
      url: "https://www.youtube.com/watch?v=V1po0BT771s",
      published_at: "2024-06-05T15:00:00Z",
      duration_seconds: 2950,
      folder_id: folderId,
      folder_name: folderName,
    },
  ];

  return {
    channel_folders: channelFolders,
    youtube_channels: [
      {
        id: "chan_1",
        folder_id: folderId,
        channel_id: "UCXUPKJOtp_1Yg1aBfZtL_tw",
        name: "Andrej Karpathy",
        category: "AI & Deep Learning",
      },
      {
        id: "chan_2",
        folder_id: folderId,
        channel_id: "UCfA3v8b6wOls5EwW1Z36pGQ",
        name: "Rich Harris",
        category: "Web Frameworks & Reactivity",
      },
    ],
    cached_videos: cachedVideos,
    watchlist_videos: [
      { id: "wl_1", video_id: "kCc8FmEb1nY", folder_id: folderId },
      { id: "wl_2", video_id: "AdNJ3fyNyAo", folder_id: folderId },
    ],
    watched_videos: [
      { id: "wt_1", video_id: "kCc8FmEb1nY" },
    ],
    saved_links: [
      {
        id: "sl_1",
        url: "https://github.com/karpathy/nanoGPT",
        title: "nanoGPT GitHub Repository",
        folder_id: folderId,
      },
    ],
  };
}

/* ========================================================================== */
/* Map FocusTubeExport to YtVideoRecord[]                                     */
/* ========================================================================== */

export function mapFocusTubeToVideoRecords(
  data: FocusTubeExport,
  options?: { targetFolderPrefix?: string },
): { folders: Map<string, string>; videos: YtVideoRecord[] } {
  const folderPrefix = options?.targetFolderPrefix || "YouTube";
  const folderIdToName = new Map<string, string>();

  // 1. Map folders
  for (const f of data.channel_folders || []) {
    const cleanName = f.name.trim().replace(/[\\/:*?"<>|]/g, "_");
    folderIdToName.set(f.id, cleanName);
  }

  // 2. Map channels to folders
  const channelToFolder = new Map<string, string>();
  for (const ch of data.youtube_channels || []) {
    if (ch.channel_id && ch.folder_id && folderIdToName.has(ch.folder_id)) {
      channelToFolder.set(ch.channel_id, folderIdToName.get(ch.folder_id)!);
    }
  }

  // 3. Watched set
  const watchedSet = new Set<string>();
  for (const w of data.watched_videos || []) {
    if (w.video_id) watchedSet.add(w.video_id);
  }

  // 4. Transform cached_videos
  const resultVideos: YtVideoRecord[] = [];
  const seenVideoIds = new Set<string>();

  for (const cv of data.cached_videos || []) {
    const vId = extractVideoId(cv.video_id || cv.url || "");
    if (!vId || seenVideoIds.has(vId)) continue;
    seenVideoIds.add(vId);

    // Determine folder name
    let folderName = "Uncategorized";
    if (cv.folder_id && folderIdToName.has(cv.folder_id)) {
      folderName = folderIdToName.get(cv.folder_id)!;
    } else if (cv.channel_id && channelToFolder.has(cv.channel_id)) {
      folderName = channelToFolder.get(cv.channel_id)!;
    } else if (cv.folder_name) {
      folderName = cv.folder_name.trim().replace(/[\\/:*?"<>|]/g, "_");
    }

    const fullFolder = `${folderPrefix}/${folderName}`;
    const url = cv.url || `https://www.youtube.com/watch?v=${vId}`;

    let durationSec = cv.duration_seconds;
    if (!durationSec && typeof cv.duration === "number") {
      durationSec = cv.duration;
    }

    resultVideos.push({
      videoId: vId,
      channelId: cv.channel_id || null,
      channelTitle: cv.channel_title || null,
      folder: fullFolder,
      title: cv.title.trim(),
      url,
      publishedAt: cv.published_at || null,
      transcriptStatus: "missing",
      watched: watchedSet.has(vId),
      durationSeconds: durationSec || null,
      rawMetadata: {
        thumbnailUrl: cv.thumbnail_url,
        viewCount: cv.view_count,
        importedFrom: "focus-tube-filter",
      },
    });
  }

  return {
    folders: folderIdToName,
    videos: resultVideos,
  };
}
