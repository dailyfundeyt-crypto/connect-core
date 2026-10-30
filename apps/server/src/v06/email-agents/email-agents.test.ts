/**
 * Tests E-Mail-Agenten v06 (A19) - bun test.
 *
 * Kernabnahme:
 * - Versand technisch nur nach Klick "Freigeben" (approve): Request-Erzeugung ruft
 *   nie den Versand-Adapter; erst approve ruft send() einmal auf.
 * - Verzeichnis: Beschreibung ist Pflichtfeld.
 * - Kein echter Versand bei Tests: Recording/Kill-Switch-Adapter + DryRunSender.
 */

import { describe, expect, it } from "bun:test";
import { existsSync, readFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  EmailAgentRepository,
  EmailAgentValidationError,
} from "./repo";
import { Outbox, OutboxError } from "./outbox";
import type { MailSender } from "./sender";
import {
  createMailSender,
  DryRunSender,
  buildEmlContent,
} from "./sender";
import { buildEmailAgentMcpTools } from "./mcpTools";
import type { EmailAgent } from "../../contracts/v06/email-agents";

/** Recording-Adapter: meldet, WANN er angerufen wurde. Sendet nie "echt". */
class RecordingSender {
  readonly id = "recording";
  readonly isDryRun = true;
  readonly calls: Array<{ emailId: string; approvedBy?: string }> = [];

  async send(email: { id: string }, options?: { approvedBy?: string }) {
    this.calls.push({ emailId: email.id, approvedBy: options?.approvedBy });
    return {
      ok: true,
      adapter: this.id,
      detail: "Recording: nichts versendet, nur vermerkt.",
    };
  }
}

async function seed(repo: EmailAgentRepository): Promise<EmailAgent> {
  return repo.createAgent({
    address: "Research-Bot@Example.com ",
    name: "Recherche-Bot",
    description: "Recherchiert zu gegebenen Themen und liefert Quellenlisten zurück.",
    capabilities: ["Recherche", "Zusammenfassen"],
    companyIds: ["firma-1"],
  });
}

describe("A19: Verzeichnis externer E-Mail-Bots", () => {
  it("Beschreibung ist Pflichtfeld", async () => {
    const repo = new EmailAgentRepository();
    await expect(repo.createAgent({ address: "a@b.com", name: "Bot", description: " " }))
      .rejects.toBeInstanceOf(EmailAgentValidationError);
    await expect(repo.createAgent({ address: "a@b.com", name: " ", description: "Beschreibung" }))
      .rejects.toBeInstanceOf(EmailAgentValidationError);
    await expect(repo.createAgent({ address: "invalid", name: "Bot", description: "Beschreibung" }))
      .rejects.toBeInstanceOf(EmailAgentValidationError);
  });

  it("Anlage normalisiert Adresse und liefert Adresse/Capabilities zurueck", async () => {
    const repo = new EmailAgentRepository();
    const agent = await seed(repo);
    expect(agent.address).toBe("research-bot@example.com");
    expect(agent.capabilities).toEqual(["Recherche", "Zusammenfassen"]);
    expect(agent.companyIds).toEqual(["firma-1"]);

    const byAddress = await repo.getAgentByAddress("RESEARCH-BOT@example.com");
    expect(byAddress?.id).toBe(agent.id);
  });

  it("MCP-Tool list_email_agents liest das Verzeichnis", async () => {
    const repo = new EmailAgentRepository();
    const seed1 = await seed(repo);
    const tools = buildEmailAgentMcpTools({ repo: repo });
    expect(tools.map((t) => t.name)).toContain("list_email_agents");
    expect(tools.map((t) => t.name)).toContain("request_email");

    const listTool = tools.find((t) => t.name === "list_email_agents")!;
    expect(listTool.handler).toBeTruthy();
    const result = await listTool.handler!({}, { actorId: "test" });
    const text = result.content[0].type === "text" ? result.content[0].text : "";
    expect(text).toContain(seed1.description);
  });

  it("MCP-Tool request_email erzeugt pending_approval und versendet NICHT", async () => {
    const repo = new EmailAgentRepository();
    const agent = await seed(repo);
    const sender = new RecordingSender();
    const outbox = new Outbox(repo, sender as unknown as MailSender);

    const tools = buildEmailAgentMcpTools({ repo: repo, outbox: outbox });
    const requestTool = tools.find((t) => t.name === "request_email")!;

    const result = await requestTool.handler!(
      {
        requestedByAgentId: "grok:agent-1",
        to: "research-bot@example.com",
        subject: "Recherchiere Topic X",
        body: "Bitte liefere eine Quellenliste zu Topic X.",
      },
      { actorId: "test" },
    );
    expect(result.isError).toBeFalsy();
    const text = result.content[0].type === "text" ? result.content[0].text : "";
    expect(text).toContain("pending_approval");
    // KEIN Versand beim Request:
    expect(sender.calls).toHaveLength(0);
    expect(agent).toBeDefined();
  });

  it("request_email lehnt Empfaenger ab, die nicht im Verzeichnis stehen", async () => {
    const repo = new EmailAgentRepository();
    const sender = new RecordingSender();
    const outbox = new Outbox(repo, sender as unknown as MailSender);
    await expect(
      outbox.requestEmail({
        requestedByAgentId: "agent-1",
        to: "unbekannt@example.com",
        subject: "Test",
        body: "Hallo",
      }),
    ).rejects.toBeInstanceOf(OutboxError);
    expect(sender.calls).toHaveLength(0);
  });
});

