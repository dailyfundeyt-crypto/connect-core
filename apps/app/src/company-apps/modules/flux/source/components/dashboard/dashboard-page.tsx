import { useNavigate, Link } from '@tanstack/react-router'
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Boxes,
  ChevronRight,
  FileText,
  ListChecks,
  Plus,
  Search,
  Sparkles,
} from 'lucide-react'
import { AppShell } from '@flux/components/shell/app-shell'

export function DashboardPage() {
  const navigate = useNavigate()

  return (
    <AppShell>
      {/* Heading */}
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="bg-gradient-to-br from-white via-white to-white/55 bg-clip-text text-4xl font-bold text-transparent">
            Multiposter eBay
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-white/55">
            Verwalle deine Quellen, listen neue Produkte mit AI-Unterstützung und halte alle Kanäle synchron.
          </p>
        </div>
        <Link
          to="/app/multiposter"
          className="group inline-flex h-12 items-center gap-3 rounded-2xl bg-gradient-to-r from-sky-400 via-cyan-300 to-sky-400 px-6 text-sm font-semibold text-slate-950 shadow-[0_18px_50px_-16px_rgba(56,189,248,0.6)] transition-all hover:-translate-y-0.5 hover:shadow-[0_24px_60px_-18px_rgba(56,189,248,0.7)]"
        >
          <Plus className="h-5 w-5" />
          Posten
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
        </Link>
      </div>

      {/* Three hero cards */}
      <div className="grid gap-5 lg:grid-cols-3">
        {/* Card 1: Product Tour mit Background */}
        <DashboardCard
          tone="violet"
          kicker="Product Tour"
          title="Mit dem Multiposter arbeiten"
          description="Lerne in 60 Sekunden, wie du Quellen anbindest, AI nutzt und Produkte postest."
          cta="Tour starten"
          onCta={() => navigate({ to: '/app/multiposter' })}
          visual={
            <div className="relative h-40 overflow-hidden rounded-xl border border-white/10">
              <div
                className="absolute inset-0"
                style={{
                  backgroundImage:
                    'radial-gradient(circle at 30% 30%, rgba(139,92,246,0.45), transparent 60%), radial-gradient(circle at 70% 70%, rgba(56,189,248,0.45), transparent 60%), linear-gradient(135deg, #1a1530 0%, #0f1018 100%)',
                }}
              />
              <div className="absolute inset-0 grid place-items-center">
                <div className="grid h-16 w-16 place-items-center rounded-2xl bg-white/10 backdrop-blur-md ring-1 ring-white/20">
                  <Boxes className="h-8 w-8 text-sky-200" />
                </div>
              </div>
              <div className="absolute bottom-3 left-3 right-3 flex items-center gap-2 rounded-lg bg-black/30 px-3 py-2 backdrop-blur-sm">
                <Search className="h-3.5 w-3.5 text-white/70" />
                <span className="text-xs text-white/70">Verwalte deine Quellen</span>
              </div>
            </div>
          }
        />

        {/* Card 2: Product Tour mit weißen Cards */}
        <DashboardCard
          tone="sky"
          kicker="Product Tour"
          title="Mit dem Multiposter arbeiten"
          description="So postest du ein Produkt auf mehreren Marktplätzen in unter 3 Minuten."
          cta="Ansehen"
          onCta={() => navigate({ to: '/app/multiposter' })}
          visual={
            <div className="relative h-40 overflow-hidden rounded-xl border border-white/10 bg-white/[0.04]">
              <div className="absolute inset-0 grid grid-cols-3 gap-2 p-3">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <div
                    key={i}
                    className="rounded-lg bg-white/95 shadow-lg shadow-black/30"
                    style={{
                      background: i % 2 === 0
                        ? 'linear-gradient(135deg, #f4f4f9, #dcdce4)'
                        : 'linear-gradient(135deg, #ffffff, #e5e7eb)',
                    }}
                  />
                ))}
              </div>
              <div className="absolute inset-0 grid place-items-center">
                <div className="rounded-xl border border-white/30 bg-black/40 px-3 py-2 backdrop-blur-sm">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-sky-200">
                    Quick-Cards
                  </p>
                </div>
              </div>
            </div>
          }
        />

        {/* Card 3: Offene Listings */}
        <DashboardCard
          tone="cyan"
          kicker="Heute"
          title="Offene Listings"
          description="12 neue Produkte aus deinen Quellen warten auf den ersten Post."
          cta="Post Products"
          onCta={() => navigate({ to: '/app/multiposter' })}
          stat={{ value: '12', label: 'Offen' }}
          visual={
            <div className="relative h-40 overflow-hidden rounded-xl border border-white/10 bg-gradient-to-br from-cyan-500/15 via-sky-500/15 to-violet-500/20 p-4">
              <div className="grid grid-cols-4 gap-1.5">
                {Array.from({ length: 16 }).map((_, i) => (
                  <div
                    key={i}
                    className="h-6 rounded-sm border border-white/10"
                    style={{
                      background:
                        i % 5 === 0
                          ? 'linear-gradient(135deg, #22d3ee, #0ea5e9)'
                          : i % 7 === 0
                          ? 'linear-gradient(135deg, #a78bfa, #6366f1)'
                          : 'rgba(255,255,255,0.05)',
                    }}
                  />
                ))}
              </div>
              <div className="absolute bottom-3 right-3 inline-flex items-center gap-1.5 rounded-full border border-emerald-400/30 bg-emerald-400/15 px-2 py-0.5 text-[10px] font-medium text-emerald-200">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" />
                Auto-Poster
              </div>
            </div>
          }
        />
      </div>

      {/* Smart Features — 4 neue Funktionen */}
      <section className="mt-10">
        <div className="mb-5 flex items-end justify-between gap-4">
          <div>
            <h2 className="bg-gradient-to-br from-white via-white to-white/55 bg-clip-text text-2xl font-bold text-transparent">
              Smart Features
            </h2>
            <p className="mt-1 text-sm text-white/55">
              Flux Bot erweitert dein Multiposter um Search, Analytics, Alerts und Reports.
            </p>
          </div>
          <span className="rounded-md bg-emerald-400/15 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-emerald-300 ring-1 ring-emerald-400/30">
            Neu verfügbar
          </span>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {/* AI Search */}
          <Link
            to="/app/search"
            className="group relative overflow-hidden rounded-2xl border border-white/[0.06] bg-gradient-to-br from-cyan-500/[0.08] via-sky-500/[0.04] to-transparent p-5 transition-all hover:border-cyan-400/40 hover:shadow-[0_20px_60px_-30px_rgba(34,211,238,0.6)]"
          >
            <div className="mb-4 flex items-start justify-between">
              <div className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br from-cyan-500/25 to-sky-500/15 ring-1 ring-cyan-400/40">
                <Search className="h-5 w-5 text-cyan-300" />
              </div>
              <span className="rounded-md bg-emerald-400/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-300 ring-1 ring-emerald-400/30">
                New
              </span>
            </div>
            <h3 className="mb-1 text-sm font-semibold text-white">AI Search</h3>
            <p className="mb-4 text-xs leading-relaxed text-white/55">
              Text, Sprache, Bild oder Barcode — finde jedes Produkt in Sekunden.
            </p>
            <div className="flex items-center gap-1.5 text-xs font-medium text-cyan-200 transition-transform group-hover:translate-x-0.5">
              Öffnen
              <ArrowRight className="h-3 w-3" />
            </div>
          </Link>

          {/* Analytics */}
          <Link
            to="/app/analytics"
            className="group relative overflow-hidden rounded-2xl border border-white/[0.06] bg-gradient-to-br from-violet-500/[0.08] via-violet-500/[0.04] to-transparent p-5 transition-all hover:border-violet-400/40 hover:shadow-[0_20px_60px_-30px_rgba(139,92,246,0.6)]"
          >
            <div className="mb-4 flex items-start justify-between">
              <div className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br from-violet-500/25 to-cyan-500/15 ring-1 ring-violet-400/40">
                <BarChart3 className="h-5 w-5 text-violet-300" />
              </div>
            </div>
            <h3 className="mb-1 text-sm font-semibold text-white">Analytics</h3>
            <p className="mb-4 text-xs leading-relaxed text-white/55">
              Forecasts, Trend-Insights und AI-Empfehlungen — alles auf einen Blick.
            </p>
            <div className="flex items-center gap-1.5 text-xs font-medium text-violet-200 transition-transform group-hover:translate-x-0.5">
              Öffnen
              <ArrowRight className="h-3 w-3" />
            </div>
          </Link>

          {/* Smart Alerts */}
          <Link
            to="/app/alerts"
            className="group relative overflow-hidden rounded-2xl border border-white/[0.06] bg-gradient-to-br from-rose-500/[0.08] via-amber-500/[0.04] to-transparent p-5 transition-all hover:border-rose-400/40 hover:shadow-[0_20px_60px_-30px_rgba(244,63,94,0.6)]"
          >
            <div className="mb-4 flex items-start justify-between">
              <div className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br from-rose-500/25 to-amber-500/15 ring-1 ring-rose-400/40">
                <AlertTriangle className="h-5 w-5 text-rose-300" />
              </div>
              <span className="rounded-md bg-rose-400/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-rose-300 ring-1 ring-rose-400/30">
                3 neu
              </span>
            </div>
            <h3 className="mb-1 text-sm font-semibold text-white">Smart Alerts</h3>
            <p className="mb-4 text-xs leading-relaxed text-white/55">
              Flux Bot warnt dich automatisch bei niedrigem Bestand und ablaufenden Listings.
            </p>
            <div className="flex items-center gap-1.5 text-xs font-medium text-rose-200 transition-transform group-hover:translate-x-0.5">
              Öffnen
              <ArrowRight className="h-3 w-3" />
            </div>
          </Link>

          {/* Reports */}
          <Link
            to="/app/reports"
            className="group relative overflow-hidden rounded-2xl border border-white/[0.06] bg-gradient-to-br from-emerald-500/[0.08] via-cyan-500/[0.04] to-transparent p-5 transition-all hover:border-emerald-400/40 hover:shadow-[0_20px_60px_-30px_rgba(110,231,183,0.6)]"
          >
            <div className="mb-4 flex items-start justify-between">
              <div className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br from-emerald-500/25 to-cyan-500/15 ring-1 ring-emerald-400/40">
                <FileText className="h-5 w-5 text-emerald-300" />
              </div>
            </div>
            <h3 className="mb-1 text-sm font-semibold text-white">Reports</h3>
            <p className="mb-4 text-xs leading-relaxed text-white/55">
              Exportiere Umsatz & Lager als PDF, Excel oder CSV — automatisch generiert.
            </p>
            <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-200 transition-transform group-hover:translate-x-0.5">
              Öffnen
              <ArrowRight className="h-3 w-3" />
            </div>
          </Link>
        </div>
      </section>

      {/* Quick stats strip */}
      <section className="mt-10">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-widest text-white/40">
          Heute auf einen Blick
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: 'Quellen', value: '5', icon: Boxes, tone: 'sky', to: '/app/multiposter' as const, hint: 'Sheets, CSV, eBay, Shopify, Kleinanzeigen' },
            { label: 'Produkte gesamt', value: '238', icon: ListChecks, tone: 'violet', to: '/app/multiposter' as const, hint: '238 Produkte im Multiposter' },
            { label: 'AI-Listings', value: '64', icon: Sparkles, tone: 'cyan', to: '/app/multiposter' as const, hint: '64 AI-generierte Beschreibungen' },
            { label: 'Reichweite', value: '5 Stores', icon: ChevronRight, tone: 'rose', to: '/app/dashboard' as const, hint: '5 Stores verbunden' },
          ].map((s) => {
            const Icon = s.icon
            return (
              <Link
                key={s.label}
                to={s.to}
                title={s.hint}
                className="group flex items-center gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.03] p-4 backdrop-blur-sm transition-all hover:border-sky-400/30 hover:bg-white/[0.05]"
              >
                <div className={`grid h-10 w-10 place-items-center rounded-xl ring-1 ${
                  s.tone === 'sky' ? 'bg-sky-400/15 text-sky-300 ring-sky-400/30' :
                  s.tone === 'violet' ? 'bg-violet-400/15 text-violet-200 ring-violet-400/30' :
                  s.tone === 'cyan' ? 'bg-cyan-400/15 text-cyan-200 ring-cyan-400/30' :
                  'bg-rose-400/15 text-rose-200 ring-rose-400/30'
                }`}>
                  <Icon size={16} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs text-white/45">{s.label}</p>
                  <p className="text-lg font-semibold text-white">{s.value}</p>
                </div>
                <ChevronRight size={14} className="text-white/30 transition-transform group-hover:translate-x-0.5 group-hover:text-sky-300" />
              </Link>
            )
          })}
        </div>
      </section>
    </AppShell>
  )
}

