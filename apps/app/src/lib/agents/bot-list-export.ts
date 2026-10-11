/**
 * Bot-List import / export.
 *
 * Why this exists: the user wants to take the bots they have built in Connect and move them to
 * another deployment (or back) without rebuilding each one through the wizard. The shape on disk
 * is the same shape `createAgentMutationOptions` POSTs — minus the things only the server can
 * invent (avatar seed, hidden flag, callback token).
 *
 * What stays out:
 *  - API keys never leave the browser. They are sensitive and the file is meant to live in plain
 *    GitHub gists / cloud drives; a user who wants keys to move can re-enter them in Settings.
 *  - Roster assignments belong to companies; companies live on the server. Re-importing does not
 *    recreate the company, only the bot. Re-assignment is a separate step the user takes on the
 *    new deployment.
 *
 * Round-trip: exported.json → next deployment → Import-Bot-Liste creates one new bot per entry,
 * each on the new deployment's "mine" list, with `mine === true`. Bots keep their name + role so
 * the person recognizes them.
 */
import { type AgentInput } from "@/lib/agents/mutations";
import { type AgentProfile } from "@/lib/agents/queries";

const SCHEMA_VERSION = 1;

export type ExportableBot = {
  name: string;
  title: string;
  roleDescription: string;
  /** Optional. We never export the key — only whether one was set. */
  hadOwnAuth: boolean;
};

export type BotListExport = {
  schema: typeof SCHEMA_VERSION;
  /** Connect version, for the file header only. Not enforced. */
  product: "connect";
  exportedAt: string;
  bots: ExportableBot[];
};

/**
 * Build an export payload from the bots the caller passes — a caller that wants only "mine"
 * filters the agent list before calling this, so this function does no filtering of its own.
 */
export function buildBotListExport(agents: AgentProfile[]): BotListExport {
  return {
    schema: SCHEMA_VERSION,
    product: "connect",
    exportedAt: new Date().toISOString(),
    bots: agents.map((agent) => ({
      name: agent.name,
      title: agent.title,
      roleDescription: agent.roleDescription,
      hadOwnAuth: agent.hasAuth,
    })),
  };
}

export type ImportOutcome = {
  created: AgentProfile[];
  skipped: Array<{ name: string; reason: string }>;
};

/**
 * Parse a file the user picked and return its bots as a list of AgentInputs. This is the only
 * place that knows the JSON layout, and a single round-trip can be tested without a server.
 */
export function parseBotListExport(input: unknown): {
  ok: true;
  bots: ExportableBot[];
} | {
  ok: false;
  reason: string;
} {
  if (!input || typeof input !== "object") {
    return { ok: false, reason: "Datei ist kein gültiges Objekt." };
  }
  const obj = input as Partial<BotListExport> & { bots?: unknown };
  if (obj.schema !== SCHEMA_VERSION) {
    return {
      ok: false,
      reason: `Schema-Version ${String(
        obj.schema,
      )} passt nicht (erwartet ${SCHEMA_VERSION}).`,
    };
  }
  if (!Array.isArray(obj.bots)) {
    return { ok: false, reason: "Das Feld 'bots' fehlt oder ist kein Array." };
  }
  const bots: ExportableBot[] = [];
  for (const [index, raw] of obj.bots.entries()) {
    if (!raw || typeof raw !== "object") {
      return {
        ok: false,
        reason: `Eintrag #${index + 1} ist kein Objekt.`,
      };
    }
    const r = raw as Partial<ExportableBot>;
    if (typeof r.name !== "string" || !r.name.trim()) {
      return {
        ok: false,
        reason: `Eintrag #${index + 1}: 'name' fehlt oder ist leer.`,
      };
    }
    bots.push({
      name: r.name.trim(),
      title: typeof r.title === "string" ? r.title : "",
      roleDescription:
        typeof r.roleDescription === "string" ? r.roleDescription : "",
      hadOwnAuth: r.hadOwnAuth === true,
    });
  }
  return { ok: true, bots };
}

export function exportableBotToInput(bot: ExportableBot): AgentInput {
  // `auth` is intentionally omitted: the import path does not carry API keys, and a keyless bot
  // is exactly what createAgentMutationOptions accepts.
  return {
    name: bot.name,
    title: bot.title,
    roleDescription: bot.roleDescription,
    visibility: "private",
  };
}

/**
 * Download a Blob as a file in the browser.
 *
 * `Object URL → anchor click → revoke` is the only path that works across browsers without
 * dragging in a download library. The revoke is on the next tick because revoking synchronously
 * in Safari breaks the download it just started.
 */
export function downloadJsonFile(filename: string, data: unknown): void {
  if (typeof window === "undefined") return;
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** Default filename for a bot list export. */
export function exportFilename(now: Date = new Date()): string {
  const stamp = now.toISOString().slice(0, 10);
  return `connect-bots-${stamp}.json`;
}