import { createFileRoute, Outlet } from "@tanstack/react-router";
import { MobilePageFrame } from "@/components/mobile/mobile-page-frame";
import { useMobileShell } from "@/lib/mobile/use-mobile-shell";

export const Route = createFileRoute("/_authed/settings")({
  component: RouteComponent,
});

/**
 * Layout parent — no visual chrome.
 * - /settings/ renders the self-contained minimalist page (no sidebar)
 * - /settings/brain, /settings/mcp render their own PageShell with the sidebar
 */
function RouteComponent() {
  // helium-mobilefix: auf dem Handy jede Einstellungen-Seite im mobilen Vollbild-Rahmen
  // (Zurueck + Titel, keine PC-Seitenleiste). Die Uebersicht hat ihre eigene Kopfzeile.
  const mobileShell = useMobileShell();
  if (mobileShell) {
    return (
      <MobilePageFrame>
        <Outlet />
      </MobilePageFrame>
    );
  }
  return <Outlet />;
}
