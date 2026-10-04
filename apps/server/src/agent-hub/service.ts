/**
 * Agent Hub: per-agent model, per-agent MCP servers and per-agent browser for Connect's own
 * Hermes (built-in) agents. One singleton, initialised from index.ts with the same database, vault
 * key and audit store everything else uses.
 */
import { createHash } from "node:crypto";
import type { AuditStore } from "../audit";
import {
  createCredentialAdminService,
  type CredentialAdminService,
  type CredentialSecretReader,
  type CredentialStatusReader,
  type CredentialStore,
  decryptCredentialForUse,
} from "../credentials";
import type { Database } from "../db/client";
import { parametersFor, REFUSAL_MARKER, type GrantedTool } from "../plugins/tools";
import { catalogEntry, type SecretRef, type ServerDefinition, safeSegment } from "./catalog";
import {
  deleteServerRow,
  listLinks,
  listServerRows,
  readAgentSettings,
  readServerRow,
  upsertServerRow,
  writeAgentSettings,
  writeServerState,
} from "./db";
import { errorText, type ListedTool, McpManager, type ServerStatus } from "./mcp-manager";

export type ModelProvider = "default" | "openai" | "anthropic" | "ollama-local" | "ollama-cloud" | "openai-compatible";

export type AgentModelSettings = {
  provider: ModelProvider;
  model: string;
  baseUrl?: string;
  credentialId?: string | null;
  keyHint?: string | null;
};

export const DEFAULT_BASE_URLS: Partial<Record<ModelProvider, string>> = {
  "ollama-local": "http://127.0.0.1:11434/v1",
  "ollama-cloud": "https://ollama.com/v1",
  openai: "https://api.openai.com/v1",
};

export type AgentModelOverride = { model?: unknown; apiKey?: string | null; error?: string; label?: string };

type HubDeps = {
  database: Database;
  encryptionKey: string;
  credentialStore: CredentialStore & CredentialSecretReader & CredentialStatusReader;
  auditStore: AuditStore;
};

export const UI_KEY_PROVIDER = "connect-ui-keys";
/** localStorage slots that carry secrets and are mirrored into the vault. */
export const UI_KEY_SLOTS = ["connect.global-api-keys", "connect.agent-api-keys", "connect.voice-settings"] as const;
export type UiKeySlot = (typeof UI_KEY_SLOTS)[number];
/** One vault entry per slot and signed-in person, so nobody reads another person's keys. */
const uiKeyId = (slot: UiKeySlot, userId: string) => `${slot}@${userId}`;

export type ToolCallLog = { at: string; agentId: string; serverId: string; tool: string; ok: boolean; ms: number; preview: string };

class AgentHub {
  readonly manager: McpManager;
  readonly vault: CredentialAdminService;
  private recent: ToolCallLog[] = [];

  constructor(readonly deps: HubDeps) {
    this.vault = createCredentialAdminService(deps.encryptionKey, deps.credentialStore, deps.auditStore);
    this.manager = new McpManager(
      (definition) => this.resolveSecrets(definition),
      async (id, state) => {
        await writeServerState(deps.database, id, { status: state.status, ...(state.tools ? { tools: state.tools } : {}) });
      },
    );
  }

  // ------------------------------------------------------------------ vault
  async storeSecret(input: { kind: "model" | "mcp"; provider: string; keyId: string; plaintext: string; metadata: Record<string, unknown> }) {
    const stored = await this.vault.create({ ...input, metadata: input.metadata });
    return stored.id;
  }

  async revokeSecret(credentialId: string | null | undefined) {
    if (!credentialId) return;
    await this.vault.revoke(credentialId).catch(() => {});
  }

  async readSecret(credentialId: string): Promise<string> {
    return decryptCredentialForUse(this.deps.encryptionKey, this.deps.credentialStore, credentialId);
  }

