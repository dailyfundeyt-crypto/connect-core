// Round-trip tests for the new vault block types.
//
// The vault editor is a markdown file on disk. The editor's blocks must come
// back to the same blocks after a save and reload, otherwise opening a note
// to glance at it silently destroys layout. This file pins that contract.
//
// The block types covered here are the ones the previous turn added:
// `columns`, styled `divider`, nested `callout` children, `audio`, and
// `iframe`. Inline `color` and `bg` marks are checked too, because they live
// in the same span layer.
//
// Run with: bun apps/app/tests/vault-extended-roundtrip.test.ts

import {
  blocksToMarkdown,
  markdownToBlocks,
} from "../src/lib/companies/notes-markdown";
import { emptyBlock } from "../src/lib/companies/use-note-blocks";
import type { NoteBlock } from "../src/lib/companies/notes";

function roundtrip(blocks: NoteBlock[]): NoteBlock[] {
  return markdownToBlocks(blocksToMarkdown(blocks));
}

const fails: string[] = [];
function check(label: string, condition: boolean) {
  if (!condition) fails.push(label);
}

function hasBlock<T extends NoteBlock["type"]>(
  blocks: NoteBlock[],
  type: T,
): NoteBlock | undefined {
  return blocks.find((b) => b.type === type);
}

/* ---------------------------------------------------------------- columns */

const columnsBlock: NoteBlock = {
  ...emptyBlock("columns"),
  columns: [
    {
      width: 1,
      blocks: [{ ...emptyBlock("paragraph"), spans: [{ text: "Links" }] }],
    },
    {
      width: 1,
      blocks: [
        { ...emptyBlock("heading3"), spans: [{ text: "Rechts" }] },
        { ...emptyBlock("paragraph"), spans: [{ text: "Detail" }] },
      ],
    },
  ],
};

const columnsBack = roundtrip([columnsBlock]);
const columnsFound = hasBlock(columnsBack, "columns");
check("Spaltenblock überlebt", Boolean(columnsFound));
if (columnsFound?.type === "columns") {
  check(
    "zwei Spalten bleiben zwei Spalten",
    (columnsFound.columns?.length ?? 0) === 2,
  );
  check(
    "Inhalt der ersten Spalte bleibt",
    columnsFound.columns?.[0]?.blocks[0]?.spans?.[0]?.text === "Links",
  );
  check(
    "Überschrift in Spalte zwei bleibt",
    columnsFound.columns?.[1]?.blocks[0]?.type === "heading3",
  );
}

/* ----------------------------------------------------------- styled divider */

const dashedDivider: NoteBlock = {
  ...emptyBlock("divider"),
  dividerStyle: "dashed",
  dividerAccent: "#a3a3a3",
};

const dividerBack = roundtrip([dashedDivider]);
const dividerFound = hasBlock(dividerBack, "divider");
check("Trennlinie überlebt", Boolean(dividerFound));
check(
  "Trennlinien-Stil (dashed) bleibt",
  dividerFound?.dividerStyle === "dashed",
);
check(
  "Trennlinien-Akzent bleibt",
  dividerFound?.dividerAccent === "#a3a3a3",
);

/* -------------------------------------------------- callout with children */

const callout: NoteBlock = {
  ...emptyBlock("callout"),
  emoji: "📌",
  color: "#fef3c7",
  children: [
    { ...emptyBlock("paragraph"), spans: [{ text: "Inhalt im Callout" }] },
  ],
};

const calloutBack = roundtrip([callout]);
const calloutFound = hasBlock(calloutBack, "callout");
check("Callout überlebt", Boolean(calloutFound));
check(
  "Callout-Emoji bleibt",
  calloutFound?.emoji === "📌",
);
check(
  "Callout-Farbe bleibt",
  calloutFound?.color === "#fef3c7",
);
check(
  "Callout-Kind bleibt erhalten",
  calloutFound?.children?.[0]?.spans?.[0]?.text === "Inhalt im Callout",
);

/* --------------------------------------------------------------- audio block */

const audio: NoteBlock = {
  ...emptyBlock("audio"),
  url: "https://brain.local/asset/intro.mp3",
  assetName: "intro.mp3",
};

const audioBack = roundtrip([audio]);
const audioFound = hasBlock(audioBack, "audio");
check("Audioblock überlebt", Boolean(audioFound));
check("Audio-URL bleibt", audioFound?.url === "https://brain.local/asset/intro.mp3");
check("Audio-Asset-Name bleibt", audioFound?.assetName === "intro.mp3");

/* --------------------------------------------------------------- iframe block */

const iframe: NoteBlock = {
  ...emptyBlock("iframe"),
  url: "https://www.youtube.com/watch?v=abc",
  iframeProvider: "youtube",
  iframeTitle: "Demo",
};

