import { useEffect, useRef, useState, type ChangeEvent, type ReactNode } from "react"
import {
  ArrowLeft,
  Camera,
  Check,
  Database,
  Eye,
  EyeOff,
  Globe,
  ImageUp,
  Link2,
  LogOut,
  Moon,
  Plus,
  Settings as SettingsIcon,
  SheetIcon,
  ShoppingCart,
  Sun,
  Trash2,
  User as UserIcon,
  X,
} from "lucide-react"
import { useAuth } from "@flux/lib/supabase/auth"

type View = "menu" | "account" | "appearance" | "connections" | "stores" | "about"
type Theme = "light" | "dark"

const PROFILE_KEY = "flux_profile_v1"
const STORES_KEY = "flux_stores_v1"
const CONNS_KEY = "flux_connections_v1"
const MAX_FILE_BYTES = 5 * 1024 * 1024

type ConnectionState = {
  ebayAppId: string
  ebayCertId: string
  ebayOAuthToken: string
  shopifyUrl: string
  shopifyToken: string
  sheetId: string
}

type StoreItem = {
  id: string
  name: string
  platform: "ebay" | "kleinanzeigen" | "shopify" | "sheets"
  description: string
  logoDataUrl: string | null
  connected: boolean
}

const SEED_STORES: StoreItem[] = [
  {
    id: "s1",
    name: "Mein eBay-Shop",
    platform: "ebay",
    description: "Hauptkanal — Auto-Poster aktiv",
    logoDataUrl: null,
    connected: true,
  },
  {
    id: "s2",
    name: "Kleinanzeigen Berlin",
    platform: "kleinanzeigen",
    description: "Lokales Posten in Berlin & Brandenburg",
    logoDataUrl: null,
    connected: true,
  },
  {
    id: "s3",
    name: "Shopify Demo",
    platform: "shopify",
    description: "Synchronisiert Varianten & Bestand",
    logoDataUrl: null,
    connected: false,
  },
]

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function writeJson(key: string, value: unknown) {
  if (typeof window === "undefined") return
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // ignore
  }
}

type Props = {
  open: boolean
  onClose: () => void
}

export function SettingsDrawer({ open, onClose }: Props) {
  const auth = useAuth()
  const [view, setView] = useState<View>("menu")
  const [theme, setTheme] = useState<Theme>(
    typeof document !== "undefined" && document.documentElement.classList.contains("dark") ? "dark" : "light",
  )
  const [showKey, setShowKey] = useState(false)
  const [conns, setConns] = useState<ConnectionState>(() =>
    readJson<ConnectionState>(CONNS_KEY, {
      ebayAppId: "",
      ebayCertId: "",
      ebayOAuthToken: "",
      shopifyUrl: "",
      shopifyToken: "",
      sheetId: "",
    }),
  )
  const [stores, setStores] = useState<StoreItem[]>(() => readJson<StoreItem[]>(STORES_KEY, SEED_STORES))
  const [openStoreId, setOpenStoreId] = useState<string | null>(null)

  // Persist connections & stores
  useEffect(() => {
    writeJson(CONNS_KEY, conns)
  }, [conns])
  useEffect(() => {
    writeJson(STORES_KEY, stores)
  }, [stores])

  useEffect(() => {
    if (!open) setView("menu")
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, onClose])

  const applyTheme = (next: Theme) => {
    setTheme(next)
    if (typeof document !== "undefined") {
      document.documentElement.classList.toggle("dark", next === "dark")
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} aria-label="Schließen" />
      <div className="relative flex h-full w-full max-w-[420px] flex-col border-l border-white/10 bg-[#0a0c12] shadow-2xl shadow-black/60">
        <Header
          title={view === "menu" ? "Einstellungen" : titleFor(view)}
          showBack={view !== "menu"}
          onBack={() => setView("menu")}
          onClose={onClose}
        />

        <div className="flex-1 overflow-y-auto">
          {view === "menu" && (
            <SettingsMenu
              auth={auth}
              theme={theme}
              storeCount={stores.length}
              connectedStores={stores.filter((s) => s.connected).length}
              onNavigate={setView}
            />
          )}
          {view === "account" && <AccountView auth={auth} />}
          {view === "appearance" && <AppearanceView theme={theme} onThemeChange={applyTheme} />}
          {view === "connections" && (
            <ConnectionsView
              conns={conns}
              onConnsChange={setConns}
              showKey={showKey}
              onToggleKey={() => setShowKey((v) => !v)}
            />
          )}
          {view === "stores" && (
            <StoresView
              stores={stores}
              onStoresChange={setStores}
              openStoreId={openStoreId}
              setOpenStoreId={setOpenStoreId}
            />
          )}
          {view === "about" && <AboutView />}
        </div>
      </div>
    </div>
  )
}

