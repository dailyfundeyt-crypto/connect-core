/**
 * Grok-inspired automation recipes.
 *
 * Uploads feed Grok “Aufgabe beibringen” via the CLI bridge for training, then
 * Claude plans them into scheduled routines shown under the agent browser.
 */

import { enqueueAgentCli } from "@/lib/agents/agent-cli";
import { cloudComputerAllowsAutomations } from "@/lib/agents/cloud-computer";

export type PlannedRoutineDraft = {
  id: string;
  title: string;
  schedule: string;
  instruction: string;
};

export type AgentAutomation = {
  id: string;
  name: string;
  body: string;
  createdAt: string;
  /** Queued to Grok CLI for teach/train. */
  grokQueuedAt?: string;
  /** Claude planning drafts derived for Routinen under the browser. */
  plannedAt?: string;
  plans?: PlannedRoutineDraft[];
};

const KEY = "connect.agent-automations";

type Store = Record<string, AgentAutomation[]>;

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
  window.dispatchEvent(new Event("connect-agent-automations-changed"));
}

function updateOne(
  agentId: string,
  automationId: string,
  patch: Partial<AgentAutomation>,
): AgentAutomation[] {
  const store = read();
  const list = store[agentId] ?? [];
  store[agentId] = list.map((a) =>
    a.id === automationId ? { ...a, ...patch } : a,
  );
  write(store);
  return store[agentId] ?? [];
}

export function listAgentAutomations(agentId: string): AgentAutomation[] {
  if (!agentId) return [];
  return read()[agentId] ?? [];
}

/** Flat list of Claude-planned drafts for an agent (browser Routinen strip). */
export function listPlannedRoutineDrafts(
  agentId: string,
): PlannedRoutineDraft[] {
  return listAgentAutomations(agentId).flatMap((a) =>
    (a.plans ?? []).map((p) => ({
      ...p,
      title: p.title || a.name,
    })),
  );
}

/**
 * Heuristic + JSON parse: turn an uploaded recipe into routine drafts Claude
 * can refine. Prefer explicit `routines` / `tasks` arrays when present.
 */
export function draftPlansFromAutomationBody(
  name: string,
  body: string,
): PlannedRoutineDraft[] {
  const trimmed = body.trim();
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    const rows = extractRoutineRows(parsed);
    if (rows.length > 0) {
      return rows.map((row, index) => ({
        id: `plan-${Date.now().toString(36)}-${index}`,
        title: row.title || `${name} ${index + 1}`,
        schedule: row.schedule || "Weekdays at 9:00 AM",
        instruction: row.instruction || row.title || name,
      }));
    }
  } catch {
    // plain text / markdown recipe
  }

  const lines = trimmed
    .split(/\n+/)
    .map((l) => l.replace(/^[-*•\d.)\s]+/, "").trim())
    .filter((l) => l.length > 8)
    .slice(0, 6);

  if (lines.length >= 2) {
    return lines.map((line, index) => ({
      id: `plan-${Date.now().toString(36)}-${index}`,
      title: line.slice(0, 72),
      schedule: guessSchedule(line) ?? "As needed",
      instruction: line,
    }));
  }

  return [
    {
      id: `plan-${Date.now().toString(36)}`,
      title: name,
      schedule: "On demand / after Claude refine",
      instruction: trimmed.slice(0, 500) || name,
    },
  ];
}

function extractRoutineRows(
  value: unknown,
): { title: string; schedule: string; instruction: string }[] {
  if (!value || typeof value !== "object") return [];
  const obj = value as Record<string, unknown>;
  const raw = obj.routines ?? obj.tasks ?? obj.automations ?? obj.items;
  if (!Array.isArray(raw)) {
    if (typeof obj.title === "string" || typeof obj.name === "string") {
      return [
        {
          title: String(obj.title ?? obj.name),
          schedule: String(obj.schedule ?? obj.when ?? "Weekdays at 9:00 AM"),
          instruction: String(
            obj.instruction ?? obj.prompt ?? obj.body ?? obj.title ?? obj.name,
          ),
        },
      ];
    }
    return [];
  }
  return raw
    .filter((row): row is Record<string, unknown> => !!row && typeof row === "object")
    .map((row) => ({
      title: String(row.title ?? row.name ?? "Routine"),
      schedule: String(row.schedule ?? row.when ?? "Weekdays at 9:00 AM"),
      instruction: String(
        row.instruction ?? row.prompt ?? row.description ?? row.title ?? row.name,
      ),
    }));
}

