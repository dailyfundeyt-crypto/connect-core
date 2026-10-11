import { IconBuilding, IconCheck, IconPlus } from "@tabler/icons-react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  companyIdForAgent,
  listCompanies,
  moveAgentToCompany,
  subscribeCompanies,
} from "@/lib/companies/store";
// The type lives in the catalog and is re-used by the store, but only the store re-exports it as
// a value — the type itself has to come from where it is declared.
import type { ConnectCompany } from "@/lib/companies/catalog";
import { cn } from "@/lib/utils";

/**
 * Put a bot on a company roster with one button.
 *
 * Ownership lives in `company.agentIds` on the company record, and nothing else writes it from the
 * Marketplace side — so a bot created here existed, showed up under "Meine Bots", and belonged to
 * no company at all. The sidebar then filtered `/api/agents` against that roster, matched nothing,
 * and said the company had no agents.
 *
 * Reads the current owner through `companyIdForAgent` rather than assuming "not assigned", because
 * a bot can be on exactly one roster but the record may have been written by an older path. Shows
 * the owner instead of offering to move to the company it is already in.
 */
export function AssignCompanyButton({
  agentId,
  className,
  size = "sm",
}: {
  agentId: string;
  className?: string;
  size?: "sm" | "default";
}) {
  const [companies, setCompanies] = useState<ConnectCompany[]>([]);
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    setCompanies(listCompanies());
    setOwnerId(companyIdForAgent(agentId));
  }, [agentId]);

  useEffect(() => {
    refresh();
    return subscribeCompanies(refresh);
  }, [refresh]);

  // Click-away: this is a small popover in a list that can be long, and a picker that stays open
  // while the user scrolls the page behind it reads as stuck.
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener("scroll", close, { once: true, capture: true });
    return () => window.removeEventListener("scroll", close, { capture: true });
  }, [open]);

  const owner = companies.find((c) => c.id === ownerId) ?? null;
  const targets = companies.filter((c) => c.id !== ownerId);

  const assign = async (companyId: string) => {
    setBusy(true);
    setError(null);
    try {
      await moveAgentToCompany(agentId, companyId);
      setOpen(false);
      refresh();
    } catch (err) {
      console.error("[assign-company] assignment failed:", err);
      setError(
        `Konnte nicht zugewiesen werden. ${
          err instanceof Error ? err.message : ""
        }`.trim(),
      );
    } finally {
      setBusy(false);
    }
  };

  if (companies.length === 0) {
    return (
      <p className={cn("text-[11px] text-muted-foreground", className)}>
        Kein Unternehmen angelegt.
      </p>
    );
  }

  if (owner && !open) {
    return (
      <button
        className={cn(
          "inline-flex items-center gap-1 rounded-full bg-emerald-500/12 px-2 py-0.5 text-[10px] font-medium text-emerald-700 transition-colors hover:bg-emerald-500/20 dark:text-emerald-300",
          className,
        )}
        onClick={() => setOpen(true)}
        title={`Zugeordnet: ${owner.name} — klicken zum Ändern`}
        type="button"
      >
        <IconCheck className="size-3" />
        {owner.name}
      </button>
    );
  }

  if (!open) {
    return (
      <Button
        className={className}
        onClick={() => setOpen(true)}
        size={size}
        type="button"
        variant="outline"
      >
        <IconPlus className="size-3.5" />
        Unternehmen
      </Button>
    );
  }

  return (
    <span className={cn("relative inline-flex", className)}>
      <span className="flex flex-wrap items-center gap-1 rounded-lg border border-border bg-popover p-1 shadow-sm">
        <span className="flex items-center gap-1 px-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          <IconBuilding className="size-3" />
          Zuordnen
        </span>
        {owner ? (
          <button
            className="rounded-md bg-emerald-500/15 px-2 py-1 text-[11px] font-medium text-emerald-700 transition-colors hover:bg-emerald-500/25 dark:text-emerald-300"
            disabled={busy}
            onClick={() => void assign(owner.id)}
            type="button"
          >
            {owner.name}
          </button>
        ) : null}
        {targets.map((company) => (
          <button
            className="rounded-md px-2 py-1 text-[11px] font-medium transition-colors hover:bg-muted disabled:opacity-50"
            disabled={busy}
            key={company.id}
            onClick={() => void assign(company.id)}
            type="button"
          >
            {company.name}
          </button>
        ))}
        <button
          aria-label="Abbrechen"
          className="rounded-md px-1.5 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-muted"
          onClick={() => {
            setOpen(false);
            setError(null);
          }}
          type="button"
        >
          ✕
        </button>
      </span>
      {error ? (
        <span className="absolute left-0 top-full z-10 mt-1 block w-56 text-[10px] text-destructive">
          {error}
        </span>
      ) : null}
    </span>
  );
}