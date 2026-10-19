"use client";

import { IconAlertTriangle } from "@tabler/icons-react";
import type { Editor } from "@tiptap/core";
import Image from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import { TableKit } from "@tiptap/extension-table";
import TaskItem from "@tiptap/extension-task-item";
import TaskList from "@tiptap/extension-task-list";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  findImageInClipboard,
  findImageInFileList,
  type ImageInsertResult,
  imageFileToDataUrl,
  MAX_IMAGE_BYTES,
} from "@/extensions/spark/notes/images";
import { updateNote } from "@/extensions/spark/notes/store";
import type { SparkNote } from "@/extensions/spark/notes/types";
import {
  NoteEditorStatus,
  NoteTableControls,
  type SaveState,
} from "./note-editor-controls";
import { NoteEditorToolbar } from "./note-editor-toolbar";
import "./note-editor.css";

/** Wie lange nach der letzten Eingabe wir schreiben. Kurz genug, um nichts zu verlieren. */
const AUTOSAVE_DELAY_MS = 600;

/**
 * Der Notiz-Editor.
 *
 * Tiptap 3.x — nicht 2.x. Drei Dinge, die dort anders sind als in der
 * 2er-Doku und die beim Porten gern zu Fehlern führen:
 *
 * - Undo/Redo heißt `undoRedo` und steckt bereits in `StarterKit`.
 * - `link` und `underline` sind ebenfalls Teil von `StarterKit`. Nochmal zu
 *   registrieren erzeugt eine Duplikat-Warnung und zerschießt die Commands.
 * - Tabellen kommen als `TableKit` (bündelt table/row/cell/header).
 *
 * Autosave: 600 ms nach der letzten Änderung. Nicht bei jedem Tastendruck
 * (`localStorage` ist synchron und blockiert den Frame), nicht erst bei
 * `onBlur` (man soll beim Tippen nicht den Fokus verlieren).
 */
