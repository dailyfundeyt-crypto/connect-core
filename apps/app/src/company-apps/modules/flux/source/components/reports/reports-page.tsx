import {
  CheckCircle2,
  Download,
  FileSpreadsheet,
  FileText,
  Loader2,
  Mail,
  PieChart,
  Sparkles,
} from 'lucide-react'
import { useState } from 'react'
import { AppShell } from '@flux/components/shell/app-shell'

type Format = 'pdf' | 'excel' | 'csv'

type Report = {
  id: string
  title: string
  description: string
  icon: typeof FileText
  category: 'sales' | 'inventory' | 'performance' | 'tax'
}

const REPORTS: Report[] = [
  {
    id: 'r1',
    title: 'Verkaufs-Report',
    description: 'Alle Verkäufe, Umsatz, Margen und Trends. Gruppiert nach Quelle und Zeitraum.',
    icon: PieChart,
    category: 'sales',
  },
  {
    id: 'r2',
    title: 'Lagerbestands-Report',
    description: 'Bestand pro Produkt, Lagerort und SKU. Inklusive Reorder-Vorschlägen.',
    icon: FileSpreadsheet,
    category: 'inventory',
  },
  {
    id: 'r3',
    title: 'Channel-Performance',
    description: 'Vergleich der Verkaufskanäle: Conversion, Geschwindigkeit, ROI pro Quelle.',
    icon: PieChart,
    category: 'performance',
  },
  {
    id: 'r4',
    title: 'Tax-Report (DE / EU)',
    description: 'Umsatzsteuer-relevante Daten, separiert nach EU-Ländern für die Steuererklärung.',
    icon: FileText,
    category: 'tax',
  },
  {
    id: 'r5',
    title: 'Inventory Aging',
    description: 'Produkte nach Verkaufsdauer kategorisiert — von „schnell" bis „Langsam-Dreher".',
    icon: FileSpreadsheet,
    category: 'inventory',
  },
  {
    id: 'r6',
    title: 'Profit & Loss',
    description: 'Gewinn- und Verlustrechnung pro Produkt, inklusive Fees pro Verkaufskanal.',
    icon: FileText,
    category: 'sales',
  },
]

const FORMATS: { id: Format; label: string; icon: typeof FileText; desc: string; tone: string }[] = [
  {
    id: 'pdf',
    label: 'PDF',
    icon: FileText,
    desc: 'Schön formatiert mit Charts. Ideal zum Drucken oder Archivieren.',
    tone: 'rose',
  },
  {
    id: 'excel',
    label: 'Excel',
    icon: FileSpreadsheet,
    desc: 'Pivot-Tabellen, mehrere Sheets, alle Daten. Zum Weiterverarbeiten.',
    tone: 'emerald',
  },
  {
    id: 'csv',
    label: 'CSV',
    icon: FileSpreadsheet,
    desc: 'Roh-Daten für Skripte, Importe oder Backup.',
    tone: 'sky',
  },
]

