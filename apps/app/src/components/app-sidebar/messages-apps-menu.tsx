import { IconApps, IconCheck, IconCode, IconCopy } from "@tabler/icons-react";
import { useEffect, useMemo, useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar";
import {
  COMPANY_APP_OPEN_EVENT,
  COMPANY_APP_SELECTION_KEY,
  listCompanyApps,
  type LoadedCompanyApp,
} from "@/company-apps/registry";
import { useCompanySwitcher } from "@/components/companies/company-switcher";
import { useMarketListings } from "@/lib/market/catalog";

const integrationPrompt = `Integriere meine App als eigenständiges Connect-Modul in Messages.

Lege sie unter apps/app/src/company-apps/modules/<app-id>/ ab und registriere sie über manifest.ts und app.tsx. Nutze den CompanyAppProps-Vertrag aus ../../types, kapsle App-Daten in einem eigenen Namensraum und bette die vollständige bestehende App ein, statt sie neu zu bauen oder durch ein Dashboard-Mockup zu ersetzen. Ergänze Name und Beschreibung im Manifest. Die Connect-App-Auswahl erkennt neue Module automatisch.

Arbeite nur an dieser App-Integration. Ändere nicht die Connect-Agenten, Gruppen, Sidebar-Reihenfolge oder andere Company-Module. Prüfe am Ende TypeScript und den Apps-Build und nenne die geänderten Dateien.`;

const AUTO_START_FLAG = "connect.messages.autoStartFired";

/**
 * Apps-Menü in der Connect-Sidebar (im Footer).
 *
 * Welche Apps hier auftauchen, hängt jetzt von der aktiven Company ab:
 * Eine App ist in der Sidebar sichtbar, wenn ihr Market-Listing die aktive
 * Company-ID in `availableInCompanyIds` führt. Apps ohne Listing (z. B.
 * Stock-Apps, die noch nicht im Market sind) bleiben sichtbar.
 *
 * Apps, die im Market als Auto-Start für die aktive Company markiert sind,
 * werden beim Wechsel in die Company einmal automatisch geöffnet.
 */
export function MessagesAppsMenu() {
  const [promptOpen, setPromptOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const stockApps = listCompanyApps();
  const { listings } = useMarketListings();
  const { active: activeCompany } = useCompanySwitcher();
  const activeCompanyId = activeCompany?.id ?? null;

  /**
   * Tools, die in der aktiven Company sichtbar sind.
   *
   *   • Hat das Tool ein Market-Listing und der Eintrag enthält die aktive
   *     Company-ID in `availableInCompanyIds` → sichtbar.
   *   • Hat es kein Listing (Stock-Tool, z. B. interne Module) → sichtbar.
   *   • Hat es ein Listing, ist die Company aber nicht freigeschaltet →
   *     ausgeblendet. Der User kann es in /settings#company-tools oder im
   *     Market freischalten.
   */
  const apps = useMemo(() => {
    if (!activeCompanyId) return stockApps;
    return stockApps.filter((app) => {
      const listing = listings.find((l) => l.id === app.manifest.id);
      if (!listing) return true;
      return listing.availableInCompanyIds.includes(activeCompanyId);
    });
  }, [stockApps, listings, activeCompanyId]);

  /**
   * Auto-Start: Tools, die in der aktiven Company auf Auto-Start stehen,
   * werden beim Wechsel in die Company einmal geöffnet — und beim
   * Verlassen der Company wieder geschlossen.
   *
   * Die Markierung „schon gefeuert" wird pro Company im localStorage
   * gehalten, damit das Menü nicht bei jedem Re-Render erneut aufploppt.
   */
  useEffect(() => {
    if (!activeCompanyId) return;
    const firedRaw = window.localStorage.getItem(AUTO_START_FLAG);
    const fired: Record<string, string> = firedRaw ? JSON.parse(firedRaw) : {};
    const lastCompany = fired._lastCompany;
    if (lastCompany === activeCompanyId) return;
    fired._lastCompany = activeCompanyId;
    window.localStorage.setItem(AUTO_START_FLAG, JSON.stringify(fired));

    const autoApps = stockApps.filter((app) => {
      const listing = listings.find((l) => l.id === app.manifest.id);
      if (!listing) return false;
      return listing.availableInCompanyIds.includes(`${activeCompanyId}#auto`);
    });

    if (autoApps.length === 0) return;
    const first = autoApps[0];
    try {
      window.localStorage.setItem(COMPANY_APP_SELECTION_KEY, first.manifest.id);
    } catch {
      // ignore
    }
    window.dispatchEvent(
      new CustomEvent(COMPANY_APP_OPEN_EVENT, { detail: { appId: first.manifest.id } }),
    );
  }, [activeCompanyId, stockApps, listings]);

  const openApp = (appId: string) => {
    try {
      window.localStorage.setItem(COMPANY_APP_SELECTION_KEY, appId);
    } catch {
      // ignore
    }
    window.dispatchEvent(
      new CustomEvent(COMPANY_APP_OPEN_EVENT, { detail: { appId } }),
    );
  };

  const copyPrompt = async () => {
    await navigator.clipboard.writeText(integrationPrompt);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  return (
    <>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <SidebarMenuButton
                className="h-10 rounded-xl hover:bg-sidebar-accent"
                tooltip="Tools öffnen"
              />
            }
          >
            <IconApps className="size-4" />
            <span>Tools</span>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            className="min-w-60 rounded-xl p-1.5"
            side="top"
            sideOffset={8}
          >
            <DropdownMenuLabel>
              {activeCompany
                ? `Tools in ${activeCompany.name}`
                : "Tools"}
            </DropdownMenuLabel>
            {apps.length === 0 ? (
              <div className="px-2 py-3 text-xs text-muted-foreground">
                Keine Tools in dieser Firma. Aktiviere sie unter{" "}
                <span className="text-foreground">Einstellungen → Unternehmen → Tools pro Firma</span>{" "}
                oder im Marketplace.
              </div>
            ) : (
              apps.map(({ manifest }: LoadedCompanyApp) => (
                <DropdownMenuItem
                  key={manifest.id}
                  onClick={() => openApp(manifest.id)}
                >
                  <span className="min-w-0 flex-1 truncate">
                    {manifest.name ?? manifest.id}
                  </span>
                </DropdownMenuItem>
              ))
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setPromptOpen(true)}>
              <IconCode className="size-4" />
              Eigene App integrieren
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>

      <Dialog open={promptOpen} onOpenChange={setPromptOpen}>
        <DialogContent
          className="max-w-xl"
          closeLabel="Schließen"
          overlayClassName="bg-black/25 supports-backdrop-filter:backdrop-blur-none"
        >
          <DialogHeader>
            <DialogTitle>Eigenes Tool integrieren</DialogTitle>
            <DialogDescription>
              Kopiere diesen Auftrag in Cursor oder eine andere Coding-AI. Das
              Tool wird als Modul gebaut und mit Connect ausgeliefert.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <textarea
              aria-label="Prompt für die App-Integration"
              className="min-h-52 w-full resize-y rounded-lg border border-border bg-muted/40 p-3 font-mono text-xs leading-relaxed text-foreground outline-none"
              readOnly
              value={integrationPrompt}
            />
          </DialogBody>
          <DialogFooter>
            <Button onClick={() => void copyPrompt()}>
              {copied ? <IconCheck /> : <IconCopy />}
              {copied ? "Kopiert" : "Prompt kopieren"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
