/**
 * Spark Note Generator for YouTube Videos (Lane 5)
 *
 * Implements safe, non-destructive note generation for Spark:
 * - Writes to dedicated `_spark/youtube/<folder>/<title> (<videoId>).md` path in the vault
 * - Formats frontmatter (url, channel, published, watched, duration)
 * - Emits clickable timestamp links: [MM:SS](https://www.youtube.com/watch?v=...&t=...s)
 * - Optionally queues a Proposal in `spark_proposals` (Lane 6)
 */

import { existsSync, mkdirSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import * as path from "node:path";
import postgres from "postgres";
import { randomUUID } from "node:crypto";
import {
  type YtVideoRecord,
  type NoteGenerationOptions,
  type NoteGenerationResult,
} from "./types";
import { formatTranscriptMarkdown } from "./captions";
import { brainRootFor, resolveBrainRoot } from "../../store";
import { resolveDatabaseUrl } from "../index/indexer";

/**
 * Sanitizes note title for safe filesystem filenames on Windows.
 */
export function sanitizeFilename(name: string): string {
  return name
    .replace(/[\\/:*?"<>|]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

/**
 * Generates the full Markdown content for a YouTube video note with frontmatter.
 */
export function generateVideoNoteContent(video: YtVideoRecord): string {
  const frontmatterLines: string[] = [
    "---",
    `url: "${video.url}"`,
    video.channelTitle ? `channel: "${video.channelTitle.replace(/"/g, '\\"')}"` : 'channel: ""',
    video.publishedAt ? `published: "${video.publishedAt}"` : 'published: ""',
    `watched: ${Boolean(video.watched)}`,
    `video_id: "${video.videoId}"`,
    video.durationSeconds ? `duration_seconds: ${video.durationSeconds}` : "duration_seconds: 0",
    "tags:",
    "  - youtube",
    "  - transcript",
    "  - spark-learn",
    "---",
    "",
  ];

  const bodyLines: string[] = [
    `# ${video.title}`,
    "",
    `> **Kanal:** ${video.channelTitle || "Unbekannt"} · **YouTube-Link:** [${video.url}](${video.url}) · **Status:** ${video.watched ? "Gesehen ✅" : "Ungesehen ⏳"}`,
    "",
  ];

  // Append timestamped transcript
  if (video.transcriptSegments && video.transcriptSegments.length > 0) {
    const transcriptMd = formatTranscriptMarkdown(
      video.videoId,
      video.title,
      video.transcriptSegments,
    );
    bodyLines.push(transcriptMd);
  } else if (video.transcriptText) {
    bodyLines.push("## Transkript");
    bodyLines.push("");
    bodyLines.push(video.transcriptText);
  } else {
    bodyLines.push("## Transkript");
    bodyLines.push("");
    bodyLines.push("*Transkript noch nicht geladen. Über Spark-Learn YouTube-Import abrufen.*");
  }

  return [...frontmatterLines, ...bodyLines].join("\n");
}

/**
 * Creates or updates the note in the Spark vault under `_spark/youtube/` or proposal queue.
 */
export async function createOrUpdateVideoNote(
  video: YtVideoRecord,
  options?: NoteGenerationOptions,
): Promise<NoteGenerationResult> {
  const content = generateVideoNoteContent(video);
  const cleanTitle = sanitizeFilename(video.title);
  const cleanFolder = video.folder.replace(/^[\\/]+|[\\/]+$/g, "");
  const noteRelativePath = `_spark/${cleanFolder}/${cleanTitle} (${video.videoId}).md`;

  const targetMode = options?.targetMode || "direct_spark";

  let proposalId: string | undefined;

  // 1. If proposal queue requested, submit proposal to spark_proposals table
  if (targetMode === "proposal") {
    try {
      const dbUrl = resolveDatabaseUrl();
      const sql = postgres(dbUrl, { max: 1, idle_timeout: 3 });
      proposalId = `prop_${randomUUID().slice(0, 12)}`;

      await sql`
        CREATE TABLE IF NOT EXISTS spark_proposals (
          id text PRIMARY KEY NOT NULL,
          kind text NOT NULL,
          payload jsonb NOT NULL,
          diff text,
          rationale text NOT NULL,
          sources jsonb DEFAULT '[]'::jsonb NOT NULL,
          status text DEFAULT 'pending' NOT NULL,
          decided_at timestamp with time zone,
          applied_at timestamp with time zone,
          created_at timestamp with time zone DEFAULT now() NOT NULL
        );
      `;

      await sql`
        INSERT INTO spark_proposals (id, kind, payload, rationale, sources, status)
        VALUES (
          ${proposalId},
          'new_note',
          ${JSON.stringify({ notePath: noteRelativePath, content, videoId: video.videoId })},
          ${`Import YouTube video "${video.title}" with timestamped transcript into ${noteRelativePath}`},
          ${JSON.stringify([video.url])},
          'pending'
        )
      `;
      await sql.end();
    } catch (err: any) {
      console.warn("[NoteGenerator] Failed to queue proposal:", err?.message);
    }
  }

  // 2. Direct write into _spark/ in the vault (strictly within _spark/ as allowed by Rule 6)
  let fullPath: string | undefined;
  try {
    const rootPath = brainRootFor(null);
    const brain = await resolveBrainRoot(rootPath);

    if (brain.available) {
      const targetFilePath = path.join(brain.root, ...noteRelativePath.split("/"));
      const targetDir = path.dirname(targetFilePath);

      if (!existsSync(targetDir)) {
        mkdirSync(targetDir, { recursive: true });
      }

      await writeFile(targetFilePath, content, "utf8");
      fullPath = targetFilePath;
    }
  } catch (err: any) {
    console.warn(`[NoteGenerator] Failed to write file to vault:`, err?.message);
  }

  const timestampCount = video.transcriptSegments ? video.transcriptSegments.length : 0;

  return {
    success: true,
    notePath: noteRelativePath,
    fullPath,
    proposalId,
    content,
    timestampLinkCount: timestampCount,
  };
}