function guessSchedule(line: string): string | null {
  const lower = line.toLowerCase();
  if (/sonntag|sunday/.test(lower)) return "Every Sunday at 10:00 AM";
  if (/montag|monday|weekday|werktag/.test(lower))
    return "Weekdays at 8:30 AM";
  if (/mittwoch|wednesday/.test(lower)) return "Every Wednesday at 6:00 PM";
  if (/freitag|friday/.test(lower)) return "Every Friday at 5:00 AM";
  if (/morgen|morning/.test(lower)) return "Weekdays at 8:30 AM";
  return null;
}

export function addAgentAutomation(
  agentId: string,
  input: { name: string; body: string },
): AgentAutomation[] {
  const store = read();
  const list = store[agentId] ?? [];
  const entry: AgentAutomation = {
    id: `auto-${Date.now().toString(36)}`,
    name: input.name.trim() || "Automation",
    body: input.body,
    createdAt: new Date().toISOString(),
  };
  store[agentId] = [entry, ...list].slice(0, 40);
  write(store);
  return store[agentId];
}

/**
 * Upload → Grok train (CLI) → Claude plan drafts for Routinen.
 * This is the composer “Automatisierung hochladen” path.
 * Cloud-Computer agents only accept uploads while Automationen is enabled.
 */
export function uploadAutomationForTraining(
  agentId: string,
  input: { name: string; body: string },
): AgentAutomation {
  if (!cloudComputerAllowsAutomations(agentId)) {
    throw new Error(
      "Automatisierte Tasks sind auf diesem Cloud-Computer deaktiviert.",
    );
  }
  const list = addAgentAutomation(agentId, input);
  const entry = list[0]!;

  // Grok is strong at “Aufgabe beibringen” — queue the recipe for training.
  enqueueAgentCli(agentId, {
    target: "grok",
    command: [
      "teach_task",
      `--name ${JSON.stringify(entry.name)}`,
      "--source connect-upload",
      "",
      entry.body.slice(0, 12_000),
    ].join("\n"),
  });

  const plans = draftPlansFromAutomationBody(entry.name, entry.body);
  updateOne(agentId, entry.id, {
    grokQueuedAt: new Date().toISOString(),
    plannedAt: new Date().toISOString(),
    plans,
  });

  // Claude plans the scheduled functions under the browser Routinen list.
  enqueueAgentCli(agentId, {
    target: "claude",
    command: [
      "Plan these Connect automations as scheduled Routinen for this agent.",
      "Return a JSON array of {title, schedule, instruction}. Keep schedules concrete.",
      "",
      `Automation: ${entry.name}`,
      entry.body.slice(0, 10_000),
      "",
      "Existing draft plans (refine if needed):",
      JSON.stringify(plans, null, 2),
    ].join("\n"),
  });

  return (
    listAgentAutomations(agentId).find((a) => a.id === entry.id) ?? {
      ...entry,
      grokQueuedAt: new Date().toISOString(),
      plannedAt: new Date().toISOString(),
      plans,
    }
  );
}

/** Re-run Claude planning for an existing upload. */
export function planAutomationWithClaude(
  agentId: string,
  automationId: string,
): AgentAutomation[] {
  if (!cloudComputerAllowsAutomations(agentId)) {
    return listAgentAutomations(agentId);
  }
  const entry = listAgentAutomations(agentId).find((a) => a.id === automationId);
  if (!entry) return listAgentAutomations(agentId);
  const plans = draftPlansFromAutomationBody(entry.name, entry.body);
  enqueueAgentCli(agentId, {
    target: "claude",
    command: [
      "Refine Routinen plans for this Connect automation.",
      "Return JSON array of {title, schedule, instruction}.",
      "",
      entry.body.slice(0, 10_000),
    ].join("\n"),
  });
  return updateOne(agentId, automationId, {
    plannedAt: new Date().toISOString(),
    plans,
  });
}

export function removeAgentAutomation(
  agentId: string,
  automationId: string,
): AgentAutomation[] {
  const store = read();
  store[agentId] = (store[agentId] ?? []).filter((a) => a.id !== automationId);
  write(store);
  return store[agentId] ?? [];
}

export function subscribeAgentAutomations(cb: () => void) {
  const handler = () => cb();
  window.addEventListener("connect-agent-automations-changed", handler);
  window.addEventListener("storage", handler);
  return () => {
    window.removeEventListener("connect-agent-automations-changed", handler);
    window.removeEventListener("storage", handler);
  };
}
