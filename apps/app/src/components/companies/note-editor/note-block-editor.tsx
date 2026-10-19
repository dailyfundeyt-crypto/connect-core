import {
  IconBlockquote,
  IconChevronRight,
  IconDots,
  IconH1,
  IconH2,
  IconList,
  IconListCheck,
  IconListNumbers,
  IconPhoto,
  IconPlus,
  IconTable,
  IconToggleLeft,
  IconTrash,
  IconVariable,
} from "@tabler/icons-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { NoteBlock, NoteBlockType, NoteMark, NoteSpan } from "@/lib/companies/notes";
import {
  blockText,
  emptyBlock,
  findBlock,
  insertAfter,
  previousBlock,
  removeBlock,
  updateBlock,
  useHistory,
} from "@/lib/companies/use-note-blocks";
import {
  caretOffsetOf,
  focusBlock,
  InlineEditable,
  spansFromDom,
} from "./inline-editable";
import { FormatBubble } from "./format-bubble";
import { NoteTable } from "./note-table";
import { WikiLinkMenu } from "./wiki-link-menu";
import {
  applyWikiLink,
  detectWikiQuery,
  spansToText,
} from "./wiki-links";
import {
  filterSlashItems,
  groupSlashItems,
  MARKDOWN_TRIGGERS,
  useMenuPosition,
  useSlashNav,
  type SlashItem,
} from "./slash-items";

/**
 * The block editor.
 *
 * One component, because the interesting behaviour is all cross-block: Enter in the middle of a
 * sentence has to split the block and move half the text into the new one, Backspace at the start
 * has to merge with the block above, and the slash menu has to know which block was being typed in.
 * Split into per-block components that would mean lifting all of that state up here anyway and
 * passing it back down.
 */
