import { useState, useRef, useEffect } from 'react'
import { Link, useLocation } from '@tanstack/react-router'
import {
  AlertTriangle,
  Bell,
  Box,
  ChartColumn,
  ChevronsLeft,
  Database,
  FileSpreadsheet,
  FileText,
  Folder,
  Globe,
  LayoutDashboard,
  LogOut,
  Moon,
  PlugZap,
  Search,
  Settings,
  ShoppingCart,
  Sun,
  TrendingUp,
  User as UserIcon,
  Users,
  Wallet,
  ChevronUp,
} from 'lucide-react'
import { useAuth } from '@flux/lib/supabase/auth'

const sections = [
  { id: 'agents', label: 'Agents', icon: Users, to: '/app/agents' as const },
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, to: '/app/dashboard' as const },
  { id: 'multiposter', label: 'Multiposter', icon: PlugZap, to: '/app/multiposter' as const },
  { id: 'inventory', label: 'Lager', icon: Folder, to: '/app/multiposter' as const },
  { id: 'listings', label: 'Listings', icon: ShoppingCart, to: '/app/multiposter' as const },
  { id: 'search', label: 'AI Search', icon: Search, to: '/app/search' as const, badge: 'NEW' },
  { id: 'analytics', label: 'Analytics', icon: ChartColumn, to: '/app/analytics' as const },
  { id: 'alerts', label: 'Smart Alerts', icon: AlertTriangle, to: '/app/alerts' as const, badge: '3' },
  { id: 'reports', label: 'Reports', icon: FileText, to: '/app/reports' as const },
]

const sources = [
  { id: 'sheets', label: 'Google Sheets', icon: FileSpreadsheet },
  { id: 'csv', label: 'CSV', icon: Database },
  { id: 'shopify', label: 'Shopify', icon: Globe },
  { id: 'ebay', label: 'eBay', icon: ShoppingCart },
  { id: 'kleinanzeigen', label: 'Kleinanzeigen', icon: Box },
]

// Simulierte Live-Status & Counts pro Quelle (kommt später aus Backend/Supabase)
const SOURCE_COUNTS: Record<string, number> = {
  sheets: 12,
  csv: 4,
  shopify: 28,
  ebay: 156,
  kleinanzeigen: 38,
}

const SOURCE_STATUS: Record<string, 'connected' | 'syncing' | 'disconnected'> = {
  sheets: 'connected',
  csv: 'syncing',
  shopify: 'connected',
  ebay: 'connected',
  kleinanzeigen: 'disconnected',
}

function statusColor(s: 'connected' | 'syncing' | 'disconnected') {
  if (s === 'connected') return 'bg-emerald-300'
  if (s === 'syncing') return 'bg-amber-300'
  return 'bg-white/25'
}
function statusLabel(s: 'connected' | 'syncing' | 'disconnected') {
  if (s === 'connected') return 'Verbunden · synchronisiert'
  if (s === 'syncing') return 'Sync läuft …'
  return 'Nicht verbunden'
}

type Props = {
  collapsed: boolean
  onToggle: () => void
  activeProduct?: string | null
  onOpenSettings?: () => void
}

