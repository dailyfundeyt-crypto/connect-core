/**
 * T3-Bridge — Realistische Mock-Daten für Frontend-Entwicklung (Lane A21).
 *
 * Ermöglicht allen Frontend-Agenten (A22–A36) das Entwickeln und Testen von
 * Chat-Bausteinen, CLI-Selektoren, Nutzungsansichten, Einstellungen und Maschinen
 * OHNE laufenden lokalen T3-Server oder Backend.
 *
 * Alle Daten entsprechen 1:1 den Typverträgen aus `contracts.ts`.
 */

import type {
  AgentAvatar,
  CompanyPublicUsage,
  ConnectChatApprovalItem,
  ConnectChatContextSwitchItem,
  ConnectChatItem,
  ConnectChatPlanItem,
  ConnectChatSubagentItem,
  ConnectChatTextItem,
  ConnectChatToolItem,
  ConnectChatTurnEndItem,
  ConnectChatUsage,
  FleetAgentState,
  Machine,
  MachineListResponse,
  SchedulerLimits,
  T3Capabilities,
  T3ProviderListResponse,
  T3ProviderStatus,
  T3StatusResponse,
  T3ThreadSnapshot,
  UsageResponse,
} from "./contracts";

/* ---------------------------------------------------------------------------------------- *
 * 1. Provider-Mock-Daten (Katalog der 11 T3-Treiber)
 * ---------------------------------------------------------------------------------------- */

export const MOCK_T3_PROVIDERS: T3ProviderStatus[] = [
  {
    provider: "codex",
    driver: "codex",
    displayName: "Codex",
    installed: true,
    authenticated: true,
    auth: "authenticated",
    availability: "available",
    version: "0.14.2",
    models: ["gpt-4o", "gpt-4o-mini", "o1", "o3-mini"],
    fork: false,
    limits: [
      {
        provider: "codex",
        kind: "session",
        label: "5-Stunden-Limit",
        usedPercent: 42,
        resetsAt: new Date(Date.now() + 3 * 3600 * 1000).toISOString(),
      },
      {
        provider: "codex",
        kind: "weekly",
        label: "Wochenbudget",
        usedPercent: 68,
        resetsAt: new Date(Date.now() + 4 * 86400 * 1000).toISOString(),
      },
    ],
  },
  {
    provider: "claudeAgent",
    driver: "claudeAgent",
    displayName: "Claude",
    installed: true,
    authenticated: true,
    auth: "authenticated",
    availability: "available",
    version: "1.2.0",
    models: ["claude-3-7-sonnet", "claude-3-5-sonnet", "claude-3-5-haiku"],
    fork: false,
    limits: [
      {
        provider: "claudeAgent",
        kind: "session",
        label: "5-Stunden-Fenster",
        usedPercent: 18,
        resetsAt: new Date(Date.now() + 4 * 3600 * 1000).toISOString(),
      },
    ],
  },
  {
    provider: "cursor",
    driver: "cursor",
    displayName: "Cursor",
    installed: true,
    authenticated: true,
    auth: "authenticated",
    availability: "available",
    version: "0.45.1",
    models: ["claude-3-5-sonnet", "cursor-small", "gpt-4o"],
    fork: false,
  },
  {
    provider: "grok",
    driver: "grok",
    displayName: "Grok",
    installed: true,
    authenticated: false,
    auth: "unauthenticated",
    availability: "unavailable",
    version: "2.1.0",
    models: ["grok-2", "grok-2-mini"],
    fork: false,
    reason: "API-Key nicht hinterlegt",
  },
  {
    provider: "hermes",
    driver: "hermes",
    displayName: "Hermes",
    installed: true,
    authenticated: true,
    auth: "authenticated",
    availability: "available",
    version: "0.9.4",
    models: ["hermes-3-llama-3.1-70b", "hermes-3-llama-3.1-8b"],
    fork: true,
  },
  {
    provider: "freebuff",
    driver: "freebuff",
    displayName: "Freebuff",
    installed: true,
    authenticated: true,
    auth: "authenticated",
    availability: "available",
    version: "1.0.3",
    models: ["freebuff-fast", "freebuff-pro"],
    fork: true,
  },
  {
    provider: "opencode",
    driver: "opencode",
    displayName: "OpenCode",
    installed: true,
    authenticated: null,
    auth: "unknown",
    availability: "available",
    version: "0.5.0",
    models: ["qwen-2.5-coder-32b", "deepseek-coder-v2"],
    fork: false,
  },
  {
    provider: "antigravity",
    driver: "antigravity",
    displayName: "Antigravity",
    installed: true,
    authenticated: true,
    auth: "authenticated",
    availability: "available",
    version: "2.0.0",
    models: ["gemini-2.0-flash", "gemini-2.0-pro"],
    fork: false,
  },
  {
    provider: "pi",
    driver: "pi",
    displayName: "Pi",
    installed: false,
    authenticated: false,
    auth: "unauthenticated",
    availability: "unavailable",
    version: null,
    models: [],
    fork: false,
    reason: "CLI nicht lokal installiert",
  },
  {
    provider: "muse",
    driver: "muse",
    displayName: "Muse",
    installed: true,
    authenticated: true,
    auth: "authenticated",
    availability: "available",
    version: "1.1.0",
    models: ["muse-standard", "muse-creative"],
    fork: false,
  },
  {
    provider: "acpRegistry",
    driver: "acpRegistry",
    displayName: "ACP Registry",
    installed: true,
    authenticated: true,
    auth: "authenticated",
    availability: "available",
    version: "0.3.1",
    models: ["acp-bridge-agent"],
    fork: false,
  },
];

