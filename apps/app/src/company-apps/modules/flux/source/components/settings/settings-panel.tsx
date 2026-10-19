import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ArrowLeft,
  Check,
  Database,
  ExternalLink,
  Eye,
  EyeOff,
  Link2,
  LogOut,
  Moon,
  Settings as SettingsIcon,
  Store as StoreIcon,
  Sun,
  User as UserIcon,
  X,
} from "lucide-react";
import { Input } from "@flux/components/ui/input";
import { useAuth } from "@flux/lib/supabase/auth";
import { updateProfile, type Store as StoreModel } from "@flux/lib/supabase/snapshot";
import type { SyncStatus } from "@flux/lib/supabase/types";
import { AvatarUploader } from "@flux/components/auth/avatar-uploader";
import { StoresPanel } from "@flux/components/stores/stores-panel";

type SettingsPanelProps = {
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  status: SyncStatus;
  lastSavedAt: number | null;
  stores: StoreModel[];
  onStoresChange: (next: StoreModel[]) => void;
};

type View = "menu" | "account" | "appearance" | "connections" | "stores";

type Theme = "light" | "dark" | "system";

export function SettingsPanel({ open, onOpen, onClose, status, lastSavedAt, stores, onStoresChange }: SettingsPanelProps) {
  const auth = useAuth();
  const [view, setView] = useState<View>("menu");
  const [theme, setTheme] = useState<Theme>("system");

  useEffect(() => {
    if (!open) setView("menu");
  }, [open]);

  useEffect(() => {
    if (open) {
      const initial =
        typeof document !== "undefined" && document.documentElement.classList.contains("dark") ? "dark" : "light";
      setTheme(initial as Theme);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const applyTheme = (next: Theme) => {
    setTheme(next);
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    if (next === "dark") root.classList.add("dark");
    else if (next === "light") root.classList.remove("dark");
    else {
      const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches;
      root.classList.toggle("dark", prefersDark);
    }
    if (auth.client && auth.status.kind === "signed_in") {
      void updateProfile(auth.client, auth.status.user.id, { theme: next }).catch(() => {});
    }
  };

  const goBack = () => setView("menu");

  return (
    <div className="fixed bottom-4 left-4 z-40 sm:bottom-6 sm:left-6">
      {!open && (
        <button
          type="button"
          onClick={onOpen}
          aria-label="Einstellungen Ã¶ffnen"
          className="grid h-9 w-9 place-items-center rounded-full bg-white text-neutral-700 shadow ring-1 ring-neutral-200 transition-colors hover:bg-neutral-900 hover:text-white hover:ring-neutral-900"
        >
          <SettingsIcon className="h-4 w-4" />
        </button>
      )}

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Einstellungen"
          className="flex w-[280px] flex-col overflow-hidden rounded-lg border border-neutral-200 bg-white text-neutral-900 shadow-xl ring-1 ring-black/5"
        >
          <Header title={view === "menu" ? "Einstellungen" : titleFor(view)} showBack={view !== "menu"} onBack={goBack} onClose={onClose} />

          {view === "menu" && <SettingsMenu onNavigate={setView} onSignOut={() => void auth.signOut()} status={status} lastSavedAt={lastSavedAt} stores={stores} onStoresChange={onStoresChange} />}
          {view === "account" && <AccountView />}
          {view === "appearance" && <AppearanceView theme={theme} onThemeChange={applyTheme} />}
          {view === "connections" && <ConnectionsView />}
          {view === "stores" && <StoresPanel stores={stores} onStoresChange={onStoresChange} />}
        </div>
      )}
    </div>
  );
}

function titleFor(view: Exclude<View, "menu">) {
  switch (view) {
    case "account": return "Konto";
    case "appearance": return "Theme";
    case "connections": return "Verbindung";
    case "stores": return "Stores";
  }
}

function Header({ title, showBack, onBack, onClose }: { title: string; showBack: boolean; onBack: () => void; onClose: () => void }) {
  return (
    <header className="flex items-center justify-between border-b border-neutral-100 px-3 py-2">
      {showBack ? (
        <button
          type="button"
          onClick={onBack}
          className="rounded p-1 text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-900"
          aria-label="ZurÃ¼ck"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
        </button>
      ) : (
        <span />
      )}
      <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">{title}</h2>
      <button
        type="button"
        onClick={onClose}
        className="rounded p-1 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700"
        aria-label="SchlieÃŸen"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </header>
  );
}

function SettingsMenu({
  onNavigate,
  onSignOut,
  status,
  lastSavedAt,
  stores,
  onStoresChange,
}: {
  onNavigate: (view: View) => void;
  onSignOut: () => void;
  status: SyncStatus;
  lastSavedAt: number | null;
  stores: StoreModel[];
  onStoresChange: (next: StoreModel[]) => void;
}) {
  const auth = useAuth();
  const profile = auth.status.kind === "signed_in" ? auth.status.profile : null;
  const user = auth.status.kind === "signed_in" ? auth.status.user : null;
  const meta = (user?.user_metadata ?? {}) as { full_name?: string; name?: string; avatar_url?: string };
  const displayName = profile?.display_name ?? meta.full_name ?? user?.email ?? "Gast";
  const initials = displayName.slice(0, 2).toUpperCase();
  const avatarUrl = profile?.avatar_url ?? meta.avatar_url ?? null;
  const signedIn = auth.status.kind === "signed_in";

  return (
    <>
      <div className="flex items-center gap-2 px-3 py-2.5">
        {avatarUrl ? (
          <img src={avatarUrl} alt="" className="h-7 w-7 shrink-0 rounded-full object-cover" />
        ) : (
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 text-[10px] font-semibold text-white">
            {initials}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-semibold text-neutral-900">{displayName}</p>
          <p className="truncate text-[10px] text-neutral-500">{user?.email ?? "Nicht angemeldet"}</p>
        </div>
        <StatusDot status={status} lastSavedAt={lastSavedAt} />
      </div>

      <div className="grid gap-0.5 px-1 pb-2">
        <Item icon={<UserIcon className="h-3.5 w-3.5" />} label="Konto" disabled={!signedIn} onClick={() => onNavigate("account")} />
        <Item icon={<Moon className="h-3.5 w-3.5" />} label="Theme" onClick={() => onNavigate("appearance")} />
        <Item icon={<StoreIcon className="h-3.5 w-3.5" />} label={`Stores (${stores.length})`} onClick={() => onNavigate("stores")} />
        <Item icon={<Database className="h-3.5 w-3.5" />} label="Verbindung" onClick={() => onNavigate("connections")} />
        {signedIn ? (
          <Item icon={<LogOut className="h-3.5 w-3.5" />} label="Abmelden" danger onClick={onSignOut} />
        ) : (
          <Item icon={<Link2 className="h-3.5 w-3.5" />} label="Anmelden" onClick={() => onNavigate("connections")} />
        )}
      </div>
    </>
  );
}

function StatusDot({ status, lastSavedAt }: { status: SyncStatus; lastSavedAt: number | null }) {
  const readyStamp = status.kind === "ready" ? status.at : lastSavedAt;
  if (status.kind === "loading") {
    return <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-amber-400" title="Synchronisiere" />;
  }
  if (status.kind === "error") {
    return <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-rose-500" title="Fehler" />;
  }
  if (readyStamp) {
    return <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" title={`Gespeichert ${new Date(readyStamp).toLocaleTimeString("de-DE")}`} />;
  }
  return <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-neutral-300" title="Nicht verbunden" />;
}

type ItemProps = { icon: ReactNode; label: string; onClick?: () => void; danger?: boolean; disabled?: boolean };
function Item({ icon, label, onClick, danger, disabled }: ItemProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`group flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs transition-colors ${
        danger ? "text-rose-600 hover:bg-rose-50" : "text-neutral-700 hover:bg-neutral-100"
      } disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent`}
    >
      <span className={`grid h-5 w-5 shrink-0 place-items-center ${danger ? "text-rose-500" : "text-neutral-500 group-hover:text-neutral-700"}`}>{icon}</span>
      <span className="flex-1 truncate">{label}</span>
    </button>
  );
}

function AccountView() {
  const auth = useAuth();
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const userId = auth.status.kind === "signed_in" ? auth.status.user.id : null;

  useEffect(() => {
    if (auth.status.kind === "signed_in") {
      const meta = (auth.status.user.user_metadata ?? {}) as { full_name?: string };
      setName(auth.status.profile?.display_name ?? meta.full_name ?? "");
    }
  }, [auth.status]);

  const handleSave = async () => {
    if (!auth.client || !userId) return;
    setSaving(true);
    setSaved(false);
    try {
      await updateProfile(auth.client, userId, { display_name: name.trim() || null });
      await auth.refreshProfile();
      setSaved(true);
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const handleAvatarUploaded = async (url: string) => {
    if (!auth.client || !userId) return;
    try {
      await updateProfile(auth.client, userId, { avatar_url: url || null });
      await auth.refreshProfile();
    } catch (err) {
      console.error(err);
    }
  };

  if (auth.status.kind !== "signed_in") {
    return <p className="px-3 py-4 text-xs text-neutral-500">Bitte zuerst anmelden.</p>;
  }

  return (
    <div className="space-y-3 px-3 py-3">
      <AvatarUploader auth={auth} onUploaded={handleAvatarUploaded} />

      <FormRow label="Anzeigename">
        <Input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Wie sollen wir dich nennen?"
          maxLength={60}
        />
      </FormRow>

      <button
        type="button"
        onClick={() => void handleSave()}
        disabled={saving}
        className="flex w-full items-center justify-center gap-1.5 rounded bg-neutral-900 px-2 py-1.5 text-[11px] font-medium text-white transition-colors hover:bg-neutral-700 disabled:opacity-50"
      >
        {saved ? <Check className="h-3 w-3" /> : null}
        {saved ? "Gespeichert" : saving ? "Speichern â€¦" : "Profil speichern"}
      </button>

      <p className="text-[10px] text-neutral-500">E-Mail: {auth.status.user.email}</p>
    </div>
  );
}

function AppearanceView({ theme, onThemeChange }: { theme: Theme; onThemeChange: (theme: Theme) => void }) {
  return (
    <div className="px-3 py-3">
      <div className="grid grid-cols-3 gap-1">
        <ThemeOption active={theme === "light"} onClick={() => onThemeChange("light")} icon={<Sun className="h-3 w-3" />} />
        <ThemeOption active={theme === "dark"} onClick={() => onThemeChange("dark")} icon={<Moon className="h-3 w-3" />} />
        <ThemeOption active={theme === "system"} onClick={() => onThemeChange("system")} icon={<SettingsIcon className="h-3 w-3" />} />
      </div>
    </div>
  );
}

function ThemeOption({ active, icon, onClick }: { active: boolean; icon: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center justify-center rounded-md border p-2 transition-colors ${
        active ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50"
      }`}
      aria-label="Theme umschalten"
    >
      {icon}
    </button>
  );
}

function FormRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[10px] font-medium uppercase tracking-wide text-neutral-500">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

function ConnectionsView() {
  const auth = useAuth();
  const [url, setUrl] = useState(auth.credentials?.url ?? "");
  const [anonKey, setAnonKey] = useState(auth.credentials?.anonKey ?? "");
  const [showKey, setShowKey] = useState(false);
  const [testing, setTesting] = useState(false);
  const [test, setTest] = useState<{ ok: boolean; msg: string } | null>(null);
  const debounceRef = useRef<number | null>(null);

  useEffect(() => {
    setUrl(auth.credentials?.url ?? "");
    setAnonKey(auth.credentials?.anonKey ?? "");
  }, [auth.credentials?.url, auth.credentials?.anonKey]);

  useEffect(() => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      if (url.trim() && anonKey.trim()) {
        auth.saveCredentials({ url: url.trim(), anonKey: anonKey.trim() });
      }
    }, 600);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [url, anonKey]);

  const handleTest = async () => {
    if (!url.trim() || !anonKey.trim()) return;
    setTesting(true);
    setTest(null);
    try {
      const { createClient } = await import("@supabase/supabase-js");
      const client = createClient(url.trim(), anonKey.trim(), { auth: { persistSession: false } });
      const { error } = await client.from("profiles").select("id").limit(1).maybeSingle();
      if (error && error.code !== "PGRST116") throw error;
      setTest({ ok: true, msg: "Verbindung erfolgreich." });
    } catch (err) {
      setTest({ ok: false, msg: err instanceof Error ? err.message : "Unbekannter Fehler" });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="space-y-2 px-3 py-3">
      <p className="text-[10px] text-neutral-500">
        Trage deine Supabase-Projekt-URL und den anon-Key ein. Beides findest du unter
        <a href="https://supabase.com/dashboard/project/_/settings/api" target="_blank" rel="noreferrer" className="ml-0.5 inline-flex items-center gap-0.5 font-medium text-neutral-700 hover:text-neutral-900">
          Project Settings â†’ API <ExternalLink className="h-2.5 w-2.5" />
        </a>
      </p>

      <FormRow label="Projekt-URL">
        <Input
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          placeholder="https://â€¦supabase.co"
          autoComplete="off"
        />
      </FormRow>
      <FormRow label="anon key">
        <div className="relative">
          <Input
            value={anonKey}
            onChange={(event) => setAnonKey(event.target.value)}
            placeholder="eyJhbGciOiâ€¦"
            type={showKey ? "text" : "password"}
            autoComplete="off"
          />
          <button
            type="button"
            onClick={() => setShowKey((value) => !value)}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-1 text-neutral-400 hover:text-neutral-700"
            aria-label={showKey ? "Verbergen" : "Anzeigen"}
          >
            {showKey ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
          </button>
        </div>
      </FormRow>

      <button
        type="button"
        onClick={handleTest}
        disabled={testing || !url.trim() || !anonKey.trim()}
        className="w-full rounded border border-neutral-200 bg-white px-2 py-1 text-[11px] font-medium text-neutral-700 transition-colors hover:bg-neutral-50 disabled:opacity-50"
      >
        {testing ? "Teste â€¦" : "Verbindung testen"}
      </button>

      {test && (
        <p className={`text-[10px] font-medium ${test.ok ? "text-emerald-600" : "text-rose-600"}`}>{test.msg}</p>
      )}

      <div className="border-t border-neutral-100 pt-2">
        <GoogleSignInButton />
      </div>
    </div>
  );
}

function GoogleSignInButton() {
  const auth = useAuth();
  return (
    <button
      type="button"
      onClick={() => void auth.signInWithGoogle()}
      disabled={!auth.credentials}
      className="flex w-full items-center justify-center gap-2 rounded-md border border-neutral-200 bg-white px-3 py-1.5 text-[11px] font-medium text-neutral-800 transition-colors hover:bg-neutral-50 disabled:opacity-40"
    >
      <GoogleIcon /> Mit Google anmelden
    </button>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" aria-hidden="true">
      <path fill="#4285F4" d="M23.05 12.27c0-.79-.07-1.55-.2-2.27H12v4.3h6.2a5.31 5.31 0 0 1-2.3 3.48v2.9h3.72c2.18-2 3.43-4.96 3.43-8.41Z" />
      <path fill="#34A853" d="M12 23.5c3.11 0 5.71-1.03 7.62-2.8l-3.72-2.9c-1.03.7-2.36 1.1-3.9 1.1-3 0-5.54-2.03-6.45-4.75H1.66v2.97A11.5 11.5 0 0 0 12 23.5Z" />
      <path fill="#FBBC05" d="M5.55 14.15a6.9 6.9 0 0 1 0-4.3V6.88H1.66a11.5 11.5 0 0 0 0 10.24l3.89-2.97Z" />
      <path fill="#EA4335" d="M12 4.75c1.69 0 3.21.58 4.4 1.72l3.3-3.3A11.5 11.5 0 0 0 12 .5 11.5 11.5 0 0 0 1.66 6.88l3.89 2.97C6.46 6.78 9 4.75 12 4.75Z" />
    </svg>
  );
}
