import {
  ArrowDownRight,
  ArrowUpRight,
  Brain,
  Calendar,
  Euro,
  Eye,
  Package,
  ShoppingCart,
  Sparkles,
  TrendingUp,
} from 'lucide-react'
import { AppShell } from '@flux/components/shell/app-shell'

type Metric = {
  label: string
  value: string
  delta: number
  icon: typeof Euro
  tone: 'cyan' | 'violet' | 'emerald' | 'amber'
}

const METRICS: Metric[] = [
  { label: 'Umsatz (30d)', value: '€ 18.420', delta: 12.4, icon: Euro, tone: 'cyan' },
  { label: 'Verkäufe', value: '142', delta: 8.1, icon: ShoppingCart, tone: 'violet' },
  { label: 'Aktive Listings', value: '286', delta: -3.2, icon: Package, tone: 'emerald' },
  { label: 'Aufrufe', value: '12.847', delta: 24.6, icon: Eye, tone: 'amber' },
]

const TREND = [
  { d: 'Mo', revenue: 420, listings: 22 },
  { d: 'Di', revenue: 580, listings: 28 },
  { d: 'Mi', revenue: 490, listings: 24 },
  { d: 'Do', revenue: 720, listings: 31 },
  { d: 'Fr', revenue: 980, listings: 42 },
  { d: 'Sa', revenue: 1240, listings: 51 },
  { d: 'So', revenue: 880, listings: 38 },
]
const MAX_REV = Math.max(...TREND.map((t) => t.revenue))

const TOP_PRODUCTS = [
  { name: 'Pink Floyd – Dark Side of the Moon', sold: 14, revenue: 392, trend: 12 },
  { name: 'Vintage Nike Hoodie XL', sold: 9, revenue: 270, trend: -3 },
  { name: 'Sony WH-1000XM4 Kopfhörer', sold: 7, revenue: 1820, trend: 18 },
  { name: 'Star Wars Comic #001', sold: 6, revenue: 240, trend: 5 },
  { name: 'iPhone 13 Pro 256GB', sold: 4, revenue: 1440, trend: -8 },
]

const AI_INSIGHTS = [
  {
    title: 'Nachfrage Spike erwartet',
    body: 'Vintage Nike Hoodies verkaufen sich im November 3.4× schneller als im Schnitt. Lagere 40 Stück ein.',
    confidence: 92,
    icon: TrendingUp,
    tone: 'emerald' as const,
  },
  {
    title: 'Preis-Empfehlung',
    body: 'Sony WH-1000XM4 kannst du um 8% teurer listen — Wettbewerb im 30-Tage-Schnitt ist gesunken.',
    confidence: 87,
    icon: Euro,
    tone: 'cyan' as const,
  },
  {
    title: 'Langsame Verkäufer',
    body: '12 Listings seit >60 Tagen nicht verkauft. Vorschlag: Preis um 15% senken oder aus Listen nehmen.',
    confidence: 79,
    icon: Calendar,
    tone: 'amber' as const,
  },
]

