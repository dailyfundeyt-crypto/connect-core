/**
 * Der Dialog „Agenten anlegen“ (Lane A36).
 *
 * EIGENTÜMER: A36.
 *
 * Der Dialog ist die einzige Stelle, an der aus einem Backlog Agenten werden.
 * Er hat drei Stufen:
 *
 *  1. **Lesen** — das Backlog wird geladen (oder eingefügt), die Ideen
 *     erscheinen als Liste zum Abwählen.
 *  2. **Vorschau** — für jede gewählte Idee: Name, CLI, Arbeitsordner und
 *     Maskottchen. Es wird **nichts** angelegt.
 *  3. **Anlegen** — erst der Klick auf „N Agenten anlegen“ ruft den
 *     schreibenden Endpunkt mit `confirm: true`.
 *
 * Die Stufen 1 und 2 passieren **immer vor** dem Anlegen. Deshalb kann der
 * Dialog nie versehentlich Agenten anlegen: der Anlegen-Knopf ist erst da,
 * wenn eine Vorschau existiert, und er schreibt nur mit `confirm: true`.
 */

import { IconAlertTriangle, IconCheck, IconRobot } from "@tabler/icons-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { GridAvatar } from "@/components/app-sidebar/agent-grid/grid-avatar";
import {
  batchCreateAgents,
  type FleetBatchResult,
  type FleetIdea,
  type FleetIdeaSkip,
  previewIdeas,
} from "./fleet-client";
import { buildFleetPreview } from "./fleet-preview";
import { cn } from "@/lib/utils";

/** Die Stufen des Dialogs. */
type FleetBatchStep = "load" | "preview" | "done";