export const MOCK_T3_PROVIDER_LIST_RESPONSE: T3ProviderListResponse = {
  providers: MOCK_T3_PROVIDERS,
  serverContractVersion: 1,
  fetchedAt: new Date().toISOString(),
  unknownDrivers: [],
};

/* ---------------------------------------------------------------------------------------- *
 * 2. Capabilities Mock
 * ---------------------------------------------------------------------------------------- */

export const MOCK_T3_CAPABILITIES: T3Capabilities = {
  canInterrupt: true,
  canSteer: true,
  canApprove: true,
  canRollback: true,
  canFork: true,
  canPlan: true,
  canSubagent: true,
  canContextTransfer: true,
};

/* ---------------------------------------------------------------------------------------- *
 * 3. Chat-Verlauf & Items Mock (Realistischer Gesprächsablauf)
 * ---------------------------------------------------------------------------------------- */

export const MOCK_CHAT_ITEMS: ConnectChatItem[] = [
  {
    kind: "text",
    id: "item-user-1",
    role: "user",
    text: "Bitte prüfe die Systemmetriken und bereite einen Wartungsbericht vor.",
    status: "done",
  } satisfies ConnectChatTextItem,
  {
    kind: "plan",
    id: "item-plan-1",
    steps: [
      { id: "step-1", label: "Systemstatus & Festplattenplatz prüfen", status: "done" },
      { id: "step-2", label: "Docker-Container überprüfen", status: "done" },
      { id: "step-3", label: "Bereinigung temporärer Dateien anfordern", status: "waiting" },
      { id: "step-4", label: "Abschlussbericht verfassen", status: "queued" },
    ],
  } satisfies ConnectChatPlanItem,
  {
    kind: "tool",
    id: "item-tool-1",
    label: "Terminal",
    title: "df -h && free -m",
    status: "done",
    output: "Filesystem      Size  Used Avail Use% Mounted on\n/dev/sda1       100G   42G   58G  42% /\nMem:           32000 12400 19600",
    startedAt: new Date(Date.now() - 120000).toISOString(),
    endedAt: new Date(Date.now() - 118000).toISOString(),
  } satisfies ConnectChatToolItem,
  {
    kind: "context_switch",
    id: "item-ctx-1",
    tokensAtSwitch: 102400,
    summary:
      "Vorherige Generation abgeschlossen: Systemressourcen normal, CPU-Auslastung bei 15%, 58 GB freier Speicherplatz.",
    previousThreadId: "thread-prev-gen0",
    newThreadId: "thread-gen1",
    createdAt: new Date(Date.now() - 90000).toISOString(),
  } satisfies ConnectChatContextSwitchItem,
  {
    kind: "subagent",
    id: "item-subagent-1",
    name: "System-Prüfer (Sub-Agent)",
    status: "done",
  } satisfies ConnectChatSubagentItem,
  {
    kind: "approval",
    id: "item-approval-1",
    requestId: "req-clean-tmp-1",
    requestKind: "command_execution",
    title: "Befehlsausführung bestätigen",
    detail: "Der Agent möchte veraltete Logdateien in /tmp/logs/ bereinigen (1.4 GB freigeben).",
    prompt: "Soll der Bereinigungsbefehl ausgeführt werden?",
    options: [
      { id: "opt-allow", label: "Erlauben", decision: "allow" },
      { id: "opt-always", label: "Immer für diese Sitzung erlauben", decision: "allow_always" },
      { id: "opt-deny", label: "Ablehnen", decision: "deny" },
    ],
    status: "waiting",
    blocking: true,
  } satisfies ConnectChatApprovalItem,
  {
    kind: "text",
    id: "item-assistant-1",
    role: "assistant",
    text: "Die Festplattenprüfung ist abgeschlossen. Bitte bestätige oben kurz die Bereinigung der temporären Logs, damit ich den Vorgang abschließen kann.",
    status: "done",
  } satisfies ConnectChatTextItem,
  {
    kind: "turn_end",
    id: "item-turn-end-1",
    status: "completed",
    attempts: 1,
    durationMs: 4200,
    usage: {
      uncachedInputTokens: 3200,
      cachedInputTokens: 14000,
      cacheCreationTokens: 800,
      outputTokens: 450,
      reasoningTokens: 120,
      costUsd: 0.0142,
      cacheSavingsUsd: 0.038,
    },
  } satisfies ConnectChatTurnEndItem,
];

