import { useState } from 'react'
import {
  Boxes,
  Briefcase,
  Database,
  FileText,
  Layers,
  Package,
  Plug,
  Search,
  Shield,
  Star,
  Wrench,
} from 'lucide-react'
import { AppShell } from '@flux/components/shell/app-shell'

type Agent = {
  id: string
  name: string
  description: string
  category: 'inventory' | 'listing' | 'logistics' | 'analytics'
  active: boolean
  tasks: number
  files: number
  tools: number
  status: 'running' | 'paused' | 'idle'
  hue: 'sky' | 'violet' | 'emerald' | 'amber'
  bigIcon: React.ReactNode
}

const AGENTS: Agent[] = [
  {
    id: 'flow',
    name: 'Flow',
    description: 'Streamt Einkäufe aus Sheets, CSV und Shopify in deinen Workflow.',
    category: 'inventory',
    active: true,
    tasks: 124,
    files: 38,
    tools: 5,
    status: 'running',
    hue: 'sky',
    bigIcon: <Database size={48} />,
  },
  {
    id: 'lister',
    name: 'Lister',
    description: 'Erstellt AI-Beschreibungen, Titel und Tags für deine Produkte.',
    category: 'listing',
    active: false,
    tasks: 86,
    files: 14,
    tools: 3,
    status: 'paused',
    hue: 'violet',
    bigIcon: <FileText size={48} />,
  },
  {
    id: 'courier',
    name: 'Courier',
    description: 'Verwaltet Kartons, QR-Codes, Versandlabels und Rechnungen.',
    category: 'logistics',
    active: false,
    tasks: 47,
    files: 21,
    tools: 4,
    status: 'idle',
    hue: 'emerald',
    bigIcon: <Package size={48} />,
  },
  {
    id: 'pulse',
    name: 'Pulse',
    description: 'Analysiert Marge, Payoff und Deckungsbeitrag pro Store.',
    category: 'analytics',
    active: true,
    tasks: 192,
    files: 9,
    tools: 6,
    status: 'running',
    hue: 'amber',
    bigIcon: <Layers size={48} />,
  },
]

const FILTERS: { id: 'all' | 'active' | 'inactive'; label: string }[] = [
  { id: 'all', label: 'Alle Agents' },
  { id: 'active', label: 'Active' },
  { id: 'inactive', label: 'Inactive' },
]

export function AgentsPage() {
  const [filter, setFilter] = useState<'all' | 'active' | 'inactive'>('all')
  const [search, setSearch] = useState('')
  const [agents, setAgents] = useState(AGENTS)
  const [toast, setToast] = useState<string | null>(null)

  const visible = agents.filter((a) => {
    if (filter === 'all') return true
    if (filter === 'active') return a.active
    return !a.active
  }).filter((a) => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return a.name.toLowerCase().includes(q) || a.description.toLowerCase().includes(q)
  })

  const toggle = (id: string) => {
    setAgents((prev) => {
      const next = prev.map((a) => (a.id === id ? { ...a, active: !a.active } : a))
      const a = next.find((x) => x.id === id)
      if (a) {
        setToast(`${a.name} ${a.active ? 'verbunden' : 'getrennt'}`)
        window.setTimeout(() => setToast(null), 2200)
      }
      return next
    })
  }

  return (
    <AppShell>
      <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mb-2 inline-flex items-center gap-2 rounded-full border border-violet-400/30 bg-violet-400/10 px-3 py-1 text-xs text-violet-200">
            <Star className="h-3 w-3" />
            {agents.filter((a) => a.active).length} active · {agents.filter((a) => !a.active).length} inactive
          </p>
          <h1 className="bg-gradient-to-br from-white via-white to-white/55 bg-clip-text text-4xl font-bold text-transparent">
            Agents
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-white/55">
            Schalte spezialisierte Agents frei, die deinen Multiposter ergänzen — von Sheets-Sync bis AI-Listings.
          </p>
        </div>
        <button className="inline-flex h-11 items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-5 text-sm font-semibold text-white hover:bg-white/[0.08]">
          <Plug size={14} />
          Neuen Agent verbinden
        </button>
      </div>

      {/* Filter / Search */}
      <div className="mb-6 flex flex-wrap items-center gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.02] px-4 py-3 backdrop-blur-sm">
        <div className="flex items-center gap-1 rounded-xl bg-white/[0.04] p-1">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
                filter === f.id
                  ? 'bg-white/[0.1] text-white shadow-inner shadow-white/5'
                  : 'text-white/55 hover:text-white/85'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="relative ml-auto flex-1 max-w-[300px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/35" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Agent suchen…"
            className="h-9 w-full rounded-lg border border-white/[0.05] bg-white/[0.03] pl-9 pr-3 text-xs text-white placeholder:text-white/30 outline-none focus:border-sky-400/40"
          />
        </div>
      </div>

      {/* Agent grid */}
      {visible.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] p-10 text-center">
          <p className="text-sm text-white/55">Kein Agent gefunden.</p>
          <button
            onClick={() => {
              setSearch('')
              setFilter('all')
            }}
            className="mt-3 text-xs text-sky-300 hover:text-sky-200"
          >
            Filter zurücksetzen
          </button>
        </div>
      ) : (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-2">
          {visible.map((a) => (
            <AgentCard key={a.id} agent={a} onToggle={() => toggle(a.id)} />
          ))}
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-2xl border border-white/10 bg-[#0a0c12]/95 px-4 py-3 text-sm text-white shadow-2xl shadow-black/60 backdrop-blur-xl">
          {toast}
        </div>
      )}
    </AppShell>
  )
}