export function FleetBatchCreateDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Wird nach dem Anlegen aufgerufen (die Flotte lädt neu). */
  onCreated?: (result: FleetBatchResult) => void;
}) {
  const [step, setStep] = useState<FleetBatchStep>("load");
  const [markdown, setMarkdown] = useState("");
  const [ideas, setIdeas] = useState<FleetIdea[]>([]);
  const [skipped, setSkipped] = useState<FleetIdeaSkip[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<FleetBatchResult | null>(null);
  const [visibility, setVisibility] = useState<"private" | "public">("private");

  const reset = useCallback(() => {
    setStep("load");
    setIdeas([]);
    setSkipped([]);
    setSelected(new Set());
    setLoading(false);
    setCreating(false);
    setError(null);
    setResult(null);
  }, []);

  useEffect(() => {
    if (!open) reset();
  }, [open, reset]);

  /** Schlüssel einer Idee — eindeutig, auch wenn die ID fehlt. */
  const keyOf = useCallback(
    (idea: FleetIdea, index: number) => idea.id || `${idea.title}#${index}`,
    [],
  );

  const load = useCallback(
    async (source?: { markdown?: string }) => {
      setLoading(true);
      setError(null);
      try {
        const response = await previewIdeas(source);
        setIdeas(response.ideas);
        setSkipped(response.skipped ?? []);
        setSelected(new Set(response.ideas.map((idea, index) => keyOf(idea, index))));
        setStep("preview");
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Das Backlog konnte nicht gelesen werden.",
        );
      } finally {
        setLoading(false);
      }
    },
    [keyOf],
  );

  const chosen = useMemo(
    () =>
      ideas.filter((idea) =>
        selected.has(keyOf(idea, ideas.indexOf(idea))),
      ),
    [ideas, selected, keyOf],
  );

  const preview = useMemo(() => buildFleetPreview(chosen), [chosen]);

  const toggle = (idea: FleetIdea, index: number) => {
    const key = keyOf(idea, index);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  /**
   * Das Anlegen.
   *
   * `confirm: true` geht mit — und wird auch serverseitig geprüft. Ohne
   * diesen Schalter legt der Server nichts an; der Dialog kann sich also
   * nicht versehentlich selbst überstimmen.
   */
  const create = async () => {
    setCreating(true);
    setError(null);
    try {
      const batchResult = await batchCreateAgents({
        ideas: chosen,
        confirm: true,
        visibility,
      });
      setResult(batchResult);
      setStep("done");
      onCreated?.(batchResult);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Die Agenten konnten nicht angelegt werden.",
      );
    } finally {
      setCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Agenten aus dem Ideen-Backlog anlegen</DialogTitle>
          <DialogDescription>
            Eine Zeile im Backlog wird ein Agent. Vorher siehst du, was
            angelegt würde — angefasst wird nichts ohne deinen Klick.
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="mt-4 overflow-y-auto">
          {step === "load" ? (
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <label
                  className="font-medium text-sm"
                  htmlFor="fleet-backlog-markdown"
                >
                  Backlog einfügen
                </label>
                <Textarea
                  id="fleet-backlog-markdown"
                  onChange={(event) => setMarkdown(event.target.value)}
                  placeholder={"| ID | Idee | CLI | Agent | Beschreibung |\n|---|---|---|---|---|\n| I1 | Nutzung & Limits | codex | Nova Limits | Baut die Nutzungsansicht |"}
                  rows={6}
                  value={markdown}
                />
                <p className="text-muted-foreground text-xs">
                  Ohne eingefügten Text wird das Backlog des Servers gelesen
                  (<code className="font-mono">docs/ideen/IDEEN-BACKLOG.md</code>).
                </p>
              </div>

              <div className="flex justify-end gap-2">
                <Button
                  disabled={loading}
                  onClick={() => void load()}
                  type="button"
                  variant="outline"
                >
                  {loading ? "Lädt …" : "Backlog vom Server lesen"}
                </Button>
                <Button
                  disabled={loading || !markdown.trim()}
                  onClick={() => void load({ markdown })}
                  type="button"
                >
                  Eingefügtes Backlog lesen
                </Button>
              </div>

              {error ? (
                <p className="text-destructive text-sm" role="alert">
                  {error}
                </p>
              ) : null}
            </div>
          ) : null}

          {step === "preview" ? (
            <div className="flex flex-col gap-4">
              {skipped.length > 0 ? (
                <div className="flex flex-col gap-1 rounded-lg bg-amber-500/10 px-3 py-2 text-amber-700 dark:text-amber-400 text-xs">
                  <span className="inline-flex items-center gap-1 font-medium">
                    <IconAlertTriangle className="size-4" />
                    {skipped.length} Zeile(n) im Backlog waren nicht lesbar.
                  </span>
                  {skipped.map((entry) => (
                    <span key={`${entry.line}-${entry.text}`}>
                      Zeile {entry.line}: {entry.reason}
                    </span>
                  ))}
                </div>
              ) : null}

              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-muted-foreground text-sm">
                  {preview.length} von {ideas.length} Ideen ausgewählt
                </span>
                <div className="flex gap-2">
                  <Button
                    onClick={() => setSelected(new Set(ideas.map((idea, i) => keyOf(idea, i))))}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    Alle
                  </Button>
                  <Button
                    onClick={() => setSelected(new Set())}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    Keine
                  </Button>
                </div>
              </div>

              <div className="overflow-hidden rounded-lg border border-border">
                <table className="w-full text-left text-sm">
                  <thead className="bg-muted/50 text-muted-foreground text-xs uppercase">
                    <tr>
                      <th className="px-3 py-2 font-medium">Anlegen</th>
                      <th className="px-3 py-2 font-medium">Maskottchen</th>
                      <th className="px-3 py-2 font-medium">Agent</th>
                      <th className="px-3 py-2 font-medium">CLI</th>
                      <th className="px-3 py-2 font-medium">Arbeitsordner</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ideas.map((idea, index) => {
                      const key = keyOf(idea, index);
                      const isOn = selected.has(key);
                      const row = buildFleetPreview([idea])[0];
                      return (
                        <tr
                          className={cn(
                            "border-border border-t",
                            !isOn && "text-muted-foreground opacity-60",
                          )}
                          key={key}
                        >
                          <td className="px-3 py-2">
                            <input
                              aria-label={`${idea.title} anlegen`}
                              checked={isOn}
                              onChange={() => toggle(idea, index)}
                              type="checkbox"
                            />
                          </td>
                          <td className="px-3 py-2">
                            <GridAvatar
                              color={row?.avatar.color}
                              shape={row?.avatar.shape}
                              size={26}
                            />
                          </td>
                          <td className="px-3 py-2">
                            <span className="block font-medium">{idea.title}</span>
                            <span className="block text-muted-foreground text-xs">
                              {idea.name}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-muted-foreground">
                            {row?.cliLabel}
                          </td>
                          <td className="max-w-[16rem] px-3 py-2">
                            <span
                              className="block truncate font-mono text-muted-foreground text-xs"
                              title={row?.workspaceSlug}
                            >
                              {row?.workspaceSlug}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="flex flex-col gap-2">
                <span className="font-medium text-sm">Sichtbarkeit</span>
                <div className="flex gap-2">
                  <Button
                    onClick={() => setVisibility("private")}
                    size="sm"
                    type="button"
                    variant={visibility === "private" ? "default" : "outline"}
                  >
                    Privat
                  </Button>
                  <Button
                    onClick={() => setVisibility("public")}
                    size="sm"
                    type="button"
                    variant={visibility === "public" ? "default" : "outline"}
                  >
                    Öffentlich
                  </Button>
                </div>
              </div>

              {error ? (
                <p className="text-destructive text-sm" role="alert">
                  {error}
                </p>
              ) : null}
            </div>
          ) : null}

          {step === "done" && result ? (
            <div className="flex flex-col gap-3">
              <p className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 text-sm">
                <IconCheck className="size-4" />
                {result.created.length} Agent(en) angelegt.
              </p>
              {result.failed.length > 0 ? (
                <div className="flex flex-col gap-1 rounded-lg bg-destructive/10 px-3 py-2 text-destructive text-xs">
                  {result.failed.map((failure) => (
                    <span key={failure.idea.id || failure.idea.title}>
                      {failure.idea.title}: {failure.reason}
                    </span>
                  ))}
                </div>
              ) : null}
              <ul className="flex max-h-64 flex-col gap-1 overflow-y-auto text-muted-foreground text-xs">
                {result.created.map((entry) => (
                  <li className="flex items-center gap-2" key={entry.agentId}>
                    <IconRobot className="size-3.5" />
                    <span className="font-medium">{entry.name}</span>
                    {entry.workspacePath ? (
                      <span className="truncate font-mono opacity-70">
                        {entry.workspacePath}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </DialogBody>

        <DialogFooter className="mt-4">
          {step === "preview" ? (
            <>
              <Button
                onClick={() => setStep("load")}
                type="button"
                variant="ghost"
              >
                Zurück
              </Button>
              <Button
                disabled={creating || preview.length === 0}
                onClick={() => void create()}
                type="button"
              >
                {creating
                  ? "Legt an …"
                  : `${preview.length} Agent(en) anlegen`}
              </Button>
            </>
          ) : null}

          {step === "load" ? (
            <Button
              onClick={() => onOpenChange(false)}
              type="button"
              variant="ghost"
            >
              Abbrechen
            </Button>
          ) : null}

          {step === "done" ? (
            <Button onClick={() => onOpenChange(false)} type="button">
              Fertig
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