  // ------------------------------------------------------------------ UI key vault
  /*
   * API keys the UI used to keep only in each browser profile's localStorage (Manus, Browser-Use,
   * ElevenLabs, Ziel AI, Codex, per agent and global). One encrypted credential per storage slot,
   * so the App window, the Notch overlay and Helium all read the same keys from this server.
   */
  async readUiKeys(userId: string): Promise<Record<string, string>> {
    const out: Record<string, string> = {};
    for (const slot of UI_KEY_SLOTS) {
      const live = await this.deps.credentialStore.findLiveByKey({ kind: "connector", provider: UI_KEY_PROVIDER, keyId: uiKeyId(slot, userId) });
      if (!live) continue;
      try {
        out[slot] = await this.readSecret(live.id);
      } catch {
        /* unreadable (rotated key) — the UI keeps its local copy */
      }
    }
    return out;
  }

  async writeUiKey(slot: UiKeySlot, value: string | null, userId: string) {
    const keyId = uiKeyId(slot, userId);
    const live = await this.deps.credentialStore.findLiveByKey({ kind: "connector", provider: UI_KEY_PROVIDER, keyId });
    if (!value) {
      if (live) await this.vault.revoke(live.id, userId).catch(() => {});
      return { stored: false };
    }
    if (live) {
      const current = await this.readSecret(live.id).catch(() => null);
      if (current === value) return { stored: true, unchanged: true };
    }
    await this.vault.create({
      kind: "connector",
      provider: UI_KEY_PROVIDER,
      keyId,
      plaintext: value,
      metadata: { slot, userId, source: "connect-ui" },
      actorUserId: userId,
    });
    return { stored: true };
  }