export const MOCK_T3_THREAD_SNAPSHOT: T3ThreadSnapshot = {
  threadId: "mock-thread-active",
  generation: 1,
  title: "Wartungsbericht & Systemmetriken",
  provider: "codex",
  model: "gpt-4o",
  items: MOCK_CHAT_ITEMS,
  updatedAt: new Date().toISOString(),
  tokens: 18450,
};

/* ---------------------------------------------------------------------------------------- *
 * 4. Usage & Kosten Mock
 * ---------------------------------------------------------------------------------------- */

export const MOCK_T3_USAGE_RESPONSE: UsageResponse = {
  metric: "cost",
  windowDays: 30,
  groupBy: "agent",
  buckets: [
    {
      key: "agent-hermes-1",
      label: "Hermes Senior Dev",
      inputTokens: 1200000,
      cachedInputTokens: 3400000,
      cacheCreationTokens: 400000,
      outputTokens: 380000,
      reasoningTokens: 90000,
      totalTokens: 5470000,
      costUsd: 14.82,
      cacheSavingsUsd: 28.4,
      turns: 84,
    },
    {
      key: "agent-claude-2",
      label: "Claude Architect",
      inputTokens: 800000,
      cachedInputTokens: 2100000,
      cacheCreationTokens: 250000,
      outputTokens: 210000,
      reasoningTokens: 45000,
      totalTokens: 3405000,
      costUsd: 11.25,
      cacheSavingsUsd: 19.5,
      turns: 52,
    },
    {
      key: "agent-grok-3",
      label: "Grok Research",
      inputTokens: 450000,
      cachedInputTokens: 900000,
      cacheCreationTokens: 100000,
      outputTokens: 140000,
      reasoningTokens: 20000,
      totalTokens: 1610000,
      costUsd: 4.15,
      cacheSavingsUsd: 6.8,
      turns: 29,
    },
  ],
  totals: {
    key: "total",
    label: "Gesamtsumme (30 Tage)",
    inputTokens: 2450000,
    cachedInputTokens: 6400000,
    cacheCreationTokens: 750000,
    outputTokens: 730000,
    reasoningTokens: 155000,
    totalTokens: 10485000,
    costUsd: 30.22,
    cacheSavingsUsd: 54.7,
    turns: 165,
  },
  limits: [
    {
      provider: "codex",
      kind: "session",
      label: "Codex 5h Fenster",
      usedPercent: 42,
      resetsAt: new Date(Date.now() + 3 * 3600 * 1000).toISOString(),
    },
    {
      provider: "claudeAgent",
      kind: "weekly",
      label: "Claude Wochenlimit",
      usedPercent: 68,
      resetsAt: new Date(Date.now() + 4 * 86400 * 1000).toISOString(),
    },
  ],
  readAt: new Date().toISOString(),
};

