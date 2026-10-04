/**
 * Diagnose-Page für die 4 Standard-Unternehmen (Nordwind, Lumen, Helm, Pulse).
 *
 * Was sie tut:
 *   1. Listet alle Companies aus `listCompanies()` auf (das was die UI sieht).
 *   2. Zeigt die Roh-Inhalte der drei relevanten localStorage-Keys.
 *   3. Erlaubt das gezielte Löschen der 4 Seed-IDs aus DELETED_SEED_KEY
 *      und das harte Entfernen aller Custom-Companies.
 *
 * Mounted unter `/_authed/settings/diagnose-companies`.
 */

import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import {
  IconArrowLeft,
  IconAlertTriangle,
  IconCircleCheck,
  IconTrash,
} from "@tabler/icons-react";
import {
  listCompanies,
  deleteCompany,
  subscribeCompanies,
} from "@/lib/companies/store";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const SEED_IDS = ["nordwind", "lumen", "helm", "pulse"] as const;
const STORAGE_KEY = "connect.companies.custom";
const DELETED_SEED_KEY = "connect.companies.deleted";
const MIGRATION_KEY = "helium:v2-cleared-default-companies";

type Snapshot = {
  customRaw: string | null;
  customParsed: unknown;
  deletedRaw: string | null;
  deletedParsed: string[] | null;
  migrationFlag: string | null;
  activeCompanyId: string | null;
  visibleCompanies: { id: string; name: string; isSeed: boolean }[];
};

function readSnapshot(): Snapshot {
  const customRaw = window.localStorage.getItem(STORAGE_KEY);
  let customParsed: unknown = null;
  try {
    customParsed = customRaw ? JSON.parse(customRaw) : null;
  } catch (e) {
    customParsed = { _parseError: String(e) };
  }
  const deletedRaw = window.localStorage.getItem(DELETED_SEED_KEY);
  let deletedParsed: string[] | null = null;
  try {
    const parsed = deletedRaw ? JSON.parse(deletedRaw) : null;
    deletedParsed = Array.isArray(parsed)
      ? parsed.filter((x): x is string => typeof x === "string")
      : null;
  } catch {
    deletedParsed = null;
  }
  const visible = listCompanies().map((c) => ({
    id: c.id,
    name: c.name,
    // Seeds aren't in CONNECT_COMPANIES anymore, so anything here that's a seed id
    // has come through DELETED_SEED_KEY not being honored OR custom storage.
    isSeed: (SEED_IDS as readonly string[]).includes(c.id),
  }));
  return {
    customRaw,
    customParsed,
    deletedRaw,
    deletedParsed,
    migrationFlag: window.localStorage.getItem(MIGRATION_KEY),
    activeCompanyId: window.localStorage.getItem("connect.activeCompanyId"),
    visibleCompanies: visible,
  };
}

export const Route = createFileRoute("/_authed/settings/diagnose-companies")({
  component: RouteComponent,
});

