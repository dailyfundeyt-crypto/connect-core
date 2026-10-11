import { IconFolder, IconPlus, IconTrash } from "@tabler/icons-react";
import { useEffect, useMemo, useState } from "react";
import { SettingsSectionHeader } from "@/components/settings/settings-section-header";
import { Button } from "@/components/ui/button";
import {
  allLabApps,
  createTabGroup,
  deleteTabGroup,
  getLevel3Browser,
  listLevel3CompanyIds,
  normalizeGroups,
  renameTabGroup,
  subscribeLevel3Browser,
} from "@/lib/companies/level3-tools";
import { getCompany } from "@/lib/companies/store";
import { cn } from "@/lib/utils";

const ACTIVE_COMPANY_KEY = "connect.activeCompanyId";

function readActiveCompanyId(): string | null {
  try {
    const raw = window.localStorage.getItem(ACTIVE_COMPANY_KEY);
    if (!raw) return null;
    return raw.startsWith('"') ? (JSON.parse(raw) as string) : raw;
  } catch {
    return null;
  }
}

/**
 * Einstellungen › Browser-Gruppen (helium-mobile4).
 *
 * Vorher zeigten "Browser-Gruppen", "Apple-Dot Verhalten" und die Kachel-Chips auf den
 * Hash `#browser-groups`, für den es kein Panel gab – auf dem Handy öffnete sich eine
 * leere Seite. Jetzt: die Gruppen der Lab-Links pro Unternehmen, umbenennen, anlegen,
 * löschen (die Links selbst bleiben erhalten). Dieselben Daten wie die Browser-Seite.
 */
export function BrowserGroupsPanel() {
  const [tick, setTick] = useState(0);
  useEffect(() => subscribeLevel3Browser(() => setTick((t) => t + 1)), []);

  const companyIds = useMemo(() => {
    void tick;
    const ids = listLevel3CompanyIds();
    const active = readActiveCompanyId();
    if (active && !ids.includes(active)) ids.unshift(active);
    return ids;
  }, [tick]);

  const [companyId, setCompanyId] = useState<string | null>(
    () => readActiveCompanyId() ?? listLevel3CompanyIds()[0] ?? null,
  );
  const [newName, setNewName] = useState("");

  const state = useMemo(() => {
    void tick;
    return companyId ? getLevel3Browser(companyId) : null;
  }, [companyId, tick]);

  const groups = state ? normalizeGroups(state.tabGroups) : [];
  const apps = state ? allLabApps(state) : [];
  const appLabel = (id: string) => apps.find((a) => a.id === id)?.label ?? null;

  return (
    <>
      <SettingsSectionHeader
        description="Ordner für deine Browser-Links – dieselben Gruppen wie auf der Browser-Seite und in Helium."
        title="Browser-Gruppen"
      />

      {companyIds.length > 1 ? (
        <div className="mb-4 flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none]">
          {companyIds.map((id) => (
            <button
              className={cn(
                "shrink-0 rounded-full border px-3 py-1.5 text-[13px] transition-colors",
                id === companyId
                  ? "border-sky-400/50 bg-sky-400/15 text-sky-200"
                  : "border-border text-muted-foreground hover:text-foreground",
              )}
              key={id}
              onClick={() => setCompanyId(id)}
              type="button"
            >
              {getCompany(id)?.name ?? id}
            </button>
          ))}
        </div>
      ) : null}

      {!companyId ? (
        <p className="text-muted-foreground text-sm">Noch kein Unternehmen mit Browser-Links.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {groups.length === 0 ? (
            <p className="rounded-xl border border-border px-4 py-3 text-muted-foreground text-sm">
              Noch keine Gruppen. Lege unten eine an.
            </p>
          ) : (
            groups.map((group) => {
              const labels = group.appIds.map(appLabel).filter(Boolean) as string[];
              return (
                <div
                  className="flex items-center gap-3 rounded-xl border border-border bg-card/60 px-3 py-2.5"
                  key={group.id}
                >
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-white/[0.06] text-sky-300">
                    <IconFolder className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <input
                      aria-label="Gruppenname"
                      className="w-full bg-transparent text-[15px] font-medium outline-none"
                      defaultValue={group.label}
                      key={`${group.id}:${group.label}`}
                      onBlur={(e) => {
                        if (e.target.value.trim() && e.target.value !== group.label) {
                          renameTabGroup(companyId, group.id, e.target.value);
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                      }}
                    />
                    <p className="truncate text-muted-foreground text-xs">
                      {labels.length === 0
                        ? "leer"
                        : `${labels.length} ${labels.length === 1 ? "Link" : "Links"} · ${labels.join(", ")}`}
                    </p>
                  </div>
                  <Button
                    aria-label={`Gruppe ${group.label} löschen`}
                    className="text-muted-foreground"
                    onClick={() => {
                      if (window.confirm(`Gruppe „${group.label}“ löschen? Die Links bleiben erhalten.`)) {
                        deleteTabGroup(companyId, group.id);
                      }
                    }}
                    size="icon"
                    type="button"
                    variant="ghost"
                  >
                    <IconTrash className="size-4" />
                  </Button>
                </div>
              );
            })
          )}
          <form
            className="mt-2 flex items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (!newName.trim()) return;
              createTabGroup(companyId, newName);
              setNewName("");
            }}
          >
            <input
              className="h-10 min-w-0 flex-1 rounded-xl border border-border bg-transparent px-3 text-[16px] outline-none placeholder:text-muted-foreground focus:border-sky-400/50 md:text-sm"
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Neue Gruppe"
              value={newName}
            />
            <Button disabled={!newName.trim()} type="submit" variant="outline">
              <IconPlus className="mr-1 size-4" />
              Anlegen
            </Button>
          </form>
        </div>
      )}
    </>
  );
}
