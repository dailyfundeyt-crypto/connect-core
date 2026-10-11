"use client";

/**
 * Spark-Notizen — Dialog „Neuer Ordner".
 *
 * Ein eigener Dialog statt `window.prompt`: der Name landet als Ordnername im
 * Vault, und `prompt` kann nicht erklären, was mit dem Namen passiert. Hier
 * steht, dass der Ordner im Vault entsteht, bevor man ihn bestätigt.
 */

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

/** What the dialog hands back to the sidebar: a name, or nothing if cancelled. */
export type NewFolderResult = { name: string } | null;

export function NewFolderDialog({
  open,
  onOpenChange,
  onCreate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (result: NewFolderResult) => void;
}) {
  const [name, setName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setName("");
    // The field has to be focused for the dialog to be usable with the keyboard
    // alone, and an empty field is a dead end if it does not have focus.
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  const trimmed = name.trim();
  const canCreate = trimmed.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Neuer Ordner</DialogTitle>
          <DialogDescription>
            Notizen in diesem Ordner landen als Markdown-Dateien in deinem
            Brain und tauchen dort im Graphen auf.
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (!canCreate) return;
            onCreate({ name: trimmed });
            onOpenChange(false);
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
            <Button disabled={!canCreate} size="sm" type="submit">
              Ordner anlegen
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}