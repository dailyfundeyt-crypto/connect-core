/**
 * Connect-Sozial: Media Upload & Processing (v06 / A21)
 *
 * Verantwortlich für:
 * - Lokale Bildspeicherung
 * - MIME-Type- und Größenprüfung (max. 10 MB)
 * - EXIF- und Metadaten-Entfernung für JPEG, PNG und WebP
 * - Bereitstellung & Archivierung
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

export const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/svg+xml",
]);

export const MAX_MEDIA_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

export interface MediaRecord {
  id: string;
  filename: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  url: string;
  uploadedBy: string;
  postId?: string;
  companyId?: string;
  exifRemoved: boolean;
  archivedAt?: string;
  createdAt: string;
}

// In-Memory Speicher für Tests / Simulation
const memoryMedia = new Map<string, MediaRecord>();

export function resetMemoryMediaStore(): void {
  memoryMedia.clear();
}

export function getMediaStorageDir(): string {
  const base = process.env.LOCALAPPDATA
    ? join(process.env.LOCALAPPDATA, "ConnectApp")
    : join(homedir(), ".connect-app");
  const dir = join(base, "social-media");
  if (!existsSync(dir)) {
    try {
      mkdirSync(dir, { recursive: true });
    } catch {
      // In Testumgebungen auf Temp ausweichen
      const tempDir = join(homedir(), ".connect-test-media");
      if (!existsSync(tempDir)) mkdirSync(tempDir, { recursive: true });
      return tempDir;
    }
  }
  return dir;
}

/**
 * Entfernt EXIF- und Metadaten-Segmente aus JPEG-Puffern.
 * Identifiziert APP1 (0xFFE1 / Exif), APP13 (0xFFED) und COM (0xFFFE).
 */
export function stripJpegExif(buffer: Buffer): Buffer {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) {
    return buffer; // Kein JPEG
  }

  const chunks: Buffer[] = [Buffer.from([0xff, 0xd8])];
  let pos = 2;

  while (pos < buffer.length - 1) {
    if (buffer[pos] !== 0xff) {
      // Synchronisation verloren, Rest unverändert übernehmen
      chunks.push(buffer.subarray(pos));
      break;
    }

    const marker = buffer[pos + 1];

    // Standalone Marker (RST0..RST7, SOI, TEM)
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7)) {
      chunks.push(buffer.subarray(pos, pos + 2));
      pos += 2;
      continue;
    }

    // EOI (End of Image)
    if (marker === 0xd9) {
      chunks.push(buffer.subarray(pos, pos + 2));
      break;
    }

    // SOS (Start of Scan): Danach folgt der komprimierte Bilddatenstrom bis zum EOI
    if (marker === 0xda) {
      chunks.push(buffer.subarray(pos));
      break;
    }

    if (pos + 4 > buffer.length) {
      chunks.push(buffer.subarray(pos));
      break;
    }

    const segmentLength = buffer.readUInt16BE(pos + 2);
    const end = pos + 2 + segmentLength;

    // Filter: APP1 (Exif / 0xE1), APP13 (IPTC / 0xED), COM (Kommentar / 0xFE) überspringen
    const isExifOrMeta = marker === 0xe1 || marker === 0xed || marker === 0xfe;

    if (!isExifOrMeta && end <= buffer.length) {
      chunks.push(buffer.subarray(pos, end));
    }

    pos = end;
  }

  return Buffer.concat(chunks);
}

/**
 * Entfernt Metadaten-Chunks (eXIf, tEXt, zTXt, iTXt) aus PNG-Puffern.
 */
export function stripPngExif(buffer: Buffer): Buffer {
  const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (buffer.length < 8 || !buffer.subarray(0, 8).equals(pngSignature)) {
    return buffer; // Kein PNG
  }

  const chunks: Buffer[] = [pngSignature];
  let pos = 8;

  while (pos + 8 <= buffer.length) {
    const length = buffer.readUInt32BE(pos);
    const type = buffer.toString("ascii", pos + 4, pos + 8);
    const chunkTotalLen = 4 + 4 + length + 4; // length + type + data + crc

    if (pos + chunkTotalLen > buffer.length) {
      chunks.push(buffer.subarray(pos));
      break;
    }

    // eXIf, tEXt, zTXt, iTXt überspringen
    const drop = type === "eXIf" || type === "tEXt" || type === "zTXt" || type === "iTXt";
    if (!drop) {
      chunks.push(buffer.subarray(pos, pos + chunkTotalLen));
    }

    pos += chunkTotalLen;
  }

  return Buffer.concat(chunks);
}

/**
 * Entfernt Metadaten-Chunks (EXIF, XMP) aus WebP-RIFF-Puffern.
 */
