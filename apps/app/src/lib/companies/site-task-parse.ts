/**
 * Parse Unternehmen Aufgaben:
 *   @Agent "quoted task"  → that agent gets the quote
 *   remaining prose       → primary (clicked) agent
 * Quoted spans alternate red / blue for visual separation.
 */

export type SiteTaskAgent = {
  id: string;
  name: string;
};

export type SiteTaskHighlight =
  | { kind: "plain"; text: string }
  | {
      kind: "mention";
      text: string;
      agentId: string;
      color: "red" | "blue";
    }
  | {
      kind: "quote";
      text: string;
      agentId: string | null;
      color: "red" | "blue";
    };

export type SiteTaskAssignment = {
  agentId: string;
  task: string;
  color: "red" | "blue";
  /** True when this is leftover prose for the primary agent. */
  primary?: boolean;
};

const COLOR_CYCLE: Array<"red" | "blue"> = ["red", "blue"];

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Longest name / id first so "@Max Mustermann" beats "@Max". */
function mentionPattern(agents: readonly SiteTaskAgent[]): RegExp | null {
  if (agents.length === 0) return null;
  const names = [...agents]
    .flatMap((a) => [a.name.trim(), a.id])
    .filter(Boolean)
    .sort((a, b) => b.length - a.length)
    .map(escapeRegExp);
  if (names.length === 0) return null;
  return new RegExp(`@(${names.join("|")})(?![\\w-])`, "gi");
}

function resolveAgent(
  agents: readonly SiteTaskAgent[],
  raw: string,
): SiteTaskAgent | undefined {
  const needle = raw.trim().toLowerCase();
  return agents.find(
    (a) =>
      a.name.trim().toLowerCase() === needle ||
      a.id.toLowerCase() === needle,
  );
}

/**
 * Split the draft into highlight segments for the dark Aufgabe field.
 */
export function highlightSiteTask(
  text: string,
  agents: readonly SiteTaskAgent[],
): SiteTaskHighlight[] {
  if (!text) return [];
  const pattern = mentionPattern(agents);
  const out: SiteTaskHighlight[] = [];
  let colorIdx = 0;
  let lastAgentId: string | null = null;
  let i = 0;

  while (i < text.length) {
    if (pattern) {
      pattern.lastIndex = i;
      const m = pattern.exec(text);
      if (m && m.index === i) {
        const agent = resolveAgent(agents, m[1] ?? "");
        const color = COLOR_CYCLE[colorIdx % 2]!;
        if (agent) {
          out.push({
            kind: "mention",
            text: m[0],
            agentId: agent.id,
            color,
          });
          lastAgentId = agent.id;
          colorIdx += 1;
        } else {
          out.push({ kind: "plain", text: m[0] });
        }
        i += m[0].length;
        continue;
      }
    }

    if (text[i] === '"') {
      const end = text.indexOf('"', i + 1);
      if (end !== -1) {
        const color =
          lastAgentId != null
            ? (out.find(
                (s) =>
                  s.kind === "mention" && s.agentId === lastAgentId,
              ) as Extract<SiteTaskHighlight, { kind: "mention" }> | undefined)
                ?.color ?? COLOR_CYCLE[Math.max(0, colorIdx - 1) % 2]!
            : COLOR_CYCLE[colorIdx % 2]!;
        out.push({
          kind: "quote",
          text: text.slice(i, end + 1),
          agentId: lastAgentId,
          color,
        });
        if (lastAgentId == null) colorIdx += 1;
        i = end + 1;
        continue;
      }
    }

    // Accumulate plain until next @ or "
    let j = i + 1;
    while (j < text.length) {
      if (text[j] === '"' || text[j] === "@") break;
      j += 1;
    }
    out.push({ kind: "plain", text: text.slice(i, j) });
    i = j;
  }

  return mergePlain(out);
}

function mergePlain(segments: SiteTaskHighlight[]): SiteTaskHighlight[] {
  const out: SiteTaskHighlight[] = [];
  for (const seg of segments) {
    const last = out[out.length - 1];
    if (seg.kind === "plain" && last?.kind === "plain") {
      last.text += seg.text;
    } else {
      out.push({ ...seg });
    }
  }
  return out;
}

/**
 * Build per-agent assignments from the draft.
 * Quoted text after @Agent goes to that agent; leftover prose → primaryAgentId.
 */
export function parseSiteTaskAssignments(
  text: string,
  agents: readonly SiteTaskAgent[],
  primaryAgentId: string | null,
): SiteTaskAssignment[] {
  const segments = highlightSiteTask(text, agents);
  const byAgent = new Map<string, { task: string; color: "red" | "blue" }>();
  let primaryParts: string[] = [];
  let pendingMention: { agentId: string; color: "red" | "blue" } | null =
    null;

  for (const seg of segments) {
    if (seg.kind === "mention") {
      pendingMention = { agentId: seg.agentId, color: seg.color };
      continue;
    }
    if (seg.kind === "quote") {
      const inner = seg.text.replace(/^"|"$/g, "").trim();
      if (!inner) continue;
      const agentId = seg.agentId ?? pendingMention?.agentId;
      const color = seg.color;
      if (agentId) {
        const prev = byAgent.get(agentId);
        byAgent.set(agentId, {
          color: prev?.color ?? color,
          task: prev ? `${prev.task}\n${inner}` : inner,
        });
      } else if (primaryAgentId) {
        primaryParts.push(inner);
      }
      pendingMention = null;
      continue;
    }
    // plain — keep for primary unless it's only whitespace around mentions
    if (seg.text.trim()) {
      primaryParts.push(seg.text.trim());
    }
    pendingMention = null;
  }

  const assignments: SiteTaskAssignment[] = [];
  for (const [agentId, value] of byAgent) {
    assignments.push({
      agentId,
      task: value.task,
      color: value.color,
    });
  }

  const primaryTask = primaryParts.join(" ").replace(/\s+/g, " ").trim();
  if (primaryAgentId && primaryTask) {
    const existing = assignments.find((a) => a.agentId === primaryAgentId);
    if (existing) {
      existing.task = `${primaryTask}\n${existing.task}`.trim();
      existing.primary = true;
    } else {
      assignments.push({
        agentId: primaryAgentId,
        task: primaryTask,
        color: "blue",
        primary: true,
      });
    }
  }

  // No quotes / mentions — whole draft to primary
  if (assignments.length === 0 && primaryAgentId && text.trim()) {
    assignments.push({
      agentId: primaryAgentId,
      task: text.trim(),
      color: "blue",
      primary: true,
    });
  }

  return assignments;
}

export const HIGHLIGHT_COLORS = {
  red: {
    outline: "rgba(239, 68, 68, 0.95)",
    bg: "rgba(239, 68, 68, 0.18)",
    text: "#fecaca",
  },
  blue: {
    outline: "rgba(59, 130, 246, 0.95)",
    bg: "rgba(59, 130, 246, 0.18)",
    text: "#bfdbfe",
  },
} as const;