export function ReportsPage() {
  const [activeFormat, setActiveFormat] = useState<Format>('pdf')
  const [generating, setGenerating] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const [period, setPeriod] = useState('30d')

  const download = async (report: Report) => {
    setGenerating(report.id)
    setDone(null)
    await new Promise((r) => setTimeout(r, 1400))
    setGenerating(null)
    setDone(report.id)
    setTimeout(() => setDone(null), 2200)
  }

  return (
    <AppShell>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="bg-gradient-to-br from-white via-white to-white/55 bg-clip-text text-4xl font-bold text-transparent">
            Reports
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-white/55">
            Exportiere Umsatz, Lager und Performance als PDF, Excel oder CSV — automatisch generiert und fertig formatiert.
          </p>
        </div>
        <button className="flex items-center gap-2 rounded-2xl bg-gradient-to-r from-sky-400 to-cyan-300 px-5 py-2.5 text-sm font-semibold text-slate-950 shadow-[0_18px_50px_-16px_rgba(56,189,248,0.6)] transition-all hover:-translate-y-0.5">
          <Mail size={15} />
          Wöchentlich per E-Mail
        </button>
      </div>

      {/* Format selector */}
      <div className="mb-8 grid gap-3 sm:grid-cols-3">
        {FORMATS.map((f) => {
          const Icon = f.icon
          const active = activeFormat === f.id
          return (
            <button
              key={f.id}
              onClick={() => setActiveFormat(f.id)}
              className={`group relative overflow-hidden rounded-2xl border p-5 text-left transition-all ${
                active
                  ? 'border-cyan-400/40 bg-gradient-to-br from-cyan-500/10 to-sky-500/5 shadow-[0_0_0_3px_rgba(56,189,248,0.1)]'
                  : 'border-white/[0.06] bg-white/[0.03] hover:border-white/15'
              }`}
            >
              <div className="mb-3 flex items-start justify-between">
                <div
                  className={`grid h-11 w-11 place-items-center rounded-xl ring-1 transition-all ${
                    active
                      ? `bg-${f.tone}-500/20 ring-${f.tone}-400/40`
                      : 'bg-white/5 ring-white/[0.06]'
                  }`}
                >
                  <Icon className={`h-5 w-5 text-${active ? f.tone : 'white/55'}-${active ? '300' : ''}`} />
                </div>
                {active && (
                  <CheckCircle2 className="h-5 w-5 text-cyan-300" />
                )}
              </div>
              <p className="mb-1 text-sm font-semibold text-white">{f.label}</p>
              <p className="text-xs leading-relaxed text-white/55">{f.desc}</p>
            </button>
          )
        })}
      </div>

      {/* Period + Filters */}
      <div className="mb-6 flex flex-wrap items-center gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.03] px-4 py-3">
        <span className="text-xs font-semibold uppercase tracking-wider text-white/45">Zeitraum:</span>
        {['7d', '30d', '90d', '12m', 'custom'].map((p) => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={`rounded-lg px-3 py-1 text-xs font-semibold transition-all ${
              period === p
                ? 'bg-cyan-500/15 text-cyan-200 ring-1 ring-cyan-400/30'
                : 'text-white/55 hover:bg-white/5 hover:text-white'
            }`}
          >
            {p === 'custom' ? 'Eigener Zeitraum' : p}
          </button>
        ))}
        <span className="ml-auto text-xs text-white/40">
          Generiert mit Flux Bot · {new Date().toLocaleDateString('de-DE')}
        </span>
      </div>

      {/* Reports grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {REPORTS.map((r) => {
          const Icon = r.icon
          const isGenerating = generating === r.id
          const isDone = done === r.id
          return (
            <div
              key={r.id}
              className="group relative overflow-hidden rounded-2xl border border-white/[0.06] bg-white/[0.03] p-5 transition-all hover:border-cyan-400/30 hover:bg-white/[0.05]"
            >
              <div className="mb-4 flex items-start justify-between">
                <div className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br from-cyan-500/20 to-violet-500/20 ring-1 ring-cyan-400/30">
                  <Icon className="h-5 w-5 text-cyan-300" />
                </div>
                <span className="rounded-md bg-white/5 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white/55 ring-1 ring-white/[0.06]">
                  {r.category}
                </span>
              </div>
              <h3 className="mb-1 text-sm font-semibold text-white">{r.title}</h3>
              <p className="mb-4 text-xs leading-relaxed text-white/55">{r.description}</p>
              <button
                onClick={() => download(r)}
                disabled={isGenerating}
                className={`flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold transition-all ${
                  isDone
                    ? 'bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-400/30'
                    : 'bg-cyan-500/15 text-cyan-200 ring-1 ring-cyan-400/30 hover:bg-cyan-500/25'
                } disabled:opacity-60`}
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Generiere …
                  </>
                ) : isDone ? (
                  <>
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Download gestartet
                  </>
                ) : (
                  <>
                    <Download className="h-3.5 w-3.5" />
                    Als {activeFormat.toUpperCase()} herunterladen
                  </>
                )}
              </button>
            </div>
          )
        })}
      </div>

      {/* Flux Bot footer */}
      <div className="mt-8 flex items-center gap-3 rounded-2xl border border-cyan-400/20 bg-gradient-to-br from-cyan-500/10 to-violet-500/5 p-4">
        <img src="/flux-bot.png" alt="Flux Bot" className="h-10 w-10 shrink-0 rounded-full object-cover ring-2 ring-cyan-400/40" />
        <div className="flex-1">
          <p className="text-xs text-white/75">
            <span className="font-semibold text-white">Flux Bot</span> generiert deine Reports automatisch — fertig formatiert mit Charts, Summen und Insights.
          </p>
        </div>
        <Sparkles className="h-4 w-4 shrink-0 text-cyan-300" />
      </div>
    </AppShell>
  )
}