export function stripWebpExif(buffer: Buffer): Buffer {
  if (
    buffer.length < 12 ||
    buffer.toString("ascii", 0, 4) !== "RIFF" ||
    buffer.toString("ascii", 8, 12) !== "WEBP"
  ) {
    return buffer; // Kein WebP
  }

  const chunks: Buffer[] = [];
  let pos = 12;

  while (pos + 8 <= buffer.length) {
    const fourCC = buffer.toString("ascii", pos, pos + 4);
    const size = buffer.readUInt32LE(pos + 4);
    const paddedSize = size + (size % 2); // 2-byte alignment in RIFF
    const totalChunkLen = 8 + paddedSize;

    if (pos + totalChunkLen > buffer.length) {
      chunks.push(buffer.subarray(pos));
      break;
    }

    if (fourCC !== "EXIF" && fourCC !== "XMP ") {
      chunks.push(buffer.subarray(pos, pos + totalChunkLen));
    }

    pos += totalChunkLen;
  }

  const payload = Buffer.concat(chunks);
  const header = Buffer.alloc(12);
  header.write("RIFF", 0, 4, "ascii");
  header.writeUInt32LE(payload.length + 4, 4); // 4 für 'WEBP'
  header.write("WEBP", 8, 4, "ascii");

  return Buffer.concat([header, payload]);
}

/**
 * Bereinigt Metadaten abhängig vom MIME-Type.
 */
export function stripExif(buffer: Buffer, mimeType: string): Buffer {
  if (mimeType === "image/jpeg" || mimeType === "image/jpg") {
    return stripJpegExif(buffer);
  }
  if (mimeType === "image/png") {
    return stripPngExif(buffer);
  }
  if (mimeType === "image/webp") {
    return stripWebpExif(buffer);
  }
  return buffer;
}

/**
 * Speichert eine Bilddatei nach Prüfung und EXIF-Bereinigung.
 */
export async function saveMediaFile(
  buffer: Buffer,
  originalName: string,
  mimeType: string,
  uploadedBy: string,
  options?: { companyId?: string; postId?: string; dbOverride?: any },
): Promise<MediaRecord> {
  const normMime = mimeType.toLowerCase().split(";")[0].trim();
  if (!ALLOWED_MIME_TYPES.has(normMime)) {
    throw new Error(
      `Ungültiger Dateityp: '${normMime}'. Erlaubt sind JPG, PNG, WebP, GIF, SVG.`,
    );
  }

  if (buffer.length > MAX_MEDIA_SIZE_BYTES) {
    throw new Error(
      `Datei zu groß (${(buffer.length / 1024 / 1024).toFixed(1)} MB). Maximal 10 MB erlaubt.`,
    );
  }

  // EXIF und Metadaten entfernen
  const cleanBuffer = stripExif(buffer, normMime);
  const ext = originalName.split(".").pop()?.toLowerCase() || "jpg";
  const id = `media_${randomUUID().replace(/-/g, "").slice(0, 24)}`;
  const filename = `${id}.${ext}`;
  const dir = getMediaStorageDir();
  const filePath = join(dir, filename);

  try {
    writeFileSync(filePath, cleanBuffer);
  } catch (err) {
    console.error("[v06-media] Fehler beim Schreiben der Datei:", err);
  }

  const url = `/api/v06/social/media/${filename}`;
  const now = new Date().toISOString();

  const record: MediaRecord = {
    id,
    filename,
    originalName,
    mimeType: normMime,
    sizeBytes: cleanBuffer.length,
    url,
    uploadedBy,
    postId: options?.postId,
    companyId: options?.companyId,
    exifRemoved: true,
    createdAt: now,
  };

  memoryMedia.set(id, record);

  const sql = options?.dbOverride;
  if (sql) {
    try {
      await sql`
        INSERT INTO social_media (id, filename, original_name, mime_type, size_bytes, url, uploaded_by, post_id, company_id, exif_removed, created_at)
        VALUES (${id}, ${filename}, ${originalName}, ${normMime}, ${cleanBuffer.length}, ${url}, ${uploadedBy}, ${options?.postId || null}, ${options?.companyId || null}, true, now())
      `;
    } catch {
      // In-Memory Fallback bleibt aktiv
    }
  }

  return record;
}

export function getMediaRecord(id: string): MediaRecord | null {
  return memoryMedia.get(id) || null;
}

export function findMediaByFilename(filename: string): MediaRecord | null {
  for (const m of memoryMedia.values()) {
    if (m.filename === filename && !m.archivedAt) {
      return m;
    }
  }
  return null;
}

export function archiveMediaRecord(id: string): boolean {
  const m = memoryMedia.get(id);
  if (!m) return false;
  m.archivedAt = new Date().toISOString();
  return true;
}
