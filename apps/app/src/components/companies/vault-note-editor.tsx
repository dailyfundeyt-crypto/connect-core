import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { IconBrain, IconCheck, IconLoader2, IconPencil } from "@tabler/icons-react";
import { SparkLogo } from "@/components/brand/spark-logo";
import { useNavigate } from "@tanstack/react-router";
import { NoteBlockEditor } from "@/components/companies/note-editor/note-block-editor";
import { NoteTableOfContents } from "@/components/companies/note-table-of-contents";
import { VaultExportButton } from "@/components/companies/vault-export-button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  brainFileQueryOptions,
  brainKeys,
  brainSaveNoteMutationOptions,
  renameBrainNote,
} from "@/lib/brain/queries";
import {
  blocksToMarkdown,
  markdownToBlocks,
} from "@/lib/companies/notes-markdown";
import { setOpenVaultPath, type NoteBlock } from "@/lib/companies/notes";

/**
 * YAML-Frontmatter (`---\n…\n---`) wird vor dem Block-Editor abgetrennt und Byte fuer Byte
 * unveraendert gehalten. Der Block-Editor kennt kein YAML: frueher wurde `---` zur Trennlinie und
 * jede Zeile zu einem Absatz, Listen verloren die Einrueckung. Beim Speichern wird der Kopf exakt
 * wieder vorangestellt; bearbeitbar ist er nur als Rohtext.
 */
export function splitFrontmatter(text: string): { frontmatter: string; body: string } {
  const match = /^\uFEFF?---[ \t]*\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/.exec(text);
  return match ? { frontmatter: match[0], body: text.slice(match[0].length) } : { frontmatter: "", body: text };
}

