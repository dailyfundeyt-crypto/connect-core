/**
 * Connect Sozial — Connect-Wrapper für die dailyfun-App
 * (https://github.com/dailyfundeyt-crypto/dailyfun).
 *
 * 1:1 aus dem dailyfun-Repo übernommen (pages, components, contexts, hooks,
 * lib, utils, integrations) — jede Datei steht unverändert in
 * `apps/app/src/dailyfun/`. Was hier passiert, ist nur das, was Connect
 * drumherum braucht:
 *   • MemoryRouter (kein BrowserRouter), damit Connect-Sozial-interne
 *     Routen (`/`, `/profile/:userId`, `/messages`, …) Connect's
 *     TanStack-Router nicht in die Quere kommen — Connect-URL bleibt
 *     stabil.
 *   • Connect-Sozial-Sidebar (`AppSidebar`) ist die linke Spalte innerhalb
 *     des CompanyAppWorkspace, daneben kommt der Inhalt. Connect's
 *     AppSidebar bleibt eine separate Spalte links daneben (im `_app.tsx`
 *     Layout).
 */
import { lazy, Suspense } from "react";
import type { CompanyAppProps } from "../../types";

/**
 * Connect Sozial: komplette dailyfun-App mit MemoryRouter, AppSidebar,
 * Header (für Navigation) und allen Routen aus dem Original-Repo. Wird aus
 * `apps/app/src/dailyfun/ConnectApp.tsx` importiert und hier nur noch in
 * den CompanyAppWorkspace-Rahmen eingehängt.
 *
 * Der Modul-Name im Manifest ist `connect-sozial` (siehe manifest.ts), die
 * darunter liegende dailyfun-Implementierung behält aber ihren Namen, weil
 * die Imports innerhalb des dailyfun-Codes (`@dailyfun/...`) an den Pfad
 * `apps/app/src/dailyfun/` gebunden sind.
 */
const ConnectSozialApp = lazy(
  () => import("../../../dailyfun/ConnectApp"),
);

export default function ConnectSozialCompanyApp(_props: CompanyAppProps) {
  return (
    <div
      className="connect-sozial-company-app flex h-full min-h-0 w-full flex-1 overflow-hidden bg-background text-foreground"
      data-connect-sozial-company-app="true"
    >
      <Suspense
        fallback={
          <div className="flex h-full items-center justify-center bg-background text-foreground">
            <p className="text-sm text-muted-foreground">Connect Sozial wird geladen…</p>
          </div>
        }
      >
        <ConnectSozialApp />
      </Suspense>
    </div>
  );
}
