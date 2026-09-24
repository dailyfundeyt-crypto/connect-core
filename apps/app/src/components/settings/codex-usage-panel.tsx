import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "@/components/ui/item";
import { PageRows, PageSection } from "@/components/layout/page-shell";
import { tryClient } from "@/lib/client";

export type CodexUsageDashboard = {
  totalTokens: number;
  peakDayTokens: number;
  peakDay: string | null;
  budgetTokens: number;
  remainingTokens: number;
  percentUsed: number;
  calls: number;
  daily: { date: string; tokens: number }[];
  hasApiKey: boolean;
  baseUrl: string;
  model: string;
  enabled: boolean;
};

function formatTokens(n: number): string {
  if (n >= 1_000_000) {
    return `${(n / 1_000_000).toLocaleString("de-DE", {
      maximumFractionDigits: 1,
    })} Mio.`;
  }
  if (n >= 1_000) {
    return `${Math.round(n / 1_000).toLocaleString("de-DE")} k`;
  }
  return n.toLocaleString("de-DE");
}

async function loadUsage(): Promise<CodexUsageDashboard | null> {
  const response = await tryClient("/api/cli-bridge/usage");
  if (!response.ok) return null;
  const body = (await response.json()) as { usage?: CodexUsageDashboard };
  return body.usage ?? null;
}

/**
 * Codex API key + token budget heatmap (Settings → Usage).
 * Tracks what Connect spends through Bot-CLI ChatGPT/Cursor — not OpenAI's global account UI.
 */
