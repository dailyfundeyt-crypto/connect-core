/**
 * Company feed — employee posts, private notes, and Slack/Linear inbox
 * messages that land on the company bot and get assigned to workers.
 */

export type CompanyPostKind = "task" | "chat" | "goal" | "update";

/** public = visible to all employees; private = leadership / bot-only. */
export type PostVisibility = "public" | "private";

/** Where the item came from. */
export type PostSource = "manual" | "slack" | "linear";

export type CompanyPost = {
  id: string;
  companyId: string;
  kind: CompanyPostKind;
  title: string;
  body: string;
  /** When true, shown as the pinned company goal. */
  pinned: boolean;
  /** Agent / employee name that authored the update */
  authorName: string;
  createdAt: string;
  visibility: PostVisibility;
  source: PostSource;
  /** Bot that received an inbound Slack/Linear message. */
  inboxBotId?: string;
  inboxBotName?: string;
  /** Worker the inbox bot assigned the work to. */
  assignedToId?: string;
  assignedToName?: string;
  /** External channel / person that sent the message. */
  externalFrom?: string;
};

const KEY = "connect.company-posts";

function readAll(): CompanyPost[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return (parsed as CompanyPost[]).map(normalizePost);
  } catch {
    return [];
  }
}

function writeAll(list: CompanyPost[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(list));
  window.dispatchEvent(new Event("connect-posts-changed"));
  void import("./workspace-sync").then((m) => m.scheduleConnectWorkspacePush());
}

function normalizePost(raw: CompanyPost): CompanyPost {
  const source: PostSource =
    raw.source === "slack" || raw.source === "linear" || raw.source === "manual"
      ? raw.source
      : raw.kind === "task"
        ? "linear"
        : raw.kind === "chat"
          ? "slack"
          : "manual";
  return {
    ...raw,
    visibility: raw.visibility === "private" ? "private" : "public",
    source,
    kind:
      raw.kind === "task" ||
      raw.kind === "chat" ||
      raw.kind === "goal" ||
      raw.kind === "update"
        ? raw.kind
        : "update",
  };
}

export function listPosts(companyId: string): CompanyPost[] {
  return readAll()
    .filter((p) => p.companyId === companyId)
    .sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return b.createdAt.localeCompare(a.createdAt);
    });
}