function DashboardCard({
  tone,
  kicker,
  title,
  description,
  cta,
  onCta,
  visual,
  stat,
}: {
  tone: 'sky' | 'violet' | 'cyan'
  kicker: string
  title: string
  description: string
  cta: string
  onCta: () => void
  visual: React.ReactNode
  stat?: { value: string; label: string }
}) {
  const ring =
    tone === 'sky'
      ? 'border-sky-400/30 hover:border-sky-400/60 hover:shadow-[0_30px_70px_-30px_rgba(56,189,248,0.5)]'
      : tone === 'violet'
      ? 'border-violet-400/30 hover:border-violet-400/60 hover:shadow-[0_30px_70px_-30px_rgba(139,92,246,0.5)]'
      : 'border-cyan-400/30 hover:border-cyan-400/60 hover:shadow-[0_30px_70px_-30px_rgba(34,211,238,0.5)]'

  return (
    <div
      className={`group relative overflow-hidden rounded-3xl border bg-gradient-to-b from-white/[0.04] via-white/[0.02] to-transparent p-6 backdrop-blur-sm transition-all ${ring}`}
    >
      <p className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-sky-300/80">
        {kicker}
      </p>
      <h3 className="text-lg font-semibold text-white">{title}</h3>
      <p className="mt-1.5 text-sm text-white/55">{description}</p>

      {visual && <div className="mt-5">{visual}</div>}

      <div className="mt-5 flex items-center justify-between gap-3">
        <button
          onClick={onCta}
          className="inline-flex h-9 items-center gap-2 rounded-xl bg-white/[0.06] px-4 text-sm font-medium text-white transition-all hover:bg-white/[0.1]"
        >
          {cta}
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
        {stat && (
          <div className="text-right">
            <p className="text-2xl font-bold text-white">{stat.value}</p>
            <p className="text-[10px] uppercase tracking-widest text-white/40">{stat.label}</p>
          </div>
        )}
      </div>
    </div>
  )
}