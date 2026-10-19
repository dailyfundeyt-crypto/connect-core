// Import flows (CSV / Sheets / Shopify) and the product detail editor.

import { useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent, type ReactNode } from "react"
import {
  ArrowRight,
  Boxes,
  Check,
  ChevronRight,
  FileSpreadsheet,
  FileUp,
  Globe,
  Loader2,
  Plus,
  Search,
  SheetIcon,
  ShoppingCart,
  Sparkles,
  Trash2,
  Upload,
  Wand2,
  X,
} from "lucide-react"
import {
  addManyProductsFn,
  formatPrice,
  marginFor,
  parseCsv,
  type CsvProduct,
  type Product,
  type ProductStatus,
  type SourceId,
} from "./product-store"

const PLATFORMS: { id: SourceId; label: string; icon: ReactNode }[] = [
  { id: "sheets", label: "Google Sheets", icon: <FileSpreadsheet size={14} /> },
  { id: "csv", label: "CSV Upload", icon: <Boxes size={14} /> },
  { id: "shopify", label: "Shopify", icon: <Globe size={14} /> },
  { id: "ebay", label: "eBay", icon: <ShoppingCart size={14} /> },
  { id: "kleinanzeigen", label: "Kleinanzeigen", icon: <Boxes size={14} /> },
]

const STATUSES: { id: ProductStatus; label: string }[] = [
  { id: "offen", label: "Offen" },
  { id: "listed", label: "Gelistet" },
  { id: "verkauft", label: "Verkauft" },
]

type Tab = "csv" | "sheets" | "shopify"

type Props = {
  defaultSource: SourceId
  defaultTab?: Tab
  onClose: () => void
  onImported: (count: number) => void
}

