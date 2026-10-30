import React from "react";
import { ShieldCheck, UserCheck, RefreshCw, KeyRound, Check } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Lane 09 Frontend Route (lazy loaded)
 * Onboarding & Security Infrastructure
 */
export function Lane09Route() {
  const [onboardingState, setOnboardingState] = React.useState<any>(null);
  const [loading, setLoading] = React.useState(false);
  const [rateLimitStatus, setRateLimitStatus] = React.useState<string | null>(null);

  const fetchState = () => {
    setLoading(true);
    fetch("/api/onboarding/state")
      .then((r) => r.json())
      .then((d) => {
        setOnboardingState(d);
        setLoading(false);
      })
      .catch((err) => {
        setOnboardingState({ error: err.message });
        setLoading(false);
      });
  };

  React.useEffect(() => {
    fetchState();
  }, []);

  const testRateLimit = async () => {
    setRateLimitStatus("Sende 15 parallele Requests...");
    const results: number[] = [];
    for (let i = 0; i < 15; i++) {
      const res = await fetch("/api/onboarding/state");
      results.push(res.status);
    }
    const has429 = results.includes(429);
    setRateLimitStatus(
      `Test abgeschlossen: Status-Codes [${results.slice(0, 5).join(", ")}...]. Rate-Limit aktiv: ${has429 ? "Ja (429 empfangen)" : "OK (< Limit)"}`,
    );
  };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between border-b pb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <ShieldCheck className="size-6 text-primary" />
            Lane 09: Onboarding & Security Infrastructure
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Verwaltung von Onboarding-Status (Migration 0085), Rate-Limiting und Security-Headern.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={fetchState} disabled={loading} className="gap-1.5 text-xs">
          <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
          Aktualisieren
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Onboarding State Card */}
        <div className="p-5 rounded-xl border border-border bg-card space-y-3">
          <div className="flex items-center gap-2 font-semibold text-sm">
            <UserCheck className="size-4 text-primary" />
            Aktueller Onboarding-Status
          </div>
          <pre className="p-3 rounded-lg bg-muted text-[11px] font-mono overflow-x-auto text-foreground">
            {JSON.stringify(onboardingState, null, 2)}
          </pre>
        </div>

        {/* Security & Rate Limiting Card */}
        <div className="p-5 rounded-xl border border-border bg-card space-y-3">
          <div className="flex items-center gap-2 font-semibold text-sm">
            <KeyRound className="size-4 text-primary" />
            Security Middleware & Härtung
          </div>
          <ul className="text-xs text-muted-foreground space-y-1.5 list-disc list-inside">
            <li>Security Headers (nosniff, SAMEORIGIN, Referrer-Policy)</li>
            <li>CORS & CSRF Origin-Validierung</li>
            <li>In-Memory Sliding Window Rate-Limiting</li>
            <li>Pfad-Traversal-Schutz & Input-Sanitizing</li>
            <li>MCP-Token-Validierung (`connect_mcp_tokens`)</li>
          </ul>

          <div className="pt-2">
            <Button size="sm" variant="secondary" onClick={testRateLimit} className="text-xs">
              Rate-Limit-Test ausführen
            </Button>
            {rateLimitStatus && (
              <p className="mt-2 text-xs text-foreground font-mono bg-muted p-2 rounded">
                {rateLimitStatus}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default Lane09Route;
