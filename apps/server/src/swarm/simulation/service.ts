import { randomUUID } from "node:crypto";
import type { Database } from "../../db/client";
import { simEntities, simInjections, simRelations, simReports, simRuns, simTicks } from "./schema";
import { eq } from "drizzle-orm";
import type {
  SimEntity,
  SimInjection,
  SimRelation,
  SimReport,
  SimTick,
  SimulationConfig,
  SimulationRun,
  PresetScenario,
  MiroFishAdapterStatus,
} from "./types";
import { SeedExtractor, type ExtractedWorldModel } from "./seed-extractor";
import { NativeSimulationEngine, PRESET_SCENARIOS } from "./native-engine";
import { MiroFishAdapter } from "./mirofish-adapter";
import { SimulationReportAgent } from "./report-agent";

export class SimulationService {
  private db?: Database;

  // Resilient in-memory store for instant zero-dependency testing and fast cache
  private inMemoryRuns = new Map<string, SimulationRun>();
  private inMemoryEntities = new Map<string, SimEntity[]>();
  private inMemoryRelations = new Map<string, SimRelation[]>();
  private inMemoryTicks = new Map<string, SimTick[]>();
  private inMemoryInjections = new Map<string, SimInjection[]>();
  private inMemoryReports = new Map<string, SimReport>();
  private activeEngines = new Map<string, NativeSimulationEngine>();

  constructor(db?: Database) {
    this.db = db;
  }

  /**
   * Starts a new simulation run using either the native engine or MiroFish sidecar.
   */
  public async startRun(params: {
    name?: string;
    seed?: Record<string, unknown>;
    engine?: "native" | "mirofish";
    planDocIds?: string[];
    planFilePaths?: string[];
  }): Promise<{ run: SimulationRun; initialGraph: { entities: SimEntity[]; relations: SimRelation[] } }> {
    const runId = `sim-${randomUUID().slice(0, 8)}`;
    const engine = params.engine || "native";
    const name = params.name || `Simulation ${runId} (${engine})`;
    const seed = params.seed || {};

    const now = new Date().toISOString();
    const run: SimulationRun = {
      id: runId,
      name,
      seed,
      status: "running",
      engine,
      createdAt: now,
      updatedAt: now,
    };

    this.inMemoryRuns.set(runId, run);

    // Extract seed world model (entities & relations) from Spark plans
    const worldModel = SeedExtractor.extractFromFiles(runId, params.planFilePaths);
    this.inMemoryEntities.set(runId, worldModel.entities);
    this.inMemoryRelations.set(runId, worldModel.relations);
    this.inMemoryTicks.set(runId, []);
    this.inMemoryInjections.set(runId, []);

    // Try persisting to DB
    if (this.db) {
      try {
        await this.db.insert(simRuns).values({
          id: run.id,
          name: run.name,
          engine: run.engine,
          status: run.status,
          seed: run.seed || {},
          budgetTokens: 50000,
          usedTokens: 0,
          maxTicks: 10,
          currentTick: 0,
        });

        for (const ent of worldModel.entities) {
          await this.db.insert(simEntities).values({
            runId: ent.runId,
            id: ent.id,
            name: ent.name,
            type: ent.type,
            attributes: ent.attributes || {},
          });
        }

        for (const rel of worldModel.relations) {
          await this.db.insert(simRelations).values({
            id: `rel-${randomUUID().slice(0, 8)}`,
            runId: rel.runId,
            source: rel.source,
            target: rel.target,
            type: rel.type,
            weight: rel.weight?.toString() || "1.000",
            attributes: rel.attributes || {},
          });
        }
      } catch {
        // Fallback to in-memory store silently
      }
    }

    // Initialize native engine instance
    const config: SimulationConfig = {
      runId,
      name,
      engine,
      maxTicks: 10,
      budgetTokens: 50000,
      seed,
    };

    const nativeEngine = new NativeSimulationEngine(config);
    this.activeEngines.set(runId, nativeEngine);

    return {
      run,
      initialGraph: {
        entities: worldModel.entities,
        relations: worldModel.relations,
      },
    };
  }

  /**
   * Retrieves simulation run details.
   */
  public async getRun(runId: string): Promise<SimulationRun | null> {
    if (this.inMemoryRuns.has(runId)) {
      return this.inMemoryRuns.get(runId)!;
    }

    if (this.db) {
      try {
        const rows = await this.db.select().from(simRuns).where(eq(simRuns.id, runId)).limit(1);
        if (rows.length > 0) {
          const r = rows[0];
          return {
            id: r.id,
            name: r.name || undefined,
            status: r.status as any,
            engine: r.engine as any,
            seed: (r.seed as any) || undefined,
            createdAt: r.createdAt.toISOString(),
            updatedAt: r.updatedAt.toISOString(),
          };
        }
      } catch {
        // Ignore
      }
    }

    return null;
  }