/* ---------------------------------------------------------------------------------------- *
 * 5. Firmenprofil: Öffentliche Summen Mock
 * ---------------------------------------------------------------------------------------- */

export const MOCK_COMPANY_PUBLIC_USAGE: CompanyPublicUsage = {
  companyId: "company-kunc-gmbh",
  windowDays: 30,
  totalTokens: 14250000,
  costUsd: 41.8,
  byProvider: [
    { provider: "Codex", tokens: 7100000, costUsd: 21.3 },
    { provider: "Claude", tokens: 4900000, costUsd: 14.7 },
    { provider: "Grok", tokens: 1450000, costUsd: 3.8 },
    { provider: "Antigravity", tokens: 800000, costUsd: 2.0 },
  ],
  computedAt: new Date().toISOString(),
};

/* ---------------------------------------------------------------------------------------- *
 * 6. Cua-Maschinen Mock
 * ---------------------------------------------------------------------------------------- */

export const MOCK_MACHINES: Machine[] = [
  {
    id: "connect-cua-shared-default",
    owner: "dailyfunde.yt@gmail.com",
    kind: "local",
    name: "Standard-Maschine (Geteilt)",
    status: "running",
    sharedDefault: true,
    cuaRef: "cua://local/connect-cua-shared-default",
    width: 1920,
    height: 1080,
    lastActivityAt: new Date().toISOString(),
    createdAt: new Date(Date.now() - 7 * 86400 * 1000).toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "connect-cua-agent-codex",
    owner: "dailyfunde.yt@gmail.com",
    kind: "sandbox",
    name: "Codex Isolierte Sandbox",
    status: "sleeping",
    sharedDefault: false,
    cuaRef: "cua://sandbox/connect-cua-agent-codex",
    width: 1440,
    height: 900,
    lastActivityAt: new Date(Date.now() - 3600 * 1000).toISOString(),
    createdAt: new Date(Date.now() - 2 * 86400 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 3600 * 1000).toISOString(),
  },
];

export const MOCK_MACHINE_LIST_RESPONSE: MachineListResponse = {
  machines: MOCK_MACHINES,
  sharedDefaultId: "connect-cua-shared-default",
};

/* ---------------------------------------------------------------------------------------- *
 * 7. Avatar Mock
 * ---------------------------------------------------------------------------------------- */

export const MOCK_AGENT_AVATAR: AgentAvatar = {
  agentId: "agent-t3-default",
  shape: "pumpkin",
  color: "orange",
  expression: "happy",
  updatedAt: new Date().toISOString(),
};

/* ---------------------------------------------------------------------------------------- *
 * 8. Flotten- & Scheduler-Status Mock
 * ---------------------------------------------------------------------------------------- */

export const MOCK_SCHEDULER_LIMITS: SchedulerLimits = {
  maxConcurrentTurns: 5,
  maxConcurrentPerProvider: 3,
  queueTimeoutMinutes: 120,
  idleSessionTimeoutMinutes: 15,
  maxAwakeAgents: 8,
};

export const MOCK_FLEET_AGENTS: FleetAgentState[] = [
  {
    agentId: "agent-1",
    name: "T3 Main Agent",
    state: "running",
    provider: "codex",
    queuePosition: null,
    tokens: 42100,
    costUsd: 0.12,
    lastActivityAt: new Date().toISOString(),
  },
  {
    agentId: "agent-2",
    name: "Hermes Coder",
    state: "waiting_approval",
    provider: "hermes",
    queuePosition: null,
    tokens: 89400,
    costUsd: 0.28,
    lastActivityAt: new Date(Date.now() - 45000).toISOString(),
  },
  {
    agentId: "agent-3",
    name: "Claude Analyst",
    state: "idle",
    provider: "claudeAgent",
    queuePosition: null,
    tokens: 15200,
    costUsd: 0.05,
    lastActivityAt: new Date(Date.now() - 300000).toISOString(),
  },
];

export const MOCK_T3_STATUS: T3StatusResponse = {
  running: true,
  port: 3773,
  version: "0.14.2",
  contractVersion: 1,
  contractCompatible: true,
  providers: MOCK_T3_PROVIDERS,
  home: "%LOCALAPPDATA%\\ConnectAgents\\t3-home",
  message: "T3-Sidecar läuft einwandfrei auf Port 3773",
};
