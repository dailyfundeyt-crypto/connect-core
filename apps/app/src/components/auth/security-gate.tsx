import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  getSecurityEmail,
  hasSecurityPassword,
  isSecurityUnlocked,
  setSecurityEmail,
  setSecurityPassword,
  subscribeSecurity,
  unlockWithPassword,
} from "@/lib/auth/local-security";

/**
 * Session gate for the browser app — unlocks with Stefan’s local password.
 * Cloud agents still need the PC online (local DB) unless moved to Supabase.
 */
export function SecurityGate({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [unlocked, setUnlocked] = useState(true);
  const [hasPassword, setHasPassword] = useState(false);
  const [email, setEmail] = useState(DEFAULT_VISIBLE_EMAIL);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const refresh = () => {
      setHasPassword(hasSecurityPassword());
      setUnlocked(isSecurityUnlocked());
      setEmail(getSecurityEmail());
      setReady(true);
    };
    refresh();
    return subscribeSecurity(refresh);
  }, []);

  if (!ready) return null;
  if (unlocked) return <>{children}</>;

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      setSecurityEmail(email);
      if (!hasPassword) {
        if (password !== confirm) {
          throw new Error("Passwörter stimmen nicht überein.");
        }
        await setSecurityPassword(password);
      } else {
        const ok = await unlockWithPassword(password);
        if (!ok) throw new Error("Falsches Passwort.");
      }
      setPassword("");
      setConfirm("");
      setUnlocked(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Fehler");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-dvh w-full items-center justify-center bg-[#f4f5f7] p-6">
      <form
        className="w-full max-w-sm space-y-4 rounded-3xl border border-black/5 bg-white p-6 shadow-xl shadow-black/10"
        onSubmit={onSubmit}
      >
        <div>
          <h1 className="text-lg font-semibold tracking-tight">
            {hasPassword ? "Connect entsperren" : "Sicherheits-Passwort"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {hasPassword
              ? "Diese Browser-Version braucht den PC (lokale Datenbank) und dein Passwort."
              : "Lege E-Mail und Passwort für Stefan fest — gilt für diese lokale App."}
          </p>
        </div>
        <label className="block space-y-1 text-sm">
          <span className="font-medium">E-Mail</span>
          <Input
            autoComplete="username"
            onChange={(e) => setEmail(e.target.value)}
            required
            type="email"
            value={email}
          />
        </label>
        <label className="block space-y-1 text-sm">
          <span className="font-medium">Passwort</span>
          <Input
            autoComplete={hasPassword ? "current-password" : "new-password"}
            onChange={(e) => setPassword(e.target.value)}
            required
            type="password"
            value={password}
          />
        </label>
        {!hasPassword ? (
          <label className="block space-y-1 text-sm">
            <span className="font-medium">Passwort bestätigen</span>
            <Input
              autoComplete="new-password"
              onChange={(e) => setConfirm(e.target.value)}
              required
              type="password"
              value={confirm}
            />
          </label>
        ) : null}
        {error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}
        <Button className="w-full" disabled={busy} type="submit">
          {hasPassword ? "Entsperren" : "Passwort setzen"}
        </Button>
      </form>
    </div>
  );
}

const DEFAULT_VISIBLE_EMAIL = "stefankunc994@gmail.com";