export function NoteBlockEditor({
  blocks,
  onBlocksChange,
  onImagePaste,
  onOpenNote,
  wikiNotes,
}: {
  blocks: NoteBlock[];
  onBlocksChange: (blocks: NoteBlock[]) => void;
  onImagePaste?: (file: File) => void;
  /** Opens the note a `[[wikilink]]` points at. */
  onOpenNote?: (noteId: string) => void;
  /** Notes offered behind `[[`, already labelled and sorted. */
  wikiNotes?: { id: string; title: string }[];
}) {
  const history = useHistory(blocks);
  const [slash, setSlash] = useState<{ blockId: string; query: string } | null>(null);
  const [wiki, setWiki] = useState<{
    blockId: string;
    start: number;
    query: string;
  } | null>(null);
  const [focus, setFocus] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const caretRef = useRef<Record<string, number>>({});

  /*
   * The editor owns the document while the note is open; the store is written on change. Reading
   * `blocks` back from the parent on every render would reset the caret on every keystroke, so the
   * hook's copy is the one in play and the parent is told afterwards.
   */
  useEffect(() => {
    onBlocksChange(history.blocks);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [history.blocks]);

  const update = history.update;

  const setBlockSpans = useCallback(
    (blockId: string, spans: NoteSpan[], caretOffset: number) => {
      caretRef.current[blockId] = caretOffset;
      update((current) => updateBlock(current, blockId, { spans }), blockId);
    },
    [update, history.blocks],
  );

  /** Any field that is not the text: checked, collapsed, emoji, url, table. */
  const patchBlock = useCallback(
    (blockId: string, patch: Partial<NoteBlock>) => {
      update((current) => updateBlock(current, blockId, patch), null);
    },
    [update, history.blocks],
  );

  const focusAfter = useCallback((blockId: string, offset?: number) => {
    /*
     * A frame's delay, so React has committed the new block before focus moves into it. Focusing an
     * element that does not exist yet is silently ignored, which is why this is a frame and not a
     * microtask.
     */
    requestAnimationFrame(() => focusBlock(blockId, offset));
  }, []);

  const slashItems = useMemo(
    () => filterSlashItems(slash?.query ?? ""),
    [slash?.query],
  );
  const slashGroups = useMemo(() => groupSlashItems(slashItems), [slashItems]);
  const flatItems = useMemo(() => slashGroups.flatMap(([, items]) => items), [slashGroups]);
  const slashNav = useSlashNav(flatItems.length);
  const slashPos = useMenuPosition(slash !== null, slash?.blockId ?? null);

  /* ------------------------------------------------------------- slash */

  /* ------------------------------------------------------- text input routing */

  /*
   * One handler for every keystroke, because `/` and `[[` can both be open and only one of them is
   * ever wanted at a time.
   *
   * The slash menu wins on a tie: it only opens on a leading slash, and a leading `[[` cannot
   * start with `/`, so the two never actually collide — checking slash first just keeps the
   * decision in one readable place rather than spread across two callbacks.
   */
  const handleTextInput = useCallback(
    (blockId: string, element: HTMLElement) => {
      const text = element.textContent ?? "";
      const caret = caretOffsetOf(element);

      if (text.startsWith("/")) {
        setWiki((current) => (current?.blockId === blockId ? null : current));
        setSlash({ blockId, query: text.slice(1, caret) });
        return;
      }

      const found = detectWikiQuery(text, caret);
      if (found) {
        setSlash((current) => (current?.blockId === blockId ? null : current));
        setWiki({ blockId, start: found.start, query: found.query });
        return;
      }

      setSlash((current) => (current?.blockId === blockId ? null : current));
      setWiki((current) => (current?.blockId === blockId ? null : current));
    },
    [],
  );

  const openSlash = handleTextInput;

  const pickSlashItem = useCallback(
    (item: SlashItem) => {
      if (!slash) return;
      const block = findBlock(history.blocks, slash.blockId);
      if (!block) return;

      if (item.type === "image") {
        onImagePaste?.(new File([], ""));
        setSlash(null);
        return;
      }

      if (item.id === "webclip") {
        /*
         * Pulls a remote page on the user's behalf and inserts a callout with
         * the title and a Markdown preview. The server endpoint is what
         * shields the browser from CORS, and the user can edit the result
         * before saving — a webclip is a starting point, not a verbatim
         * copy. If the URL is empty or the request fails, the slash menu
         * stays open so the user can pick something else.
         */
        const url = window.prompt("URL für Webclip", "https://");
        if (!url) return;
        if (!/^https?:\/\//i.test(url)) {
          window.alert("Bitte eine URL mit http:// oder https:// angeben.");
          return;
        }
        setSlash(null);
        void (async () => {
          try {
            const response = await fetch(`/api/brain/webclip?url=${encodeURIComponent(url)}`);
            const data = (await response.json()) as {
              ok: boolean;
              title?: string;
              markdown?: string;
              siteName?: string;
              error?: string;
            };
            const replacement: NoteBlock = data.ok
              ? {
                  ...emptyBlock("callout"),
                  emoji: "🔗",
                  spans: [
                    { text: data.title || url, marks: [{ type: "bold" }] },
                    { text: ` — ${data.siteName || url}` },
                    { text: "\n" },
                    { text: url, marks: [{ type: "link", href: url }] },
                  ],
                  children: data.markdown
                    ? [
                        {
                          ...emptyBlock("quote"),
                          spans: [{ text: data.markdown.slice(0, 800) }],
                        },
                      ]
                    : [],
                }
              : {
                  ...emptyBlock("paragraph"),
                  spans: [
                    { text: `Webclip fehlgeschlagen: ${data.error ?? "Unbekannter Fehler"} (${url})` },
                  ],
                };
            update((current) => replaceBlock(current, block.id, replacement), null);
            focusAfter(replacement.id, 0);
          } catch (err) {
            window.alert(`Webclip fehlgeschlagen: ${err instanceof Error ? err.message : String(err)}`);
          }
        })();
        return;
      }

      const replacement = emptyBlock(item.type ?? "paragraph");
      update((current) => replaceBlock(current, block.id, replacement), null);
      setSlash(null);
      focusAfter(replacement.id, 0);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [slash, history.blocks, onImagePaste, focusAfter],
  );
  /* ---------------------------------------------------------- wikilinks */

  /**
   * Turns the typed `[[query` into a real link span.
   *
   * The text between the brackets is replaced, not the whole block, so a link in the middle of a
   * sentence keeps the sentence. The caret is then placed after the inserted title, which is what
   * lets the user keep typing straight on.
   */
  const pickWiki = useCallback(
    (candidate: { id: string; title: string }) => {
      if (!wiki) return;
      const block = findBlock(history.blocks, wiki.blockId);
      if (!block) {
        setWiki(null);
        return;
      }
      const text = spansToText(block.spans ?? []);
      // Everything from the `[[` up to the caret is what gets replaced; `]]` may not be typed yet.
      const length = Math.max(0, Math.min(text.length, caretRef.current[block.id] ?? 0) - wiki.start);
      const result = applyWikiLink(
        block.spans ?? [],
        wiki.start,
        length,
        candidate.title,
        candidate.id,
      );
      caretRef.current[block.id] = result.caret;
      update((current) => updateBlock(current, block.id, { spans: result.spans }), block.id);
      setWiki(null);
      focusAfter(block.id, result.caret);
    },
    [wiki, history.blocks, update, focusAfter],
  );

  /*
   * A click on a rendered wikilink opens that note.
   *
   * Bound on the container with capture because the link lives inside a `contentEditable`: a normal
   * click would place the caret there and the browser would follow the `#note-` fragment, which
   * changes the URL for a link that is not a route.
   */
  const handleWikiClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (!onOpenNote) return;
      const target = (event.target as HTMLElement).closest<HTMLElement>("[data-wikilink]");
      const noteId = target?.getAttribute("data-wikilink");
      if (!noteId) return;
      event.preventDefault();
      event.stopPropagation();
      onOpenNote(noteId);
    },
    [onOpenNote],
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>, block: NoteBlock) => {
      /*
       * Read the text from the DOM, not from the block.
       *
       * The block in props is one keystroke behind: React has not re-rendered between the browser
       * inserting a character and this handler running, so `"#"` typed a moment ago is not in it
       * yet. Reading the element is what makes the Markdown triggers fire on the space that
       * follows, and it is the same source of truth the caret comes from.
       */
      const element = event.currentTarget ?? (event.target as HTMLElement);
      const text = element.textContent ?? "";
      const selection = window.getSelection();
      const collapsed = !selection || selection.isCollapsed;
      const caret = caretOffsetOf(element);

      // The slash menu owns the keyboard while it is open.
      if (slash?.blockId === block.id) {
        if (event.key === "ArrowDown") {
          event.preventDefault();
          slashNav.move(1);
          return;
        }
        if (event.key === "ArrowUp") {
          event.preventDefault();
          slashNav.move(-1);
          return;
        }
        if (event.key === "Escape") {
          event.preventDefault();
          setSlash(null);
          return;
        }
        if (event.key === "Enter") {
          /*
           * Enter picks the highlighted item, and never splits the block.
           *
           * Without this, choosing "Tabelle" would leave a paragraph behind holding the text "/tab"
           * and insert the table on top of it — the menu would look like it worked while producing a
           * document with the command still typed into it.
           */
          event.preventDefault();
          const item = slashItems[slashNav.index];
          if (item) {
            pickSlashItem(item);
          } else {
            setSlash(null);
          }
          return;
        }
      }

      if (event.key === "Enter") {
        // Shift+Enter is a soft line break inside the block, not a new block.
        if (event.shiftKey) return;
        event.preventDefault();

        // A Markdown trigger fires when the block holds only the trigger and nothing else.
        const trigger = MARKDOWN_TRIGGERS.find((candidate) =>
          candidate.pattern.test(text),
        );
        if (trigger && collapsed) {
          const replacement = emptyBlock(trigger.type);
          update((current) => replaceBlock(current, block.id, replacement), null);
          focusAfter(replacement.id, 0);
          return;
        }

        /*
         * Split on the live spans, not `block.spans`: the DOM is one keystroke ahead, and splitting
         * a stale copy would drop the character typed just before Enter.
         */
        const liveSpans = spansFromDom(element).filter((s) => s.text.length > 0);
        const split = splitSpans(liveSpans, block, caret);
        update((current) => splitBlockAt(current, block.id, split, liveSpans, caret), null);
        focusAfter(split.id, 0);
        return;
      }

      if (event.key === "Backspace") {
        const atStart = caret === 0;

        // Backspace in an empty block removes it and parks the caret at the end of the one above.
        if (atStart && text.length === 0) {
          const above = previousBlock(history.blocks, block.id);
          update((current) => removeBlock(current, block.id).blocks, null);
          if (above) focusAfter(above.id, blockText(above).length);
          return;
        }

        // Backspace at the very start merges into the block above, the way every editor behaves.
        if (atStart && text.length > 0 && collapsed) {
          const above = previousBlock(history.blocks, block.id);
          if (!above) return;
          const aboveId = above.id;
          const live = spansFromDom(element).filter((s) => s.text.length > 0);
          update((current) => {
            const merged = updateBlock(current, aboveId, {
              spans: [...(above.spans ?? []), ...live],
              // Merging two different block types produces a paragraph: a bullet swallowed by a
              // heading must not stay a heading, and the reverse is just as wrong.
              type: above.type === block.type ? above.type : "paragraph",
            });
            return removeBlock(merged, block.id).blocks;
          }, null);
          focusAfter(aboveId, blockText(above).length);
          return;
        }
        return;
      }

      // Tab indents a list item, Shift+Tab outdents it.
      if (event.key === "Tab" && LIST_TYPES.includes(block.type)) {
        event.preventDefault();
        const step = (block.indent ?? 0) + (event.shiftKey ? -1 : 1);
        update(
          (current) =>
            updateBlock(current, block.id, { indent: Math.max(0, step) }),
          null,
        );
        focusAfter(block.id, caret);
        return;
      }

      // Markdown shortcut: "#" then space becomes a heading, without opening the slash menu.
      if (event.key === " " && collapsed) {
        const trigger = MARKDOWN_TRIGGERS.find((candidate) =>
          candidate.pattern.test(text),
        );
        if (trigger) {
          event.preventDefault();
          const replacement = emptyBlock(trigger.type);
          update((current) => replaceBlock(current, block.id, replacement), null);
          focusAfter(replacement.id, 0);
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [history.blocks, slash, caretRef, focusAfter, update],
  );


  /* ------------------------------------------------------------- blocks */

  const convert = useCallback(
    (blockId: string, type: NoteBlockType) => {
      const block = findBlock(history.blocks, blockId);
      if (!block) return;
      const patch: Partial<NoteBlock> = { type };
      if (type === "todo" && block.checked === undefined) patch.checked = false;
      if (type === "toggle" && block.children === undefined) {
        patch.children = [];
        patch.collapsed = false;
      }
      if (type === "callout" && block.emoji === undefined) {
        patch.emoji = "💡";
        patch.children = [];
      }
      if (type === "table" && !block.table) {
        patch.table = { headerRow: true, rows: [["", "", ""], ["", "", ""]] };
      }
      if (type === "audio") patch.url = "";
      if (type === "iframe") {
        patch.url = "";
        patch.iframeProvider = "generic";
        patch.iframeTitle = "";
      }
      if (type === "columns") {
        patch.columns = [
          { width: 1, blocks: [emptyBlock("paragraph")] },
          { width: 1, blocks: [emptyBlock("paragraph")] },
        ];
        patch.spans = [];
      }
      update((current) => updateBlock(current, blockId, patch), null);
    },
    [update, history.blocks],
  );

  const moveBlock = useCallback(
    (blockId: string, direction: -1 | 1) => {
      update((current) => {
        const index = current.findIndex((b) => b.id === blockId);
        const target = index + direction;
        if (index < 0 || target < 0 || target >= current.length) return current;
        const next = [...current];
        [next[index], next[target]] = [next[target], next[index]];
        return next;
      }, null);
      focusAfter(blockId);
    },
    [update, history.blocks, focusAfter],
  );

  const duplicate = useCallback(
    (blockId: string) => {
      const block = findBlock(history.blocks, blockId);
      if (!block) return;
      const copy = { ...block, id: `${block.id}-copy-${Date.now().toString(36)}` };
      update((current) => insertAfter(current, blockId, copy), null);
      focusAfter(copy.id);
    },
    [update, history.blocks, focusAfter],
  );

  const remove = useCallback(
    (blockId: string) => {
      update((current) => removeBlock(current, blockId).blocks, null);
      const above = previousBlock(history.blocks, blockId);
      if (above) focusAfter(above.id, blockText(above).length);
    },
    [update, history.blocks, focusAfter],
  );

  const addAfter = useCallback(
    (blockId: string) => {
      const block = emptyBlock("paragraph");
      update((current) => insertAfter(current, blockId, block), null);
      focusAfter(block.id, 0);
    },
    [update, history.blocks, focusAfter],
  );

  const onDrop = useCallback(
    (targetId: string) => {
      if (!dragId || dragId === targetId) return;
      const moving = dragId;
      update((current) => {
        const from = current.findIndex((b) => b.id === moving);
        const to = current.findIndex((b) => b.id === targetId);
        if (from < 0 || to < 0) return current;
        const next = [...current];
        const [moved] = next.splice(from, 1);
        next.splice(to, 0, moved);
        return next;
      }, null);
      setDragId(null);
      setDropTarget(null);
    },
    [dragId, update, history.blocks],
  );

  return (
    <div className="flex flex-col" onClick={handleWikiClick} role="presentation">
      {history.blocks.map((block, index) => (
        <BlockRow
          block={block}
          dragId={dragId}
          dropTarget={dropTarget}
          focus={focus}
          history={history}
          index={index}
          key={block.id}
          onAdd={addAfter}
          onUpdate={update}
          onConvert={convert}
          onDragStart={setDragId}
          onDrop={onDrop}
          onDropTarget={setDropTarget}
          onDuplicate={duplicate}
          onFocus={setFocus}
          onImagePaste={onImagePaste}
          onKeyDown={handleKeyDown}
          onMove={moveBlock}
          onTextInput={handleTextInput}
          onPatchBlock={patchBlock}
          onRemove={remove}
          onSetSpans={setBlockSpans}
          onToggle={setSlash}
          onChangeTable={(blockId, table) =>
            update((current) => updateBlock(current, blockId, { table }), blockId)
          }
          slashBlockId={slash?.blockId}
          slashItems={flatItems}
          slashNavIndex={slashNav.index}
          slashPos={slashPos}
          slashQuery={slash?.query ?? ""}
          onPickSlash={pickSlashItem}
        />
      ))}

      {/* Clicking below the last block continues the document rather than doing nothing. */}
      <button
        className="group/tail mt-1 flex h-8 items-center gap-2 rounded-lg px-2 text-left text-sm text-neutral-300 transition-colors hover:bg-neutral-50"
        onClick={() => {
          const last = history.blocks[history.blocks.length - 1];
          if (!last || blockText(last).length > 0 || last.type !== "paragraph") {
            addAfter(last?.id ?? null);
          } else {
            focusAfter(last.id);
          }
        }}
        type="button"
      >
        <IconPlus className="size-4 opacity-0 transition-opacity group-hover/tail:opacity-100" stroke={1.75} />
        Weiterer Block
      </button>

      {/*
        The `[[` picker. Rendered here rather than inside a block because it is positioned against
        the block in the viewport — putting it in the block would move it when that block scrolls.
      */}
      {wiki && wikiNotes && wikiNotes.length > 0 ? (
        <WikiLinkMenu
          anchorId={wiki.blockId}
          currentNoteId=""
          labelOf={(candidate) => candidate.title}
          notes={wikiNotes}
          onClose={() => setWiki(null)}
          onPick={pickWiki}
          query={wiki.query}
        />
      ) : null}

      {/* Keyboard-only block move: Alt+Arrow. Not a visible control on purpose. */}
      <span className="sr-only" aria-live="polite">
        {focus ? `Block ${focus}` : ""}
      </span>
    </div>
  );
}

/* ------------------------------------------------------------- one block */

function BlockRow({
  block,
  dragId,
  dropTarget,
  focus,
  history,
  index,
  onAdd,
  onChangeTable,
  onUpdate,
  onConvert,
  onDragStart,
  onDrop,
  onDropTarget,
  onDuplicate,
  onFocus,
  onImagePaste,
  onKeyDown,
  onMove,
  onTextInput,
  onPatchBlock,
  onPickSlash,
  onRemove,
  onSetSpans,
  onToggle,
  slashBlockId,
  slashItems,
  slashNavIndex,
  slashPos,
  slashQuery,
}: {
  block: NoteBlock;
  dragId: string | null;
  dropTarget: string | null;
  focus: string | null;
  history: ReturnType<typeof useHistory>;
  index: number;
  onAdd: (blockId: string) => void;
  onChangeTable: (blockId: string, table: NonNullable<NoteBlock["table"]>) => void;
  onUpdate: (recipe: (current: NoteBlock[]) => NoteBlock[], key?: string | null) => void;
  onConvert: (blockId: string, type: NoteBlockType) => void;
  onDragStart: (id: string | null) => void;
  onDrop: (id: string) => void;
  onDropTarget: (id: string | null) => void;
  onDuplicate: (id: string) => void;
  onFocus: (id: string | null) => void;
  onImagePaste?: (file: File) => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLDivElement>, block: NoteBlock) => void;
  onMove: (id: string, direction: -1 | 1) => void;
  onTextInput: (blockId: string, element: HTMLElement) => void;
  onPatchBlock: (blockId: string, patch: Partial<NoteBlock>) => void;
  onPickSlash: (item: SlashItem) => void;
  onRemove: (id: string) => void;
  onSetSpans: (blockId: string, spans: NoteSpan[], caret: number) => void;
  onToggle: (slash: { blockId: string; query: string } | null) => void;
  slashBlockId?: string;
  slashItems: SlashItem[];
  slashNavIndex: number;
  slashPos: { top: number; left: number } | null;
  slashQuery: string;
}) {
  const indent = block.indent ?? 0;
  const text = blockText(block);
  const isSlashOpen = slashBlockId === block.id;

  const spans = useMemo(
    () => (block.spans ?? []).filter((span) => span.text.length > 0),
    [block.spans],
  );

  return (
    <div
      className={cn(
        "group/block relative flex items-start gap-1 rounded-md px-1 transition-colors",
        dropTarget === block.id && "bg-sky-50",
      )}
      data-block-row={block.id}
      draggable
      onDragEnd={() => {
        onDragStart(null);
        onDropTarget(null);
      }}
      onDragOver={(event) => {
        event.preventDefault();
        onDropTarget(block.id);
      }}
      onDragStart={() => onDragStart(block.id)}
      onDrop={(event) => {
        event.preventDefault();
        onDrop(block.id);
      }}
      style={indent > 0 ? { marginLeft: `${indent * 24}px` } : undefined}
    >
      {/* The rail: plus to insert, grip to drag. Appears on hover, like Notion's. */}
      <div className="flex w-12 shrink-0 items-center gap-0.5 pt-1 opacity-0 transition-opacity group-hover/block:opacity-100">
        <button
          aria-label="Block darunter einfügen"
          className="flex size-5 items-center justify-center rounded text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
          onClick={() => onAdd(block.id)}
          title="Block darunter"
          type="button"
        >
          <IconPlus className="size-3.5" stroke={1.75} />
        </button>
        <button
          aria-label="Block verschieben"
          className="flex size-5 cursor-grab items-center justify-center rounded text-neutral-300 hover:bg-neutral-100"
          title="Ziehen zum Verschieben"
          type="button"
        >
          <IconDots className="size-3.5" stroke={1.75} />
        </button>
      </div>

      <div className="min-w-0 flex-1">
        <BlockContent
          block={block}
          dragId={dragId}
          dropTarget={dropTarget}
          focus={focus}
          history={history}
          index={index}
          onAdd={onAdd}
          onChangeTable={onChangeTable}
          onConvert={onConvert}
          onDragStart={onDragStart}
          onDrop={onDrop}
          onDropTarget={onDropTarget}
          onDuplicate={onDuplicate}
          onFocus={onFocus}
          onImagePaste={onImagePaste}
          onKeyDown={onKeyDown}
          onMove={onMove}
          onTextInput={onTextInput}
          onPatchBlock={onPatchBlock}
          onPickSlash={onPickSlash}
          onRemove={onRemove}
          onSetSpans={onSetSpans}
          onToggle={onToggle}
          onUpdate={onUpdate}
          slashBlockId={slashBlockId}
          slashItems={slashItems}
          slashNavIndex={slashNavIndex}
          slashPos={slashPos}
          slashQuery={slashQuery}
          spans={spans}
          total={history.blocks.length}
        />

        {/* Toggle children render beneath the parent, hidden when collapsed. */}
        {block.children?.length ? (
          <div className={cn(block.collapsed && "hidden")}>
            {block.children.map((child) => (
              <BlockRow
                block={child}
                history={history}
                index={index}
                key={child.id}
                {...{
                  dragId,
                  dropTarget,
                  focus,
                  onAdd,
                  onChangeTable,
                  onUpdate,
                  onConvert,
                  onDragStart,
                  onDrop,
                  onDropTarget,
                  onDuplicate,
                  onFocus,
                  onImagePaste,
                  onKeyDown,
                  onMove,
                  onTextInput,
                  onPatchBlock,
                  onPickSlash,
                  onRemove,
                  onSetSpans,
                  onToggle,
                  slashBlockId,
                  slashItems,
                  slashNavIndex,
                  slashPos,
                  slashQuery,
                }}
              />
            ))}
          </div>
        ) : null}
      </div>

      <BlockMenu
        block={block}
        onConvert={onConvert}
        onDuplicate={onDuplicate}
        onMove={onMove}
        onRemove={onRemove}
      />

      {isSlashOpen ? (
        <SlashMenu
          index={slashNavIndex}
          items={slashItems}
          onPick={onPickSlash}
          onQueryChange={(query) => onToggle({ blockId: block.id, query })}
          position={slashPos}
          query={slashQuery}
        />
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------- block content */

function BlockContent({
  block,
  dragId,
  dropTarget,
  focus,
  history,
  index,
  onAdd,
  onChangeTable,
  onUpdate,
  onConvert,
  onDragStart,
  onDrop,
  onDropTarget,
  onDuplicate,
  onFocus,  onImagePaste,
  onKeyDown,
  onMove,
  onTextInput,
  onPatchBlock,
  onPickSlash,
  onRemove,
  onSetSpans,
  onToggle,
  slashBlockId,
  slashItems,
  slashNavIndex,
  slashPos,
  slashQuery,
  spans,
  total,
}: {
  block: NoteBlock;
  dragId: string | null;
  dropTarget: string | null;
  focus: string | null;
  history: ReturnType<typeof useHistory>;
  index: number;
  onAdd: (blockId: string) => void;
  onChangeTable: (blockId: string, table: NonNullable<NoteBlock["table"]>) => void;
  onUpdate: (recipe: (current: NoteBlock[]) => NoteBlock[], key?: string | null) => void;
  onConvert: (blockId: string, type: NoteBlockType) => void;
  onDragStart: (id: string | null) => void;
  onDrop: (id: string) => void;
  onDropTarget: (id: string | null) => void;
  onDuplicate: (id: string) => void;
  onFocus: (id: string | null) => void;
  onImagePaste?: (file: File) => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLDivElement>, block: NoteBlock) => void;
  onMove: (id: string, direction: -1 | 1) => void;
  onTextInput: (blockId: string, element: HTMLElement) => void;
  onPatchBlock: (blockId: string, patch: Partial<NoteBlock>) => void;
  onPickSlash: (item: SlashItem) => void;
  onRemove: (id: string) => void;
  onSetSpans: (blockId: string, spans: NoteSpan[], caret: number) => void;
  onToggle: (slash: { blockId: string; query: string } | null) => void;
  slashBlockId?: string;
  slashItems: SlashItem[];
  slashNavIndex: number;
  slashPos: { top: number; left: number } | null;
  slashQuery: string;
  spans: NoteSpan[];
  total: number;
}) {
  const editable = (extra?: React.KeyboardEventHandler<HTMLDivElement>) => (
    <InlineEditable
      blockId={block.id}
      onChange={(next, caret) => onSetSpans(block.id, next, caret)}
      onFocus={() => onFocus(block.id)}
      onKeyDown={(event) => {
        onKeyDown(event, block);
      }}
      onSlashInput={(element) => onTextInput(block.id, element)}
      placeholder={placeholderFor(block.type)}
      spans={spans}
      {...extra}
    />
  );

  switch (block.type) {
    case "heading1":
      return (
        <h1 className="mt-7 mb-2.5 text-[1.85rem] sm:text-[2.1rem] font-bold leading-tight tracking-tight text-neutral-900 dark:text-neutral-100">
          {editable()}
        </h1>
      );
    case "heading2":
      return (
        <h2 className="mt-5 mb-2 text-[1.4rem] sm:text-[1.55rem] font-semibold leading-snug tracking-tight text-neutral-900 dark:text-neutral-100">
          {editable()}
        </h2>
      );
    case "heading3":
      return (
        <h3 className="mt-4 mb-1.5 text-[1.15rem] sm:text-[1.25rem] font-semibold leading-snug text-neutral-900 dark:text-neutral-100">
          {editable()}
        </h3>
      );
    case "bullet":
      return (
        <div className="flex items-start gap-2.5 py-1 text-[15.5px] leading-[1.78] text-neutral-800 dark:text-neutral-200">
          <span className="mt-[9px] size-1.5 shrink-0 rounded-full bg-neutral-600 dark:bg-neutral-400" />
          {editable()}
        </div>
      );
    case "number":
      return <ListNumbered block={block} spans={spans} onKeyDown={onKeyDown} onSetSpans={onSetSpans} onTextInput={onTextInput} />;
    case "todo":
      return (
        <div className="flex items-start gap-2.5 py-1 text-[15.5px] leading-[1.78] text-neutral-800 dark:text-neutral-200">
          <input
            aria-label="Aufgabe erledigt"
            checked={block.checked ?? false}
            className="mt-1 size-4 shrink-0 rounded accent-neutral-900 dark:accent-neutral-100"
            onChange={(event) =>
              onPatchBlock(block.id, { checked: event.target.checked })
            }
            type="checkbox"
          />
          <div className={cn("min-w-0 flex-1", block.checked && "line-through text-neutral-400 dark:text-neutral-500")}>
            {editable()}
          </div>
        </div>
      );
    case "quote":
      return (
        <blockquote className="my-2.5 border-l-[3px] border-neutral-300 dark:border-neutral-700 py-1 pl-4 text-[15.5px] italic text-neutral-600 dark:text-neutral-400 leading-[1.78]">
          {editable()}
        </blockquote>
      );
    case "callout": {
      const tone = block.color ?? undefined;
      return (
        <div
          className="my-3 overflow-hidden rounded-xl border border-neutral-200/70 bg-neutral-50/90 dark:border-neutral-800 dark:bg-neutral-900/80 text-[15px] leading-[1.7] shadow-xs"
          style={tone ? { backgroundColor: tone } : undefined}
        >
          <div className="flex items-start gap-3 p-3.5">
            <button
              aria-label="Emoji ändern"
              className="shrink-0 text-[18px] leading-none pt-0.5 transition-transform hover:scale-110"
              onClick={() => {
                const next = window.prompt("Emoji", block.emoji ?? "💡");
                if (next) onPatchBlock(block.id, { emoji: next });
              }}
              type="button"
            >
              {block.emoji ?? "💡"}
            </button>
            <div className="min-w-0 flex-1">
              <InlineEditable
                blockId={block.id}
                onChange={(next, caret) => onSetSpans(block.id, next, caret)}
                onFocus={() => onFocus(block.id)}
                onKeyDown={(event) => onKeyDown(event, block)}
                placeholder="Hinweis"
                spans={spans}
              />
            </div>
          </div>
          {block.children?.length ? (
            <div
              className={cn(
                "border-t border-black/5 px-3 pb-3 dark:border-white/5",
                block.collapsed && "hidden",
              )}
            >
              {block.children.map((child) => (
                <BlockRow
                  block={child}
                  index={0}
                  key={child.id}
                  dragId={dragId}
                  dropTarget={dropTarget}
                  focus={focus}
                  history={history}
                  onAdd={onAdd}
                  onChangeTable={onChangeTable}
                  onUpdate={onUpdate}
                  onConvert={onConvert}
                  onDragStart={onDragStart}
                  onDrop={onDrop}
                  onDropTarget={onDropTarget}
                  onDuplicate={onDuplicate}
                  onFocus={onFocus}
                  onImagePaste={onImagePaste}
                  onKeyDown={onKeyDown}
                  onMove={onMove}
                  onTextInput={onTextInput}
                  onPatchBlock={onPatchBlock}
                  onPickSlash={onPickSlash}
                  onRemove={onRemove}
                  onSetSpans={onSetSpans}
                  onToggle={onToggle}
                  slashBlockId={slashBlockId}
                  slashItems={slashItems}
                  slashNavIndex={slashNavIndex}
                  slashPos={slashPos}
                  slashQuery={slashQuery}
                />
              ))}
            </div>
          ) : (
            <button
              className="ml-12 mr-4 mb-3 inline-flex items-center gap-1 rounded-md border border-dashed border-neutral-300/70 px-2 py-0.5 text-[11px] text-neutral-500 hover:border-neutral-400 dark:border-neutral-700"
              onClick={() => onPatchBlock(block.id, { children: [emptyBlock("paragraph")] })}
              type="button"
            >
              <IconPlus className="size-3" stroke={1.75} /> Inhalt
            </button>
          )}
        </div>
      );
    }
    case "toggle":
      return (
        <div className="py-1 text-[15.5px] leading-[1.78]">
          <div className="flex items-start gap-2">
            <button
              aria-label={block.collapsed ? "Aufklappen" : "Zuklappen"}
              className="mt-1 shrink-0 text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100"
              onClick={() => onPatchBlock(block.id, { collapsed: !block.collapsed })}
              type="button"
            >
              <IconChevronRight
                className={cn("size-4 transition-transform", !block.collapsed && "rotate-90")}
                stroke={1.75}
              />
            </button>
            {editable()}
          </div>
        </div>
      );
    case "code":
      return (
        <pre className="my-3 overflow-x-auto rounded-xl bg-neutral-100/80 dark:bg-neutral-900/90 p-4 font-mono text-[13.5px] leading-relaxed border border-neutral-200/50 dark:border-neutral-800">
          <InlineEditable
            blockId={block.id}
            onChange={(next, caret) => onSetSpans(block.id, next, caret)}
            onFocus={() => onFocus(block.id)}
            onKeyDown={(event) => onKeyDown(event, block)}
            placeholder="Code"
            spans={spans}
          />
        </pre>
      );
    case "divider": {
      if (!block.dividerStyle && !block.dividerAccent) {
        return <hr className="my-6 border-neutral-200/80 dark:border-neutral-800" />;
      }
      const style = block.dividerStyle ?? "solid";
      const accent = block.dividerAccent ?? "var(--border)";
      const border =
        style === "dashed"
          ? "dashed"
          : style === "dotted"
            ? "dotted"
            : style === "double"
              ? "double"
              : "solid";
      return (
        <hr
          className="my-6 border-0 border-t-2"
          style={{
            borderTopStyle: border,
            borderTopColor: accent,
            borderTopWidth: style === "double" ? "6px" : "2px",
          }}
        />
      );
    }
    case "image":
      return (
        <ImageBlock
          block={block}
          onPatch={(patch) => onPatchBlock(block.id, patch)}
        />
      );
    case "table":
      return (
        <NoteTable
          block={block}
          onChange={(table) => onChangeTable(block.id, table)}
        />
      );
    case "columns":
      return (
        <ColumnsBlock
          block={block}
          history={history}
          onAdd={onAdd}
          onChangeTable={onChangeTable}
          onConvert={onConvert}
          onDragStart={onDragStart}
          onDrop={onDrop}
          onDropTarget={onDropTarget}
          onDuplicate={onDuplicate}
          onFocus={onFocus}
          onImagePaste={onImagePaste}
          onKeyDown={onKeyDown}
          onMove={onMove}
          onTextInput={onTextInput}
          onPatchBlock={onPatchBlock}
          onPickSlash={onPickSlash}
          onRemove={onRemove}
          onSetSpans={onSetSpans}
          onToggle={onToggle}
          onUpdate={onUpdate}
          dragId={dragId}
          dropTarget={dropTarget}
          focus={focus}
          slashBlockId={slashBlockId}
          slashItems={slashItems}
          slashNavIndex={slashNavIndex}
          slashPos={slashPos}
          slashQuery={slashQuery}
        />
      );
    case "audio":
      return (
        <AudioBlock
          block={block}
          onPatch={(patch) => onPatchBlock(block.id, patch)}
        />
      );
    case "iframe":
      return (
        <IframeBlock
          block={block}
          onPatch={(patch) => onPatchBlock(block.id, patch)}
        />
      );
    default:
      return (
        <div className="py-1 text-[15.5px] sm:text-[16px] leading-[1.8] text-neutral-800 dark:text-neutral-200 tracking-[-0.003em]">
          {editable()}
        </div>
      );
  }
}

/** Numbered list, numbered from its position among consecutive numbered siblings. */
function ListNumbered({
  block,
  onKeyDown,
  onTextInput,
  onSetSpans,
  spans,
}: {
  block: NoteBlock;
  onKeyDown: (event: React.KeyboardEvent<HTMLDivElement>, block: NoteBlock) => void;
  onTextInput: (blockId: string, element: HTMLElement) => void;
  onSetSpans: (blockId: string, spans: NoteSpan[], caret: number) => void;
  spans: NoteSpan[];
}) {
  return (
    <div className="flex items-start gap-2.5 py-1 text-[15.5px] leading-[1.78] text-neutral-800 dark:text-neutral-200">
      <span className="mt-[2px] min-w-[1.2rem] shrink-0 text-right text-[15px] font-medium text-neutral-400">
        1.
      </span>
      <InlineEditable
        blockId={block.id}
        onChange={(next, caret) => onSetSpans(block.id, next, caret)}
        onKeyDown={(event) => {
          onKeyDown(event, block);
        }}
        onSlashInput={(element) => onTextInput(block.id, element)}
        placeholder=""
        spans={spans}
      />
    </div>
  );
}

/** Resolves an image URL or Obsidian vault filename into a usable HTTP src. */
export function resolveNoteAssetUrl(url: string | undefined): string {
  if (!url) return "";
  const trimmed = url.trim();
  if (
    trimmed.startsWith("http://") ||
    trimmed.startsWith("https://") ||
    trimmed.startsWith("data:") ||
    trimmed.startsWith("/api/")
  ) {
    return trimmed;
  }
  if (trimmed.startsWith("https://brain.local/asset/")) {
    const raw = trimmed.slice("https://brain.local/asset/".length);
    return `/api/brain/asset?name=${encodeURIComponent(decodeURIComponent(raw))}`;
  }
  const cleanName = trimmed.replace(/^(\.?\/)+/, "");
  return `/api/brain/asset?name=${encodeURIComponent(cleanName)}`;
}

function ImageBlock({
  block,
  onPatch,
}: {
  block: NoteBlock;
  onPatch: (patch: Partial<NoteBlock>) => void;
}) {
  const url = block.url ?? "";
  const resolvedSrc = resolveNoteAssetUrl(url);
  const isVideo = /\.(mp4|webm|mov)$/i.test(url);

  const width = block.width || "100%";
  const align = block.align || "center";

  const alignClass =
    align === "left"
      ? "mr-auto"
      : align === "right"
        ? "ml-auto"
        : "mx-auto";

  return (
    <div className="group/img relative my-4 w-full">
      {url ? (
        <div
          className={cn("flex flex-col transition-all", alignClass)}
          style={{ width: width === "100%" ? "100%" : width }}
        >
          <div className="relative overflow-hidden rounded-xl border border-neutral-200/80 bg-neutral-50/50 shadow-sm dark:border-neutral-800 dark:bg-neutral-900/50">
            {isVideo ? (
              <video
                controls
                className="max-h-[520px] w-full rounded-xl object-contain bg-black/5"
                src={resolvedSrc}
              />
            ) : (
              <img
                alt={block.caption ?? "Notiz-Bild"}
                className="max-h-[520px] w-full rounded-xl object-contain"
                loading="lazy"
                src={resolvedSrc}
              />
            )}

            {/* Quick floating controls toolbar on hover */}
            <div className="absolute right-2 top-2 flex items-center gap-1 rounded-lg border border-black/10 bg-white/95 p-1 shadow-md opacity-0 backdrop-blur-sm transition-opacity group-hover/img:opacity-100 dark:border-white/10 dark:bg-neutral-900/95">
              <button
                className={cn(
                  "px-2 py-0.5 text-[11px] font-medium rounded transition-colors",
                  width === "33%"
                    ? "bg-neutral-200 font-bold dark:bg-neutral-800"
                    : "hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-600 dark:text-neutral-400"
                )}
                onClick={() => onPatch({ width: "33%" })}
                title="Klein (33%)"
                type="button"
              >
                33%
              </button>
              <button
                className={cn(
                  "px-2 py-0.5 text-[11px] font-medium rounded transition-colors",
                  width === "66%"
                    ? "bg-neutral-200 font-bold dark:bg-neutral-800"
                    : "hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-600 dark:text-neutral-400"
                )}
                onClick={() => onPatch({ width: "66%" })}
                title="Mittel (66%)"
                type="button"
              >
                66%
              </button>
              <button
                className={cn(
                  "px-2 py-0.5 text-[11px] font-medium rounded transition-colors",
                  width === "100%"
                    ? "bg-neutral-200 font-bold dark:bg-neutral-800"
                    : "hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-600 dark:text-neutral-400"
                )}
                onClick={() => onPatch({ width: "100%" })}
                title="Voll (100%)"
                type="button"
              >
                100%
              </button>

              <div className="h-3 w-px bg-neutral-200 dark:bg-neutral-700 mx-0.5" />

              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <button
                      className="p-1 rounded text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
                      title="Weitere Optionen"
                      type="button"
                    >
                      <IconDots className="size-3.5" />
                    </button>
                  }
                />
                <DropdownMenuContent align="end" className="w-48 text-xs">
                  <DropdownMenuLabel>Ausrichtung</DropdownMenuLabel>
                  <DropdownMenuItem onClick={() => onPatch({ align: "left" })}>
                    Links
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onPatch({ align: "center" })}>
                    Zentriert
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onPatch({ align: "right" })}>
                    Rechts
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => {
                      const next = window.prompt("Bild-URL oder Datei-Name:", url);
                      if (next !== null) onPatch({ url: next });
                    }}
                  >
                    Bild austauschen
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="text-destructive"
                    onClick={() => onPatch({ url: "" })}
                  >
                    Bild entfernen
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          <input
            aria-label="Bildbeschreibung"
            className="mt-1.5 w-full text-center bg-transparent text-[12px] text-neutral-400 dark:text-neutral-500 outline-none focus:text-neutral-700 dark:focus:text-neutral-300"
            defaultValue={block.caption ?? ""}
            onBlur={(event) => onPatch({ caption: event.target.value })}
            placeholder="Bildbeschreibung hinzufügen..."
          />
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-neutral-300 bg-neutral-50/80 p-8 text-neutral-600 transition-colors hover:border-neutral-400 dark:border-neutral-800 dark:bg-neutral-900/40">
          <IconPhoto className="size-8 text-neutral-400" stroke={1.25} />
          <div className="text-center">
            <p className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
              Bild oder Video hinzufügen
            </p>
            <p className="text-[11px] text-neutral-400">
              Aus Datei auswählen oder Name aus dem Vault angeben
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-xs font-medium text-neutral-800 shadow-xs border border-neutral-200 hover:bg-neutral-50 dark:bg-neutral-800 dark:text-neutral-200 dark:border-neutral-700">
              <IconPhoto className="size-3.5" />
              Datei hochladen
              <input
                accept="image/*,video/*"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  const reader = new FileReader();
                  reader.onload = () => onPatch({ url: String(reader.result) });
                  reader.readAsDataURL(file);
                }}
                type="file"
              />
            </label>
            <button
              className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-xs font-medium text-neutral-800 shadow-xs border border-neutral-200 hover:bg-neutral-50 dark:bg-neutral-800 dark:text-neutral-200 dark:border-neutral-700"
              onClick={() => {
                const entered = window.prompt("Bild-Dateiname aus dem Vault oder Web-URL (z.B. Screenshot.png):");
                if (entered) onPatch({ url: entered.trim() });
              }}
              type="button"
            >
              Vault-Name oder URL
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------- new blocks */

/**
 * A multi-column layout, Notion-style.
 *
 * Each column is an independent block array. A column is itself a block editor
 * lite — typing inside it goes through the same InlineEditable / InlineEditable
 * pipeline. The cross-block plumbing (Enter to split, Backspace to merge) is
 * reused so a column behaves like the page, just narrower.
 */
function ColumnsBlock({
  block,
  history,
  onAdd,
  onChangeTable,
  onConvert,
  onDragStart,
  onDrop,
  onDropTarget,
  onDuplicate,
  onFocus,
  onImagePaste,
  onKeyDown,
  onMove,
  onTextInput,
  onPatchBlock,
  onPickSlash,
  onRemove,
  onSetSpans,
  onToggle,
  onUpdate,
  dragId,
  dropTarget,
  focus,
  slashBlockId,
  slashItems,
  slashNavIndex,
  slashPos,
  slashQuery,
}: {
  block: NoteBlock;
  history: ReturnType<typeof useHistory>;
  onAdd: (blockId: string) => void;
  onChangeTable: (blockId: string, table: NonNullable<NoteBlock["table"]>) => void;
  onConvert: (blockId: string, type: NoteBlockType) => void;
  onDragStart: (id: string | null) => void;
  onDrop: (id: string) => void;
  onDropTarget: (id: string | null) => void;
  onDuplicate: (id: string) => void;
  onFocus: (id: string | null) => void;
  onImagePaste?: (file: File) => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLDivElement>, block: NoteBlock) => void;
  onMove: (id: string, direction: -1 | 1) => void;
  onTextInput: (blockId: string, element: HTMLElement) => void;
  onPatchBlock: (blockId: string, patch: Partial<NoteBlock>) => void;
  onPickSlash: (item: SlashItem) => void;
  onRemove: (id: string) => void;
  onSetSpans: (blockId: string, spans: NoteSpan[], caret: number) => void;
  onToggle: (slash: { blockId: string; query: string } | null) => void;
  onUpdate: (recipe: (current: NoteBlock[]) => NoteBlock[], key?: string | null) => void;
  dragId: string | null;
  dropTarget: string | null;
  focus: string | null;
  slashBlockId?: string;
  slashItems: SlashItem[];
  slashNavIndex: number;
  slashPos: { top: number; left: number } | null;
  slashQuery: string;
}) {
  const cols = block.columns ?? [];
  const updateColumns = (next: { width?: number; blocks: NoteBlock[] }[]) =>
    onPatchBlock(block.id, { columns: next });

  return (
    <div className="my-3 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
      {cols.map((col, colIndex) => (
        <div
          className="min-h-[3rem] rounded-lg border border-dashed border-neutral-200/80 bg-neutral-50/40 p-2 dark:border-neutral-800 dark:bg-neutral-900/30"
          key={colIndex}
        >
          {col.blocks.length === 0 ? (
            <button
              className="inline-flex items-center gap-1 rounded-md border border-dashed border-neutral-300/70 px-2 py-0.5 text-[11px] text-neutral-500 hover:border-neutral-400 dark:border-neutral-700"
              onClick={() =>
                updateColumns(
                  cols.map((c, i) =>
                    i === colIndex
                      ? { ...c, blocks: [emptyBlock("paragraph")] }
                      : c,
                  ),
                )
              }
              type="button"
            >
              <IconPlus className="size-3" stroke={1.75} /> Block
            </button>
          ) : (
            col.blocks.map((child) => (
              <BlockRow
                block={child}
                history={history}
                index={0}
                key={child.id}
                {...({
                  dragId,
                  dropTarget,
                  focus,
                  onAdd,
                  onChangeTable,
                  onUpdate,
                  onConvert,
                  onDragStart,
                  onDrop,
                  onDropTarget,
                  onDuplicate,
                  onFocus,
                  onImagePaste,
                  onKeyDown,
                  onMove,
                  onTextInput,
                  onPatchBlock,
                  onPickSlash,
                  onRemove,
                  onSetSpans,
                  onToggle,
                  slashBlockId,
                  slashItems,
                  slashNavIndex,
                  slashPos,
                  slashQuery,
                })}
              />
            ))
          )}
        </div>
      ))}
      <button
        className="inline-flex items-center justify-center gap-1 self-stretch rounded-lg border border-dashed border-neutral-300 px-2 py-3 text-[12px] text-neutral-500 hover:border-neutral-400 dark:border-neutral-700"
        disabled={cols.length >= 3}
        onClick={() =>
          updateColumns([
            ...cols,
            { width: 1, blocks: [emptyBlock("paragraph")] },
          ])
        }
        type="button"
      >
        <IconPlus className="size-3" stroke={1.75} /> Spalte
      </button>
    </div>
  );
}

/**
 * Audio block: URL (http(s) / data: / vault filename) + optional caption.
 *
 * Recording is exposed when the browser supports `MediaRecorder`; otherwise the
 * recorder hides itself and the upload fallback is the only path. Both write
 * the same `url` field, so the saved Markdown does not encode which one was
 * used — it just carries a `data:` URL.
 */
function AudioBlock({
  block,
  onPatch,
}: {
  block: NoteBlock;
  onPatch: (patch: Partial<NoteBlock>) => void;
}) {
  const [recording, setRecording] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const url = block.url ?? "";
  const canRecord = typeof window !== "undefined" && typeof window.MediaRecorder !== "undefined";

  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.push(event.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
        const reader = new FileReader();
        reader.onload = () => onPatch({ url: String(reader.result) });
        reader.readAsDataURL(blob);
      };
      recorder.start();
      recorderRef.current = recorder;
      setRecording(true);
    } catch {
      // Microphone access denied — keep the upload fallback.
      setRecording(false);
    }
  };

  const stop = () => {
    recorderRef.current?.stop();
    setRecording(false);
  };

  return (
    <div className="my-3 rounded-xl border border-neutral-200/80 bg-neutral-50/40 p-3 dark:border-neutral-800 dark:bg-neutral-900/40">
      {url ? (
        <audio className="w-full" controls src={url} />
      ) : (
        <div className="flex flex-col items-center gap-2 py-4 text-[12px] text-neutral-500">
          <span>Audio hinzufügen</span>
          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-xs font-medium text-neutral-800 shadow-xs border border-neutral-200 hover:bg-neutral-50 dark:bg-neutral-800 dark:text-neutral-200 dark:border-neutral-700">
              Datei hochladen
              <input
                accept="audio/*"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  const reader = new FileReader();
                  reader.onload = () => onPatch({ url: String(reader.result) });
                  reader.readAsDataURL(file);
                }}
                type="file"
              />
            </label>
            {canRecord ? (
              recording ? (
                <button
                  className="inline-flex items-center gap-1.5 rounded-lg bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 border border-red-200"
                  onClick={stop}
                  type="button"
                >
                  ● Stopp
                </button>
              ) : (
                <button
                  className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-xs font-medium text-neutral-800 shadow-xs border border-neutral-200 hover:bg-neutral-50 dark:bg-neutral-800 dark:text-neutral-200 dark:border-neutral-700"
                  onClick={start}
                  type="button"
                >
                  Aufnehmen
                </button>
              )
            ) : null}
            <button
              className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-xs font-medium text-neutral-800 shadow-xs border border-neutral-200 hover:bg-neutral-50 dark:bg-neutral-800 dark:text-neutral-200 dark:border-neutral-700"
              onClick={() => {
                const entered = window.prompt("Audio-URL oder Vault-Dateiname:");
                if (entered) onPatch({ url: entered.trim() });
              }}
              type="button"
            >
              URL oder Vault-Name
            </button>
          </div>
        </div>
      )}
      <input
        aria-label="Audio-Beschreibung"
        className="mt-1 w-full bg-transparent text-center text-[12px] text-neutral-400 outline-none focus:text-neutral-700 dark:focus:text-neutral-300"
        defaultValue={block.caption ?? ""}
        onBlur={(event) => onPatch({ caption: event.target.value })}
        placeholder="Audiobeschreibung hinzufügen …"
      />
      {url ? (
        <button
          className="mt-1 inline-flex items-center gap-1 text-[11px] text-neutral-400 hover:text-neutral-700"
          onClick={() => onPatch({ url: "" })}
          type="button"
        >
          Ersetzen
        </button>
      ) : null}
    </div>
  );
}

