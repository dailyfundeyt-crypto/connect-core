"use client";

import {
  IconArrowBackUp,
  IconArrowForwardUp,
  IconColumns,
  IconDeviceFloppy,
  IconRowInsertBottom,
  IconRowInsertTop,
  IconTableOff,
  IconTrash,
} from "@tabler/icons-react";
import type { Editor } from "@tiptap/react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

/**
 * Tabellen-Blocksteuerung.
 *
 * Sie erscheint nur, wenn der Cursor in einer Tabelle steht — Tiptap meldet
 * das über `editor.isActive("table")`, und die Toolbar rendert nur bei
 * Änderung neu (siehe `ActiveSync` in der Toolbar). Das ist bewusst kein
 * Slash-Menü: Tabellen bedienen sich über Zellenauswahl, und die
 * Standardbefehle decken ab, was man tatsächlich braucht.
 */
export function NoteTableControls({ editor }: { editor: Editor | null }) {
  const [, force] = useState(0);
  useEffect(() => {
    if (!editor) return;
    const rerender = () => force((n) => n + 1);
    editor.on("selectionUpdate", rerender);
    editor.on("transaction", rerender);
    return () => {
      editor.off("selectionUpdate", rerender);
      editor.off("transaction", rerender);
    };
  }, [editor]);

  if (!editor || !editor.isActive("table")) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            aria-label="Tabellen-Aktionen"
            className="h-8 rounded-lg px-2 text-xs font-medium"
            size="sm"
            variant="ghost"
          />
        }
      >
        <IconColumns aria-hidden className="size-4" stroke={1.75} />
        Tabelle
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-52 rounded-xl p-1.5">
        <DropdownMenuLabel className="text-[11px] uppercase tracking-wide opacity-60">
          Zeile
        </DropdownMenuLabel>
        <DropdownMenuItem
          className="gap-2 rounded-lg px-2.5 py-2 text-sm"
          onClick={() => editor.chain().focus().addRowBefore().run()}
        >
          <IconRowInsertTop aria-hidden className="size-4" stroke={1.75} />
          Darüber einfügen
        </DropdownMenuItem>
        <DropdownMenuItem
          className="gap-2 rounded-lg px-2.5 py-2 text-sm"
          onClick={() => editor.chain().focus().addRowAfter().run()}
        >
          <IconRowInsertBottom aria-hidden className="size-4" stroke={1.75} />
          Darunter einfügen
        </DropdownMenuItem>
        <DropdownMenuItem
          className="gap-2 rounded-lg px-2.5 py-2 text-sm"
          onClick={() => editor.chain().focus().deleteRow().run()}
        >
          <IconTrash aria-hidden className="size-4" />
          Zeile löschen
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuLabel className="text-[11px] uppercase tracking-wide opacity-60">
          Spalte
        </DropdownMenuLabel>
        <DropdownMenuItem
          className="gap-2 rounded-lg px-2.5 py-2 text-sm"
          onClick={() => editor.chain().focus().addColumnBefore().run()}
        >
          <IconColumns aria-hidden className="size-4" stroke={1.75} />
          Links einfügen
        </DropdownMenuItem>
        <DropdownMenuItem
          className="gap-2 rounded-lg px-2.5 py-2 text-sm"
          onClick={() => editor.chain().focus().addColumnAfter().run()}
        >
          <IconColumns aria-hidden className="size-4" stroke={1.75} />
          Rechts einfügen
        </DropdownMenuItem>
        <DropdownMenuItem
          className="gap-2 rounded-lg px-2.5 py-2 text-sm"
          onClick={() => editor.chain().focus().deleteColumn().run()}
        >
          <IconTrash aria-hidden className="size-4" />
          Spalte löschen
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuItem
          className="gap-2 rounded-lg px-2.5 py-2 text-sm"
          onClick={() => editor.chain().focus().toggleHeaderRow().run()}
        >
          <IconTableOff aria-hidden className="size-4" />
          Kopfzeile umschalten
        </DropdownMenuItem>
        <DropdownMenuItem
          className="gap-2 rounded-lg px-2.5 py-2 text-sm"
          onClick={() => editor.chain().focus().mergeOrSplit().run()}
        >
          <IconColumns aria-hidden className="size-4" stroke={1.75} />
          Zellen verbinden / teilen
        </DropdownMenuItem>
        <DropdownMenuItem
          className="gap-2 rounded-lg px-2.5 py-2 text-sm text-destructive focus:text-destructive"
          onClick={() => editor.chain().focus().deleteTable().run()}
        >
          <IconTrash aria-hidden className="size-4" />
          Tabelle löschen
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Undo/Redo + Speicherstatus, sitzt rechts in der Editor-Kopfzeile. */
export function NoteEditorStatus({
  editor,
  saveState,
}: {
  editor: Editor | null;
  saveState: SaveState;
}) {
  return (
    <div className="flex items-center gap-1">
      <Button
        aria-label="Rückgängig (⌘Z)"
        className="size-8 rounded-lg text-muted-foreground"
        disabled={!editor?.can().chain().focus().undo().run()}
        onClick={() => editor?.chain().focus().undo().run()}
        size="icon"
        title="Rückgängig (⌘Z)"
        type="button"
        variant="ghost"
      >
        <IconArrowBackUp aria-hidden className="size-4" stroke={1.75} />
      </Button>
      <Button
        aria-label="Wiederholen (⇧⌘Z)"
        className="size-8 rounded-lg text-muted-foreground"
        disabled={!editor?.can().chain().focus().redo().run()}
        onClick={() => editor?.chain().focus().redo().run()}
        size="icon"
        title="Wiederholen (⇧⌘Z)"
        type="button"
        variant="ghost"
      >
        <IconArrowForwardUp aria-hidden className="size-4" stroke={1.75} />
      </Button>
      <SaveIndicator saveState={saveState} />
    </div>
  );
}

export type SaveState = "saved" | "saving" | "error";

function SaveIndicator({ saveState }: { saveState: SaveState }) {
  // Der Text springt nicht: `aria-live` liest ihn vor, das Auge sieht eine
  // ruhige Zeile, die nur ihre Farbe und das Icon wechselt.
  const config = {
    saved: { label: "Gespeichert", className: "text-muted-foreground/70" },
    saving: { label: "Speichert…", className: "text-muted-foreground" },
    error: {
      label: "Nicht gespeichert",
      className: "text-destructive",
    },
  }[saveState];

  return (
    <span
      aria-live="polite"
      className={cn(
        "flex items-center gap-1.5 px-2 text-xs tabular-nums",
        config.className,
      )}
    >
      {saveState === "error" ? (
        <IconDeviceFloppy aria-hidden className="size-3.5" stroke={1.75} />
      ) : null}
      {config.label}
    </span>
  );
}