function titleFor(v: Exclude<View, "menu">) {
  return v === "account"
    ? "Konto"
    : v === "appearance"
    ? "Theme"
    : v === "connections"
    ? "Verbindungen"
    : v === "stores"
    ? "Stores"
    : "Über Flux"
}

function Header({
  title,
  showBack,
  onBack,
  onClose,
}: {
  title: string
  showBack: boolean
  onBack: () => void
  onClose: () => void
}) {
  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-white/5 px-4">
      <div className="flex items-center gap-2">
        {showBack ? (
          <button
            onClick={onBack}
            className="grid h-8 w-8 place-items-center rounded-md text-white/60 hover:bg-white/5 hover:text-white"
            aria-label="Zurück"
          >
            <ArrowLeft size={16} />
          </button>
        ) : (
          <div className="grid h-8 w-8 place-items-center rounded-md bg-gradient-to-br from-sky-400/30 to-violet-500/30 text-sky-200">
            <SettingsIcon size={14} />
          </div>
        )}
      </div>
      <h2 className="text-sm font-semibold text-white">{title}</h2>
      <button
        onClick={onClose}
        className="grid h-8 w-8 place-items-center rounded-md text-white/60 hover:bg-white/5 hover:text-white"
        aria-label="Schließen"
      >
        <X size={16} />
      </button>
    </header>
  )
}

// ---------- Menu ----------