export function NoteEditor({ note }: { note: SparkNote }) {
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [imageError, setImageError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const saveTimerRef = useRef<number | null>(null);

  /*
   * EIN Editor für die ganze Sitzung — die Dep-Liste ist bewusst leer.
   *
   * Mit `[note.id]` baut `useEditor` beim Notizwechsel ein neues Tiptap-Objekt
   * auf. In Tiptap 3 ist dieser Rebuild mit `immediatelyRender: false` asynchron,
   * und im Frame, in dem die Komponente neu rendert, ist der Hook intern noch
   * auf den alten, bereits zerstörten Editor gebunden: `Cannot read properties
   * of null (reading 'commands')` und die ganze Route zeigt danach
   * „Something went wrong". Der Absturz war also nicht die Toolbar, sondern
   * der Rebuild selbst.
   *
   * Ein Editor, Inhalt per `setContent` (siehe `loadedIdRef` unten): das ist der
   * Weg, den Tiptap für genau diesen Fall vorsieht, und der Cursor springt
   * dabei nicht, weil dort `emitUpdate: false` steht.
   */
  const editor = useEditor(
    {
      extensions: [
        StarterKit.configure({
          undoRedo: { depth: 100 },
          heading: { levels: [1, 2, 3] },
        }),
        TableKit.configure({
          table: {
            resizable: true,
            lastColumnResizable: false,
            allowTableNodeSelection: true,
          },
        }),
        TaskList,
        TaskItem.configure({ nested: true }),
        Image.configure({
          inline: false,
          allowBase64: true,
        }),
        Placeholder.configure({
          placeholder: ({ node }) =>
            node.type.name === "heading" ? "Überschrift" : "Schreib etwas …",
          showOnlyWhenEditable: true,
        }),
      ],
      content: note.content,
      /*
       * SSR: `false` lässt Tiptap beim Server-Render nichts bauen, was der
       * Client nicht hätte. Standardmuster für Vite-Apps.
       */
      immediatelyRender: false,
      editorProps: {
        attributes: {
          /*
           * Horizontaler Innenabstand und `max-width` kommen aus
           * `.spark-prose` in styles.css — dort stehen sie neben dem Rest der
           * Typografie. Hier nur, was der Editor selbst braucht.
           */
          class: "spark-prose min-h-[360px] text-pretty",
          "aria-label": "Notiz-Inhalt",
        },
      },
      onUpdate: () => setSaveState("saving"),
    },
    [],
  );

  /*
   * Notizwechsel per Route, Komponente bleibt aber gleich gemountet.
   *
   * Der `loadedId`-Wächter ist Korrektheit, keine Optimierung: Er ist der
   * einzige Ort, an dem der Inhalt einer Notiz in den Editor gelangt. Ohne
   * ihn behielte der Editor beim Wechsel den Text der vorigen Notiz, und mit
   * `note.content` in der Abhängigkeitsliste liefe das `setContent` bei jedem
   * Autosave erneut — der Cursor sprang dann mitten im Tippen zurück, weil
   * `note.content` bei jedem Speichern eine neue Objektidentität bekommt.
   */
  const loadedIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!editor) return;
    if (loadedIdRef.current === note.id) return;
    loadedIdRef.current = note.id;
    editor.commands.setContent(note.content, { emitUpdate: false });
    setSaveState("saved");
    setImageError(null);
  }, [editor, note.id, note.content]);

  const persist = useCallback(() => {
    if (!editor) return;
    try {
      updateNote(note.id, { content: editor.getJSON() });
      setSaveState("saved");
    } catch {
      /*
       * Quota überschritten — realistisch bei einem großen eingebetteten Bild.
       * Der Text bleibt im Editor sichtbar, wir behaupten aber nicht, er sei
       * gespeichert.
       */
      setSaveState("error");
    }
  }, [editor, note.id]);

  useEffect(() => {
    if (saveState !== "saving") return;
    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current);
    }
    saveTimerRef.current = window.setTimeout(() => {
      saveTimerRef.current = null;
      persist();
    }, AUTOSAVE_DELAY_MS);
    return () => {
      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
    };
  }, [saveState, persist]);

  /*
   * Beim Verlassen sichern. Ein Timer, der noch wartet, ist sonst weg — der
   * letzte Satz vor dem Klick auf eine andere Notiz fehlt dann auf Platte.
   */
  const persistRef = useRef(persist);
  persistRef.current = persist;
  useEffect(() => {
    const flush = () => persistRef.current();
    window.addEventListener("pagehide", flush);
    return () => window.removeEventListener("pagehide", flush);
  }, []);

  /* `Cmd+S` sofort speichern, statt den Browser-Download zu öffnen. */
  useEffect(() => {
    if (!editor) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey)) return;
      if (event.key.toLowerCase() !== "s") return;
      event.preventDefault();
      persist();
    };
    const dom = editor.view.dom;
    dom.addEventListener("keydown", onKeyDown);
    return () => dom.removeEventListener("keydown", onKeyDown);
  }, [editor, persist]);

  const insertImage = useCallback(
    async (file: File) => {
      if (!editor) return;
      const result = await imageFileToDataUrl(file);
      applyImageResult(editor, result, setImageError);
    },
    [editor],
  );

  /*
   * Paste und Drop hängen am DOM-Knoten des Editors, nicht an React: ProseMirror
   * eigene Event-Handler laufen zuerst, und wir wollen Bilder abfangen, bevor
   * Chromium einen nicht auflösbaren Blob-Pfad in das Dokument schreibt.
   */
  useEffect(() => {
    if (!editor) return;
    const dom = editor.view.dom;

    const onPaste = (event: ClipboardEvent) => {
      const file = findImageInClipboard(event);
      if (!file) return;
      event.preventDefault();
      void insertImage(file);
    };

    const onDrop = (event: DragEvent) => {
      const file = findImageInFileList(event.dataTransfer?.files ?? null);
      if (!file) return;
      event.preventDefault();
      void insertImage(file);
    };

    dom.addEventListener("paste", onPaste);
    dom.addEventListener("drop", onDrop);
    return () => {
      dom.removeEventListener("paste", onPaste);
      dom.removeEventListener("drop", onDrop);
    };
  }, [editor, insertImage]);

  const onFilesPicked = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = findImageInFileList(event.target.files);
      /*
       * Zurücksetzen, damit dieselbe Datei direkt nochmal wählbar ist —
       * sonst feuert `change` ein zweites Mal nicht.
       */
      event.target.value = "";
      if (file) void insertImage(file);
    },
    [insertImage],
  );

  if (!editor) {
    return (
      <div className="flex min-h-[360px] items-center justify-center p-8">
        <div
          aria-hidden
          className="h-1.5 w-32 animate-pulse overflow-hidden rounded-full bg-foreground/10"
        />
        <span className="sr-only">Editor wird geladen…</span>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-1 border-b border-border/70 bg-background/85 px-2 py-1.5 backdrop-blur-sm">
        <NoteEditorToolbar
          editor={editor}
          onInsertImage={() => fileInputRef.current?.click()}
          onInsertTable={() =>
            editor
              .chain()
              .focus()
              .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
              .run()
          }
        />
        <div className="ml-auto flex items-center gap-1 pl-2">
          <NoteTableControls editor={editor} />
          <NoteEditorStatus editor={editor} saveState={saveState} />
        </div>
      </div>

      {imageError ? (
        <div
          className="flex items-start gap-2 border-b border-destructive/25 bg-destructive/10 px-4 py-2.5 text-[13px] text-destructive"
          role="alert"
        >
          <IconAlertTriangle
            aria-hidden
            className="mt-px size-4 shrink-0"
            stroke={1.75}
          />
          <span className="min-w-0 flex-1">{imageError}</span>
          <button
            className="shrink-0 rounded-md px-1.5 py-0.5 text-[12px] underline underline-offset-2 hover:bg-destructive/15"
            onClick={() => setImageError(null)}
            type="button"
          >
            Schließen
          </button>
        </div>
      ) : null}

      <input
        accept="image/*"
        className="hidden"
        onChange={onFilesPicked}
        ref={fileInputRef}
        type="file"
      />

      <div className="min-h-0 flex-1 overflow-y-auto bg-background">
        {/*
         * Kein Innenabstand hier: der Titel oben setzt ihn schon, und
         * `spark-prose` bringt seinen eigenen mit. Zweimal padding ergäbe
         * eine sichtbare Lücke genau dort, wo der Cursor von der Zeile
         * darunter in die erste Textzeile springt.
         */}
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}

/**
 * Setzt das Bild in den Editor oder erklärt, warum es nicht ging.
 *
 * Meldungen sagen, was passiert ist und was jetzt zu tun ist — kein Fehlercode,
 * kein „Etwas ist schiefgelaufen".
 */
function applyImageResult(
  editor: Editor,
  result: ImageInsertResult,
  setError: (message: string | null) => void,
) {
  switch (result.status) {
    case "ok":
      editor
        .chain()
        .focus()
        .setImage({ src: result.src, alt: result.fileName })
        .run();
      setError(null);
      return;

    case "too-large": {
      const mb = Math.round(result.bytes / (1024 * 1024));
      setError(
        `Bild ist ${mb} MB groß und passt nicht in eine Notiz. Skaliere es auf höchstens ${Math.round(
          MAX_IMAGE_BYTES / (1024 * 1024),
        )} MB oder wähle eine kleinere Datei.`,
      );
      return;
    }

    case "failed":
      setError(result.message);
      return;

    default: {
      const exhaustive: never = result;
      void exhaustive;
    }
  }
}
