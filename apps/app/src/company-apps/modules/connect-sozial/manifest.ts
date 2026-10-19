import type { CompanyAppManifest } from "../../types";

/**
 * Connect Sozial — die 1:1 aus https://github.com/dailyfundeyt-crypto/dailyfun
 * übernommene Social-Media-Plattform. Im Connect-Workspace öffnet sie sich
 * als rechtes Panel neben den Agents.
 *
 *   • Ordner: `apps/app/src/company-apps/modules/connect-sozial/`
 *   • Original-Repo: `apps/app/src/dailyfun/` (1:1 importiert)
 *   • Anzeigename: „Connect Sozial"
 *
 * `companyHandles` fehlt absichtlich: Connect Sozial ist nicht an eine
 * einzelne Connect-Company gebunden, sondern im Company-Switcher als
 * „Connect Sozial"-Eintrag für jede aktive Company erreichbar.
 */
export const manifest = {
  id: "connect-sozial",
  name: "Connect Sozial",
  description: "Social-Media-Feed mit Artikeln, AI und Follower-Profilen",
  theme: "light",
} satisfies CompanyAppManifest;