function AgentCard({ agent, onToggle }: { agent: Agent; onToggle: () => void }) {
  const ring =
    agent.hue === 'sky'
      ? 'border-sky-400/25 hover:border-sky-400/55 hover:shadow-[0_30px_70px_-30px_rgba(56,189,248,0.5)]'
      : agent.hue === 'violet'
      ? 'border-violet-400/25 hover:border-violet-400/55 hover:shadow-[0_30px_70px_-30px_rgba(139,92,246,0.5)]'
      : agent.hue === 'emerald'
      ? 'border-emerald-400/25 hover:border-emerald-400/55 hover:shadow-[0_30px_70px_-30px_rgba(16,185,129,0.45)]'
      : 'border-amber-400/25 hover:border-amber-400/55 hover:shadow-[0_30px_70px_-30px_rgba(245,158,11,0.45)]'

  const hueRing =
    agent.hue === 'sky'
      ? 'ring-sky-400/40 text-sky-200 bg-sky-400/10'
      : agent.hue === 'violet'
      ? 'ring-violet-400/40 text-violet-200 bg-violet-400/10'
      : agent.hue === 'emerald'
      ? 'ring-emerald-400/40 text-emerald-200 bg-emerald-400/10'
      : 'ring-amber-400/40 text-amber-200 bg-amber-400/10'

  const statusDot =
    agent.status === 'running'
      ? 'bg-emerald-300 shadow-[0_0_10px_rgba(110,231,183,0.8)]'
      : agent.status === 'paused'
      ? 'bg-amber-300 shadow-[0_0_10px_rgba(252,211,77,0.7)]'
      : 'bg-white/30'

  const total = agent.tasks + agent.files + agent.tools
  const tP = (agent.tasks / total) * 100
  const fP = (agent.files / total) * 100
  const tlP = 100 - tP - fP

  return (
    <article className={`overflow-hidden rounded-3xl border bg-gradient-to-b from-white/[0.04] via-white/[0.02] to-transparent p-6 backdrop-blur-sm transition-all ${ring}`}>
      <header className="mb-5 flex items-start gap-4">
        <div className={`grid h-14 w-14 shrink-0 place-items-center rounded-2xl ring-1 ${hueRing}`}>
          {agent.bigIcon}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-base font-semibold text-white">{agent.name}</h3>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.04] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white/55">
              <span className={`h-1.5 w-1.5 rounded-full ${statusDot}`} />
              {agent.active ? '1 active' : '0 active'}
            </span>
          </div>
          <p className="mt-1 line-clamp-2 text-xs text-white/55">{agent.description}</p>
        </div>
      </header>

      {/* Big status icon */}
      <div className="mb-5 grid h-28 place-items-center rounded-2xl border border-white/[0.05] bg-white/[0.02]">
        <div className={hueRing.split(' ').slice(-2).join(' ') + ' grid h-16 w-16 place-items-center rounded-2xl ring-1'}>
          {agent.hue === 'sky' && <Boxes size={28} />}
          {agent.hue === 'violet' && <Briefcase size={28} />}
          {agent.hue === 'emerald' && <Package size={28} />}
          {agent.hue === 'amber' && <Layers size={28} />}
        </div>
      </div>

      {/* Statistics */}
      <div className="mb-3 grid grid-cols-3 gap-2">
        <Stat label="Tasks" value={agent.tasks} icon={<Wrench size={11} />} />
        <Stat label="Files" value={agent.files} icon={<FileText size={11} />} />
        <Stat label="Tools" value={agent.tools} icon={<Shield size={11} />} />
      </div>

      {/* Status bar */}
      <div className="mb-5 h-1.5 w-full overflow-hidden rounded-full bg-white/[0.05]">
        <div className="flex h-full">
          <span
            className={`${agent.hue === 'sky' ? 'bg-sky-400' : agent.hue === 'violet' ? 'bg-violet-400' : agent.hue === 'emerald' ? 'bg-emerald-400' : 'bg-amber-400'} h-full`}
            style={{ width: `${tP}%` }}
          />
          <span className="bg-white/20 h-full" style={{ width: `${fP}%` }} />
          <span className="bg-white/10 h-full" style={{ width: `${tlP}%` }} />
        </div>
      </div>

      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-white/50">
          {agent.active ? 'Connected · letzte Aktivität vor 2 Min' : 'Disconnected'}
        </span>
        <button
          onClick={onToggle}
          className={`inline-flex h-9 items-center gap-2 rounded-xl px-4 text-xs font-semibold transition-all ${
            agent.active
              ? 'bg-white/[0.06] text-white hover:bg-white/[0.1]'
              : 'bg-gradient-to-r from-sky-400 to-cyan-300 text-slate-950 hover:from-sky-300 hover:to-cyan-200'
          }`}
        >
          {agent.active ? 'Disconnect' : 'Connect Agent'}
        </button>
      </div>
    </article>
  )
}

function Stat({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-white/[0.05] bg-white/[0.02] py-2.5 text-center">
      <p className="text-[10px] uppercase tracking-wider text-white/45">{label}</p>
      <p className="mt-0.5 text-base font-semibold text-white">{value}</p>
    </div>
  )
}