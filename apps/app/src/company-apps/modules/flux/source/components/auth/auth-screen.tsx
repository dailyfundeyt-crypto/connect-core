import { useState, type FormEvent } from "react";
import { Check, ExternalLink, Eye, EyeOff, KeyRound, Link2, LogIn, Mail, ShieldCheck, UserPlus, X } from "lucide-react";
import { Input } from "@flux/components/ui/input";
import { Button } from "@flux/components/ui/button";
import type { useAuth } from "@flux/lib/supabase/auth";

type AuthScreenProps = {
  auth: ReturnType<typeof useAuth>;
  onClose?: () => void;
};

type Mode = "credentials" | "sign-in" | "sign-up";

export function AuthScreen({ auth, onClose }: AuthScreenProps) {
  const [mode, setMode] = useState<Mode>(auth.credentials ? "sign-in" : "credentials");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-900/40 px-4">
      <div className="relative w-full max-w-md rounded-2xl border border-neutral-200 bg-white p-6 shadow-2xl">
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="absolute right-3 top-3 rounded p-1.5 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700"
            aria-label="Schließen"
          >
            <X className="h-4 w-4" />
          </button>
        )}

        <div className="mb-5 flex flex-col items-center text-center">
          <div className="mb-3 grid h-12 w-12 place-items-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <h1 className="text-lg font-semibold text-neutral-900">Bei Flux anmelden</h1>
          <p className="mt-1 text-xs text-neutral-500">
            Speichere deine Daten sicher in deinem eigenen Supabase-Backend.
          </p>
        </div>

        {mode === "credentials" && <CredentialsStep auth={auth} onNext={() => setMode("sign-in")} />}
        {mode === "sign-in" && <SignInStep auth={auth} onBack={() => setMode("credentials")} onSwitch={() => setMode("sign-up")} />}
        {mode === "sign-up" && <SignUpStep auth={auth} onBack={() => setMode("credentials")} onSwitch={() => setMode("sign-in")} />}

        {auth.error && (
          <p className="mt-4 rounded-md bg-rose-50 px-3 py-2 text-xs text-rose-700">{auth.error}</p>
        )}
      </div>
    </div>
  );
}

function GoogleButton({ auth, label = "Mit Google anmelden" }: { auth: ReturnType<typeof useAuth>; label?: string }) {
  return (
    <button
      type="button"
      onClick={() => void auth.signInWithGoogle()}
      className="flex w-full items-center justify-center gap-2 rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm font-medium text-neutral-800 transition-colors hover:bg-neutral-50"
    >
      <GoogleIcon /> {label}
    </button>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
      <path fill="#4285F4" d="M23.05 12.27c0-.79-.07-1.55-.2-2.27H12v4.3h6.2a5.31 5.31 0 0 1-2.3 3.48v2.9h3.72c2.18-2 3.43-4.96 3.43-8.41Z" />
      <path fill="#34A853" d="M12 23.5c3.11 0 5.71-1.03 7.62-2.8l-3.72-2.9c-1.03.7-2.36 1.1-3.9 1.1-3 0-5.54-2.03-6.45-4.75H1.66v2.97A11.5 11.5 0 0 0 12 23.5Z" />
      <path fill="#FBBC05" d="M5.55 14.15a6.9 6.9 0 0 1 0-4.3V6.88H1.66a11.5 11.5 0 0 0 0 10.24l3.89-2.97Z" />
      <path fill="#EA4335" d="M12 4.75c1.69 0 3.21.58 4.4 1.72l3.3-3.3A11.5 11.5 0 0 0 12 .5 11.5 11.5 0 0 0 1.66 6.88l3.89 2.97C6.46 6.78 9 4.75 12 4.75Z" />
    </svg>
  );
}

function Divider() {
  return (
    <div className="my-4 flex items-center gap-2 text-[10px] uppercase tracking-wide text-neutral-400">
      <span className="h-px flex-1 bg-neutral-200" />
      oder
      <span className="h-px flex-1 bg-neutral-200" />
    </div>
  );
}

