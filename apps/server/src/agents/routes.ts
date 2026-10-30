import type { Context, MiddlewareHandler } from "hono";
import { Hono } from "hono";
import type { AuditEventType, AuditStore } from "../audit";
import { recordAuditEvent } from "../audit";
import type { AppVariables } from "../auth/guards";
import { testAgentConnection } from "./connection-test";
import { checkAgentEndpoint } from "./endpoint";
import { canManageAgent } from "./profile-policy";
import {
  AgentNotFoundError,
  AgentNotManageableError,
  type AgentProfileStore,
  ManagedAgentUnavailableError,
  ProtectedAgentError,
} from "./profile-store";
import type {
  AgentActor,
  AgentProfile,
  CreateAgentInput,
} from "./profile-types";
import { loadCodexRegister } from "../agent-hub/codex-accounts";
import {
  DEFAULT_SKILLS_CATALOG,
  normalizeAgentSkills,
  type AgentSkill,
} from "./agent-skills";
import {
  normalizeAgentWebsites,
  syncAgentWebsitesToWorkspace,
  type AgentWebsite,
} from "./agent-websites";
import {
  normalizeAgentSubagents,
  syncAgentSubagentsToWorkspace,
  DEFAULT_SUBAGENTS,
  type AgentSubagent,
} from "./agent-subagents";
import {
  readAgentCliMcpConfig,
  writeAgentCliMcpConfig,
  writeRawAgentCliMcpConfig,
  syncAllAgentCliMcpConfigs,
  subscribeAgentCliMcpChanges,
  SUPPORTED_CLIS,
  type AgentCliMcpServer,
  type SupportedCli,
} from "./agent-cli-mcp";
import {
  getBrowserUseStatus,
  browserUseOpen,
  browserUseClick,
  browserUseType,
  browserUseScreenshot,
  browserUseRunTask,
  type BrowserUseServiceStatus,
  type BrowserUseActionResult,
} from "./agent-browser-use";

type AgentInputParseResult =
  | { ok: true; value: CreateAgentInput }
  | { ok: false; error: string };

type AgentInputObject = {
  name?: unknown;
  title?: unknown;
  roleDescription?: unknown;
  visibility?: unknown;
  endpoint?: unknown;
  auth?: unknown;
  headline?: unknown;
  role?: unknown;
  description?: unknown;
  chosenCli?: unknown;
  accountEmail?: unknown;
  skills?: unknown;
  sparkPermissions?: unknown;
  browserProfile?: unknown;
  websiteList?: unknown;
  subagents?: unknown;
  mcpList?: unknown;
  /**
   * Phase B Schritt 7 (Helium Bugfix):
   * Engine-Felder müssen vom Parser akzeptiert werden, sonst gehen sie stillschweigend
   * verloren und `engine.kind` fällt immer auf den Default "antigravity" zurück.
   *
   * - `cliEngine` für CLI-Engines (antigravity/codex/claude).
   * - `freebuffEngine` für die Stufe-4 Freebuff-Engine.
   * - `manusEngine` für die Stufe-3 Manus-Cloud-Engine.
   * - `browserUseEngine` für den Stufe-3 browser-use Sidecar.
   *
   * `browserProfile` (oben) wird sowohl als String (Profilname) als auch als Objekt
   * (`{ kind: "browser_profile", startUrl, profileName, allowWrite }`) akzeptiert.
   */
  cliEngine?: unknown;
  freebuffEngine?: unknown;
  manusEngine?: unknown;
  browserUseEngine?: unknown;
};

/**
 * Helium-Bugfix: Parser für die Engine-Unterobjekte.
 *
 * Vorher: `parseAgentInput` warf `cliEngine`/`freebuffEngine`/... weg, weil es nur die
 * Wurzel-Felder kannte. `profile-store.create` würde sie korrekt in `configuration.cli`
 * bzw. `configuration.freebuff` ablegen — bekam aber nie etwas, weil der Parser die
 * Objekte verschluckte. Folge: `engineOf()` lieferte immer `null` für nicht-antigravity,
 * das `Seitenfenster beim Bot` zeigte unabhängig von der Modellwahl immer "Antigravity".
 *
 * Diese Parser validieren Shape + Wertebereich, lehnen alles andere mit HTTP 400 ab,
 * und liefern im Erfolgsfall den gleichen Typ, den `agentInputFrom()` auf der Client-Seite
 * ausspuckt. Damit `profile-store.create` 1:1 speichern kann.
 *
 * `null` / `undefined` lassen sich durchreichen, ohne die Engine zu setzen.
 */
type CliEngineKind = "antigravity" | "codex" | "claude" | "freebuff";
const CLI_ENGINE_KINDS = new Set<CliEngineKind>(["antigravity", "codex", "claude", "freebuff"]);

type ParsedCliEngine = { kind: CliEngineKind; model: string; allowWrite: boolean };
type ParsedFreebuff = { kind: "freebuff"; model: string; allowWrite: boolean };
type ParsedManus = { kind: "manus"; model: string; profileName?: string };
type ParsedBrowserUse = { kind: "browser_use"; startUrl?: string; allowWrite: boolean };

function parseCliEngine(value: unknown):
  | { ok: true; value: ParsedCliEngine | undefined }
  | { ok: false; error: string } {
  if (value === null || value === undefined) return { ok: true, value: undefined };
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { ok: false, error: "cliEngine must be an object." };
  }
  const obj = value as Record<string, unknown>;
  const kind = obj.kind;
  if (typeof kind !== "string" || !CLI_ENGINE_KINDS.has(kind as CliEngineKind)) {
    return { ok: false, error: `cliEngine.kind must be one of antigravity, codex, claude, freebuff — got ${JSON.stringify(kind)}.` };
  }
  const model = typeof obj.model === "string" && obj.model.length > 0 ? obj.model : "auto";
  const allowWrite = obj.allowWrite === true;
  return { ok: true, value: { kind: kind as CliEngineKind, model, allowWrite } };
}

function parseFreebuffEngine(value: unknown):
  | { ok: true; value: ParsedFreebuff | undefined }
  | { ok: false; error: string } {
  if (value === null || value === undefined) return { ok: true, value: undefined };
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { ok: false, error: "freebuffEngine must be an object." };
  }
  const obj = value as Record<string, unknown>;
  if (obj.kind !== "freebuff") {
    return { ok: false, error: `freebuffEngine.kind must be "freebuff" — got ${JSON.stringify(obj.kind)}.` };
  }
  const model = typeof obj.model === "string" && obj.model.length > 0 ? obj.model : "auto";
  const allowWrite = obj.allowWrite === true;
  return { ok: true, value: { kind: "freebuff", model, allowWrite } };
}

function parseManusEngine(value: unknown):
  | { ok: true; value: ParsedManus | undefined }
  | { ok: false; error: string } {
  if (value === null || value === undefined) return { ok: true, value: undefined };
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { ok: false, error: "manusEngine must be an object." };
  }
  const obj = value as Record<string, unknown>;
  if (obj.kind !== "manus") {
    return { ok: false, error: `manusEngine.kind must be "manus" — got ${JSON.stringify(obj.kind)}.` };
  }
  const model = typeof obj.model === "string" && obj.model.length > 0 ? obj.model : "auto";
  const profileName = typeof obj.profileName === "string" && obj.profileName.trim()
    ? obj.profileName.trim()
    : undefined;
  return profileName
    ? { ok: true, value: { kind: "manus", model, profileName } }
    : { ok: true, value: { kind: "manus", model } };
}

function parseBrowserUseEngine(value: unknown):
  | { ok: true; value: ParsedBrowserUse | undefined }
  | { ok: false; error: string } {
  if (value === null || value === undefined) return { ok: true, value: undefined };
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { ok: false, error: "browserUseEngine must be an object." };
  }
  const obj = value as Record<string, unknown>;
  if (obj.kind !== "browser_use") {
    return { ok: false, error: `browserUseEngine.kind must be "browser_use" — got ${JSON.stringify(obj.kind)}.` };
  }
  const rawUrl = typeof obj.startUrl === "string" ? obj.startUrl.trim() : "";
  if (rawUrl && !/^https?:\/\//.test(rawUrl)) {
    return { ok: false, error: "browserUseEngine.startUrl must start with http:// or https://." };
  }
  const allowWrite = obj.allowWrite === true;
  return rawUrl
    ? { ok: true, value: { kind: "browser_use", startUrl: rawUrl, allowWrite } }
    : { ok: true, value: { kind: "browser_use", allowWrite } };
}

/**
 * Parse and validate what a user typed into the agent form.
 *
 * `allowPrivateHosts` is passed in rather than read from configuration here so this stays a pure
 * function: a developer's own agent lives on localhost, and a hosted deployment must refuse exactly
 * that, so the answer depends on the deployment and the test suite needs to exercise both.
 */
