import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useQueryClient } from "@tanstack/react-query";
import { VaultNotesSection } from "@/components/companies/vault-notes-section";
import {
  brainKeys,
  copyBrainPath,
  createBrainNote,
} from "@/lib/brain/queries";
import {
  clearLegacyNotes,
  getOpenVaultPath,
  legacyNotesForMigration,
  noteLabel,
  setOpenVaultPath,
  subscribeNotes,
} from "@/lib/companies/notes";
import { blocksToMarkdown } from "@/lib/companies/notes-markdown";

/**
 * The "new folder" dialog, local to the sidebar.
 *
 * Replaces `window.prompt`, which was what the group list used: a native prompt
 * cannot be styled, cannot be reached by the keyboard shortcut we would want, and
 * it says nothing about what a folder *is* — here it explains that notes filed
 * here become Markdown files in the Brain.
 *
 * Local rather than shared because only the sidebar creates folders today; a
 * shared module would be a guess about where else it is needed.
 */
export function NewFolderDialog({
  open,
  onOpenChange,
  onCreate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (name: string) => void;
}) {
  const [name, setName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setName("");
    // Focus without a delay would race the dialog's own mount animation; one
    // frame is enough for the element to exist and the keyboard path to work.
    const frame = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [open]);

  const trimmed = name.trim();

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Neuer Ordner</DialogTitle>
          <DialogDescription>
            Notizen in diesem Ordner landen als Markdown-Dateien in deinem Spark
            und tauchen dort im Graphen auf.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (!trimmed) return;
            onCreate(trimmed);
          }}
        >
          <Input
            aria-label="Ordnername"
            autoComplete="off"
            className="h-9"
            maxLength={60}
            onChange={(event) => setName(event.target.value)}
            placeholder="z.B. Kundengespräche"
            ref={inputRef}
            value={name}
          />
          <DialogFooter className="mt-5">
            <Button
              onClick={() => onOpenChange(false)}
              size="sm"
              type="button"
              variant="ghost"
            >
              Abbrechen
            </Button>
            <Button disabled={!trimmed} size="sm" type="submit">
              Ordner anlegen
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * The notes section in the Lab sidebar.
 *
 * This used to render two parallel structures: a list of localStorage notes under
 * a "Notizen" heading, and the on-disk Plannung tree below it. The local list is
 * gone — every note the rail creates now lands in the Brain, so the only thing
 * this section has to show is the Plannung tree. Splitting the section into two
 * headings would be a layout choice for a structure that no longer exists, so
 * the section is now just the tree, without a label of its own.
 *
 * The `companyId` prop is kept because the open-file state is keyed on it, even
 * though the tree no longer reads from localStorage: the same subscriber that
 * kept the local list and the open note in step is the one that keeps the open
 * vault path in step with what the panel is showing.
 */
export function NotesSidebarSection({ companyId }: { companyId: string }) {
  const queryClient = useQueryClient();
  const [copiedPath, setCopiedPath] = useState<string | null>(null);

  useEffect(() => {
    const legacy = legacyNotesForMigration();
    if (legacy.length === 0) return;
    void (async () => {
      for (const item of legacy) {
        const title = item.note.title.trim() || noteLabel(item.note);
        const content =
          item.note.body ||
          (item.note.blocks ? blocksToMarkdown(item.note.blocks) : "");
        try {
          await createBrainNote({
            folder: "00 Inbox",
            title,
            content,
          });
        } catch {
          // duplicate note name or already migrated
        }
      }
      clearLegacyNotes();
      void queryClient.invalidateQueries({ queryKey: brainKeys.all });
    })();
  }, [queryClient]);

  /*
   * Cleared by effect rather than by a timer inside the handler.
   *
   * Two clicks in quick succession meant two pending timers, the first of which
   * wiped the second message while it was still the one on screen -- so a repeat
   * copy looked like it had failed. Cancelling the timeout on the next message and
   * on unmount ties the visible text to the newest action.
   */
  useEffect(() => {
    if (!copiedPath) return;
    const timer = window.setTimeout(() => setCopiedPath(null), 3000);
    return () => window.clearTimeout(timer);
  }, [copiedPath]);

  const copyVaultPath = (path: string) => {
    void copyBrainPath(path)
      .then((reason) => setCopiedPath(reason ?? "Pfad kopiert."))
      .catch(() => setCopiedPath("Pfad konnte nicht kopiert werden."));
  };

  /*
   * Which vault file is open in the main panel.
   *
   * The tree section writes the path the user clicked, the panel reads it, and
   * `subscribeNotes` is the bridge between the two component trees. The state is
   * mirrored here so the highlight on the selected row follows the panel rather
   * than the click that opened it, which is what the rest of the section expects.
   */
  const [openVaultPath, setOpenVaultPathState] = useState<string | null>(() =>
    getOpenVaultPath(companyId),
  );

  useEffect(() => {
    setOpenVaultPathState(getOpenVaultPath(companyId));
    return subscribeNotes(() => setOpenVaultPathState(getOpenVaultPath(companyId)));
  }, [companyId]);

  const onOpenVaultFile = (path: string) => setOpenVaultPath(companyId, path);

  return (
    <div
      className="mt-3 flex min-h-0 flex-1 flex-col overflow-hidden px-0.5"
      data-section="notes"
    >
      <VaultNotesSection
        companyId={companyId}
        onOpen={onOpenVaultFile}
        onReveal={copyVaultPath}
        selectedPath={openVaultPath ?? null}
      />
      {copiedPath ? (
        <p className="mt-1 px-2 text-[11px] text-muted-foreground" role="status">
          {copiedPath}
        </p>
      ) : null}
    </div>
  );
}
