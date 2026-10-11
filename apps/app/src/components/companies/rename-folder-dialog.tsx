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
import type { NoteFolder } from "@/lib/companies/notes";

/**
 * Dialog „Ordner umbenennen".
 *
 * The companion to `NewFolderDialog`: same shape, so the two read as one feature.
 * The field starts on the current name rather than empty, because a rename that
 * asks you to retype what it already knows is a retyping exercise.
 *
 * `folder` rather than an id, so the row that opened it is the one that gets
 * renamed -- by the time this renders the tree has re-read from storage, and a
 * folder captured at click time would be the stale copy.
 */
export function RenameFolderDialog({
  folder,
  onOpenChange,
  onRename,
}: {
  folder: NoteFolder | null;
  onOpenChange: (open: boolean) => void;
  onRename: (name: string) => void;
}) {
  const [name, setName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!folder) return;
    setName(folder.label);
    // Select rather than just focus: the common case is correcting one word in the
    // middle of the name, and that needs the old text to not be a deletion first.
    requestAnimationFrame(() => inputRef.current?.select());
  }, [folder]);

  const trimmed = name.trim();
  // An unchanged name is not a rename. Treating it as one would close the dialog on
  // save and look like it did something.
  const canSave = trimmed.length > 0 && trimmed !== folder?.label;

  return (
    <Dialog open={folder !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Ordner umbenennen</DialogTitle>
          <DialogDescription>
            Der neue Name ändert sich überall dort, wo der Ordner erscheint.
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (!canSave) return;
            onRename(trimmed);
          }}
        >
          <Input
            aria-label="Ordnername"
            autoComplete="off"
            className="h-9"
            maxLength={60}
            onChange={(event) => setName(event.target.value)}
            placeholder="Ordnername"
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
            <Button disabled={!canSave} size="sm" type="submit">
              Umbenennen
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}