function SettingsMenu({
  auth,
  theme,
  storeCount,
  connectedStores,
  onNavigate,
}: {
  auth: ReturnType<typeof useAuth>
  theme: Theme
  storeCount: number
  connectedStores: number
  onNavigate: (v: Exclude<View, "menu">) => void
}) {
  const user = auth.status?.kind === "signed_in" ? auth.status.user : null
  const profile = auth.status?.kind === "signed_in" ? auth.status.profile : null
  const meta = (user?.user_metadata ?? {}) as {
    full_name?: string
    name?: string
    avatar_url?: string
  }
  const displayName = profile?.display_name ?? meta.full_name ?? meta.name ?? "Felix"
  const avatarUrl = profile?.avatar_url ?? meta.avatar_url ?? null
  const initial = displayName.charAt(0).toUpperCase()
  const email = user?.email ?? "demo@flux.app"

  return (
    <div className="flex-1 overflow-y-auto p-2">
      <div className="mb-2 flex items-center gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-3">
        {avatarUrl ? (
          <img src={avatarUrl} alt="" className="h-10 w-10 rounded-full object-cover" />
        ) : (
          <div className="grid h-10 w-10 place-items-center rounded-full bg-gradient-to-br from-sky-400 to-violet-500 text-sm font-semibold text-white">
            {initial}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-white">{displayName}</p>
          <p className="truncate text-[11px] text-white/45">{email}</p>
        </div>
      </div>

      <SectionLabel>Allgemein</SectionLabel>
      <Row icon={UserIcon} title="Konto" subtitle="Profil, Anmeldedaten" onClick={() => onNavigate("account")} />
      <Row
        icon={theme === "dark" ? Moon : Sun}
        title="Theme"
        subtitle={theme === "dark" ? "Dark mode" : "Light mode"}
        onClick={() => onNavigate("appearance")}
      />

      <SectionLabel>Integrationen</SectionLabel>
      <Row icon={Link2} title="Verbindungen" subtitle="eBay, Shopify, Sheets" onClick={() => onNavigate("connections")} />
      <Row
        icon={ShoppingCart}
        title="Stores"
        subtitle={`${connectedStores} von ${storeCount} verbunden`}
        onClick={() => onNavigate("stores")}
      />

      <SectionLabel>System</SectionLabel>
      <Row icon={SettingsIcon} title="Über Flux" subtitle="Version 0.9.0 (Beta)" onClick={() => onNavigate("about")} />

      <SectionLabel>Sitzung</SectionLabel>
      <button
        onClick={() => {
          if (auth.status.kind === "signed_in") {
            void auth.signOut()
          } else {
            try {
              localStorage.removeItem("flux_demo")
            } catch {
              /* ignore */
            }
            window.location.assign("/")
          }
        }}
        className="flex w-full items-center gap-3 rounded-xl border border-rose-500/20 bg-rose-500/5 p-3 text-left transition-colors hover:bg-rose-500/10"
      >
        <LogOut size={16} className="text-rose-300" />
        <div className="flex-1">
          <p className="text-sm font-medium text-rose-200">Log out</p>
          <p className="text-[11px] text-rose-300/60">Sitzung beenden</p>
        </div>
      </button>
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-3 px-2 pb-1.5 pt-2 text-[10px] font-semibold uppercase tracking-widest text-white/30">{children}</p>
  )
}

function Row({
  icon: Icon,
  title,
  subtitle,
  onClick,
}: {
  icon: typeof UserIcon
  title: string
  subtitle?: string
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 text-left transition-colors hover:bg-white/[0.05]"
    >
      <div className="grid h-9 w-9 place-items-center rounded-lg bg-white/5 text-sky-200 ring-1 ring-white/10">
        <Icon size={15} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-white">{title}</p>
        {subtitle && <p className="truncate text-[11px] text-white/45">{subtitle}</p>}
      </div>
    </button>
  )
}

// ---------- Account ----------

function AccountView({ auth }: { auth: ReturnType<typeof useAuth> }) {
  const user = auth.status?.kind === "signed_in" ? auth.status.user : null
  const profile = auth.status?.kind === "signed_in" ? auth.status.profile : null
  const meta = (user?.user_metadata ?? {}) as { full_name?: string; name?: string; avatar_url?: string }
  const initialName = profile?.display_name ?? meta.full_name ?? meta.name ?? "Felix"
  const initialAvatar = profile?.avatar_url ?? meta.avatar_url ?? null
  const initialEmail = user?.email ?? "demo@flux.app"

  const [name, setName] = useState(initialName)
  const [email, setEmail] = useState(initialEmail)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(initialAvatar)
  const [pendingAvatar, setPendingAvatar] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setName(initialName)
    setEmail(initialEmail)
    setAvatarUrl(initialAvatar)
  }, [initialName, initialEmail, initialAvatar])

  const handleFile = (file: File) => {
    setError(null)
    if (!file.type.startsWith("image/")) {
      setError("Bitte eine Bild-Datei wählen.")
      return
    }
    if (file.size > MAX_FILE_BYTES) {
      setError(`Datei zu groß (max. ${Math.round(MAX_FILE_BYTES / 1024 / 1024)} MB).`)
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : null
      if (result) setPendingAvatar(result)
    }
    reader.readAsDataURL(file)
  }

  const saveAvatar = async () => {
    if (!pendingAvatar) return
    setUploading(true)
    setError(null)
    try {
      // If we have a real Supabase client, upload via the existing helper.
      if (auth.client && auth.status.kind === "signed_in") {
        const blob = await (await fetch(pendingAvatar)).blob()
        const ext = blob.type.split("/")[1]?.split("+")[0] || "png"
        const { uploadAvatar } = await import("@flux/lib/supabase/snapshot")
        const url = await uploadAvatar(auth.client, auth.status.user.id, blob, ext)
        setAvatarUrl(url)
        try {
          const { updateProfile } = await import("@flux/lib/supabase/snapshot")
          await updateProfile(auth.client, auth.status.user.id, { avatar_url: url })
        } catch {
          // ignore
        }
      } else {
        setAvatarUrl(pendingAvatar)
      }
      setPendingAvatar(null)
      setSaved(true)
      window.setTimeout(() => setSaved(false), 1500)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload fehlgeschlagen")
    } finally {
      setUploading(false)
    }
  }

  const removeAvatar = () => {
    setAvatarUrl(null)
  }

  const saveName = async () => {
    setSaving(true)
    setSaved(false)
    try {
      if (auth.client && auth.status.kind === "signed_in") {
        try {
          const { updateProfile } = await import("@flux/lib/supabase/snapshot")
          await updateProfile(auth.client, auth.status.user.id, { display_name: name.trim() || null })
        } catch {
          // ignore — local state already updated
        }
      }
      setSaved(true)
      window.setTimeout(() => setSaved(false), 1500)
    } finally {
      setSaving(false)
    }
  }

  const displayUrl = pendingAvatar ?? avatarUrl
  const initial = (name || email || "F").charAt(0).toUpperCase()

  return (
    <div className="flex-1 overflow-y-auto p-4">
      <div className="mb-4 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
        <div className="flex flex-col items-center gap-3">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="group relative h-20 w-20 overflow-hidden rounded-full bg-gradient-to-br from-sky-400 to-violet-500 ring-2 ring-white/10 transition-opacity hover:opacity-90"
          >
            {displayUrl ? (
              <img src={displayUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <span className="grid h-full w-full place-items-center text-xl font-semibold text-white">
                {initial}
              </span>
            )}
            <span className="absolute inset-0 grid place-items-center bg-black/40 text-white opacity-0 transition-opacity group-hover:opacity-100">
              <Camera size={16} />
            </span>
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e: ChangeEvent<HTMLInputElement>) => {
              const f = e.target.files?.[0]
              if (f) handleFile(f)
              e.target.value = ""
            }}
          />
          <div className="flex flex-wrap items-center justify-center gap-2">
            {pendingAvatar ? (
              <>
                <button
                  type="button"
                  onClick={() => void saveAvatar()}
                  disabled={uploading}
                  className="rounded-md bg-gradient-to-r from-sky-400 to-cyan-300 px-3 py-1.5 text-[11px] font-semibold text-slate-950 transition-all hover:from-sky-300 hover:to-cyan-200 disabled:opacity-50"
                >
                  {uploading ? "Lädt hoch…" : "Speichern"}
                </button>
                <button
                  type="button"
                  onClick={() => setPendingAvatar(null)}
                  className="rounded-md border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-[11px] text-white/70 hover:bg-white/[0.08]"
                >
                  Abbrechen
                </button>
              </>
            ) : avatarUrl ? (
              <>
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="rounded-md border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-[11px] text-white/80 hover:bg-white/[0.08]"
                >
                  Ändern
                </button>
                <button
                  type="button"
                  onClick={removeAvatar}
                  className="inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-[11px] text-rose-200 hover:bg-rose-500/10"
                >
                  <Trash2 className="h-3 w-3" /> entfernen
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="rounded-md border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-[11px] text-white/80 hover:bg-white/[0.08]"
              >
                Bild hochladen
              </button>
            )}
          </div>
          {error && <p className="text-[11px] text-rose-300">{error}</p>}
        </div>

        <div className="mt-4 space-y-2">
          <p className="text-[10px] uppercase tracking-widest text-white/40">Anzeigename</p>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="h-10 w-full rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 text-sm text-white outline-none focus:border-sky-400/40"
            maxLength={60}
          />
          <p className="mt-3 text-[10px] uppercase tracking-widest text-white/40">E-Mail</p>
          <p className="truncate text-sm text-white/85">{email}</p>
        </div>
        <button
          onClick={() => void saveName()}
          disabled={saving}
          className="mt-4 inline-flex h-9 items-center gap-2 rounded-xl bg-gradient-to-r from-sky-400 to-cyan-300 px-4 text-xs font-semibold text-slate-950 hover:from-sky-300 hover:to-cyan-200 disabled:opacity-50"
        >
          {saved ? <Check size={13} /> : null}
          {saved ? "Gespeichert" : saving ? "Speichern…" : "Speichern"}
        </button>
      </div>
    </div>
  )
}

