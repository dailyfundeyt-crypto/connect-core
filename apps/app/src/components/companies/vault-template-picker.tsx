import { useQuery } from "@tanstack/react-query";
import { IconTemplate } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  brainFileQueryOptions,
  brainTemplatesQueryOptions,
} from "@/lib/brain/queries";
import { setOpenVaultPath } from "@/lib/companies/notes";
import { splitFrontmatter } from "@/components/companies/vault-note-editor";
import { cn } from "@/lib/utils";

/**
 * Picker for files marked `template: true` in their YAML frontmatter.
 *
 * The flag is a real property of the file, not a side-channel, so a template
 * exists exactly once in the vault and is not duplicated by an external list.
 * The picker reads the candidate list from `/api/brain/templates` (the server
 * walks the YAML head of every file in one pass), lets the user choose a name
 * and a target folder, and `PUT`s the cloned body to `/api/brain/note`. The
 * clone is opened in the editor immediately so the user can start typing into
 * the new structure without an extra step.
 */
export function VaultTemplatePicker({
  companyId,
  open,
  onOpenChange,
}: {
  companyId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const templates = useQuery(brainTemplatesQueryOptions());
  const [picked, setPicked] = useState<string | null>(null);
  const [destination, setDestination] = useState<string>("00 Inbox");
  const [name, setName] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setPicked(null);
      setName("");
      setError(null);
      setBusy(false);
    }
  }, [open]);

  useEffect(() => {
    if (!picked && templates.data?.templates?.[0]) {
      setPicked(templates.data.templates[0].path);
    }
  }, [picked, templates.data]);

  const list = templates.data?.available ? templates.data.templates : [];

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="flex max-h-[80vh] w-[min(720px,90vw)] flex-col gap-0 p-0">
        <DialogTitle className="border-b px-4 py-3 text-[14px] font-semibold">
          Aus Vorlage erstellen
        </DialogTitle>
        <DialogDescription className="sr-only">
          Wähle eine Notiz mit `template: true` und lege eine Kopie im Zielordner an.
        </DialogDescription>
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-0 overflow-hidden md:grid-cols-[1fr_1fr]">
          <ul className="min-h-0 overflow-y-auto border-b p-2 md:border-b-0 md:border-r">
            {templates.isPending ? (
              <li className="px-2 py-6 text-center text-[12px] text-muted-foreground">
                Vorlagen werden geladen…
              </li>
            ) : list.length === 0 ? (
              <li className="px-2 py-6 text-center text-[12px] text-muted-foreground">
                Keine Vorlagen gefunden. Markiere eine Notiz mit{" "}
                <code className="rounded bg-neutral-100 px-1 py-0.5 font-mono text-[11px] dark:bg-white/10">
                  template: true
                </code>{" "}
                in den Eigenschaften.
              </li>
            ) : (
              list.map((entry) => {
                const label = entry.path.split("/").pop()?.replace(/\.md$/i, "") ?? entry.path;
                const isPicked = picked === entry.path;
                return (
                  <li key={entry.path}>
                    <button
                      className={cn(
                        "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12.5px] transition-colors",
                        isPicked
                          ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
                          : "hover:bg-neutral-100 dark:hover:bg-white/5",
                      )}
                      onClick={() => setPicked(entry.path)}
                      type="button"
                    >
                      <IconTemplate className="size-3.5 shrink-0 opacity-70" stroke={1.75} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{label}</p>
                        <p className="truncate text-[10.5px] opacity-60">{entry.path}</p>
                      </div>
                    </button>
                  </li>
                );
              })
            )}
          </ul>
          <div className="flex flex-col gap-3 p-4">
            <label className="flex flex-col gap-1 text-[12px] font-medium text-muted-foreground">
              Name der neuen Notiz
              <input
                className="h-9 rounded-md border bg-transparent px-2 text-[13px] outline-none focus:border-neutral-400"
                onChange={(event) => setName(event.target.value)}
                placeholder={new Date().toISOString().slice(0, 16).replace("T", " ")}
                value={name}
              />
            </label>
            <label className="flex flex-col gap-1 text-[12px] font-medium text-muted-foreground">
              Zielordner
              <input
                className="h-9 rounded-md border bg-transparent px-2 text-[13px] outline-none focus:border-neutral-400"
                onChange={(event) => setDestination(event.target.value)}
                placeholder="00 Inbox"
                value={destination}
              />
            </label>
            {error ? (
              <p className="rounded-md border border-destructive/30 bg-destructive/5 p-2 text-[12px] text-destructive">
                {error}
              </p>
            ) : null}
            <div className="mt-auto flex items-center justify-end gap-2">
              <button
                className="rounded-md border bg-transparent px-3 py-1.5 text-[12.5px] hover:bg-neutral-100 dark:hover:bg-white/5"
                onClick={() => onOpenChange(false)}
                type="button"
              >
                Abbrechen
              </button>
              <button
                className="rounded-md bg-neutral-900 px-3 py-1.5 text-[12.5px] font-medium text-white disabled:opacity-40 dark:bg-white dark:text-neutral-900"
                disabled={!picked || busy}
                onClick={() => void handleCreate()}
                type="button"
              >
                {busy ? "Erstelle…" : "Notiz anlegen"}
              </button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );

  async function handleCreate() {
    if (!picked) return;
    setBusy(true);
    setError(null);
    try {
      const stamp = new Date().toISOString().slice(0, 16).replace("T", " ");
      const targetName = (name || `${stamp}`).trim().replace(/[\\/]+/g, "-");
      const folder = destination.trim() || "00 Inbox";
      const targetPath = `${folder}/${targetName}.md`;

      const file = await fetch(`/api/brain/file?path=${encodeURIComponent(picked)}`);
      if (!file.ok) throw new Error("Vorlage konnte nicht gelesen werden.");
      const fileData = (await file.json()) as { content?: string; readOnly?: boolean };
      if (fileData.readOnly) throw new Error("Diese Vorlage ist schreibgeschützt.");
      const body = fileData.content ?? "";
      const { frontmatter, body: rawBody } = splitFrontmatter(body);
      const cleanedFrontmatter = stripTemplateFlag(frontmatter);

      const response = await fetch("/api/brain/note", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          path: targetPath,
          content: cleanedFrontmatter + rawBody,
          mode: "write",
        }),
      });
      if (!response.ok) throw new Error("Neue Notiz konnte nicht angelegt werden.");

      setOpenVaultPath(companyId, targetPath);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }
}

/** True if the file's frontmatter declares `template: true`. */
export function isTemplate(content: string): boolean {
  const { frontmatter } = splitFrontmatter(content);
  if (!frontmatter) return false;
  return /^template:\s*true\s*$/m.test(frontmatter);
}

/** Removes the `template:` key from a frontmatter block, preserving everything else. */
function stripTemplateFlag(frontmatter: string): string {
  if (!frontmatter) return frontmatter;
  return frontmatter
    .replace(/^template:\s*true\s*$\r?\n?/m, "")
    .replace(/^template:\s*true\s*$/m, "");
}