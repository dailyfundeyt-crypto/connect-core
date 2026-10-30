export * from "./cursor-store";
export * from "./codex";
export * from "./claude";
export * from "./failure-patterns";
export * from "./runtime-counter";
export * from "./antigravity";
export * from "./gemini";
export * from "./hermes";
export * from "./freebuff";

import { collectCodexUsage } from "./codex";
import { collectClaudeUsage } from "./claude";
import { collectAntigravityUsage } from "./antigravity";
import { collectGeminiUsage } from "./gemini";
import { collectHermesUsage } from "./hermes";
import { collectFreebuffUsage } from "./freebuff";
import { CursorStore } from "./cursor-store";
import { conductorService } from "../../connect-mcp/tools/conductor-service";

let collectorsInterval: ReturnType<typeof setInterval> | null = null;
const globalCursorStore = new CursorStore();

export async function runUsageCollectionPass(): Promise<void> {
  try {
    const codex = await collectCodexUsage({ cursorStore: globalCursorStore });
    for (const sample of codex.samples) conductorService.recordUsageSample(sample);
    if (codex.quotaWindows.length > 0) conductorService.updateQuotaWindows(codex.quotaWindows);
  } catch (err) {
    console.warn("[UsageCollector] Codex collection error:", err);
  }

  try {
    const claude = await collectClaudeUsage({ cursorStore: globalCursorStore });
    for (const sample of claude.samples) conductorService.recordUsageSample(sample);
    if (claude.quotaWindows.length > 0) conductorService.updateQuotaWindows(claude.quotaWindows);
  } catch (err) {
    console.warn("[UsageCollector] Claude collection error:", err);
  }

  try {
    const agy = collectAntigravityUsage();
    for (const sample of agy.samples) conductorService.recordUsageSample(sample);
  } catch (err) {
    console.warn("[UsageCollector] Antigravity collection error:", err);
  }

  try {
    const gemini = collectGeminiUsage();
    for (const sample of gemini.samples) conductorService.recordUsageSample(sample);
  } catch (err) {
    console.warn("[UsageCollector] Gemini collection error:", err);
  }

  try {
    const hermes = collectHermesUsage();
    for (const sample of hermes.samples) conductorService.recordUsageSample(sample);
  } catch (err) {
    console.warn("[UsageCollector] Hermes collection error:", err);
  }

  try {
    const freebuff = collectFreebuffUsage();
    for (const sample of freebuff.samples) conductorService.recordUsageSample(sample);
  } catch (err) {
    console.warn("[UsageCollector] Freebuff collection error:", err);
  }
}

export function startUsageCollectors(intervalMs = 60000): void {
  if (collectorsInterval) return;
  void runUsageCollectionPass();
  collectorsInterval = setInterval(() => {
    void runUsageCollectionPass();
  }, intervalMs);
  if (collectorsInterval.unref) {
    collectorsInterval.unref();
  }
}

export function stopUsageCollectors(): void {
  if (collectorsInterval) {
    clearInterval(collectorsInterval);
    collectorsInterval = null;
  }
}
