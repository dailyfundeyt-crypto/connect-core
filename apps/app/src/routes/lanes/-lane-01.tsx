import { useEffect, useState } from "react";
import { IconSparkles, IconTerminal2, IconWorldWww, IconCheck, IconPlayerPlay } from "@tabler/icons-react";
import { Button } from "@/components/ui/button";

interface AccountItem {
  id: string;
  app: string;
  label: string;
  email?: string;
  isActive: boolean;
  dataDir: string;
}

/**
 * Lane 01 Frontend View (Messages-Sidebar V2 + Multi-Login Accounts)
 */
export function Lane01Route() {
  const [accounts, setAccounts] = useState<AccountItem[]>([]);
  const [msg, setMsg] = useState<string | null>(null);

  const fetchAccounts = () => {
    fetch("/api/app-accounts")
      .then((r) => r.json())
      .then((d) => setAccounts(d.accounts || []))
      .catch((e) => console.warn(e));
  };

  useEffect(() => {
    fetchAccounts();
  }, []);

  const handleLaunch = async (id: string) => {
    try {
      const res = await fetch(`/api/app-accounts/${encodeURIComponent(id)}/launch`, { method: "POST" });
      const data = await res.json();
      setMsg(data.message || "App gestartet");
      setTimeout(() => setMsg(null), 3000);
    } catch (e: any) {
      setMsg(`Fehler: ${e?.message}`);
      setTimeout(() => setMsg(null), 3000);
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="border-b border-border pb-4">
        <h1 className="text-xl font-bold tracking-tight">Lane 1: Messages-Sidebar Neuaufbau + Multi-Login</h1>
        <p className="text-xs text-muted-foreground mt-1">
          Kanonische Reihenfolge 1-6 aktiv in Sidebar V2. Multi-Login Provider: Codex, Antigravity, Manus.
        </p>
      </div>

      {msg ? (
        <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs">
          {msg}
        </div>
      ) : null}

      <div className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Registrierte Multi-Login Profile ({accounts.length})
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {accounts.map((acc) => (
            <div key={acc.id} className="p-4 rounded-xl border border-border bg-card space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-primary">
                  {acc.app}
                </span>
                {acc.isActive ? (
                  <span className="flex items-center gap-1 text-[10px] text-emerald-400 font-semibold">
                    <IconCheck className="size-3" /> Aktiv
                  </span>
                ) : null}
              </div>
              <div>
                <p className="text-sm font-medium">{acc.label}</p>
                <p className="text-xs text-muted-foreground">{acc.email || "Keine E-Mail"}</p>
              </div>
              <div className="pt-2 flex items-center justify-between">
                <span className="text-[10px] text-muted-foreground truncate max-w-[200px]" title={acc.dataDir}>
                  {acc.dataDir}
                </span>
                <Button size="sm" variant="outline" className="text-xs gap-1" onClick={() => handleLaunch(acc.id)}>
                  <IconPlayerPlay className="size-3" /> Starten
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default Lane01Route;
