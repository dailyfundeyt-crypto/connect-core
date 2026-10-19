// Local persistent product store (Demo Mode). Real auth still reads/writes via
// supabase, but the multiposter does not have a server table for "products" yet —
// so it persists locally per browser. When the user is signed in we mirror the
// list to a per-user localStorage key, otherwise it stays under a shared
// "flux_demo" key.

import { useCallback, useEffect, useState } from "react"
import { readFluxLocal, writeFluxLocal } from "@flux/lib/connect-bridge"

export type SourceId = "sheets" | "csv" | "shopify" | "ebay" | "kleinanzeigen"
export type ProductStatus = "offen" | "listed" | "verkauft"

export type Product = {
  id: string
  title: string
  img: string
  price: string
  margin: string
  stock: number
  status: ProductStatus
  properties: { k: string; v: string }[]
  tourImages: string[]
  sources: SourceId[]
  importedAt: number
  importSource: SourceId
  description?: string
  ean?: string
}

const STORAGE_KEY = "flux_products_v1"

const SEED: Product[] = [
  {
    id: "A-00042",
    title: "Pink Floyd – Dark Side of the Moon",
    img: "linear-gradient(135deg, #1a1a2e, #16213e)",
    price: "€ 28,00",
    margin: "34 %",
    stock: 1,
    status: "offen",
    properties: [
      { k: "Zustand", v: "Very Good Plus" },
      { k: "Pressung", v: "1st UK Harvest" },
      { k: "Jahr", v: "1973" },
      { k: "EAN", v: "077399624800" },
    ],
    tourImages: ["v1", "v2", "v3"],
    sources: ["sheets", "ebay"],
    importedAt: Date.now() - 5 * 24 * 3600 * 1000,
    importSource: "sheets",
    description:
      "Klassiker von Pink Floyd aus dem Jahr 1973. Erstpressung der UK Harvest, sehr guter Zustand.",
    ean: "077399624800",
  },
  {
    id: "A-00041",
    title: "Beatles – Abbey Road (Original Pressing)",
    img: "linear-gradient(135deg, #2c1810, #4a2c1a)",
    price: "€ 65,00",
    margin: "52 %",
    stock: 1,
    status: "listed",
    properties: [
      { k: "Zustand", v: "Near Mint" },
      { k: "Pressung", v: "1st UK Apple" },
      { k: "Jahr", v: "1969" },
      { k: "EAN", v: "077746624800" },
    ],
    tourImages: ["v4", "v5"],
    sources: ["shopify", "ebay"],
    importedAt: Date.now() - 4 * 24 * 3600 * 1000,
    importSource: "shopify",
    description: "Originale Erstpressung des legendären Beatles-Albums.",
    ean: "077746624800",
  },
  {
    id: "A-00040",
    title: "Miles Davis – Kind of Blue",
    img: "linear-gradient(135deg, #0a1929, #1e3a5f)",
    price: "€ 42,00",
    margin: "41 %",
    stock: 1,
    status: "offen",
    properties: [
      { k: "Zustand", v: "Very Good" },
      { k: "Pressung", v: "1st US Columbia" },
      { k: "Jahr", v: "1959" },
      { k: "EAN", v: "088390012340" },
    ],
    tourImages: ["v6"],
    sources: ["sheets", "kleinanzeigen"],
    importedAt: Date.now() - 3 * 24 * 3600 * 1000,
    importSource: "sheets",
    description: "Eines der meistverkauften Jazz-Alben aller Zeiten.",
    ean: "088390012340",
  },
  {
    id: "A-00039",
    title: "Jimi Hendrix – Are You Experienced",
    img: "linear-gradient(135deg, #1d0b2e, #3b0f4d)",
    price: "€ 38,00",
    margin: "38 %",
    stock: 1,
    status: "verkauft",
    properties: [
      { k: "Zustand", v: "Very Good Plus" },
      { k: "Pressung", v: "1st US Reprise" },
      { k: "Jahr", v: "1967" },
      { k: "EAN", v: "088390011999" },
    ],
    tourImages: ["v7", "v8"],
    sources: ["ebay"],
    importedAt: Date.now() - 2 * 24 * 3600 * 1000,
    importSource: "ebay",
    description: "Debütalbum des Gitarren-Genies, Erstpressung US Reprise.",
    ean: "088390011999",
  },
  {
    id: "A-00038",
    title: "David Bowie – The Rise and Fall of Ziggy Stardust",
    img: "linear-gradient(135deg, #2c0a2a, #4a1442)",
    price: "€ 32,00",
    margin: "46 %",
    stock: 2,
    status: "listed",
    properties: [
      { k: "Zustand", v: "Near Mint" },
      { k: "Pressung", v: "1st UK RCA" },
      { k: "Jahr", v: "1972" },
      { k: "EAN", v: "088390022200" },
    ],
    tourImages: ["v9", "v10", "v11"],
    sources: ["shopify", "ebay", "kleinanzeigen"],
    importedAt: Date.now() - 1 * 24 * 3600 * 1000,
    importSource: "shopify",
    description: "Bowies Konzeptalbum-Meisterwerk, Erstpressung UK RCA.",
    ean: "088390022200",
  },
]

