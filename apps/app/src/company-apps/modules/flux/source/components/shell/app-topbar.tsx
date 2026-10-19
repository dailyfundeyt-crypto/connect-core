import { useState, useRef, useEffect } from 'react'
import { Bell, HelpCircle, LogOut, Menu as MenuIcon, Moon, Plus, Search, Settings as SettingsIcon, Sun, User as UserIcon, Wallet } from 'lucide-react'
import { useAuth } from '@flux/lib/supabase/auth'

type Props = {
  searchPlaceholder?: string
  onOpenSettings?: () => void
}

export function AppTopbar({ searchPlaceholder = 'Suche nach Produkten, Quellen oder Aktionen', onOpenSettings }: Props) {
  const auth = useAuth()
  const user = auth.status?.kind === 'signed_in' ? auth.status.user : null
  const profile = auth.status?.kind === 'signed_in' ? auth.status.profile : null
  const meta = (user?.user_metadata ?? {}) as {
    full_name?: string
    name?: string
    avatar_url?: string
  }
  const displayName = profile?.display_name ?? meta.full_name ?? meta.name ?? 'Felix'
  const avatarUrl = profile?.avatar_url ?? meta.avatar_url ?? null
  const initial = displayName.charAt(0).toUpperCase()

  const [notifOpen, setNotifOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [theme, setTheme] = useState<'light' | 'dark'>(
    typeof document !== 'undefined' && document.documentElement.classList.contains('dark') ? 'dark' : 'light',
  )
  const notifRef = useRef<HTMLDivElement | null>(null)
  const helpRef = useRef<HTMLDivElement | null>(null)
  const profileRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setNotifOpen(false)
      if (helpRef.current && !helpRef.current.contains(e.target as Node)) setHelpOpen(false)
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) setProfileOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    document.documentElement.classList.toggle('dark', next === 'dark')
  }

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-white/5 bg-[#0a0c12]/80 px-5 backdrop-blur-xl">
      {/* Mobile: Hamburger-Toggle für die Sidebar (auf md+ ausgeblendet) */}
      <button
        onClick={() => {
          const ev = new CustomEvent('flux:toggle-sidebar')
          window.dispatchEvent(ev)
        }}
        className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/[0.06] bg-white/[0.03] text-white/70 transition-all hover:border-white/15 hover:bg-white/[0.07] hover:text-white md:hidden"
        aria-label="Sidebar öffnen"
      >
        <MenuIcon size={18} />
      </button>

      {/* Search */}
      <div className="relative flex-1 max-w-[640px]">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />
        <input
          type="search"
          placeholder={searchPlaceholder}
          className="h-10 w-full rounded-xl border border-white/[0.06] bg-white/[0.03] pl-10 pr-4 text-sm text-white placeholder:text-white/30 outline-none transition-all focus:border-sky-400/40 focus:bg-white/[0.05] focus:shadow-[0_0_0_4px_rgba(56,189,248,0.12)]"
        />
        <kbd className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 rounded-md border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10px] font-mono text-white/40 sm:block">
          ⌘K
        </kbd>
      </div>

      {/* Right cluster */}
      <div className="ml-auto flex items-center gap-2">
        <button
          className="grid h-10 w-10 place-items-center rounded-xl border border-white/[0.06] bg-white/[0.03] text-white/70 transition-all hover:border-white/15 hover:bg-white/[0.07] hover:text-white"
          aria-label="Erstellen"
          title="Neu erstellen"
        >
          <Plus size={17} />
        </button>

        {/* Notifications — only on md+ */}
        <div className="relative hidden md:block" ref={notifRef}>
          <button
            onClick={() => {
              setNotifOpen((v) => !v)
              setHelpOpen(false)
              setProfileOpen(false)
            }}
            className="relative grid h-10 w-10 place-items-center rounded-xl border border-white/[0.06] bg-white/[0.03] text-white/70 transition-all hover:border-white/15 hover:bg-white/[0.07] hover:text-white"
            aria-label="Benachrichtigungen"
            aria-expanded={notifOpen}
          >
            <Bell size={17} />
            <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-rose-400 shadow-[0_0_6px_rgba(244,63,94,0.7)]" />
          </button>
          {notifOpen && (
            <div className="absolute right-0 top-12 z-50 w-[320px] overflow-hidden rounded-2xl border border-white/10 bg-[#0a0c12]/95 shadow-2xl shadow-black/60 backdrop-blur-xl">
              <div className="flex items-center justify-between border-b border-white/5 p-3">
                <p className="text-sm font-semibold text-white">Benachrichtigungen</p>
                <span className="rounded-md bg-rose-400/15 px-1.5 py-0.5 text-[10px] font-semibold text-rose-200 ring-1 ring-rose-400/30">
                  3 neu
                </span>
              </div>
              <div className="max-h-80 overflow-y-auto p-1">
                {[
                  {
                    icon: '🚀',
                    title: 'Neue AI-Listings bereit',
                    body: '5 Produkte wurden automatisch beschrieben.',
                    time: 'vor 2 Min',
                  },
                  {
                    icon: '💸',
                    title: 'Verkauf: Pink Floyd – Dark Side of the Moon',
                    body: '€ 28,00 · eBay',
                    time: 'vor 14 Min',
                  },
                  {
                    icon: '⚠️',
                    title: 'Sheets Sync fehlgeschlagen',
                    body: 'Bitte Anmeldedaten prüfen.',
                    time: 'vor 1 Std',
                  },
                ].map((n) => (
                  <button
                    key={n.title}
                    className="flex w-full items-start gap-3 rounded-xl p-2.5 text-left transition-colors hover:bg-white/5"
                  >
                    <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white/5 text-base">
                      {n.icon}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-white">{n.title}</p>
                      <p className="truncate text-xs text-white/55">{n.body}</p>
                      <p className="mt-0.5 text-[10px] text-white/35">{n.time}</p>
                    </div>
                  </button>
                ))}
              </div>
              <div className="border-t border-white/5 p-1">
                <button className="w-full rounded-lg py-2 text-xs font-medium text-sky-300 transition-colors hover:bg-white/5">
                  Alle anzeigen
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Help — only on md+ */}
        <div className="relative hidden md:block" ref={helpRef}>
          <button
            onClick={() => {
              setHelpOpen((v) => !v)
              setNotifOpen(false)
              setProfileOpen(false)
            }}
            className="grid h-10 w-10 place-items-center rounded-xl border border-white/[0.06] bg-white/[0.03] text-white/70 transition-all hover:border-white/15 hover:bg-white/[0.07] hover:text-white"
            aria-label="Hilfe"
            aria-expanded={helpOpen}
          >
            <HelpCircle size={17} />
          </button>
          {helpOpen && (
            <div className="absolute right-0 top-12 z-50 w-[260px] overflow-hidden rounded-2xl border border-white/10 bg-[#0a0c12]/95 shadow-2xl shadow-black/60 backdrop-blur-xl">
              <div className="p-3">
                <p className="text-sm font-semibold text-white">Hilfe & Docs</p>
                <p className="mt-0.5 text-xs text-white/45">Schnellstart, Shortcuts, Support</p>
              </div>
              <div className="space-y-0.5 p-1">
                {[
                  { label: 'Schnellstart-Guide', sub: 'In 5 Min loslegen' },
                  { label: 'Tastatur-Shortcuts', sub: '⌘K · ⌘N · ⌘/' },
                  { label: 'API & Webhooks', sub: 'Doku' },
                  { label: 'Support kontaktieren', sub: 'Antwort in < 24h' },
                ].map((h) => (
                  <button
                    key={h.label}
                    className="flex w-full flex-col items-start gap-0.5 rounded-lg p-2.5 text-left transition-colors hover:bg-white/5"
                  >
                    <span className="text-sm text-white">{h.label}</span>
                    <span className="text-[11px] text-white/45">{h.sub}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="ml-2 hidden h-9 w-px bg-white/5 md:block" />

        {/* Profile — only on md+ */}
        <div className="relative hidden md:block" ref={profileRef}>
          <button
            onClick={() => {
              setProfileOpen((v) => !v)
              setNotifOpen(false)
              setHelpOpen(false)
            }}
            aria-label="Profil"
            aria-expanded={profileOpen}
            className="grid h-10 w-10 place-items-center overflow-hidden rounded-xl border border-white/10 bg-gradient-to-br from-sky-400/30 to-violet-500/30 text-sm font-semibold text-white shadow-[0_0_0_2px_rgba(56,189,248,0.2)] transition-transform hover:scale-[1.04]"
          >
            {avatarUrl ? (
              <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              initial
            )}
          </button>
          {profileOpen && (
            <div className="absolute right-0 top-12 z-50 w-[260px] overflow-hidden rounded-2xl border border-white/10 bg-[#0a0c12]/95 shadow-2xl shadow-black/60 backdrop-blur-xl">
              <div className="flex items-center gap-3 border-b border-white/5 p-3">
                {avatarUrl ? (
                  <img src={avatarUrl} alt="" className="h-9 w-9 rounded-full object-cover" />
                ) : (
                  <div className="grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-sky-400 to-violet-500 text-sm font-semibold text-white">
                    {initial}
                  </div>
                )}
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-white">{displayName}</p>
                  <p className="truncate text-[11px] text-white/45">{user?.email ?? 'demo@flux.app'}</p>
                </div>
              </div>
              <div className="p-1">
                <button
                  onClick={() => {
                    setProfileOpen(false)
                    onOpenSettings?.()
                  }}
                  className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-white/80 hover:bg-white/5 hover:text-white"
                >
                  <UserIcon size={14} className="text-white/55" />
                  Profil
                </button>
                <button
                  onClick={() => {
                    setProfileOpen(false)
                    onOpenSettings?.()
                  }}
                  className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-white/80 hover:bg-white/5 hover:text-white"
                >
                  <SettingsIcon size={14} className="text-white/55" />
                  Settings
                </button>
                <button className="flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-sm text-white/80 hover:bg-white/5 hover:text-white">
                  <span className="flex items-center gap-2.5">
                    <Wallet size={14} className="text-white/55" />
                    Usage
                  </span>
                  <span className="rounded-md bg-emerald-400/15 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-300 ring-1 ring-emerald-400/30">
                    Pro
                  </span>
                </button>
                <button
                  onClick={toggleTheme}
                  className="flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-sm text-white/80 hover:bg-white/5 hover:text-white"
                >
                  <span className="flex items-center gap-2.5">
                    {theme === 'dark' ? <Moon size={14} className="text-white/55" /> : <Sun size={14} className="text-white/55" />}
                    {theme === 'dark' ? 'Dark mode' : 'Light mode'}
                  </span>
                  <span
                    className={`flex h-4 w-7 items-center rounded-full p-0.5 transition-colors ${
                      theme === 'dark' ? 'bg-sky-400/60' : 'bg-white/15'
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
              <div className="border-t border-white/5 p-1">
                <button
                  onClick={() => {
                    setProfileOpen(false)
                    if (auth.status.kind === 'signed_in') {
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
                  className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-rose-300/85 hover:bg-rose-500/10 hover:text-rose-200"
                >
                  <LogOut size={14} />
                  Log out
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