// ---------- Appearance ----------

function AppearanceView({ theme, onThemeChange }: { theme: Theme; onThemeChange: (t: Theme) => void }) {
  return (
    <div className="flex-1 overflow-y-auto p-4">
      <p className="mb-3 text-xs uppercase tracking-widest text-white/40">Theme wählen</p>
      <div className="grid grid-cols-2 gap-3">
        {(["dark", "light"] as const).map((t) => (
          <button
            key={t}
            onClick={() => onThemeChange(t)}
            className={`flex flex-col items-start gap-2 rounded-2xl border p-4 text-left transition-all ${
              theme === t ? "border-sky-400/40 bg-sky-400/10" : "border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.05]"
            }`}
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/5 ring-1 ring-white/10">
              {t === "dark" ? <Moon size={16} className="text-sky-200" /> : <Sun size={16} className="text-amber-300" />}
            </div>
            <div>
              <p className="text-sm font-semibold text-white">{t === "dark" ? "Dark mode" : "Light mode"}</p>
              <p className="text-[11px] text-white/45">
                {t === "dark" ? "Augenfreundlich abends" : "Besser bei Tageslicht"}
              </p>
            </div>
            {theme === t && <Check size={14} className="text-sky-300" />}
          </button>
        ))}
      </div>
    </div>
  )
}

