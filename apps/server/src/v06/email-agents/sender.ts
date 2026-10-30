/**
 * Versand-Adapter fuer Ausgangs-E-Mails v06 (A19).
 *
 * SCHRITT 2 (Ist-Pruefung): Im Repo existiert KEINE Gmail-Send-Anbindung mit
 * Scope gmail.send. Die einzige Google-OAuth-Anbindung ist das Drive-Backup
 * (apps/server/src/drive-backup, Scope drive.file - kein Mailversand).
 * -> Es wird deshalb hier nur das Adapter-Interface plus DryRunSender
 *    bereitgestellt. Der DryRunSender sendet NICHTS, sondern schreibt die
 *    E-Mail als .eml-Datei nach %TEMP%. Eine echte Gmail-Implementierung kann
 *    spaeter das Interface implementieren und via createMailSender injiziert
 *    werden - der Outbox-Workflow (nur Versand nach Freigabe) bleibt unveraendert.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { OutboundEmail } from "../../contracts/v06/email-agents";

export type SendResult = {
  ok: boolean;
  /** Adapter-ID, z.B. "dryrun" */
  adapter: string;
  /** Menschlich lesbare Beschreibung des Ergebnisses (keine Secrets). */
  detail: string;
  /** Bei DryRun: Pfad der geschriebenen .eml-Datei. */
  filePath?: string;
};

export interface MailSender {
  readonly id: string;
  readonly isDryRun: boolean;
  send(email: OutboundEmail, options?: { approvedBy?: string }): Promise<SendResult>;
}

/**
 * Baut RFC-822-ähnlichen .eml-Inhalt ohne Senden. Fuer Tests separat exportiert.
 */
export function buildEmlContent(email: OutboundEmail): string {
  return [
    "From: Connect Ausgangs-Warteschlange (DryRun, kein Versand) <connect-outbox@local>",
    `To: ${email.to}`,
    `Subject: ${email.subject}`,
    `Date: ${new Date().toISOString()}`,
    `X-Connect-Requested-By-Agent: ${email.requestedByAgentId}`,
    `X-Connect-Outbound-Id: ${email.id}`,
    `X-Connect-DryRun: true`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "",
    email.body,
    "",
  ].join("\r\n");
}

/**
 * DryRun: schreibt die freigegebene E-Mail als .eml nach %TEMP%/.
 * Verschickt niemals etwas.
 */
export class DryRunSender implements MailSender {
  readonly id = "dryrun";
  readonly isDryRun = true;

  private directory?: string;

  constructor(directory?: string) {
    this.directory = directory;
  }

  async send(
    email: OutboundEmail,
    _options?: { approvedBy?: string },
  ): Promise<SendResult> {
    const dir =
      this.directory ??
      path.join(
        tmpdir(),
        "connect-emailagents-dryrun-A19",
      );

    try {
      mkdirSync(dir, { recursive: true });
      const safeId = email.id.replace(/[^A-Za-z0-9_-]/g, "_");
      const filePath = path.join(dir, `outbound-${safeId}.eml`);
      writeFileSync(filePath, buildEmlContent(email), { encoding: "utf-8" });
      return {
        ok: true,
        adapter: this.id,
        detail: `DryRun: E-Mail wurde nicht versendet, sondern nach ${filePath} geschrieben.`,
        filePath,
      };
    } catch (err) {
      return {
        ok: false,
        adapter: this.id,
        detail: `DryRun konnte .eml nicht schreiben: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }
}

/**
 * Fabrik der Versand-Adapter. Solange keine Gmail-Anbindung (Scope gmail.send)
 * existiert gibt es nur den DryRunSender. Ein echter Adapter wird via options.gmail
 * substituiert, sobald die Anbindung steht (Contract-Aenderungswunsch im Bericht).
 */
export interface CreateMailSenderOptions {
  dryRunDirectory?: string;
  /** Reserviert fuer den zukuenftigen Gmail-Sender (Scope gmail.send); Default: nicht gesetzt. */
  gmail?: MailSender;
}

export function createMailSender(options: CreateMailSenderOptions = {}): MailSender {
  return options.gmail ?? new DryRunSender(options.dryRunDirectory);
}
