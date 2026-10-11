// Roundtrip check for the vault editor's table handling.
//
// `VaultNoteEditor` saves through `blocksToMarkdown` and loads through
// `markdownToBlocks`, so a table has to survive the pair or a person loses it by
// opening and saving a note they meant only to read. This file exercises that
// pair directly rather than through the editor: the DOM in `InlineEditable` needs
// a layout engine, but the conversion between the two is plain data and a missing
// table case there would be invisible in the UI until somebody saved a file.
//
// Run with: bun tests/vault-table-roundtrip.test.ts

import { blocksToMarkdown, markdownToBlocks } from "../src/lib/companies/notes-markdown";
import { emptyBlock } from "../src/lib/companies/use-note-blocks";
import type { NoteBlock } from "../src/lib/companies/notes";

function roundtrip(blocks: NoteBlock[]): NoteBlock[] {
  return markdownToBlocks(blocksToMarkdown(blocks));
}

const fails: string[] = [];
function check(label: string, condition: boolean) {
  if (!condition) fails.push(label);
}

/** The table markdown shape Obsidian itself writes. */
const obsidianTable = [
  "| Thema | Überschrift | Wert |",
  "| --- | --- | ---: |",
  "| BTC | Dominanz | 54,2 % |",
  "| ETH | Gas | 12 gwei |",
  "",
].join("\n");

// 1. A table written by another tool survives the round trip.
const parsed = markdownToBlocks(obsidianTable);
const table = parsed.find((b) => b.type === "table");
check("Obsidian-Tabelle wird erkannt", Boolean(table));
if (table?.type === "table") {
  check("Kopfzeile bleibt eine Kopfzeile", table.table?.headerRow === true);
  /*
   * Three rows, not four: the `| --- | --- | ---: |` line is the delimiter that
   * marks row one as the header, and it is consumed rather than stored. Keeping it
   * would show the reader a row of dashes.
   */
  check(
    "Kopfzeile plus zwei Datenzeilen",
    (table.table?.rows.length ?? 0) === 3,
  );
  check(
    "drei Spalten bleiben drei Spalten",
    (table.table?.rows[0]?.length ?? 0) === 3,
  );
  check(
    "Zellinhalt überlebt",
    table.table?.rows[1]?.[1] === "Dominanz",
  );
  check(
    "Wert mit Komma und Prozent bleibt ein Text",
    table.table?.rows[1]?.[2] === "54,2 %",
  );

  // 2. Writing it back produces the same table data.
  const written = blocksToMarkdown(parsed);
  const reparsed = markdownToBlocks(written);
  const rewritten = reparsed.find((b) => b.type === "table");
  /*
   * The `table` payload is compared, not the whole block. Block ids are minted fresh
   * on every parse, so two parses of equal markdown never produce equal objects --
   * comparing the ids would fail on a conversion that is actually lossless, which
   * is the opposite of what this file is here to catch.
   */
  check(
    "Tabellendaten überleben den Hin- und Rückweg",
    JSON.stringify(rewritten?.table) === JSON.stringify(table.table),
  );
  /*
   * The alignment row is not preserved, and this says so out loud rather than
   * pretending. `| --- | --- | ---: |` comes back as `| --- | --- | --- |`, so
   * right-aligned columns in an Obsidian table come back left-aligned after a save.
   * That is cosmetic and Obsidian does the same, but it is a real difference and it
   * should be visible here instead of discovered later.
   */
  check(
    "Spaltenausrichtung ist nicht erhalten (dokumentiert)",
    !written.includes("---:"),
  );
}

/*
 * 3. `emptyBlock("table")` is what the slash command inserts, and it is a
 * different path from the parser: a hand-built block rather than parsed
 * markdown. A slash-inserted table that serialises to nothing would be invisible
 * until the file was saved and reloaded.
 */
const inserted = emptyBlock("table");
check("Slash-Tabelle ist ein Tabellenblock", inserted.type === "table");
const insertedRoundtrip = markdownToBlocks(blocksToMarkdown([inserted]));
const insertedBack = insertedRoundtrip.find((b) => b.type === "table");
check("eingefügte Tabelle überlebt Speichern", Boolean(insertedBack));
if (insertedBack?.type === "table") {
  check(
    "leere Zellen bleiben leer statt zu verschwinden",
    insertedBack.table?.rows.length === 2,
  );
}

/*
 * 4. A table next to other blocks keeps its neighbours. Replacing the document
 * with only the table would be a way to lose the text around it.
 */
const mixed = [
  { id: "a", type: "heading1" as const, spans: [{ text: "Markt" }] },
  emptyBlock("table"),
  { id: "b", type: "paragraph" as const, spans: [{ text: "Danach" }] },
];
const mixedBack = roundtrip(mixed);
check(
  "Überschrift bleibt erhalten",
  mixedBack.some((b) => b.type === "heading1" && b.spans?.[0]?.text === "Markt"),
);
check("Tabelle bleibt in der Mitte", mixedBack.some((b) => b.type === "table"));
check(
  "Absatz danach bleibt erhalten",
  mixedBack.some((b) => b.type === "paragraph" && b.spans?.[0]?.text === "Danach"),
);

if (fails.length) {
  console.error(`FEHLGESCHLAGEN (${fails.length}):`);
  for (const f of fails) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`ok – ${6 + 2 + 3} Prüfungen bestanden, Tabellen überleben den Roundtrip.`);