function FrontmatterField({ value, onChange }: { value: string; onChange: (next: string) => void }) {
  const [open, setOpen] = useState(false);
  const lines = value.replace(/\r?\n$/, "").split(/\r?\n/).length - 2;
  const valid = splitFrontmatter(value).frontmatter === value;
  return (
    <div className="mb-6" data-testid="frontmatter-field">
      <button
        className="inline-flex items-center gap-1.5 rounded-md border border-neutral-200 bg-neutral-50 px-2 py-0.5 font-mono text-[11px] text-neutral-500 hover:text-neutral-900 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-400 dark:hover:text-white"
        onClick={() => setOpen((o) => !o)}
        type="button"
      >
        Eigenschaften (YAML) · {lines} Zeilen · geschuetzt {open ? "▾" : "▸"}
      </button>
      {open ? (
        <>
          <textarea
            className="mt-2 block w-full rounded-lg border border-neutral-200 bg-neutral-50 p-3 font-mono text-[12px] leading-5 text-neutral-800 outline-none focus:border-neutral-400 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-200"
            onChange={(e) => onChange(e.target.value)}
            rows={Math.min(18, lines + 3)}
            spellCheck={false}
            value={value}
          />
          {!valid ? <p className="mt-1 text-[11px] text-amber-600">Muss mit einer Zeile „---“ beginnen und enden, sonst liest Obsidian die Eigenschaften nicht.</p> : null}
        </>
      ) : null}
    </div>
  );
}

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
  companyId,
  onPathChange,
}: {
  path: string;
  onBack?: () => void;
  /** Firma, in deren Arbeitsbereich die Datei offen ist - fuer "Im Brain zeigen" und zurueck. */
  companyId?: string;
  /** Optionaler Callback, wenn der Pfad durch Umbenennen wechselt. */
  onPathChange?: (newPath: string) => void;
}) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const file = useQuery(brainFileQueryOptions(path));
  const save = useMutation(brainSaveNoteMutationOptions(queryClient));

  const [blocks, setBlocks] = useState<NoteBlock[] | null>(null);
  /** The blocks as they were when the file was loaded -- the baseline for "is this dirty". */
  const baseline = useRef<string>("");
  /** Frontmatter wie geladen, und wie gerade bearbeitet. */
  const fmBase = useRef<string>("");
  const [fm, setFm] = useState("");
  const [savedAt, setSavedAt] = useState<string | null>(null);
  /*
   * Umbenennen direkt im Kopf statt in einem Dialog: Klick auf den Titel, tippen,
   * Enter. Esc bricht ab, ein Klick daneben speichert. Der Server macht die
   * eigentliche Arbeit (Datei umbenennen, Titel schreiben, Links anpassen).
   */
  const [inlineEditing, setInlineEditing] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [renameBusy, setRenameBusy] = useState(false);
  const [renameError, setRenameError] = useState<string | null>(null);
  const renameInputRef = useRef<HTMLInputElement | null>(null);
  const renameCancelled = useRef(false);
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  const currentTitle = useMemo(() => {
    // 1. Frontmatter
    const match = /^---\r?\n([\s\S]*?)\r?\n?---\r?\n?/.exec(fm);
    const fmTitle = match ? /^title:\s*(.*)$/m.exec(match[1])?.[1]?.trim().replace(/^["']|["']$/g, "") : null;
    if (fmTitle) return fmTitle;
    // 2. Erste H1
    if (blocks && blocks[0]?.type === "heading1") {
      const h1Text = blocks[0].spans?.map((s) => s.text).join("").trim();
      if (h1Text) return h1Text;
    }
    // 3. Dateiname
    return path.split("/").pop()?.replace(/\.md$/i, "") ?? "Notiz";
  }, [fm, blocks, path]);
  /*
   * Hidden file input used by the slash menu's "Bild" command. The editor
   * delegates the picker to the parent because the parent owns the document
   * state; we just turn the chosen file into a data URL and append an image
   * block to whatever is open.
   */
  const imageInputRef = useRef<HTMLInputElement | null>(null);

  const handleImagePaste = (_file: File) => {
    imageInputRef.current?.click();
  };

  const handleImageFileChosen: React.ChangeEventHandler<HTMLInputElement> = (event) => {
    const file = event.target.files?.[0];
    // Always reset the input so the same file can be picked again later.
    event.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const url = String(reader.result ?? "");
      if (!url) return;
      setBlocks((current) => {
        if (!current) return current;
        const next: NoteBlock[] = [
          ...current,
          { id: `b-${Date.now().toString(36)}`, type: "image", spans: [], url },
        ];
        return next;
      });
    };
    reader.readAsDataURL(file);
  };

  /*
   * Load once per path.
   *
   * Keyed on the path rather than on `file.data`, because the query refetches after
   * a save and re-deriving the blocks from the refetch would drop the cursor
   * mid-edit. A path change is a different file and does reset.
   */
  useEffect(() => {
    /*
     * Cleared on every path change, before the guard below.
     *
     * This is the second half of the blank panel. Without it, clicking a second
     * file kept `blocks` pointing at the first file's document while the effect
     * waited on `file.data` to catch up, so the sidebar highlighted the new file and
     * the panel showed the old one — which read as "the wrong file opened, and its
     * content is missing". Resetting first makes the panel honest about not having
     * the new file yet, and the skeleton above says so.
     */
    setBlocks(null);
    if (!file.data) return;
    const parts = splitFrontmatter(file.data.content);
    fmBase.current = parts.frontmatter;
    setFm(parts.frontmatter);
    const loaded = markdownToBlocks(parts.body);
    setBlocks(loaded);
    baseline.current = blocksToMarkdown(loaded);
    setSavedAt(null);
    save.reset();
    // `file.data` deliberately not a dependency -- see above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, file.data?.path]);

  const { mutate: saveNote, mutateAsync: saveNoteAsync } = save;

  const startRename = (value: string) => {
    setRenameValue(value);
    setRenameError(null);
    renameCancelled.current = false;
    setInlineEditing(true);
    window.requestAnimationFrame(() => {
      renameInputRef.current?.focus();
      renameInputRef.current?.select();
    });
  };

  const cancelRename = () => {
    renameCancelled.current = true;
    setInlineEditing(false);
    setRenameError(null);
  };

  /*
   * Erst den offenen Stand schreiben, dann umbenennen – und darauf warten.
   *
   * `saveNote` feuert ohne Rückmeldung. Lief der Schreibvorgang noch, während der Server die
   * Datei schon umbenannt hatte, legte er den alten Pfad erneut an: die Notiz existierte danach
   * zweimal, einmal unter dem alten und einmal unter dem neuen Namen. Das Warten schließt das
   * Zeitfenster.
   */
  const commitRename = async () => {
    if (renameCancelled.current) {
      renameCancelled.current = false;
      return;
    }
    if (renameBusy) return;
    const next = renameValue.trim();
    if (!next || next === currentTitle) {
      setInlineEditing(false);
      return;
    }
    setRenameBusy(true);
    setRenameError(null);
    try {
      if (dirty && blocks) {
        await saveNoteAsync({ path, content: fm + blocksToMarkdown(blocks), mode: "write" });
      }
      const result = await renameBrainNote({ path, newTitle: next, renameFile: true });
      setInlineEditing(false);
      void queryClient.invalidateQueries({ queryKey: brainKeys.all });
      if (companyId) setOpenVaultPath(companyId, result.newPath);
      onPathChange?.(result.newPath);
    } catch (error) {
      setRenameError(error instanceof Error ? error.message : "Umbenennen fehlgeschlagen.");
    } finally {
      setRenameBusy(false);
    }
  };

  const dirty = useMemo(() => {
    if (!blocks) return false;
    return blocksToMarkdown(blocks) !== baseline.current || fm !== fmBase.current;
  }, [blocks, fm]);

  // Debounced auto-save. `save.mutate` is a stable function reference from the
  // mutation result, so listing the whole `save` object here would tear this
  // effect down on every render -- which is what made the auto-save timer
  // never fire and the editor trip React's nested-update guard (#185).
  useEffect(() => {
    /* Solange der Titel bearbeitet wird, schreibt nur noch `commitRename` – kein Timer, der
     * nach dem Rename noch unter dem alten Pfad landen und die alte Datei wieder anlegen kann. */
    if (!blocks || !dirty || inlineEditing) return;
    const currentMarkdown = blocksToMarkdown(blocks);
    const timer = setTimeout(() => {
      saveNote(
        { path, content: fm + currentMarkdown, mode: "write" },
        {
          onSuccess: () => {
            baseline.current = currentMarkdown;
            fmBase.current = fm;
            setSavedAt(
              new Date().toLocaleTimeString("de-DE", {
                hour: "2-digit",
                minute: "2-digit",
              }),
            );
          },
        },
      );
    }, 800);

    return () => clearTimeout(timer);
  }, [blocks, dirty, fm, path, saveNote, inlineEditing]);

  // Save on unmount if dirty. `saveNote` is a stable callback returned by
  // React Query, so depending on the whole `save` object is not necessary.
  const blocksRef = useRef(blocks);
  blocksRef.current = blocks;
  const pathRef = useRef(path);
  pathRef.current = path;
  const fmRef = useRef(fm);
  fmRef.current = fm;

  useEffect(() => {
    return () => {
      if (blocksRef.current) {
        const md = blocksToMarkdown(blocksRef.current);
        if (md !== baseline.current || fmRef.current !== fmBase.current) {
          saveNote({ path: pathRef.current, content: fmRef.current + md, mode: "write" });
        }
      }
    };
  }, [saveNote]);

  /*
   * Warn on browser tab close/reload if there are pending unsaved changes.
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
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-white dark:bg-neutral-950">
      <input
        accept="image/*,video/*"
        className="hidden"
        onChange={handleImageFileChosen}
        ref={imageInputRef}
        type="file"
      />

      <div className="flex min-h-0 flex-1 gap-2 overflow-hidden bg-white dark:bg-neutral-950">
        <div
          className="min-h-0 flex-1 overflow-y-auto bg-white dark:bg-neutral-950"
          ref={scrollerRef}
        >
          <div className="mx-auto max-w-[760px] w-full px-6 py-10 pb-40 md:px-12">
          {blocks ? (
            <>
              {/* Document header with clean Notion/Obsidian look */}
              <div className="mb-7">
                {inlineEditing ? (
                  <input
                    aria-label="Notiz umbenennen"
                    className="mb-3 w-full rounded-md border border-rose-300/70 bg-rose-50/60 px-1 py-0.5 text-3xl font-extrabold tracking-tight text-neutral-900 outline-none disabled:opacity-60 sm:text-4xl dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-neutral-100"
                    disabled={renameBusy}
                    onBlur={() => void commitRename()}
                    onChange={(event) => setRenameValue(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        void commitRename();
                      } else if (event.key === "Escape") {
                        event.preventDefault();
                        cancelRename();
                      }
                    }}
                    ref={renameInputRef}
                    spellCheck={false}
                    value={renameValue}
                  />
                ) : blocks[0]?.type !== "heading1" ? (
                  <h1 className="mb-3 text-3xl font-extrabold tracking-tight text-neutral-900 sm:text-4xl dark:text-neutral-100">
                    <button
                      className="group/title flex w-full cursor-text items-center gap-2 text-left font-[inherit] tracking-[inherit]"
                      onClick={() => startRename(currentTitle)}
                      title="Klicken zum Umbenennen"
                      type="button"
                    >
                      <span>{currentTitle}</span>
                      <IconPencil className="size-5 opacity-0 transition-opacity group-hover/title:opacity-40" />
                    </button>
                  </h1>
                ) : null}
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-block rounded border border-rose-200/60 bg-rose-50 px-2.5 py-0.5 font-mono text-[11px] font-semibold uppercase tracking-wider text-rose-500 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-400">
                    {path.split("/").pop() ?? path}
                  </span>
                  {blocks[0]?.type === "heading1" ? (
                    <button
                      aria-label="Titel umbenennen"
                      className="inline-flex items-center justify-center rounded border border-neutral-200 p-1 text-neutral-500 transition hover:border-neutral-400 hover:text-neutral-900 dark:border-neutral-800 dark:text-neutral-400 dark:hover:text-white"
                      onClick={() => startRename(currentTitle)}
                      title="Titel umbenennen"
                      type="button"
                    >
                      <IconPencil size={12} />
                    </button>
                  ) : null}
                  {blocks ? (
                    <VaultExportButton
                      content={fm + (blocks ? blocksToMarkdown(blocks) : "")}
                      path={path}
                    />
                  ) : null}
                  <button
                    className="inline-flex items-center gap-1.5 rounded border border-neutral-200 px-2 py-0.5 text-[11px] font-medium text-neutral-500 transition hover:border-neutral-400 hover:text-neutral-900 dark:border-neutral-800 dark:text-neutral-400 dark:hover:text-white"
                    data-testid="show-in-brain"
                    onClick={() => void navigate({ to: "/brain", search: { focus: path, from: companyId } })}
                    title="Diese Datei im Spark-Graph zeigen (Rechte, Links, Bereich)"
                    type="button"
                  >
                    <SparkLogo size={13} />
                    Im Spark zeigen
                  </button>
                  {save.isPending ? (
                    <span className="inline-flex items-center gap-1 font-mono text-[11px] text-muted-foreground/60">
                      <IconLoader2 className="size-3 animate-spin" />
                      Speichert...
                    </span>
                  ) : dirty ? (
                    <span className="font-mono text-[11px] text-amber-500/80">
                      Ungespeichert...
                    </span>
                  ) : savedAt ? (
                    <span className="inline-flex items-center gap-1 font-mono text-[11px] text-muted-foreground/50">
                      <IconCheck className="size-3 text-emerald-500" stroke={2.5} />
                      Automatisch gespeichert
                    </span>
                  ) : file.data?.mtime ? (
                    <span className="text-[11px] text-muted-foreground/50">
                      {new Date(file.data.mtime).toLocaleDateString("de-DE", {
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric",
                      })}
                    </span>
                  ) : null}
                </div>
                {renameError ? (
                  <p className="mt-2 text-[11px] text-destructive" role="alert">
                    {renameError}
                  </p>
                ) : null}
              </div>

              {fm ? <FrontmatterField onChange={setFm} value={fm} /> : null}
              <NoteBlockEditor
                blocks={blocks}
                onBlocksChange={setBlocks}
                onImagePaste={handleImagePaste}
              />
            </>
          ) : (
            <div className="flex items-center gap-2 py-12 text-sm text-muted-foreground">
              <IconLoader2 className="size-4 animate-spin" stroke={1.75} />
              Datei wird geladen ...
            </div>
          )}
          </div>
        </div>
        {blocks ? <NoteTableOfContents blocks={blocks} containerRef={scrollerRef} /> : null}
      </div>
    </div>
  );
}