export function ImportModal({ defaultSource, defaultTab, onClose, onImported }: Props) {
  const [tab, setTab] = useState<Tab>(defaultTab ?? (defaultSource === "csv" ? "csv" : defaultSource === "shopify" ? "shopify" : "sheets"))
  const [parsed, setParsed] = useState<CsvProduct[]>([])
  const [filename, setFilename] = useState<string | null>(null)
  const [parseError, setParseError] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [source, setSource] = useState<SourceId>(defaultSource)
  const [submitting, setSubmitting] = useState(false)

  // Sheets
  const [sheetUrl, setSheetUrl] = useState("")
  const [sheetStatus, setSheetStatus] = useState<"idle" | "syncing" | "ready" | "error">("idle")
  const [sheetError, setSheetError] = useState<string | null>(null)
  const [sheetProducts, setSheetProducts] = useState<CsvProduct[]>([])

  // Shopify
  const [shopifyUrl, setShopifyUrl] = useState("")
  const [shopifyStatus, setShopifyStatus] = useState<"idle" | "syncing" | "ready" | "error">("idle")
  const [shopifyError, setShopifyError] = useState<string | null>(null)
  const [shopifyProducts, setShopifyProducts] = useState<CsvProduct[]>([])

  const fileRef = useRef<HTMLInputElement>(null)

  const reset = () => {
    setParsed([])
    setFilename(null)
    setParseError(null)
    setSheetStatus("idle")
    setSheetError(null)
    setSheetProducts([])
    setShopifyStatus("idle")
    setShopifyError(null)
    setShopifyProducts([])
  }

  useEffect(() => {
    reset()
  }, [tab])

  const importList = useMemo(() => {
    if (tab === "csv") return parsed
    if (tab === "sheets") return sheetProducts
    return shopifyProducts
  }, [tab, parsed, sheetProducts, shopifyProducts])

  const handleFile = (file: File) => {
    setParseError(null)
    if (!file.name.toLowerCase().endsWith(".csv") && !file.type.includes("csv") && !file.type.includes("text")) {
      setParseError("Bitte eine .csv-Datei wählen.")
      return
    }
    setFilename(file.name)
    const reader = new FileReader()
    reader.onload = () => {
      const text = String(reader.result ?? "")
      const rows = parseCsv(text)
      if (rows.length === 0) {
        setParseError("Keine passenden Zeilen gefunden. Erwartete Spalten: title, price (optional: ean, description, stock, status).")
        setParsed([])
        return
      }
      setParsed(rows)
    }
    reader.onerror = () => setParseError("Datei konnte nicht gelesen werden.")
    reader.readAsText(file)
  }

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) handleFile(file)
  }

  const syncSheets = async () => {
    setSheetStatus("syncing")
    setSheetError(null)
    await new Promise((r) => setTimeout(r, 800))
    const idMatch = sheetUrl.match(/\/d\/([a-zA-Z0-9-_]+)/)
    if (!sheetUrl.trim() || (!idMatch && sheetUrl.trim().length < 8)) {
      setSheetStatus("error")
      setSheetError("Bitte gültige Google-Sheets-URL oder Sheet-ID eingeben.")
      return
    }
    // Simulated fetch: produce a couple of demo rows so the user sees the flow.
    const demo: CsvProduct[] = [
      {
        title: "AC/DC – Back in Black (Remaster)",
        price: 22.5,
        ean: "0888751445112",
        description: "Klassiker-Remaster aus 2020, sehr guter Zustand.",
        stock: 1,
        status: "offen",
        properties: [
          { k: "EAN", v: "0888751445112" },
          { k: "Import", v: "Sheets" },
        ],
      },
      {
        title: "Queen – News of the World",
        price: 18.0,
        ean: "0888751445222",
        description: "Erstpressung UK EMI 1977.",
        stock: 1,
        status: "offen",
        properties: [
          { k: "EAN", v: "0888751445222" },
          { k: "Import", v: "Sheets" },
        ],
      },
    ]
    setSheetProducts(demo)
    setSheetStatus("ready")
  }

  const importShopify = async () => {
    setShopifyStatus("syncing")
    setShopifyError(null)
    await new Promise((r) => setTimeout(r, 800))
    if (!/^https?:\/\//i.test(shopifyUrl.trim())) {
      setShopifyStatus("error")
      setShopifyError("Bitte gültige Shopify-Shop-URL (https://…myshopify.com) eingeben.")
      return
    }
    const demo: CsvProduct[] = [
      {
        title: "Nirvana – Nevermind (DGC 1991)",
        price: 28.0,
        ean: "0720642445026",
        description: "Erste Pressung DGC, sehr guter Zustand.",
        stock: 1,
        status: "offen",
        properties: [
          { k: "EAN", v: "0720642445026" },
          { k: "Import", v: "Shopify" },
        ],
      },
      {
        title: "Radiohead – OK Computer",
        price: 31.0,
        ean: "0720642445123",
        description: "Original Parlophone 1997.",
        stock: 1,
        status: "offen",
        properties: [
          { k: "EAN", v: "0720642445123" },
          { k: "Import", v: "Shopify" },
        ],
      },
    ]
    setShopifyProducts(demo)
    setShopifyStatus("ready")
  }

  const confirmImport = () => {
    if (importList.length === 0) return
    setSubmitting(true)
    const created = addManyProductsFn(
      importList.map((row) => ({
        title: row.title,
        price: formatPrice(row.price),
        margin: marginFor(row.price),
        stock: row.stock ?? 1,
        status: row.status ?? "offen",
        properties: row.properties ?? [],
        sources: [source],
        importSource: source,
        description: row.description,
        ean: row.ean,
      })),
    )
    onImported(created.length)
    setSubmitting(false)
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/70 px-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-white/10 bg-[#0a0c12] shadow-2xl shadow-black/60"
      >
        <header className="flex items-center justify-between border-b border-white/[0.06] p-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-sky-300/70">Quelle verbinden</p>
            <h2 className="mt-0.5 text-lg font-semibold text-white">Produkte importieren</h2>
          </div>
          <button
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-md text-white/60 hover:bg-white/[0.06] hover:text-white"
            aria-label="Schließen"
          >
            <X size={16} />
          </button>
        </header>

        <div className="flex border-b border-white/[0.06]">
          {(
            [
              { id: "csv" as Tab, label: "CSV-Upload", icon: <Upload size={13} /> },
              { id: "sheets" as Tab, label: "Google Sheets", icon: <FileSpreadsheet size={13} /> },
              { id: "shopify" as Tab, label: "Shopify", icon: <Globe size={13} /> },
            ]
          ).map((t) => {
            const active = tab === t.id
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex flex-1 items-center justify-center gap-2 border-b-2 px-3 py-3 text-xs font-semibold transition-all ${
                  active
                    ? "border-sky-400/60 text-sky-100"
                    : "border-transparent text-white/55 hover:text-white/80"
                }`}
              >
                {t.icon}
                {t.label}
              </button>
            )
          })}
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {tab === "csv" && (
            <CsvPanel
              filename={filename}
              rows={parsed}
              error={parseError}
              isDragging={isDragging}
              onDragOver={(e) => {
                e.preventDefault()
                setIsDragging(true)
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              onPick={() => fileRef.current?.click()}
              onRemove={() => {
                setFilename(null)
                setParsed([])
                setParseError(null)
              }}
            >
              <input
                ref={fileRef}
                type="file"
                accept=".csv,text/csv,text/plain"
                className="hidden"
                onChange={(e: ChangeEvent<HTMLInputElement>) => {
                  const f = e.target.files?.[0]
                  if (f) handleFile(f)
                  e.target.value = ""
                }}
              />
            </CsvPanel>
          )}

          {tab === "sheets" && (
            <SheetsPanel
              url={sheetUrl}
              onUrl={setSheetUrl}
              status={sheetStatus}
              error={sheetError}
              products={sheetProducts}
              onSync={syncSheets}
            />
          )}

          {tab === "shopify" && (
            <ShopifyPanel
              url={shopifyUrl}
              onUrl={setShopifyUrl}
              status={shopifyStatus}
              error={shopifyError}
              products={shopifyProducts}
              onImport={importShopify}
            />
          )}

          {importList.length > 0 && (
            <div className="mt-4">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-white/40">
                Vorschau · {importList.length} Produkt{importList.length === 1 ? "" : "e"}
              </p>
              <ul className="mt-2 max-h-44 space-y-1 overflow-y-auto rounded-xl border border-white/[0.05] bg-white/[0.02] p-2 text-xs text-white/75">
                {importList.slice(0, 12).map((p, i) => (
                  <li key={i} className="flex items-center justify-between gap-3 px-1">
                    <span className="truncate">{p.title}</span>
                    <span className="shrink-0 font-mono text-white/55">{formatPrice(p.price)}</span>
                  </li>
                ))}
                {importList.length > 12 && (
                  <li className="px-1 text-white/40">+ {importList.length - 12} weitere</li>
                )}
              </ul>
            </div>
          )}
        </div>

        <footer className="flex items-center justify-between gap-3 border-t border-white/[0.06] bg-white/[0.02] p-4">
          <label className="flex items-center gap-2 text-xs text-white/65">
            <span>Importieren in</span>
            <select
              value={source}
              onChange={(e) => setSource(e.target.value as SourceId)}
              className="h-8 rounded-md border border-white/[0.08] bg-white/[0.04] px-2 text-xs text-white outline-none focus:border-sky-400/40"
            >
              {PLATFORMS.map((p) => (
                <option key={p.id} value={p.id} className="bg-[#0a0c12]">
                  {p.label}
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="h-10 rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 text-sm font-semibold text-white/80 hover:bg-white/[0.08]"
            >
              Abbrechen
            </button>
            <button
              type="button"
              disabled={importList.length === 0 || submitting}
              onClick={confirmImport}
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-gradient-to-r from-sky-400 to-cyan-300 px-5 text-sm font-semibold text-slate-950 transition-all hover:from-sky-300 hover:to-cyan-200 disabled:opacity-50"
            >
              {submitting ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
              {importList.length} Produkt{importList.length === 1 ? "" : "e"} übernehmen
            </button>
          </div>
        </footer>
      </div>
    </div>
  )
}

function CsvPanel({
  filename,
  rows,
  error,
  isDragging,
  onDragOver,
  onDragLeave,
  onDrop,
  onPick,
  onRemove,
  children,
}: {
  filename: string | null
  rows: CsvProduct[]
  error: string | null
  isDragging: boolean
  onDragOver: (e: DragEvent<HTMLDivElement>) => void
  onDragLeave: () => void
  onDrop: (e: DragEvent<HTMLDivElement>) => void
  onPick: () => void
  onRemove: () => void
  children: ReactNode
}) {
  return (
    <div className="space-y-3">
      <p className="text-xs text-white/65">
        CSV-Datei mit Spalten <code className="rounded bg-white/[0.06] px-1 py-0.5">title</code> und{" "}
        <code className="rounded bg-white/[0.06] px-1 py-0.5">price</code> (optional{" "}
        <code className="rounded bg-white/[0.06] px-1 py-0.5">ean</code>,{" "}
        <code className="rounded bg-white/[0.06] px-1 py-0.5">description</code>,{" "}
        <code className="rounded bg-white/[0.06] px-1 py-0.5">stock</code>,{" "}
        <code className="rounded bg-white/[0.06] px-1 py-0.5">status</code>).
      </p>
      <div
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        className={`relative flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed p-8 text-center transition-all ${
          isDragging
            ? "border-sky-400/60 bg-sky-400/5"
            : "border-white/15 bg-white/[0.02] hover:bg-white/[0.04]"
        }`}
      >
        <div className="grid h-12 w-12 place-items-center rounded-xl bg-sky-400/10 text-sky-200 ring-1 ring-sky-400/30">
          <FileUp size={20} />
        </div>
        <p className="text-sm font-semibold text-white">CSV-Datei hierher ziehen</p>
        <p className="text-xs text-white/55">oder per Klick auswählen</p>
        <button
          type="button"
          onClick={onPick}
          className="mt-1 inline-flex h-9 items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 text-xs font-semibold text-white/85 hover:bg-white/[0.08]"
        >
          <Upload size={13} />
          Datei wählen
        </button>
        {children}
      </div>

      {filename && (
        <div className="flex items-center justify-between gap-2 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-xs text-white/80">
          <div className="flex min-w-0 items-center gap-2">
            <FileUp size={13} className="shrink-0 text-sky-200" />
            <span className="truncate font-mono">{filename}</span>
            <span className="shrink-0 rounded-md bg-sky-400/15 px-1.5 py-0.5 text-[10px] font-semibold text-sky-100 ring-1 ring-sky-400/30">
              {rows.length} Zeilen
            </span>
          </div>
          <button
            type="button"
            onClick={onRemove}
            className="rounded-md p-1 text-white/55 hover:bg-white/[0.06] hover:text-rose-200"
            aria-label="Datei entfernen"
          >
            <Trash2 size={12} />
          </button>
        </div>
      )}

      {error && (
        <p className="rounded-xl border border-rose-500/20 bg-rose-500/5 px-3 py-2 text-xs text-rose-200">
          {error}
        </p>
      )}

      <p className="text-[11px] text-white/40">
        Tipp: Trennzeichen ist Komma, Anführungszeichen werden unterstützt. Beispiel:
        <code className="ml-1 rounded bg-white/[0.06] px-1.5 py-0.5 text-white/60">
          title,price,ean,description,stock,status
        </code>
      </p>
    </div>
  )
}

function SheetsPanel({
  url,
  onUrl,
  status,
  error,
  products,
  onSync,
}: {
  url: string
  onUrl: (v: string) => void
  status: "idle" | "syncing" | "ready" | "error"
  error: string | null
  products: CsvProduct[]
  onSync: () => void
}) {
  return (
    <div className="space-y-3">
      <p className="text-xs text-white/65">
        Füge die URL deines Google-Sheets ein. Flux erkennt die Spalten automatisch und synchronisiert die Daten
        alle 5 Minuten.
      </p>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <FileSpreadsheet size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sky-300" />
          <input
            value={url}
            onChange={(e) => onUrl(e.target.value)}
            placeholder="https://docs.google.com/spreadsheets/d/…"
            className="h-10 w-full rounded-xl border border-white/[0.06] bg-white/[0.03] pl-9 pr-3 text-sm text-white outline-none placeholder:text-white/30 focus:border-sky-400/40"
          />
        </div>
        <button
          type="button"
          onClick={onSync}
          disabled={status === "syncing" || !url.trim()}
          className="inline-flex h-10 items-center gap-2 rounded-xl bg-gradient-to-r from-sky-400 to-cyan-300 px-4 text-sm font-semibold text-slate-950 transition-all hover:from-sky-300 hover:to-cyan-200 disabled:opacity-50"
        >
          {status === "syncing" ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
          Sync
        </button>
      </div>

      {error && (
        <p className="rounded-xl border border-rose-500/20 bg-rose-500/5 px-3 py-2 text-xs text-rose-200">{error}</p>
      )}

      {status === "ready" && (
        <p className="inline-flex items-center gap-1.5 text-[11px] text-emerald-200">
          <Check size={11} /> {products.length} Zeilen gefunden · Vorschau unten
        </p>
      )}

      <div className="rounded-xl border border-white/[0.05] bg-white/[0.02] p-3 text-[11px] text-white/55">
        <p className="font-semibold text-white/80">Erforderliche Spalten:</p>
        <ul className="mt-1 list-disc space-y-0.5 pl-4">
          <li>title – Produktname</li>
          <li>price – Verkaufspreis (€)</li>
          <li>ean – Barcode (optional)</li>
          <li>stock – Bestand (optional)</li>
        </ul>
      </div>
    </div>
  )
}

function ShopifyPanel({
  url,
  onUrl,
  status,
  error,
  products,
  onImport,
}: {
  url: string
  onUrl: (v: string) => void
  status: "idle" | "syncing" | "ready" | "error"
  error: string | null
  products: CsvProduct[]
  onImport: () => void
}) {
  return (
    <div className="space-y-3">
      <p className="text-xs text-white/65">
        Verbinde deinen Shopify-Shop, um Produkte und Varianten direkt zu importieren. API-Token hinterlegst du
        in den Einstellungen.
      </p>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Globe size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sky-300" />
          <input
            value={url}
            onChange={(e) => onUrl(e.target.value)}
            placeholder="https://dein-shop.myshopify.com"
            className="h-10 w-full rounded-xl border border-white/[0.06] bg-white/[0.03] pl-9 pr-3 text-sm text-white outline-none placeholder:text-white/30 focus:border-sky-400/40"
          />
        </div>
        <button
          type="button"
          onClick={onImport}
          disabled={status === "syncing" || !url.trim()}
          className="inline-flex h-10 items-center gap-2 rounded-xl bg-gradient-to-r from-sky-400 to-cyan-300 px-4 text-sm font-semibold text-slate-950 transition-all hover:from-sky-300 hover:to-cyan-200 disabled:opacity-50"
        >
          {status === "syncing" ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
          Import
        </button>
      </div>

      {error && (
        <p className="rounded-xl border border-rose-500/20 bg-rose-500/5 px-3 py-2 text-xs text-rose-200">{error}</p>
      )}

      {status === "ready" && (
        <p className="inline-flex items-center gap-1.5 text-[11px] text-emerald-200">
          <Check size={11} /> {products.length} Produkte gefunden · Vorschau unten
        </p>
      )}

      <p className="rounded-xl border border-white/[0.05] bg-white/[0.02] px-3 py-2 text-[11px] text-white/55">
        Beim ersten Import werden Titel, Preis, Bilder, Varianten und Bestand synchronisiert. Bestand-Updates laufen
        automatisch alle 15 Minuten.
      </p>
    </div>
  )
}

// =====================================================================
// Product detail editor
// =====================================================================

type DetailProps = {
  product: Product
  onClose: () => void
  onChange: (next: Product) => void
  onPost: () => void
  onDelete: () => void
}

export function ProductDetailModal({ product, onClose, onChange, onPost, onDelete }: DetailProps) {
  const [title, setTitle] = useState(product.title)
  const [price, setPrice] = useState(product.price.replace(/[€\s]/g, "").replace(",", "."))
  const [status, setStatus] = useState<ProductStatus>(product.status)
  const [stock, setStock] = useState(String(product.stock))
  const [description, setDescription] = useState(product.description ?? "")
  const [ean, setEan] = useState(product.ean ?? "")
  const [property, setProperty] = useState("")
  const [properties, setProperties] = useState(product.properties)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    setTitle(product.title)
    setPrice(product.price.replace(/[€\s]/g, "").replace(",", "."))
    setStatus(product.status)
    setStock(String(product.stock))
    setDescription(product.description ?? "")
    setEan(product.ean ?? "")
    setProperties(product.properties)
  }, [product.id])

  const margin = useMemo(() => {
    const n = Number(price)
    if (!Number.isFinite(n) || n <= 0) return "0 %"
    const m = ((n - 18.5) / n) * 100
    return `${Math.round(Math.max(0, Math.min(99, m)))} %`
  }, [price])

  const save = async () => {
    setSaving(true)
    setSaved(false)
    // Keep the dedicated `Status` property in sync with the top-level status
    // so cards never show a stale value.
    const otherProps = properties.filter((p) => p.k.toLowerCase() !== "status")
    const mergedProps = [{ k: "Status", v: status }, ...otherProps]
    onChange({
      ...product,
      title: title.trim() || product.title,
      price: formatPrice(Number(price) || 0),
      margin,
      stock: Math.max(0, Math.floor(Number(stock) || 0)),
      status,
      description: description.trim() || undefined,
      ean: ean.trim() || undefined,
      properties: mergedProps,
    })
    setSaving(false)
    setSaved(true)
    window.setTimeout(() => setSaved(false), 1500)
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 px-4 backdrop-blur-sm" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-white/10 bg-[#0a0c12] shadow-2xl shadow-black/60"
      >
        <header className="flex items-center justify-between border-b border-white/[0.06] p-4">
          <div>
            <p className="font-mono text-[10px] font-semibold uppercase tracking-widest text-sky-300/70">
              {product.id}
            </p>
            <h2 className="mt-0.5 truncate text-lg font-semibold text-white">{title || "Produkt"}</h2>
          </div>
          <button
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-md text-white/60 hover:bg-white/[0.06] hover:text-white"
            aria-label="Schließen"
          >
            <X size={16} />
          </button>
        </header>

        <div className="flex-1 space-y-3 overflow-y-auto p-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Titel">
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="h-10 w-full rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 text-sm text-white outline-none focus:border-sky-400/40"
              />
            </Field>
            <Field label="EAN">
              <input
                value={ean}
                onChange={(e) => setEan(e.target.value)}
                placeholder="0000000000000"
                className="h-10 w-full rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 font-mono text-sm text-white outline-none placeholder:text-white/30 focus:border-sky-400/40"
              />
            </Field>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Preis (€)">
              <input
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                className="h-10 w-full rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 font-mono text-sm text-white outline-none focus:border-sky-400/40"
              />
            </Field>
            <Field label="Bestand">
              <input
                value={stock}
                onChange={(e) => setStock(e.target.value)}
                className="h-10 w-full rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 font-mono text-sm text-white outline-none focus:border-sky-400/40"
              />
            </Field>
            <Field label="Status">
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as ProductStatus)}
                className="h-10 w-full appearance-none rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 text-sm text-white outline-none focus:border-sky-400/40"
              >
                {STATUSES.map((s) => (
                  <option key={s.id} value={s.id} className="bg-[#0a0c12]">
                    {s.label}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <Field label="Beschreibung">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-2 text-sm text-white outline-none focus:border-sky-400/40"
              placeholder="AI-Vorschlag, eigene Notizen, Zustand …"
            />
          </Field>

          <div>
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-white/40">Eigenschaften</p>
            <div className="space-y-1.5">
              {properties.map((p, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    value={p.k}
                    onChange={(e) =>
                      setProperties(properties.map((x, j) => (i === j ? { ...x, k: e.target.value } : x)))
                    }
                    className="h-8 flex-1 rounded-md border border-white/[0.05] bg-white/[0.02] px-2 text-xs text-white/80 outline-none"
                  />
                  <input
                    value={p.v}
                    onChange={(e) =>
                      setProperties(properties.map((x, j) => (i === j ? { ...x, v: e.target.value } : x)))
                    }
                    className="h-8 flex-1 rounded-md border border-white/[0.05] bg-white/[0.02] px-2 text-xs text-white/85 outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setProperties(properties.filter((_, j) => j !== i))}
                    className="rounded-md p-1 text-white/45 hover:bg-white/[0.06] hover:text-rose-200"
                    aria-label="Eigenschaft entfernen"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
              <div className="flex items-center gap-2">
                <input
                  value={property}
                  onChange={(e) => setProperty(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && property.includes(":")) {
                      const [k, ...rest] = property.split(":")
                      setProperties([...properties, { k: k.trim(), v: rest.join(":").trim() }])
                      setProperty("")
                    }
                  }}
                  placeholder='z.B. "Zustand: Near Mint" + Enter'
                  className="h-8 flex-1 rounded-md border border-white/[0.05] bg-white/[0.02] px-2 text-xs text-white/80 outline-none placeholder:text-white/30"
                />
                <button
                  type="button"
                  onClick={() => {
                    if (!property.trim()) return
                    if (property.includes(":")) {
                      const [k, ...rest] = property.split(":")
                      setProperties([...properties, { k: k.trim(), v: rest.join(":").trim() }])
                    } else {
                      setProperties([...properties, { k: "Notiz", v: property.trim() }])
                    }
                    setProperty("")
                  }}
                  className="grid h-8 w-8 place-items-center rounded-md bg-white/[0.04] text-white/65 hover:bg-white/[0.08]"
                  aria-label="Eigenschaft hinzufügen"
                >
                  <Plus size={12} />
                </button>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 rounded-2xl border border-sky-400/20 bg-gradient-to-br from-sky-500/10 to-violet-500/5 p-3.5">
            <img src="/flux-bot.svg" alt="Flux Bot" className="h-10 w-10 shrink-0 rounded-full ring-2 ring-sky-400/40" />
            <p className="text-xs text-white/75">
              <span className="font-semibold text-white">Flux Bot</span> kann Titel & Beschreibung per Klick
              verbessern. Stell den Status auf <em>offen</em>, um Auto-Poster zu aktivieren.
            </p>
          </div>
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.06] bg-white/[0.02] p-4">
          <button
            type="button"
            onClick={onDelete}
            className="inline-flex items-center gap-1.5 rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-200 transition-colors hover:bg-rose-500/15"
          >
            <Trash2 size={12} /> Löschen
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onPost}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 text-sm font-semibold text-white/85 transition-colors hover:bg-white/[0.08]"
            >
              Auf Kanäle posten
              <ArrowRight size={13} />
            </button>
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-gradient-to-r from-sky-400 to-cyan-300 px-5 text-sm font-semibold text-slate-950 transition-all hover:from-sky-300 hover:to-cyan-200 disabled:opacity-50"
            >
              {saved ? <Check size={14} /> : saving ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />}
              {saved ? "Gespeichert" : "Speichern"}
            </button>
          </div>
        </footer>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] font-semibold uppercase tracking-widest text-white/40">{label}</span>
      {children}
    </label>
  )
}
