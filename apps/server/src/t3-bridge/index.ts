/**
 * T3-Bridge — Server-Verdrahtung (Lane A37).
 *
 * Bündelt die Module der Wellen W1–W3 an einer Stelle, damit `app.ts` nur
 * wenige Zeilen braucht. Jeder Mount ist hinter seinem A01-Flag: ist nichts
 * davon gesetzt, wird weder eine Route registriert noch ein Sidecar gestartet.
 *
 * Regeln dieser Lane:
 *  - Nur Loopback/Sidecar; keine Tokens verlassen den Server.
 *  - Flag aus = altes Verhalten (keine Route, kein Prozess, kein Verhalten).
 *  - Kein Modul hier kennt Klartext-Tokens; der Tresor bleibt in A10.
 */

import { Hono, type MiddlewareHandler } from "hono";
import {
  createAgentAvatarRoutes,
  createAgentAvatarService,
  DrizzleAgentAvatarStore,
  MemoryAgentAvatarStore,
} from "../agent-avatar";
import type { AgentProfileStore } from "../agents/profile-store";
import type { AppVariables, AuthService } from "../auth/guards";
import { createCompanyUsageRoutes } from "../company-usage";
import {
  createCuaService,
  createMachineRoutes,
  setGlobalCuaService,
} from "../cua";
import type { Database } from "../db/client";
import { createT3AttachmentsRoutes } from "./attachments";
import {
  createT3AuthMiddleware,
  createT3AuthRoutes,
  getSharedPairingService,
  getSharedTokenVault,
  RedactedLogger,
} from "./auth";
import { allT3Flags, getT3Flag } from "./contracts";
import { setGlobalControlService, T3ControlService } from "./control";
import { createFleetRoutes } from "./fleet";
import { createT3MobileRoutes } from "./mobile";
import { createT3ApprovalsRoutes } from "./routes/approvals";
import { createT3ControlRoutes } from "./routes/control";
import { createT3MessagesRoutes } from "./routes/messages";
import { createT3StreamRoutes } from "./routes/stream";
import { createUsageRoutes } from "./routes/usage";
import { T3RpcClient } from "./rpc";
import { getT3SidecarStatus, startT3Sidecar } from "./sidecar";
import {
  createThreadMapStore,
  setGlobalThreadService,
  T3ThreadService,
} from "./threads";
import { createUsageBridgeService } from "./usage";

const logger = new RedactedLogger("T3BridgeWiring");

/** Der Supervisor ist ein Prozess-Singleton; ein zweiter Start wäre nur Rauschen. */
let sidecarStartRequested = false;

/** Was die Verdrahtung aus `createApp` braucht. */
export type MountT3BackendOptions = {
  /** Better-Auth oder `null` im Einzelnutzer-Modus. */
  readonly auth?: AuthService | null;
  /** `config.singleUser` — ohne Login ist der lokale Entwickler der Akteur. */
  readonly singleUser?: boolean;
  /** Für Thread-Map und Avatar-Tabelle; ohne DB bleiben beide im Speicher. */
  readonly database?: Database;
  /** Wird für Avatare gebraucht, damit nur sichtbare Agenten ein Gesicht bekommen. */
  readonly agentProfileStore?: AgentProfileStore;
  /** Der bereits gebaute Auth-Guard aus `app.ts`. */
  readonly requireUser: MiddlewareHandler<{ Variables: AppVariables }>;
  /** Nur für Tests: den Sidecar-Start überspringen, Routen aber mounten. */
  readonly skipSidecarStart?: boolean;
};

/**
 * Der RPC-Client entsteht erst beim ersten Aufruf.
 *
 * Connect startet den Sidecar asynchron; ein Client, der beim Mount sofort
 * verbindet, würde den Start regelmäßig verlieren. Der Lazy-Client verbindet
 * deshalb erst, wenn wirklich ein Turn/Thread gebraucht wird, und holt den
 * Bearer-Token aus dem A10-Tresor — nie aus einer Datei oder Umgebung.
 */
class LazyT3RpcClient {
  #client: T3RpcClient | null = null;
  #connecting: Promise<T3RpcClient> | null = null;

