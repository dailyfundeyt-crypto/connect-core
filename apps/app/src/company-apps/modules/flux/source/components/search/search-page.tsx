import { useState } from 'react'
import {
  Camera,
  Image as ImageIcon,
  Loader2,
  Mic,
  ScanBarcode,
  Search as SearchIcon,
  Sparkles,
  X,
} from 'lucide-react'
import { AppShell } from '@flux/components/shell/app-shell'

type Result = {
  id: string
  title: string
  sku: string
  source: string
  price: number
  stock: number
  match: number
}

const SAMPLE: Result[] = [
  { id: '1', title: 'Pink Floyd – Dark Side of the Moon (1st Press)', sku: 'VIN-0142', source: 'Discogs', price: 28, stock: 4, match: 0.98 },
  { id: '2', title: 'Pink Floyd – Wish You Were Here (LP)', sku: 'VIN-0188', source: 'eBay', price: 24.5, stock: 1, match: 0.94 },
  { id: '3', title: 'Pink Floyd T-Shirt "Dark Side" Vintage', sku: 'CLT-0721', source: 'Kleinanzeigen', price: 18, stock: 7, match: 0.86 },
  { id: '4', title: 'Pink Floyd – The Wall (2LP Gatefold)', sku: 'VIN-0203', source: 'Shopify', price: 32, stock: 2, match: 0.81 },
]

type Mode = 'text' | 'voice' | 'image' | 'barcode'

