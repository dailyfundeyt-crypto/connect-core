/**
 * T3-Einstellungen — CLIs & Provider-Bereich (Lane A25).
 *
 * Verwaltet und visualisiert den Status aller 11 T3-Treiber:
 *  - Codex, Claude (an Position 1 und 2 gemäß A04)
 *  - Cursor, Grok, Hermes, Freebuff, OpenCode, Antigravity, Pi, Muse, ACP
 *
 * STRIKTE REGELN (Stefan / Masterplan):
 *  1. KEINE Eingabefelder für Keys! API-Keys bleiben in der bestehenden Connect-Key-Verwaltung.
 *  2. Hinweis: „In T3 anmelden“ – Login macht Stefan selbst (im Terminal oder in T3).
 *  3. Connect liest keine Token-Dateien und fordert keine Passwörter an.
 */

import { useMemo, useState } from "react";
import {
  IconCheck,
  IconClock,
  IconExternalLink,
  IconInfoCircle,
  IconKey,
  IconLock,
  IconRefresh,
  IconTerminal2,
  IconX,
} from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useT3Providers } from "@/lib/t3";
import type { T3ProviderId, T3ProviderStatus } from "@/lib/t3/contracts";
import { T3_PROVIDER_META } from "./types";

interface T3ClisSectionProps {
  className?: string;
}