export function CodexUsagePanel() {
  const [usage, setUsage] = useState<CodexUsageDashboard | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [budgetMio, setBudgetMio] = useState("10");
  const [baseUrl, setBaseUrl] = useState("https://api.openai.com/v1");
  const [model, setModel] = useState("gpt-5");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [view, setView] = useState<"daily" | "weekly" | "cum">("daily");

  const refresh = useCallback(async () => {
    const next = await loadUsage();
    if (!next) return;
    setUsage(next);
    setBudgetMio(String(Math.round(next.budgetTokens / 1_000_000) || 10));
    setBaseUrl(next.baseUrl);
    setModel(next.model);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const maxDay = useMemo(() => {
    if (!usage) return 1;
    return Math.max(1, ...usage.daily.map((d) => d.tokens));
  }, [usage]);

  const save = async (clearKey = false) => {
    setSaving(true);
    setMessage(null);
    try {
      const budgetTokens = Math.max(
        1_000_000,
        Math.round(Number(budgetMio) || 10) * 1_000_000,
      );
      const response = await tryClient("/api/cli-bridge/settings", {
        method: "PUT",
        body: {
          ...(clearKey
            ? { clearApiKey: true }
            : apiKey.trim()
              ? { apiKey: apiKey.trim() }
              : {}),
          budgetTokens,
          baseUrl: baseUrl.trim() || "https://api.openai.com/v1",
          model: model.trim() || "gpt-5",
          enabled: true,
        },
      });
      const body = (await response.json().catch(() => null)) as {
        usage?: CodexUsageDashboard;
        error?: string;
      } | null;
      if (!response.ok) {
        setMessage(body?.error || `Speichern fehlgeschlagen (${response.status})`);
        return;
      }
      if (body?.usage) setUsage(body.usage);
      setApiKey("");
      setMessage(
        clearKey
          ? "API-Key entfernt."
          : "Codex-Einstellungen gespeichert. Bot-CLI (ChatGPT/Cursor) nutzt diesen Key.",
      );
    } finally {
      setSaving(false);
    }
  };

  const cells = usage?.daily ?? [];
  const weeks: { date: string; tokens: number }[][] = [];
  for (let i = 0; i < cells.length; i += 7) {
    weeks.push(cells.slice(i, i + 7));
  }

  const monthLabels = useMemo(() => {
    const labels: { i: number; label: string }[] = [];
    let last = "";
    cells.forEach((d, i) => {
      const label = new Date(d.date + "T00:00:00Z").toLocaleString("de-DE", {
        month: "short",
        timeZone: "UTC",
      });
      if (label !== last && i % 7 === 0) {
        labels.push({ i: Math.floor(i / 7), label });
        last = label;
      }
    });
    return labels;
  }, [cells]);

  const weekly = useMemo(() => {
    return weeks.map((week) => ({
      tokens: week.reduce((n, d) => n + d.tokens, 0),
      date: week[0]?.date ?? "",
    }));
  }, [weeks]);

  const cumulative = useMemo(() => {
    let sum = 0;
    return cells.map((d) => {
      sum += d.tokens;
      return { date: d.date, tokens: sum };
    });
  }, [cells]);

  return (
    <PageSection title="Codex / Tokennutzung">
      <PageRows>
        <Item size="sm">
          <ItemContent>
            <ItemTitle>Codex API-Key</ItemTitle>
            <ItemDescription>
              Dein Codex-/OpenAI-Key für Bot-CLI (ChatGPT & Cursor). Wird
              verschlüsselt gespeichert — nicht als{" "}
              <code>OPENAI_API_KEY</code> in der .env nötig. Budget z. B. 10 Mio.
              Tokens für das Dashboard.
            </ItemDescription>
          </ItemContent>
        </Item>

        <div className="flex flex-col gap-2 px-1 pb-2">
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <Input
              autoComplete="off"
              className="h-9 max-w-md font-mono text-sm"
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={
                usage?.hasApiKey
                  ? "•••• Key gespeichert — neuen einfügen zum Ersetzen"
                  : "sk-… Codex API-Key"
              }
              type="password"
              value={apiKey}
            />
            <Input
              className="h-9 w-28"
              inputMode="decimal"
              onChange={(e) => setBudgetMio(e.target.value)}
              placeholder="10"
              title="Budget in Millionen Tokens"
              value={budgetMio}
            />
            <span className="self-center text-xs text-muted-foreground">
              Mio. Tokens Budget
            </span>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              className="h-9 max-w-md font-mono text-xs"
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://api.openai.com/v1"
              value={baseUrl}
            />
            <Input
              className="h-9 w-40 font-mono text-xs"
              onChange={(e) => setModel(e.target.value)}
              placeholder="gpt-5"
              value={model}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={saving}
              onClick={() => void save(false)}
              size="sm"
              type="button"
            >
              Speichern
            </Button>
            {usage?.hasApiKey ? (
              <Button
                disabled={saving}
                onClick={() => void save(true)}
                size="sm"
                type="button"
                variant="outline"
              >
                Key entfernen
              </Button>
            ) : null}
            <Button
              onClick={() => void refresh()}
              size="sm"
              type="button"
              variant="ghost"
            >
              Aktualisieren
            </Button>
          </div>
          {message ? (
            <p className="text-xs text-muted-foreground" role="status">
              {message}
            </p>
          ) : null}
        </div>

        {usage ? (
          <>
            <div className="grid grid-cols-2 gap-2 px-1 sm:grid-cols-4">
              <Stat
                label="Token insgesamt"
                value={formatTokens(usage.totalTokens)}
              />
              <Stat
                label="Noch im Budget"
                value={formatTokens(usage.remainingTokens)}
              />
              <Stat
                label="Spitzenwert / Tag"
                value={formatTokens(usage.peakDayTokens)}
              />
              <Stat
                label="Aufrufe"
                value={usage.calls.toLocaleString("de-DE")}
              />
            </div>
            <div className="px-1 pb-1">
              <div className="mb-1 flex h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className="bg-sky-500 transition-all"
                  style={{
                    width: `${Math.min(100, usage.percentUsed)}%`,
                  }}
                />
              </div>
              <p className="text-[11px] text-muted-foreground">
                {usage.percentUsed.toLocaleString("de-DE", {
                  maximumFractionDigits: 1,
                })}
                % von {formatTokens(usage.budgetTokens)} Budget ·{" "}
                {usage.hasApiKey ? "Key hinterlegt" : "kein Key"} · {usage.model}
              </p>
            </div>

            <Item size="sm">
              <ItemContent>
                <ItemTitle>Tokennutzung</ItemTitle>
                <ItemDescription>
                  Was Connect über Bot-CLI mit deinem Codex-Key verbraucht hat
                  (nicht der globale OpenAI-Account).
                </ItemDescription>
              </ItemContent>
              <ItemActions>
                <div className="flex gap-1 text-[11px]">
                  {(
                    [
                      ["daily", "Täglich"],
                      ["weekly", "Wöchentlich"],
                      ["cum", "Kumuliert"],
                    ] as const
                  ).map(([id, label]) => (
                    <button
                      className={
                        view === id
                          ? "rounded-md bg-muted px-2 py-0.5 font-medium"
                          : "rounded-md px-2 py-0.5 text-muted-foreground hover:bg-muted/60"
                      }
                      key={id}
                      onClick={() => setView(id)}
                      type="button"
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </ItemActions>
            </Item>

            {view === "daily" ? (
              <div className="overflow-x-auto px-1 pb-3">
                <div className="mb-1 flex gap-[3px] text-[9px] text-muted-foreground">
                  {monthLabels.map((m) => (
                    <span
                      key={`${m.label}-${m.i}`}
                      style={{
                        marginLeft: m.i === 0 ? 0 : undefined,
                        width: 12,
                        flexShrink: 0,
                      }}
                    >
                      {/* positioned roughly by week index via spacer */}
                    </span>
                  ))}
                </div>
                <div className="flex gap-[3px]">
                  {weeks.map((week, wi) => (
                    <div className="flex flex-col gap-[3px]" key={week[0]?.date ?? wi}>
                      {week.map((day) => {
                        const intensity =
                          day.tokens <= 0 ? 0 : Math.min(1, day.tokens / maxDay);
                        const bg =
                          intensity === 0
                            ? "bg-muted"
                            : intensity < 0.25
                              ? "bg-sky-900/80"
                              : intensity < 0.5
                                ? "bg-sky-700"
                                : intensity < 0.75
                                  ? "bg-sky-500"
                                  : "bg-sky-400";
                        return (
                          <div
                            className={`size-[11px] rounded-[2px] ${bg}`}
                            key={day.date}
                            title={`${day.date}: ${day.tokens.toLocaleString("de-DE")} Tokens`}
                          />
                        );
                      })}
                    </div>
                  ))}
                </div>
                <p className="mt-2 text-[10px] text-muted-foreground">
                  {monthLabels.map((m) => m.label).join(" · ")}
                </p>
              </div>
            ) : null}

            {view === "weekly" ? (
              <BarStrip
                points={weekly.map((w) => ({
                  label: w.date.slice(5),
                  tokens: w.tokens,
                }))}
                max={Math.max(1, ...weekly.map((w) => w.tokens))}
              />
            ) : null}

            {view === "cum" ? (
              <BarStrip
                points={cumulative
                  .filter((_, i) => i % 7 === 0)
                  .map((d) => ({
                    label: d.date.slice(5),
                    tokens: d.tokens,
                  }))}
                max={Math.max(1, usage.totalTokens)}
              />
            ) : null}
          </>
        ) : (
          <p className="px-1 text-sm text-muted-foreground">
            Usage wird geladen…
          </p>
        )}
      </PageRows>
    </PageSection>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/80 bg-muted/20 px-3 py-2">
      <p className="text-lg font-semibold tabular-nums tracking-tight">{value}</p>
      <p className="text-[11px] text-muted-foreground">{label}</p>
    </div>
  );
}

function BarStrip({
  points,
  max,
}: {
  points: { label: string; tokens: number }[];
  max: number;
}) {
  return (
    <div className="flex h-24 items-end gap-0.5 overflow-x-auto px-1 pb-3">
      {points.map((p) => (
        <div
          className="flex w-2 shrink-0 flex-col items-center justify-end"
          key={p.label + String(p.tokens)}
          title={`${p.label}: ${p.tokens.toLocaleString("de-DE")}`}
        >
          <div
            className="w-full rounded-sm bg-sky-500/90"
            style={{
              height: `${Math.max(2, (p.tokens / max) * 100)}%`,
              minHeight: p.tokens > 0 ? 4 : 2,
            }}
          />
        </div>
      ))}
    </div>
  );
}
