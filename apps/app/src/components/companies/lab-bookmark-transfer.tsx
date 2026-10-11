"use client";

import { IconDownload, IconFolder, IconUpload } from "@tabler/icons-react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { RailAction } from "@/components/companies/lab-tools-nav";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  buildBookmarkHtml,
  buildImportState,
  downloadBookmarkFile,
  parseBookmarkHtml,
  readBookmarkFile,
  toBookmarkTree,
  type LabBookmarkNode,
  type Level3BrowserState,
} from "@/lib/companies/level3-tools";
import { cn } from "@/lib/utils";

/** Slug-safe filename, e.g. "Acme GmbH" -> "acme-gmbh". */
function slug(value: string): string {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/ä/g, "ae")
      .replace(/ö/g, "oe")
      .replace(/ü/g, "ue")
      .replace(/ß/g, "ss")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "connect"
  );
}

/** Short preview of the folder names a file contains, for the confirmation dialog. */
function summarize(nodes: LabBookmarkNode[], limit = 6): string {
  const names: string[] = [];
  const walk = (list: LabBookmarkNode[]) => {
    for (const node of list) {
      if (names.length < limit) names.push(node.label);
      walk(node.folders);
    }
  };
  walk(nodes);
  const extra = (() => {
    let total = 0;
    const walk = (list: LabBookmarkNode[]) => {
      for (const node of list) {
        total += 1;
        walk(node.folders);
      }
    };
    walk(nodes);
    return total - names.length;
  })();
  return extra > 0 ? `${names.join(", ")} +${extra}` : names.join(", ");
}

export function BookmarkTransfer({
  companyId,
  companyName,
  onChange,
  state,
}: {
  companyId: string;
  companyName?: string;
  onChange: (next: Level3BrowserState) => void;
  state: Level3BrowserState;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<{
    tree: LabBookmarkNode[];
    count: number;
    folderCount: number;
    warnings: string[];
    filename: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runExport = () => {
    const tree = toBookmarkTree(state);
    if (tree.length === 0) {
      setError(
        "Es gibt noch keine Ordner zum Exportieren. Lege zuerst eine Gruppe an.",
      );
      return;
    }
    setError(null);
    const html = buildBookmarkHtml(tree, { companyId, companyName });
    const stamp = new Date().toISOString().slice(0, 10);
    downloadBookmarkFile(
      `connect-${slug(companyName ?? companyId)}-${stamp}.html`,
      html,
    );
  };

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      setError(null);
      const text = await readBookmarkFile(file);
      const parsed = parseBookmarkHtml(text);
      if (parsed.tree.length === 0) {
        setError(
          "In dieser Datei wurden keine Lesezeichen gefunden. Stelle sicher, dass es eine exportierte Lesezeichen-HTML-Datei ist.",
        );
        return;
      }
      setPending({ ...parsed, filename: file.name });
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Die Datei konnte nicht gelesen werden.",
      );
    }
  };

  const confirmImport = () => {
    if (!pending) return;
    // Import only ever adds. buildImportState() returns the candidate state; existing folders and
    // apps are carried over untouched, so an import can never remove work.
    const preview = buildImportState(state, pending.tree);
    onChange(preview.next);
    setPending(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const cancelImport = () => {
    setPending(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <>
      {/*
        * Import and export, as two icon buttons in the same rail row as the add actions.
        *
        * `mt-0.5` and the wrapping row went with the text: the caller already lays this out as a
        * flex row, so a block of its own would have put the two pairs on separate lines again.
        */}
      <div className="flex items-center gap-0.5">
        <input
          accept=".html,.htm,text/html"
          className="hidden"
          onChange={(event) => {
            void handleFile(event.target.files?.[0]);
          }}
          ref={fileRef}
          type="file"
        />
        <RailAction label="Lesezeichen importieren" onClick={() => fileRef.current?.click()}>
          <IconUpload className="size-3.5" />
        </RailAction>
        <RailAction label="Lesezeichen exportieren" onClick={runExport}>
          <IconDownload className="size-3.5" />
        </RailAction>
      </div>

      {error ? (
        <p
          className={cn(
            "rounded-lg bg-destructive/10 px-2 py-1.5 text-[11px] leading-snug text-destructive",
          )}
          role="alert"
        >
          {error}
        </p>
      ) : null}

      <Dialog
        onOpenChange={(open) => {
          if (!open) cancelImport();
        }}
        open={pending !== null}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Lesezeichen importieren</DialogTitle>
            <DialogDescription>
              {pending ? (
                <>
                  <strong>{pending.filename}</strong> enthält{" "}
                  {pending.count} Lesezeichen in {pending.folderCount} Ordnern
                  {pending.folderCount === 1 ? "" : "n"}.
                  {pending.tree.length > 0 ? (
                    <> Ordner: {summarize(pending.tree)}.</>
                  ) : null}
                </>
              ) : null}
            </DialogDescription>
          </DialogHeader>

          {pending && pending.warnings.length > 0 ? (
            <ul className="max-h-40 space-y-1 overflow-y-auto rounded-lg bg-muted/50 px-2.5 py-2 text-[11px] leading-snug text-muted-foreground">
              {pending.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          ) : null}

          {pending ? (
            <p className="text-[11px] leading-snug text-muted-foreground">
              Vorhandene Ordner und Lesezeichen bleiben unverändert — der Import
              fügt nur hinzu. Bereits vorhandene Lesezeichen werden übersprungen.
            </p>
          ) : null}

          <DialogFooter>
            <Button onClick={cancelImport} size="sm" type="button" variant="ghost">
              Abbrechen
            </Button>
            <Button onClick={confirmImport} size="sm" type="button">
              <IconFolder className="size-3.5" />
              Importieren
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
