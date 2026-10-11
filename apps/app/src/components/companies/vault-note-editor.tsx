import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { IconCheck, IconDeviceFloppy, IconLoader2 } from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import { NoteBlockEditor } from "@/components/companies/note-editor/note-block-editor";
import { Skeleton } from "@/components/ui/skeleton";
import {
  brainFileQueryOptions,
  brainSaveNoteMutationOptions,
} from "@/lib/brain/queries";
import {
  blocksToMarkdown,
  markdownToBlocks,
} from "@/lib/companies/notes-markdown";
import type { NoteBlock } from "@/lib/companies/notes";

/**
 * A markdown file from the Brain, edited as a note.
 *
 * This is the same block editor the app's own notes use, pointed at a file that
 * lives on disk instead of in localStorage. Both ends already existed and nothing
 * joined them: `/api/brain/file` read a file, `PUT /api/brain/note` wrote one, and
 * `markdownToBlocks`/`blocksToMarkdown` already convert between the two -- but the
 * vault was only ever rendered through `BrainNoteReader`, which is a reading pane.
 * So a person could see all 2093 files and edit none of them.
 *
 * The round trip is deliberately lossy in one direction and honest about it:
 * `markdownToBlocks` keeps what it understands and leaves the rest as text rather
 * than dropping it, and `blocksToMarkdown` writes back what the editor holds. A
 * file with markup the editor has no block for survives as plain text, which is
 * visible in the editor rather than lost on disk.
 *
 * Saving is explicit rather than autosaved. These are Obsidian's files, which may
 * be open in Obsidian at the same moment; a debounced write would land in
 * Obsidian's window unannounced and lose the conflict on the next sync. A button
 * says who wrote it and when.
 */
export function VaultNoteEditor({
  path,
  onBack,
}: {
  path: string;
  onBack?: () => void;
}) {
  const queryClient = useQueryClient();
  const file = useQuery(brainFileQueryOptions(path));
  const save = useMutation(brainSaveNoteMutationOptions(queryClient));

  const [blocks, setBlocks] = useState<NoteBlock[] | null>(null);
  /** The blocks as they were when the file was loaded -- the baseline for "is this dirty". */
  const baseline = useRef<string>("");
  const [savedAt, setSavedAt] = useState<string | null>(null);

  /*
   * Load once per path.
   *
   * Keyed on the path rather than on `file.data`, because the query refetches after
   * a save and re-deriving the blocks from the refetch would drop the cursor
   * mid-edit. A path change is a different file and does reset.
   */
  useEffect(() => {
    if (!file.data) return;
    const loaded = markdownToBlocks(file.data.content);
    setBlocks(loaded);
    baseline.current = blocksToMarkdown(loaded);
    setSavedAt(null);
    save.reset();
    // `file.data` deliberately not a dependency -- see above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, file.data?.path]);

  const dirty = useMemo(() => {
    if (!blocks) return false;
    return blocksToMarkdown(blocks) !== baseline.current;
  }, [blocks]);

  const onSave = useCallback(() => {
    if (!blocks || !dirty) return;
    save.mutate(
      { path, content: blocksToMarkdown(blocks), mode: "write" },
      {
        onSuccess: () => {
          baseline.current = blocksToMarkdown(blocks);
          setSavedAt(new Date().toLocaleTimeString("de-DE", {
            hour: "2-digit",
            minute: "2-digit",
          }));
        },
      },
    );
  }, [blocks, dirty, path, save]);

  /*
   * Unsaved edits are the one thing here worth losing attention over -- everything
   * else in the app is localStorage and cheap to redo. The editor is a whole
   * document rather than a field, so the browser's beforeunload is the only guard
   * that fires on tab close and on a reload, both of which skip React entirely.
   */
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  if (file.isPending) {
    return (
      <div className="flex flex-col gap-3 pt-6">
        <Skeleton className="h-9 w-2/3" />
        <Skeleton className="h-5 w-1/2" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (file.error) {
    return <p className="p-6 text-sm text-destructive">{file.error.message}</p>;
  }

  if (!file.data) {
    return <p className="p-6 text-sm text-muted-foreground">Datei nicht gefunden.</p>;
  }

  if (file.data.readOnly) {
    return (
      <p className="p-6 text-sm text-muted-foreground">
        Diese Datei ist schreibgeschützt.
      </p>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {/*
       * The bar stays put and the document scrolls under it, so "is this saved" is
       * answerable without scrolling back up through a long note.
       */}
      <div className="flex shrink-0 items-center gap-2 border-b px-4 py-2">
        <IconCheck className="size-3.5 shrink-0 text-muted-foreground" stroke={1.75} />
        <span className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground" title={path}>
          {path}
        </span>

        {save.isError ? (
          <span className="shrink-0 text-xs text-destructive">
            Nicht gespeichert – erneut versuchen
          </span>
        ) : savedAt && !dirty ? (
          <span className="inline-flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
            <IconCheck className="size-3.5" stroke={1.75} />
            Gespeichert
          </span>
        ) : null}

        {onBack ? (
          <Button className="ml-auto shrink-0" onClick={onBack} size="xs" variant="ghost">
            Zurück zu den Notizen
          </Button>
        ) : null}

        <Button
          disabled={!dirty || save.isPending}
          onClick={onSave}
          size="xs"
          variant="outline"
        >
          {save.isPending ? (
            <IconLoader2 className="size-3.5 animate-spin" stroke={1.75} />
          ) : (
            <IconDeviceFloppy className="size-3.5" stroke={1.75} />
          )}
          Speichern
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6 md:px-10">
        {blocks ? (
          <NoteBlockEditor blocks={blocks} onBlocksChange={setBlocks} />
        ) : null}
      </div>
    </div>
  );
}