export function SearchPage() {
  const [mode, setMode] = useState<Mode>('text')
  const [query, setQuery] = useState('')
  const [listening, setListening] = useState(false)
  const [searching, setSearching] = useState(false)
  const [results, setResults] = useState<Result[]>([])
  const [imagePreview, setImagePreview] = useState<string | null>(null)

  const runSearch = async () => {
    setSearching(true)
    await new Promise((r) => setTimeout(r, 900))
    setResults(SAMPLE)
    setSearching(false)
  }

  const onImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const url = URL.createObjectURL(file)
    setImagePreview(url)
    setMode('image')
    void runSearch()
  }

  const toggleVoice = () => {
    setListening((v) => !v)
    if (!listening) {
      // Simulate voice recognition
      setTimeout(() => {
        setQuery('Pink Floyd Dark Side')
        setListening(false)
        void runSearch()
      }, 1600)
    }
  }

  return (
    <AppShell>
      {/* Header */}
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="mb-2 flex items-center gap-2">
            <span className="rounded-md bg-emerald-400/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-300 ring-1 ring-emerald-400/30">
              NEW
            </span>
            <span className="text-[10px] font-semibold uppercase tracking-widest text-white/40">
              AI-Powered
            </span>
          </div>
          <h1 className="bg-gradient-to-br from-white via-white to-white/55 bg-clip-text text-4xl font-bold text-transparent">
            AI Search
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-white/55">
            Suche per Text, Sprache, Bild oder Barcode — Flux Bot findet deine Produkte über alle Quellen hinweg.
          </p>
        </div>
      </div>

      {/* Mode tabs */}
      <div className="mb-5 flex flex-wrap gap-2">
        {(
          [
            { id: 'text', label: 'Text', icon: SearchIcon },
            { id: 'voice', label: 'Sprache', icon: Mic },
            { id: 'image', label: 'Bild', icon: ImageIcon },
            { id: 'barcode', label: 'Barcode', icon: ScanBarcode },
          ] as const
        ).map((m) => {
          const Icon = m.icon
          const active = mode === m.id
          return (
            <button
              key={m.id}
              onClick={() => setMode(m.id)}
              className={`flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium transition-all ${
                active
                  ? 'border-cyan-400/40 bg-cyan-500/10 text-cyan-100'
                  : 'border-white/[0.06] bg-white/[0.03] text-white/70 hover:border-white/15 hover:text-white'
              }`}
            >
              <Icon size={15} />
              {m.label}
            </button>
          )
        })}
      </div>

      {/* Search input — variant by mode */}
      <div className="mb-8 rounded-3xl border border-white/[0.06] bg-gradient-to-br from-white/[0.04] to-white/[0.01] p-6">
        {mode === 'text' && (
          <div className="flex items-center gap-3">
            <div className="relative flex-1">
              <SearchIcon className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-white/35" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && runSearch()}
                placeholder="z.B. Pink Floyd Dark Side of the Moon"
                className="h-14 w-full rounded-2xl border border-white/[0.08] bg-[#0a0c12] pl-12 pr-4 text-base text-white placeholder:text-white/30 outline-none transition-all focus:border-sky-400/40 focus:shadow-[0_0_0_4px_rgba(56,189,248,0.12)]"
              />
            </div>
            <button
              onClick={runSearch}
              disabled={searching || !query}
              className="flex h-14 items-center gap-2 rounded-2xl bg-gradient-to-r from-sky-400 to-cyan-300 px-6 text-sm font-semibold text-slate-950 shadow-[0_18px_50px_-16px_rgba(56,189,248,0.6)] transition-all hover:-translate-y-0.5 disabled:opacity-50"
            >
              {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              Suchen
            </button>
          </div>
        )}

        {mode === 'voice' && (
          <div className="flex flex-col items-center gap-4 py-6">
            <button
              onClick={toggleVoice}
              className={`grid h-24 w-24 place-items-center rounded-full transition-all ${
                listening
                  ? 'bg-rose-500/20 ring-4 ring-rose-400/40 animate-pulse'
                  : 'bg-gradient-to-br from-sky-400 to-cyan-300 shadow-[0_0_40px_rgba(56,189,248,0.5)] hover:scale-105'
              }`}
            >
              <Mic className={`h-10 w-10 ${listening ? 'text-rose-300' : 'text-slate-950'}`} />
            </button>
            <p className="text-sm text-white/70">
              {listening ? 'Ich höre zu …' : 'Tippe zum Sprechen'}
            </p>
            {query && (
              <p className="rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-2 text-sm text-white/85">
                Erkannt: „{query}"
              </p>
            )}
          </div>
        )}

        {mode === 'image' && (
          <div className="flex flex-col items-center gap-4 py-4">
            <label className="group relative grid h-56 w-full cursor-pointer place-items-center rounded-2xl border-2 border-dashed border-white/[0.12] bg-white/[0.02] transition-colors hover:border-cyan-400/40 hover:bg-cyan-500/5">
              {imagePreview ? (
                <>
                  <img src={imagePreview} alt="" className="h-full w-full rounded-2xl object-contain" />
                  <button
                    onClick={(e) => {
                      e.preventDefault()
                      setImagePreview(null)
                    }}
                    className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-full bg-black/60 text-white backdrop-blur"
                  >
                    <X size={14} />
                  </button>
                </>
              ) : (
                <div className="flex flex-col items-center gap-2 text-white/55 group-hover:text-cyan-200">
                  <Camera className="h-10 w-10" />
                  <p className="text-sm font-medium">Klicken oder Bild hierher ziehen</p>
                  <p className="text-xs text-white/35">JPG, PNG, WEBP bis 10 MB</p>
                </div>
              )}
              <input type="file" accept="image/*" className="hidden" onChange={onImage} />
            </label>
          </div>
        )}

        {mode === 'barcode' && (
          <div className="flex flex-col items-center gap-4 py-4">
            <div className="relative grid h-40 w-full place-items-center overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0a0c12]">
              <div className="flex gap-0.5">
                {Array.from({ length: 28 }).map((_, i) => (
                  <div
                    key={i}
                    className="h-24 bg-white"
                    style={{ width: `${2 + (i % 4)}px` }}
                  />
                ))}
              </div>
              <div className="absolute inset-0 bg-gradient-to-b from-transparent via-cyan-400/30 to-transparent animate-pulse" />
            </div>
            <p className="text-sm text-white/70">Halte den Barcode in den Rahmen</p>
            <button
              onClick={runSearch}
              className="rounded-xl bg-cyan-500/15 px-4 py-2 text-sm text-cyan-200 ring-1 ring-cyan-400/30 transition-all hover:bg-cyan-500/25"
            >
              Manuell eingeben
            </button>
          </div>
        )}
      </div>

      {/* Results */}
      {(searching || results.length > 0) && (
        <div>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white/80">
              {searching ? 'Suche läuft …' : `${results.length} Treffer`}
            </h2>
            {!searching && (
              <span className="text-xs text-white/40">Sortiert nach AI-Match</span>
            )}
          </div>

          {searching ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {[1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className="h-28 animate-pulse rounded-2xl border border-white/[0.06] bg-white/[0.03]"
                />
              ))}
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {results.map((r) => (
                <div
                  key={r.id}
                  className="group relative overflow-hidden rounded-2xl border border-white/[0.06] bg-white/[0.03] p-4 transition-all hover:border-cyan-400/30 hover:bg-white/[0.05]"
                >
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <p className="line-clamp-1 text-sm font-semibold text-white">{r.title}</p>
                    <span className="shrink-0 rounded-md bg-emerald-400/15 px-1.5 py-0.5 text-[10px] font-bold text-emerald-300 ring-1 ring-emerald-400/30">
                      {Math.round(r.match * 100)}%
                    </span>
                  </div>
                  <div className="mb-3 flex items-center gap-3 text-xs text-white/55">
                    <span className="rounded-md bg-white/5 px-1.5 py-0.5 font-mono">{r.sku}</span>
                    <span>· {r.source}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-base font-bold text-cyan-200">€ {r.price.toFixed(2)}</span>
                    <span
                      className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${
                        r.stock <= 2
                          ? 'bg-rose-400/15 text-rose-300 ring-1 ring-rose-400/30'
                          : 'bg-emerald-400/15 text-emerald-300 ring-1 ring-emerald-400/30'
                      }`}
                    >
                      {r.stock} auf Lager
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {!searching && results.length === 0 && (
        <div className="grid gap-3 sm:grid-cols-3">
          {['Pink Floyd', 'Vintage T-Shirt', 'Buch Harry Potter'].map((s) => (
            <button
              key={s}
              onClick={() => {
                setMode('text')
                setQuery(s)
                void runSearch()
              }}
              className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4 text-left text-sm text-white/65 transition-all hover:border-cyan-400/30 hover:text-white"
            >
              <Sparkles className="mb-2 h-4 w-4 text-cyan-300/70" />
              {s}
            </button>
          ))}
        </div>
      )}
    </AppShell>
  )
}
