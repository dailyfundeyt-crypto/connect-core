/**
 * Per-bot Slack handle + email identity for Slack-style group chats
 * (agents talking to each other) and Manus mail routing.
 */

export type AgentIdentity = {
  slackHandle: string;
  email: string;
};

const KEY = "connect.agent-identities";

type Store = Record<string, AgentIdentity>;

const EMPTY: AgentIdentity = { slackHandle: "", email: "" };

function read(): Store {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Store;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function write(store: Store) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(store));
  window.dispatchEvent(new Event("connect-agent-identities-changed"));
}

function slugFromName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.+|\.+$/g, "")
    .slice(0, 40);
}

function handleFromName(name: string): string {
  const first = name.trim().split(/\s+/)[0] ?? "bot";
  return first
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "")
    .slice(0, 24) || "bot";
}

export function getAgentIdentity(agentId: string): AgentIdentity {
  if (!agentId) return { ...EMPTY };
  const row = read()[agentId];
  return {
    slackHandle:
      typeof row?.slackHandle === "string" ? row.slackHandle : "",
    email: typeof row?.email === "string" ? row.email : "",
  };
}

export function setAgentIdentity(
  agentId: string,
  patch: Partial<AgentIdentity>,
): AgentIdentity {
  if (!agentId) return { ...EMPTY };
  const store = read();
  const next: AgentIdentity = {
    ...getAgentIdentity(agentId),
    ...patch,
  };
  next.slackHandle = next.slackHandle.trim().replace(/^@/, "");
  next.email = next.email.trim().toLowerCase();
  store[agentId] = next;
  write(store);
  return next;
}

/**
 * Ensure this bot has a Slack handle + email. Used when listing agents so
 * every coworker is addressable in group chats without manual setup.
 */
export function ensureAgentIdentity(
  agentId: string,
  agentName: string,
): AgentIdentity {
  const current = getAgentIdentity(agentId);
  if (current.slackHandle && current.email) return current;
  return setAgentIdentity(agentId, {
    slackHandle: current.slackHandle || suggestSlackHandle(agentName),
    email: current.email || suggestAgentEmail(agentName),
  });
}

/** Batch-ensure identities for a roster (idempotent). */
export function ensureAgentIdentities(
  agents: readonly { id: string; name: string }[],
): void {
  for (const agent of agents) {
    ensureAgentIdentity(agent.id, agent.name);
  }
}

export function listAgentIdentities(): Record<string, AgentIdentity> {
  return read();
}

export function subscribeAgentIdentities(cb: () => void) {
  const handler = () => cb();
  window.addEventListener("connect-agent-identities-changed", handler);
  window.addEventListener("storage", handler);
  return () => {
    window.removeEventListener("connect-agent-identities-changed", handler);
    window.removeEventListener("storage", handler);
  };
}

/** Suggest a Slack-style handle from the bot name. */
export function suggestSlackHandle(name: string): string {
  return handleFromName(name);
}

/** Suggest a default email from the bot name for Manus / mail routing. */
export function suggestAgentEmail(name: string): string {
  const slug = slugFromName(name);
  return slug ? `${slug}@bots.connect.local` : "";
}

/** Display form: `@handle` or empty. */
export function formatSlackHandle(handle: string): string {
  const trimmed = handle.trim().replace(/^@/, "");
  return trimmed ? `@${trimmed}` : "";
}
