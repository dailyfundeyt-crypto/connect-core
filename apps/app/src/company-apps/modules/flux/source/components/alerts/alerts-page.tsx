import {
  AlertTriangle,
  Bell,
  Calendar,
  CheckCircle2,
  Clock,
  Package,
  Sparkles,
  TrendingDown,
} from 'lucide-react'
import { useState } from 'react'
import { AppShell } from '@flux/components/shell/app-shell'

type AlertSeverity = 'critical' | 'warning' | 'info'

type Alert = {
  id: string
  type: 'low_stock' | 'expiring' | 'price_drop' | 'no_sale'
  severity: AlertSeverity
  title: string
  body: string
  product: string
  sku: string
  time: string
  meta?: string
}

const ALERTS: Alert[] = [
  {
    id: '1',
    type: 'low_stock',
    severity: 'critical',
    title: 'Niedriger Bestand',
    body: 'Nur noch 1 Stück auf Lager. Reorder-Schwelle: 5 Stück.',
    product: 'Pink Floyd – Wish You Were Here',
    sku: 'VIN-0188',
    time: 'vor 12 Min',
    meta: '1 / 5 Stück',
  },
  {
    id: '2',
    type: 'expiring',
    severity: 'warning',
    title: 'Listing läuft bald ab',
    body: 'In 3 Tagen wird dieses Listing automatisch deaktiviert.',
    product: 'Vintage Nike Hoodie XL',
    sku: 'CLT-0431',
    time: 'vor 1 Std',
    meta: 'läuft ab: 10.10.2026',
  },
  {
    id: '3',
    type: 'price_drop',
    severity: 'info',
    title: 'Wettbewerber-Preis gefallen',
    body: 'Sony WH-1000XM4 bei eBay jetzt 12% günstiger gelistet.',
    product: 'Sony WH-1000XM4',
    sku: 'ELC-0244',
    time: 'vor 2 Std',
    meta: '€ 219 → € 193',
  },
  {
    id: '4',
    type: 'no_sale',
    severity: 'warning',
    title: 'Seit 90 Tagen nicht verkauft',
    body: 'Empfehlung: Preis um 15% senken oder aus Listen nehmen.',
    product: 'Star Wars Comic #001',
    sku: 'BCH-0089',
    time: 'vor 4 Std',
    meta: 'Letzter Verkauf: 06.07.2026',
  },
  {
    id: '5',
    type: 'low_stock',
    severity: 'critical',
    title: 'Niedriger Bestand',
    body: 'Nur noch 2 Stück. Reorder-Schwelle: 10 Stück.',
    product: 'iPhone 13 Pro 256GB Space Gray',
    sku: 'ELC-0107',
    time: 'vor 6 Std',
    meta: '2 / 10 Stück',
  },
  {
    id: '6',
    type: 'expiring',
    severity: 'info',
    title: 'Abo läuft bald ab',
    body: 'Dein Flux Pro Abo endet in 14 Tagen — jetzt verlängern.',
    product: 'Flux Pro Abo',
    sku: 'SUB-PRO-2026',
    time: 'vor 1 Tag',
    meta: 'endet am: 21.10.2026',
  },
]

const severityStyle = (s: AlertSeverity) => {
  if (s === 'critical') return 'border-rose-400/30 bg-gradient-to-br from-rose-500/10 to-rose-500/[0.02]'
  if (s === 'warning') return 'border-amber-400/30 bg-gradient-to-br from-amber-500/10 to-amber-500/[0.02]'
  return 'border-sky-400/30 bg-gradient-to-br from-sky-500/10 to-sky-500/[0.02]'
}

const severityIcon = (s: AlertSeverity) => {
  if (s === 'critical') return 'bg-rose-500/20 ring-rose-400/40 text-rose-300'
  if (s === 'warning') return 'bg-amber-500/20 ring-amber-400/40 text-amber-300'
  return 'bg-sky-500/20 ring-sky-400/40 text-sky-300'
}

