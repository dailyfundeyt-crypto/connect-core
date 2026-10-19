import { useEffect, useMemo, useState } from "react"
import { Link, useNavigate } from "@tanstack/react-router"
import {
  ArrowRight,
  Boxes,
  ExternalLink,
  Eye,
  FileSpreadsheet,
  Filter,
  Globe,
  ListFilter,
  Loader2,
  Plus,
  Search,
  Settings as SettingsIcon,
  ShoppingCart,
  SlidersHorizontal,
  Sparkles,
  ToggleLeft,
  ToggleRight,
  Trash2,
  Upload,
  Wand2,
  X,
} from "lucide-react"
import { AppShell } from "@flux/components/shell/app-shell"
import { ImportModal, ProductDetailModal } from "./import-modal"
import { useProducts, type Product, type ProductStatus, type SourceId } from "./product-store"

const SOURCES: { id: SourceId; label: string; icon: JSX.Element }[] = [
  { id: "sheets", label: "Sheets", icon: <FileSpreadsheet size={14} /> },
  { id: "csv", label: "CSV", icon: <Boxes size={14} /> },
  { id: "shopify", label: "Shopify", icon: <Globe size={14} /> },
  { id: "ebay", label: "eBay", icon: <ShoppingCart size={14} /> },
  { id: "kleinanzeigen", label: "Kleinanzeigen", icon: <Boxes size={14} /> },
]

type SortKey = "newest" | "price-asc" | "price-desc" | "margin-desc" | "title"