// ---------- Connections ----------

function ConnectionsView({
  conns,
  onConnsChange,
  showKey,
  onToggleKey,
}: {
  conns: ConnectionState
  onConnsChange: (c: ConnectionState) => void
  showKey: boolean
  onToggleKey: () => void
}) {
  const [testResults, setTestResults] = useState<Record<string, "ok" | "fail" | null>>({})
  const [testing, setTesting] = useState<string | null>(null)

  const update = (patch: Partial<ConnectionState>) => onConnsChange({ ...conns, ...patch })

  const test = async (key: "ebay" | "shopify" | "sheets") => {
    setTesting(key)
    setTestResults((r) => ({ ...r, [key]: null }))
    await new Promise((r) => setTimeout(r, 700))
    if (key === "ebay") {
      setTestResults((r) => ({
        ...r,
        ebay: conns.ebayAppId.trim().length > 0 && conns.ebayCertId.trim().length > 0 ? "ok" : "fail",
      }))
    } else if (key === "shopify") {
      const ok = /^https?:\/\//i.test(conns.shopifyUrl.trim()) && conns.shopifyToken.trim().length > 8
      setTestResults((r) => ({ ...r, shopify: ok ? "ok" : "fail" }))
    } else {
      const ok = /\/d\/([a-zA-Z0-9-_]+)/.test(conns.sheetId) || conns.sheetId.trim().length > 8
      setTestResults((r) => ({ ...r, sheets: ok ? "ok" : "fail" }))
    }
    setTesting(null)
  }

  return (
    <div className="flex-1 space-y-3 overflow-y-auto p-4">
      <ConnectionCard
        icon={ShoppingCart}
        name="eBay"
        status={testResults.ebay === "ok" ? "Verbunden" : testResults.ebay === "fail" ? "Konfiguration fehlt" : "Bereit zum Verbinden"}
        tone={testResults.ebay === "ok" ? "emerald" : "sky"}
        onTest={() => void test("ebay")}
        testing={testing === "ebay"}
        fields={
          <>
            <Field label="App ID" value={conns.ebayAppId} onChange={(v) => update({ ebayAppId: v })} type={showKey ? "text" : "password"} placeholder="FluxProd-PRD-…" />
            <Field label="Cert ID" value={conns.ebayCertId} onChange={(v) => update({ ebayCertId: v })} type={showKey ? "text" : "password"} placeholder="PRD-…-…-…" />
            <Field label="OAuth-Token" value={conns.ebayOAuthToken} onChange={(v) => update({ ebayOAuthToken: v })} type={showKey ? "text" : "password"} placeholder="v^1.1#i^1#…" />
          </>
        }
      />
      <ConnectionCard
        icon={Globe}
        name="Shopify"
        status={testResults.shopify === "ok" ? "Verbunden" : testResults.shopify === "fail" ? "URL/Token fehlt" : "Bereit zum Import"}
        tone={testResults.shopify === "ok" ? "emerald" : "violet"}
        onTest={() => void test("shopify")}
        testing={testing === "shopify"}
        fields={
          <>
            <Field label="Shop-URL" value={conns.shopifyUrl} onChange={(v) => update({ shopifyUrl: v })} placeholder="https://dein-shop.myshopify.com" />
            <Field label="Admin-API-Token" value={conns.shopifyToken} onChange={(v) => update({ shopifyToken: v })} type={showKey ? "text" : "password"} placeholder="shpat_…" />
          </>
        }
      />
      <ConnectionCard
        icon={SheetIcon}
        name="Google Sheets"
        status={testResults.sheets === "ok" ? "Verbunden" : testResults.sheets === "fail" ? "URL prüfen" : "Bereit zum Sync"}
        tone={testResults.sheets === "ok" ? "emerald" : "sky"}
        onTest={() => void test("sheets")}
        testing={testing === "sheets"}
        fields={<Field label="Sheet-ID oder URL" value={conns.sheetId} onChange={(v) => update({ sheetId: v })} placeholder="https://docs.google.com/spreadsheets/d/…" />}
      />

      <div className="mt-2 flex items-center justify-between rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
        <span className="text-xs text-white/70">Schlüssel einblenden</span>
        <button
          onClick={onToggleKey}
          className="grid h-7 w-7 place-items-center rounded-md text-white/60 hover:bg-white/5 hover:text-white"
          aria-label="Schlüssel ein-/ausblenden"
        >
          {showKey ? <Eye size={14} /> : <EyeOff size={14} />}
        </button>
      </div>
    </div>
  )
}

