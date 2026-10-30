/**
 * Automated Test Suite for Spark-Learn YouTube Integration (Lane 5)
 */

import { describe, it, expect, beforeAll } from "bun:test";
import {
  extractVideoId,
  formatTimestamp,
  buildTimestampUrl,
  fetchDirectCaptions,
  getCanonicalFallbackCaptions,
  formatTranscriptMarkdown,
} from "../src/brain/learn/youtube/captions";
import {
  parseFocusTubeJson,
  getFocusTubeSeedDataset,
  mapFocusTubeToVideoRecords,
} from "../src/brain/learn/youtube/focus-tube";
import { YoutubeStore } from "../src/brain/learn/youtube/store";
import { generateVideoNoteContent } from "../src/brain/learn/youtube/note-generator";
import { YoutubeLearnService } from "../src/brain/learn/youtube/service";

describe("Lane 5: Spark-Learn YouTube Integration", () => {
  describe("Captions & Timestamp Utilities", () => {
    it("extracts clean 11-char video ID from multiple URL formats", () => {
      expect(extractVideoId("kCc8FmEb1nY")).toBe("kCc8FmEb1nY");
      expect(extractVideoId("https://www.youtube.com/watch?v=kCc8FmEb1nY")).toBe("kCc8FmEb1nY");
      expect(extractVideoId("https://youtu.be/kCc8FmEb1nY?t=120")).toBe("kCc8FmEb1nY");
      expect(extractVideoId("https://www.youtube.com/embed/kCc8FmEb1nY")).toBe("kCc8FmEb1nY");
    });

    it("formats seconds to MM:SS and HH:MM:SS correctly", () => {
      expect(formatTimestamp(0)).toBe("00:00");
      expect(formatTimestamp(45)).toBe("00:45");
      expect(formatTimestamp(185)).toBe("03:05");
      expect(formatTimestamp(3665)).toBe("01:01:05");
    });

    it("builds correct clickable YouTube timestamp URLs", () => {
      expect(buildTimestampUrl("kCc8FmEb1nY", 360)).toBe(
        "https://www.youtube.com/watch?v=kCc8FmEb1nY&t=360s",
      );
    });

    it("formats structured markdown transcript with clickable timestamps", () => {
      const segments = [
        { start: 0, end: 30, text: "Introduction" },
        { start: 30, end: 90, text: "Architecture" },
      ];
      const md = formatTranscriptMarkdown("test1234567", "Test Video", segments);
      expect(md).toContain("[00:00](https://www.youtube.com/watch?v=test1234567&t=0s) Introduction");
      expect(md).toContain("[00:30](https://www.youtube.com/watch?v=test1234567&t=30s) Architecture");
    });

    it("returns rich canonical fallback transcript for known seed videos", () => {
      const transcript = getCanonicalFallbackCaptions("kCc8FmEb1nY");
      expect(transcript.segments).toBeDefined();
      expect(transcript.segments!.length).toBeGreaterThanOrEqual(5);
      expect(transcript.segments![0].start).toBe(0);
      expect(transcript.segments![3].text).toContain("self-attention");
    });
  });

  describe("Focus-Tube-Filter Parser & Seed Dataset", () => {
    it("parses seed dataset containing 5 curated videos", () => {
      const seed = getFocusTubeSeedDataset();
      expect(seed.channel_folders.length).toBe(1);
      expect(seed.cached_videos.length).toBe(5);
      expect(seed.channel_folders[0].name).toBe("AI & Modern Web");
    });

    it("maps focus-tube tables to YtVideoRecord[]", () => {
      const seed = getFocusTubeSeedDataset();
      const mapped = mapFocusTubeToVideoRecords(seed, { targetFolderPrefix: "YouTube" });
      expect(mapped.videos.length).toBe(5);
      expect(mapped.videos[0].folder).toBe("YouTube/AI & Modern Web");
      expect(mapped.videos[0].videoId).toBe("kCc8FmEb1nY");
      expect(mapped.videos[0].watched).toBe(true);
    });
  });

  describe("Note Generator", () => {
    it("generates markdown note with Obsidian frontmatter and timestamps", () => {
      const video = {
        videoId: "kCc8FmEb1nY",
        channelTitle: "Andrej Karpathy",
        folder: "YouTube/AI & Modern Web",
        title: "Let's build GPT",
        url: "https://www.youtube.com/watch?v=kCc8FmEb1nY",
        publishedAt: "2023-01-17T18:00:00Z",
        transcriptStatus: "available" as const,
        watched: true,
        durationSeconds: 7530,
        transcriptSegments: [
          { start: 0, end: 60, text: "Introduction" },
          { start: 360, end: 720, text: "The core mathematical intuition of self-attention" },
        ],
      };

      const content = generateVideoNoteContent(video);
      expect(content).toContain('url: "https://www.youtube.com/watch?v=kCc8FmEb1nY"');
      expect(content).toContain('channel: "Andrej Karpathy"');
      expect(content).toContain("watched: true");
      expect(content).toContain("[00:00](https://www.youtube.com/watch?v=kCc8FmEb1nY&t=0s)");
      expect(content).toContain("[06:00](https://www.youtube.com/watch?v=kCc8FmEb1nY&t=360s)");
    });
  });

  describe("End-to-End DoD Service Execution", () => {
    it("successfully runs seed DoD import with 5 videos, transcripts and notes", async () => {
      const srv = new YoutubeLearnService();
      const result = await srv.runSeedDoD();

      expect(result.success).toBe(true);
      expect(result.importedVideosCount).toBe(5);
      expect(result.transcribedCount).toBe(5);
      expect(result.notesCreatedCount).toBe(5);
      expect(result.browserFolderLinksCount).toBe(5);

      const stats = await srv.getStats();
      expect(stats.totalVideos).toBeGreaterThanOrEqual(5);
      expect(stats.totalTranscribed).toBeGreaterThanOrEqual(5);
    });
  });
});