export function createPost(input: {
  companyId: string;
  kind: CompanyPostKind;
  title: string;
  body: string;
  authorName: string;
  pinned?: boolean;
  visibility?: PostVisibility;
  source?: PostSource;
  inboxBotId?: string;
  inboxBotName?: string;
  assignedToId?: string;
  assignedToName?: string;
  externalFrom?: string;
}): CompanyPost {
  const title = input.title.trim();
  const body = input.body.trim();
  if (!title) throw new Error("Title is required.");
  if (!body) throw new Error("Body is required.");

  let list = readAll();
  if (input.pinned) {
    list = list.map((p) =>
      p.companyId === input.companyId ? { ...p, pinned: false } : p,
    );
  }

  const post: CompanyPost = {
    id: `${input.companyId}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    companyId: input.companyId,
    kind: input.kind,
    title,
    body,
    pinned: Boolean(input.pinned),
    authorName: input.authorName.trim() || "Connect",
    createdAt: new Date().toISOString(),
    visibility: input.visibility === "private" ? "private" : "public",
    source: input.source ?? "manual",
    ...(input.inboxBotId ? { inboxBotId: input.inboxBotId } : {}),
    ...(input.inboxBotName ? { inboxBotName: input.inboxBotName } : {}),
    ...(input.assignedToId ? { assignedToId: input.assignedToId } : {}),
    ...(input.assignedToName ? { assignedToName: input.assignedToName } : {}),
    ...(input.externalFrom ? { externalFrom: input.externalFrom } : {}),
  };
  writeAll([post, ...list]);
  return post;
}

export function pinPost(companyId: string, postId: string) {
  const list = readAll().map((p) => {
    if (p.companyId !== companyId) return p;
    return { ...p, pinned: p.id === postId };
  });
  writeAll(list);
}

export function unpinPost(companyId: string, postId: string) {
  writeAll(
    readAll().map((p) =>
      p.companyId === companyId && p.id === postId ? { ...p, pinned: false } : p,
    ),
  );
}

export function deletePost(postId: string) {
  writeAll(readAll().filter((p) => p.id !== postId));
}

export function subscribePosts(cb: () => void) {
  const handler = () => cb();
  window.addEventListener("connect-posts-changed", handler);
  window.addEventListener("storage", handler);
  return () => {
    window.removeEventListener("connect-posts-changed", handler);
    window.removeEventListener("storage", handler);
  };
}

function prettyBotName(id: string): string {
  if (!id) return "Bot";
  return id.charAt(0).toUpperCase() + id.slice(1);
}

/**
 * Inbox bot for Slack/Linear: prefer `spark` when on the roster,
 * otherwise the first non-cto agent, else the first agent.
 */
export function resolveInboxBotId(agentIds: readonly string[]): string | null {
  if (agentIds.includes("spark")) return "spark";
  const worker = agentIds.find((id) => id !== "cto");
  return worker ?? agentIds[0] ?? null;
}

/** Seed goal + Slack/Linear inbox samples once per company when the feed is empty. */
export function ensureSeedPosts(
  companyId: string,
  companyName: string,
  agentIds: readonly string[] = [],
) {
  if (listPosts(companyId).length > 0) {
    ensureInboxSamples(companyId, agentIds);
    return;
  }

  const inboxId = resolveInboxBotId(agentIds) ?? "spark";
  const inboxName = prettyBotName(inboxId);
  const workers = agentIds.filter((id) => id !== inboxId);
  const workerA = workers[0] ?? "analysis";
  const workerB = workers[1] ?? workers[0] ?? "connect";

  createPost({
    companyId,
    kind: "goal",
    title: `North star · ${companyName}`,
    body: "Every employee should understand this goal. Edit or replace it — this pinned post is the company mission.",
    authorName: "Leadership",
    pinned: true,
    visibility: "public",
    source: "manual",
  });

  createPost({
    companyId,
    kind: "chat",
    title: "Slack → Inbox",
    body: `@channel can ${inboxName} pick up the customer brief from #product? Need a status by EOD.`,
    authorName: inboxName,
    visibility: "public",
    source: "slack",
    inboxBotId: inboxId,
    inboxBotName: inboxName,
    assignedToId: workerA,
    assignedToName: prettyBotName(workerA),
    externalFrom: "#product · Maya",
  });

  createPost({
    companyId,
    kind: "task",
    title: "Linear → LUM-184",
    body: "Ship Q-ready brief. Acceptance: sources attached, draft in Drive, @reviewers notified.",
    authorName: inboxName,
    visibility: "public",
    source: "linear",
    inboxBotId: inboxId,
    inboxBotName: inboxName,
    assignedToId: workerB,
    assignedToName: prettyBotName(workerB),
    externalFrom: "Linear · LUM-184",
  });

  createPost({
    companyId,
    kind: "update",
    title: "Private · Routing note",
    body: `${inboxName} keeps private triage notes here — not shown on the employee wall.`,
    authorName: inboxName,
    visibility: "private",
    source: "manual",
    inboxBotId: inboxId,
    inboxBotName: inboxName,
  });
}

/** Add Slack/Linear inbox samples if the company has none yet (upgrade path). */
export function ensureInboxSamples(
  companyId: string,
  agentIds: readonly string[],
) {
  const existing = listPosts(companyId);
  if (existing.some((p) => p.source === "slack" || p.source === "linear")) {
    return;
  }
  const inboxId = resolveInboxBotId(agentIds);
  if (!inboxId) return;
  const inboxName = prettyBotName(inboxId);
  const worker =
    agentIds.find((id) => id !== inboxId && id !== "cto") ??
    agentIds.find((id) => id !== inboxId) ??
    "connect";

  createPost({
    companyId,
    kind: "chat",
    title: "Slack → Inbox",
    body: `Incoming DM for @${inboxId}: please route the support thread to a worker and reply in-thread.`,
    authorName: inboxName,
    visibility: "public",
    source: "slack",
    inboxBotId: inboxId,
    inboxBotName: inboxName,
    assignedToId: worker,
    assignedToName: prettyBotName(worker),
    externalFrom: "Slack · #support",
  });

  createPost({
    companyId,
    kind: "task",
    title: "Linear → assigned",
    body: `Issue assigned to @${inboxId}. ${inboxName} forwards it to ${prettyBotName(worker)}.`,
    authorName: inboxName,
    visibility: "public",
    source: "linear",
    inboxBotId: inboxId,
    inboxBotName: inboxName,
    assignedToId: worker,
    assignedToName: prettyBotName(worker),
    externalFrom: "Linear · backlog",
  });
}