export function T3ClisSection({ className }: T3ClisSectionProps) {
  const { providers, loading, refetch, isProviderAvailable } = useT3Providers();
  const [filter, setFilter] = useState<"all" | "available" | "auth">("all");

  // Filter & Sortierung: Codex und Claude stehen an 1 und 2
  const sortedProviders = useMemo(() => {
    const list = [...providers];
    return list.sort((a, b) => {
      const order = ["codex", "claudeAgent", "cursor", "grok", "hermes", "freebuff", "antigravity"];
      const indexA = order.indexOf(a.provider);
      const indexB = order.indexOf(b.provider);
      if (indexA !== -1 && indexB !== -1) return indexA - indexB;
      if (indexA !== -1) return -1;
      if (indexB !== -1) return 1;
      return a.provider.localeCompare(b.provider);
    });
  }, [providers]);

  const filteredProviders = useMemo(() => {
    return sortedProviders.filter((p) => {
      if (filter === "available") return p.installed && p.availability !== "unavailable";
      if (filter === "auth") return p.authenticated === true || p.auth === "authenticated";
      return true;
    });
  }, [sortedProviders, filter]);

  return (
    <div className={cn("space-y-4", className)} data-testid="t3-clis-section">
      {/* Header & Filter */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-white">Anbieter-CLIs & Treiber</h3>
          <p className="text-xs text-[#888]">
            Status der lokalen T3-Treiber. Authentifizierung erfolgt autonom über T3 oder Terminal.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Filter Pills */}
          <div className="flex rounded-lg bg-white/[0.04] p-0.5 text-xs">
            <button
              className={cn(
                "rounded-md px-2.5 py-1 text-[11px] transition-colors",
                filter === "all"
                  ? "bg-white/10 text-white font-medium"
                  : "text-[#888] hover:text-white",
              )}
              onClick={() => setFilter("all")}
              type="button"
            >
              Alle ({providers.length})
            </button>
            <button
              className={cn(
                "rounded-md px-2.5 py-1 text-[11px] transition-colors",
                filter === "available"
                  ? "bg-white/10 text-white font-medium"
                  : "text-[#888] hover:text-white",
              )}
              onClick={() => setFilter("available")}
              type="button"
            >
              Verfügbar
            </button>
            <button
              className={cn(
                "rounded-md px-2.5 py-1 text-[11px] transition-colors",
                filter === "auth"
                  ? "bg-white/10 text-white font-medium"
                  : "text-[#888] hover:text-white",
              )}
              onClick={() => setFilter("auth")}
              type="button"
            >
              Angemeldet
            </button>
          </div>

          {/* Refresh */}
          <Button
            aria-label="Provider aktualisieren"
            className="border-white/10 text-[#aaa] hover:text-white"
            disabled={loading}
            onClick={() => void refetch()}
            size="sm"
            type="button"
            variant="ghost"
          >
            <IconRefresh className={cn("size-3.5", loading && "animate-spin")} />
          </Button>
        </div>
      </div>

      {/* WICHTIGER HINWEIS: Keine Key-Eingabe, Verweis auf Connect-Keyring */}
      <div
        className="rounded-xl border border-amber-500/20 bg-amber-500/[0.06] p-3 text-xs text-amber-200/90"
        data-testid="no-keys-notice"
      >
        <div className="flex items-start gap-2.5">
          <IconKey className="size-4 shrink-0 text-amber-400 mt-0.5" />
          <div className="space-y-1">
            <p className="font-medium text-amber-100">
              Keine API-Key-Eingabe an dieser Stelle
            </p>
            <p className="text-[11px] leading-relaxed text-amber-200/80">
              T3-Treiber nutzen deine bestehenden lokalen CLI-Logins (z. B. Codex CLI, Claude CLI,
              Grok Sync) oder globale Keys. Keys werden ausschließlich in der vorhandenen
              Connect-Key-Verwaltung unter{" "}
              <a
                className="font-medium text-amber-300 underline underline-offset-2 hover:text-white"
                href="#api-keys"
              >
                Einstellungen › Globale API-Keys
              </a>{" "}
              gepflegt. Connect speichert keine Plaintext-Tokens im Browser.
            </p>
          </div>
        </div>
      </div>

      {/* Provider-Liste */}
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        {filteredProviders.map((provider) => {
          const meta = T3_PROVIDER_META[provider.provider] ?? {
            label: provider.displayName ?? provider.provider,
            description: "T3 Agent-Treiber",
            loginHint: "In T3 anmelden.",
          };
          const isInstalled = provider.installed;
          const isAuth = provider.authenticated === true || provider.auth === "authenticated";
          const isUnknownAuth = provider.authenticated === null || provider.auth === "unknown";

          return (
            <div
              key={provider.provider}
              className={cn(
                "rounded-xl border border-white/[0.06] bg-[#141413] p-3 text-xs transition-colors hover:border-white/10",
                !isInstalled && "opacity-75",
              )}
              data-testid={`t3-provider-card-${provider.provider}`}
            >
              {/* Zeile 1: Name, Badges */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className="flex size-7 items-center justify-center rounded-md bg-white/[0.05] font-mono text-[11px] font-bold text-white">
                    {meta.label.slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <h4 className="font-medium text-white">{meta.label}</h4>
                    <span className="font-mono text-[10px] text-[#777]">
                      {provider.provider}
                      {provider.fork ? " (Fork)" : ""}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  {/* Status Badge */}
                  {isInstalled ? (
                    <span className="inline-flex items-center gap-1 rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] text-emerald-400">
                      <IconCheck className="size-3" />
                      {provider.version ? `v${provider.version}` : "Bereit"}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-400">
                      <IconX className="size-3" /> Fehlt
                    </span>
                  )}
                </div>
              </div>

              {/* Zeile 2: Beschreibung */}
              <p className="mt-2 text-[11px] text-[#888] line-clamp-2">{meta.description}</p>

              {/* Zeile 3: Modelle */}
              {provider.models && provider.models.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-1">
                  {provider.models.slice(0, 3).map((m) => (
                    <span
                      key={m}
                      className="rounded bg-white/[0.03] px-1.5 py-0.5 font-mono text-[9px] text-[#aaa]"
                    >
                      {m}
                    </span>
                  ))}
                  {provider.models.length > 3 ? (
                    <span className="text-[9px] text-[#666]">+{provider.models.length - 3}</span>
                  ) : null}
                </div>
              ) : null}

              {/* Zeile 4: Auth-Status & Stefan-Login-Hinweis */}
              <div className="mt-2.5 flex items-center justify-between border-t border-white/[0.04] pt-2 text-[11px]">
                <div className="flex items-center gap-1 text-[#aaa]">
                  <IconTerminal2 className="size-3.5 text-[#777]" />
                  <span>
                    {isAuth
                      ? "Angemeldet"
                      : isUnknownAuth
                        ? "Status via T3"
                        : "Nicht angemeldet"}
                  </span>
                </div>

                {/* Hinweis: In T3 anmelden – Stefan macht das selbst */}
                <div
                  className="group relative flex items-center gap-1 text-[10px] text-sky-400 cursor-help"
                  title={meta.loginHint}
                  data-testid="t3-login-hint"
                >
                  <IconExternalLink className="size-3" />
                  <span>In T3 anmelden</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {loading && providers.length === 0 ? (
        <div className="py-6 text-center text-xs text-[#777]">
          Lade T3-Treiberliste…
        </div>
      ) : null}
    </div>
  );
}
