/**
 * Connect-Route: /firmenprofil
 *
 * Direkt-URL-Fallback für Nutzer, die /firmenprofil manuell aufrufen oder
 * über alte Bookmarks kommen. Im neuen Flow öffnet der Company-Switcher
 * täglich als rechtes Panel im Messages-Workspace (siehe
 * company-apps/modules/dailyfun/manifest.ts), NICHT mehr als Top-Level-Route.
 *
 * Hier rendern wir täglich als Vollbild-Seite mit eigener AppSidebar.
 * Connect's linke AppSidebar wird über den firmenprofilMode-Schalter in
 * routes/_authed/_app.tsx ausgeblendet, damit täglich die volle Breite
 * bekommt.
 */
import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { z } from "zod";
import { SidebarToggleBar } from "@/components/layout/sidebar-toggle";

const DailyfunPageApp = lazy(async () => {
  const mod = await import("../../../dailyfun/ConnectApp");
  return { default: mod.DailyfunPageApp };
});

const searchSchema = z.object({
  /** Welche Connect-Company das dailyfun-Profil zeigt (Legacy). */
  as: z.string().optional().catch(undefined),
});

export const Route = createFileRoute("/_authed/_app/firmenprofil")({
  validateSearch: searchSchema,
  component: FirmenprofilWorkspace,
});

function FirmenprofilWorkspace() {
  return (
    <>
      <SidebarToggleBar />
      <Suspense
        fallback={
          <div className="flex h-full items-center justify-center bg-background text-foreground">
            <p className="text-sm text-muted-foreground">Firmenprofil wird geladen…</p>
          </div>
        }
      >
        <DailyfunPageApp />
      </Suspense>
    </>
  );
}
