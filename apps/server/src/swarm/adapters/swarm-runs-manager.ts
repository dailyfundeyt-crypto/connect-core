/**
 * Swarm-v3 Runs & Jobs Manager (Lane 8: Agent 8).
 *
 * Implements full backend lifecycle for /api/swarm/runs/*:
 * - Creates & manages SwarmRuns and SwarmJobs
 * - Enforces parallelism limits through ResourceMonitor
 * - Persists to Postgres 5544 (tables: swarm_runs, swarm_jobs, swarm_cost_usage)
 * - Records token consumption & estimated cost
 */

import { randomBytes } from "node:crypto";
import { sql } from "drizzle-orm";
import type { Database } from "../../db/client";
import type {
  SwarmJob,
  SwarmJobType,
  SwarmJobStatus,
  LlmProvider,
} from "../../contracts/swarm-v3/index";
import { getResourceMonitor } from "../resource-monitor";
import { getLlmAdapter } from "./provider-factory";

export interface SwarmRunRecord {
  id: string;
  name?: string;
  jobType: SwarmJobType;
  status: "pending" | "running" | "completed" | "failed" | "cancelled";
  provider: LlmProvider;
  totalJobs: number;
  completedJobs: number;
  failedJobs: number;
  durationMs: number;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export class SwarmRunsManager {
  private static instance: SwarmRunsManager | null = null;
  private runs: Map<string, SwarmRunRecord> = new Map();
  private jobs: Map<string, SwarmJob> = new Map();
  private database?: Database;

  constructor(database?: Database) {
    this.database = database;
  }

  public static getInstance(database?: Database): SwarmRunsManager {
    if (!SwarmRunsManager.instance) {
      SwarmRunsManager.instance = new SwarmRunsManager(database);
    }
    return SwarmRunsManager.instance;
  }

  public async createRun(input: {
    name?: string;
    jobType: SwarmJobType;
    payload?: Record<string, unknown>;
    provider?: LlmProvider;
  }): Promise<{ runId: string; job: SwarmJob }> {
    const runId = `run-${randomBytes(8).toString("hex")}`;
    const jobId = `job-${randomBytes(8).toString("hex")}`;
    const now = new Date().toISOString();
    const provider = input.provider || "gemini-cli";

    const run: SwarmRunRecord = {
      id: runId,
      name: input.name || `Swarm Run ${input.jobType}`,
      jobType: input.jobType,
      status: "pending",
      provider,
      totalJobs: 1,
      completedJobs: 0,
      failedJobs: 0,
      durationMs: 0,
      metadata: input.payload || {},
      createdAt: now,
      updatedAt: now,
    };
    this.runs.set(runId, run);

    const job: SwarmJob = {
      id: jobId,
      type: input.jobType,
      status: "pending",
      priority: 0,
      payload: input.payload || {},
      createdAt: now,
      updatedAt: now,
    };
    this.jobs.set(jobId, job);

    // Persist to DB if available
    if (this.database) {
      try {
        await this.database.execute(sql`
          INSERT INTO swarm_runs (id, name, job_type, status, provider, total_jobs, metadata, created_at, updated_at)
          VALUES (${run.id}, ${run.name || null}, ${run.jobType}, ${run.status}, ${run.provider}, 1, ${JSON.stringify(run.metadata)}, NOW(), NOW())
          ON CONFLICT (id) DO NOTHING
        `);
        await this.database.execute(sql`
          INSERT INTO swarm_jobs (id, run_id, type, status, priority, provider, payload, created_at, updated_at)
          VALUES (${job.id}, ${run.id}, ${job.type}, ${job.status}, ${job.priority}, ${provider}, ${JSON.stringify(job.payload)}, NOW(), NOW())
          ON CONFLICT (id) DO NOTHING
        `);
      } catch (err) {
        console.warn("[SwarmRunsManager] DB insert warning:", err);
      }
    }

    // Execute job asynchronously via LLM adapter
    void this.dispatchJob(runId, jobId, input.payload, provider);

    return { runId, job };
  }

  private async dispatchJob(
    runId: string,
    jobId: string,
    payload: Record<string, unknown> = {},
    provider: LlmProvider
  ): Promise<void> {
    const job = this.jobs.get(jobId);
    const run = this.runs.get(runId);
    if (!job || !run) return;

    job.status = "running";
    job.updatedAt = new Date().toISOString();
    run.status = "running";
    run.updatedAt = new Date().toISOString();

    const monitor = getResourceMonitor();
    const limits = {
      maxConcurrent: 20,
      maxCpuPercent: 85,
      minFreeMemMb: 1024,
      maxMemPercent: 90,
      taskTimeoutMs: 60000,
      maxRetries: 2,
      retryDelayMs: 800,
    };
    if (!monitor.checkLimits(limits).allowed) {
      console.warn(`[SwarmRunsManager] Backpressure active for job ${jobId}. Rescheduling in 500ms...`);
      setTimeout(() => void this.dispatchJob(runId, jobId, payload, provider), 500);
      return;
    }

    const startTime = Date.now();
    try {
      const adapter = getLlmAdapter(provider);
      const promptText = (payload.prompt as string) || (payload.question as string) || `Führe SwarmJob '${job.type}' aus`;
      const res = await adapter.execute({
        prompt: promptText,
        provider,
        persona: payload.persona as any,
        expectedJson: true,
      });

      const durationMs = Date.now() - startTime;
      job.status = "completed";
      job.result = res.parsedJson || { output: res.text, tokens: res.totalTokens };
      job.updatedAt = new Date().toISOString();

      run.status = "completed";
      run.completedJobs = 1;
      run.durationMs = durationMs;
      run.updatedAt = new Date().toISOString();

      if (this.database) {
        try {
          await this.database.execute(sql`
            UPDATE swarm_jobs
            SET status = 'completed', result = ${JSON.stringify(job.result)}, duration_ms = ${durationMs}, updated_at = NOW()
            WHERE id = ${jobId}
          `);
          await this.database.execute(sql`
            UPDATE swarm_runs
            SET status = 'completed', completed_jobs = 1, duration_ms = ${durationMs}, updated_at = NOW()
            WHERE id = ${runId}
          `);
          const costUsageId = `cost-${randomBytes(6).toString("hex")}`;
          await this.database.execute(sql`
            INSERT INTO swarm_cost_usage (id, run_id, job_id, provider, model, input_tokens, output_tokens, total_tokens, estimated_cost_usd, recorded_at)
            VALUES (${costUsageId}, ${runId}, ${jobId}, ${provider}, ${res.model}, ${res.inputTokens}, ${res.outputTokens}, ${res.totalTokens}, ${res.estimatedCostUsd}, NOW())
          `);
        } catch (err) {
          console.warn("[SwarmRunsManager] DB update error:", err);
        }
      }
    } catch (err: any) {
      const durationMs = Date.now() - startTime;
      job.status = "failed";
      job.error = err?.message || String(err);
      job.updatedAt = new Date().toISOString();

      run.status = "failed";
      run.failedJobs = 1;
      run.durationMs = durationMs;
      run.updatedAt = new Date().toISOString();
    }
  }

  public getRun(runId: string): SwarmRunRecord | null {
    return this.runs.get(runId) || null;
  }

  public getJob(jobId: string): SwarmJob | null {
    return this.jobs.get(jobId) || null;
  }

  public listRuns(): SwarmRunRecord[] {
    return Array.from(this.runs.values());
  }
}