function CredentialsStep({ auth, onNext }: { auth: ReturnType<typeof useAuth>; onNext: () => void }) {
  const [url, setUrl] = useState(auth.credentials?.url ?? "");
  const [anonKey, setAnonKey] = useState(auth.credentials?.anonKey ?? "");
  const [showKey, setShowKey] = useState(false);
  const [testing, setTesting] = useState(false);
  const [test, setTest] = useState<{ ok: boolean; msg: string } | null>(null);

  const trimmedUrl = url.trim();
  const trimmedKey = anonKey.trim();
  const canSave = trimmedUrl.startsWith("https://") && trimmedKey.length > 20;

  const handleTest = async () => {
    if (!canSave) return;
    setTesting(true);
    setTest(null);
    try {
      const { createClient } = await import("@supabase/supabase-js");
      const client = createClient(trimmedUrl, trimmedKey, { auth: { persistSession: false } });
      const { error } = await client.from("profiles").select("id").limit(1).maybeSingle();
      if (error && error.code !== "PGRST116") throw error;
      setTest({ ok: true, msg: "Verbindung erfolgreich." });
    } catch (err) {
      setTest({ ok: false, msg: err instanceof Error ? err.message : "Unbekannter Fehler" });
    } finally {
      setTesting(false);
    }
  };

  const handleSave = () => {
    if (!canSave) return;
    auth.saveCredentials({ url: trimmedUrl, anonKey: trimmedKey });
    onNext();
  };

  return (
    <div className="space-y-3">
      <Step active icon={<Link2 className="h-3 w-3" />} label="1. Supabase-Credentials" />
      <Input
        value={url}
        onChange={(event) => setUrl(event.target.value)}
        placeholder="Projekt-URL · https://…supabase.co"
        autoComplete="off"
      />
      <div className="relative">
        <Input
          value={anonKey}
          onChange={(event) => setAnonKey(event.target.value)}
          placeholder="anon / public key"
          type={showKey ? "text" : "password"}
          autoComplete="off"
        />
        <button
          type="button"
          onClick={() => setShowKey((value) => !value)}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-neutral-400 hover:text-neutral-700"
          aria-label={showKey ? "Verbergen" : "Anzeigen"}
        >
          {showKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
        </button>
      </div>

      <div className="flex items-center gap-2">
        <Button type="button" size="sm" variant="outline" onClick={handleTest} disabled={!canSave || testing}>
          {testing ? "Teste…" : "Verbindung testen"}
        </Button>
        {test && (
          <span className={`text-[11px] font-medium ${test.ok ? "text-emerald-600" : "text-rose-600"}`}>{test.msg}</span>
        )}
      </div>

      <a
        href="https://supabase.com/dashboard/project/_/settings/api"
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1 text-[11px] font-medium text-neutral-500 hover:text-neutral-800"
      >
        API-Keys im Dashboard <ExternalLink className="h-3 w-3" />
      </a>

      <Button type="button" size="sm" className="w-full" onClick={handleSave} disabled={!canSave}>
        Weiter zur Anmeldung
      </Button>
    </div>
  );
}

function SignInStep({ auth, onBack, onSwitch }: { auth: ReturnType<typeof useAuth>; onBack: () => void; onSwitch: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPending(true);
    try {
      await auth.signInWithPassword(email, password);
    } finally {
      setPending(false);
    }
  };

  return (
    <form className="space-y-3" onSubmit={handleSubmit}>
      <Step active done icon={<LogIn className="h-3 w-3" />} label="2. Anmelden" />
      <GoogleButton auth={auth} />
      <Divider />
      <div className="space-y-2">
        <div className="relative">
          <Mail className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-neutral-400" />
          <Input
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="E-Mail"
            type="email"
            autoComplete="email"
            className="pl-7"
            required
          />
        </div>
        <div className="relative">
          <KeyRound className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-neutral-400" />
          <Input
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Passwort"
            type="password"
            autoComplete="current-password"
            className="pl-7"
            required
          />
        </div>
      </div>
      <Button type="submit" size="sm" className="w-full" disabled={pending || !email || !password}>
        {pending ? "Anmelden …" : "Anmelden"}
      </Button>
      <div className="flex items-center justify-between text-[11px] text-neutral-500">
        <button type="button" onClick={onBack} className="hover:text-neutral-800">
          ← Credentials ändern
        </button>
        <button type="button" onClick={onSwitch} className="font-medium text-neutral-700 hover:text-neutral-900">
          Konto erstellen
        </button>
      </div>
    </form>
  );
}

function SignUpStep({ auth, onBack, onSwitch }: { auth: ReturnType<typeof useAuth>; onBack: () => void; onSwitch: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPending(true);
    try {
      await auth.signUp(email, password);
      setSent(true);
    } finally {
      setPending(false);
    }
  };

  if (sent) {
    return (
      <div className="space-y-3 text-center">
        <div className="mx-auto grid h-10 w-10 place-items-center rounded-full bg-emerald-100 text-emerald-700">
          <Check className="h-5 w-5" />
        </div>
        <p className="text-sm font-medium text-neutral-900">Bestätigungs-Mail verschickt</p>
        <p className="text-xs text-neutral-500">
          Wir haben einen Link an <strong>{email}</strong> geschickt. Nach dem Klick bist du angemeldet.
        </p>
        <button type="button" onClick={onSwitch} className="text-[11px] font-medium text-neutral-700 hover:text-neutral-900">
          Zur Anmeldung
        </button>
      </div>
    );
  }

  return (
    <form className="space-y-3" onSubmit={handleSubmit}>
      <Step active icon={<UserPlus className="h-3 w-3" />} label="2. Konto erstellen" />
      <div className="space-y-2">
        <div className="relative">
          <Mail className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-neutral-400" />
          <Input
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="E-Mail"
            type="email"
            autoComplete="email"
            className="pl-7"
            required
          />
        </div>
        <div className="relative">
          <KeyRound className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-neutral-400" />
          <Input
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Passwort (min. 6 Zeichen)"
            type="password"
            autoComplete="new-password"
            minLength={6}
            className="pl-7"
            required
          />
        </div>
      </div>
      <Button type="submit" size="sm" className="w-full" disabled={pending || !email || password.length < 6}>
        {pending ? "Erstellen …" : "Konto erstellen"}
      </Button>
      <div className="flex items-center justify-between text-[11px] text-neutral-500">
        <button type="button" onClick={onBack} className="hover:text-neutral-800">
          ← Credentials ändern
        </button>
        <button type="button" onClick={onSwitch} className="font-medium text-neutral-700 hover:text-neutral-900">
          Schon registriert?
        </button>
      </div>
    </form>
  );
}

function Step({ active, done, icon, label }: { active: boolean; done?: boolean; icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span
        className={`grid h-5 w-5 place-items-center rounded-full ${
          done ? "bg-emerald-500 text-white" : active ? "bg-neutral-900 text-white" : "bg-neutral-200 text-neutral-500"
        }`}
      >
        {done ? <Check className="h-3 w-3" /> : icon}
      </span>
      <span className={`text-xs font-semibold ${active ? "text-neutral-900" : "text-neutral-500"}`}>{label}</span>
    </div>
  );
}