function ConnectionCard({
  icon: Icon,
  name,
  status,
  tone,
  onTest,
  testing,
  fields,
}: {
  icon: typeof ShoppingCart
  name: string
  status: string
  tone: "sky" | "violet" | "emerald"
  onTest: () => void
  testing: boolean
  fields: React.ReactNode
}) {
  const ring =
    tone === "sky"
      ? "ring-sky-400/30 text-sky-200 bg-sky-400/10"
      : tone === "violet"
      ? "ring-violet-400/30 text-violet-200 bg-violet-400/10"
      : "ring-emerald-400/30 text-emerald-200 bg-emerald-400/10"

  return (
    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-3">
      <div className="flex items-center gap-3">
        <div className={`grid h-9 w-9 place-items-center rounded-lg ring-1 ${ring}`}>
          <Icon size={15} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-white">{name}</p>
          <p className="text-[11px] text-white/45">{status}</p>
        </div>
        <button
          onClick={onTest}
          disabled={testing}
          className="rounded-lg border border-white/[0.08] bg-white/[0.04] px-2.5 py-1 text-[11px] font-semibold text-white/80 hover:bg-white/[0.08] disabled:opacity-50"
        >
          {testing ? "Teste…" : "Verbinden"}
        </button>
      </div>
      <div className="mt-3 space-y-2">{fields}</div>
    </div>
  )
}

// ---------- Stores ----------