export function parseAgentInput(
  input: unknown,
  allowPrivateHosts = false,
  /** Private addresses this deployment named as acceptable. Empty is the default posture. */
  allowedHosts: ReadonlySet<string> = new Set(),
): AgentInputParseResult {
  if (!isAgentInputObject(input)) {
    return { ok: false, error: "Agent input must be a JSON object." };
  }

  const name = boundedText(
    input.name,
    80,
    "Name must be text between 1 and 80 characters.",
  );
  if (typeof name !== "string") return name;

  const title = boundedText(
    input.title,
    120,
    "Title must be text between 1 and 120 characters.",
  );
  if (typeof title !== "string") return title;

  const roleDescription = boundedText(
    input.roleDescription,
    1000,
    "Role description must be text between 1 and 1000 characters.",
  );
  if (typeof roleDescription !== "string") return roleDescription;

  /*
   * Connect treats every coworker as private. Older clients may still send `public`; both
   * values are accepted and stored as private so create/edit never diverge on visibility.
   */
  if (
    input.visibility !== undefined &&
    typeof input.visibility !== "string"
  ) {
    return { ok: false, error: "Visibility must be public or private." };
  }
  if (
    typeof input.visibility === "string" &&
    input.visibility.trim() !== "" &&
    input.visibility.trim() !== "public" &&
    input.visibility.trim() !== "private"
  ) {
    return { ok: false, error: "Visibility must be public or private." };
  }
  const visibility = "private";

  // The endpoint is optional and checked. Absent means the Bot in the box, which is what most people
  // want on their first go. Present means this server will POST to an address a person chose, so it
  // goes through the same target check as navigation before it is allowed anywhere near the database.
  let endpoint: string | undefined;
  if (input.endpoint !== undefined && input.endpoint !== "") {
    const verdict = checkAgentEndpoint(input.endpoint, {
      allowPrivateHosts,
      allowedHosts,
    });
    if (!verdict.allowed) return { ok: false, error: verdict.reason };
    endpoint = verdict.url;
  }

  // The key is optional and write-only. An absent field leaves an existing key alone; sending one
  // replaces it. There is no way to read one back, here or anywhere.
  let auth: { header: string; value: string } | undefined;
  if (input.auth !== undefined && input.auth !== null) {
    const supplied = input.auth as { header?: unknown; value?: unknown };
    const value =
      typeof supplied.value === "string" ? supplied.value.trim() : "";
    if (value) {
      const header =
        typeof supplied.header === "string" && supplied.header.trim()
          ? supplied.header.trim()
          : "Authorization";
      if (!/^[A-Za-z0-9-]+$/.test(header)) {
        return { ok: false, error: "That is not a valid header name." };
      }
      // Refused here rather than discovered on the first run. This value is encrypted and stored,
      // and then sent as a header on every turn the Bot takes; one that cannot be a header value
      // throws inside `fetch` every one of those times, long after the form said it was saved.
      const unsendable = unsendableHeaderValue(value);
      if (unsendable) {
        return {
          ok: false,
          error: `That key contains ${unsendable}, so it cannot be sent as a header.`,
        };
      }
      auth = { header, value };
    }
  }

  const headline =
    typeof input.headline === "string"
      ? input.headline.trim()
      : input.headline === null
        ? null
        : undefined;
  const role =
    typeof input.role === "string"
      ? input.role.trim()
      : input.role === null
        ? null
        : undefined;
  const description =
    typeof input.description === "string"
      ? input.description.trim()
      : input.description === null
        ? null
        : undefined;
  const chosenCli =
    typeof input.chosenCli === "string"
      ? input.chosenCli.trim()
      : undefined;
  const accountEmail =
    typeof input.accountEmail === "string"
      ? input.accountEmail.trim()
      : input.accountEmail === null
        ? null
        : undefined;
  const skills = Array.isArray(input.skills) ? normalizeAgentSkills(input.skills) : undefined;
  const sparkPermissions =
    typeof input.sparkPermissions === "object" && input.sparkPermissions !== null
      ? (input.sparkPermissions as Record<string, unknown>)
      : undefined;
  /*
   * `browserProfile` darf entweder ein Profilname-String ODER das Engine-Objekt
   * (`{ kind: "browser_profile", startUrl, profileName, allowWrite }`) sein.
   * `agentInputFrom` sendet das Objekt. Vorher akzeptierte der Parser nur String-Pfad,
   * wodurch das Objekt stillschweigend verworfen wurde — Helium-Bugfix.
   */
  let browserProfile:
    | string
    | { kind: "browser_profile"; startUrl: string; profileName: string; allowWrite: boolean }
    | undefined;
  if (typeof input.browserProfile === "string") {
    browserProfile = input.browserProfile.trim();
  } else if (
    typeof input.browserProfile === "object" &&
    input.browserProfile !== null &&
    !Array.isArray(input.browserProfile)
  ) {
    const obj = input.browserProfile as Record<string, unknown>;
    if (obj.kind === "browser_profile") {
      const rawUrl = typeof obj.startUrl === "string" ? obj.startUrl.trim() : "";
      if (rawUrl && !/^https?:\/\//.test(rawUrl)) {
        return { ok: false, error: "browserProfile.startUrl must start with http:// or https://." };
      }
      const profileName = typeof obj.profileName === "string" ? obj.profileName.trim() : "";
      browserProfile = {
        kind: "browser_profile",
        startUrl: rawUrl,
        profileName,
        allowWrite: obj.allowWrite === true,
      };
    }
  }
  const websiteList = Array.isArray(input.websiteList) ? normalizeAgentWebsites(input.websiteList) : undefined;
  const subagents = Array.isArray(input.subagents) ? normalizeAgentSubagents(input.subagents) : undefined;
  const mcpList = Array.isArray(input.mcpList) ? input.mcpList : undefined;

  // Helium-Bugfix: Engine-Unterobjekte parsen und validieren, bevor sie in der
  // Datenbank landen. `profile-store.create` nimmt sie aus `CreateAgentInput` und
  // legt sie in `configuration.cli` (bzw. `configuration.freebuff` etc.) ab.
  const cliParsed = parseCliEngine(input.cliEngine);
  if (!cliParsed.ok) return { ok: false, error: cliParsed.error };
  const freebuffParsed = parseFreebuffEngine(input.freebuffEngine);
  if (!freebuffParsed.ok) return { ok: false, error: freebuffParsed.error };
  const manusParsed = parseManusEngine(input.manusEngine);
  if (!manusParsed.ok) return { ok: false, error: manusParsed.error };
  const browserUseParsed = parseBrowserUseEngine(input.browserUseEngine);
  if (!browserUseParsed.ok) return { ok: false, error: browserUseParsed.error };

  return {
    ok: true,
    value: {
      name,
      title,
      roleDescription,
      visibility,
      endpoint,
      auth,
      ...(headline !== undefined ? { headline } : {}),
      ...(role !== undefined ? { role } : {}),
      ...(description !== undefined ? { description } : {}),
      ...(chosenCli !== undefined ? { chosenCli } : {}),
      ...(accountEmail !== undefined ? { accountEmail } : {}),
      ...(skills !== undefined ? { skills } : {}),
      ...(sparkPermissions !== undefined ? { sparkPermissions } : {}),
      ...(browserProfile !== undefined ? { browserProfile } : {}),
      ...(websiteList !== undefined ? { websiteList } : {}),
      ...(subagents !== undefined ? { subagents } : {}),
      ...(mcpList !== undefined ? { mcpList } : {}),
      ...(cliParsed.value ? { cliEngine: cliParsed.value } : {}),
      ...(freebuffParsed.value ? { freebuffEngine: freebuffParsed.value } : {}),
      ...(manusParsed.value ? { manusEngine: manusParsed.value } : {}),
      ...(browserUseParsed.value ? { browserUseEngine: browserUseParsed.value } : {}),
    },
  };
}

function isAgentInputObject(input: unknown): input is AgentInputObject {
  return typeof input === "object" && input !== null && !Array.isArray(input);
}

/**
 * What in this value stops it being a header, or null when nothing does.
 *
 * `new Headers()` refuses a line break, a NUL, and any code point above U+00FF, and it refuses them
 * by throwing a TypeError from inside `fetch` — which is not a decision this deployment gets to
 * take part in. Both surfaces below take a header value from the same box on the same form and
 * neither looked, so the throw arrived somewhere that reads as something else entirely: on the
 * connection test it lands in the catch written for a dead host, and the person is told "this server
 * could not reach that address", which sends them to their tunnel and their firewall over a key
 * they had just pasted with a wrapped line in it. A hyphen a document turned into an en dash does
 * the same thing, and looks like nothing at all in a password box.
 *
 * The description never contains the value. This is asked of a credential on one of the two paths,
 * and one character of a secret in an error message is one character too many.
 */
function unsendableHeaderValue(value: string): string | null {
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0;
    if (code === 0x0a || code === 0x0d) return "a line break";
    if (code === 0) return "a null character";
    if (code > 0xff) return "a character that cannot go in a header value";
  }
  return null;
}

/**
 * Parse and validate the headers a person attaches to a connection test.
 *
 * Unvalidated, the route cast any object straight into the probe `fetch`, so an array value, a
 * nested object, or a `__proto__` key travelled into the network call and threw a TypeError 500 —
 * or probed header handling the deployment never meant to exercise. Names follow the same rule as
 * the stored agent auth header; values must be strings; the whole map is capped so a pasted dump
 * cannot balloon the probe.
 */
export function parseConnectionHeaders(
  input: unknown,
):
  | { ok: true; value: Record<string, string> | undefined }
  | { ok: false; error: string } {
  if (input === undefined) return { ok: true, value: undefined };
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return { ok: false, error: "Headers must be an object of name to value." };
  }
  /*
   * A JSON body carrying `__proto__` does not arrive as an own property: `JSON.parse` sets the
   * object's prototype instead, so `Object.entries` never sees it and a name block-list below
   * would pass it straight through into the probe fetch. Refuse any headers object whose prototype
   * is not a plain one before reading entries.
   */
  if (Object.getPrototypeOf(input) !== Object.prototype) {
    return { ok: false, error: "Headers must be an object of name to value." };
  }
  const entries = Object.entries(input);
  if (entries.length > 32) {
    return { ok: false, error: "Headers must have at most 32 entries." };
  }
  const headers: Record<string, string> = {};
  for (const [name, value] of entries) {
    if (
      name === "__proto__" ||
      name === "constructor" ||
      name === "prototype" ||
      !/^[A-Za-z0-9-]+$/.test(name) ||
      name.length > 64
    ) {
      return {
        ok: false,
        error: `That is not a valid header name: ${name.slice(0, 64)}.`,
      };
    }
    if (typeof value !== "string") {
      return {
        ok: false,
        error: `Header "${name}" must be a string value.`,
      };
    }
    if (value.length > 4096) {
      return {
        ok: false,
        error: `Header "${name}" must be at most 4096 characters.`,
      };
    }
    const unsendable = unsendableHeaderValue(value);
    if (unsendable) {
      return {
        ok: false,
        error: `Header "${name}" contains ${unsendable}, so it cannot be sent.`,
      };
    }
    headers[name] = value;
  }
  return { ok: true, value: entries.length === 0 ? undefined : headers };
}

/**
 * The local development actor, which is not a row in `users`.
 *
 * The audit table has a foreign key to that table, so writing this id would fail the constraint and
 * lose the row entirely. Who it was is in the payload either way.
 */
const DEV_ACTOR_EMAIL = "stefankunc994@gmail.com";

