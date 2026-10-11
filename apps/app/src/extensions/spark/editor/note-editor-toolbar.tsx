"use client";

import {
  IconBlockquote,
  IconBold,
  IconChevronDown,
  IconCode,
  IconH1,
  IconH2,
  IconH3,
  IconItalic,
  IconList,
  IconListCheck,
  IconListNumbers,
  IconPhoto,
  IconStrikethrough,
  IconTable,
  IconUnderline,
} from "@tabler/icons-react";
import type { Editor } from "@tiptap/react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

/**
 * Editor-Toolbar für die Spark-Notiz.
 *
 * Notion-ähnlich, aber bewusst ohne Slash-Menü: das Kommando-Menu wird in
 * Phase 1.5 nachgerüstet, wenn die Bedienung etabliert ist. Jetzt sind es
 * die Aktionen, die man beim Schreiben wirklich braucht.
 *
 * Zustand kommt aus `useEditorState` statt aus dem Editor-Objekt, damit die
 * Toolbar nur bei den Werten neu rendert, die sie anzeigt — nicht bei jedem
 * Tastendruck im Dokument.
 */
export function NoteEditorToolbar({
  editor,
  onInsertImage,
  onInsertTable,
}: {
  /*
   * `Editor | null`, nicht `Editor`.
   *
   * `useEditor` gibt in dem einen Render-Durchlauf `null` zurück, in dem es den
   * Editor neu baut — beim Wechsel auf eine andere Notiz. Vorher stand hier
   * `Editor`, was TypeScript nicht beanstandete und im Browser in
   * `Cannot read properties of null (reading 'commands')` endete. Die
   * Toolbar rendert in genau diesem Frame noch mit dem alten Editor-Prop.
   */
  editor: Editor | null;
  onInsertImage: () => void;
  onInsertTable: () => void;
}) {
  if (!editor) return null;
  return (
    <div
      aria-label="Formatierung"
      className="flex flex-wrap items-center gap-0.5 border-b border-border/70 bg-background/80 px-2 py-1.5 backdrop-blur"
      role="toolbar"
    >
      <HeadingMenu editor={editor} />
      <ToolbarDivider />
      <ToolbarButton
        active={editor.isActive("bold")}
        label="Fett (⌘B)"
        onClick={() => editor.chain().focus().toggleBold().run()}
      >
        <IconBold aria-hidden className="size-4" stroke={1.75} />
      </ToolbarButton>
      <ToolbarButton
        active={editor.isActive("italic")}
        label="Kursiv (⌘I)"
        onClick={() => editor.chain().focus().toggleItalic().run()}
      >
        <IconItalic aria-hidden className="size-4" stroke={1.75} />
      </ToolbarButton>
      <ToolbarButton
        active={editor.isActive("underline")}
        label="Unterstrichen (⌘U)"
        onClick={() => editor.chain().focus().toggleUnderline().run()}
      >
        <IconUnderline aria-hidden className="size-4" stroke={1.75} />
      </ToolbarButton>
      <ToolbarButton
        active={editor.isActive("strike")}
        label="Durchgestrichen"
        onClick={() => editor.chain().focus().toggleStrike().run()}
      >
        <IconStrikethrough aria-hidden className="size-4" stroke={1.75} />
      </ToolbarButton>
      <ToolbarButton
        active={editor.isActive("code")}
        label="Inline-Code"
        onClick={() => editor.chain().focus().toggleCode().run()}
      >
        <IconCode aria-hidden className="size-4" stroke={1.75} />
      </ToolbarButton>

      <ToolbarDivider />

      <ToolbarButton
        active={editor.isActive("bulletList")}
        label="Aufzählung"
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      >
        <IconList aria-hidden className="size-4" stroke={1.75} />
      </ToolbarButton>
      <ToolbarButton
        active={editor.isActive("orderedList")}
        label="Nummerierte Liste"
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
      >
        <IconListNumbers aria-hidden className="size-4" stroke={1.75} />
      </ToolbarButton>
      <ToolbarButton
        active={editor.isActive("taskList")}
        label="Aufgabenliste"
        onClick={() => editor.chain().focus().toggleTaskList().run()}
      >
        <IconListCheck aria-hidden className="size-4" stroke={1.75} />
      </ToolbarButton>
      <ToolbarButton
        active={editor.isActive("blockquote")}
        label="Zitat"
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
      >
        <IconBlockquote aria-hidden className="size-4" stroke={1.75} />
      </ToolbarButton>

      <ToolbarDivider />

      <ToolbarButton label="Bild einfügen" onClick={onInsertImage}>
        <IconPhoto aria-hidden className="size-4" stroke={1.75} />
      </ToolbarButton>
      <ToolbarButton label="Tabelle einfügen" onClick={onInsertTable}>
        <IconTable aria-hidden className="size-4" stroke={1.75} />
      </ToolbarButton>

      {/* `isActive` liest den Editor-Zustand; ohne dieses Signal bleibt die
          Toolbar bei den hervorgehobenen Zuständen stehen. */}
      <ActiveSync editor={editor} />
    </div>
  );
}