describe("A19: Freigabe-Workflow (kein Versand ohne Freigabe)", () => {
  it("approve -> Sender genau EINMAL, Verschicken erst nach Freigabe", async () => {
    const repo = new EmailAgentRepository();
    await seed(repo);
    const sender = new RecordingSender();
    const outbox = new Outbox(repo, sender as unknown as MailSender);

    const email = await outbox.requestEmail({
      requestedByAgentId: "agent-1",
      to: "research-bot@example.com",
      subject: "Recherche",
      body: "Bitte recherchiere X.",
    });

    expect(email.status).toBe("pending_approval");
    expect(sender.calls).toHaveLength(0); // Request versendet nichts

    const approved = await outbox.approveEmail(email.id, "Stefan");
    expect(approved.status).toBe("sent");
    expect(sender.calls).toHaveLength(1);
    expect(sender.calls[0].emailId).toBe(email.id);
    expect(sender.calls[0].approvedBy).toBe("Stefan");

    // Keine doppelte Freigabe:
    await expect(outbox.approveEmail(email.id)).rejects.toBeInstanceOf(OutboxError);
    expect(sender.calls).toHaveLength(1);
  });

  it("abgelehnte E-Mails senden niemals", async () => {
    const repo = new EmailAgentRepository();
    await seed(repo);
    const sender = new RecordingSender();
    const outbox = new Outbox(repo, sender as unknown as MailSender);

    const email = await outbox.requestEmail({
      requestedByAgentId: "agent-1",
      to: "research-bot@example.com",
      subject: "Nicht senden",
      body: "Soll abgelehnt werden.",
    });

    const rejected = await outbox.rejectEmail(email.id, "Immer noch zu früh");
    expect(rejected.status).toBe("rejected");
    expect(sender.calls).toHaveLength(0);

    await expect(outbox.approveEmail(email.id)).rejects.toBeInstanceOf(OutboxError);
    expect(sender.calls).toHaveLength(0);
  });

  it("DryRun-Fehler wird nicht als 'sent' markiert, sondern in sent_result vermerkt", async () => {
    const repo = new EmailAgentRepository();
    await seed(repo);
    const failingSender: MailSender = {
      id: "failing",
      isDryRun: true,
      send: async () => {
        throw new Error("Adapter misslungen");
      },
    };
    const outbox = new Outbox(repo, failingSender);
    const email = await outbox.requestEmail({
      requestedByAgentId: "agent-1",
      to: "research-bot@example.com",
      subject: "Test",
      body: "Test",
    });
    const approved = await outbox.approveEmail(email.id);
    expect(approved.status).toBe("approved"); // NICHT 'sent'
  });
});

describe("A19: DryRunSender (.eml nach TEMP)", () => {
  const tempBase = mkdtempSync(path.join(tmpdir(), "a19-test-"));

  it("schreibt gueltiges .eml und sendet nicht per Netz", async () => {
    const dir = path.join(tempBase, "dryrun-dir");
    const sender = new DryRunSender(dir);
    expect(sender.isDryRun).toBe(true);

    const freigegebeneEmail = {
      id: "outbound_test-1",
      requestedByAgentId: "agent-1",
      to: "research-bot@example.com",
      subject: "Recherche",
      body: "Zeile 1\nZeile 2",
      status: "pending_approval" as const,
      createdAt: new Date().toISOString(),
    };

    const result = await sender.send(freigegebeneEmail as never);
    expect(result.ok).toBe(true);
    expect(result.filePath).toBeTruthy();
    expect(existsSync(result.filePath!)).toBe(true);

    const content = readFileSync(result.filePath!, "utf-8");
    expect(content).toContain("To: research-bot@example.com");
    expect(content).toContain("Subject: Recherche");
    expect(content).toContain("X-Connect-DryRun: true");
    expect(content).toContain("Zeile 1");
  });

  it("buildEmlContent und createMailSender (Default: DryRun)", async () => {
    expect(
      buildEmlContent({
        id: "x",
        requestedByAgentId: "a",
        to: "t@x.com",
        subject: "S",
        body: "B",
        status: "pending_approval",
        createdAt: new Date().toISOString(),
      }),
    ).toContain("Subject: S");

    const sender = createMailSender({ dryRunDirectory: path.join(tempBase, "factory") });
    expect(sender.isDryRun).toBe(true);
    expect(sender.id).toBe("dryrun");
  });
});
