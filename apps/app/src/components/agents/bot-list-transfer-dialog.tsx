import {
  IconDownload,
  IconFileImport,
  IconRobot,
  IconSparkles,
} from "@tabler/icons-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  type ChangeEvent,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Empty, EmptyDescription, EmptyTitle } from "@/components/ui/empty";
import { Separator } from "@/components/ui/separator";
import {
  type AgentInput,
  createAgentMutationOptions,
} from "@/lib/agents/mutations";
import { type AgentProfile } from "@/lib/agents/queries";
import {
  buildBotListExport,
  downloadJsonFile,
  exportFilename,
  exportableBotToInput,
  type ExportableBot,
  parseBotListExport,
} from "@/lib/agents/bot-list-export";

/**
 * Bot-Liste import / export dialog.
 *
 * This sits on the Marketplace page above the bot list. The export half always works against the
 * bots the caller already loaded — there is no server round-trip, only a JSON download. The
 * import half calls the same `createAgentMutationOptions` the wizard does, so each imported bot
 * goes through the regular create flow: validation, roster, family assignment.
 */
export function BotListTransferDialog({
  open,
  onClose,
  agents,
}: {
  open: boolean;
  onClose: () => void;
  agents: AgentProfile[];
}) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<ExportableBot[] | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [importLog, setImportLog] = useState<string | null>(null);
  const createAgent = useMutation(createAgentMutationOptions(queryClient));
  const [busy, setBusy] = useState(false);
  const titleId = useId();

  useEffect(() => {
    if (!open) {
      setPending(null);
      setParseError(null);
      setImportLog(null);
    }
  }, [open]);

  const onExport = () => {
    const payload = buildBotListExport(agents);
    downloadJsonFile(exportFilename(), payload);
  };

  const onPickFile = async (event: ChangeEvent<HTMLInputElement>) => {
    setParseError(null);
    setImportLog(null);
    setPending(null);
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = parseBotListExport(JSON.parse(text));
      if (!parsed.ok) {
        setParseError(parsed.reason);
        return;
      }
      if (parsed.bots.length === 0) {
        setParseError("Datei enthält keine Bots.");
        return;
      }
      setPending(parsed.bots);
    } catch (err) {
      console.error("[bot-list-transfer] parse failed:", err);
      setParseError(
        err instanceof Error ? err.message : "Datei konnte nicht gelesen werden.",
      );
    } finally {
      // Same file again should re-trigger parse.
      event.target.value = "";
    }
  };

  const onConfirmImport = async () => {
    if (!pending || busy) return;
    setBusy(true);
    setImportLog(null);
    let created = 0;
    let failed = 0;
    for (const bot of pending) {
      try {
        await createAgent.mutateAsync(exportableBotToInput(bot));
        created += 1;
      } catch (err) {
        console.error("[bot-list-transfer] create failed:", err, bot);
        failed += 1;
      }
    }
    setBusy(false);
    setPending(null);
    setImportLog(
      `${created} importiert${failed > 0 ? `, ${failed} fehlgeschlagen` : ""}.`,
    );
  };

  return (
    <Dialog onOpenChange={(next) => !next && onClose()} open={open}>
      <DialogContent aria-labelledby={titleId}>
        <DialogTitle id={titleId}>Bot-Liste</DialogTitle>
        <DialogDescription>
          Exportiere deine aktuellen Bots als JSON-Datei und importiere eine
          solche Liste, um Bots aus einem anderen Deployment anzulegen.
        </DialogDescription>
        <DialogBody className="space-y-4">
          <section className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
            <div className="flex items-center gap-2">
              <IconDownload className="size-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold">Export</h3>
            </div>
            <p className="text-xs text-muted-foreground">
              {agents.length === 0
                ? "Du hast aktuell keine eigenen Bots zum Exportieren."
                : `${agents.length} ${
                    agents.length === 1 ? "Bot" : "Bots"
                  } werden in die Datei geschrieben. API-Keys bleiben lokal.`}
            </p>
            <Button
              disabled={agents.length === 0}
              onClick={onExport}
              type="button"
              variant="outline"
            >
              <IconDownload className="size-4" />
              Als JSON herunterladen
            </Button>
          </section>

          <Separator />

          <section className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
            <div className="flex items-center gap-2">
              <IconFileImport className="size-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold">Import</h3>
            </div>
            <p className="text-xs text-muted-foreground">
              Wähle eine JSON-Datei. Die Bots werden als private Mitarbeiter
              angelegt — API-Keys und Roster-Zuordnungen musst du danach
              erneut setzen.
            </p>
            <input
              accept="application/json,.json"
              aria-label="Bot-Liste JSON-Datei"
              className="block w-full text-xs text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-foreground/10 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-foreground hover:file:bg-foreground/15"
              onChange={(event) => void onPickFile(event)}
              ref={fileInputRef}
              type="file"
            />
            {parseError ? (
              <p className="text-xs text-destructive" role="alert">
                {parseError}
              </p>
            ) : null}
            {pending ? (
              <PendingReview
                bots={pending}
                busy={busy}
                onCancel={() => setPending(null)}
                onConfirm={() => void onConfirmImport()}
              />
            ) : null}
            {importLog ? (
              <p className="flex items-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-300">
                <IconSparkles className="size-3.5" />
                {importLog}
              </p>
            ) : null}
          </section>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}

function PendingReview({
  bots,
  busy,
  onCancel,
  onConfirm,
}: {
  bots: ExportableBot[];
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (bots.length === 0) {
    return (
      <Empty>
        <EmptyTitle>Keine Bots in der Datei.</EmptyTitle>
      </Empty>
    );
  }
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-muted/30 p-3">
      <p className="flex items-center gap-1.5 text-xs font-medium text-foreground">
        <IconRobot className="size-3.5" />
        {bots.length} {bots.length === 1 ? "Bot bereit" : "Bots bereit"}
      </p>
      <ul className="max-h-48 overflow-y-auto rounded-md border border-border bg-card">
        {bots.map((bot, index) => (
          <li
            className="flex items-start gap-2 border-b border-border px-3 py-2 last:border-b-0"
            key={`${bot.name}-${index}`}
          >
            <span className="mt-0.5 text-[10px] font-mono text-muted-foreground">
              {String(index + 1).padStart(2, "0")}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium text-foreground">
                {bot.name}
              </p>
              {bot.roleDescription ? (
                <p className="line-clamp-1 text-[11px] text-muted-foreground">
                  {bot.roleDescription}
                </p>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
      <Empty>
        <EmptyDescription>
          {bots.some((b) => b.hadOwnAuth)
            ? "Hinweis: Diese Bots hatten eigene API-Keys. Die Keys sind nicht in der Datei — du musst sie nach dem Import erneut eintragen."
            : "Diese Bots werden ohne API-Keys angelegt."}
        </EmptyDescription>
      </Empty>
      <div className="flex justify-end gap-2">
        <Button disabled={busy} onClick={onCancel} type="button" variant="outline">
          Abbrechen
        </Button>
        <Button disabled={busy} onClick={onConfirm} type="button">
          {busy
            ? "Importiere…"
            : `${bots.length} ${bots.length === 1 ? "Bot" : "Bots"} anlegen`}
        </Button>
      </div>
    </div>
  );
}