/**
 * Embedded iframe block (YouTube / Loom / Figma / Excalidraw / PDF / generic).
 *
 * The browser's `X-Frame-Options` cannot be read from JavaScript; a sandboxed
 * iframe is the best we can do, and a host that blocks embedding will show
 * nothing inside. We detect that case (the iframe stays blank after a short
 * delay and never fires `load`) and reveal the "extern öffnen" fallback.
 */
function IframeBlock({
  block,
  onPatch,
}: {
  block: NoteBlock;
  onPatch: (patch: Partial<NoteBlock>) => void;
}) {
  const url = block.url ?? "";
  const provider = block.iframeProvider ?? "generic";
  const title = block.iframeTitle ?? "";
  const [blocked, setBlocked] = useState(false);
  const [showEdit, setShowEdit] = useState(!url);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  // A blank iframe that never fires load is a frame-ancestors block. Reset on URL change.
  useEffect(() => {
    setBlocked(false);
    if (!url) return;
    const timer = window.setTimeout(() => {
      try {
        const frame = iframeRef.current;
        // Same-origin access is denied for cross-origin frames; the catch is the signal.
        const probe = frame?.contentWindow?.length;
        if (typeof probe !== "number") setBlocked(true);
      } catch {
        setBlocked(true);
      }
    }, 1500);
    return () => window.clearTimeout(timer);
  }, [url]);

  const embedSrc = (() => {
    if (!url) return "";
    if (provider === "youtube") {
      try {
        const u = new URL(url);
        const id = u.searchParams.get("v") ?? u.pathname.split("/").pop();
        return id ? `https://www.youtube-nocookie.com/embed/${id}` : url;
      } catch {
        return url;
      }
    }
    if (provider === "loom") {
      try {
        const u = new URL(url);
        const id = u.pathname.split("/").pop();
        return id ? `https://www.loom.com/embed/${id}` : url;
      } catch {
        return url;
      }
    }
    if (provider === "figma") {
      try {
        const u = new URL(url);
        u.searchParams.set("embed-host", "connect");
        return u.toString();
      } catch {
        return url;
      }
    }
    return url;
  })();

  if (showEdit || !url) {
    return (
      <div className="my-3 flex flex-col items-center gap-2 rounded-xl border border-dashed border-neutral-300 bg-neutral-50/60 p-4 text-[12px] text-neutral-500 dark:border-neutral-800 dark:bg-neutral-900/40">
        <span>Einbettung: YouTube, Loom, Figma, Excalidraw, PDF …</span>
        <input
          aria-label="Einbettungs-URL"
          className="w-full rounded-md border border-neutral-200 bg-white px-2 py-1 text-[13px] dark:border-neutral-800 dark:bg-neutral-900"
          defaultValue={url}
          onBlur={(event) => {
            const value = event.target.value.trim();
            if (!value) return;
            const lower = value.toLowerCase();
            const detected: typeof provider =
              lower.includes("youtube") || lower.includes("youtu.be")
                ? "youtube"
                : lower.includes("loom.com")
                  ? "loom"
                  : lower.includes("figma.com")
                    ? "figma"
                    : lower.includes("excalidraw.com")
                      ? "excalidraw"
                      : lower.endsWith(".pdf")
                        ? "pdf"
                        : "generic";
            onPatch({ url: value, iframeProvider: detected });
            setShowEdit(false);
          }}
          placeholder="https://"
        />
      </div>
    );
  }

  return (
    <div className="my-3 overflow-hidden rounded-xl border border-neutral-200/80 dark:border-neutral-800">
      <header className="flex items-center gap-2 border-b border-neutral-200/70 bg-neutral-50/60 px-2 py-1 text-[11px] text-neutral-500 dark:border-neutral-800 dark:bg-neutral-900/50">
        <span className="truncate">{title || provider}</span>
        <a
          className="ml-auto inline-flex items-center gap-1 underline-offset-2 hover:underline"
          href={url}
          rel="noreferrer"
          target="_blank"
        >
          extern öffnen
        </a>
        <button
          className="text-[11px] text-neutral-400 hover:text-neutral-700"
          onClick={() => setShowEdit(true)}
          type="button"
        >
          bearbeiten
        </button>
      </header>
      {provider === "pdf" ? (
        <object
          aria-label={title || "PDF"}
          className="h-[480px] w-full bg-white"
          data={url}
          type="application/pdf"
        >
          <a href={url} rel="noreferrer" target="_blank">PDF öffnen</a>
        </object>
      ) : blocked ? (
        <div className="flex flex-col items-center gap-2 bg-neutral-50/40 p-6 text-center text-[12px] text-neutral-500 dark:bg-neutral-900/30">
          <p className="max-w-md">
            Diese Seite erlaubt das Einbetten nicht. Über „extern öffnen" kannst du sie im Browser
            ansehen.
          </p>
        </div>
      ) : (
        <iframe
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          className="h-[420px] w-full bg-white"
          loading="lazy"
          onLoad={() => setBlocked(false)}
          onError={() => setBlocked(true)}
          ref={iframeRef}
          sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-presentation"
          src={embedSrc}
          title={title || "Einbettung"}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------- menus */

function BlockMenu({
  block,
  onConvert,
  onDuplicate,
  onMove,
  onRemove,
}: {
  block: NoteBlock;
  onConvert: (id: string, type: NoteBlockType) => void;
  onDuplicate: (id: string) => void;
  onMove: (id: string, direction: -1 | 1) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            aria-label="Block-Aktionen"
            className="size-6 shrink-0 rounded-md text-neutral-400 opacity-0 transition-opacity group-hover/block:opacity-100"
            size="icon"
            type="button"
            variant="ghost"
          />
        }
      >
        <IconDots className="size-3.5" stroke={1.75} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56 rounded-xl p-1.5">
        <DropdownMenuLabel className="text-[11px] uppercase tracking-wide opacity-60">
          Umwandeln in
        </DropdownMenuLabel>
        <DropdownMenuItem className="gap-2 rounded-lg px-2.5 py-2" onClick={() => onConvert(block.id, "paragraph")}>
          <IconVariable className="size-4" stroke={1.5} /> Text
        </DropdownMenuItem>
        <DropdownMenuItem className="gap-2 rounded-lg px-2.5 py-2" onClick={() => onConvert(block.id, "heading1")}>
          <IconH1 className="size-4" stroke={1.5} /> Überschrift 1
        </DropdownMenuItem>
        <DropdownMenuItem className="gap-2 rounded-lg px-2.5 py-2" onClick={() => onConvert(block.id, "heading2")}>
          <IconH2 className="size-4" stroke={1.5} /> Überschrift 2
        </DropdownMenuItem>
        <DropdownMenuItem className="gap-2 rounded-lg px-2.5 py-2" onClick={() => onConvert(block.id, "bullet")}>
          <IconList className="size-4" stroke={1.5} /> Aufzählung
        </DropdownMenuItem>
        <DropdownMenuItem className="gap-2 rounded-lg px-2.5 py-2" onClick={() => onConvert(block.id, "number")}>
          <IconListNumbers className="size-4" stroke={1.5} /> Nummeriert
        </DropdownMenuItem>
        <DropdownMenuItem className="gap-2 rounded-lg px-2.5 py-2" onClick={() => onConvert(block.id, "todo")}>
          <IconListCheck className="size-4" stroke={1.5} /> To-do
        </DropdownMenuItem>
        <DropdownMenuItem className="gap-2 rounded-lg px-2.5 py-2" onClick={() => onConvert(block.id, "toggle")}>
          <IconToggleLeft className="size-4" stroke={1.5} /> Toggle
        </DropdownMenuItem>
        <DropdownMenuItem className="gap-2 rounded-lg px-2.5 py-2" onClick={() => onConvert(block.id, "quote")}>
          <IconBlockquote className="size-4" stroke={1.5} /> Zitat
        </DropdownMenuItem>
        <DropdownMenuItem className="gap-2 rounded-lg px-2.5 py-2" onClick={() => onConvert(block.id, "table")}>
          <IconTable className="size-4" stroke={1.5} /> Tabelle
        </DropdownMenuItem>
        <DropdownMenuItem className="gap-2 rounded-lg px-2.5 py-2" onClick={() => onConvert(block.id, "image")}>
          <IconPhoto className="size-4" stroke={1.5} /> Bild & Medien
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="gap-2 rounded-lg px-2.5 py-2" onClick={() => onMove(block.id, -1)}>
          Nach oben
        </DropdownMenuItem>
        <DropdownMenuItem className="gap-2 rounded-lg px-2.5 py-2" onClick={() => onMove(block.id, 1)}>
          Nach unten
        </DropdownMenuItem>
        <DropdownMenuItem className="gap-2 rounded-lg px-2.5 py-2" onClick={() => onDuplicate(block.id)}>
          Duplizieren
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="gap-2 rounded-lg px-2.5 py-2 text-destructive" onClick={() => onRemove(block.id)}>
          <IconTrash className="size-4" stroke={1.5} /> Löschen
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function SlashMenu({
  index,
  items,
  onPick,
  onQueryChange,
  position,
  query,
}: {
  index: number;
  items: SlashItem[];
  onPick: (item: SlashItem) => void;
  onQueryChange: (query: string) => void;
  position: { top: number; left: number } | null;
  query: string;
}) {
  if (!position) return null;
  const groups = groupSlashItems(items);
  let running = -1;

  return (
    <div
      className="fixed z-[110] max-h-80 w-72 overflow-y-auto rounded-xl border border-black/10 bg-white py-1 shadow-xl"
      style={{ top: position.top, left: position.left }}
    >
      {items.length === 0 ? (
        <p className="px-3 py-2 text-[12px] text-neutral-400">
          Kein Block für „{query}“
        </p>
      ) : null}
      {groups.map(([group, groupItems]) => (
        <div key={group}>
          <p className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-neutral-400">
            {group}
          </p>
          {groupItems.map((item) => {
            running += 1;
            const active = running === index;
            return (
              <button
                className={cn(
                  "flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[13px]",
                  active && "bg-neutral-100",
                )}
                key={item.id}
                onClick={() => onPick(item)}
                onMouseEnter={onQueryChange.bind(null, query)}
                type="button"
              >
                <span className="flex size-6 shrink-0 items-center justify-center rounded border border-black/8 text-neutral-500">
                  {item.icon}
                </span>
                <span className="min-w-0 flex-1 truncate">{item.label}</span>
                {item.hint ? (
                  <span className="shrink-0 text-[11px] text-neutral-400">
                    {item.hint}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------- helpers */

function replaceBlock(
  blocks: NoteBlock[],
  blockId: string,
  replacement: NoteBlock,
): NoteBlock[] {
  return blocks.map((block) => (block.id === blockId ? replacement : block));
}

/**
 * Splits a block at a caret offset into the part above and the part below.
 *
 * Order is the whole point: Enter in the middle of a list has to produce the part above and the
 * part below, each still between its own neighbours. Appending to the end, or filtering the old
 * block out and inserting at the tail, silently reorders the document.
 *
 * The head keeps the original block id, which is what lets the undo step and the focus call refer
 * to the same block the user was typing in. The tail gets a fresh id from `splitSpans`.
 */
function splitBlockAt(
  blocks: NoteBlock[],
  blockId: string,
  tail: NoteBlock,
  liveSpans: NoteSpan[],
  caret: number,
): NoteBlock[] {
  const index = blocks.findIndex((block) => block.id === blockId);
  if (index < 0) return [...blocks, tail];

  const original = blocks[index];
  /*
   * Split the spans read from the DOM, not `original.spans`. The stored copy is one keystroke
   * behind, so using it here would keep the full old text above the caret and repeat the tail —
   * which is exactly the "ABCDEFG / DEFG" duplication this replaces.
   */
  const headSpans = spansBefore(liveSpans, caret);
  const head: NoteBlock = {
    ...original,
    spans: headSpans,
    // A heading cut in half leaves an empty heading behind; the text belongs with the tail, so the
    // head degrades to whatever the tail became.
    ...(blockText(original).length > 0 && headSpans.length === 0
      ? { type: tail.type }
      : {}),
    // Children belong with the block that still has a label, so a split toggle keeps them below.
    ...(original.children?.length ? { children: [], collapsed: true } : {}),
  };

  return [
    ...blocks.slice(0, index),
    head,
    tail,
    ...blocks.slice(index + 1),
  ];
}

/** The spans up to a character offset — the part of a block that stays above the caret. */
function spansBefore(spans: NoteSpan[], offset: number): NoteSpan[] {
  const out: NoteSpan[] = [];
  let position = 0;
  for (const span of spans) {
    const end = position + span.text.length;
    if (position >= offset) break;
    if (end <= offset) {
      out.push(span);
    } else {
      out.push({ ...span, text: span.text.slice(0, offset - position) });
    }
    position = end;
  }
  return out;
}

/** Block types Tab indents. */
const LIST_TYPES: NoteBlockType[] = ["bullet", "number", "todo"];

/**
 * Splits a block's live spans at a caret offset; the tail becomes the new block.
 *
 * Takes the spans rather than the block because the caller has freshly read them from the DOM, and
 * the block's own copy is a render behind.
 */
function splitSpans(spans: NoteSpan[], block: NoteBlock, offset: number): NoteBlock {
  const head: NoteSpan[] = [];
  const tail: NoteSpan[] = [];
  let position = 0;

  for (const span of spans) {
    const end = position + span.text.length;
    if (end <= offset) {
      head.push(span);
    } else if (position >= offset) {
      tail.push(span);
    } else {
      const cut = offset - position;
      head.push({ ...span, text: span.text.slice(0, cut) });
      tail.push({ ...span, text: span.text.slice(cut) });
    }
    position = end;
  }

  return {
    id: `${block.id}-${Date.now().toString(36)}`,
    /*
     * Only a paragraph survives a split. A heading cut in half would leave a second heading in the
     * middle of a sentence, and a bullet cut in half would leave an orphan bullet — Notion makes
     * the same choice.
     */
    type: "paragraph",
    spans: tail.length > 0 ? tail : [{ text: "" }],
    indent: block.indent,
    ...(block.type === "todo" ? { checked: false } : {}),
  };
}

function placeholderFor(type: NoteBlockType): string {
  switch (type) {
    case "heading1":
      return "Überschrift 1";
    case "heading2":
      return "Überschrift 2";
    case "heading3":
      return "Überschrift 3";
    case "code":
      return "Code";
    case "quote":
      return "Zitat";
    case "callout":
      return "Hinweis";
    case "todo":
      return "Aufgabe";
    case "audio":
      return "Audio (URL oder Datei)";
    case "iframe":
      return "Einbettung (URL oder Anbieter)";
    case "bullet":
    case "number":
      return "";
    default:
      return "Schreib etwas oder '/' für Blöcke";
  }
}