export function createAgentRoutes(
  store: AgentProfileStore,
  requireUser: MiddlewareHandler<{ Variables: AppVariables }>,
  /** Whether this deployment may talk to its own network. True on a laptop, false when hosted. */
  allowPrivateHosts = false,
  /** Where a Bot's own refusal is recorded. Absent in tests that do not care about the trail. */
  auditStore?: AuditStore,
  /**
   * Private addresses this deployment named as acceptable for an agent to live at.
   *
   * Separate from `allowPrivateHosts` on purpose: that one opens the network, this one opens an
   * address. A hosted deployment sets this and leaves the other off.
   */
  allowedHosts: ReadonlySet<string> = new Set(),
  /**
   * Which Bots a Bot may hand work to, for the screen that grants it.
   *
   * A named object rather than another positional argument: every parameter above this one is
   * optional, so a misplaced one typechecks and silently does nothing, and this list is already at
   * the length where that stops being hypothetical.
   *
   * Absent in a deployment with no plugin store, which is a deployment where no Bot may address any
   * other. The screen is then told the capability is off rather than shown a control that grants
   * nothing.
   */
  handoff?: {
    /** Whether the deployment's own caps leave the capability switched on at all. */
    enabled: boolean;
    /** The Bots this one may address today, read per call so a revoked grant stops showing. */
    reachableFrom: (agentId: string) => Promise<readonly string[]>;
    /**
     * Whether this Bot can be a grantee at all — the handing-on tool executes inside this
     * deployment's own run loop, so only a Bot that runs in it can be offered one. Exposed so the
     * screen can say that once, instead of letting every switch fail with the same refusal.
     * Optional so a caller without a plugin store answers "no" rather than crashing the read.
     */
    runsHere?: (agentId: string) => Promise<boolean | undefined>;
  },
  /**
   * Whether a coworker can run on this deployment's own Bot, i.e. be created with no endpoint.
   *
   * The store already refuses such a create on a deployment with no managed Bot; this exists so a
   * screen can say so before somebody fills in three steps of a form that was always going to fail.
   */
  builtInAvailable = false,
  /**
   * The managed Bot's own address, so a coworker created without an endpoint can be told apart.
   *
   * Creation bakes this address into the coworker's stored configuration, and afterwards nothing in
   * the row says whether a person supplied it. The difference matters to exactly one screen: a
   * coworker running here calls tools back with the deployment's own credential and needs no setup,
   * while one a person hosts needs a callback token put into their process. Without this flag the
   * dialog nagged built-in coworkers about a credential they never needed.
   */
  managedEndpoint?: string,
) {
  /** The dto with the one fact only this closure knows: whether the coworker runs on our own Bot. */
  const dto = (actor: AgentActor, agent: AgentProfile) => ({
    ...agentDto(actor, agent),
    // A string comparison on purpose: two absent values must not read as "runs on our Bot".
    builtIn:
      typeof agent.endpoint === "string" && agent.endpoint === managedEndpoint,
  });
  const routes = new Hono<{ Variables: AppVariables }>();

  /**
   * The Bot declined something, and says so.
   *
   * The audit trail records what a Bot did, decided by the gateway on the way to an action. A model
   * that refuses before calling any tool takes no action, so this records the attempted request.
   *
   * Self-reported, and said so in the row. The Bot calls this because its tool description tells it
   * to, so a model that declines without a tool call still writes nothing. This is evidence, not enforcement:
   * nothing is prevented by it, and a reader must not mistake an empty list for an untroubled Bot.
   */
  routes.post("/:agentId/declined", requireUser, async (context) => {
    const agentId = context.req.param("agentId");
    const body = (await context.req.json().catch(() => null)) as {
      reason?: unknown;
      request?: unknown;
    } | null;

    const reason = typeof body?.reason === "string" ? body.reason.trim() : "";
    if (!reason) {
      return context.json({ error: "A reason is required." }, 400);
    }

    /*
     * The same question every other route here asks first: is this a Bot the caller may reach?
     *
     * The row says "reportedBy: the Bot itself", and the Bot reports through the person's session,
     * so the trail's only way of knowing the report came from a Bot is that the person could have
     * been talking to that Bot. Without this check, any signed-in person could write a decline
     * against any id at all, a coworker they cannot see included, and an administrator reading the
     * trail would take it for something the Bot said. Not found rather than forbidden, as the store
     * answers everywhere else, so the check does not confirm which ids exist.
     */
    const agent = await store.get(context.var.actor, agentId);
    if (!agent) {
      return context.json({ error: "Agent not found." }, 404);
    }

    if (auditStore) {
      const actor = context.var.actor;
      await recordAuditEvent(auditStore, {
        eventType: "bot.declined",
        targetType: "agent",
        targetId: agentId,
        ...(actor?.id && actor.email !== DEV_ACTOR_EMAIL
          ? { actorUserId: actor.id }
          : {}),
        payload: {
          bot: agentId,
          actor: actor?.email ?? "unknown",
          reason: reason.slice(0, 500),
          // What it was asked, in the Bot's own words and only if it offered them. Truncated for the
          // same reason every other payload here is: a trail is not a transcript.
          ...(typeof body?.request === "string" && body.request.trim()
            ? { request: body.request.trim().slice(0, 500) }
            : {}),
          reportedBy: "the Bot itself",
        },
      });
    }

    return context.json({ recorded: true });
  });

  routes.get("/", requireUser, async (context) => {
    try {
      const hidden = context.req.query("hidden") === "true";
      const agents = await store.list(context.var.actor, hidden);
      return context.json({
        agents: agents.map((agent) => dto(context.var.actor, agent)),
      });
    } catch (error) {
      return mapStoreError(context, error);
    }
  });

  /**
   * What kinds of coworker this deployment can create, for the screen that asks.
   *
   * Static per process: whether a managed Bot exists is deployment configuration, not data. Above
   * the parameterised route on purpose, so "capabilities" can never be read as an agent id.
   */
  routes.get("/capabilities", requireUser, (context) =>
    context.json({ capabilities: { builtInAvailable } }),
  );

  routes.get("/:agentId", requireUser, async (context) => {
    // A whitespace id would reach the store query and answer 500 on some backends instead of a
    // 400 for a malformed call. Existence stays a 404; shape is checked here.
    if (!context.req.param("agentId").trim()) {
      return context.json({ error: "A Bot id is required." }, 400);
    }
    try {
      const agent = await store.get(
        context.var.actor,
        context.req.param("agentId"),
      );
      if (!agent) {
        return context.json({ error: "Agent not found." }, 404);
      }
      return context.json({ agent: dto(context.var.actor, agent) });
    } catch (error) {
      return mapStoreError(context, error);
    }
  });

  /**
   * Try an endpoint before saving it.
   *
   * Deliberately not part of create: a person needs to know whether their agent answers before they
   * commit to it, and they need to be able to try again without creating dead
   * Bots on the way. It runs the same target check as saving, so it cannot probe addresses that
   * registration would refuse.
   */
  routes.post("/test-connection", requireUser, async (context) => {
    const body = (await context.req.json().catch(() => null)) as {
      endpoint?: unknown;
      headers?: unknown;
    } | null;
    const parsed = parseConnectionHeaders(body?.headers);
    if (!parsed.ok) {
      return context.json({ error: parsed.error }, 400);
    }
    const headers = parsed.value;
    const result = await testAgentConnection(body?.endpoint, {
      headers,
      allowPrivateHosts,
      allowedHosts,
    });
    // 200 either way: the request succeeded, and the verdict is the payload. A failed connection test
    // is an answer, not an error, and a 4xx here would have the surface render it as a broken button.
    return context.json(result);
  });

  /**
   * Record something that changed a Bot.
   *
   * One helper rather than eight copies, because the eight routes below all answer the same question
   * and the payload has to be the same shape for a reader filtering the trail.
   *
   * Never fatal. The change is already made and the caller has been told so; a trail that is briefly
   * unavailable is not a reason to report a failure that did not happen.
   */
  const record = async (
    context: Context<{ Variables: AppVariables }>,
    eventType: Extract<AuditEventType, `bot.${string}`>,
    agentId: string,
    payload: Record<string, unknown> = {},
  ): Promise<void> => {
    if (!auditStore) return;
    const actor = context.var.actor;
    try {
      await recordAuditEvent(auditStore, {
        eventType,
        targetType: "agent",
        targetId: agentId,
        ...(actor?.id && actor.email !== DEV_ACTOR_EMAIL
          ? { actorUserId: actor.id }
          : {}),
        payload: { bot: agentId, actor: actor?.email ?? "unknown", ...payload },
      });
    } catch (error) {
      console.error(
        JSON.stringify({
          type: "bot-audit-write-failed",
          eventType,
          agentId,
          error: String(error),
        }),
      );
    }
  };

  routes.post("/", requireUser, async (context) => {
    // Malformed JSON is a recoverable client-input error and is validated by the same parser.
    const parsed = parseAgentInput(
      await context.req.json().catch(() => null),
      allowPrivateHosts,
      allowedHosts,
    );
    if (!parsed.ok) return context.json({ error: parsed.error }, 400);

    try {
      /*
       * A coworker with no address runs here, on the text this form already requires.
       *
       * "Agent endpoint (optional)" was not optional on the recommended one-container image: with
       * nothing to bind to, `create` refused with "This deployment has no managed Bot", so a person
       * could not make a coworker at all on the image the README tells them to deploy. The role
       * description is what such a coworker runs on — the same field a `built_in` Bot in the tenant
       * package carries, for the same purpose — and passing it only when no endpoint was given keeps
       * every other path exactly as it was: give an address and it is a remote Bot, as before.
       */
      const agent = await store.create(context.var.actor, {
        ...parsed.value,
        ...(parsed.value.endpoint
          ? {}
          : { systemPrompt: parsed.value.roleDescription }),
      });
      /*
       * The endpoint, because that is where conversation content will be sent, and whether a key was
       * attached, because "this Bot authenticates" is a fact and the key itself never is.
       *
       * And who may reach it. `visibility` is not a display preference: `accessFilter` admits a
       * `public` coworker to every signed-in person, and `canRunAgent` is `canAccessAgent`, so public
       * means everybody in the deployment may act as this Bot and spend the grants it holds. A row
       * that cannot say which it was cannot reconstruct who could use this coworker at the time.
       */
      await record(context, "bot.created", agent.id, {
        name: parsed.value.name,
        visibility: parsed.value.visibility,
        ...(parsed.value.endpoint ? { endpoint: parsed.value.endpoint } : {}),
        hasKey: Boolean(parsed.value.auth),
      });
      return context.json({ agent: dto(context.var.actor, agent) }, 201);
    } catch (error) {
      return mapStoreError(context, error);
    }
  });

  routes.patch("/:agentId", requireUser, async (context) => {
    // Malformed JSON is a recoverable client-input error and is validated by the same parser.
    const parsed = parseAgentInput(
      await context.req.json().catch(() => null),
      allowPrivateHosts,
      allowedHosts,
    );
    if (!parsed.ok) return context.json({ error: parsed.error }, 400);

    try {
      const agent = await store.update(
        context.var.actor,
        context.req.param("agentId"),
        parsed.value,
      );
      /*
       * What changed, not the new values. Repointing the endpoint is the dangerous edit and is worth
       * naming; a replaced key is worth knowing about and is never worth recording.
       *
       * `visibility` is carried the way `name` is — on every row, whether or not this edit moved it —
       * because it is the second dangerous edit and the route has no before to compare against.
       * Public admits every signed-in person to this coworker, and `canRunAgent` is `canAccessAgent`,
       * so it hands them the right to act as it and spend what it was granted. Without the value on
       * each row, an edit that opened a coworker to the whole deployment is byte-identical to one
       * that corrected its title, and the trail cannot say when it was opened or by whom. Recorded on
       * every row rather than only on the row that changed it, so reading the trail forward tells you
       * what was reachable at any point, which is what an incident asks.
       */
      await record(context, "bot.updated", agent.id, {
        name: parsed.value.name,
        visibility: parsed.value.visibility,
        ...(parsed.value.endpoint ? { endpoint: parsed.value.endpoint } : {}),
        ...(parsed.value.auth ? { keyReplaced: true } : {}),
      });

      let warning: string | undefined;
      if (parsed.value.accountEmail && typeof parsed.value.accountEmail === "string") {
        const cleanEmail = parsed.value.accountEmail.trim().toLowerCase();
        const manifest = loadCodexRegister();
        const existsInRegister = manifest.availableEmails.some(
          (a) => a.email.toLowerCase() === cleanEmail,
        );
        if (!existsInRegister) {
          warning = `E-Mail "${parsed.value.accountEmail}" wurde nicht im Instanz-Register (000_Codex Start) gefunden. Ein eigener separater Bot-Config-Ordner wird angelegt.`;
        }
      }

      return context.json({
        agent: dto(context.var.actor, agent),
        ...(warning ? { warning } : {}),
      });
    } catch (error) {
      return mapStoreError(context, error);
    }
  });

  routes.post("/:agentId/chosen-cli", requireUser, async (context) => {
    const agentId = context.req.param("agentId");
    const body = (await context.req.json().catch(() => ({}))) as { cli?: string; chosenCli?: string };
    const requested = (body.chosenCli || body.cli || "").toLowerCase().trim();
    const allowed = new Set(["antigravity", "codex", "claude", "freebuff", "hermes"]);
    if (!requested || !allowed.has(requested)) {
      return context.json(
        { error: `cli muss einer von ${Array.from(allowed).join(", ")} sein.` },
        400,
      );
    }
    try {
      const existing = await store.get(context.var.actor, agentId);
      if (!existing) return context.json({ error: "Agent not found." }, 404);
      const agent = store.setChosenCli
        ? await store.setChosenCli(context.var.actor, agentId, requested)
        : await store.update(context.var.actor, agentId, {
            name: existing.name,
            title: existing.title,
            roleDescription: existing.roleDescription,
            visibility: "private",
            chosenCli: requested,
          });
      await record(context, "bot.updated", agent.id, { chosenCli: requested });
      try {
        const { agentHub } = await import("../agent-hub/service");
        const { writeAgentSettings } = await import("../agent-hub/db");
        const { syncAgentCliMcpConfigs } = await import("../agent-hub/agent-cli-mcp-sync");
        const hub = agentHub();
        if (hub?.deps?.database) {
          await writeAgentSettings(hub.deps.database, agentId, {
            model: {
              provider: `${requested}-cli`,
              model: "auto",
              credentialId: null,
              keyHint: null,
            },
          }).catch(() => {});
          await syncAgentCliMcpConfigs(hub.deps.database, agentId).catch(() => {});
        }
      } catch {
        // best-effort sync
      }
      return context.json({ ok: true, chosenCli: requested, agent: dto(context.var.actor, agent) });
    } catch (error) {
      return mapStoreError(context, error);
    }
  });

  routes.post("/:agentId/duplicate", requireUser, async (context) => {
    if (!context.req.param("agentId").trim()) {
      return context.json({ error: "A Bot id is required." }, 400);
    }
    try {
      const agent = await store.duplicate(
        context.var.actor,
        context.req.param("agentId"),
      );
      // Recorded against the copy, naming the original: a duplicate inherits an endpoint, so the
      // reader needs to know a second Bot now points at it.
      await record(context, "bot.duplicated", agent.id, {
        copiedFrom: context.req.param("agentId"),
      });
      return context.json({ agent: dto(context.var.actor, agent) }, 201);
    } catch (error) {
      return mapStoreError(context, error);
    }
  });

  routes.post("/:agentId/hide", requireUser, async (context) => {
    try {
      await store.setHidden(
        context.var.actor,
        context.req.param("agentId"),
        true,
      );
      await record(context, "bot.hidden", context.req.param("agentId"));
      return context.body(null, 204);
    } catch (error) {
      return mapStoreError(context, error);
    }
  });

  routes.post("/:agentId/unhide", requireUser, async (context) => {
    try {
      await store.setHidden(
        context.var.actor,
        context.req.param("agentId"),
        false,
      );
      await record(context, "bot.unhidden", context.req.param("agentId"));
      return context.body(null, 204);
    } catch (error) {
      return mapStoreError(context, error);
    }
  });

  /*
   * Issue this agent its callback credential, and show it once.
   *
   * A POST because it writes and because it replaces: calling it again rotates, which is how a leaked
   * token is retired. The token is in the response and nowhere else, ever again, and it is not written
   * to the audit payload either: a trail that records credentials is a credential store with worse
   * access control.
   */
  routes.post("/:agentId/callback-token", requireUser, async (context) => {
    try {
      const token = await store.issueCallbackToken(
        context.var.actor,
        context.req.param("agentId"),
      );
      // That one was issued, never what it is. A trail that records credentials is a credential
      // store with worse access control.
      await record(
        context,
        "bot.callback_token_issued",
        context.req.param("agentId"),
      );
      return context.json({ token }, 201);
    } catch (error) {
      return mapStoreError(context, error);
    }
  });

  /** Take it away. The agent may still hold a conversation; it may not reach anything outside one. */
  routes.delete("/:agentId/callback-token", requireUser, async (context) => {
    try {
      await store.revokeCallbackToken(
        context.var.actor,
        context.req.param("agentId"),
      );
      await record(
        context,
        "bot.callback_token_revoked",
        context.req.param("agentId"),
      );
      return context.body(null, 204);
    } catch (error) {
      return mapStoreError(context, error);
    }
  });

  routes.delete("/:agentId", requireUser, async (context) => {
    if (!context.req.param("agentId").trim()) {
      return context.json({ error: "A Bot id is required." }, 400);
    }
    try {
      await store.softDelete(context.var.actor, context.req.param("agentId"));
      await record(context, "bot.deleted", context.req.param("agentId"));
      return context.body(null, 204);
    } catch (error) {
      return mapStoreError(context, error);
    }
  });

  /* ---------- Skills API (Phase C Schritt 10) ---------- */

  /** Ruft die Skills des Agenten ab (inkl. Standard-Katalog). */
  routes.get("/:agentId/skills", requireUser, async (context) => {
    const agentId = context.req.param("agentId");
    try {
      const agent = await store.get(context.var.actor, agentId);
      if (!agent) throw new AgentNotFoundError(agentId);
      const skills = normalizeAgentSkills(agent.skills);
      return context.json({ skills, catalog: DEFAULT_SKILLS_CATALOG });
    } catch (error) {
      return mapStoreError(context, error);
    }
  });

  /** Aktualisiert die komplette Skills-Liste des Agenten. */
  routes.put("/:agentId/skills", requireUser, async (context) => {
    const agentId = context.req.param("agentId");
    try {
      const agent = await store.get(context.var.actor, agentId);
      if (!agent) throw new AgentNotFoundError(agentId);
      if (!canManageAgent(context.var.actor, agent)) {
        throw new AgentNotManageableError(agentId);
      }
      const body = (await context.req.json().catch(() => ({}))) as {
        skills?: unknown[];
      };
      if (!Array.isArray(body.skills)) {
        return context.json({ error: "skills must be an array" }, 400);
      }
      const normalized = normalizeAgentSkills(body.skills);
      const updated = await store.update(context.var.actor, agentId, {
        name: agent.name,
        title: agent.title,
        roleDescription: agent.roleDescription,
        visibility: agent.visibility,
        skills: normalized,
      });
      await record(context, "bot.updated", agentId, {
        activeCount: normalized.filter((s) => s.enabled).length,
      });
      return context.json({
        skills: normalizeAgentSkills(updated.skills),
        agent: dto(context.var.actor, updated),
      });
    } catch (error) {
      return mapStoreError(context, error);
    }
  });

  /** Schaltet einen Skill an oder aus. */
  routes.post("/:agentId/skills/toggle", requireUser, async (context) => {
    const agentId = context.req.param("agentId");
    try {
      const agent = await store.get(context.var.actor, agentId);
      if (!agent) throw new AgentNotFoundError(agentId);
      if (!canManageAgent(context.var.actor, agent)) {
        throw new AgentNotManageableError(agentId);
      }
      const body = (await context.req.json().catch(() => ({}))) as {
        skillId?: string;
        enabled?: boolean;
      };
      if (!body.skillId || typeof body.skillId !== "string") {
        return context.json({ error: "skillId is required" }, 400);
      }
      const skillId = body.skillId.trim().toLowerCase();
      const current = normalizeAgentSkills(agent.skills);
      let found = false;
      const nextSkills = current.map((s) => {
        if (s.id.toLowerCase() === skillId) {
          found = true;
          return {
            ...s,
            enabled: body.enabled !== undefined ? Boolean(body.enabled) : !s.enabled,
          };
        }
        return s;
      });
      if (!found) {
        const catMatch = DEFAULT_SKILLS_CATALOG.find((c) => c.id.toLowerCase() === skillId);
        if (catMatch) {
          nextSkills.push({
            ...catMatch,
            enabled: body.enabled !== undefined ? Boolean(body.enabled) : true,
          });
        }
      }
      const updated = await store.update(context.var.actor, agentId, {
        name: agent.name,
        title: agent.title,
        roleDescription: agent.roleDescription,
        visibility: agent.visibility,
        skills: nextSkills,
      });
      return context.json({
        skills: normalizeAgentSkills(updated.skills),
        skillId,
        agent: dto(context.var.actor, updated),
      });
    } catch (error) {
      return mapStoreError(context, error);
    }
  });

  /** Fügt einen neuen Skill zum Agenten hinzu. */
  routes.post("/:agentId/skills/add", requireUser, async (context) => {
    const agentId = context.req.param("agentId");
    try {
      const agent = await store.get(context.var.actor, agentId);
      if (!agent) throw new AgentNotFoundError(agentId);
      if (!canManageAgent(context.var.actor, agent)) {
        throw new AgentNotManageableError(agentId);
      }
      const body = (await context.req.json().catch(() => ({}))) as {
        name?: string;
        description?: string;
        prompt?: string;
        enabled?: boolean;
      };
      if (!body.name || typeof body.name !== "string" || !body.name.trim()) {
        return context.json({ error: "Skill name is required" }, 400);
      }
      const cleanName = body.name.trim();
      const skillId = cleanName.toLowerCase().replace(/[^a-z0-9_-]/g, "-").slice(0, 50) || `skill-${Date.now()}`;
      const newSkill: AgentSkill = {
        id: skillId,
        name: cleanName,
        description: typeof body.description === "string" ? body.description.trim() : "",
        prompt: typeof body.prompt === "string" ? body.prompt.trim() : undefined,
        enabled: body.enabled !== false,
        source: "custom",
        createdAt: new Date().toISOString(),
      };
      const current = normalizeAgentSkills(agent.skills);
      const nextSkills = current.filter((s) => s.id !== skillId);
      nextSkills.push(newSkill);
      const updated = await store.update(context.var.actor, agentId, {
        name: agent.name,
        title: agent.title,
        roleDescription: agent.roleDescription,
        visibility: agent.visibility,
        skills: nextSkills,
      });
      return context.json(
        {
          skills: normalizeAgentSkills(updated.skills),
          added: newSkill,
          agent: dto(context.var.actor, updated),
        },
        201,
      );
    } catch (error) {
      return mapStoreError(context, error);
    }
  });

  /** Phase C Schritt 13: Listet die Webseiten des Agenten. */
  routes.get("/:agentId/websites", requireUser, async (context) => {
    const agentId = context.req.param("agentId");
    try {
      const agent = await store.get(context.var.actor, agentId);
      if (!agent) throw new AgentNotFoundError(agentId);
      const websites = normalizeAgentWebsites(agent.websiteList);
      return context.json({ websites });
    } catch (error) {
      return mapStoreError(context, error);
    }
  });

  /** Phase C Schritt 13: Aktualisiert die komplette Webseiten-Liste des Agenten. */
  routes.put("/:agentId/websites", requireUser, async (context) => {
    const agentId = context.req.param("agentId");
    try {
      const agent = await store.get(context.var.actor, agentId);
      if (!agent) throw new AgentNotFoundError(agentId);
      if (!canManageAgent(context.var.actor, agent)) {
        throw new AgentNotManageableError(agentId);
      }
      const body = (await context.req.json().catch(() => ({}))) as {
        websites?: unknown[];
      };
      if (!Array.isArray(body.websites)) {
        return context.json({ error: "websites must be an array" }, 400);
      }
      const normalized = normalizeAgentWebsites(body.websites);
      const updated = await store.update(context.var.actor, agentId, {
        name: agent.name,
        title: agent.title,
        roleDescription: agent.roleDescription,
        visibility: agent.visibility,
        websiteList: normalized,
      });

      // Synchronisiere physisch in den Workspace des Agenten
      try {
        const { getAgentWorkspaceDir } = await import("../agent-hub/agent-terminal-manager");
        const { getAgentCliConfigDirs } = await import("../agent-hub/codex-accounts");
        const workspaceDir = getAgentWorkspaceDir(agentId);
        const paths = getAgentCliConfigDirs(agentId, agent.accountEmail ?? undefined);
        syncAgentWebsitesToWorkspace(agentId, normalized, workspaceDir, paths.antigravityHome);
      } catch {
        // Best-effort
      }

      await record(context, "bot.updated", agentId, {
        activeWebsitesCount: normalized.filter((w) => w.enabled).length,
      });
      return context.json({
        websites: normalizeAgentWebsites(updated.websiteList),
        agent: dto(context.var.actor, updated),
      });
    } catch (error) {
      return mapStoreError(context, error);
    }
  });

  /** Phase C Schritt 13: Fügt eine Webseite zur Liste des Agenten hinzu. */
  routes.post("/:agentId/websites/add", requireUser, async (context) => {
    const agentId = context.req.param("agentId");
    try {
      const agent = await store.get(context.var.actor, agentId);
      if (!agent) throw new AgentNotFoundError(agentId);
      if (!canManageAgent(context.var.actor, agent)) {
        throw new AgentNotManageableError(agentId);
      }
      const body = (await context.req.json().catch(() => ({}))) as {
        url?: string;
        purpose?: string;
        wofuer?: string;
        enabled?: boolean;
      };
      if (!body.url || typeof body.url !== "string" || !body.url.trim()) {
        return context.json({ error: "URL ist erforderlich" }, 400);
      }
      const cleanUrl = body.url.trim();
      const cleanPurpose = (body.purpose || body.wofuer || "Recherche & Kontext").trim();
      const current = normalizeAgentWebsites(agent.websiteList);
      const next = [
        ...current.filter((w) => w.url.toLowerCase() !== cleanUrl.toLowerCase()),
        {
          id: `web-${Date.now()}-${encodeURIComponent(cleanUrl.slice(0, 15)).replace(/[^a-z0-9]/gi, "").toLowerCase()}`,
          url: cleanUrl,
          purpose: cleanPurpose,
          enabled: body.enabled !== false,
          createdAt: new Date().toISOString(),
        },
      ];
      const updated = await store.update(context.var.actor, agentId, {
        name: agent.name,
        title: agent.title,
        roleDescription: agent.roleDescription,
        visibility: agent.visibility,
        websiteList: next,
      });

      // Synchronisiere physisch in den Workspace des Agenten
      try {
        const { getAgentWorkspaceDir } = await import("../agent-hub/agent-terminal-manager");
        const { getAgentCliConfigDirs } = await import("../agent-hub/codex-accounts");
        const workspaceDir = getAgentWorkspaceDir(agentId);
        const paths = getAgentCliConfigDirs(agentId, agent.accountEmail ?? undefined);
        syncAgentWebsitesToWorkspace(agentId, next, workspaceDir, paths.antigravityHome);
      } catch {
        // Best-effort
      }

      return context.json(
        {
          websites: normalizeAgentWebsites(updated.websiteList),
          agent: dto(context.var.actor, updated),
        },
        201,
      );
    } catch (error) {
      return mapStoreError(context, error);
    }
  });

  /** Phase C Schritt 13: Schaltet eine Webseite an oder aus. */
  routes.post("/:agentId/websites/toggle", requireUser, async (context) => {
    const agentId = context.req.param("agentId");
    try {
      const agent = await store.get(context.var.actor, agentId);
      if (!agent) throw new AgentNotFoundError(agentId);
      if (!canManageAgent(context.var.actor, agent)) {
        throw new AgentNotManageableError(agentId);
      }
      const body = (await context.req.json().catch(() => ({}))) as {
        websiteId?: string;
        url?: string;
        enabled?: boolean;
      };
      const current = normalizeAgentWebsites(agent.websiteList);
      let found = false;
      const next = current.map((w) => {
        if (
          (body.websiteId && w.id === body.websiteId) ||
          (body.url && w.url.toLowerCase() === body.url.trim().toLowerCase())
        ) {
          found = true;
          return {
            ...w,
            enabled: body.enabled !== undefined ? Boolean(body.enabled) : !w.enabled,
          };
        }
        return w;
      });
      if (!found) {
        return context.json({ error: "Webseite nicht gefunden" }, 404);
      }
      const updated = await store.update(context.var.actor, agentId, {
        name: agent.name,
        title: agent.title,
        roleDescription: agent.roleDescription,
        visibility: agent.visibility,
        websiteList: next,
      });

      // Synchronisiere physisch in den Workspace des Agenten
      try {
        const { getAgentWorkspaceDir } = await import("../agent-hub/agent-terminal-manager");
        const { getAgentCliConfigDirs } = await import("../agent-hub/codex-accounts");
        const workspaceDir = getAgentWorkspaceDir(agentId);
        const paths = getAgentCliConfigDirs(agentId, agent.accountEmail ?? undefined);
        syncAgentWebsitesToWorkspace(agentId, next, workspaceDir, paths.antigravityHome);
      } catch {
        // Best-effort
      }

      return context.json({
        websites: normalizeAgentWebsites(updated.websiteList),
        agent: dto(context.var.actor, updated),
      });
    } catch (error) {
      return mapStoreError(context, error);
    }
  });

  /** Phase C Schritt 13: Löscht eine Webseite aus der Liste des Agenten. */
  routes.delete("/:agentId/websites/:websiteId", requireUser, async (context) => {
    const agentId = context.req.param("agentId");
    const websiteId = context.req.param("websiteId");
    try {
      const agent = await store.get(context.var.actor, agentId);
      if (!agent) throw new AgentNotFoundError(agentId);
      if (!canManageAgent(context.var.actor, agent)) {
        throw new AgentNotManageableError(agentId);
      }
      const current = normalizeAgentWebsites(agent.websiteList);
      const next = current.filter((w) => w.id !== websiteId && w.url !== websiteId);
      const updated = await store.update(context.var.actor, agentId, {
        name: agent.name,
        title: agent.title,
        roleDescription: agent.roleDescription,
        visibility: agent.visibility,
        websiteList: next,
      });

      // Synchronisiere physisch in den Workspace des Agenten
      try {
        const { getAgentWorkspaceDir } = await import("../agent-hub/agent-terminal-manager");
        const { getAgentCliConfigDirs } = await import("../agent-hub/codex-accounts");
        const workspaceDir = getAgentWorkspaceDir(agentId);
        const paths = getAgentCliConfigDirs(agentId, agent.accountEmail ?? undefined);
        syncAgentWebsitesToWorkspace(agentId, next, workspaceDir, paths.antigravityHome);
      } catch {
        // Best-effort
      }

      return context.json({
        websites: normalizeAgentWebsites(updated.websiteList),
        agent: dto(context.var.actor, updated),
      });
    } catch (error) {
      return mapStoreError(context, error);
    }
  });

  /** Phase C Schritt 14: Listet die Subagenten (Online-KIs) des Agenten. */
  routes.get("/:agentId/subagents", requireUser, async (context) => {
    const agentId = context.req.param("agentId");
    try {
      const agent = await store.get(context.var.actor, agentId);
      if (!agent) throw new AgentNotFoundError(agentId);
      const subagents = normalizeAgentSubagents(agent.subagents);
      return context.json({ subagents });
    } catch (error) {
      return mapStoreError(context, error);
    }
  });

  /** Phase C Schritt 14: Aktualisiert die komplette Subagenten-Liste des Agenten. */
  routes.put("/:agentId/subagents", requireUser, async (context) => {
    const agentId = context.req.param("agentId");
    try {
      const agent = await store.get(context.var.actor, agentId);
      if (!agent) throw new AgentNotFoundError(agentId);
      if (!canManageAgent(context.var.actor, agent)) {
        throw new AgentNotManageableError(agentId);
      }
      const body = (await context.req.json().catch(() => ({}))) as {
        subagents?: unknown[];
      };
      if (!Array.isArray(body.subagents)) {
        return context.json({ error: "subagents must be an array" }, 400);
      }
      const normalized = normalizeAgentSubagents(body.subagents);
      const updated = await store.update(context.var.actor, agentId, {
        name: agent.name,
        title: agent.title,
        roleDescription: agent.roleDescription,
        visibility: agent.visibility,
        subagents: normalized,
      });

      // Synchronisiere physisch in den Workspace des Agenten
      try {
        const { getAgentWorkspaceDir } = await import("../agent-hub/agent-terminal-manager");
        const { getAgentCliConfigDirs } = await import("../agent-hub/codex-accounts");
        const workspaceDir = getAgentWorkspaceDir(agentId);
        const paths = getAgentCliConfigDirs(agentId, agent.accountEmail ?? undefined);
        syncAgentSubagentsToWorkspace(agentId, normalized, workspaceDir, paths.antigravityHome);
      } catch {
        // Best-effort
      }

      await record(context, "bot.updated", agentId, {
        activeSubagentsCount: normalized.filter((s) => s.enabled).length,
      });
      return context.json({
        subagents: normalizeAgentSubagents(updated.subagents),
        agent: dto(context.var.actor, updated),
      });
    } catch (error) {
      return mapStoreError(context, error);
    }
  });

  /** Phase C Schritt 14: Fügt einen Subagenten (Online-KI) zur Liste des Agenten hinzu. */
  routes.post("/:agentId/subagents/add", requireUser, async (context) => {
    const agentId = context.req.param("agentId");
    try {
      const agent = await store.get(context.var.actor, agentId);
      if (!agent) throw new AgentNotFoundError(agentId);
      if (!canManageAgent(context.var.actor, agent)) {
        throw new AgentNotManageableError(agentId);
      }
      const body = (await context.req.json().catch(() => ({}))) as {
        name?: string;
        url?: string;
        link?: string;
        description?: string;
        beschreibung?: string;
        purpose?: string;
        enabled?: boolean;
      };
      const rawName = (body.name || "").trim();
      let rawUrl = (body.url || body.link || "").trim();
      if (!rawName && !rawUrl) {
        return context.json({ error: "Name oder Link ist erforderlich" }, 400);
      }
      if (rawUrl && !/^https?:\/\//i.test(rawUrl)) {
        rawUrl = `https://${rawUrl}`;
      }
      const cleanName = rawName || rawUrl.replace(/^https?:\/\//, "").split("/")[0];
      const cleanDesc = (body.description || body.beschreibung || body.purpose || "Online-KI").trim();
      const current = normalizeAgentSubagents(agent.subagents);
      const next = [
        ...current.filter((s) => s.name.toLowerCase() !== cleanName.toLowerCase()),
        {
          id: `subagent-${Date.now()}-${encodeURIComponent(cleanName.slice(0, 15)).replace(/[^a-z0-9]/gi, "").toLowerCase()}`,
          name: cleanName,
          url: rawUrl || "https://example.com",
          description: cleanDesc,
          enabled: body.enabled !== false,
          createdAt: new Date().toISOString(),
        },
      ];
      const updated = await store.update(context.var.actor, agentId, {
        name: agent.name,
        title: agent.title,
        roleDescription: agent.roleDescription,
        visibility: agent.visibility,
        subagents: next,
      });

      // Synchronisiere physisch in den Workspace des Agenten
      try {
        const { getAgentWorkspaceDir } = await import("../agent-hub/agent-terminal-manager");
        const { getAgentCliConfigDirs } = await import("../agent-hub/codex-accounts");
        const workspaceDir = getAgentWorkspaceDir(agentId);
        const paths = getAgentCliConfigDirs(agentId, agent.accountEmail ?? undefined);
        syncAgentSubagentsToWorkspace(agentId, next, workspaceDir, paths.antigravityHome);
      } catch {
        // Best-effort
      }

      return context.json(
        {
          subagents: normalizeAgentSubagents(updated.subagents),
          agent: dto(context.var.actor, updated),
        },
        201,
      );
    } catch (error) {
      return mapStoreError(context, error);
    }
  });

  /** Phase C Schritt 14: Editiert einen existierenden Subagenten (Online-KI). */
  routes.post("/:agentId/subagents/edit", requireUser, async (context) => {
    const agentId = context.req.param("agentId");
    try {
      const agent = await store.get(context.var.actor, agentId);
      if (!agent) throw new AgentNotFoundError(agentId);
      if (!canManageAgent(context.var.actor, agent)) {
        throw new AgentNotManageableError(agentId);
      }
      const body = (await context.req.json().catch(() => ({}))) as {
        id?: string;
        name?: string;
        url?: string;
        description?: string;
        enabled?: boolean;
      };
      if (!body.id && !body.name) {
        return context.json({ error: "id oder name ist erforderlich" }, 400);
      }
      const current = normalizeAgentSubagents(agent.subagents);
      let found = false;
      const next = current.map((s) => {
        if ((body.id && s.id === body.id) || (body.name && s.name.toLowerCase() === body.name.trim().toLowerCase())) {
          found = true;
          let cleanUrl = typeof body.url === "string" ? body.url.trim() : s.url;
          if (cleanUrl && !/^https?:\/\//i.test(cleanUrl)) {
            cleanUrl = `https://${cleanUrl}`;
          }
          return {
            ...s,
            name: typeof body.name === "string" && body.name.trim() ? body.name.trim() : s.name,
            url: cleanUrl || s.url,
            description: typeof body.description === "string" ? body.description.trim() : s.description,
            enabled: body.enabled !== undefined ? Boolean(body.enabled) : s.enabled,
          };
        }
        return s;
      });
      if (!found) {
        return context.json({ error: "Subagent nicht gefunden" }, 404);
      }
      const updated = await store.update(context.var.actor, agentId, {
        name: agent.name,
        title: agent.title,
        roleDescription: agent.roleDescription,
        visibility: agent.visibility,
        subagents: next,
      });

      // Synchronisiere physisch in den Workspace des Agenten
      try {
        const { getAgentWorkspaceDir } = await import("../agent-hub/agent-terminal-manager");
        const { getAgentCliConfigDirs } = await import("../agent-hub/codex-accounts");
        const workspaceDir = getAgentWorkspaceDir(agentId);
        const paths = getAgentCliConfigDirs(agentId, agent.accountEmail ?? undefined);
        syncAgentSubagentsToWorkspace(agentId, next, workspaceDir, paths.antigravityHome);
      } catch {
        // Best-effort
      }

      return context.json({
        subagents: normalizeAgentSubagents(updated.subagents),
        agent: dto(context.var.actor, updated),
      });
    } catch (error) {
      return mapStoreError(context, error);
    }
  });

  /** Phase C Schritt 14: Schaltet einen Subagenten an oder aus. */
  routes.post("/:agentId/subagents/toggle", requireUser, async (context) => {
    const agentId = context.req.param("agentId");
    try {
      const agent = await store.get(context.var.actor, agentId);
      if (!agent) throw new AgentNotFoundError(agentId);
      if (!canManageAgent(context.var.actor, agent)) {
        throw new AgentNotManageableError(agentId);
      }
      const body = (await context.req.json().catch(() => ({}))) as {
        subagentId?: string;
        id?: string;
        name?: string;
        enabled?: boolean;
      };
      const current = normalizeAgentSubagents(agent.subagents);
      let found = false;
      const targetId = body.subagentId || body.id;
      const next = current.map((s) => {
        if (
          (targetId && s.id === targetId) ||
          (body.name && s.name.toLowerCase() === body.name.trim().toLowerCase())
        ) {
          found = true;
          return {
            ...s,
            enabled: body.enabled !== undefined ? Boolean(body.enabled) : !s.enabled,
          };
        }
        return s;
      });
      if (!found) {
        return context.json({ error: "Subagent nicht gefunden" }, 404);
      }
      const updated = await store.update(context.var.actor, agentId, {
        name: agent.name,
        title: agent.title,
        roleDescription: agent.roleDescription,
        visibility: agent.visibility,
        subagents: next,
      });

      // Synchronisiere physisch in den Workspace des Agenten
      try {
        const { getAgentWorkspaceDir } = await import("../agent-hub/agent-terminal-manager");
        const { getAgentCliConfigDirs } = await import("../agent-hub/codex-accounts");
        const workspaceDir = getAgentWorkspaceDir(agentId);
        const paths = getAgentCliConfigDirs(agentId, agent.accountEmail ?? undefined);
        syncAgentSubagentsToWorkspace(agentId, next, workspaceDir, paths.antigravityHome);
      } catch {
        // Best-effort
      }

      return context.json({
        subagents: normalizeAgentSubagents(updated.subagents),
        agent: dto(context.var.actor, updated),
      });
    } catch (error) {
      return mapStoreError(context, error);
    }
  });

  /** Phase C Schritt 14: Löscht einen Subagenten aus der Liste des Agenten. */
  routes.delete("/:agentId/subagents/:subagentId", requireUser, async (context) => {
    const agentId = context.req.param("agentId");
    const subagentId = context.req.param("subagentId");
    try {
      const agent = await store.get(context.var.actor, agentId);
      if (!agent) throw new AgentNotFoundError(agentId);
      if (!canManageAgent(context.var.actor, agent)) {
        throw new AgentNotManageableError(agentId);
      }
      const current = normalizeAgentSubagents(agent.subagents);
      const next = current.filter((s) => s.id !== subagentId && s.name.toLowerCase() !== subagentId.toLowerCase());
      const updated = await store.update(context.var.actor, agentId, {
        name: agent.name,
        title: agent.title,
        roleDescription: agent.roleDescription,
        visibility: agent.visibility,
        subagents: next,
      });

      // Synchronisiere physisch in den Workspace des Agenten
      try {
        const { getAgentWorkspaceDir } = await import("../agent-hub/agent-terminal-manager");
        const { getAgentCliConfigDirs } = await import("../agent-hub/codex-accounts");
        const workspaceDir = getAgentWorkspaceDir(agentId);
        const paths = getAgentCliConfigDirs(agentId, agent.accountEmail ?? undefined);
        syncAgentSubagentsToWorkspace(agentId, next, workspaceDir, paths.antigravityHome);
      } catch {
        // Best-effort
      }

      return context.json({
        subagents: normalizeAgentSubagents(updated.subagents),
        agent: dto(context.var.actor, updated),
      });
    } catch (error) {
      return mapStoreError(context, error);
    }
  });

  /** Phase C Schritt 14: Setzt die Subagenten auf die Startwerte zurück (Manus, Perplexity, Ottermind, Lovable). */
  routes.post("/:agentId/subagents/reset-defaults", requireUser, async (context) => {
    const agentId = context.req.param("agentId");
    try {
      const agent = await store.get(context.var.actor, agentId);
      if (!agent) throw new AgentNotFoundError(agentId);
      if (!canManageAgent(context.var.actor, agent)) {
        throw new AgentNotManageableError(agentId);
      }
      const defaults = DEFAULT_SUBAGENTS.map((item) => ({ ...item }));
      const updated = await store.update(context.var.actor, agentId, {
        name: agent.name,
        title: agent.title,
        roleDescription: agent.roleDescription,
        visibility: agent.visibility,
        subagents: defaults,
      });

      // Synchronisiere physisch in den Workspace des Agenten
      try {
        const { getAgentWorkspaceDir } = await import("../agent-hub/agent-terminal-manager");
        const { getAgentCliConfigDirs } = await import("../agent-hub/codex-accounts");
        const workspaceDir = getAgentWorkspaceDir(agentId);
        const paths = getAgentCliConfigDirs(agentId, agent.accountEmail ?? undefined);
        syncAgentSubagentsToWorkspace(agentId, defaults, workspaceDir, paths.antigravityHome);
      } catch {
        // Best-effort
      }

      return context.json({
        subagents: normalizeAgentSubagents(updated.subagents),
        agent: dto(context.var.actor, updated),
      });
    } catch (error) {
      return mapStoreError(context, error);
    }
  });

  // =========================================================================
  // Phase C Schritt 15: Echte MCP-Server pro CLI
  // =========================================================================

  // 1. MCP-Konfiguration der jeweiligen CLI aus deren Config-Datei im Agenten-Konto lesen
  routes.get("/:agentId/cli-mcp", requireUser, async (context) => {
    const agentId = context.req.param("agentId");
    const cliParam = context.req.query("cli");
    try {
      const agent = await store.get(context.var.actor, agentId);
      if (!agent) return context.json({ error: "Agent not found." }, 404);

      const targetCli = (cliParam as SupportedCli) || (agent.chosenCli as SupportedCli) || "antigravity";
      const configInfo = readAgentCliMcpConfig(agentId, targetCli, agent.accountEmail);

      return context.json({
        ...configInfo,
        chosenCli: agent.chosenCli ?? "antigravity",
      });
    } catch (error) {
      return mapStoreError(context, error);
    }
  });

  // 2. Server hinzufügen oder bearbeiten - schreibt sofort zurück in die CLI-Config
  routes.post("/:agentId/cli-mcp/server", requireUser, async (context) => {
    const agentId = context.req.param("agentId");
    try {
      const agent = await store.get(context.var.actor, agentId);
      if (!agent) return context.json({ error: "Agent not found." }, 404);

      const body = (await context.req.json().catch(() => ({}))) as {
        cli?: string;
        server?: Partial<AgentCliMcpServer>;
      };

      if (!body.server || !body.server.id) {
        return context.json({ error: "Server mit gültiger ID erforderlich." }, 400);
      }

      const targetCli = (body.cli as SupportedCli) || (agent.chosenCli as SupportedCli) || "antigravity";
      const current = readAgentCliMcpConfig(agentId, targetCli, agent.accountEmail);

      const newServer: AgentCliMcpServer = {
        id: String(body.server.id).trim().toLowerCase().replace(/[^a-z0-9_-]/g, "-"),
        name: String(body.server.name || body.server.id).trim(),
        type: body.server.type === "stdio" ? "stdio" : body.server.type === "sse" ? "sse" : "http",
        url: body.server.url ? String(body.server.url).trim() : undefined,
        command: body.server.command ? String(body.server.command).trim() : undefined,
        args: Array.isArray(body.server.args) ? body.server.args.map(String) : undefined,
        env: body.server.env && typeof body.server.env === "object" ? (body.server.env as Record<string, string>) : undefined,
        description: body.server.description ? String(body.server.description).trim() : undefined,
        enabled: body.server.enabled !== false,
      };

      const updatedServers = [
        ...current.servers.filter((s) => s.id !== newServer.id),
        newServer,
      ];

      const updatedConfig = writeAgentCliMcpConfig(
        agentId,
        targetCli,
        updatedServers,
        agent.accountEmail,
      );

      // Aktualisiere mcpList in der Datenbank
      try {
        await store.update(context.var.actor, agentId, {
          name: agent.name,
          title: agent.title,
          roleDescription: agent.roleDescription,
          visibility: agent.visibility,
          mcpList: updatedServers.filter((s) => s.enabled).map((s) => s.id),
        });
      } catch {}

      return context.json({
        ok: true,
        cli: targetCli,
        server: newServer,
        config: updatedConfig,
      });
    } catch (error) {
      return mapStoreError(context, error);
    }
  });

  // 3. Server umschalten (an / aus)
  routes.post("/:agentId/cli-mcp/toggle", requireUser, async (context) => {
    const agentId = context.req.param("agentId");
    try {
      const agent = await store.get(context.var.actor, agentId);
      if (!agent) return context.json({ error: "Agent not found." }, 404);

      const body = (await context.req.json().catch(() => ({}))) as {
        cli?: string;
        serverId?: string;
        enabled?: boolean;
      };

      if (!body.serverId) {
        return context.json({ error: "serverId erforderlich" }, 400);
      }

      const targetCli = (body.cli as SupportedCli) || (agent.chosenCli as SupportedCli) || "antigravity";
      const current = readAgentCliMcpConfig(agentId, targetCli, agent.accountEmail);

      const targetId = body.serverId.toLowerCase();
      const updatedServers = current.servers.map((s) =>
        s.id.toLowerCase() === targetId
          ? { ...s, enabled: body.enabled !== undefined ? body.enabled : !s.enabled }
          : s,
      );

      const updatedConfig = writeAgentCliMcpConfig(
        agentId,
        targetCli,
        updatedServers,
        agent.accountEmail,
      );

      try {
        await store.update(context.var.actor, agentId, {
          name: agent.name,
          title: agent.title,
          roleDescription: agent.roleDescription,
          visibility: agent.visibility,
          mcpList: updatedServers.filter((s) => s.enabled).map((s) => s.id),
        });
      } catch {}

      return context.json({
        ok: true,
        cli: targetCli,
        config: updatedConfig,
      });
    } catch (error) {
      return mapStoreError(context, error);
    }
  });

  // 4. Server löschen
  routes.delete("/:agentId/cli-mcp/server/:serverId", requireUser, async (context) => {
    const agentId = context.req.param("agentId");
    const serverId = context.req.param("serverId");
    const cliParam = context.req.query("cli");
    try {
      const agent = await store.get(context.var.actor, agentId);
      if (!agent) return context.json({ error: "Agent not found." }, 404);

      const targetCli = (cliParam as SupportedCli) || (agent.chosenCli as SupportedCli) || "antigravity";
      const current = readAgentCliMcpConfig(agentId, targetCli, agent.accountEmail);

      const targetId = serverId.toLowerCase();
      const updatedServers = current.servers.filter(
        (s) => s.id.toLowerCase() !== targetId,
      );

      const updatedConfig = writeAgentCliMcpConfig(
        agentId,
        targetCli,
        updatedServers,
        agent.accountEmail,
      );

      try {
        await store.update(context.var.actor, agentId, {
          name: agent.name,
          title: agent.title,
          roleDescription: agent.roleDescription,
          visibility: agent.visibility,
          mcpList: updatedServers.filter((s) => s.enabled).map((s) => s.id),
        });
      } catch {}

      return context.json({
        ok: true,
        cli: targetCli,
        deletedId: serverId,
        config: updatedConfig,
      });
    } catch (error) {
      return mapStoreError(context, error);
    }
  });

  // 5. Rohen Config-Inhalt 1:1 zurückschreiben
  routes.put("/:agentId/cli-mcp/raw", requireUser, async (context) => {
    const agentId = context.req.param("agentId");
    try {
      const agent = await store.get(context.var.actor, agentId);
      if (!agent) return context.json({ error: "Agent not found." }, 404);

      const body = (await context.req.json().catch(() => ({}))) as {
        cli?: string;
        rawContent?: string;
      };

      if (typeof body.rawContent !== "string") {
        return context.json({ error: "rawContent muss ein String sein" }, 400);
      }

      const targetCli = (body.cli as SupportedCli) || (agent.chosenCli as SupportedCli) || "antigravity";
      const updatedConfig = writeRawAgentCliMcpConfig(
        agentId,
        targetCli,
        body.rawContent,
        agent.accountEmail,
      );

      return context.json({
        ok: true,
        cli: targetCli,
        config: updatedConfig,
      });
    } catch (error: any) {
      return context.json({ error: error.message || "Fehler beim Speichern der Raw-Config" }, 400);
    }
  });

  // 6. In alle CLIs spiegeln
  routes.post("/:agentId/cli-mcp/sync-all", requireUser, async (context) => {
    const agentId = context.req.param("agentId");
    try {
      const agent = await store.get(context.var.actor, agentId);
      if (!agent) return context.json({ error: "Agent not found." }, 404);

      const cliParam = context.req.query("cli") || agent.chosenCli || "antigravity";
      const sourceConfig = readAgentCliMcpConfig(agentId, cliParam as SupportedCli, agent.accountEmail);

      const syncResult = syncAllAgentCliMcpConfigs(
        agentId,
        sourceConfig.servers,
        agent.accountEmail,
      );

      return context.json({
        ok: true,
        sourceCli: cliParam,
        ...syncResult,
      });
    } catch (error) {
      return mapStoreError(context, error);
    }
  });

  // 7. Dateiüberwachung (SSE Stream) für Live-Aktualisierung
  routes.get("/:agentId/cli-mcp/watch", requireUser, async (context) => {
    const agentId = context.req.param("agentId");
    const agent = await store.get(context.var.actor, agentId);
    if (!agent) return context.json({ error: "Agent not found." }, 404);

    let unsubscribe: (() => void) | null = null;
    let heartbeatTimer: any = null;

    const stream = new ReadableStream({
      start(controller) {
        const encoder = new TextEncoder();
        const send = (data: string) => {
          try {
            controller.enqueue(encoder.encode(data));
          } catch {}
        };

        send(`event: connected\ndata: ${JSON.stringify({ status: "watching", agentId, timestamp: new Date().toISOString() })}\n\n`);

        unsubscribe = subscribeAgentCliMcpChanges(
          agentId,
          (evt) => {
            send(`event: mcp_change\ndata: ${JSON.stringify(evt)}\n\n`);
          },
          agent.accountEmail,
        );

        heartbeatTimer = setInterval(() => {
          send(`: heartbeat ${Date.now()}\n\n`);
        }, 15000);
      },
      cancel() {
        if (heartbeatTimer) clearInterval(heartbeatTimer);
        if (unsubscribe) unsubscribe();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  });

  /**
   * Which Bots this Bot may hand work to.
   *
   * On the Bot's own screen rather than under the connector catalogue, because it is a fact about
   * this Bot and not about a vendor: the catalogue's entries have a fixed list of tools, and the
   * Bots a deployment has are whatever somebody made.
   *
   * `enabled` is reported separately from the grants, because the two fail differently. A grant with
   * the capability switched off is a row in the database that will never be read, and a screen that
   * offered it without saying so would be a switch wired to nothing.
   */
  routes.get("/:agentId/handoff", requireUser, async (context) => {
    const agentId = context.req.param("agentId");
    if (!agentId.trim()) {
      return context.json({ error: "A Bot id is required." }, 400);
    }
    try {
      // Asked of the store, so a Bot somebody may not see is "not found" here as everywhere else,
      // rather than a list of who it can reach.
      const agent = await store.get(context.var.actor, agentId);
      if (!agent) return context.json({ error: "Agent not found." }, 404);
      return context.json({
        handoff: {
          enabled: handoff?.enabled ?? false,
          // Granting is an administrator's, the same as it is on every other grant.
          canGrant: context.var.actor.role === "admin",
          reachable: handoff ? await handoff.reachableFrom(agentId) : [],
          // Whether this Bot can hold such a grant at all; the write path refuses one that cannot,
          // and the screen should say so before a person flips switches that can only bounce.
          grantable: handoff?.runsHere
            ? ((await handoff.runsHere(agentId)) ?? false)
            : false,
        },
      });
    } catch (error) {
      return mapStoreError(context, error);
    }
  });

  /* ========================================================================= */
  /* Phase E Schritt 18: Browser-use als Dienst anbinden                      */
  /* ========================================================================= */

  /** Status des Browser-Use Dienstes und des Helium-Profils für den Agenten */
  routes.get("/:agentId/browser-use/status", requireUser, async (context) => {
    const agentId = context.req.param("agentId");
    try {
      const status = await getBrowserUseStatus(agentId);
      return context.json({ ok: true, status });
    } catch (error) {
      return context.json({ ok: false, error: (error as Error).message }, 500);
    }
  });

  /** Öffnen (Navigation) im eigenen Helium-Profil des Agenten */
  routes.post("/:agentId/browser-use/open", requireUser, async (context) => {
    const agentId = context.req.param("agentId");
    const body = (await context.req.json().catch(() => null)) as { url?: string } | null;
    const url = body?.url?.trim() || "about:blank";
    try {
      const result = await browserUseOpen(agentId, url);
      return context.json(result, result.ok ? 200 : 500);
    } catch (error) {
      return context.json({ ok: false, agentId, action: "open", error: (error as Error).message }, 500);
    }
  });

  /** Klicken (Selektor oder x,y) im eigenen Helium-Profil des Agenten */
  routes.post("/:agentId/browser-use/click", requireUser, async (context) => {
    const agentId = context.req.param("agentId");
    const body = (await context.req.json().catch(() => null)) as {
      selector?: string;
      x?: number;
      y?: number;
    } | null;
    try {
      const result = await browserUseClick(agentId, {
        selector: body?.selector,
        x: body?.x,
        y: body?.y,
      });
      return context.json(result, result.ok ? 200 : 500);
    } catch (error) {
      return context.json({ ok: false, agentId, action: "click", error: (error as Error).message }, 500);
    }
  });

  /** Tippen (Text, Tasten oder Submit) im eigenen Helium-Profil des Agenten */
  routes.post("/:agentId/browser-use/type", requireUser, async (context) => {
    const agentId = context.req.param("agentId");
    const body = (await context.req.json().catch(() => null)) as {
      text?: string;
      key?: string;
      submit?: boolean;
    } | null;
    try {
      const result = await browserUseType(agentId, {
        text: body?.text,
        key: body?.key,
        submit: body?.submit,
      });
      return context.json(result, result.ok ? 200 : 500);
    } catch (error) {
      return context.json({ ok: false, agentId, action: "type", error: (error as Error).message }, 500);
    }
  });

  /** Screenshot des aktuellen Tabs im eigenen Helium-Profil des Agenten */
  routes.get("/:agentId/browser-use/screenshot", requireUser, async (context) => {
    const agentId = context.req.param("agentId");
    const rawBinary = context.req.query("format") === "binary";
    try {
      const result = await browserUseScreenshot(agentId);
      if (!result.ok || !result.bytes) {
        return context.json({ ok: false, error: result.error || "Screenshot fehlgeschlagen" }, 500);
      }
      if (rawBinary) {
        return new Response(result.bytes as unknown as BodyInit, {
          headers: {
            "Content-Type": "image/jpeg",
            "Cache-Control": "no-store",
            "X-Connect-Page-Url": encodeURI(result.url ?? ""),
          },
        });
      }
      return context.json(result);
    } catch (error) {
      return context.json({ ok: false, error: (error as Error).message }, 500);
    }
  });

  /** Universelle Browser-Aktion (open, click, type, screenshot) */
  routes.post("/:agentId/browser-use/action", requireUser, async (context) => {
    const agentId = context.req.param("agentId");
    const body = (await context.req.json().catch(() => null)) as {
      action: "open" | "click" | "type" | "screenshot";
      url?: string;
      selector?: string;
      x?: number;
      y?: number;
      text?: string;
      key?: string;
      submit?: boolean;
    } | null;
    if (!body || !body.action) {
      return context.json({ ok: false, error: "Aktion fehlt" }, 400);
    }
    try {
      let result: BrowserUseActionResult;
      if (body.action === "open") {
        result = await browserUseOpen(agentId, body.url || "about:blank");
      } else if (body.action === "click") {
        result = await browserUseClick(agentId, { selector: body.selector, x: body.x, y: body.y });
      } else if (body.action === "type") {
        result = await browserUseType(agentId, { text: body.text, key: body.key, submit: body.submit });
      } else if (body.action === "screenshot") {
        const shot = await browserUseScreenshot(agentId);
        result = {
          ok: shot.ok,
          agentId,
          action: "screenshot",
          url: shot.url,
          screenshot: shot.screenshot,
          error: shot.error,
        };
      } else {
        return context.json({ ok: false, error: `Unbekannte Aktion: ${body.action}` }, 400);
      }
      return context.json(result, result.ok ? 200 : 500);
    } catch (error) {
      return context.json({ ok: false, error: (error as Error).message }, 500);
    }
  });

  /** Autonome Browser-Use Aufgabe ausführen */
  routes.post("/:agentId/browser-use/task", requireUser, async (context) => {
    const agentId = context.req.param("agentId");
    const body = (await context.req.json().catch(() => null)) as { task?: string } | null;
    const task = body?.task?.trim();
    if (!task) {
      return context.json({ ok: false, error: "Task-Beschreibung fehlt" }, 400);
    }
    try {
      const result = await browserUseRunTask(agentId, task);
      return context.json(result, result.ok ? 200 : 500);
    } catch (error) {
      return context.json({ ok: false, error: (error as Error).message }, 500);
    }
  });

  return routes;
}

function boundedText(
  value: unknown,
  maximumLength: number,
  error: string,
): string | { ok: false; error: string } {
  if (typeof value !== "string") return { ok: false, error };
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= maximumLength
    ? trimmed
    : { ok: false, error };
}

function agentDto(actor: AgentActor, agent: AgentProfile) {
  return {
    id: agent.id,
    name: agent.name,
    title: agent.title,
    roleDescription: agent.roleDescription,
    avatarSeed: agent.avatarSeed,
    visibility: agent.visibility,
    hidden: agent.hidden,
    systemOwned: agent.systemOwned,
    // Published so the edit form can show it. Safe to expose: it is an address the person supplied,
    // and any credential for it lives in the vault, never in this row.
    endpoint: agent.endpoint,
    hasAuth: agent.hasAuth,
    // Whether one exists, never what it is.
    hasCallbackToken: agent.hasCallbackToken,
    canManage: canManageAgent(actor, agent),
    // Ownership, kept separate from permission. `canManage` is also true for an administrator on
    // another user's coworker, so a roster that split "mine" on it would file other people's work
    // under yours, and only for administrators, who are the least likely to notice.
    mine: agent.ownerUserId === actor.id,
    engine: agent.engine,
    headline: agent.headline ?? null,
    role: agent.role ?? null,
    description: agent.description ?? null,
    chosenCli: agent.chosenCli ?? "antigravity",
    accountEmail: agent.accountEmail ?? null,
    skills: normalizeAgentSkills(agent.skills),
    sparkPermissions: agent.sparkPermissions ?? {},
    browserProfile: agent.browserProfile ?? null,
    websiteList: normalizeAgentWebsites(agent.websiteList),
    subagents: normalizeAgentSubagents(agent.subagents),
    mcpList: agent.mcpList ?? [],
  };
}

function mapStoreError(context: Context, error: unknown): Response {
  if (error instanceof AgentNotFoundError) {
    return context.json({ error: "Agent not found." }, 404);
  }
  if (error instanceof AgentNotManageableError) {
    return context.json(
      { error: "You do not have permission to manage this agent." },
      403,
    );
  }
  if (error instanceof ProtectedAgentError) {
    return context.json({ error: "System-owned agents are protected." }, 403);
  }
  if (error instanceof ManagedAgentUnavailableError) {
    return context.json({ error: error.message }, 400);
  }
  throw error;
}
