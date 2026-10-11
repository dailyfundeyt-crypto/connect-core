import {
  IconArrowDown,
  IconArrowUp,
  IconColumnInsertLeft,
  IconColumnInsertRight,
  IconColumnRemove,
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

  return (
    <div className="group/table relative my-1 w-full">
      <div className="overflow-x-auto rounded-lg border border-black/10">
        <table className="w-full min-w-[420px] border-collapse text-[14px]">
          <tbody>
            {table.rows.map((row, rowIndex) => {
              const isHeader = table.headerRow && rowIndex === 0;
              const Cell = isHeader ? "th" : "td";
              return (
                <tr key={rowIndex}>
                  {Array.from({ length: columns }).map((_, colIndex) => {
                    const value = row[colIndex] ?? "";
                    const active =
                      menu?.row === rowIndex && menu?.col === colIndex;
                    return (
                      <Cell
                        className={
                          isHeader
                            ? "border-b border-r border-black/10 bg-neutral-50/70 px-3 py-2 text-left font-semibold last:border-r-0"
                            : "border-b border-r border-black/8 px-3 py-2 text-left align-top last:border-r-0"
                        }
                        key={colIndex}
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
                              onClear={clear}
                              onClose={() => setMenu(null)}
                              onMoveRowDown={() =>
                                moveRow(rowIndex, 1)
                              }
                              onMoveRowUp={() => moveRow(rowIndex, -1)}
                              onRemoveColumn={() =>
                                removeColumn(colIndex)
                              }
                              onRemoveRow={() => removeRow(rowIndex)}
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
  onClear,
  onClose,
  onMoveRowDown,
  onMoveRowUp,
  onRemoveColumn,
  onRemoveRow,
  onToggleHeader,
  open,
}: {
  canRemoveColumn: boolean;
  canRemoveRow: boolean;
  onAddColumnLeft: () => void;
  onAddColumnRight: () => void;
  onAddRowAbove: () => void;
  onAddRowBelow: () => void;
  onClear: () => void;
  onClose: () => void;
  onMoveRowDown: () => void;
  onMoveRowUp: () => void;
  onRemoveColumn: () => void;
  onRemoveRow: () => void;
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