  async #get(): Promise<T3RpcClient> {
    if (this.#client) return this.#client;
    if (!this.#connecting) {
      this.#connecting = this.#connect().finally(() => {
        this.#connecting = null;
      });
    }
    return this.#connecting;
  }

  async #connect(): Promise<T3RpcClient> {
    const status = getT3SidecarStatus();
    if (!status.running || !status.origin) {
      throw new Error(
        "Der T3-Sidecar läuft nicht. Bitte die T3-Brücke in den Einstellungen starten.",
      );
    }

    const token = await getSharedTokenVault().getToken();
    if (!token) {
      throw new Error(
        "Die T3-Brücke ist noch nicht gekoppelt. Bitte Connect einmal mit dem Sidecar verbinden.",
      );
    }

    const client = new T3RpcClient({
      origin: status.origin,
      bearerToken: token,
      log: (message, detail) => logger.debug(message, detail),
    });
    await client.connect();
    this.#client = client;
    return client;
  }

  async ensureProject(input: {
    readonly projectId: string;
    readonly title: string;
    readonly workspaceRoot: string;
    readonly createWorkspaceRootIfMissing?: boolean;
  }): Promise<{ readonly projectId: string; readonly workspaceRoot: string }> {
    return (await this.#get()).ensureProject(input);
  }

  async createThread(command: {
    readonly commandId: string;
    readonly threadId: string;
    readonly projectId: string;
    readonly title: string;
    readonly provider: Parameters<T3RpcClient["createThread"]>[0]["provider"];
    readonly model: string;
    readonly cwd?: string | null;
  }): Promise<unknown> {
    return (await this.#get()).createThread(command);
  }

  async startTurn(command: {
    readonly commandId: string;
    readonly threadId: string;
    readonly messageId: string;
    readonly text: string;
    readonly provider?: Parameters<T3RpcClient["startTurn"]>[0]["provider"];
    readonly model?: string;
    readonly attachments?: ReadonlyArray<unknown>;
    readonly dispatchMode?: { readonly type: "start_immediately" };
  }): Promise<unknown> {
    return (await this.#get()).startTurn(command);
  }

  async getThreadSnapshot(input: {
    readonly threadId: string;
  }): Promise<unknown> {
    return (await this.#get()).getThreadSnapshot(input);
  }

  async interruptTurn(command: {
    readonly commandId: string;
    readonly threadId: string;
    readonly runId: string;
    readonly reason?: string;
  }): Promise<unknown> {
    return (await this.#get()).interruptTurn(command);
  }

  async steerTurn(command: {
    readonly commandId: string;
    readonly threadId: string;
    readonly messageId: string;
    readonly text: string;
    readonly targetRunId?: string;
  }): Promise<unknown> {
    return (await this.#get()).steerTurn(command);
  }

  async respondToRuntimeRequest(command: {
    readonly commandId: string;
    readonly threadId: string;
    readonly requestId: string;
    readonly decision?: Parameters<
      T3RpcClient["respondToRuntimeRequest"]
    >[0]["decision"];
    readonly feedback?: string;
    readonly answers?: Record<string, unknown>;
  }): Promise<unknown> {
    return (await this.#get()).respondToRuntimeRequest(command);
  }
}

/** Baut die Routen, die unter `/api/t3` hängen. */
function createT3App(options: MountT3BackendOptions) {
  const authMiddleware = createT3AuthMiddleware({
    auth: options.auth ?? undefined,
    singleUser: options.singleUser,
  });
  const authOptions = {
    auth: options.auth ?? undefined,
    singleUser: options.singleUser,
  };
  const vault = getSharedTokenVault();

  const rpc = new LazyT3RpcClient();
  const threadService = new T3ThreadService({
    rpcClient: rpc,
    store: createThreadMapStore(options.database),
  });
  const controlService = new T3ControlService({
    rpcClient: rpc,
    threadService,
  });
  setGlobalThreadService(threadService);
  setGlobalControlService(controlService);

  const app = new Hono<{ Variables: AppVariables }>();

  /*
   * Derselbe Snapshot wie GET /api/t3/flags am Host-Root. Liegt zusätzlich
   * hier, falls der Nested-Mount unter /api/t3 die Root-Route überschattet.
   */
  app.get("/flags", (context) => context.json(allT3Flags()));

  app.route(
    "/auth",
    createT3AuthRoutes({
      vault,
      pairingService: getSharedPairingService(),
      authOptions,
    }),
  );
  app.route(
    "/",
    createT3MessagesRoutes({ service: threadService, authMiddleware }),
  );
  app.route("/", createT3StreamRoutes({ authOptions }));
  app.route("/", createT3ApprovalsRoutes({ authOptions }));
  app.route("/", createT3ControlRoutes({ authOptions }));
  app.route("/", createT3AttachmentsRoutes({ authMiddleware }));
  app.route("/mobile", createT3MobileRoutes({ authMiddleware }));
  app.route(
    "/fleet",
    createFleetRoutes({
      agents: options.agentProfileStore,
      requireUser: options.requireUser,
    }),
  );

  return { app, threadService, controlService, rpc };
}

/** Mountet Avatare, sobald Maskottchen oder die Brücke aktiv sind. */
export function mountT3AgentAvatar(
  app: Hono<{ Variables: AppVariables }>,
  options: Pick<
    MountT3BackendOptions,
    "database" | "agentProfileStore" | "requireUser"
  >,
): void {
  if (!getT3Flag("mascot") && !getT3Flag("bridge")) return;

  const store = options.database
    ? new DrizzleAgentAvatarStore(options.database)
    : new MemoryAgentAvatarStore();
  const service = createAgentAvatarService({ store });

  app.route(
    "/api/agents",
    createAgentAvatarRoutes({
      service,
      requireUser: options.requireUser,
      agents: options.agentProfileStore,
    }),
  );
}

/** Mountet die Usage-Routen von A17 unter `/api/usage`. */
export function mountT3Usage(
  app: Hono<{ Variables: AppVariables }>,
  options: Pick<MountT3BackendOptions, "requireUser" | "database">,
): void {
  if (!getT3Flag("bridge")) return;

  app.route(
    "/api/usage",
    createUsageRoutes({
      service: createUsageBridgeService({ database: options.database }),
      authMiddleware: options.requireUser,
    }),
  );
}

/**
 * Mountet alles, was nicht unter `/api/t3` oder `/api/usage` liegt.
 *
 * Wird am Ende von `createApp` aufgerufen. Ist kein T3-Flag gesetzt, kehrt die
 * Funktion sofort zurück: keine Route, kein Sidecar, kein Verhalten.
 */
export function mountT3Backend(
  app: Hono<{ Variables: AppVariables }>,
  options: MountT3BackendOptions,
): void {
  const bridge = getT3Flag("bridge");
  const cua = getT3Flag("cuaMachines");
  const companyUsage = getT3Flag("companyPublicUsage");
  const mascot = getT3Flag("mascot");

  if (!bridge && !cua && !companyUsage && !mascot) return;

  if (bridge) {
    const { app: t3 } = createT3App(options);
    app.route("/api/t3", t3);

    // Sidecar nur mit Flag und nie im Vordergrund des Requests starten.
    if (!options.skipSidecarStart && !sidecarStartRequested) {
      sidecarStartRequested = true;
      void startT3Sidecar().catch((error: unknown) => {
        sidecarStartRequested = false;
        logger.warn("T3-Sidecar konnte nicht gestartet werden.", {
          error: error instanceof Error ? error.message : String(error),
        });
      });
    }
  }

  if (bridge || cua) {
    const service = createCuaService({ db: options.database });
    setGlobalCuaService(service);
    const machines = new Hono<{ Variables: AppVariables }>();
    machines.use("*", options.requireUser);
    machines.route("/", createMachineRoutes(service));
    app.route("/api/machines", machines);
  }

  if (bridge || companyUsage) {
    app.route("/api", createCompanyUsageRoutes({ database: options.database }));
  }

  mountT3AgentAvatar(app, options);
}

export { createT3AuthMiddleware, getSharedTokenVault, getT3SidecarStatus };
