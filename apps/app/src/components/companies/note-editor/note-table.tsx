import {
  IconArrowDown,
  IconArrowUp,
  IconColumnInsertLeft,
  IconColumnInsertRight,
  IconColumnRemove,
  IconPalette,
  IconRowInsertBottom,
  IconRowInsertTop,
  IconRowRemove,
  IconTable,
  IconTrash,
} from "@tabler/icons-react";
import { useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import type { NoteBlock } from "@/lib/companies/notes";

/**
 * A Notion-style table: add, remove and reorder rows and columns.
 *
 * Rows are stored as `string[][]` rather than as blocks, because a table is one block — indenting a
 * single cell into a separate block tree would make "delete this row" a tree operation and turn a
 * two-line change into a hundred. The cost is that a cell cannot hold marks; plain text per cell is
 * what Notion's simple table does too, and it keeps the Markdown round trip exact.
 *
 * Padding is what makes a table usable: a cell that is one character wide cannot be clicked, so
 * every cell gets a minimum width and the table scrolls horizontally rather than squashing.
 */
export function NoteTable({
  block,
  onChange,
}: {
  block: NoteBlock;
  onChange: (table: NonNullable<NoteBlock["table"]>) => void;
}) {
  const table = block.table ?? { rows: [[""]], headerRow: true };
  const [menu, setMenu] = useState<{ row: number; col: number } | null>(null);

  const columns = Math.max(1, ...table.rows.map((row) => row.length));

  const setCell = (row: number, col: number, value: string) => {
    const rows = table.rows.map((existing, index) => {
      const padded = [
        ...existing,
        ...Array(Math.max(0, columns - existing.length)).fill(""),
      ];
      if (index !== row) return padded;
      const next = [...padded];
      next[col] = value;
      return next;
    });
    onChange({ ...table, rows });
  };

  const addRow = (at: number) => {
    const rows = [...table.rows];
    rows.splice(at, 0, Array(columns).fill(""));
    onChange({ ...table, rows });
  };

  const removeRow = (index: number) => {
    // A table with no rows renders as a sliver and cannot be recovered from the UI, so the last
    // row stays and the whole block has to be deleted instead.
    if (table.rows.length <= 1) return;
    onChange({
      ...table,
      rows: table.rows.filter((_, i) => i !== index),
    });
  };

  const moveRow = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= table.rows.length) return;
    const rows = [...table.rows];
    [rows[index], rows[target]] = [rows[target], rows[index]];
    onChange({ ...table, rows });
  };

  const addColumn = (at: number) => {
    onChange({
      ...table,
      rows: table.rows.map((row) => [
        ...row.slice(0, at),
        "",
        ...row.slice(at),
      ]),
    });
  };

  const removeColumn = (index: number) => {
    if (columns <= 1) return;
    onChange({
      ...table,
      rows: table.rows.map((row) => row.filter((_, i) => i !== index)),
    });
  };

  const clear = () => {
    onChange({
      ...table,
      rows: Array.from({ length: table.rows.length }, () =>
        Array(columns).fill(""),
      ),
    });
  };

  /**
   * Sets the per-cell background colour. Stored on `table.cellBg` as a flat
   * row-major array padded to the table's column count; the writer fences
   * this below the table so the data rows stay readable.
   */
  const setCellBg = (row: number, col: number, color: string | null) => {
    const flat = (table.cellBg ?? []).slice(0, table.rows.length * columns);
    while (flat.length < table.rows.length * columns) flat.push("");
    const idx = row * columns + col;
    flat[idx] = color ?? "";
    onChange({ ...table, cellBg: flat });
  };

  const setRowBg = (row: number, color: string | null) => {
    const list = (table.rowBg ?? []).slice(0, table.rows.length);
    while (list.length < table.rows.length) list.push("");
    list[row] = color ?? "";
    onChange({ ...table, rowBg: list });
  };

  return (
    <div className="group/table relative my-1 w-full">
      <div className="overflow-x-auto rounded-lg border border-black/10">
        <table className="w-full min-w-[420px] border-collapse text-[14px]">
          <tbody>
            {table.rows.map((row, rowIndex) => {
              const isHeader = table.headerRow && rowIndex === 0;
              const Cell = isHeader ? "th" : "td";
              const rowBg = table.rowBg?.[rowIndex];
              const cellBgRow = isHeader ? undefined : table.cellBg?.slice(rowIndex * columns, rowIndex * columns + columns);
              return (
                <tr key={rowIndex} style={rowBg ? { backgroundColor: rowBg } : undefined}>
                  {Array.from({ length: columns }).map((_, colIndex) => {
                    const value = row[colIndex] ?? "";
                    const active =
                      menu?.row === rowIndex && menu?.col === colIndex;
                    const cellBg = cellBgRow?.[colIndex];
                    return (
                      <Cell
                        className={
                          isHeader
                            ? "border-b border-r border-black/10 bg-neutral-50/70 px-3 py-2 text-left font-semibold last:border-r-0"
                            : "border-b border-r border-black/8 px-3 py-2 text-left align-top last:border-r-0"
                        }
                        key={colIndex}
                        style={cellBg ? { backgroundColor: cellBg } : undefined}
                      >
                        <div className="relative">
                          <input
                            aria-label={`Zelle ${rowIndex + 1}, ${colIndex + 1}`}
                            className="w-full min-w-[5rem] bg-transparent outline-none placeholder:text-neutral-300"
                            onChange={(event) =>
                              setCell(rowIndex, colIndex, event.target.value)
                            }
                            onFocus={() =>
                              setMenu({ row: rowIndex, col: colIndex })
                            }
                            placeholder={
                              isHeader ? "Überschrift" : "Leer"
                            }
                            value={value}
                          />
                          {active ? (
                            <CellMenu
                              canRemoveColumn={columns > 1}
                              canRemoveRow={table.rows.length > 1}
                              onAddColumnLeft={() => addColumn(colIndex)}
                              onAddColumnRight={() =>
                                addColumn(colIndex + 1)
                              }
                              onAddRowAbove={() => addRow(rowIndex)}
                              onAddRowBelow={() => addRow(rowIndex + 1)}
                              onCellColor={(color) =>
                                setCellBg(rowIndex, colIndex, color)
                              }
                              onClear={clear}
                              onClose={() => setMenu(null)}
                              onMoveRowDown={() =>
                                moveRow(rowIndex, 1)
                              }
                              onMoveRowUp={() => moveRow(rowIndex, -1)}
                              onRemoveColumn={() =>
                                removeColumn(colIndex)
                              }
                              onRemoveRow={() =>
                                removeRow(rowIndex)
                              }
                              onRowColor={(color) =>
                                setRowBg(rowIndex, color)
                              }
                              onToggleHeader={() =>
                                onChange({
                                  ...table,
                                  headerRow: !table.headerRow,
                                })
                              }
                              open={true}
                            />
                          ) : null}
                        </div>
                      </Cell>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** The per-cell menu. Opens on focus so a keyboard user reaches it without a right-click. */
function CellMenu({
  canRemoveColumn,
  canRemoveRow,
  onAddColumnLeft,
  onAddColumnRight,
  onAddRowAbove,
  onAddRowBelow,
  onCellColor,
  onClear,
  onClose,
  onMoveRowDown,
  onMoveRowUp,
  onRemoveColumn,
  onRemoveRow,
  onRowColor,
  onToggleHeader,
  open,
}: {
  canRemoveColumn: boolean;
  canRemoveRow: boolean;
  onAddColumnLeft: () => void;
  onAddColumnRight: () => void;
  onAddRowAbove: () => void;
  onAddRowBelow: () => void;
  /** Apply (or clear) a per-cell background colour. */
  onCellColor: (color: string | null) => void;
  onClear: () => void;
  onClose: () => void;
  onMoveRowDown: () => void;
  onMoveRowUp: () => void;
  onRemoveColumn: () => void;
  onRemoveRow: () => void;
  /** Apply (or clear) a per-row background colour. */
  onRowColor: (color: string | null) => void;
  onToggleHeader: () => void;
  open: boolean;
}) {
  return (
    <DropdownMenu onOpenChange={(next) => !next && onClose()} open={open}>
      <DropdownMenuTrigger
        render={
          <Button
            aria-label="Tabellen-Aktionen"
            className="absolute -top-8 right-0 size-6 rounded-md border border-black/10 bg-white text-neutral-500 shadow-sm"
            size="icon"
            type="button"
            variant="ghost"
          />
        }
      >
        <IconTable className="size-3.5" stroke={1.5} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56 rounded-xl p-1.5">
        <DropdownMenuItem
          className="gap-2 rounded-lg px-2.5 py-2"
          onClick={onAddRowAbove}
        >
          <IconRowInsertTop className="size-4" stroke={1.5} />
          Zeile oberhalb
        </DropdownMenuItem>
        <DropdownMenuItem
          className="gap-2 rounded-lg px-2.5 py-2"
          onClick={onAddRowBelow}
        >
          <IconRowInsertBottom className="size-4" stroke={1.5} />
          Zeile unterhalb
        </DropdownMenuItem>
        <DropdownMenuItem
          className="gap-2 rounded-lg px-2.5 py-2"
          disabled={!canRemoveRow}
          onClick={onRemoveRow}
        >
          <IconRowRemove className="size-4" stroke={1.5} />
          Zeile löschen
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="gap-2 rounded-lg px-2.5 py-2"
          onClick={onAddColumnLeft}
        >
          <IconColumnInsertLeft className="size-4" stroke={1.5} />
          Spalte links
        </DropdownMenuItem>
        <DropdownMenuItem
          className="gap-2 rounded-lg px-2.5 py-2"
          onClick={onAddColumnRight}
        >
          <IconColumnInsertRight className="size-4" stroke={1.5} />
          Spalte rechts
        </DropdownMenuItem>
        <DropdownMenuItem
          className="gap-2 rounded-lg px-2.5 py-2"
          disabled={!canRemoveColumn}
          onClick={onRemoveColumn}
        >
          <IconColumnRemove className="size-4" stroke={1.5} />
          Spalte löschen
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="gap-2 rounded-lg px-2.5 py-2"
          onClick={onMoveRowUp}
        >
          <IconArrowUp className="size-4" stroke={1.5} />
          Zeile nach oben
        </DropdownMenuItem>
        <DropdownMenuItem
          className="gap-2 rounded-lg px-2.5 py-2"
          onClick={onMoveRowDown}
        >
          <IconArrowDown className="size-4" stroke={1.5} />
          Zeile nach unten
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="gap-2 rounded-lg px-2.5 py-2"
          onClick={onToggleHeader}
        >
          <IconTable className="size-4" stroke={1.5} />
          Kopfzeile umschalten
        </DropdownMenuItem>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger className="gap-2 rounded-lg px-2.5 py-2">
            <IconPalette className="size-4" stroke={1.5} />
            Zeilenfarbe
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-44 rounded-xl p-1.5">
            <ColorChoices onPick={(color) => onRowColor(color)} />
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger className="gap-2 rounded-lg px-2.5 py-2">
            <IconPalette className="size-4" stroke={1.5} />
            Zellenfarbe
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-44 rounded-xl p-1.5">
            <ColorChoices onPick={(color) => onCellColor(color)} />
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuItem
          className="gap-2 rounded-lg px-2.5 py-2 text-destructive"
          onClick={onClear}
        >
          <IconTrash className="size-4" stroke={1.5} />
          Inhalt leeren
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-[11px] uppercase tracking-wide opacity-60">
          Esc zum Schließen
        </DropdownMenuLabel>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const TABLE_COLORS = [
  "transparent",
  "#fef3c7",
  "#dcfce7",
  "#dbeafe",
  "#f3e8ff",
  "#fee2e2",
];

function ColorChoices({ onPick }: { onPick: (color: string | null) => void }) {
  return (
    <div className="flex flex-col gap-1">
      {TABLE_COLORS.map((color) => (
        <button
          className="flex items-center gap-2 rounded-md px-2 py-1 text-[12px] hover:bg-neutral-100 dark:hover:bg-white/10"
          key={color}
          onClick={() => onPick(color === "transparent" ? null : color)}
          type="button"
        >
          <span
            className="size-4 rounded border border-black/10"
            style={{ backgroundColor: color === "transparent" ? "transparent" : color }}
          />
          {color === "transparent" ? "Keine Farbe" : color}
        </button>
      ))}
    </div>
  );
}