  /** Server-side helper for other modules (voice bridge, Notch): one key, e.g. (userId, "connect.global-api-keys", "elevenLabs"). */
  async uiKey(userId: string, slot: UiKeySlot, field: string, agentId?: string): Promise<string | null> {
    const raw = (await this.readUiKeys(userId))[slot];
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const scope = agentId ? (parsed[agentId] as Record<string, unknown> | undefined) : parsed;
      const value = scope?.[field];
      return typeof value === "string" && value.trim() ? value.trim() : null;
    } catch {
      return null;
    }
  }

  private async resolveSecrets(definition: ServerDefinition) {
    const env: Record<string, string> = {};
    const headers: Record<string, string> = {};
    for (const ref of definition.secrets ?? []) {
      const value = await this.readSecret(ref.credentialId);
      const full = `${ref.prefix ?? ""}${value}`;
      if (ref.target === "env") env[ref.name] = full;
      else headers[ref.name] = full;
    }
    return { env, headers };
  }

  // ------------------------------------------------------------------ servers
  async listServers() {
    const rows = await listServerRows(this.deps.database);
    return rows.map((row) => this.publicServer(row.id, row.definition as ServerDefinition, row.tools as ListedTool[] | null, row.status as ServerStatus | null));
  }

  publicServer(id: string, definition: ServerDefinition, tools: ListedTool[] | null, stored: ServerStatus | null) {
    const live = this.manager.status(id);
    const status: ServerStatus = live ?? (stored?.state === "connected" || stored?.state === "connecting" ? { ...stored, state: "idle" } : (stored ?? { state: "idle", at: "" }));
    return {
      id,
      catalogKey: definition.catalogKey,
      title: definition.title,
      transport: definition.transport,
      ownerAgentId: definition.ownerAgentId ?? null,
      url: definition.url ?? null,
      command: definition.transport === "stdio" ? (definition.pkg ?? definition.command ?? null) : null,
      options: definition.options ?? {},
      hasSecrets: (definition.secrets ?? []).length > 0,
      running: this.manager.isLive(id),
      status,
      tools: (tools ?? []).map((tool) => ({ name: tool.name, description: tool.description.slice(0, 200) })),
    };
  }

  async getDefinition(id: string): Promise<ServerDefinition | null> {
    const row = await readServerRow(this.deps.database, id);
    return row ? (row.definition as ServerDefinition) : null;
  }

  async addServer(input: { catalogKey: string; values: Record<string, string>; agentId?: string; id?: string }) {
    const entry = catalogEntry(input.catalogKey);
    if (!entry || !entry.build) throw new HubError("Diesen Verbinder gibt es nicht.");
    for (const field of entry.fields) {
      if (field.required && !input.values[field.key]?.trim()) throw new HubError(`Bitte „${field.label}" ausfüllen.`);
    }
    if (entry.perAgent && !input.agentId) throw new HubError("Dieser Verbinder gehört immer zu einem Agent.");
    const built = entry.build({ values: input.values, agentId: input.agentId });
    const existing = await listServerRows(this.deps.database);
    // A connector with nothing to fill in (DeepWiki, Notizbuch, …) exists once and is shared by agents.
    if (!input.id && !entry.perAgent && entry.fields.length === 0) {
      const shared = existing.find((row) => (row.definition as ServerDefinition).catalogKey === entry.key);
      if (shared) return shared.definition as ServerDefinition;
    }
    const taken = new Set(existing.map((row) => row.id));
    let id = input.id ?? (entry.perAgent ? `${entry.key}-${safeSegment(input.agentId ?? "").toLowerCase()}` : entry.key === "custom" ? `custom-${safeSegment(input.values.name ?? "server").toLowerCase()}` : entry.key);
    if (!input.id && !entry.perAgent) {
      const base = id;
      for (let n = 2; taken.has(id); n++) id = `${base}-${n}`;
    }
    const previous = taken.has(id) ? await this.getDefinition(id) : null;
    const secrets: SecretRef[] = [];
    for (const field of entry.fields.filter((candidate) => candidate.type === "secret")) {
      const value = input.values[field.key]?.trim();
      const target = entry.secretTargets?.[field.key];
      if (!target) continue;
      if (value) {
        const credentialId = await this.storeSecret({
          kind: "mcp",
          provider: "agent-hub",
          keyId: `${id}:${field.key}`,
          plaintext: value,
          metadata: { serverId: id, field: field.key, hint: value.slice(-4) },
        });
        secrets.push({ ...target, credentialId });
      } else {
        const kept = previous?.secrets?.find((ref) => ref.name === target.name);
        if (kept) secrets.push(kept);
      }
    }
    const definition: ServerDefinition = {
      ...built,
      id,
      catalogKey: entry.key,
      title: entry.key === "custom" ? input.values.name?.trim() || "Eigener Server" : entry.title,
      secrets,
      ...(entry.perAgent && input.agentId ? { ownerAgentId: input.agentId } : {}),
      createdAt: previous?.createdAt ?? new Date().toISOString(),
    };
    await this.manager.disconnect(id).catch(() => {});
    await upsertServerRow(this.deps.database, id, definition);
    return definition;
  }

  async connectServer(id: string) {
    const definition = await this.getDefinition(id);
    if (!definition) throw new HubError("Server nicht gefunden.");
    await this.manager.disconnect(id).catch(() => {});
    try {
      const tools = await this.manager.connect(definition);
      // Written here as well as by the state callback, so the answer to this request already lists them.
      const status = this.manager.status(id);
      await writeServerState(this.deps.database, id, { tools, ...(status ? { status } : {}) });
    } catch {
      // status carries the error
    }
    return this.serverView(id);
  }

  async serverView(id: string) {
    const row = await readServerRow(this.deps.database, id);
    if (!row) return null;
    return this.publicServer(id, row.definition as ServerDefinition, row.tools as ListedTool[] | null, row.status as ServerStatus | null);
  }

  async removeServer(id: string) {
    const definition = await this.getDefinition(id);
    await this.manager.disconnect(id).catch(() => {});
    for (const ref of definition?.secrets ?? []) await this.revokeSecret(ref.credentialId);
    await deleteServerRow(this.deps.database, id);
  }

  // ------------------------------------------------------------------ model
  async modelSettings(agentId: string): Promise<AgentModelSettings | null> {
    const row = await readAgentSettings(this.deps.database, agentId);
    const model = row?.model as AgentModelSettings | null | undefined;
    return model && typeof model === "object" && typeof model.provider === "string" ? model : null;
  }

  async saveModelSettings(agentId: string, input: { provider: ModelProvider; model: string; baseUrl?: string; apiKey?: string; clearKey?: boolean }) {
    const current = await this.modelSettings(agentId);
    let credentialId = current?.credentialId ?? null;
    let keyHint = current?.keyHint ?? null;
    // A key belongs to one provider: switching provider drops it unless a new one is given.
    if ((input.clearKey || (current && current.provider !== input.provider)) && credentialId) {
      await this.revokeSecret(credentialId);
      credentialId = null;
      keyHint = null;
    }
    if (input.apiKey?.trim()) {
      const key = input.apiKey.trim();
      credentialId = await this.storeSecret({
        kind: "model",
        provider: `agent-hub-${input.provider}`,
        keyId: agentId,
        plaintext: key,
        metadata: { agentId, provider: input.provider, hint: key.slice(-4) },
      });
      keyHint = key.slice(-4);
    }
    const settings: AgentModelSettings = {
      provider: input.provider,
      model: input.model.trim(),
      ...(input.baseUrl?.trim() ? { baseUrl: input.baseUrl.trim().replace(/\/+$/, "") } : {}),
      credentialId,
      keyHint,
    };
    await writeAgentSettings(this.deps.database, agentId, { model: input.provider === "default" ? null : settings });
    return settings;
  }

  /** The model a built-in agent runs on, or null for the deployment default (old global BOT_* setting). */
  async resolveModel(agentId: string): Promise<AgentModelOverride | null> {
    const settings = await this.modelSettings(agentId);
    if (!settings || settings.provider === "default" || !settings.model) return null;
    const label = `${settings.provider}/${settings.model}`;
    let key: string | null = null;
    if (settings.credentialId) {
      try {
        key = await this.readSecret(settings.credentialId);
      } catch (error) {
        return { error: `Der API-Key dieses Agents ist nicht mehr gültig (${errorText(error)}). Bitte unter Einstellungen → Modell neu eintragen.`, label };
      }
    }
    const baseURL = settings.baseUrl || DEFAULT_BASE_URLS[settings.provider];
    switch (settings.provider) {
      case "ollama-local":
        return { model: await openAiChatModel(baseURL ?? "", key || "ollama", settings.model, "ollama"), apiKey: key || "ollama", label };
      case "ollama-cloud":
        if (!key) return { error: "Für Ollama Cloud fehlt der API-Key dieses Agents. Trage ihn unter Agent-Einstellungen → Modell ein (Key von ollama.com/settings/keys).", label };
        return { model: await openAiChatModel(baseURL ?? "", key, settings.model, "ollama-cloud"), apiKey: key, label };
      case "openai-compatible":
        if (!baseURL) return { error: "Für diesen Agent fehlt die Basis-URL des Modells.", label };
        return { model: await openAiChatModel(baseURL, key || "none", settings.model, "compatible"), apiKey: key || "none", label };
      case "openai": {
        const apiKey = key || process.env.OPENAI_API_KEY?.trim() || null;
        if (!apiKey) return { error: "Für OpenAI fehlt ein API-Key (eigener Key im Agent oder OPENAI_API_KEY).", label };
        if (settings.baseUrl) return { model: await openAiChatModel(settings.baseUrl, apiKey, settings.model, "openai"), apiKey, label };
        return { model: `openai/${settings.model}`, apiKey, label };
      }
      case "anthropic": {
        const apiKey = key || process.env.ANTHROPIC_API_KEY?.trim() || null;
        if (!apiKey) return { error: "Für Anthropic fehlt ein API-Key (eigener Key im Agent oder ANTHROPIC_API_KEY).", label };
        return { model: `anthropic/${settings.model}`, apiKey, label };
      }
      default:
        return null;
    }
  }

  // ------------------------------------------------------------------ links + tools
  async agentLinks(agentId: string) {
    return listLinks(this.deps.database, agentId);
  }

  recentCalls(agentId?: string) {
    return this.recent.filter((entry) => !agentId || entry.agentId === agentId).slice(-20).reverse();
  }

  /** The MCP tools one agent holds right now (cached tool lists; the server starts on first call). */
  async toolsFor(botId: string): Promise<GrantedTool[]> {
    const links = (await listLinks(this.deps.database, botId)).filter((link) => link.enabled);
    if (links.length === 0) return [];
    const rows = await listServerRows(this.deps.database);
    const tools: GrantedTool[] = [];
    const usedAliases = new Set<string>();
    for (const link of links) {
      const row = rows.find((candidate) => candidate.id === link.server_id);
      if (!row) continue;
      const definition = row.definition as ServerDefinition;
      if (definition.ownerAgentId && definition.ownerAgentId !== botId) continue;
      let listed = (row.tools as ListedTool[] | null) ?? [];
      const lastStatus = this.manager.status(definition.id);
      if (listed.length === 0 && lastStatus?.state !== "error") {
        // Never connected yet: try once, briefly, so a freshly attached server works on the first turn.
        listed = await Promise.race([
          this.manager.connect(definition).catch(() => [] as ListedTool[]),
          new Promise<ListedTool[]>((resolve) => setTimeout(() => resolve([]), 8_000)),
        ]);
      }
      let alias = safeSegment(definition.catalogKey === "custom" ? definition.id.replace(/^custom-/, "") : definition.catalogKey).replace(/-/g, "_");
      for (let n = 2; usedAliases.has(alias); n++) alias = `${alias}${n}`;
      usedAliases.add(alias);
      for (const tool of listed) {
        tools.push({
          name: toolName(alias, tool.name),
          description: `[${definition.title}] ${tool.description}`.slice(0, 1000),
          parameters: parametersFor(tool.inputSchema),
          ref: `${definition.id}/${tool.name}`,
          execute: async (args) => this.callTool(botId, definition.id, tool.name, args),
        });
      }
    }
    return tools;
  }

  async callTool(botId: string, serverId: string, tool: string, args: unknown): Promise<string> {
    const started = Date.now();
    const link = (await listLinks(this.deps.database, botId)).find((candidate) => candidate.server_id === serverId);
    if (!link?.enabled) return `${REFUSAL_MARKER} Dieser MCP-Server ist für diesen Agent ausgeschaltet.`;
    const definition = await this.getDefinition(serverId);
    if (!definition) return `${REFUSAL_MARKER} Dieser MCP-Server wurde entfernt.`;
    if (definition.ownerAgentId && definition.ownerAgentId !== botId) return `${REFUSAL_MARKER} Dieser Browser gehört einem anderen Agent.`;
    let text: string;
    let ok = true;
    try {
      const result = await this.manager.call(definition, tool, args);
      ok = !result.isError;
      text = result.isError ? `Der MCP-Server ${definition.title} meldet einen Fehler: ${result.text}` : result.text;
    } catch (error) {
      ok = false;
      text = `Der MCP-Server ${definition.title} ist nicht erreichbar: ${errorText(error)}`;
    }
    this.recent.push({ at: new Date().toISOString(), agentId: botId, serverId, tool, ok, ms: Date.now() - started, preview: text.slice(0, 160) });
    if (this.recent.length > 200) this.recent.splice(0, this.recent.length - 200);
    return text;
  }
}