function loadFromStorage(): Product[] {
  if (typeof window === "undefined") return SEED
  try {
    const raw = readFluxLocal(STORAGE_KEY)
    if (!raw) return SEED
    const parsed = JSON.parse(raw) as Product[]
    if (!Array.isArray(parsed) || parsed.length === 0) return SEED
    return parsed
  } catch {
    return SEED
  }
}

function saveToStorage(products: Product[]) {
  if (typeof window === "undefined") return
  try {
    writeFluxLocal(STORAGE_KEY, JSON.stringify(products))
  } catch {
    // ignore quota errors
  }
}

let _listeners: Array<(products: Product[]) => void> = []
let _products: Product[] | null = null

function getProducts(): Product[] {
  if (_products === null) {
    _products = loadFromStorage()
  }
  return _products
}

function setProducts(next: Product[]) {
  _products = next
  saveToStorage(next)
  for (const l of _listeners) l(next)
}

function nextId(products: Product[]): string {
  const max = products.reduce((m, p) => {
    const n = Number(p.id.split("-")[1])
    return Number.isFinite(n) && n > m ? n : m
  }, 0)
  return `A-${String(max + 1).padStart(5, "0")}`
}

function buildProduct(
  p: Omit<Product, "id" | "importedAt" | "tourImages" | "img"> & { id?: string; img?: string },
  workingList: Product[],
): Product {
  const newId = p.id ?? nextId(workingList)
  return {
    id: newId,
    title: p.title,
    img: p.img ?? pickGradient(newId),
    price: p.price,
    margin: p.margin ?? "0 %",
    stock: p.stock ?? 1,
    status: p.status,
    properties: p.properties,
    tourImages: ["v1"],
    sources: p.sources,
    importedAt: Date.now(),
    importSource: p.importSource,
    description: p.description,
    ean: p.ean,
  }
}

export function addProductFn(input: Omit<Product, "id" | "importedAt" | "tourImages" | "img"> & { id?: string; img?: string }): Product {
  const current = getProducts()
  const created = buildProduct(input, current)
  setProducts([created, ...current])
  return created
}

export function addManyProductsFn(
  ps: Omit<Product, "id" | "importedAt" | "tourImages" | "img">[],
): Product[] {
  const current = getProducts()
  const created: Product[] = []
  let working = [...current]
  for (const p of ps) {
    const np = buildProduct(p, working)
    created.push(np)
    working = [np, ...working]
  }
  setProducts(working)
  return created
}

const GRADIENTS = [
  "linear-gradient(135deg, #1a1a2e, #16213e)",
  "linear-gradient(135deg, #2c1810, #4a2c1a)",
  "linear-gradient(135deg, #0a1929, #1e3a5f)",
  "linear-gradient(135deg, #1d0b2e, #3b0f4d)",
  "linear-gradient(135deg, #2c0a2a, #4a1442)",
  "linear-gradient(135deg, #0f3447, #1a5a72)",
  "linear-gradient(135deg, #1f0e2e, #3d1a59)",
  "linear-gradient(135deg, #2a1a0a, #4f3018)",
  "linear-gradient(135deg, #0a1f2c, #1a3852)",
  "linear-gradient(135deg, #2c0a1a, #4f1a32)",
]

function pickGradient(seed: string): string {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0
  return GRADIENTS[h % GRADIENTS.length]
}

