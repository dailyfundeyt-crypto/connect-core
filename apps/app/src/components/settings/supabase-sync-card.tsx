import { SettingsSectionHeader } from "@/components/settings/settings-section-header";
import { IconAlertTriangle, IconCloudCheck, IconRefresh } from "@tabler/icons-react";
import { useCallback, useEffect, useState } from "react";
import { PageRows, PageSection } from "@/components/layout/page-shell";
import { Button } from "@/components/ui/button";
import { Item, ItemActions, ItemContent, ItemDescription, ItemTitle } from "@/components/ui/item";
import { Separator } from "@/components/ui/separator";

/** Status of the scheduled App <-> Supabase sync (Sync-Connect.ps1, every 5 minutes). */
type SyncStatus = {
  available: boolean;
  lastRun?: string;
  lastSuccess?: string;
  lastChangeAt?: string;
  result?: "ok" | "unchanged" | "warning" | "error" | "waiting";
  message?: string;
  lastError?: string | null;
  lastErrorAt?: string;
  lastOps?: number;
  conflictsTotal?: number;
  intervalMinutes?: number;
  log?: string;
};

function when(iso?: string | null): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" });
}

/** Einstellungen > Sicherung: Online-Abgleich App <-> Supabase (Vercel), Fehler sichtbar. */
export function SupabaseSyncCard() {
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/connect/sync-status", { credentials: "include" });
      setStatus(res.ok ? ((await res.json()) as SyncStatus) : { available: false });
    } catch {
      setStatus({ available: false });
    }
  }, []);
  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), 30_000);
    return () => clearInterval(timer);
  }, [refresh]);

  if (status && !status.available) {
    return (
      <>
        <SettingsSectionHeader
          description="Automatischer Abgleich zwischen der Connect App auf dem PC und Supabase — alle 5 Minuten, in beide Richtungen."
          title="Sync & Backup"
        />
        <PageSection title="Online-Abgleich (Supabase)">
          <PageRows>
            <Item size="sm">
              <ItemContent>
                <ItemTitle>Abgleich mit der Connect App</ItemTitle>
                <ItemDescription>
                  Der Abgleich laeuft auf dem PC mit der Connect App (Aufgabe "Connect Sync (Supabase)", alle 5 Minuten). Status siehe dort unter Einstellungen &gt; Sicherung.
                </ItemDescription>
              </ItemContent>
            </Item>
          </PageRows>
        </PageSection>
      </>
    );
  }

  const stale = status?.lastRun ? Date.now() - new Date(status.lastRun).getTime() > 20 * 60_000 : false;
  const bad = status?.result === "error" || stale;
  const label =
    status?.result === "error"
      ? "Fehler"
      : status?.result === "warning"
        ? "Mit Hinweisen"
        : status?.result === "waiting"
          ? "Wartet auf die Connect App"
          : stale
            ? "Läuft nicht mehr"
            : "Aktiv";
  return (
    <>
      <SettingsSectionHeader
        description="Automatischer Abgleich zwischen der Connect App auf dem PC und Supabase — alle 5 Minuten, in beide Richtungen."
        title="Sync & Backup"
      />
      <PageSection title="Online-Abgleich (Supabase)">
      <PageRows>
        <Item size="sm">
          <ItemContent>
            <ItemTitle>
              {bad ? <IconAlertTriangle className="size-4 text-destructive" /> : <IconCloudCheck className="size-4" />}
              {status ? label : "Lade ..."}
            </ItemTitle>
            <ItemDescription>
              {status
                ? `Letzter Lauf ${when(status.lastRun)} - ${status.message ?? ""} - alle ${status.intervalMinutes ?? 5} Minuten, in beide Richtungen`
                : ""}
            </ItemDescription>
            {status?.lastError ? (
              <ItemDescription className="text-destructive">
                Fehler {when(status.lastErrorAt)}: {status.lastError}
              </ItemDescription>
            ) : null}
            {stale && status?.result !== "error" ? (
              <ItemDescription className="text-destructive">
                Seit über 20 Minuten kein Lauf – geplante Aufgabe „Connect Sync (Supabase)“ prüfen.
              </ItemDescription>
            ) : null}
          </ItemContent>
          <ItemActions>
            <Button onClick={() => void refresh()} size="sm" variant="ghost">
              <IconRefresh className="size-4" />
            </Button>
          </ItemActions>
        </Item>
        <Separator />
        <Item size="sm">
          <ItemContent>
            <ItemTitle>Letzte Übertragung</ItemTitle>
            <ItemDescription>
              {`${when(status?.lastChangeAt)} - Konflikt-Kopien bisher: ${status?.conflictsTotal ?? 0} - Log: ${status?.log ?? "-"}`}
            </ItemDescription>
          </ItemContent>
        </Item>
      </PageRows>
    </PageSection>
    </>
  );
}
