/**
 * Dialog zum Umbenennen einer Brain-Notiz und zum Anlegen einer neuen Notiz mit Titel.
 * (Agent 1 „Spark Brain – Titel umbenennen".)
 *
 * Bearbeitbar ist der Titel, wie die Notizansicht ihn zeigt: Überschrift `# …` → Frontmatter
 * `title:` → Dateiname. Zusätzlich kann der Dateiname mitgeändert werden (Checkbox, Standard an);
 * der Server bereinigt die < > : " / \ | ? * selbst und wählt bei Kollision „ (2)“ – bestehende
 * Dateien werden nie überschrieben.
 *
 * Enter speichert, Esc bricht ab. Fehler erscheinen auf Deutsch (Servertext oder Fallback).
 * Nach dem Erfolg invalidiert sich der Brain-Cache (`brainKeys.all`), damit Baum, Graph und
 * Rückverweise sofort stimmen; der Aufrufer erfährt den neuen Pfad über `onSaved`.
 */

import { IconPencil } from "@tabler/icons-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import {
  type BrainRenameInput,
  type BrainRenameResult,
  brainKeys,
  brainRenamePreviewQueryOptions,
  createBrainNote,
  renameBrainNote,
  VAULT_PREFIX,
} from "@/lib/brain/queries";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type RenameNoteResult = BrainRenameResult;
export type RenameNoteInput = BrainRenameInput;

/** Für den Umbenenn-Modus: Pfad der Notiz + der aktuell angezeigte Titel (als Vorschlag). */
export type RenameNoteRequest = {
  path: string;
  currentTitle: string;
};

/** Für den Anlegen-Modus: Zielordner im Brain, z. B. `Inbox`. */
export type CreateNoteRequest = {
  folder: string;
};

export type RenameDialogRequest = {
  rename: RenameNoteRequest | null;
  create: CreateNoteRequest | null;
};

type RenameDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  request: RenameDialogRequest;
  /** Nach Erfolg: neuer Pfad (umbenannt oder frisch angelegt); Aufrufer kann die Notiz öffnen. */
  onSaved?: (path: string, result: RenameNoteResult | null) => void;
};

export function RenameNoteDialog({ open, onOpenChange, request, onSaved }: RenameDialogProps) {
  const note = request.rename;
  const creation = request.create;
  const isVault = Boolean(note?.path.startsWith(VAULT_PREFIX));
  const [title, setTitle] = useState("");
  const [withFile, setWithFile] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  /*
   * Beim Öffnen Felder zurücksetzen: Umbenennen wird mit dem aktuellen Titel vorbelegt, Anlegen leer.
   *
   * Abhängig sind nur die Werte, nicht die Request-Objekte: der Editor reicht bei jedem Render
   * ein frisch gebautes `{ rename: { … } }` herein. Mit den Objekten in der Liste lief der Effekt
   * bei jedem Parent-Render (z. B. während der Auto-Save-Status wechselt) und setzte den Titel
   * auf den alten Wert zurück – getippte Zeichen verschwanden, und „Umbenennen“ schickte am Ende
   * wieder den alten Namen. Die Datei blieb dann unverändert.
   */
  const notePath = note?.path ?? "";
  const noteTitle = note?.currentTitle ?? "";
  const createFolder = creation?.folder ?? "";
  useEffect(() => {
    if (!open) return;
    setTitle(noteTitle);
    setWithFile(true);
    setError(null);
    setSaving(false);
    const timer = window.setTimeout(() => inputRef.current?.select(), 30);
    return () => window.clearTimeout(timer);
  }, [open, notePath, noteTitle, createFolder]);

  /* Vorschau für „X Links werden angepasst“ im Umbenenn-Modus (tatsächliche Zahl betroffener Link-Vorkommen). */
  const preview = useQuery({ ...brainRenamePreviewQueryOptions(note?.path ?? ""), enabled: open && Boolean(note) });
  const linkCount = preview.data?.linkCount ?? 0;

  const submit = async () => {
    if (saving || !open) return;
    const clean = title.trim();
    if (!clean) {
      setError("Der Titel darf nicht leer sein.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (creation) {
        /* Neue Notiz: der Titel wird Dateiname (Server bereinigt) und die erste Überschrift. */
        const created = await createBrainNote({ folder: creation.folder, title: clean, content: `# ${clean}\n\n` });
        void queryClient.invalidateQueries({ queryKey: brainKeys.all });
        onOpenChange(false);
        onSaved?.(created.path, null);
      } else if (note) {
        const saved = await renameBrainNote({ path: note.path, newTitle: clean, renameFile: withFile });
        void queryClient.invalidateQueries({ queryKey: brainKeys.all });
        onOpenChange(false);
        onSaved?.(saved.newPath, saved);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : creation ? "Notiz konnte nicht angelegt werden." : "Umbenennen fehlgeschlagen.");
    } finally {
      setSaving(false);
    }
  };

  const cancel = () => {
    if (saving) return;
    onOpenChange(false);
  };

  return (
    <Dialog onOpenChange={(next) => (saving ? undefined : onOpenChange(next))} open={open}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <IconPencil className="size-4" />
            {creation ? "Neue Notiz" : "Notiz umbenennen"}
          </DialogTitle>
          <DialogDescription>{note ? note.path : creation ? `Neue Notiz in ${creation.folder}` : null}</DialogDescription>
        </DialogHeader>
        <DialogBody
          className="flex flex-col gap-3"
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void submit();
            } else if (event.key === "Escape") {
              event.preventDefault();
              cancel();
            }
          }}
        >
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs text-muted-foreground" htmlFor="rename-note-title">
              {creation ? "Titel der neuen Notiz" : "Neuer Titel"}
            </Label>
            <Input
              autoFocus
              disabled={saving || (Boolean(note) && isVault)}
              id="rename-note-title"
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Titel eingeben …"
              ref={inputRef}
              value={title}
            />
          </div>
          {note && !creation ? (
            <label className={isVault ? "pointer-events-none flex items-center gap-2 text-xs text-muted-foreground opacity-50" : "flex cursor-pointer items-center gap-2 text-xs text-muted-foreground"}>
              <Checkbox checked={withFile} disabled={isVault || saving} onCheckedChange={(checked) => setWithFile(checked === true)} />
              Dateinamen mitändern
            </label>
          ) : null}
          {isVault ? (
            <p className="text-xs text-muted-foreground">Notizen im Vault sind schreibgeschützt – Titel und Dateiname können hier nicht geändert werden.</p>
          ) : note && linkCount > 0 ? (
            <p className="text-xs text-muted-foreground">
              {linkCount} {linkCount === 1 ? "Link wird" : "Links werden"} angepasst, wenn der Dateiname geändert wird.
            </p>
          ) : null}
          {error ? (
            <p className="text-xs text-destructive" role="alert">
              {error}
            </p>
          ) : null}
        </DialogBody>
        <DialogFooter>
          <Button onClick={cancel} size="sm" type="button" variant="ghost">
            Abbrechen
          </Button>
          <Button disabled={saving || title.trim().length === 0 || (Boolean(note) && isVault)} onClick={() => void submit()} size="sm" type="button">
            {creation ? "Anlegen" : "Umbenennen"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
