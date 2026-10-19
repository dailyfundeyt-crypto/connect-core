import { useMemo, useRef, useState, type ChangeEvent } from "react";
import {
  FileUp,
  ImageUp,
  Loader2,
  Package,
  Plus,
  QrCode,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@flux/components/ui/button";
import { Input } from "@flux/components/ui/input";
import { useAuth } from "@flux/lib/supabase/auth";
import { nextDeliveryId, type DeliveryFile, type DeliveryRow, type PurchaseItem } from "@flux/lib/supabase/snapshot";

const MAX_BYTES = 5 * 1024 * 1024;

type LieferungDashboardProps = {
  rows: DeliveryRow[];
  items: PurchaseItem[];
  onRowsChange: (next: DeliveryRow[]) => void;
};

export function LieferungDashboard({ rows, items, onRowsChange }: LieferungDashboardProps) {
  const auth = useAuth();
  const [filter, setFilter] = useState<"all" | "0" | "assigned" | "open">("all");
  const [previewBoxNo, setPreviewBoxNo] = useState<number | null>(null);
  const [uploadingFor, setUploadingFor] = useState<{ rowId: number; kind: "qr" | "invoice" } | null>(null);
  const qrInputRef = useRef<HTMLInputElement>(null);
  const invoiceInputRef = useRef<HTMLInputElement>(null);
  const [pendingRow, setPendingRow] = useState<{ rowId: number; kind: "qr" | "invoice" } | null>(null);

  const sortedRows = useMemo(() => {
    const map = new Map(rows.map((r) => [r.id, r]));
    return [...rows].sort((a, b) => {
      // 0 (unassigned) sorts to top
      if (a.boxNo === 0 && b.boxNo !== 0) return -1;
      if (a.boxNo !== 0 && b.boxNo === 0) return 1;
      return a.boxNo - b.boxNo;
    });
  }, [rows]);

  const stats = useMemo(() => {
    const assigned = rows.filter((r) => r.boxNo > 0).length;
    const open = rows.filter((r) => r.boxNo === 0).length;
    const withItems = rows.filter((r) => r.assignedItemIds.length > 0).length;
    const totalItemsAssigned = rows.reduce((s, r) => s + r.assignedItemIds.length, 0);
    const allItems = items.length;
    const packed = items.filter((i) => i.assignedBoxNo != null && i.assignedBoxNo > 0).length;
    return { assigned, open, withItems, totalItemsAssigned, allItems, packed };
  }, [rows, items]);

  const filteredRows = useMemo(() => {
    switch (filter) {
      case "0": return sortedRows.filter((r) => r.boxNo === 0);
      case "assigned": return sortedRows.filter((r) => r.boxNo > 0);
      case "open": return sortedRows.filter((r) => r.boxNo === 0 || !r.qr);
      default: return sortedRows;
    }
  }, [sortedRows, filter]);

  const handleAddRow = () => {
    const nextNo = rows.reduce((max, r) => Math.max(max, r.boxNo), 0) + 1;
    onRowsChange([...rows, { id: nextDeliveryId(rows), boxNo: 1, qr: null, invoice: null, assignedItemIds: [], notes: "" }]);
    setFilter("all");
    // Use local new id to scroll
  };

  const handleAddOpen = () => {
    onRowsChange([...rows, { id: nextDeliveryId(rows), boxNo: 0, qr: null, invoice: null, assignedItemIds: [], notes: "Offen (nicht zugewiesen)" }]);
  };

  const updateRow = (id: number, patch: Partial<DeliveryRow>) => {
    onRowsChange(rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };

  const handleDelete = (id: number) => {
    if (!confirm("Karton löschen?")) return;
    onRowsChange(rows.filter((r) => r.id !== id));
  };

  const handleFilePick = (rowId: number, kind: "qr" | "invoice") => {
    if (kind === "qr") qrInputRef.current?.click();
    else invoiceInputRef.current?.click();
    setPendingRow({ rowId, kind });
  };

  const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !pendingRow) return;
    if (!auth.client || auth.status.kind !== "signed_in") return;
    if (file.size > MAX_BYTES) {
      alert(`Datei zu groß (max. ${Math.round(MAX_BYTES / 1024 / 1024)} MB).`);
      return;
    }
    setUploadingFor({ rowId: pendingRow.rowId, kind: pendingRow.kind });
    try {
      const { uploadDeliveryFile } = await import("./delivery-storage");
      const url = await uploadDeliveryFile(auth.client, auth.status.user.id, file);
      const fileObj: DeliveryFile = {
        dataUrl: url,
        name: file.name,
        kind: file.type === "application/pdf" ? "pdf" : "image",
      };
      updateRow(pendingRow.rowId, pendingRow.kind === "qr" ? { qr: fileObj } : { invoice: fileObj });
    } catch (err) {
      alert("Upload fehlgeschlagen: " + (err instanceof Error ? err.message : ""));
    } finally {
      setUploadingFor(null);
      setPendingRow(null);
      event.target.value = "";
    }
  };

  const handleClearFile = (id: number, kind: "qr" | "invoice") => {
    updateRow(id, kind === "qr" ? { qr: null } : { invoice: null });
  };

  const itemsByBox = useMemo(() => {
    const m = new Map<number, PurchaseItem[]>();
    for (const item of items) {
      const b = item.assignedBoxNo ?? 0;
      if (b === 0) continue;
      const list = m.get(b) ?? [];
      list.push(item);
      m.set(b, list);
    }
    return m;
  }, [items]);

  const previewRow = previewBoxNo !== null ? rows.find((r) => r.boxNo === previewBoxNo) : null;

  return (
    <div className="space-y-6">
      {/* KPI */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KPI label="Pakete zugewiesen" value={`${stats.assigned}`} sub="mit Karton-Nr." tone="emerald" />
        <KPI label="Offen (0)" value={`${stats.open}`} sub="nicht zugewiesen" tone="amber" />
        <KPI label="Items gepackt" value={`${stats.packed}/${stats.allItems}`} sub="in Kartons" tone="blue" />
        <KPI label="Rechnungen" value={`${rows.filter((r) => r.invoice).length}/${rows.length}`} sub="hochgeladen" tone="neutral" />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 rounded-md border border-neutral-200 bg-white p-1 text-xs">
          {([
            ["all", "Alle"],
            ["0", "Paket 0"],
            ["assigned", "Zugewiesen"],
            ["open", "Offen"],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              className={`rounded px-3 py-1 font-medium transition-colors ${filter === key ? "bg-neutral-900 text-white" : "text-neutral-600 hover:bg-neutral-50"}`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex-1" />
        <Button size="sm" variant="outline" onClick={handleAddOpen}>
          <Plus className="h-3.5 w-3.5" /> Offenes Paket
        </Button>
        <Button size="sm" onClick={handleAddRow}>
          <Plus className="h-3.5 w-3.5" /> Karton
        </Button>
      </div>

      {/* Minimalist Notion-style table — 4 columns */}
      <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-neutral-200 bg-neutral-50/50 text-[11px] font-medium uppercase tracking-wide text-neutral-500">
              <th className="px-4 py-3 w-32">Karton-Nr.</th>
              <th className="px-4 py-3">QR-Code</th>
              <th className="px-4 py-3">Rechnung</th>
              <th className="px-4 py-3 w-44">Items / Notizen</th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.length === 0 ? (
              <tr><td colSpan={4} className="px-4 py-14 text-center text-sm text-neutral-400">Keine Kartons. Lege oben einen Karton oder ein offenes Paket an.</td></tr>
            ) : (
              filteredRows.map((row) => {
                const packed = itemsByBox.get(row.boxNo) ?? [];
                const isOpen = row.boxNo === 0;
                return (
                  <tr key={row.id} className="border-b border-neutral-100 last:border-0 hover:bg-neutral-50/30 align-top">
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-2">
                        <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg text-base font-bold ${isOpen ? "bg-amber-50 text-amber-700 border border-amber-200" : "bg-neutral-900 text-white"}`}>
                          {isOpen ? "0" : row.boxNo}
                        </span>
                        <div className="flex flex-col gap-1">
                          <button
                            type="button"
                            onClick={() => updateRow(row.id, { boxNo: Math.max(0, row.boxNo - 1) })}
                            className="rounded border border-neutral-200 px-1.5 py-0.5 text-[10px] text-neutral-500 hover:bg-neutral-50"
                            aria-label="Nr. verringern"
                          >-</button>
                          <button
                            type="button"
                            onClick={() => updateRow(row.id, { boxNo: row.boxNo + 1 })}
                            className="rounded border border-neutral-200 px-1.5 py-0.5 text-[10px] text-neutral-500 hover:bg-neutral-50"
                            aria-label="Nr. erhöhen"
                          >+</button>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <QrCell
                        file={row.qr}
                        uploading={uploadingFor?.rowId === row.id && uploadingFor.kind === "qr"}
                        onUpload={() => handleFilePick(row.id, "qr")}
                        onClear={() => handleClearFile(row.id, "qr")}
                        onPreview={() => setPreviewBoxNo(row.boxNo)}
                      />
                    </td>
                    <td className="px-4 py-4">
                      <InvoiceCell
                        file={row.invoice}
                        uploading={uploadingFor?.rowId === row.id && uploadingFor.kind === "invoice"}
                        onUpload={() => handleFilePick(row.id, "invoice")}
                        onClear={() => handleClearFile(row.id, "invoice")}
                      />
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-1 text-[11px] text-neutral-500">
                        <Package className="h-3 w-3" /> {packed.length} {packed.length === 1 ? "Item" : "Items"}
                      </div>
                      {row.notes !== undefined && (
                        <Input
                          value={row.notes}
                          onChange={(e) => updateRow(row.id, { notes: e.target.value })}
                          placeholder="Notizen …"
                          className="mt-1 h-7 text-[11px]"
                        />
                      )}
                      <button
                        type="button"
                        onClick={() => handleDelete(row.id)}
                        className="mt-1 inline-flex items-center gap-1 text-[10px] text-neutral-400 hover:text-rose-600"
                      >
                        <Trash2 className="h-3 w-3" /> Karton löschen
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Hidden file input */}
      <input ref={qrInputRef} type="file" accept="image/*,application/pdf" onChange={handleFile} className="hidden" />
      <input ref={invoiceInputRef} type="file" accept="image/*,application/pdf" onChange={handleFile} className="hidden" />

      {previewRow?.qr && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-900/40 px-4" onClick={() => setPreviewBoxNo(null)}>
          <div className="relative w-full max-w-2xl rounded-xl border border-neutral-200 bg-white p-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <header className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-neutral-900">Vorschau QR-Code · Karton {previewRow.boxNo}</h3>
              <button onClick={() => setPreviewBoxNo(null)} className="rounded p-1 text-neutral-400 hover:bg-neutral-100" aria-label="Schließen">
                <X className="h-4 w-4" />
              </button>
            </header>
            {previewRow.qr.kind === "pdf" ? (
              <iframe src={previewRow.qr.dataUrl} title={`QR-Code Box ${previewRow.boxNo}`} className="h-[70vh] w-full rounded-md border border-neutral-200 bg-white" />
            ) : (
              <img src={previewRow.qr.dataUrl} alt="" className="max-h-[78vh] max-w-full mx-auto rounded-md object-contain shadow-md" />
            )}
            <p className="mt-2 text-xs text-neutral-500">{previewRow.qr.name}</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================
// Sub-Components
// ============================================

function QrCell({ file, uploading, onUpload, onClear, onPreview }: { file: DeliveryFile | null; uploading: boolean; onUpload: () => void; onClear: () => void; onPreview: () => void }) {
  return (
    <div className="flex items-center gap-3">
      {file ? (
        <button
          type="button"
          onClick={onPreview}
          className="relative h-14 w-14 shrink-0 overflow-hidden rounded-md border border-neutral-200 bg-white transition-opacity hover:opacity-80"
          aria-label="QR-Vorschau öffnen"
        >
          {file.kind === "pdf" ? (
            <div className="grid h-full w-full place-items-center bg-rose-50 text-[9px] font-bold text-rose-700">PDF</div>
          ) : (
            <img src={file.dataUrl} alt="" className="h-full w-full object-cover" />
          )}
        </button>
      ) : (
        <div className="grid h-14 w-14 shrink-0 place-items-center rounded-md border border-dashed border-neutral-300 bg-neutral-50 text-neutral-300">
          <QrCode className="h-5 w-5" />
        </div>
      )}
      <div className="flex flex-col gap-1 text-[11px]">
        {file ? (
          <>
            <span className="line-clamp-1 max-w-[140px] font-medium text-neutral-700">{file.name}</span>
            <div className="flex gap-2">
              <button type="button" onClick={onUpload} className="text-[10px] font-medium text-neutral-500 hover:text-neutral-900">Ersetzen</button>
              <button type="button" onClick={onClear} className="text-[10px] font-medium text-rose-600 hover:text-rose-700">Entfernen</button>
            </div>
          </>
        ) : uploading ? (
          <span className="inline-flex items-center gap-1 text-neutral-500">
            <Loader2 className="h-3 w-3 animate-spin" /> Lädt hoch …
          </span>
        ) : (
          <button
            type="button"
            onClick={onUpload}
            className="inline-flex items-center gap-1 rounded border border-neutral-200 bg-white px-2 py-1 text-[10px] font-medium text-neutral-700 hover:bg-neutral-50"
          >
            <ImageUp className="h-3 w-3" /> Hochladen
          </button>
        )}
      </div>
    </div>
  );
}

function InvoiceCell({ file, uploading, onUpload, onClear }: { file: DeliveryFile | null; uploading: boolean; onUpload: () => void; onClear: () => void }) {
  return (
    <div className="flex items-center gap-3">
      {file ? (
        <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-md border border-neutral-200 bg-white">
          {file.kind === "pdf" ? (
            <div className="grid h-full w-full place-items-center bg-rose-50 text-[9px] font-bold text-rose-700">PDF</div>
          ) : (
            <img src={file.dataUrl} alt="" className="h-full w-full object-cover" />
          )}
        </div>
      ) : (
        <div className="grid h-14 w-14 shrink-0 place-items-center rounded-md border border-dashed border-neutral-300 bg-neutral-50 text-neutral-300">
          <FileUp className="h-5 w-5" />
        </div>
      )}
      <div className="flex flex-col gap-1 text-[11px]">
        {file ? (
          <>
            <span className="line-clamp-1 max-w-[140px] font-medium text-neutral-700">{file.name}</span>
            <div className="flex gap-2">
              <a href={file.dataUrl} target="_blank" rel="noreferrer" className="text-[10px] font-medium text-neutral-500 hover:text-neutral-900">Öffnen</a>
              <button type="button" onClick={onClear} className="text-[10px] font-medium text-rose-600 hover:text-rose-700">Entfernen</button>
            </div>
          </>
        ) : uploading ? (
          <span className="inline-flex items-center gap-1 text-neutral-500">
            <Loader2 className="h-3 w-3 animate-spin" /> Lädt hoch …
          </span>
        ) : (
          <button
            type="button"
            onClick={onUpload}
            className="inline-flex items-center gap-1 rounded border border-neutral-200 bg-white px-2 py-1 text-[10px] font-medium text-neutral-700 hover:bg-neutral-50"
          >
            <FileUp className="h-3 w-3" /> Hochladen
          </button>
        )}
      </div>
    </div>
  );
}

function KPI({ label, value, sub, tone }: { label: string; value: string; sub: string; tone: "neutral" | "emerald" | "amber" | "blue" }) {
  const tones: Record<string, string> = {
    neutral: "bg-neutral-50 text-neutral-700",
    emerald: "bg-emerald-50 text-emerald-700",
    amber: "bg-amber-50 text-amber-700",
    blue: "bg-blue-50 text-blue-700",
  };
  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4 shadow-sm">
      <p className="text-[10px] font-medium uppercase tracking-wide text-neutral-500">{label}</p>
      <p className={`mt-1.5 text-2xl font-bold tabular-nums ${tones[tone]?.split(" ")[1] ?? "text-neutral-900"}`}>{value}</p>
      <p className="mt-0.5 text-[11px] text-neutral-500">{sub}</p>
    </div>
  );
}
