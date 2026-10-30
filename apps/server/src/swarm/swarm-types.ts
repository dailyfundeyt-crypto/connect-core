/**
 * Swarm-Controller Types (Phase E Schritt 20 / Agent B).
 *
 * Typdefinitionen für die Warteschlange, den Scheduler und die
 * Browser-Agenten-Verwaltung für bis zu 20 parallele Browser-Agenten.
 *
 * SICHERHEIT:
 * - Jeder Agent hat ein EIGENES isoliertes Profil unter %LOCALAPPDATA%\ConnectAgents\<agentId>\helium.
 * - Stefans persönliches Helium-Profil darf NIEMALS angefasst werden (assertNotStefanProfile).
 * - Lockfile verhindert Doppelnutzung von Profilen.
 */

export type SwarmTaskPriority = "high" | "normal" | "low";

export type SwarmTaskStatus =
  | "queued"
  | "scheduled"
  | "running"
  | "completed"
  | "failed"
  | "retrying"
  | "cancelled";

export type SwarmTaskAction =
  | "open"
  | "navigate"
  | "screenshot"
  | "evaluate"
  | "click"
  | "type"
  | "scroll"
  | "task"
  | "status"
  | "council_turn"
  | "sim_tick"
  | "persona_turn"
  | "generic";

export type SwarmTaskParams = {
  url?: string;
  selector?: string;
  text?: string;
  submit?: boolean;
  expression?: string;
  prompt?: string;
  x?: number;
  y?: number;
  timeoutMs?: number;
  /** Für automatisierte Crash-Recovery-Tests: simuliert einen Absturz */
  simulateCrash?: boolean;

  /** Swarm-v3 LLM & Multi-Agent Execution Fields */
  jobType?: "council_turn" | "sim_tick" | "transcribe" | "persona_turn" | "generic";
  provider?: "gemini-cli" | "api" | "mock";
  model?: string;
  temperature?: number;
  systemPrompt?: string;
  sessionId?: string;
  round?: number;
  agentId?: string;
  role?: string;
  question?: string;
  options?: (string | Record<string, unknown>)[];
  context?: string;
  persona?: any;
  brain?: any;
  engine?: "native" | "mirofish";
  tick?: number;
  event?: string;
  sources?: string[];
  payload?: Record<string, unknown>;
};

export type SystemMetrics = {
  cpuPercent: number;
  totalMemMb: number;
  freeMemMb: number;
  usedMemMb: number;
  memPercent: number;
  timestamp: string;
};

export type SwarmTaskResult = {
  ok: boolean;
  taskId: string;
  status?: SwarmTaskStatus;
  agentId: string;
  agentName?: string;
  profileDir: string;
  cdpPort: number;
  action: SwarmTaskAction;
  url?: string | null;
  title?: string | null;
  screenshot?: string | null; // data:image/jpeg;base64,...
  screenshotRef?: string | null; // Screenshot-Referenz
  output?: string;
  payloadResult?: any;
  tokensUsed?: {
    input: number;
    output: number;
    total: number;
  };
  error?: string;
  durationMs: number;
  retries: number;
  recoveredFromCrash: boolean;
  systemMetrics?: SystemMetrics;
  createdAt?: string;
  completedAt?: string;
};

export type SwarmTask = {
  id: string;
  runId?: string;
  agentId?: string; // spezifische Agent-ID oder "auto"
  title: string;
  action: SwarmTaskAction;
  params: SwarmTaskParams;
  priority: SwarmTaskPriority;
  status: SwarmTaskStatus;
  assignedWorkerId?: string;
  assignedProfileDir?: string;
  assignedCdpPort?: number;
  retryCount: number;
  maxRetries: number;
  recoveredFromCrash?: boolean;
  result?: SwarmTaskResult;
  error?: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
};

export type SwarmTaskInput = {
  id?: string;
  agentId?: string; // "auto" oder spezifische ID
  title?: string;
  action: SwarmTaskAction;
  params?: SwarmTaskParams;
  priority?: SwarmTaskPriority;
  maxRetries?: number;
};

export type SwarmWorkerStatus =
  | "idle"
  | "running"
  | "crashed"
  | "stopped"
  | "takeover"
  | "busy"
  | "restarting"
  | "offline"
  | "error";

export type SwarmWorkerCurrentTask = {
  id: string;
  title: string;
  action: SwarmTaskAction;
  url?: string;
  startedAt?: string;
};

export type SwarmWorker = {
  agentId: string;
  name: string; // Primärer Anzeigename (für Vertrag)
  agentName: string; // Rückwärtskompatibler Alias
  profileDir: string;
  cdpPort: number;
  status: SwarmWorkerStatus;
  currentTask?: SwarmWorkerCurrentTask | SwarmTask | string;
  currentTaskId?: string;
  currentTaskTitle?: string;
  currentTaskAction?: SwarmTaskAction;
  currentTaskUrl?: string;
  currentTaskStartedAt?: string;
  lastScreenshot?: string | null;
  lastScreenshotAt?: string;
  lastUrl?: string | null;
  lastTitle?: string | null;
  crashCount: number;
  tasksCompleted: number;
  lastActiveAt: string;
  lastError?: string;
  isLocked?: boolean;
};

export type SwarmLimits = {
  /** Maximale Anzahl paralleler Browser-Agenten (bis zu 20) */
  maxConcurrent: number;
  /** Maximale CPU-Auslastung in Prozent (default: 85%) */
  maxCpuPercent: number;
  /** Minimaler freier Arbeitsspeicher in MB (default: 1024 MB = 1 GB) */
  minFreeMemMb: number;
  /** Maximaler prozentualer RAM-Verbrauch (default: 90%) */
  maxMemPercent: number;
  /** Timeout pro Task in ms (default: 60000ms = 60s) */
  taskTimeoutMs: number;
  /** Maximale Anzahl Wiederholungen bei Absturz (default: 2) */
  maxRetries: number;
  /** Verzögerung vor Neustart / Retry in ms */
  retryDelayMs: number;
};

export type SwarmOverallProgress = {
  total: number;
  done: number;
  failed: number;
  percent: number;
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  runningTasks: number;
  queuedTasks: number;
  activeRunId?: string;
  activeRunCompleted?: number;
  activeRunTotal?: number;
};

export type SwarmStatus = {
  controller: string;
  version: string;
  activeWorkers: number;
  totalWorkers: number;
  maxConcurrent: number;
  queueLength: number;
  runningTasks: number;
  completedTasks: number;
  failedTasks: number;
  totalCrashesRecovered: number;
  overallProgress: SwarmOverallProgress;
  metrics: {
    cpuPercent: number;
    memPercent: number;
  };
  resourceStatus: {
    allowed: boolean;
    reason?: string;
  };
  systemMetrics: SystemMetrics;
  limits: SwarmLimits;
  workers: SwarmWorker[];
};

export type SwarmRunResult = {
  runId: string;
  totalTasks: number;
  completed: number;
  failed: number;
  concurrency: number;
  durationMs: number;
  crashesRecovered: number;
  systemMetrics: SystemMetrics;
  results: SwarmTaskResult[];
};

export type {
  SwarmJob,
  SwarmJobType,
  SwarmJobStatus,
  CouncilSession,
  CouncilSeat,
  CouncilTurn,
  CouncilVote,
  DecisionRecord,
  SimulationRun,
  SimEntity,
  SimRelation,
  SimTick,
  SimInjection,
  SimReport,
  SeatBrain,
  LlmProvider,
  SimulationEngine,
} from "../contracts/swarm-v3/index";