function RouteComponent() {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const refresh = useCallback(() => {
    setSnap(readSnapshot());
  }, []);

  useEffect(() => {
    refresh();
    return subscribeCompanies(refresh);
  }, [refresh]);

  const showFlash = (msg: string) => {
    setFlash(msg);
    window.setTimeout(() => setFlash(null), 2200);
  };

  /** Add the four seed ids to DELETED_SEED_KEY — this is the surgical fix. */
  const deleteSeeds = () => {
    try {
      const current = new Set<string>(
        snap?.deletedParsed ?? JSON.parse(window.localStorage.getItem(DELETED_SEED_KEY) || "[]"),
      );
      for (const id of SEED_IDS) current.add(id);
      window.localStorage.setItem(
        DELETED_SEED_KEY,
        JSON.stringify([...current]),
      );
      // If active points at a seed, drop it so the UI doesn't dangle.
      const active = window.localStorage.getItem("connect.activeCompanyId");
      if (active && (SEED_IDS as readonly string[]).includes(active)) {
        const fallback = listCompanies()
          .filter((c) => !(SEED_IDS as readonly string[]).includes(c.id))[0]?.id ?? "";
        window.localStorage.setItem("connect.activeCompanyId", fallback);
      }
      window.localStorage.setItem(MIGRATION_KEY, "1");
      window.dispatchEvent(new Event("connect-companies-changed"));
      refresh();
      showFlash("Seed-IDs als gelöscht markiert.");
    } catch (e) {
      showFlash(`Fehler: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  /** Remove the company from custom storage (idempotent if not there). */
  const deleteOne = (id: string) => {
    try {
      deleteCompany(id);
      refresh();
      showFlash(`„${id}" entfernt.`);
    } catch (e) {
      showFlash(`Fehler: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  /**
   * The radical fix: remove the four seed ids from BOTH storage locations
   * (deleted-seeds and the custom list) and clear the one-shot migration
   * flag so the cleanup migration is allowed to run again on the next load.
   *
   * This is the one-click "make it stop" for users whose browser already
   * ingested the old code path and now has the four seeds baked into
   * connect.companies.custom.
   */
  const nukeSeedsAndRerunMigration = () => {
    try {
      const SEED_IDS = ["nordwind", "lumen", "helm", "pulse"];

      // 1. Ensure the four ids are in the deleted-seeds set
      const existing = new Set<string>(snap?.deletedParsed ?? []);
      for (const id of SEED_IDS) existing.add(id);
      window.localStorage.setItem(
        DELETED_SEED_KEY,
        JSON.stringify([...existing]),
      );

      // 2. Strip the four ids from connect.companies.custom
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        try {
          const parsed = JSON.parse(raw) as unknown;
          if (Array.isArray(parsed)) {
            const filtered = parsed.filter(
              (c) =>
                !c ||
                typeof c !== "object" ||
                typeof (c as { id?: unknown }).id !== "string" ||
                !SEED_IDS.includes((c as { id: string }).id),
            );
            if (filtered.length === 0) {
              window.localStorage.removeItem(STORAGE_KEY);
            } else {
              window.localStorage.setItem(
                STORAGE_KEY,
                JSON.stringify(filtered),
              );
            }
          }
        } catch {
          // corrupt JSON — wipe so the four definitely cannot resurface
          window.localStorage.removeItem(STORAGE_KEY);
        }
      }

      // 3. Drop a stale active pointer at one of the four
      const active = window.localStorage.getItem("connect.activeCompanyId");
      if (active && SEED_IDS.includes(active)) {
        window.localStorage.removeItem("connect.activeCompanyId");
      }

      // 4. Clear the migration flag so the inline migration is allowed to
      //    re-run on the next page load (defensive — keeps the system idempotent).
      window.localStorage.removeItem("helium:v2-cleared-default-companies");

      // 5. Force every listener to re-read storage
      window.dispatchEvent(new Event("connect-companies-changed"));
      window.dispatchEvent(new Event("connect-active-company"));

      refresh();
      showFlash("Nordwind, Lumen, Helm & Pulse sind raus. Seite neu laden, fertig.");
    } catch (e) {
      showFlash(`Fehler: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  /** Wipe ALL custom companies. Seeds are protected by DELETED_SEED_KEY. */
  const wipeAllCustom = () => {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
      window.dispatchEvent(new Event("connect-companies-changed"));
      refresh();
      showFlash("Alle Custom-Unternehmen gelöscht.");
    } catch (e) {
      showFlash(`Fehler: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  if (!snap) {
    return (
      <div className="min-h-svh bg-[#0e0e10] p-6 text-white">
        <p className="text-sm text-white/55">Lade localStorage …</p>
      </div>
    );
  }

  const seedStillVisible = snap.visibleCompanies.filter((c) => c.isSeed);

  return (
    <div className="min-h-svh bg-[#0e0e10] px-5 py-6 text-white antialiased">
      <div className="mx-auto flex max-w-[640px] flex-col gap-6">
        {/* Back */}
        <div className="flex items-center gap-2">
          <Button
            render={(props) => (
              <Link {...props} to="/settings">
                <IconArrowLeft className="mr-1 size-4" />
                Zurück zu Einstellungen
              </Link>
            )}
            size="sm"
            type="button"
            variant="ghost"
            className="border border-white/10 text-[#888] hover:border-white/20 hover:text-white"
          />
        </div>

        {/* Header */}
        <header>
          <h1 className="text-xl font-semibold">Unternehmen — Diagnose</h1>
          <p className="mt-1 text-sm text-white/55">
            Zeigt, was Connect tatsächlich aus deinem Browser-Speicher liest
            und erlaubt, die vier Standard-Unternehmen endgültig zu entfernen.
          </p>
        </header>

        {/* Flash */}
        {flash && (
          <div
            className="flex items-center gap-2 rounded-xl bg-emerald-500/15 px-4 py-2 text-sm text-emerald-300"
            role="status"
          >
            <IconCircleCheck className="size-4" />
            {flash}
          </div>
        )}

        {/* Visible companies */}
        <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white">
              Was Connect sieht ({snap.visibleCompanies.length})
            </h2>
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[11px]",
                seedStillVisible.length === 0
                  ? "bg-emerald-500/20 text-emerald-300"
                  : "bg-red-500/20 text-red-300",
              )}
            >
              {seedStillVisible.length === 0
                ? "✓ keine Seeds sichtbar"
                : `${seedStillVisible.length} Seed(s) noch sichtbar`}
            </span>
          </div>
          {snap.visibleCompanies.length === 0 ? (
            <p className="text-sm text-white/40">Keine Unternehmen vorhanden.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {snap.visibleCompanies.map((c) => (
                <li
                  className={cn(
                    "flex items-center justify-between rounded-xl border px-3 py-2",
                    c.isSeed
                      ? "border-red-500/30 bg-red-500/[0.07]"
                      : "border-white/10 bg-white/[0.04]",
                  )}
                  key={c.id}
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{c.name}</p>
                    <p className="text-[11px] text-white/40">
                      ID: <code>{c.id}</code>
                      {c.isSeed && (
                        <span className="ml-2 text-red-300">· Seed</span>
                      )}
                    </p>
                  </div>
                  <Button
                    onClick={() => deleteOne(c.id)}
                    size="sm"
                    type="button"
                    variant="ghost"
                    className="border border-white/10 text-red-300 hover:border-red-500/50 hover:text-red-200"
                  >
                    <IconTrash className="mr-1 size-3.5" />
                    Entfernen
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Seed fix */}
        {seedStillVisible.length > 0 && (
          <section className="rounded-2xl border border-red-500/30 bg-red-500/[0.05] p-4">
            <div className="mb-3 flex items-start gap-3">
              <IconAlertTriangle className="mt-0.5 size-5 shrink-0 text-red-300" />
              <div>
                <h2 className="text-sm font-semibold text-red-200">
                  {seedStillVisible.length} Seed-Unternehmen noch sichtbar
                </h2>
                <p className="mt-1 text-[13px] text-white/65">
                  Diese sind nicht im Code-Katalog, sondern liegen in deinem
                  localStorage (in <code>connect.companies.custom</code> oder
                  sind nicht in <code>connect.companies.deleted</code>{" "}
                  eingetragen). Klick unten, um sie endgültig zu markieren.
                </p>
              </div>
            </div>
            <Button
              onClick={deleteSeeds}
              type="button"
              variant="destructive"
              className="w-full"
            >
              <IconTrash className="mr-2 size-4" />
              {`Nordwind, Lumen, Helm & Pulse endgültig entfernen`}
            </Button>
            <Button
              className="mt-2 w-full border-red-500/30 text-red-200 hover:border-red-500/60 hover:text-red-100"
              onClick={nukeSeedsAndRerunMigration}
              type="button"
              variant="outline"
            >
              <IconAlertTriangle className="mr-2 size-4" />
              {`HART: Aus dem Speicher kratzen (ein Klick, kein Neuladen nötig)`}
            </Button>
          </section>
        )}

        {/* Raw state */}
        <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <h2 className="mb-3 text-sm font-semibold text-white">
            Roh-Zustand des Speichers
          </h2>
          <dl className="grid grid-cols-1 gap-3 text-[12px]">
            <KV
                label="Migration-Flag (helium:v2-cleared-default-companies)"
                value={snap.migrationFlag ?? "—"}
                ok={snap.migrationFlag === "1"}
              />
            <KV
                label="connect.companies.deleted"
                value={
                  snap.deletedParsed
                    ? snap.deletedParsed.length === 0
                      ? "[]"
                      : snap.deletedParsed.join(", ")
                    : snap.deletedRaw
                      ? "(parse-fehler)"
                      : "—"
                }
                ok={
                  !!snap.deletedParsed &&
                  SEED_IDS.every((id) => snap.deletedParsed!.includes(id))
                }
              />
            <KV
                label="connect.companies.custom"
                value={
                  snap.customParsed
                    ? Array.isArray(snap.customParsed)
                      ? `${snap.customParsed.length} Eintrag/Einträge`
                      : JSON.stringify(snap.customParsed)
                    : "—"
                }
                ok={snap.customParsed === null}
              />
            <KV
                label="connect.activeCompanyId"
                value={snap.activeCompanyId ?? "—"}
                ok={
                  !snap.activeCompanyId ||
                  !(SEED_IDS as readonly string[]).includes(snap.activeCompanyId)
                }
              />
          </dl>
        </section>

        {/* Danger zone */}
        <section className="rounded-2xl border border-red-500/20 bg-red-500/[0.04] p-4">
          <h2 className="mb-1 text-sm font-semibold text-red-200">
            Gefahrenzone
          </h2>
          <p className="mb-3 text-[12px] text-white/55">
            Entfernt <code>connect.companies.custom</code> komplett. Seed-Unternehmen
            werden dadurch <strong>nicht</strong> zurückkommen, weil der Katalog
            in v0.0.4 leer ist.
          </p>
          <Button
            onClick={wipeAllCustom}
            type="button"
            variant="outline"
            className="w-full border-red-500/30 text-red-300 hover:border-red-500/60 hover:text-red-200"
          >
            <IconTrash className="mr-2 size-4" />
            Alle Custom-Unternehmen löschen
          </Button>
        </section>
      </div>
    </div>
  );
}

function KV({
  label,
  value,
  ok,
}: {
  label: string;
  value: string;
  ok?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-white/[0.05] pb-2 last:border-b-0 last:pb-0">
      <dt className="text-white/55">{label}</dt>
      <dd className="flex items-center gap-2 text-right">
        <code className="break-all text-white/85">{value}</code>
        {ok !== undefined && (
          <span
            aria-label={ok ? "OK" : "Problem"}
            className={cn(
              "size-2 shrink-0 rounded-full",
              ok ? "bg-emerald-400" : "bg-red-400",
            )}
            title={ok ? "OK" : "Problem"}
          />
        )}
      </dd>
    </div>
  );
}