export function useProducts() {
  const [products, setLocal] = useState<Product[]>(() => getProducts())

  useEffect(() => {
    const listener = (next: Product[]) => setLocal(next)
    _listeners.push(listener)
    return () => {
      _listeners = _listeners.filter((l) => l !== listener)
    }
  }, [])

  const addProduct = useCallback((p: Omit<Product, "id" | "importedAt" | "tourImages" | "img"> & { id?: string; img?: string }) => {
    return addProductFn(p)
  }, [])

  const addMany = useCallback((ps: Omit<Product, "id" | "importedAt" | "tourImages" | "img">[]) => {
    return addManyProductsFn(ps)
  }, [])

  const updateProduct = useCallback((id: string, patch: Partial<Product>) => {
    const current = getProducts()
    const next = current.map((p) => (p.id === id ? { ...p, ...patch } : p))
    setProducts(next)
  }, [])

  const removeProduct = useCallback((id: string) => {
    const current = getProducts()
    setProducts(current.filter((p) => p.id !== id))
  }, [])

  const resetProducts = useCallback(() => {
    setProducts(SEED)
  }, [])

  return { products, addProduct, addMany, updateProduct, removeProduct, resetProducts }
}

// ---- CSV parser (RFC 4180 lite) ----

export type CsvProduct = {
  title: string
  price: number
  ean?: string
  description?: string
  stock?: number
  status?: ProductStatus
  properties?: { k: string; v: string }[]
}

function parseCsvLine(line: string): string[] {
  const result: string[] = []
  let current = ""
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          current += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        current += ch
      }
    } else {
      if (ch === ",") {
        result.push(current)
        current = ""
      } else if (ch === '"') {
        inQuotes = true
      } else {
        current += ch
      }
    }
  }
  result.push(current)
  return result
}

function pickField(headers: string[], names: string[]): number {
  for (const n of names) {
    const idx = headers.findIndex((h) => h.toLowerCase().trim() === n)
    if (idx >= 0) return idx
  }
  return -1
}

export function parseCsv(text: string): CsvProduct[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
  if (lines.length < 2) return []
  const headers = parseCsvLine(lines[0]).map((h) => h.toLowerCase().trim())
  const titleIdx = pickField(headers, ["title", "name", "produkt", "product", "titel"])
  const priceIdx = pickField(headers, ["price", "preis", "preis (€)", "price_eur", "amount"])
  const eanIdx = pickField(headers, ["ean", "barcode", "gtin"])
  const descIdx = pickField(headers, ["description", "beschreibung", "desc"])
  const stockIdx = pickField(headers, ["stock", "bestand", "qty", "quantity", "anzahl"])
  const statusIdx = pickField(headers, ["status", "zustand"])
  if (titleIdx < 0 || priceIdx < 0) return []
  const out: CsvProduct[] = []
  for (let i = 1; i < lines.length; i++) {
    const row = parseCsvLine(lines[i])
    const title = (row[titleIdx] ?? "").trim()
    if (!title) continue
    const priceStr = (row[priceIdx] ?? "").trim().replace(/[€\s]/g, "").replace(",", ".")
    const price = Number(priceStr)
    if (!Number.isFinite(price)) continue
    const ean = eanIdx >= 0 ? (row[eanIdx] ?? "").trim() : ""
    const desc = descIdx >= 0 ? (row[descIdx] ?? "").trim() : ""
    const stock = stockIdx >= 0 ? Number((row[stockIdx] ?? "").trim()) || 1 : 1
    const statusRaw = statusIdx >= 0 ? (row[statusIdx] ?? "").toLowerCase().trim() : "offen"
    const status: ProductStatus =
      statusRaw === "listed" || statusRaw === "listed" || statusRaw === "aktiv" || statusRaw === "live"
        ? "listed"
        : statusRaw === "verkauft" || statusRaw === "sold" || statusRaw === "ver"
        ? "verkauft"
        : "offen"
    const props: { k: string; v: string }[] = []
    if (ean) props.push({ k: "EAN", v: ean })
    if (statusRaw) props.push({ k: "Status", v: statusRaw })
    out.push({
      title,
      price,
      ean: ean || undefined,
      description: desc || undefined,
      stock,
      status,
      properties: props,
    })
  }
  return out
}

export function formatPrice(n: number): string {
  return `€ ${n.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function marginFor(price: number, cost = 18.5): string {
  if (price <= 0) return "0 %"
  const m = ((price - cost) / price) * 100
  return `${Math.round(Math.max(0, Math.min(99, m)))} %`
}