function StoresView({
  stores,
  onStoresChange,
  openStoreId,
  setOpenStoreId,
}: {
  stores: StoreItem[]
  onStoresChange: (s: StoreItem[]) => void
  openStoreId: string | null
  setOpenStoreId: (id: string | null) => void
}) {
  return (
    <div className="flex-1 space-y-2 overflow-y-auto p-4">
      <p className="text-[11px] text-white/55">Marktplätze mit Logo, Status & Verbindung. Klicke zum Bearbeiten.</p>
      {stores.map((s) => (
        <StoreRow
          key={s.id}
          store={s}
          open={openStoreId === s.id}
          onToggle={() => setOpenStoreId(openStoreId === s.id ? null : s.id)}
          onSave={(next) => onStoresChange(stores.map((x) => (x.id === s.id ? next : x)))}
          onDelete={() => {
            onStoresChange(stores.filter((x) => x.id !== s.id))
            setOpenStoreId(null)
          }}
        />
      ))}
      <button
        onClick={() => {
          const id = `s${Date.now()}`
          onStoresChange([
            ...stores,
            {
              id,
              name: "Neuer Store",
              platform: "ebay",
              description: "Beschreibung hinzufügen",
              logoDataUrl: null,
              connected: false,
            },
          ])
          setOpenStoreId(id)
        }}
        className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-white/15 bg-white/[0.02] py-3 text-xs text-white/65 hover:bg-white/[0.05]"
      >
        <Plus size={13} /> Neuen Store hinzufügen
      </button>
    </div>
  )
}

