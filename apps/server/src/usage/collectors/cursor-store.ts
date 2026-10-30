import * as fs from "node:fs";
import * as path from "node:path";

/**
 * Manages incremental byte-offset cursors for log files (jsonl tailing).
 * Ensures idempotent processing and prevents re-reading duplicate entries.
 */
export class CursorStore {
  private readonly cursors = new Map<string, number>();

  constructor(initialCursors?: Record<string, number>) {
    if (initialCursors) {
      for (const [file, offset] of Object.entries(initialCursors)) {
        this.cursors.set(path.normalize(file), offset);
      }
    }
  }

  /**
   * Retrieves the current byte offset for a given file.
   */
  getCursor(filePath: string): number {
    return this.cursors.get(path.normalize(filePath)) ?? 0;
  }

  /**
   * Updates the byte offset for a given file.
   */
  setCursor(filePath: string, offset: number): void {
    this.cursors.set(path.normalize(filePath), Math.max(0, offset));
  }

  /**
   * Checks whether a cursor exists for a given file.
   */
  hasCursor(filePath: string): boolean {
    return this.cursors.has(path.normalize(filePath));
  }

  /**
   * Clears cursor for a specific file or all files.
   */
  reset(filePath?: string): void {
    if (filePath) {
      this.cursors.delete(path.normalize(filePath));
    } else {
      this.cursors.clear();
    }
  }

  /**
   * Returns a snapshot of all tracked cursors.
   */
  getAll(): Record<string, number> {
    const result: Record<string, number> = {};
    for (const [key, val] of this.cursors.entries()) {
      result[key] = val;
    }
    return result;
  }

  /**
   * Initializes cursors from previous usage samples (e.g. from DB).
   * Finds the maximum offset for each sourceFile.
   */
  initFromSamples(
    samples: Array<{ sourceFile?: string | null; offset?: number | null }>
  ): void {
    for (const sample of samples) {
      if (!sample.sourceFile || sample.offset === undefined || sample.offset === null) {
        continue;
      }
      const norm = path.normalize(sample.sourceFile);
      const current = this.cursors.get(norm) ?? 0;
      if (sample.offset > current) {
        this.cursors.set(norm, sample.offset);
      }
    }
  }

  /**
   * Loads cursors from a JSON file.
   */
  async loadFromFile(storeFilePath: string): Promise<void> {
    try {
      if (!fs.existsSync(storeFilePath)) return;
      const content = await fs.promises.readFile(storeFilePath, "utf-8");
      const data = JSON.parse(content) as Record<string, number>;
      for (const [file, offset] of Object.entries(data)) {
        if (typeof offset === "number") {
          this.cursors.set(path.normalize(file), offset);
        }
      }
    } catch {
      // Ignore or log error silently
    }
  }

  /**
   * Persists cursors to a JSON file.
   */
  async saveToFile(storeFilePath: string): Promise<void> {
    const dir = path.dirname(storeFilePath);
    if (!fs.existsSync(dir)) {
      await fs.promises.mkdir(dir, { recursive: true });
    }
    const data = this.getAll();
    await fs.promises.writeFile(storeFilePath, JSON.stringify(data, null, 2), "utf-8");
  }

  /**
   * Reads only new complete lines from a file starting from the current cursor offset.
   * Handles:
   * - File truncation/rotation (size < offset -> reset to 0)
   * - Incomplete trailing lines (held back until next poll)
   * - Accurate byte-offset tracking for each line
   */
  async readNewLines(
    filePath: string
  ): Promise<{ lines: Array<{ line: string; offset: number }>; newOffset: number }> {
    const norm = path.normalize(filePath);
    if (!fs.existsSync(norm)) {
      return { lines: [], newOffset: this.getCursor(norm) };
    }

    const stat = await fs.promises.stat(norm);
    let currentOffset = this.getCursor(norm);

    // If file was truncated or rotated, reset cursor
    if (stat.size < currentOffset) {
      currentOffset = 0;
    }

    if (stat.size === currentOffset) {
      return { lines: [], newOffset: currentOffset };
    }

    const bytesToRead = stat.size - currentOffset;
    const buffer = Buffer.alloc(bytesToRead);

    const handle = await fs.promises.open(norm, "r");
    try {
      await handle.read(buffer, 0, bytesToRead, currentOffset);
    } finally {
      await handle.close();
    }

    // Find the last newline to ensure we only process complete lines
    const lastNewlineIdx = buffer.lastIndexOf(0x0a); // '\n'
    if (lastNewlineIdx === -1) {
      // No complete line yet, wait for more data
      return { lines: [], newOffset: currentOffset };
    }

    // Process complete bytes up to lastNewlineIdx
    const validBytes = buffer.subarray(0, lastNewlineIdx + 1);
    const text = validBytes.toString("utf-8");

    const lines: Array<{ line: string; offset: number }> = [];
    let lineByteOffset = currentOffset;
    let byteTracker = 0;

    // Split text by lines while tracking UTF-8 byte offsets
    const rawLines = text.split("\n");
    for (let i = 0; i < rawLines.length; i++) {
      let l = rawLines[i];
      if (l.endsWith("\r")) {
        l = l.slice(0, -1);
      }

      const lineBytes = Buffer.byteLength(rawLines[i], "utf-8") + 1; // + 1 for '\n'
      const startOffset = currentOffset + byteTracker;
      byteTracker += lineBytes;

      const trimmed = l.trim();
      if (trimmed.length > 0) {
        lines.push({ line: trimmed, offset: startOffset });
      }
    }

    const newOffset = currentOffset + lastNewlineIdx + 1;
    this.setCursor(norm, newOffset);

    return { lines, newOffset };
  }
}