export class HubError extends Error {}

function toolName(alias: string, tool: string): string {
  const clean = `mcp__${alias}__${tool}`.replace(/[^a-zA-Z0-9_-]/g, "_");
  if (clean.length <= 64) return clean;
  const hash = createHash("sha1").update(clean).digest("hex").slice(0, 6);
  return `${clean.slice(0, 57)}_${hash}`;
}

async function openAiChatModel(baseURL: string, apiKey: string, model: string, name: string): Promise<unknown> {
  const { createOpenAI } = (await import("@ai-sdk/openai")) as {
    createOpenAI: (options: { baseURL: string; apiKey: string; name?: string }) => { chat: (id: string) => unknown };
  };
  return createOpenAI({ baseURL, apiKey, name }).chat(model);
}

let hub: AgentHub | null = null;

export function initAgentHub(deps: HubDeps): AgentHub {
  hub = new AgentHub(deps);
  return hub;
}

export function agentHub(): AgentHub | null {
  return hub;
}

/** For loadToolsForActor: empty when the hub is not initialised or anything fails. */
export async function agentHubTools(botId: string): Promise<GrantedTool[]> {
  if (!hub) return [];
  try {
    return await hub.toolsFor(botId);
  } catch (error) {
    console.error({ error: "agent_hub_tools_failed", context: { botId, reason: errorText(error).slice(0, 200) } });
    return [];
  }
}
