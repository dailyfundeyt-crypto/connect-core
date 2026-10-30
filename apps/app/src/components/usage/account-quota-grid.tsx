import React, { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { AccountQuotaCard } from "./account-quota-card";
import type { CliAccount, QuotaWindow } from "./types";
import { IconFilter, IconGauge, IconLayersSubtract } from "@tabler/icons-react";

export interface AccountQuotaGridProps {
  accounts: CliAccount[];
  quotaWindows: QuotaWindow[];
  className?: string;
}

type FilterMode = "all" | "dedicated" | "shared";

export function AccountQuotaGrid({
  accounts,
  quotaWindows,
  className,
}: AccountQuotaGridProps) {
  const [filter, setFilter] = useState<FilterMode>("all");

  // Create lookup map accountId -> QuotaWindow
  const quotaMap = useMemo(() => {
    const map = new Map<string, QuotaWindow>();
    for (const qw of quotaWindows) {
      map.set(qw.accountId, qw);
    }
    return map;
  }, [quotaWindows]);

  const filteredAccounts = useMemo(() => {
    if (filter === "dedicated") {
      return accounts.filter((a) => a.isolation === "per_agent");
    }
    if (filter === "shared") {
      return accounts.filter((a) => a.isolation === "shared");
    }
    return accounts;
  }, [accounts, filter]);

  return (
    <div className={cn("space-y-4", className)}>
      {/* Grid Header & Filter Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="flex size-7 items-center justify-center rounded-lg bg-sky-500/10 text-sky-400">
            <IconGauge className="size-4" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-white tracking-tight">
              Quota & Limits pro Account
            </h3>
            <p className="text-xs text-zinc-400">
              {accounts.length} erfasste Konten • {quotaWindows.length} aktive Quota-Fenster
            </p>
          </div>
        </div>

        {/* Filter Buttons */}
        <div className="flex items-center rounded-lg border border-white/[0.08] bg-[#16161b] p-1 text-xs self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setFilter("all")}
            className={cn(
              "rounded-md px-2.5 py-1 font-medium transition-colors",
              filter === "all"
                ? "bg-white/[0.12] text-white shadow-sm"
                : "text-zinc-400 hover:text-zinc-200"
            )}
          >
            Alle ({accounts.length})
          </button>
          <button
            type="button"
            onClick={() => setFilter("dedicated")}
            className={cn(
              "rounded-md px-2.5 py-1 font-medium transition-colors",
              filter === "dedicated"
                ? "bg-white/[0.12] text-white shadow-sm"
                : "text-zinc-400 hover:text-zinc-200"
            )}
          >
            Dediziert ({accounts.filter((a) => a.isolation === "per_agent").length})
          </button>
          <button
            type="button"
            onClick={() => setFilter("shared")}
            className={cn(
              "rounded-md px-2.5 py-1 font-medium transition-colors",
              filter === "shared"
                ? "bg-white/[0.12] text-white shadow-sm"
                : "text-zinc-400 hover:text-zinc-200"
            )}
          >
            Geteilt ({accounts.filter((a) => a.isolation === "shared").length})
          </button>
        </div>
      </div>

      {/* Grid Container - 1 col on 390px, 2 on md, 3 on xl */}
      {filteredAccounts.length === 0 ? (
        <div className="rounded-xl border border-white/[0.06] bg-[#121216] p-8 text-center text-zinc-400">
          <IconLayersSubtract className="mx-auto size-8 text-zinc-600 mb-2" />
          <p className="text-sm">Keine Konten für diesen Filter gefunden.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3.5">
          {filteredAccounts.map((account) => (
            <AccountQuotaCard
              key={account.id}
              account={account}
              quotaWindow={quotaMap.get(account.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