const typeIcon = (t: Alert['type']) => {
  if (t === 'low_stock') return Package
  if (t === 'expiring') return Calendar
  if (t === 'price_drop') return TrendingDown
  if (t === 'no_sale') return Clock
  return AlertTriangle
}

export function AlertsPage() {
  const [dismissed, setDismissed] = useState<string[]>([])
  const visible = ALERTS.filter((a) => !dismissed.includes(a.id))
  const critical = visible.filter((a) => a.severity === 'critical').length
  const warning = visible.filter((a) => a.severity === 'warning').length

  return (
    <AppShell>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="mb-2 flex items-center gap-2">
            <span className="rounded-md bg-rose-400/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-rose-300 ring-1 ring-rose-400/30">
              {visible.length} aktiv
            </span>
            <span className="text-[10px] font-semibold uppercase tracking-widest text-white/40">
              Smart Monitoring
            </span>
          </div>
          <h1 className="bg-gradient-to-br from-white via-white to-white/55 bg-clip-text text-4xl font-bold text-transparent">
            Smart Alerts
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-white/55">
            Flux Bot warnt dich automatisch bei kritischem Bestand, ablaufenden Listings, Preisbewegungen und Verkaufsmärkten.
          </p>
        </div>
        <button className="flex items-center gap-2 rounded-2xl border border-white/[0.06] bg-white/[0.03] px-4 py-2 text-sm text-white/70 transition-all hover:border-white/15 hover:text-white">
          <Bell size={15} />
          Regeln verwalten
        </button>
      </div>

      {/* Summary cards */}
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <div className="relative overflow-hidden rounded-2xl border border-rose-400/20 bg-gradient-to-br from-rose-500/10 to-rose-500/[0.02] p-5">
          <div className="mb-2 flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-rose-500/20 ring-1 ring-rose-400/40">
              <AlertTriangle className="h-5 w-5 text-rose-300" />
            </div>
            <span className="text-xs font-semibold uppercase tracking-wider text-white/45">Kritisch</span>
          </div>
          <p className="text-3xl font-bold text-white">{critical}</p>
          <p className="mt-1 text-xs text-white/55">Sofort handeln</p>
        </div>
        <div className="relative overflow-hidden rounded-2xl border border-amber-400/20 bg-gradient-to-br from-amber-500/10 to-amber-500/[0.02] p-5">
          <div className="mb-2 flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-amber-500/20 ring-1 ring-amber-400/40">
              <Clock className="h-5 w-5 text-amber-300" />
            </div>
            <span className="text-xs font-semibold uppercase tracking-wider text-white/45">Warnung</span>
          </div>
          <p className="text-3xl font-bold text-white">{warning}</p>
          <p className="mt-1 text-xs text-white/55">Diese Woche prüfen</p>
        </div>
        <div className="relative overflow-hidden rounded-2xl border border-emerald-400/20 bg-gradient-to-br from-emerald-500/10 to-emerald-500/[0.02] p-5">
          <div className="mb-2 flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-500/20 ring-1 ring-emerald-400/40">
              <CheckCircle2 className="h-5 w-5 text-emerald-300" />
            </div>
            <span className="text-xs font-semibold uppercase tracking-wider text-white/45">Erledigt</span>
          </div>
          <p className="text-3xl font-bold text-white">28</p>
          <p className="mt-1 text-xs text-white/55">Diese Woche</p>
        </div>
      </div>

      {/* Filter row */}
      <div className="mb-5 flex flex-wrap items-center gap-2">
        {[
          { id: 'all', label: 'Alle', count: visible.length },
          { id: 'critical', label: 'Kritisch', count: critical },
          { id: 'warning', label: 'Warnung', count: warning },
          { id: 'info', label: 'Info', count: visible.filter((a) => a.severity === 'info').length },
        ].map((f, i) => (
          <button
            key={f.id}
            className={`flex items-center gap-2 rounded-xl border px-3 py-1.5 text-xs font-medium transition-all ${
              i === 0
                ? 'border-cyan-400/40 bg-cyan-500/10 text-cyan-200'
                : 'border-white/[0.06] bg-white/[0.02] text-white/55 hover:border-white/15 hover:text-white'
            }`}
          >
            {f.label}
            <span className="rounded-md bg-white/10 px-1.5 py-0.5 text-[10px] font-bold text-white/80">
              {f.count}
            </span>
          </button>
        ))}
      </div>

      {/* Alert list */}
      <div className="space-y-3">
        {visible.map((a) => {
          const Icon = typeIcon(a.type)
          return (
            <div
              key={a.id}
              className={`group relative overflow-hidden rounded-2xl border p-4 transition-all hover:scale-[1.005] ${severityStyle(a.severity)}`}
            >
              <div className="flex items-start gap-4">
                <div className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ring-1 ${severityIcon(a.severity)}`}>
                  <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex items-start justify-between gap-2">
                    <p className="text-sm font-semibold text-white">{a.title}</p>
                    <span className="shrink-0 text-[11px] text-white/45">{a.time}</span>
                  </div>
                  <p className="mb-2 text-xs leading-relaxed text-white/65">{a.body}</p>
                  <div className="flex flex-wrap items-center gap-2 text-[11px]">
                    <span className="rounded-md bg-white/5 px-1.5 py-0.5 font-mono text-white/65 ring-1 ring-white/[0.06]">
                      {a.sku}
                    </span>
                    <span className="text-white/45">{a.product}</span>
                    {a.meta && (
                      <span className="ml-auto rounded-md bg-black/30 px-2 py-0.5 font-semibold text-white/75 ring-1 ring-white/[0.06]">
                        {a.meta}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className="mt-3 flex items-center gap-2">
                <button className="flex-1 rounded-lg border border-white/[0.06] bg-white/5 px-3 py-1.5 text-[11px] font-semibold text-white transition-colors hover:bg-white/10">
                  Ansehen
                </button>
                <button className="rounded-lg border border-white/[0.06] bg-white/5 px-3 py-1.5 text-[11px] font-semibold text-white/75 transition-colors hover:bg-white/10">
                  Beheben
                </button>
                <button
                  onClick={() => setDismissed((d) => [...d, a.id])}
                  className="rounded-lg border border-white/[0.06] bg-white/5 px-3 py-1.5 text-[11px] font-semibold text-white/55 transition-colors hover:bg-white/10"
                >
                  Schließen
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {visible.length === 0 && (
        <div className="rounded-3xl border border-emerald-400/20 bg-gradient-to-br from-emerald-500/5 to-emerald-500/[0.01] p-12 text-center">
          <CheckCircle2 className="mx-auto mb-3 h-12 w-12 text-emerald-300" />
          <p className="text-base font-semibold text-white">Alles erledigt</p>
          <p className="mt-1 text-sm text-white/55">Du bist auf dem Laufenden. Keine offenen Alerts.</p>
        </div>
      )}

      {/* Flux Bot footer */}
      <div className="mt-8 flex items-center gap-3 rounded-2xl border border-violet-400/20 bg-gradient-to-br from-violet-500/10 to-cyan-500/5 p-4">
        <img src="/flux-bot.png" alt="Flux Bot" className="h-10 w-10 shrink-0 rounded-full object-cover ring-2 ring-violet-400/40" />
        <div className="flex-1">
          <p className="text-xs text-white/75">
            <span className="font-semibold text-white">Flux Bot</span> überwacht deinen Bestand 24/7 und schlägt dir automatisch Reorder-Schwellen vor.
          </p>
        </div>
        <Sparkles className="h-4 w-4 shrink-0 text-violet-300" />
      </div>
    </AppShell>
  )
}