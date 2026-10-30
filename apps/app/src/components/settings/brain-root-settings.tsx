/**
 * Agent 2 – „Einstellungen – Daten-Pfad des Spark-Brain-Vaults änderbar“ (Helium, 2026-10-23).
 *
 * „Spark Brain – Speicherort“: der Vault-/Brain-Wurzelordner aus Blick und Änderung.
 * Verwaltet Brain- und Vault-Ordner als getrennte Einstellungen:
 * - Brain-Ordner: Lese- und Schreib-Speicherort für Notizen von Spark (.md, agents.json, log.md)
 * - Vault-Ordner: Persönlicher Obsidian-Vault (nur lesend; bleibt stets unverändert)
 *
 * Unterstützt:
 * - Serverseitige Pfadprüfung mit kanonischen Pfaden (realpath gegen Symlink/Junction-Tricks)
 * - Echten Fortschrittsbalken beim Kopieren per Server-Sent-Events (kein unbestimmter Spinner)
 * - Garantierten Schutz vor Überschreiben existierender Dateien
 * - Unveränderten Erhalt des bisherigen Ordners
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  IconAlertCircle,
  IconCheck,
  IconFolder,
  IconFolderOpen,
  IconLoader2,
} from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { client } from "@/lib/client";

type BrainRootInfo = {
  path: string | null;
  vaultPath: string | null;
  exists: boolean;
  writable: boolean;
  noteCount: number | null;
  source: "saved" | "env" | "default";
  reason?: string;
};

type BrainRootProbe = {
  path: string | null;
  exists: boolean;
  writable: boolean;
  allowed: boolean;
  valid: boolean;
  problem: string | null;
  canCreate: boolean;
  isEmpty: boolean | null;
  sameAsCurrent: boolean;
  noteCount?: number | null;
};

type ValidateResponse = BrainRootProbe & {
  vaultProbe?: BrainRootProbe | null;
};

type BrainRootSwitchResult = {
  ok: true;
  path: string;
  vaultPath: string | null;
  mode: "use" | "copy";
  copiedFiles?: number;
  noteCount: number;
};

type CopyProgress = {
  done: number;
  total: number;
  current: string;
  percent: number;
};

async function loadBrainRoot(): Promise<BrainRootInfo> {
  return client<BrainRootInfo>("/api/brain/root", {
    fallback: "Speicherort konnte nicht gelesen werden",
    unwrap: true,
  });
}

async function probeBrainRoot(input: {
  path: string;
  vaultPath?: string | null;
  create: boolean;
}): Promise<ValidateResponse> {
  return client<ValidateResponse>("/api/brain/root/validate", {
    body: input,
    fallback: "Pfad konnte nicht geprüft werden",
    method: "POST",
    unwrap: true,
  });
}

const SOURCE_LABEL: Record<BrainRootInfo["source"], string> = {
  saved: "gespeichert",
  env: "voreingestellt",
  default: "Standard-Ort",
};

function isLocatedElsewhere(error: unknown): boolean {
  return error instanceof Error && error.message.includes("nur lokal am PC erreichbar");
}

export function BrainRootSettings() {
  const queryClient = useQueryClient();
  const {
    data: root,
    error: rootError,
    isPending: rootPending,
  } = useQuery({ queryKey: ["brain", "root"], queryFn: loadBrainRoot, retry: false, staleTime: 60_000 });

  const [newPath, setNewPath] = useState("");
  const [vaultSameAsBrain, setVaultSameAsBrain] = useState(true);
  const [newVaultPath, setNewVaultPath] = useState("");
  const [mode, setMode] = useState<"use" | "copy">("use");
  const [probe, setProbe] = useState<BrainRootProbe | null>(null);
  const [vaultProbe, setVaultProbe] = useState<BrainRootProbe | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  // Live-Kopierfortschritt
  const [isSwitching, setIsSwitching] = useState(false);
  const [progress, setProgress] = useState<CopyProgress | null>(null);
  const [switchError, setSwitchError] = useState<string | null>(null);
  const [switchResult, setSwitchResult] = useState<BrainRootSwitchResult | null>(null);

  useEffect(() => {
    if (root) {
      if (root.path && root.vaultPath) {
        setVaultSameAsBrain(root.path.toLowerCase() === root.vaultPath.toLowerCase());
      }
    }
  }, [root]);

  const probeMutation = useMutation({
    mutationFn: probeBrainRoot,
    onSuccess: (result) => {
      setProbe(result);
      setVaultProbe(result.vaultProbe ?? null);
    },
  });

  const handleProbe = () => {
    if (!newPath.trim()) return;
    probeMutation.mutate({
      path: newPath.trim(),
      vaultPath: vaultSameAsBrain ? newPath.trim() : newVaultPath.trim() || undefined,
      create: false,
    });
  };

  const startSwitch = async () => {
    setIsSwitching(true);
    setProgress(null);
    setSwitchError(null);

    const targetVault = vaultSameAsBrain ? newPath.trim() : newVaultPath.trim() || null;
    const needsCreate = (probe?.canCreate === true && !probe.exists) ||
      (!vaultSameAsBrain && vaultProbe?.canCreate === true && !vaultProbe.exists);

    if (mode === "copy") {
      try {
        const res = await fetch("/api/brain/root", {
          method: "POST",
          credentials: "include",
          headers: {
            "content-type": "application/json",
            accept: "text/event-stream",
          },
          body: JSON.stringify({
            path: newPath.trim(),
            vaultPath: targetVault,
            mode: "copy",
            create: needsCreate,
          }),
        });

        if (!res.ok) {
          const err = (await res.json().catch(() => null)) as { error?: string } | null;
          throw new Error(err?.error || `HTTP ${res.status}`);
        }

        const contentType = res.headers.get("content-type") || "";
        if (contentType.includes("text/event-stream") && res.body) {
          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          let buffer = "";

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split(/\r?\n/);
            buffer = lines.pop() ?? "";

            let currentEvent = "";
            for (const line of lines) {
              if (line.startsWith("event:")) {
                currentEvent = line.slice(6).trim();
              } else if (line.startsWith("data:")) {
                const dataStr = line.slice(5).trim();
                try {
                  const parsed = JSON.parse(dataStr);
                  if (currentEvent === "progress") {
                    setProgress(parsed as CopyProgress);
                  } else if (currentEvent === "done") {
                    setSwitchResult(parsed as BrainRootSwitchResult);
                    setConfirmOpen(false);
                    setProbe(null);
                    setVaultProbe(null);
                    setNewPath("");
                    setNewVaultPath("");
                    void queryClient.invalidateQueries({ queryKey: ["brain"] });
                  } else if (currentEvent === "error") {
                    setSwitchError(parsed.error || "Fehler beim Kopieren.");
                  }
                } catch (e) {
                  if (currentEvent === "error") {
                    setSwitchError(e instanceof Error ? e.message : "Fehler beim Kopieren.");
                  }
                }
              }
            }
          }
        } else {
          // Standard JSON Antwort
          const data = (await res.json()) as BrainRootSwitchResult;
          setSwitchResult(data);
          setConfirmOpen(false);
          setProbe(null);
          setVaultProbe(null);
          setNewPath("");
          setNewVaultPath("");
          void queryClient.invalidateQueries({ queryKey: ["brain"] });
        }
      } catch (err) {
        setSwitchError(err instanceof Error ? err.message : "Kopieren fehlgeschlagen.");
      } finally {
        setIsSwitching(false);
      }
    } else {
      // Modus: "use" (Nur umstellen)
      try {
        const res = await client<BrainRootSwitchResult>("/api/brain/root", {
          body: {
            path: newPath.trim(),
            vaultPath: targetVault,
            mode: "use",
            create: needsCreate,
          },
          fallback: "Umstellen fehlgeschlagen – der bisherige Speicherort bleibt unverändert",
          method: "POST",
          unwrap: true,
        });
        setSwitchResult(res);
        setConfirmOpen(false);
        setProbe(null);
        setVaultProbe(null);
        setNewPath("");
        setNewVaultPath("");
        void queryClient.invalidateQueries({ queryKey: ["brain"] });
      } catch (err) {
        setSwitchError(err instanceof Error ? err.message : "Umstellen fehlgeschlagen.");
      } finally {
        setIsSwitching(false);
      }
    }
  };

  if (rootError) {
    if (isLocatedElsewhere(rootError)) {
      return (
        <section className="rounded-xl border bg-muted/20 p-4 text-xs text-muted-foreground">
          <div className="mb-1 font-medium text-foreground">Spark Brain – Speicherort</div>
          Der Speicherort des Spark Brain kann nur direkt am PC geändert werden – auf dem
          Handy oder im Web bitte die Connect-App auf dem PC benutzen.
        </section>
      );
    }
    return (
      <section className="rounded-xl border bg-muted/20 p-4 text-xs text-destructive" role="alert">
        <div className="font-medium">Spark Brain – Speicherort</div>
        {rootError.message}
      </section>
    );
  }

  if (rootPending || !root) {
    return (
      <section className="flex items-center gap-2 rounded-xl border bg-muted/20 p-4 text-xs text-muted-foreground">
        <IconLoader2 className="size-4 animate-spin" stroke={1.75} />
        Speicherort wird gelesen …
      </section>
    );
  }

  const isValidToSwitch = probe?.valid && (vaultSameAsBrain || !newVaultPath.trim() || vaultProbe?.valid);

  return (
    <section className="flex flex-col gap-3.5 rounded-xl border bg-muted/20 p-4">
      <div className="flex items-center gap-2">
        <IconFolder className="size-4" stroke={1.75} />
        <h3 className="text-sm font-medium">Spark Brain & Vault – Speicherort</h3>
        <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
          {SOURCE_LABEL[root.source]}
        </span>
      </div>

      {/* Aktuelle Speicherorte */}
      <dl className="grid grid-cols-1 gap-1 text-xs sm:grid-cols-[auto_1fr] sm:gap-x-3">
        <dt className="text-muted-foreground">Brain-Ordner</dt>
        <dd className="break-all font-mono text-[13px] sm:text-xs">
          {root.path ?? "– nicht eingerichtet –"}
          <span className="ml-2 text-muted-foreground">(Lesen & Schreiben von Notizen)</span>
        </dd>
        <dt className="text-muted-foreground">Vault-Ordner</dt>
        <dd className="break-all font-mono text-[13px] sm:text-xs">
          {root.vaultPath ?? "–"}
          <span className="ml-2 text-muted-foreground">(nur lesend; bleibt unangetastet)</span>
        </dd>
        <dt className="text-muted-foreground">Notizen</dt>
        <dd>
          {root.noteCount === null ? "–" : `${root.noteCount} Markdown-Notizen`}
          {!root.writable && root.exists ? (
            <span className="ml-2 text-destructive">(Ordner ist schreibgeschützt)</span>
          ) : null}
        </dd>
      </dl>

      {root.reason ? (
        <p className="text-xs text-destructive" role="alert">
          {root.reason}
        </p>
      ) : null}

      {/* 1. Einstellung: Neuer Brain-Ordner */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium">Neuer Brain-Ordner (Spark-Notizen)</label>
        <div className="flex flex-wrap gap-2">
          <Input
            aria-label="Neuer Brain-Ordner"
            className="min-w-0 flex-1 text-[16px] sm:text-sm"
            disabled={isSwitching}
            onChange={(event) => {
              setProbe(null);
              setNewPath(event.target.value);
            }}
            placeholder="z. B. D:\SparkBrain oder C:\Users\…\Documents\SparkBrain"
            spellCheck={false}
            value={newPath}
          />
          <Button
            className="h-11 w-full shrink-0 sm:h-7 sm:w-auto"
            disabled={!newPath.trim() || probeMutation.isPending || isSwitching}
            onClick={handleProbe}
            size="sm"
            type="button"
            variant="outline"
          >
            {probeMutation.isPending ? "Prüfe …" : "Prüfen"}
          </Button>
        </div>
      </div>

      {probe ? (
        <div
          className={
            probe.valid
              ? "flex items-start gap-2 rounded border border-emerald-500/30 bg-emerald-500/10 p-2.5 text-xs"
              : "flex items-start gap-2 rounded border border-destructive/40 bg-destructive/10 p-2.5 text-xs"
          }
          role="status"
        >
          {probe.valid ? (
            <IconCheck className="mt-0.5 size-3.5 shrink-0 text-emerald-500" stroke={1.75} />
          ) : (
            <IconAlertCircle className="mt-0.5 size-3.5 shrink-0 text-destructive" stroke={1.75} />
          )}
          <div className="min-w-0">
            {probe.problem ? <div>{probe.problem}</div> : <div>Brain-Ordner ist zulässig und beschreibbar.</div>}
            {probe.noteCount !== null && probe.noteCount !== undefined ? (
              <div className="text-muted-foreground">Enthält {probe.noteCount} Markdown-Notizen.</div>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* 2. Einstellung: Vault-Ordner Zuordnung */}
      <div className="flex flex-col gap-2 rounded-lg border bg-muted/30 p-3 text-xs">
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={vaultSameAsBrain}
            onChange={(e) => {
              setVaultSameAsBrain(e.target.checked);
              setVaultProbe(null);
            }}
            className="rounded border-muted-foreground"
          />
          <span className="font-medium">
            Vault-Ordner entspricht Brain-Ordner (wie bei Stefans Setup)
          </span>
        </label>

        {!vaultSameAsBrain ? (
          <div className="mt-1 flex flex-col gap-1.5">
            <span className="text-muted-foreground">
              Separater Obsidian-Vault (nur-lesend eingebunden für Wissensgraph & Referenzen):
            </span>
            <Input
              aria-label="Separater Vault-Ordner"
              className="min-w-0 flex-1 text-[16px] sm:text-sm"
              disabled={isSwitching}
              onChange={(e) => {
                setVaultProbe(null);
                setNewVaultPath(e.target.value);
              }}
              placeholder="z. B. C:\Users\…\Documents\ObsidianVault"
              spellCheck={false}
              value={newVaultPath}
            />
            {vaultProbe ? (
              <div
                className={
                  vaultProbe.valid
                    ? "mt-1 flex items-start gap-2 rounded border border-emerald-500/30 bg-emerald-500/10 p-2 text-xs"
                    : "mt-1 flex items-start gap-2 rounded border border-destructive/40 bg-destructive/10 p-2 text-xs"
                }
              >
                {vaultProbe.valid ? (
                  <IconCheck className="mt-0.5 size-3.5 shrink-0 text-emerald-500" stroke={1.75} />
                ) : (
                  <IconAlertCircle className="mt-0.5 size-3.5 shrink-0 text-destructive" stroke={1.75} />
                )}
                <div>{vaultProbe.problem ?? "Vault-Ordner ist zulässig."}</div>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* Modus: Nur umstellen vs Kopieren */}
      <fieldset className="flex flex-col gap-1.5 text-xs">
        <legend className="mb-1 font-medium">Beim Umstellen</legend>
        <label className="flex items-start gap-2 cursor-pointer">
          <input
            checked={mode === "use"}
            className="mt-0.5 accent-current"
            disabled={isSwitching}
            name="brain-root-mode"
            onChange={() => setMode("use")}
            type="radio"
          />
          <span>
            <strong>Nur umstellen</strong> – der neue Ordner wird sofort genutzt; der bisherige
            Ordner bleibt unverändert erhalten.
          </span>
        </label>
        <label className="flex items-start gap-2 cursor-pointer">
          <input
            checked={mode === "copy"}
            className="mt-0.5 accent-current"
            disabled={isSwitching || !root.path}
            name="brain-root-mode"
            onChange={() => setMode("copy")}
            type="radio"
          />
          <span>
            <strong>Inhalte kopieren und umstellen</strong> – alle Notizen des bisherigen
            Brain-Ordners werden in den neuen Ordner kopiert (bestehende Zieldateien werden nie überschrieben).
            Der alte Ordner bleibt als Sicherung unverändert.
          </span>
        </label>
      </fieldset>

      {/* Live-Fortschrittsanzeige bei Kopieren */}
      {isSwitching && mode === "copy" && progress ? (
        <div className="flex flex-col gap-1.5 rounded-lg border bg-muted/40 p-3 text-xs" role="status">
          <div className="flex justify-between font-medium">
            <span>Kopiere Notizen …</span>
            <span>{progress.percent}% ({progress.done} / {progress.total})</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full bg-emerald-500 transition-all duration-150"
              style={{ width: `${progress.percent}%` }}
            />
          </div>
          <div className="truncate font-mono text-[11px] text-muted-foreground">
            {progress.current}
          </div>
        </div>
      ) : isSwitching ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground" role="status">
          <IconLoader2 className="size-4 animate-spin" />
          {mode === "copy" ? "Bereite Kopieren vor …" : "Wird umgestellt …"}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button
          disabled={!newPath.trim() || !isValidToSwitch || isSwitching}
          onClick={() => setConfirmOpen(true)}
          size="sm"
          type="button"
        >
          Umstellen
        </Button>
      </div>

      {switchError ? (
        <p className="text-xs text-destructive" role="alert">
          {switchError}
        </p>
      ) : null}

      {switchResult ? (
        <div className="rounded border border-emerald-500/30 bg-emerald-500/10 p-2.5 text-xs" role="status">
          <div className="font-medium text-emerald-600 dark:text-emerald-400">Neuer Speicherort ist aktiv</div>
          <div className="mt-1 break-all font-mono">Brain: {switchResult.path}</div>
          {switchResult.vaultPath ? (
            <div className="mt-0.5 break-all font-mono text-muted-foreground">Vault: {switchResult.vaultPath}</div>
          ) : null}
          <div className="mt-1 text-muted-foreground">
            {switchResult.mode === "copy" && switchResult.copiedFiles !== undefined
              ? `${switchResult.copiedFiles} Dateien erfolgreich kopiert.`
              : "Nur umgestellt."}{" "}
            Der bisherige Ordner blieb unverändert erhalten.
          </div>
        </div>
      ) : null}

      {/* Bestätigungsdialog */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Speicherort ändern?</DialogTitle>
            <DialogDescription>
              {mode === "copy"
                ? "Die Notizen des bisherigen Brain-Ordners werden in den neuen Ordner kopiert. Bestehende Zieldateien werden dabei nie überschrieben. Der bisherige Ordner bleibt als Sicherungskopie unverändert erhalten."
                : "Ab sofort liest und schreibt das Spark Brain im neuen Ordner. Der bisherige Ordner bleibt unverändert erhalten."}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5 rounded border bg-muted/30 p-2.5 font-mono text-xs">
            <div><strong>Neuer Brain-Ordner:</strong> {newPath.trim()}</div>
            <div>
              <strong>Vault-Ordner:</strong>{" "}
              {vaultSameAsBrain ? newPath.trim() : newVaultPath.trim() || "– unverändert / nicht gesetzt –"}
            </div>
          </div>
          <DialogFooter>
            <Button
              disabled={isSwitching}
              onClick={() => setConfirmOpen(false)}
              size="sm"
              type="button"
              variant="outline"
            >
              Abbrechen
            </Button>
            <Button
              disabled={isSwitching}
              onClick={startSwitch}
              size="sm"
              type="button"
            >
              {isSwitching ? (
                <span className="flex items-center gap-1.5">
                  <IconLoader2 className="size-3.5 animate-spin" />
                  Verarbeite …
                </span>
              ) : mode === "copy" ? (
                "Kopieren und umstellen"
              ) : (
                "Umstellen"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