  /**
   * Lists all simulation runs.
   */
  public async listRuns(): Promise<SimulationRun[]> {
    const list = Array.from(this.inMemoryRuns.values());
    if (list.length > 0) return list;

    if (this.db) {
      try {
        const rows = await this.db.select().from(simRuns).limit(50);
        return rows.map((r) => ({
          id: r.id,
          name: r.name || undefined,
          status: r.status as any,
          engine: r.engine as any,
          seed: (r.seed as any) || undefined,
          createdAt: r.createdAt.toISOString(),
          updatedAt: r.updatedAt.toISOString(),
        }));
      } catch {
        // Ignore
      }
    }

    return [];
  }

  /**
   * Retrieves the entity/relation graph for a run.
   */
  public async getGraph(
    runId: string
  ): Promise<{ entities: SimEntity[]; relations: SimRelation[] }> {
    const entities = this.inMemoryEntities.get(runId) || [];
    const relations = this.inMemoryRelations.get(runId) || [];
    return { entities, relations };
  }

  /**
   * Injects a God's-Eye variable or event into a running simulation.
   */
  public async injectEvent(params: {
    runId: string;
    tick?: number;
    type: string;
    payload: Record<string, unknown>;
  }): Promise<SimInjection> {
    const injection: SimInjection = {
      runId: params.runId,
      tick: params.tick,
      type: params.type,
      payload: params.payload,
    };

    const list = this.inMemoryInjections.get(params.runId) || [];
    list.push(injection);
    this.inMemoryInjections.set(params.runId, list);

    if (this.db) {
      try {
        await this.db.insert(simInjections).values({
          id: `inj-${randomUUID().slice(0, 8)}`,
          runId: params.runId,
          tick: params.tick,
          type: params.type,
          payload: params.payload,
          applied: false,
        });
      } catch {
        // Ignore
      }
    }

    return injection;
  }

  /**
   * Executes ticks for a simulation run.
   */
  public async stepRun(runId: string, count = 1): Promise<SimTick[]> {
    const run = await this.getRun(runId);
    if (!run) throw new Error(`Simulation run '${runId}' not found`);

    if (run.engine === "mirofish" && MiroFishAdapter.isEnabled()) {
      // MiroFish Sidecar execution
      const report = await MiroFishAdapter.executeRun({
        runId,
        name: run.name || runId,
        engine: "mirofish",
        maxTicks: count,
        budgetTokens: 50000,
        seed: run.seed || {},
      });

      this.inMemoryReports.set(runId, report);
      run.status = "completed";
      return this.inMemoryTicks.get(runId) || [];
    }

    // Native Engine execution
    let engine = this.activeEngines.get(runId);
    if (!engine) {
      engine = new NativeSimulationEngine({
        runId,
        name: run.name || runId,
        engine: "native",
        maxTicks: 10,
        budgetTokens: 50000,
        seed: {
          ...(run.seed || {}),
          customInjections: this.inMemoryInjections.get(runId) || [],
        },
      });
      this.activeEngines.set(runId, engine);
    }

    const newTicks = engine.step(count);
    const existingTicks = this.inMemoryTicks.get(runId) || [];
    const allTicks = [...existingTicks, ...newTicks];
    this.inMemoryTicks.set(runId, allTicks);

    if (allTicks.length >= 10) {
      run.status = "completed";
    }

    return newTicks;
  }

  /**
   * Retrieves or computes the simulation report.
   */
  public async getReport(runId: string): Promise<SimReport> {
    if (this.inMemoryReports.has(runId)) {
      return this.inMemoryReports.get(runId)!;
    }

    const run = await this.getRun(runId);
    if (!run) throw new Error(`Simulation run '${runId}' not found`);

    let engine = this.activeEngines.get(runId);
    if (!engine) {
      // Run full simulation if not yet executed
      engine = new NativeSimulationEngine({
        runId,
        name: run.name || runId,
        engine: run.engine,
        maxTicks: 10,
        budgetTokens: 50000,
        seed: {
          ...(run.seed || {}),
          customInjections: this.inMemoryInjections.get(runId) || [],
        },
      });
      engine.step(10);
      this.activeEngines.set(runId, engine);
      this.inMemoryTicks.set(runId, engine.getTicks());
    }

    const report = SimulationReportAgent.generateReport({
      config: {
        runId,
        name: run.name || runId,
        engine: run.engine,
        maxTicks: 10,
        budgetTokens: 50000,
        seed: run.seed || {},
      },
      ticks: engine.getTicks(),
      metricsHistory: engine.getMetricsHistory(),
      engineUsed: run.engine,
    });

    this.inMemoryReports.set(runId, report);
    return report;
  }

  /**
   * Previews seed extraction from Spark plan files.
   */
  public extractSeedPreview(filePaths?: string[]): ExtractedWorldModel {
    return SeedExtractor.extractFromFiles("preview-run", filePaths);
  }

  /**
   * Returns predefined $100M Money Model scenario templates.
   */
  public listPresetScenarios(): PresetScenario[] {
    return PRESET_SCENARIOS;
  }

  /**
   * Checks engine statuses (Native & MiroFish).
   */
  public async getEngineStatus(): Promise<{
    native: boolean;
    mirofish: MiroFishAdapterStatus;
  }> {
    const mirofishStatus = await MiroFishAdapter.getStatus();
    return {
      native: true,
      mirofish: mirofishStatus,
    };
  }
}