function StoreRow({
  store,
  open,
  onToggle,
  onSave,
  onDelete,
}: {
  store: StoreItem
  open: boolean
  onToggle: () => void
  onSave: (next: StoreItem) => void
  onDelete: () => void
}) {
  const [name, setName] = useState(store.name)
  const [description, setDescription] = useState(store.description)
  const [platform, setPlatform] = useState<StoreItem["platform"]>(store.platform)
  const [connected, setConnected] = useState(store.connected)
  const [logoDataUrl, setLogoDataUrl] = useState<string | null>(store.logoDataUrl)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setName(store.name)
    setDescription(store.description)
    setPlatform(store.platform)
    setConnected(store.connected)
    setLogoDataUrl(store.logoDataUrl)
  }, [store])

  const handleFile = (file: File) => {
    setError(null)
    if (!file.type.startsWith("image/")) {
      setError("Bitte eine Bild-Datei wählen.")
      return
    }
    if (file.size > MAX_FILE_BYTES) {
      setError("Datei zu groß (max. 5 MB).")
      return
    }
    setUploading(true)
    const reader = new FileReader()
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : null
      if (result) setLogoDataUrl(result)
      setUploading(false)
    }
    reader.onerror = () => {
      setError("Datei konnte nicht gelesen werden.")
      setUploading(false)
    }
    reader.readAsDataURL(file)
  }

  const save = () => {
    onSave({
      ...store,
      name: name.trim() || store.name,
      description: description.trim(),
      platform,
      connected,
      logoDataUrl,
    })
    onToggle()
  }

  return (
    <article className="overflow-hidden rounded-2xl border border-white/[0.06] bg-white/[0.02]">
      <button
        onClick={onToggle}
        className="flex w-full items-center gap-3 p-3 text-left"
      >
        {logoDataUrl ? (
          <img src={logoDataUrl} alt="" className="h-10 w-10 rounded-md object-cover ring-1 ring-white/10" />
        ) : (
          <div className="grid h-10 w-10 place-items-center rounded-md bg-gradient-to-br from-sky-400/30 to-cyan-300/20 text-sky-100 ring-1 ring-sky-400/30">
            <ImageUp size={16} />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-white">{store.name}</p>
          <p className="truncate text-[11px] text-white/45">{store.description}</p>
        </div>
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ${
            store.connected
              ? "bg-emerald-400/15 text-emerald-200 ring-emerald-400/30"
              : "bg-white/[0.05] text-white/55 ring-white/[0.08]"
          }`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${store.connected ? "bg-emerald-300" : "bg-white/35"}`} />
          {store.connected ? "verbunden" : "inaktiv"}
        </span>
      </button>
      {open && (
        <div className="space-y-3 border-t border-white/[0.06] bg-white/[0.01] p-3">
          <div className="flex items-center gap-3">
            {logoDataUrl ? (
              <img src={logoDataUrl} alt="" className="h-14 w-14 rounded-md object-cover ring-1 ring-white/10" />
            ) : (
              <div className="grid h-14 w-14 place-items-center rounded-md bg-gradient-to-br from-sky-400/30 to-cyan-300/20 text-sky-100 ring-1 ring-sky-400/30">
                <ImageUp size={18} />
              </div>
            )}
            <div className="flex-1">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-white/40">Logo</p>
              <label className="mt-1 inline-flex cursor-pointer items-center gap-2 rounded-md border border-dashed border-white/15 bg-white/[0.03] px-3 py-1.5 text-[11px] text-white/75 hover:bg-white/[0.06]">
                <ImageUp className="h-3.5 w-3.5" />
                {uploading ? "Lädt hoch…" : "Bild auswählen"}
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e: ChangeEvent<HTMLInputElement>) => {
                    const f = e.target.files?.[0]
                    if (f) handleFile(f)
                    e.target.value = ""
                  }}
                />
              </label>
              {error && <p className="mt-1 text-[10px] text-rose-300">{error}</p>}
            </div>
          </div>

          <Field label="Name" value={name} onChange={setName} />
          <div>
            <p className="mb-1 text-[10px] uppercase tracking-widest text-white/40">Plattform</p>
            <select
              value={platform}
              onChange={(e) => setPlatform(e.target.value as StoreItem["platform"])}
              className="h-9 w-full appearance-none rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 text-sm text-white outline-none focus:border-sky-400/40"
            >
              <option value="ebay" className="bg-[#0a0c12]">eBay</option>
              <option value="kleinanzeigen" className="bg-[#0a0c12]">Kleinanzeigen</option>
              <option value="shopify" className="bg-[#0a0c12]">Shopify</option>
              <option value="sheets" className="bg-[#0a0c12]">Google Sheets</option>
            </select>
          </div>
          <div>
            <p className="mb-1 text-[10px] uppercase tracking-widest text-white/40">Beschreibung</p>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="w-full rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-2 text-sm text-white outline-none focus:border-sky-400/40"
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-white/80">
            <input
              type="checkbox"
              checked={connected}
              onChange={(e) => setConnected(e.target.checked)}
              className="h-4 w-4 rounded border-white/20 bg-white/[0.04] text-sky-400"
            />
            Verbunden
          </label>

          <div className="flex items-center justify-between border-t border-white/[0.06] pt-3">
            <button
              type="button"
              onClick={onDelete}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-[11px] text-rose-200 hover:bg-rose-500/10"
            >
              <Trash2 className="h-3 w-3" /> Löschen
            </button>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onToggle}
                className="rounded-md border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-[11px] text-white/80 hover:bg-white/[0.08]"
              >
                Abbrechen
              </button>
              <button
                type="button"
                onClick={save}
                className="rounded-md bg-gradient-to-r from-sky-400 to-cyan-300 px-3 py-1.5 text-[11px] font-semibold text-slate-950 transition-all hover:from-sky-300 hover:to-cyan-200"
              >
                Speichern
              </button>
            </div>
          </div>
        </div>
      )}
    </article>
  )
}

// ---------- About ----------

function AboutView() {
  return (
    <div className="flex-1 space-y-3 overflow-y-auto p-4 text-sm text-white/75">
      <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
        <p className="text-base font-semibold text-white">Flux</p>
        <p className="mt-1 text-xs text-white/45">Multiposter für deine Marktplätze · v0.9.0 (Beta)</p>
        <div className="mt-4 space-y-1.5 text-xs text-white/65">
          <p>· AI-Listings für eBay, Kleinanzeigen, Shopify</p>
          <p>· Auto-Poster mit Quellen-Sync (Sheets, CSV)</p>
          <p>· Agents für Lager, Logistik, Analytics</p>
          <p>· Supabase Auth + lokale Demo</p>
        </div>
      </div>
    </div>
  )
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  type?: string
}) {
  return (
    <div>
      <p className="mb-1 text-[10px] uppercase tracking-widest text-white/40">{label}</p>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-9 w-full rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 text-sm text-white outline-none placeholder:text-white/30 focus:border-sky-400/40"
      />
    </div>
  )
}