export function AnalyticsPage() {
  return (
    <AppShell>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="bg-gradient-to-br from-white via-white to-white/55 bg-clip-text text-4xl font-bold text-transparent">
            Analytics
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-white/55">
            Forecasts, Trend-Insights und AI-Empfehlungen für deine Verkäufe — auf einen Blick.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {['7d', '30d', '90d', '12m'].map((p, i) => (
            <button
              key={p}
              className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition-all ${
                i === 1
                  ? 'bg-cyan-500/15 text-cyan-200 ring-1 ring-cyan-400/30'
                  : 'text-white/50 hover:bg-white/5 hover:text-white'
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* KPI grid */}
      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {METRICS.map((m) => {
          const Icon = m.icon
          const positive = m.delta >= 0
          return (
            <div
              key={m.label}
              className="group relative overflow-hidden rounded-2xl border border-white/[0.06] bg-white/[0.03] p-5 transition-all hover:border-cyan-400/30"
            >
              <div className="mb-3 flex items-start justify-between">
                <div className={`grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-${m.tone}-500/20 to-${m.tone}-400/5 ring-1 ring-${m.tone}-400/30`}>
                  <Icon className={`h-5 w-5 text-${m.tone}-300`} />
                </div>
                <span
                  className={`flex items-center gap-0.5 rounded-md px-2 py-0.5 text-[11px] font-semibold ${
                    positive
                      ? 'bg-emerald-400/15 text-emerald-300 ring-1 ring-emerald-400/30'
                      : 'bg-rose-400/15 text-rose-300 ring-1 ring-rose-400/30'
                  }`}
                >
                  {positive ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                  {Math.abs(m.delta)}%
                </span>
              </div>
              <p className="text-xs font-medium uppercase tracking-wider text-white/45">{m.label}</p>
              <p className="mt-1 text-2xl font-bold text-white">{m.value}</p>
            </div>
          )
        })}
      </div>

      {/* Trend chart */}
      <div className="mb-8 grid gap-6 lg:grid-cols-3">
        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] p-5 lg:col-span-2">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-white">Umsatz & Listings pro Tag</h2>
              <p className="text-xs text-white/45">Letzte 7 Tage · Live aus deinen Quellen</p>
            </div>
            <div className="flex items-center gap-3 text-xs">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-cyan-400" /> Revenue
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-violet-400" /> Listings
              </span>
            </div>
          </div>
          <div className="flex h-56 items-end gap-3">
            {TREND.map((t) => (
              <div key={t.d} className="flex flex-1 flex-col items-center gap-1">
                <div className="flex h-full w-full items-end justify-center gap-1">
                  <div
                    className="w-1/2 rounded-t-md bg-gradient-to-t from-cyan-500/40 to-cyan-300 shadow-[0_0_10px_rgba(34,211,238,0.4)]"
                    style={{ height: `${(t.revenue / MAX_REV) * 100}%` }}
                  />
                  <div
                    className="w-1/3 rounded-t-md bg-gradient-to-t from-violet-500/40 to-violet-300"
                    style={{ height: `${(t.listings / 60) * 100}%` }}
                  />
                </div>
                <span className="text-[10px] font-semibold text-white/45">{t.d}</span>
              </div>
            ))}
          </div>
        </div>

        {/* AI insights */}
        <div className="rounded-2xl border border-violet-400/20 bg-gradient-to-br from-violet-500/10 to-cyan-500/5 p-5">
          <div className="mb-4 flex items-center gap-2">
            <div className="grid h-9 w-9 place-items-center rounded-xl bg-violet-500/20 ring-1 ring-violet-400/30">
              <Brain className="h-4 w-4 text-violet-300" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-white">AI Insights</h2>
              <p className="text-[11px] text-white/45">Smart Forecast Engine</p>
            </div>
          </div>
          <div className="space-y-3">
            {AI_INSIGHTS.map((ins) => {
              const Icon = ins.icon
              return (
                <div
                  key={ins.title}
                  className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-3 transition-colors hover:bg-white/[0.05]"
                >
                  <div className="mb-1.5 flex items-start gap-2">
                    <Icon className={`mt-0.5 h-4 w-4 shrink-0 text-${ins.tone}-300`} />
                    <p className="text-xs font-semibold text-white">{ins.title}</p>
                  </div>
                  <p className="ml-6 text-[11px] leading-relaxed text-white/60">{ins.body}</p>
                  <div className="ml-6 mt-2 flex items-center gap-1.5">
                    <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/5">
                      <div
                        className={`h-full bg-${ins.tone}-400/70`}
                        style={{ width: `${ins.confidence}%` }}
                      />
                    </div>
                    <span className="text-[10px] font-mono text-white/45">{ins.confidence}%</span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Top products */}
      <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03]">
        <div className="flex items-center justify-between border-b border-white/[0.06] p-5">
          <div>
            <h2 className="text-base font-semibold text-white">Top-Produkte</h2>
            <p className="text-xs text-white/45">Nach Umsatz in den letzten 30 Tagen</p>
          </div>
          <Sparkles className="h-4 w-4 text-cyan-300/70" />
        </div>
        <div className="divide-y divide-white/[0.04]">
          {TOP_PRODUCTS.map((p, i) => {
            const positive = p.trend >= 0
            return (
              <div
                key={p.name}
                className="flex items-center gap-4 px-5 py-3.5 transition-colors hover:bg-white/[0.02]"
              >
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-cyan-500/20 to-violet-500/20 text-xs font-bold text-cyan-200 ring-1 ring-cyan-400/20">
                  #{i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-white">{p.name}</p>
                  <p className="text-xs text-white/45">{p.sold} verkauft</p>
                </div>
                <span className="hidden text-sm font-semibold text-white sm:block">
                  € {p.revenue.toLocaleString('de-DE')}
                </span>
                <span
                  className={`flex items-center gap-0.5 rounded-md px-2 py-0.5 text-[11px] font-semibold ${
                    positive
                      ? 'bg-emerald-400/15 text-emerald-300 ring-1 ring-emerald-400/30'
                      : 'bg-rose-400/15 text-rose-300 ring-1 ring-rose-400/30'
                  }`}
                >
                  {positive ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                  {Math.abs(p.trend)}%
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </AppShell>
  )
}