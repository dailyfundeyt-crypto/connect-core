import { useState, useRef, useEffect } from 'react'
import {
  Bell,
  HelpCircle,
  LogOut,
  Menu as MenuIcon,
  Moon,
  Settings as SettingsIcon,
  Sun,
  User as UserIcon,
  Wallet,
  X,
} from 'lucide-react'
import { useAuth } from '@flux/lib/supabase/auth'

type Props = {
  onOpenSettings?: () => void
  onToggleSidebar?: () => void
}

export function MobileBottomBar({ onOpenSettings, onToggleSidebar }: Props) {
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
  const email = user?.email ?? 'demo@flux.app'

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

  const openOne = (which: 'notif' | 'help' | 'profile') => {
    setNotifOpen(which === 'notif')
    setHelpOpen(which === 'help')
    setProfileOpen(which === 'profile')
  }

  return (
    <>
      {/* Bottom bar — only on mobile (<md) */}
      <nav
        aria-label="Mobile Navigation"
        className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 border-t border-cyan-500/10 bg-[#03060d]/95 px-2 pb-[env(safe-area-inset-bottom,0)] backdrop-blur-xl md:hidden"
      >
        {/* Menu / Sidebar-Toggle (nur Anzeige, kein Panel — Sidebar bleibt auf Mobile via Hamburger) */}
        <button
          onClick={onToggleSidebar}
          className="flex flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-medium text-white/70 transition-colors hover:text-cyan-200"
          aria-label="Menü"
        >
          <MenuIcon size={20} className="text-white/65" />
          <span>Menü</span>
        </button>

        {/* Benachrichtigungen */}
        <div className="relative" ref={notifRef}>
          <button
            onClick={() => openOne('notif')}
            className={`relative flex w-full flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-medium transition-colors ${
              notifOpen ? 'text-cyan-200' : 'text-white/70 hover:text-cyan-200'
            }`}
            aria-label="Benachrichtigungen"
            aria-expanded={notifOpen}
          >
            <Bell size={20} className={notifOpen ? 'text-cyan-300' : 'text-white/65'} />
            <span>Alerts</span>
            <span className="absolute right-1/2 top-1.5 mr-[-26px] h-1.5 w-1.5 rounded-full bg-rose-400 shadow-[0_0_6px_rgba(244,63,94,0.7)]" />
          </button>
        </div>

        {/* Hilfe */}
        <div className="relative" ref={helpRef}>
          <button
            onClick={() => openOne('help')}
            className={`flex w-full flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-medium transition-colors ${
              helpOpen ? 'text-cyan-200' : 'text-white/70 hover:text-cyan-200'
            }`}
            aria-label="Hilfe"
            aria-expanded={helpOpen}
          >
            <HelpCircle size={20} className={helpOpen ? 'text-cyan-300' : 'text-white/65'} />
            <span>Hilfe</span>
          </button>
        </div>

        {/* Profil / Einstellungen */}
        <div className="relative" ref={profileRef}>
          <button
            onClick={() => openOne('profile')}
            className={`flex w-full flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-medium transition-colors ${
              profileOpen ? 'text-cyan-200' : 'text-white/70 hover:text-cyan-200'
            }`}
            aria-label="Profil"
            aria-expanded={profileOpen}
          >
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt=""
                className={`h-6 w-6 rounded-full object-cover ring-2 ${
                  profileOpen ? 'ring-cyan-300' : 'ring-cyan-400/30'
                }`}
              />
            ) : (
              <div
                className={`grid h-6 w-6 place-items-center rounded-full bg-gradient-to-br from-cyan-400 to-sky-500 text-[10px] font-semibold text-[#03060d] ring-2 ${
                  profileOpen ? 'ring-cyan-300' : 'ring-cyan-400/30'
                }`}
              >
                {initial}
              </div>
            )}
            <span>Profil</span>
          </button>
        </div>
      </nav>

      {/* Popovers — anchored above the bottom bar */}
      {notifOpen && (
        <div
          ref={notifRef}
          className="fixed inset-x-3 bottom-[68px] z-50 overflow-hidden rounded-2xl border border-cyan-500/20 bg-[#03060d]/95 shadow-2xl shadow-black/60 backdrop-blur-xl md:hidden"
        >
          <div className="flex items-center justify-between border-b border-cyan-500/10 p-3">
            <p className="text-sm font-semibold text-white">Benachrichtigungen</p>
            <div className="flex items-center gap-2">
              <span className="rounded-md bg-rose-400/15 px-1.5 py-0.5 text-[10px] font-semibold text-rose-200 ring-1 ring-rose-400/30">
                3 neu
              </span>
              <button
                onClick={() => setNotifOpen(false)}
                className="grid h-6 w-6 place-items-center rounded-md text-white/50 hover:bg-white/5 hover:text-white"
                aria-label="Schließen"
              >
                <X size={14} />
              </button>
            </div>
          </div>
          <div className="max-h-72 overflow-y-auto p-1">
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
          <div className="border-t border-cyan-500/10 p-1">
            <button className="w-full rounded-lg py-2 text-xs font-medium text-sky-300 transition-colors hover:bg-white/5">
              Alle anzeigen
            </button>
          </div>
        </div>
      )}

      {helpOpen && (
        <div
          ref={helpRef}
          className="fixed inset-x-3 bottom-[68px] z-50 overflow-hidden rounded-2xl border border-cyan-500/20 bg-[#03060d]/95 shadow-2xl shadow-black/60 backdrop-blur-xl md:hidden"
        >
          <div className="flex items-center justify-between border-b border-cyan-500/10 p-3">
            <div>
              <p className="text-sm font-semibold text-white">Hilfe & Docs</p>
              <p className="text-xs text-white/45">Schnellstart, Shortcuts, Support</p>
            </div>
            <button
              onClick={() => setHelpOpen(false)}
              className="grid h-6 w-6 place-items-center rounded-md text-white/50 hover:bg-white/5 hover:text-white"
              aria-label="Schließen"
            >
              <X size={14} />
            </button>
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

      {profileOpen && (
        <div
          ref={profileRef}
          className="fixed inset-x-3 bottom-[68px] z-50 overflow-hidden rounded-2xl border border-cyan-500/20 bg-[#03060d]/95 shadow-2xl shadow-black/60 backdrop-blur-xl md:hidden"
        >
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
            <button
              onClick={() => setProfileOpen(false)}
              className="grid h-7 w-7 place-items-center rounded-md text-white/50 hover:bg-white/5 hover:text-white"
              aria-label="Schließen"
            >
              <X size={14} />
            </button>
          </div>

          <div className="p-1">
            <button
              onClick={() => {
                setProfileOpen(false)
                onOpenSettings?.()
              }}
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2.5 text-sm text-white/85 transition-colors hover:bg-cyan-500/10 hover:text-white"
            >
              <UserIcon size={16} className="text-cyan-300/70" />
              Profil
            </button>
            <button
              onClick={() => {
                setProfileOpen(false)
                onOpenSettings?.()
              }}
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2.5 text-sm text-white/85 transition-colors hover:bg-cyan-500/10 hover:text-white"
            >
              <SettingsIcon size={16} className="text-cyan-300/70" />
              Einstellungen
            </button>
            <button className="flex w-full items-center justify-between gap-2.5 rounded-lg px-2.5 py-2.5 text-sm text-white/85 transition-colors hover:bg-cyan-500/10 hover:text-white">
              <span className="flex items-center gap-2.5">
                <Wallet size={16} className="text-cyan-300/70" />
                Usage
              </span>
              <span className="rounded-md bg-emerald-400/15 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-300 ring-1 ring-emerald-400/30">
                Pro
              </span>
            </button>
            <button
              onClick={toggleTheme}
              className="flex w-full items-center justify-between gap-2.5 rounded-lg px-2.5 py-2.5 text-sm text-white/85 transition-colors hover:bg-cyan-500/10 hover:text-white"
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

          <div className="border-t border-cyan-500/10 p-1">
            <button
              onClick={() => {
                setProfileOpen(false)
                if (auth.status?.kind === 'signed_in') {
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
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2.5 text-sm text-rose-300/90 transition-colors hover:bg-rose-500/10 hover:text-rose-200"
            >
              <LogOut size={16} />
              Log out
            </button>
          </div>
        </div>
      )}
    </>
  )
}
