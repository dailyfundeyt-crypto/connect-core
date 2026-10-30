/**
 * Spark-Learn File Watcher (Lane 1)
 *
 * Read-only watcher on Stefan's Obsidian Vault.
 * Detects .md file changes, additions, and deletions with debounced incremental re-indexing.
 * Never modifies or writes to the vault!
 */

import { type FSWatcher, existsSync, watch } from "node:fs";
import * as path from "node:path";
import { brainRootFor, resolveBrainRoot } from "../../store";
import { type SparkIndexer, getSparkIndexer } from "./indexer";

export interface WatcherOptions {
  indexer?: SparkIndexer;
  debounceMs?: number;
}

export class VaultWatcher {
  private watcher: FSWatcher | null = null;
  private readonly indexer: SparkIndexer;
  private readonly debounceMs: number;
  private vaultRoot: string | null = null;
  private debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private running = false;

  constructor(options?: WatcherOptions) {
    this.indexer = options?.indexer ?? getSparkIndexer();
    this.debounceMs = options?.debounceMs ?? 1000;
  }

  /**
   * Starts watching the active vault directory.
   */
  async start(): Promise<boolean> {
    if (this.running) return true;

    const rootPath = brainRootFor(null);
    const resolved = await resolveBrainRoot(rootPath);
    if (!resolved.available) {
      console.warn(`[VaultWatcher] Vault not available: ${resolved.reason}`);
      return false;
    }

    this.vaultRoot = resolved.root;

    try {
      this.watcher = watch(
        this.vaultRoot,
        { recursive: true },
        (eventType, filename) => {
          if (!filename) return;
          this.handleEvent(eventType, filename);
        },
      );

      this.watcher.on("error", (err) => {
        console.warn("[VaultWatcher] Watcher error:", err.message);
      });

      this.running = true;
      console.log(`[VaultWatcher] Started watching vault at ${this.vaultRoot}`);
      return true;
    } catch (err: any) {
      console.warn(
        `[VaultWatcher] Failed to start watcher on ${this.vaultRoot}:`,
        err.message,
      );
      return false;
    }
  }

  /**
   * Stops the watcher and cancels pending debounces.
   */
  stop(): void {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();
    this.running = false;
    console.log("[VaultWatcher] Stopped watching vault");
  }

  isWatching(): boolean {
    return this.running;
  }

  /**
   * Handles a file system event with path sanitization and debounce.
   */
  private handleEvent(eventType: string, relativeFilename: string): void {
    const normalised = relativeFilename.replace(/\\/g, "/");

    // Only watch .md files
    if (!normalised.toLowerCase().endsWith(".md")) return;

    // Ignore internal dot-folders (.obsidian, .git, .trash), node_modules, temp files
    const segments = normalised.split("/");
    if (
      segments.some(
        (s) =>
          s.startsWith(".") ||
          s === "node_modules" ||
          s.endsWith(".tmp") ||
          s.endsWith(".bak"),
      )
    ) {
      return;
    }

    // Ignore log.md and agents.json
    if (normalised.toLowerCase() === "log.md" || normalised.toLowerCase() === "agents.json") {
      return;
    }

    // Debounce processing to avoid multiple events during save operations
    const existingTimer = this.debounceTimers.get(normalised);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    const timer = setTimeout(async () => {
      this.debounceTimers.delete(normalised);
      await this.processFile(normalised);
    }, this.debounceMs);

    this.debounceTimers.set(normalised, timer);
  }

  /**
   * Re-indexes or removes a file after debounce settles.
   */
  private async processFile(relativePath: string): Promise<void> {
    if (!this.vaultRoot) return;

    const fullPath = path.join(this.vaultRoot, ...relativePath.split("/"));
    try {
      if (existsSync(fullPath)) {
        await this.indexer.indexNote(relativePath);
      } else {
        await this.indexer.removeNote(relativePath);
      }
    } catch (err: any) {
      console.warn(
        `[VaultWatcher] Error processing note ${relativePath}:`,
        err.message,
      );
    }
  }
}

// Global watcher singleton
let defaultWatcherInstance: VaultWatcher | null = null;

export function getVaultWatcher(options?: WatcherOptions): VaultWatcher {
  if (!defaultWatcherInstance) {
    defaultWatcherInstance = new VaultWatcher(options);
  }
  return defaultWatcherInstance;
}
