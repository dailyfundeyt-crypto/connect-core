/**
 * Manus mail routing: map inbox addresses (by matching agent name) → bot chat.
 * When an inbound mail matches an agent's name / email identity, it is queued
 * to that agent's channel and can be forwarded to Manus via CLI/mail.
 */

import { enqueueAgentCli } from "@/lib/agents/agent-cli";

export type MailMessage = {
  id: string;
  from: string;
  to: string;
  subject: string;
  body: string;
  receivedAt: string;
  /** Agent id that matched by name/email, if any */
  assignedAgentId?: string;
  assignedAgentName?: string;
  /** Queued to open / forward into chat */
  forwarded: boolean;
};

export type MailAlias = {
  /** Free-text name as it appears in the mailbox (must match agent name) */
  mailboxName: string;
  email: string;
  agentId: string;
};

const MAIL_KEY = "connect.manus-mailbox";
const ALIAS_KEY = "connect.manus-mail-aliases";

function readMails(): MailMessage[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(MAIL_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as MailMessage[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeMails(list: MailMessage[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(MAIL_KEY, JSON.stringify(list));
  window.dispatchEvent(new Event("connect-manus-mail-changed"));
}

function readAliases(): MailAlias[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(ALIAS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as MailAlias[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAliases(list: MailAlias[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(ALIAS_KEY, JSON.stringify(list));
  window.dispatchEvent(new Event("connect-manus-mail-changed"));
}

export function listManusMails(): MailMessage[] {
  return readMails();
}

export function listManusAliases(): MailAlias[] {
  return readAliases();
}

export function setManusAlias(alias: MailAlias): MailAlias[] {
  const next = [
    {
      mailboxName: alias.mailboxName.trim(),
      email: alias.email.trim().toLowerCase(),
      agentId: alias.agentId,
    },
    ...readAliases().filter(
      (a) =>
        a.agentId !== alias.agentId &&
        a.email !== alias.email.trim().toLowerCase(),
    ),
  ].filter((a) => a.mailboxName && a.email && a.agentId);
  writeAliases(next);
  return next;
}

export function removeManusAlias(agentId: string): MailAlias[] {
  const next = readAliases().filter((a) => a.agentId !== agentId);
  writeAliases(next);
  return next;
}

function normalizeName(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Match inbound mail to an agent: alias email first, then mailbox name ≈ agent name.
 */
export function matchMailToAgent(
  mail: Pick<MailMessage, "from" | "to" | "subject">,
  agents: { id: string; name: string; email?: string }[],
): { agentId: string; agentName: string } | null {
  const aliases = readAliases();
  const to = mail.to.trim().toLowerCase();
  const from = mail.from.trim().toLowerCase();

  for (const alias of aliases) {
    if (alias.email === to || alias.email === from) {
      const agent = agents.find((a) => a.id === alias.agentId);
      if (agent) return { agentId: agent.id, agentName: agent.name };
    }
    const aliasName = normalizeName(alias.mailboxName);
    if (
      aliasName &&
      (normalizeName(mail.subject).includes(aliasName) ||
        normalizeName(to).includes(aliasName) ||
        normalizeName(from).includes(aliasName))
    ) {
      const agent = agents.find((a) => a.id === alias.agentId);
      if (agent) return { agentId: agent.id, agentName: agent.name };
    }
  }

  for (const agent of agents) {
    const name = normalizeName(agent.name);
    if (!name) continue;
    if (
      normalizeName(mail.subject).includes(name) ||
      to.includes(name.replace(/\s/g, ".")) ||
      from.includes(name.replace(/\s/g, "."))
    ) {
      return { agentId: agent.id, agentName: agent.name };
    }
    if (agent.email && (agent.email === to || agent.email === from)) {
      return { agentId: agent.id, agentName: agent.name };
    }
  }
  return null;
}

export function ingestManusMail(
  input: {
    from: string;
    to: string;
    subject: string;
    body: string;
  },
  agents: { id: string; name: string; email?: string }[],
): MailMessage {
  const match = matchMailToAgent(input, agents);
  const mail: MailMessage = {
    id: `mail-${Date.now().toString(36)}`,
    from: input.from.trim(),
    to: input.to.trim(),
    subject: input.subject.trim() || "(no subject)",
    body: input.body.trim(),
    receivedAt: new Date().toISOString(),
    forwarded: false,
    ...(match
      ? {
          assignedAgentId: match.agentId,
          assignedAgentName: match.agentName,
        }
      : {}),
  };
  writeMails([mail, ...readMails()].slice(0, 100));
  return mail;
}

function enqueueMailToManusCli(mail: MailMessage) {
  if (!mail.assignedAgentId) return;
  const cmd = [
    "mail:forward",
    `--to=${mail.assignedAgentName ?? mail.assignedAgentId}`,
    `--subject=${JSON.stringify(mail.subject)}`,
    `--body=${JSON.stringify(mail.body.slice(0, 2000))}`,
  ].join(" ");
  enqueueAgentCli(mail.assignedAgentId, {
    target: "manus",
    command: cmd,
  });
}

/** Mark mail as forwarded into the agent chat / Manus CLI queue. */
export function forwardManusMail(mailId: string): MailMessage | null {
  const list = readMails();
  const index = list.findIndex((m) => m.id === mailId);
  if (index < 0) return null;
  const mail = list[index]!;
  if (mail.forwarded) return mail;
  const next = { ...mail, forwarded: true };
  list[index] = next;
  writeMails(list);
  enqueueMailToManusCli(next);
  return next;
}

/**
 * Ingest + immediately forward when a name/email match exists
 * (auto-send Manus chat messages from matching mailbox entries).
 */
export function ingestAndAutoForwardManusMail(
  input: {
    from: string;
    to: string;
    subject: string;
    body: string;
  },
  agents: { id: string; name: string; email?: string }[],
): MailMessage {
  const mail = ingestManusMail(input, agents);
  if (mail.assignedAgentId) {
    return forwardManusMail(mail.id) ?? mail;
  }
  return mail;
}

export function subscribeManusMail(cb: () => void) {
  const handler = () => cb();
  window.addEventListener("connect-manus-mail-changed", handler);
  window.addEventListener("storage", handler);
  return () => {
    window.removeEventListener("connect-manus-mail-changed", handler);
    window.removeEventListener("storage", handler);
  };
}