const iframeBack = roundtrip([iframe]);
const iframeFound = hasBlock(iframeBack, "iframe");
check("Iframe-Block überlebt", Boolean(iframeFound));
check(
  "Iframe-Provider (youtube) bleibt",
  iframeFound?.iframeProvider === "youtube",
);
check("Iframe-URL bleibt", iframeFound?.url === "https://www.youtube.com/watch?v=abc");
check("Iframe-Titel bleibt", iframeFound?.iframeTitle === "Demo");

/* ---------------------------------------------- inline color and bg marks */

const colored: NoteBlock = {
  ...emptyBlock("paragraph"),
  spans: [
    { text: "wichtig", marks: [{ type: "color", value: "#dc2626" }] },
    { text: " und ", marks: [] },
    { text: "hochgehoben", marks: [{ type: "bg", value: "#fde68a" }] },
  ],
};

const coloredBack = roundtrip([colored]);
const coloredFound = hasBlock(coloredBack, "paragraph");
check("Eingefärbter Absatz überlebt", Boolean(coloredFound));
const text = (coloredFound?.spans ?? [])
  .map((span) => span.text)
  .join("");
check("Text-Reihenfolge bleibt", text === "wichtig und hochgehoben");
const marks = (coloredFound?.spans ?? []).flatMap((span) => span.marks ?? []);
check(
  "Textfarbe bleibt erhalten",
  marks.some((m) => m.type === "color" && m.value === "#dc2626"),
);
check(
  "Texthintergrund bleibt erhalten",
  marks.some((m) => m.type === "bg" && m.value === "#fde68a"),
);

/* ------------------------------ empty blocks from the slash command survive */

const emptyInserted: NoteBlock[] = [
  emptyBlock("columns"),
  emptyBlock("audio"),
  emptyBlock("iframe"),
  {
    ...emptyBlock("divider"),
    dividerStyle: "dotted",
  },
];

const emptyBack = roundtrip(emptyInserted);
check(
  "leere Spalten überleben Speichern",
  emptyBack.some((b) => b.type === "columns"),
);
check(
  "leere Audioblöcke überleben Speichern",
  emptyBack.some((b) => b.type === "audio"),
);
check(
  "leere Iframes überleben Speichern",
  emptyBack.some((b) => b.type === "iframe"),
);
check(
  "leere Trennlinien (dotted) überleben Speichern",
  emptyBack.some((b) => b.type === "divider" && b.dividerStyle === "dotted"),
);

/* ------------------------------------------------------- vault prefs smoke */

/*
 * `vault-prefs` writes to `localStorage`, which is a browser API. Bun exposes
 * a small built-in `localStorage` shape when `@happy-dom/global-registrator`
 * is loaded, but the simpler route for a pure-data module is to stub the
 * couple of methods it touches. The module falls back silently when the
 * storage throws, so without the stub every read comes back empty.
 */
if (typeof globalThis.localStorage === "undefined") {
  const bag = new Map<string, string>();
  globalThis.localStorage = {
    getItem: (key: string) => (bag.has(key) ? bag.get(key)! : null),
    setItem: (key: string, value: string) => {
      bag.set(key, String(value));
    },
    removeItem: (key: string) => {
      bag.delete(key);
    },
    clear: () => bag.clear(),
    key: (i: number) => Array.from(bag.keys())[i] ?? null,
    get length() {
      return bag.size;
    },
  } as Storage;
}

const { getVaultPrefs, setVaultPrefs, pushVaultHistory } = await import(
  "../src/lib/companies/vault-prefs"
);

const seeded = setVaultPrefs("Projekte/Alpha.md", { width: "wide", favorite: true });
check("Vault-Prefs: gesetzt", seeded.width === "wide" && seeded.favorite);
const fetched = getVaultPrefs("Projekte/Alpha.md");
check("Vault-Prefs: gelesen", fetched.width === "wide" && fetched.favorite);
const other = getVaultPrefs("Projekte/Beta.md");
check("Vault-Prefs: Default für andere Datei", other.width === "medium");

pushVaultHistory("Projekte/Alpha.md", "Stand 1");
pushVaultHistory("Projekte/Alpha.md", "Stand 2");
const withHistory = getVaultPrefs("Projekte/Alpha.md");
check(
  "Vault-Prefs: History wird gefüllt",
  withHistory.history.length === 2 && withHistory.history[0].content === "Stand 2",
);

if (fails.length) {
  console.error(`FEHLGESCHLAGEN (${fails.length}):`);
  for (const f of fails) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`ok – ${fails.length === 0 ? "alle" : fails.length} erweiterte Block-Roundtrips.`);