export function MultiposterPage({ initialSource }: { initialSource?: string } = {}) {
  const navigate = useNavigate()
  const validSource: SourceId = (
    ["sheets", "csv", "shopify", "ebay", "kleinanzeigen"] as const
  ).includes(initialSource as SourceId)
    ? (initialSource as SourceId)
    : "sheets"

  const { products, addProduct, addMany, updateProduct, removeProduct } = useProducts()
  const [activeSource, setActiveSource] = useState<SourceId>(validSource)
  const [filter, setFilter] = useState<"alle" | ProductStatus>("alle")
  const [search, setSearch] = useState("")
  const [autoPoster, setAutoPoster] = useState(true)
  const [sort, setSort] = useState<SortKey>("newest")
  const [showNewModal, setShowNewModal] = useState(false)
  const [showImportModal, setShowImportModal] = useState<{ source: SourceId; tab?: "csv" | "sheets" | "shopify" } | null>(null)
  const [openProductId, setOpenProductId] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => {
    setActiveSource(validSource)
    setFilter("alle")
    setSearch("")
  }, [validSource])

  const visible = useMemo(() => {
    let list = products.filter((p) => {
      if (!p.sources.includes(activeSource)) return false
      if (filter !== "alle" && p.status !== filter) return false
      if (search.trim()) {
        const q = search.toLowerCase()
        if (
          !p.id.toLowerCase().includes(q) &&
          !p.title.toLowerCase().includes(q) &&
          !p.properties.some((prop) => prop.v.toLowerCase().includes(q)) &&
          !(p.ean ?? "").toLowerCase().includes(q)
        ) {
          return false
        }
      }
      return true
    })
    list = [...list].sort((a, b) => {
      switch (sort) {
        case "price-asc":
          return (
            parseFloat(a.price.replace(/[^\d,]/g, "").replace(",", ".")) -
            parseFloat(b.price.replace(/[^\d,]/g, "").replace(",", "."))
          )
        case "price-desc":
          return (
            parseFloat(b.price.replace(/[^\d,]/g, "").replace(",", ".")) -
            parseFloat(a.price.replace(/[^\d,]/g, "").replace(",", "."))
          )
        case "margin-desc":
          return parseFloat(a.margin) - parseFloat(b.margin)
        case "title":
          return a.title.localeCompare(b.title)
        default:
          return b.importedAt - a.importedAt
      }
    })
    return list
  }, [products, activeSource, filter, search, sort])

  const sourceProductCount = useMemo(
    () => products.filter((p) => p.sources.includes(activeSource)).length,
    [products, activeSource],
  )

  const showToast = (msg: string) => {
    setToast(msg)
    window.setTimeout(() => setToast(null), 2400)
  }

  const handleAddProduct = (input: { title: string; price: string; status: ProductStatus; source: SourceId }) => {
    const priceNum = Number(input.price.replace(/[^\d,]/g, "").replace(",", "."))
    const margin = priceNum > 0 ? `${Math.round(Math.max(0, Math.min(99, ((priceNum - 18.5) / priceNum) * 100)))} %` : "0 %"
    const created = addProduct({
      title: input.title,
      price: input.price,
      margin,
      status: input.status,
      sources: [input.source],
      importSource: input.source,
      properties: [{ k: "Import", v: input.source.toUpperCase() }],
    })
    showToast(`Produkt "${created.title}" angelegt · ${created.id}`)
  }

  const handleImported = (count: number) => {
    showToast(`${count} Produkt${count === 1 ? "" : "e"} importiert`)
  }

  const openProduct = openProductId ? products.find((p) => p.id === openProductId) ?? null : null

  return (
    <AppShell activeProduct={activeSource}>
      {/* Heading */}
      <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mb-2 inline-flex items-center gap-2 rounded-full border border-violet-400/30 bg-violet-400/10 px-3 py-1 text-xs text-violet-200">
            <Wand2 className="h-3 w-3" />
            5 Quellen · AI-Beschreibungen · Auto-Poster
          </p>
          <h1 className="bg-gradient-to-br from-white via-white to-white/55 bg-clip-text text-4xl font-bold text-transparent">
            Multiposter
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-white/55">
            {visible.length} von {sourceProductCount} Produkten · {SOURCES.find((s) => s.id === activeSource)?.label} aktiv
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setShowImportModal({ source: activeSource, tab: defaultTabFor(activeSource) })}
            className="inline-flex h-11 items-center gap-2 rounded-2xl border border-white/[0.08] bg-white/[0.04] px-4 text-sm font-semibold text-white/85 transition-all hover:bg-white/[0.08]"
          >
            <Upload className="h-4 w-4" />
            Quelle verbinden
          </button>
          <button
            onClick={() => setShowNewModal(true)}
            className="group inline-flex h-11 items-center gap-2 rounded-2xl bg-gradient-to-r from-sky-400 to-cyan-300 px-5 text-sm font-semibold text-slate-950 shadow-[0_18px_50px_-16px_rgba(56,189,248,0.6)] transition-all hover:-translate-y-0.5 hover:from-sky-300 hover:to-cyan-200"
          >
            <Plus className="h-4 w-4" />
            Neues Produkt
          </button>
        </div>
      </div>

      {/* Sources toggle row */}
      <div className="mb-5 flex flex-wrap items-center gap-2 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-2 backdrop-blur-sm">
        {SOURCES.map((s) => {
          const active = activeSource === s.id
          const count = products.filter((p) => p.sources.includes(s.id)).length
          return (
            <button
              key={s.id}
              onClick={() => {
                setActiveSource(s.id)
                void navigate({ to: "/app/multiposter/$source", params: { source: s.id } })
                showToast(`Quelle gewechselt: ${s.label}`)
              }}
              className={`flex h-9 items-center gap-2 rounded-xl px-4 text-xs font-semibold transition-all ${
                active
                  ? "bg-sky-400/15 text-sky-100 ring-1 ring-sky-400/40 shadow-[0_0_18px_-4px_rgba(56,189,248,0.6)]"
                  : "text-white/55 hover:bg-white/[0.04] hover:text-white/85"
              }`}
            >
              <span className={active ? "text-sky-300" : "text-white/45"}>{s.icon}</span>
              {s.label}
              <span
                className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold ${
                  active ? "bg-sky-400/30 text-sky-100" : "bg-white/5 text-white/55"
                }`}
              >
                {count}
              </span>
            </button>
          )
        })}
        <div className="ml-auto">
          <Link
            to="/app/agents"
            className="inline-flex h-9 items-center gap-2 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 text-xs text-white/65 hover:bg-white/[0.06]"
          >
            <SettingsIcon size={13} />
            Einstellungen
          </Link>
        </div>
      </div>

      {/* Filter card */}
      <div className="mb-6 flex flex-wrap items-center gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.02] px-4 py-3 backdrop-blur-sm">
        <div className="flex items-center gap-1 rounded-xl bg-white/[0.04] p-1">
          {(["alle", "offen", "listed", "verkauft"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium capitalize transition-all ${
                filter === f
                  ? "bg-white/[0.1] text-white shadow-inner shadow-white/5"
                  : "text-white/55 hover:text-white/85"
              }`}
            >
              {f}
            </button>
          ))}
        </div>

        <div className="relative ml-auto flex-1 max-w-[280px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/35" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Suche nach ID, Titel oder EAN"
            className="h-9 w-full rounded-lg border border-white/[0.05] bg-white/[0.03] pl-9 pr-3 text-xs text-white placeholder:text-white/30 outline-none focus:border-sky-400/40"
          />
        </div>

        <div className="relative">
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="h-9 appearance-none rounded-lg border border-white/[0.05] bg-white/[0.03] pl-3 pr-8 text-xs text-white/75 outline-none focus:border-sky-400/40"
          >
            <option value="newest" className="bg-[#0a0c12]">Neueste</option>
            <option value="price-asc" className="bg-[#0a0c12]">Preis aufsteigend</option>
            <option value="price-desc" className="bg-[#0a0c12]">Preis absteigend</option>
            <option value="margin-desc" className="bg-[#0a0c12]">Marge</option>
            <option value="title" className="bg-[#0a0c12]">Titel</option>
          </select>
          <SlidersHorizontal size={12} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-white/40" />
        </div>

        <button className="flex h-9 items-center gap-2 rounded-lg border border-white/[0.05] bg-white/[0.03] px-3 text-xs text-white/65 hover:bg-white/[0.06]">
          <ListFilter size={13} /> Status
        </button>
        <button className="flex h-9 items-center gap-2 rounded-lg border border-white/[0.05] bg-white/[0.03] px-3 text-xs text-white/65 hover:bg-white/[0.06]">
          <Filter size={13} /> Filter
        </button>
        <button className="flex h-9 items-center gap-2 rounded-lg border border-violet-400/30 bg-violet-500/10 px-3 text-xs text-violet-100 hover:bg-violet-500/15">
          <Sparkles size={13} /> Tags
        </button>
      </div>

      {/* Product cards */}
      {visible.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] p-10 text-center">
          <p className="text-sm text-white/55">
            {products.length === 0
              ? "Noch keine Produkte. Importiere deine erste CSV-, Sheets- oder Shopify-Quelle."
              : "Keine Produkte gefunden."}
          </p>
          {products.length === 0 ? (
            <button
              onClick={() => setShowImportModal({ source: activeSource, tab: "csv" })}
              className="mt-3 inline-flex items-center gap-2 rounded-lg border border-sky-400/30 bg-sky-500/10 px-3 py-1.5 text-xs text-sky-100 hover:bg-sky-500/15"
            >
              <Upload size={12} /> CSV-Datei hochladen
            </button>
          ) : (
            <button
              onClick={() => {
                setSearch("")
                setFilter("alle")
              }}
              className="mt-3 text-xs text-sky-300 hover:text-sky-200"
            >
              Filter zurücksetzen
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {visible.map((p) => (
            <ProductCard
              key={p.id}
              product={p}
              onAction={(kind) => {
                if (kind === "post") {
                  const otherProps = p.properties.filter((x) => x.k.toLowerCase() !== "status")
                  updateProduct(p.id, {
                    status: "listed" as ProductStatus,
                    listedAt: Date.now(),
                    properties: [{ k: "Status", v: "listed" }, ...otherProps],
                  })
                  showToast(`${p.id} wird auf ${p.sources.length} Kanäle gepostet…`)
                }
                if (kind === "view") {
                  setOpenProductId(p.id)
                }
                if (kind === "ebay") {
                  window.open("https://www.ebay.de/", "_blank", "noopener,noreferrer")
                }
                if (kind === "delete") {
                  removeProduct(p.id)
                  showToast(`${p.id} gelöscht`)
                }
              }}
            />
          ))}
        </div>
      )}

      {/* Auto-Poster hint card */}
      <div className="mt-8 flex items-center gap-4 rounded-2xl border border-violet-400/20 bg-gradient-to-r from-violet-500/10 via-sky-500/5 to-transparent p-5 backdrop-blur-sm">
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-violet-500/20 text-violet-200 ring-1 ring-violet-400/30">
          <Sparkles size={18} />
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold text-white">Multi-poster is active</p>
          <p className="text-xs text-white/55">
            Neue Produkte werden automatisch in {pListFor(activeSource)} gepostet.
          </p>
        </div>
        <button
          onClick={() => {
            setAutoPoster((v) => !v)
            showToast(autoPoster ? "Auto-Poster deaktiviert" : "Auto-Poster aktiviert")
          }}
          className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold transition-all ${
            autoPoster
              ? "bg-emerald-400/15 text-emerald-200 ring-1 ring-emerald-400/30"
              : "bg-white/[0.05] text-white/55 ring-1 ring-white/10"
          }`}
          aria-pressed={autoPoster}
        >
          {autoPoster ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
          {autoPoster ? "An" : "Aus"}
        </button>
      </div>

      {showNewModal && (
        <NewProductModal
          defaultSource={activeSource}
          onClose={() => setShowNewModal(false)}
          onCreate={handleAddProduct}
        />
      )}

      {showImportModal && (
        <ImportModal
          defaultSource={showImportModal.source}
          defaultTab={showImportModal.tab}
          onClose={() => setShowImportModal(null)}
          onImported={(count) => {
            handleImported(count)
            setShowImportModal(null)
          }}
        />
      )}

      {openProduct && (
        <ProductDetailModal
          product={openProduct}
          onClose={() => setOpenProductId(null)}
          onChange={(next) => updateProduct(next.id, next)}
          onPost={() => {
            const otherProps = openProduct.properties.filter((x) => x.k.toLowerCase() !== "status")
            updateProduct(openProduct.id, {
              status: "listed" as ProductStatus,
              properties: [{ k: "Status", v: "listed" }, ...otherProps],
            })
            showToast(`${openProduct.id} wird gepostet…`)
            setOpenProductId(null)
          }}
          onDelete={() => {
            removeProduct(openProduct.id)
            showToast(`${openProduct.id} gelöscht`)
            setOpenProductId(null)
          }}
        />
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-2xl border border-white/10 bg-[#0a0c12]/95 px-4 py-3 text-sm text-white shadow-2xl shadow-black/60 backdrop-blur-xl">
          {toast}
        </div>
      )}
    </AppShell>
  )
}

function defaultTabFor(source: SourceId): "csv" | "sheets" | "shopify" {
  if (source === "csv") return "csv"
  if (source === "shopify") return "shopify"
  return "sheets"
}

function pListFor(s: SourceId) {
  switch (s) {
    case "sheets":
      return "Google Sheets"
    case "csv":
      return "deine CSV-Datei"
    case "shopify":
      return "Shopify"
    case "ebay":
      return "eBay"
    case "kleinanzeigen":
      return "Kleinanzeigen"
  }
}

function ProductCard({
  product,
  onAction,
}: {
  product: Product
  onAction: (kind: "view" | "ebay" | "post" | "delete") => void
}) {
  const statusPill =
    product.status === "offen"
      ? "bg-amber-400/15 text-amber-200 ring-amber-400/30"
      : product.status === "listed"
      ? "bg-sky-400/15 text-sky-200 ring-sky-400/30"
      : "bg-emerald-400/15 text-emerald-200 ring-emerald-400/30"

  return (
    <article className="overflow-hidden rounded-2xl border border-white/[0.06] bg-white/[0.02] backdrop-blur-sm transition-all hover:border-white/15">
      <div className="grid gap-0 lg:grid-cols-[180px_1fr_180px]">
        <div className="relative h-44 lg:h-auto" style={{ background: product.img }}>
          <div className="absolute inset-0 grid place-items-center">
            <div className="grid h-16 w-16 place-items-center rounded-2xl bg-black/30 backdrop-blur-md">
              <span className="text-2xl font-bold text-white/80">{product.id.split("-")[1]}</span>
            </div>
          </div>
          <div className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-black/40 px-2 py-0.5 text-[10px] font-mono font-semibold text-white backdrop-blur-sm">
            {product.id}
          </div>
          <div className={`absolute right-3 top-3 inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize ring-1 ${statusPill}`}>
            <span className="h-1.5 w-1.5 rounded-full bg-current" />
            {product.status}
          </div>
        </div>

        <div className="p-5">
          <h3 className="truncate text-base font-semibold text-white">{product.title}</h3>
          {product.description && (
            <p className="mt-1 line-clamp-1 text-xs text-white/55">{product.description}</p>
          )}
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {product.properties
              .filter((prop) => prop.k.toLowerCase() !== "status")
              .slice(0, 4)
              .map((prop) => (
              <div key={prop.k} className="rounded-lg border border-white/[0.05] bg-white/[0.02] px-3 py-2">
                <p className="text-[10px] uppercase tracking-wider text-white/40">{prop.k}</p>
                <p className="mt-0.5 truncate text-xs font-semibold text-white/90">{prop.v}</p>
              </div>
            ))}
            {/* Always show the current status so the card reflects the latest edit */}
            <div className="rounded-lg border border-white/[0.05] bg-white/[0.02] px-3 py-2">
              <p className="text-[10px] uppercase tracking-wider text-white/40">Status</p>
              <p className="mt-0.5 truncate text-xs font-semibold capitalize text-white/90">{product.status}</p>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-4 text-xs text-white/55">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-sky-300 shadow-[0_0_6px_rgba(56,189,248,0.7)]" />
              AI-Beschreibung generiert
            </span>
            <span>·</span>
            <span>{product.stock} Stk · {product.sources.length} Kanäle</span>
            <span>·</span>
            <span className="font-mono text-white/70">{product.price}</span>
            <span className="rounded-md bg-emerald-400/15 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-300 ring-1 ring-emerald-400/30">
              {product.margin}
            </span>
          </div>
          <div className="mt-5 flex flex-wrap items-center gap-2">
            <button
              onClick={() => onAction("view")}
              className="inline-flex h-9 items-center gap-2 rounded-xl bg-white px-4 text-xs font-semibold text-slate-950 transition-all hover:bg-sky-100"
            >
              <Eye size={13} />
              Open product
            </button>
            <button
              onClick={() => onAction("ebay")}
              className="inline-flex h-9 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 text-xs font-semibold text-white/85 transition-all hover:bg-white/[0.08]"
            >
              View on eBay
              <ExternalLink size={13} />
            </button>
            <button
              onClick={() => onAction("delete")}
              className="inline-flex h-9 items-center gap-2 rounded-xl border border-rose-500/20 bg-rose-500/5 px-3 text-xs text-rose-200 transition-colors hover:bg-rose-500/10"
              aria-label="Löschen"
            >
              <Trash2 size={12} />
            </button>
            <button
              onClick={() => onAction("post")}
              className="ml-auto inline-flex h-9 items-center gap-2 rounded-xl bg-gradient-to-r from-sky-400 to-cyan-300 px-4 text-xs font-semibold text-slate-950 transition-all hover:from-sky-300 hover:to-cyan-200"
            >
              Posten
              <ArrowRight size={13} />
            </button>
          </div>
        </div>

        <div className="relative border-t border-white/[0.05] bg-gradient-to-br from-violet-500/[0.06] to-transparent p-4 lg:border-l lg:border-t-0">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-violet-200/80">Quellen</p>
          <div className="flex flex-wrap gap-1.5">
            {product.sources.map((s) => (
              <span
                key={s}
                className="inline-flex items-center gap-1 rounded-md bg-white/[0.05] px-2 py-0.5 text-[10px] font-semibold text-white/75 ring-1 ring-white/10"
              >
                {SOURCES.find((x) => x.id === s)?.icon}
                {SOURCES.find((x) => x.id === s)?.label}
              </span>
            ))}
          </div>
          <div className="mt-3 flex items-center gap-1.5 text-[10px] text-white/45">
            <Sparkles className="h-3 w-3 text-violet-200" />
            Importiert aus {product.importSource}
          </div>
        </div>
      </div>
    </article>
  )
}

function NewProductModal({
  defaultSource,
  onClose,
  onCreate,
}: {
  defaultSource: SourceId
  onClose: () => void
  onCreate: (input: { title: string; price: string; status: ProductStatus; source: SourceId }) => void
}) {
  const [title, setTitle] = useState("")
  const [price, setPrice] = useState("")
  const [source, setSource] = useState<SourceId>(defaultSource)
  const [status, setStatus] = useState<ProductStatus>("offen")
  const [generating, setGenerating] = useState(false)

  const submit = () => {
    const cleanPrice = price.trim().replace(",", ".")
    const priceNum = Number(cleanPrice)
    if (!title.trim() || !Number.isFinite(priceNum) || priceNum <= 0) return
    setGenerating(true)
    window.setTimeout(() => {
      onCreate({ title: title.trim(), price: `€ ${priceNum.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, status, source })
    }, 500)
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 px-4 backdrop-blur-sm" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg overflow-hidden rounded-3xl border border-white/10 bg-[#0a0c12] shadow-2xl shadow-black/60"
      >
        <header className="flex items-center justify-between border-b border-white/[0.06] p-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-sky-300/70">Neues Produkt</p>
            <h2 className="mt-0.5 text-lg font-semibold text-white">Produkt anlegen</h2>
          </div>
          <button
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-md text-white/60 hover:bg-white/[0.06] hover:text-white"
            aria-label="Schließen"
          >
            <X size={16} />
          </button>
        </header>

        <div className="space-y-4 p-4">
          <div>
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-widest text-white/40">
              Titel
            </label>
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="z.B. Pink Floyd – Dark Side of the Moon"
              className="h-10 w-full rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 text-sm text-white outline-none placeholder:text-white/30 focus:border-sky-400/40"
            />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="mb-1 block text-[10px] font-semibold uppercase tracking-widest text-white/40">
                Preis (€)
              </label>
              <input
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="28,00"
                className="h-10 w-full rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 text-sm text-white outline-none placeholder:text-white/30 focus:border-sky-400/40"
              />
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-semibold uppercase tracking-widest text-white/40">Quelle</label>
              <select
                value={source}
                onChange={(e) => setSource(e.target.value as SourceId)}
                className="h-10 w-full appearance-none rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 text-sm text-white outline-none focus:border-sky-400/40"
              >
                {SOURCES.map((s) => (
                  <option key={s.id} value={s.id} className="bg-[#0a0c12]">
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-semibold uppercase tracking-widest text-white/40">Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as ProductStatus)}
                className="h-10 w-full appearance-none rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 text-sm text-white outline-none focus:border-sky-400/40"
              >
                <option value="offen" className="bg-[#0a0c12]">Offen</option>
                <option value="listed" className="bg-[#0a0c12]">Gelistet</option>
                <option value="verkauft" className="bg-[#0a0c12]">Verkauft</option>
              </select>
            </div>
          </div>

          <div className="flex items-center gap-3 rounded-2xl border border-sky-400/20 bg-gradient-to-br from-sky-500/10 to-violet-500/5 p-3.5">
            <img src="/flux-bot.png" alt="Flux Bot" className="h-10 w-10 shrink-0 rounded-full object-cover ring-2 ring-sky-400/40" />
            <p className="text-xs text-white/75">
              <span className="font-semibold text-white">Flux Bot</span> schreibt dir Titel, Beschreibung &amp; Tags in Sekunden.
            </p>
          </div>
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-white/[0.06] bg-white/[0.02] p-4">
          <button
            type="button"
            onClick={onClose}
            className="h-10 rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 text-sm font-semibold text-white/80 hover:bg-white/[0.08]"
          >
            Abbrechen
          </button>
          <button
            type="button"
            disabled={!title.trim() || !Number.isFinite(Number(price.replace(",", "."))) || generating}
            onClick={submit}
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-gradient-to-r from-sky-400 to-cyan-300 px-5 text-sm font-semibold text-slate-950 transition-all hover:from-sky-300 hover:to-cyan-200 disabled:opacity-50"
          >
            {generating ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Sparkles size={14} />
            )}
            {generating ? "Erstelle…" : "Erstellen"}
          </button>
        </footer>
      </div>
    </div>
  )
}