/**
 * Rendert nichts, meldet sich nur bei Zustandsänderungen.
 *
 * Das ist der übliche Weg bei Tiptap: `Editor` ist kein React-State, ein
 * `setState` von außen braucht einen Anker, und ein unsichtbares Kind ist der
 * sauberste — es zwingt `ToolbarButton` zur Neuberechnung von `active`,
 * ohne die Toolbar selbst zu ersetzen.
 */
function ActiveSync({ editor }: { editor: Editor | null }) {
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
  return null;
}

function HeadingMenu({ editor }: { editor: Editor | null }) {
  if (!editor) return null;
  const level = currentHeadingLevel(editor);
  const label = level ? `Ü${level}` : "Text";
  const icon =
    level === 1 ? (
      <IconH1 aria-hidden className="size-4" stroke={1.75} />
    ) : level === 2 ? (
      <IconH2 aria-hidden className="size-4" stroke={1.75} />
    ) : level === 3 ? (
      <IconH3 aria-hidden className="size-4" stroke={1.75} />
    ) : null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            aria-label={`Absatzformat: ${label}`}
            className="h-8 gap-1.5 rounded-lg px-2 text-xs font-medium"
            size="sm"
            variant="ghost"
          />
        }
      >
        {icon}
        <span className="min-w-[3.5rem] text-left">{label}</span>
        <IconChevronDown aria-hidden className="size-3.5 opacity-60" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-40 rounded-xl p-1.5">
        <DropdownMenuItem
          className="gap-2 rounded-lg px-2.5 py-2 text-sm"
          onClick={() => editor.chain().focus().setParagraph().run()}
        >
          Text
        </DropdownMenuItem>
        <DropdownMenuItem
          className="gap-2 rounded-lg px-2.5 py-2 text-sm"
          onClick={() =>
            editor.chain().focus().toggleHeading({ level: 1 }).run()
          }
        >
          <IconH1 aria-hidden className="size-4" stroke={1.75} />
          Überschrift 1
        </DropdownMenuItem>
        <DropdownMenuItem
          className="gap-2 rounded-lg px-2.5 py-2 text-sm"
          onClick={() =>
            editor.chain().focus().toggleHeading({ level: 2 }).run()
          }
        >
          <IconH2 aria-hidden className="size-4" stroke={1.75} />
          Überschrift 2
        </DropdownMenuItem>
        <DropdownMenuItem
          className="gap-2 rounded-lg px-2.5 py-2 text-sm"
          onClick={() =>
            editor.chain().focus().toggleHeading({ level: 3 }).run()
          }
        >
          <IconH3 aria-hidden className="size-4" stroke={1.75} />
          Überschrift 3
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Welche Überschrift steht am Cursor? `null` bei Fließtext.
 *
 * Ausgeschrieben statt über `([{level:1},{level:2},...] as const).find(...)`:
 * Tiptaps `isActive` akzeptiert pro Element verschiedene Shapes, und der
 * `as const`-Trick typisiert das Array als Tupel, was beim Zugriff auf
 * `.level` zu genau den Fehlern führt, die wir nicht brauchen.
 */
function currentHeadingLevel(editor: Editor): 1 | 2 | 3 | null {
  if (editor.isActive("heading", { level: 1 })) return 1;
  if (editor.isActive("heading", { level: 2 })) return 2;
  if (editor.isActive("heading", { level: 3 })) return 3;
  return null;
}

function ToolbarButton({
  active,
  label,
  onClick,
  children,
}: {
  active?: boolean;
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Button
      aria-label={label}
      aria-pressed={active}
      className={cn(
        "size-8 rounded-lg text-muted-foreground",
        active && "bg-foreground/10 text-foreground",
      )}
      onClick={onClick}
      size="icon"
      title={label}
      type="button"
      variant="ghost"
    >
      {children}
    </Button>
  );
}

function ToolbarDivider() {
  return <span aria-hidden className="mx-1 h-4 w-px bg-border" />;
}
