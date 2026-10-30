import { IconChevronLeft } from "@tabler/icons-react";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { type ReactNode, useEffect } from "react";
import { SidebarProvider } from "@/components/ui/sidebar";
import "./mobile-page-frame.css";

/**
 * Handy-Rahmen fuer alle Seiten AUSSERHALB von "/" und "/channel/…" (helium-mobilefix, 17.10.2026).
 *
 * Vorher fiel das Handy auf jeder anderen Route (Neue Firma, Firmenprofil, Firmen verwalten,
 * Einstellungen-Unterseiten, Agenten, Brain …) ins Desktop-Layout: `SidebarShell` +
 * `LevelChromeSidebar`/`AppSidebar`, die unter 768px als Sheet-Overlay ueber dem Inhalt aufging
 * (Spark-Logo-Menue, Websearch, GRUPPEN, PLANUNG-Baum, Nutzer unten). Jetzt: Vollbild, dunkel,
 * Zurueck-Pfeil + Titel oben, KEINE PC-Seitenleiste (die blendet `Sidebar` selbst aus, sobald
 * `useMobileShell()` greift). Der PC (kein Touch / breiter als 767px) sieht diesen Rahmen nie.
 *
 * Seiten mit eigener Handy-Kopfzeile (mobiles Firmenprofil, Einstellungen-Uebersicht oder
 * `data-mobile-own-header`) blenden die Rahmen-Kopfzeile per CSS (:has) aus.
 */

const MOBILE_BG = "#07080c";

const TITLES: Array<[RegExp, string]> = [
  [/^\/social/, "Connect Sozial"],
  [/^\/company\/new\/?$/, "Neue Firma"],
  [/^\/company\//, "Unternehmen"],
  [/^\/settings\/brain/, "Brain"],
  [/^\/settings\/mcp/, "MCP-Server"],
  [/^\/settings\/connected-accounts/, "Verbundene Konten"],
  [/^\/settings\/diagnose/, "Diagnose"],
  [/^\/settings/, "Einstellungen"],
  [/^\/agents/, "Agenten"],
  [/^\/market/, "Marktplatz"],
  [/^\/brain/, "Brain"],
  [/^\/routines/, "Routinen"],
  [/^\/skills/, "Skills"],
  [/^\/bot/, "Bot"],
  [/^\/swarm/, "Swarm"],
];

export function mobilePageTitle(pathname: string): string {
  for (const [pattern, title] of TITLES) if (pattern.test(pathname)) return title;
  return "Connect";
}

/** Dunkler Seiten-/Statusleistenhintergrund, solange der Rahmen offen ist (wie MobileShell). */
function useMobileFrameChrome() {
  useEffect(() => {
    const html = document.documentElement;
    const previousBg = html.style.backgroundColor;
    const previousScheme = html.style.colorScheme;
    html.style.backgroundColor = MOBILE_BG;
    html.style.colorScheme = "dark";
    const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    const previousTheme = meta?.content;
    if (meta) meta.content = MOBILE_BG;
    return () => {
      html.style.backgroundColor = previousBg;
      html.style.colorScheme = previousScheme;
      if (meta && previousTheme !== undefined) meta.content = previousTheme;
    };
  }, []);
}

const noop = () => undefined;

export function MobilePageFrame({ children, title }: { children: ReactNode; title?: string }) {
  const location = useLocation();
  const navigate = useNavigate();
  useMobileFrameChrome();
  const heading = title ?? mobilePageTitle(location.pathname);
  const back = () => {
    if (window.history.length > 1) window.history.back();
    else void navigate({ to: "/" });
  };
  return (
    /*
     * Eigener SidebarProvider (immer zu): Seiten im Rahmen rufen weiter useSidebar()/SidebarToggle
     * auf und duerfen nicht ohne Provider abstuerzen. Gezeichnet wird keine Seitenleiste.
     */
    <SidebarProvider className="!min-h-0" onOpenChange={noop} open={false}>
      <div
        className="dark connect-mobile-frame flex h-svh w-full flex-col overflow-hidden bg-background text-foreground antialiased"
        data-testid="mobile-page-frame"
        style={{ backgroundColor: MOBILE_BG }}
      >
        <header className="connect-mobile-frame-header z-30 flex shrink-0 items-center gap-1 border-b border-white/[0.06] bg-[#07080c]/90 px-2 pb-1.5 pt-[max(0.5rem,env(safe-area-inset-top))] backdrop-blur-xl">
          <button
            aria-label="Zurück"
            className="flex size-10 shrink-0 items-center justify-center rounded-full text-white active:bg-white/10"
            data-testid="mobile-page-back"
            onClick={back}
            type="button"
          >
            <IconChevronLeft className="size-6" />
          </button>
          <p className="min-w-0 flex-1 truncate text-[17px] font-semibold text-white">{heading}</p>
        </header>
        <div className="connect-mobile-frame-body flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden pb-[env(safe-area-inset-bottom)]">
          {children}
        </div>
      </div>
    </SidebarProvider>
  );
}