export function AppSidebar({ collapsed, onToggle, activeProduct, onOpenSettings }: Props) {
  const auth = useAuth()
  const location = useLocation()
  const pathname = location.pathname
  const [menuOpen, setMenuOpen] = useState(false)
  const [theme, setTheme] = useState<'light' | 'dark'>(
    typeof document !== 'undefined' && document.documentElement.classList.contains('dark') ? 'dark' : 'light',
  )
  const menuRef = useRef<HTMLDivElement | null>(null)

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [menuOpen])

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    if (typeof document !== 'undefined') {
      document.documentElement.classList.toggle('dark', next === 'dark')
    }
  }

  const signedIn = auth.status?.kind === 'signed_in'
  const user = signedIn ? auth.status.user : null
  const profile = signedIn ? auth.status.profile : null
  const meta = (user?.user_metadata ?? {}) as {
    full_name?: string
    name?: string
    avatar_url?: string
  }
  const displayName = profile?.display_name ?? meta.full_name ?? meta.name ?? 'Felix'
  const avatarUrl = profile?.avatar_url ?? meta.avatar_url ?? null
  const initial = displayName.charAt(0).toUpperCase()
  const email = user?.email ?? 'demo@flux.app'

  // Eingeklappt: MacOS-Dock-Stil – nur Icon, beim Hover größer
  // Ausgeklappt: volle Liste mit Icon + Label

  return (
    <aside
      className={`relative hidden h-screen shrink-0 flex-col border-r border-cyan-500/10 bg-[#03060d] transition-all duration-300 md:flex ${
        collapsed ? 'w-[76px]' : 'w-[260px]'
      }`}
    >
      {/* Brand */}
      <div
        className={`flex h-16 items-center gap-3 border-b border-cyan-500/10 ${
          collapsed ? 'justify-center px-0' : 'px-4'
        }`}
      >
        <Link to="/" className="flex items-center gap-3">
          <img
            src="/flux-logo.png"
            alt="Flux"
            width={36}
            height={36}
            className="rounded-xl"
            style={{ filter: 'drop-shadow(0 0 12px rgba(34,211,238,0.5))' }}
          />
          {!collapsed && (
            <div className="flex flex-col leading-tight">
              <span className="bg-gradient-to-r from-cyan-200 to-sky-400 bg-clip-text text-base font-bold tracking-tight text-transparent">
                Flux
              </span>
              <span className="text-[10px] font-medium uppercase tracking-widest text-cyan-300/50">
                Multiposter
              </span>
            </div>
          )}
        </Link>
        {!collapsed && (
          <button
            onClick={onToggle}
            className="ml-auto rounded-md p-1.5 text-white/40 transition-colors hover:bg-cyan-500/10 hover:text-cyan-200"
            aria-label="Sidebar einklappen"
          >
            <ChevronsLeft className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Expand-Button (nur sichtbar wenn collapsed) */}
      {collapsed && (
        <button
          onClick={onToggle}
          className="mx-auto mt-2 grid h-8 w-8 place-items-center rounded-lg text-white/40 transition-all hover:bg-cyan-500/10 hover:text-cyan-200"
          aria-label="Sidebar ausklappen"
          title="Sidebar ausklappen"
        >
          <ChevronsLeft className="h-4 w-4 rotate-180" />
        </button>
      )}

      {/* Workspace sections */}
      <nav className="flex-1 overflow-y-auto px-2 py-3">
        {!collapsed && (
          <p className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-widest text-cyan-300/40">
            Workspace
          </p>
        )}
        <div className={`space-y-0.5 ${collapsed ? 'flex flex-col items-center' : ''}`}>
          {sections.map((s) => {
            const active = pathname === s.to
            const Icon = s.icon
            return (
              <Link
                key={s.id}
                to={s.to}
                title={s.label}
                className={`group relative flex h-11 items-center rounded-xl text-sm transition-all ${
                  collapsed ? 'w-12 justify-center' : 'w-full gap-3 px-3'
                } ${
                  active
                    ? 'bg-gradient-to-r from-cyan-500/20 to-sky-500/10 text-cyan-100 ring-1 ring-cyan-400/30'
                    : 'text-white/70 hover:bg-white/[0.04] hover:text-white'
                }`}
              >
                {active && (
                  <span className="absolute left-0 h-5 w-[3px] rounded-r-full bg-cyan-300 shadow-[0_0_8px_rgba(34,211,238,0.8)]" />
                )}
                <Icon
                  size={20}
                  className={`shrink-0 transition-transform group-hover:scale-110 ${
                    active ? 'text-cyan-300' : 'text-white/55 group-hover:text-white/85'
                  }`}
                />
                {!collapsed && <span className="truncate flex-1">{s.label}</span>}
                {!collapsed && (s as { badge?: string }).badge && (
                  <span
                    className={`rounded-md px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${
                      (s as { badge?: string }).badge === 'NEW'
                        ? 'bg-emerald-400/15 text-emerald-300 ring-1 ring-emerald-400/30'
                        : 'bg-rose-400/15 text-rose-300 ring-1 ring-rose-400/30'
                    }`}
                  >
                    {(s as { badge?: string }).badge}
                  </span>
                )}
              </Link>
            )
          })}
        </div>

        {/* Quellen */}
        {!collapsed && (
          <p className="mt-6 px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-widest text-cyan-300/40">
            Quellen
          </p>
        )}
        <div className={`mt-2 space-y-0.5 ${collapsed ? 'flex flex-col items-center' : ''}`}>
          {sources.map((s) => {
            const Icon = s.icon
            const isActive = activeProduct === s.id
            const count = SOURCE_COUNTS[s.id]
            const status = SOURCE_STATUS[s.id]
            const ring = statusColor(status)
            return (
              <Link
                key={s.id}
                to="/app/multiposter/$source"
                params={{ source: s.id }}
                title={statusLabel(status)}
                className={`group relative flex h-11 items-center rounded-xl text-sm transition-all ${
                  collapsed ? 'w-12 justify-center' : 'w-full gap-3 px-3'
                } ${
                  isActive
                    ? 'bg-gradient-to-r from-violet-500/20 to-cyan-500/10 text-violet-100 ring-1 ring-violet-400/30'
                    : 'text-white/60 hover:bg-white/[0.04] hover:text-white/90'
                }`}
              >
                {isActive && (
                  <span className="absolute left-0 h-5 w-[3px] rounded-r-full bg-violet-300 shadow-[0_0_8px_rgba(196,181,253,0.7)]" />
                )}
                {collapsed ? (
                  <div className="relative">
                    <Icon
                      size={20}
                      className={`shrink-0 transition-transform group-hover:scale-110 ${
                        isActive ? 'text-violet-300' : 'text-white/55 group-hover:text-white/85'
                      }`}
                    />
                    <span
                      className={`absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full ring-2 ring-[#03060d] ${ring}`}
                    />
                  </div>
                ) : (
                  <>
                    <span className="relative">
                      <Icon
                        size={20}
                        className={`shrink-0 transition-transform group-hover:scale-110 ${
                          isActive ? 'text-violet-300' : 'text-white/55 group-hover:text-white/85'
                        }`}
                      />
                      <span
                        className={`absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full ring-2 ring-[#03060d] ${ring} ${
                          status === 'connected' ? 'shadow-[0_0_6px_rgba(110,231,183,0.7)]' : ''
                        }`}
                      />
                    </span>
                    <span className="truncate flex-1">{s.label}</span>
                    <span
                      className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold ${
                        isActive ? 'bg-cyan-400/25 text-cyan-100' : 'bg-white/5 text-white/55'
                      }`}
                    >
                      {count}
                    </span>
                  </>
                )}
              </Link>
            )
          })}
        </div>
      </nav>

      {/* Profile button + dropdown */}
      <div className="relative border-t border-cyan-500/10 p-2" ref={menuRef}>
        {menuOpen && !collapsed && (
          <div className="absolute bottom-[calc(100%-4px)] left-2 right-2 z-50 mb-2 overflow-hidden rounded-2xl border border-cyan-500/20 bg-[#03060d]/95 shadow-2xl shadow-black/60 backdrop-blur-xl">
            {/* User info header */}
            <div className="flex items-center gap-3 border-b border-cyan-500/10 p-3">
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt=""
                  className="h-10 w-10 shrink-0 rounded-full object-cover ring-2 ring-cyan-400/40"
                />
              ) : (
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-gradient-to-br from-cyan-400 to-sky-500 text-sm font-semibold text-[#03060d] ring-2 ring-cyan-400/40">
                  {initial}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-white">{displayName}</p>
                <p className="truncate text-[11px] text-white/45">{email}</p>
              </div>
            </div>

            {/* Menu items */}
            <div className="p-1">
              <button
                onClick={() => {
                  setMenuOpen(false)
                  onOpenSettings?.()
                }}
                className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-white/85 transition-colors hover:bg-cyan-500/10 hover:text-white"
              >
                <UserIcon size={16} className="text-cyan-300/70" />
                Profil
              </button>
              <button
                onClick={() => {
                  setMenuOpen(false)
                  onOpenSettings?.()
                }}
                className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-white/85 transition-colors hover:bg-cyan-500/10 hover:text-white"
              >
                <Settings size={16} className="text-cyan-300/70" />
                Settings
              </button>
              <button
                onClick={() => {
                  setMenuOpen(false)
                  // TODO: navigate to usage/billing page when available
                }}
                className="flex w-full items-center justify-between gap-2.5 rounded-lg px-2.5 py-2 text-sm text-white/85 transition-colors hover:bg-cyan-500/10 hover:text-white"
              >
                <span className="flex items-center gap-2.5">
                  <Wallet size={16} className="text-cyan-300/70" />
                  Usage
                </span>
                <span className="rounded-md bg-emerald-400/15 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-300 ring-1 ring-emerald-400/30">
                  Pro
                </span>
              </button>
              <button
                onClick={() => {
                  toggleTheme()
                }}
                className="flex w-full items-center justify-between gap-2.5 rounded-lg px-2.5 py-2 text-sm text-white/85 transition-colors hover:bg-cyan-500/10 hover:text-white"
              >
                <span className="flex items-center gap-2.5">
                  {theme === 'dark' ? (
                    <Moon size={16} className="text-cyan-300/70" />
                  ) : (
                    <Sun size={16} className="text-amber-300" />
                  )}
                  {theme === 'dark' ? 'Dark mode' : 'Light mode'}
                </span>
                <span
                  className={`flex h-4 w-7 items-center rounded-full p-0.5 transition-colors ${
                    theme === 'dark' ? 'bg-cyan-400/60' : 'bg-white/15'
                  }`}
                >
                  <span
                    className={`h-3 w-3 rounded-full bg-white shadow transition-transform ${
                      theme === 'dark' ? 'translate-x-3' : 'translate-x-0'
                    }`}
                  />
                </span>
              </button>
            </div>

            {/* Footer: Log out */}
            <div className="border-t border-cyan-500/10 p-1">
              <button
                onClick={() => {
                  setMenuOpen(false)
                  if (signedIn) {
                    void auth.signOut()
                  } else {
                    try {
                      localStorage.removeItem('flux_demo')
                    } catch {
                      /* ignore */
                    }
                    window.location.assign('/')
                  }
                }}
                className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-rose-300/90 transition-colors hover:bg-rose-500/10 hover:text-rose-200"
              >
                <LogOut size={16} />
                Log out
              </button>
            </div>
          </div>
        )}

        <button
          onClick={() => setMenuOpen((v) => !v)}
          aria-label="Profil-Menü"
          aria-expanded={menuOpen}
          className={`group flex w-full items-center rounded-xl p-2 text-left transition-all md:hidden ${
            collapsed ? 'justify-center' : 'gap-2.5'
          } ${
            menuOpen
              ? 'bg-gradient-to-r from-cyan-500/15 to-sky-500/10'
              : 'hover:bg-white/[0.04]'
          }`}
        >
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt=""
              className="h-10 w-10 shrink-0 rounded-full object-cover ring-2 ring-cyan-400/30 transition-transform group-hover:scale-105"
            />
          ) : (
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-gradient-to-br from-cyan-400 to-sky-500 text-sm font-semibold text-[#03060d] ring-2 ring-cyan-400/30 transition-transform group-hover:scale-105">
              {initial}
            </div>
          )}
          {!collapsed && (
            <>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-white">{displayName}</p>
                <p className="truncate text-[11px] text-cyan-300/60">{signedIn ? 'Online' : 'Demo'}</p>
              </div>
              <ChevronUp
                size={14}
                className={`text-cyan-300/50 transition-transform ${menuOpen ? '' : 'rotate-180'}`}
              />
            </>
          )}
        </button>
      </div>
    </aside>
  )
}
