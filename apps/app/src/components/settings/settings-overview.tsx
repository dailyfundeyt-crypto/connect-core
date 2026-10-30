/**
 * Settings landing page — 7-group card grid matching Grok Bot design system.
 */
import {
  IconBuildingStore,
  IconCpu,
  IconInfoCircle,
  IconPalette,
  IconPlugConnected,
  IconRobot,
  IconSearch,
  IconShieldLock,
  IconUser,
} from "@tabler/icons-react";
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

type Section = {
  id: string;
  icon: React.ComponentType<{ className?: string }>;
  accent: string;
  title: string;
  description: string;
  chips: { title: string; hash?: string; to?: string }[];
};

const SECTIONS: Section[] = [
  {
    id: "konto",
    icon: IconUser,
    accent: "#60a5fa",
    title: "Konto",
    description: "Profilname, Avatar und Sitzungsabmeldung.",
    chips: [
      { title: "Profil & Name", hash: "konto" },
      { title: "Abmelden", to: "/sign" },
    ],
  },
  {
    id: "unternehmen",
    icon: IconBuildingStore,
    accent: "#38bdf8",
    title: "Unternehmen",
    description: "Multi-Company Profile, Workspace-Tools und Browser-Gruppen.",
    chips: [
      { title: "Firmenprofile", to: "/settings/companies" },
      { title: "Tools pro Firma", hash: "company-tools" },
      { title: "Sidebar-Tools", hash: "sidebar-tools" },
      { title: "Browser-Gruppen", hash: "browser-groups" },
    ],
  },
  {
    id: "agenten",
    icon: IconRobot,
    accent: "#a78bfa",
    title: "Agenten",
    description: "Standing Instructions, Fokus-Kette und Sprachausgabe.",
    chips: [
      { title: "Standing Instructions", hash: "standing-instructions" },
      { title: "Fokus-Kette", hash: "fokus" },
      { title: "Voice & Keyring", hash: "voice" },
      { title: "Desktop-Steuerung & Sicherheit", hash: "desktop-control" },
    ],
  },
  {
    id: "modelle",
    icon: IconCpu,
    accent: "#34d399",
    title: "Modelle & CLIs",
    description: "API-Keys, Model-Provider, lokale CLIs und Token-Budgets.",
    chips: [
      { title: "Globale API-Keys", hash: "api-keys" },
      { title: "Modell-Provider", hash: "model-provider" },
      { title: "Anbieter-CLIs", hash: "cli-providers" },
      { title: "Model One", hash: "model-one" },
      { title: "Codex-Nutzung", hash: "codex-usage" },
    ],
  },
  {
    id: "integrationen",
    icon: IconPlugConnected,
    accent: "#fb923c",
    title: "Integrationen & MCP",
    description: "MCP-Server, Handy-Tunnel, Helium-Brücke und Google Drive Sync.",
    chips: [
      { title: "MCP-Server", hash: "mcp" },
      { title: "Connector-Mapping", hash: "connector-mapping" },
      { title: "Handy verbinden", hash: "handy-verbinden" },
      { title: "Mein Helium", hash: "mein-helium" },
      { title: "Sync & Backup", hash: "sync-backup" },
      { title: "Kalender", hash: "calendar" },
      { title: "Ubuntu-Maschinen", hash: "ubuntu-machines" },
    ],
  },
  {
    id: "darstellung",
    icon: IconPalette,
    accent: "#f472b6",
    title: "Darstellung",
    description: "Farbmodus (Hell/Dunkel) und Tastatur-Kurzbefehle.",
    chips: [
      { title: "Farbmodus", hash: "appearance" },
      { title: "Tastatur-Shortcuts", hash: "shortcuts" },
    ],
  },
  {
    id: "sicherheit",
    icon: IconShieldLock,
    accent: "#94a3b8",
    title: "Sicherheit & System",
    description: "Deployment-Modus, Lab-Session, Quota und Systeminfo.",
    chips: [
      { title: "Deployment Mode", hash: "deployment-mode" },
      { title: "Erweitert & Lab", hash: "erweitert" },
      { title: "Über & Info", hash: "uber" },
    ],
  },
];

export function SettingsOverview() {
  const [query, setQuery] = useState("");

  const filtered = query.trim()
    ? SECTIONS.map((s) => ({
        ...s,
        chips: s.chips.filter((c) =>
          c.title.toLowerCase().includes(query.toLowerCase()),
        ),
      })).filter(
        (s) =>
          s.chips.length > 0 ||
          s.title.toLowerCase().includes(query.toLowerCase()) ||
          s.description.toLowerCase().includes(query.toLowerCase()),
      )
    : SECTIONS;

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6 md:px-6 md:py-8">
      {/* Header */}
      <div className="mb-6 flex flex-col gap-3">
        <h1 className="text-2xl font-semibold tracking-tight text-[#1c1b19] dark:text-[#ededef]">
          Einstellungen
        </h1>
        <p className="text-sm text-[#6b6862] dark:text-[#a1a1aa]">
          Verwalte deine Kontoeinstellungen, Unternehmensprofile, Agenten-Konfigurationen und Integrationen.
        </p>

        {/* Search */}
        <div className="relative mt-2 max-w-md">
          <IconSearch className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground/60 dark:text-[#71717a]" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Einstellungen durchsuchen…"
            className="h-10 w-full rounded-xl border border-black/[0.08] bg-white/70 pl-9 pr-4 text-sm text-[#1c1b19] outline-none transition-all placeholder:text-muted-foreground focus:border-sky-500/60 focus:ring-2 focus:ring-sky-500/20 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-[#ededef] dark:placeholder:text-[#71717a]"
          />
        </div>
      </div>

      {/* Grid of 7 Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {filtered.map((sec) => (
          <div
            key={sec.id}
            className={cn(
              "group relative flex flex-col justify-between rounded-2xl border border-black/[0.08] bg-white/60 p-5 transition-all duration-150",
              "hover:border-black/15 hover:bg-white/80 hover:shadow-sm",
              "dark:border-white/[0.08] dark:bg-[#121216] dark:hover:border-white/15 dark:hover:bg-[#16161b]",
            )}
          >
            <div>
              <div className="flex items-center gap-3">
                <div
                  className="flex size-9 items-center justify-center rounded-xl transition-transform duration-150 group-hover:scale-105"
                  style={{
                    backgroundColor: `${sec.accent}18`,
                    color: sec.accent,
                  }}
                >
                  <sec.icon className="size-5" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-[#1c1b19] dark:text-[#ededef]">
                    {sec.title}
                  </h2>
                </div>
              </div>
              <p className="mt-2.5 text-xs leading-relaxed text-[#6b6862] dark:text-[#a1a1aa]">
                {sec.description}
              </p>
            </div>

            {/* Chips */}
            <div className="mt-4 flex flex-wrap gap-1.5 pt-3 border-t border-black/[0.04] dark:border-white/[0.04]">
              {sec.chips.map((chip) =>
                chip.to ? (
                  <Link
                    key={chip.title}
                    to={chip.to}
                    className={cn(
                      "inline-flex items-center rounded-lg border border-black/[0.08] bg-black/[0.03] px-2.5 py-1 text-xs font-medium text-[#4a4741] transition-colors",
                      "hover:border-black/20 hover:bg-black/[0.06] hover:text-[#1c1b19]",
                      "dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-[#a1a1aa] dark:hover:border-sky-500/40 dark:hover:bg-sky-500/10 dark:hover:text-sky-300",
                    )}
                  >
                    {chip.title}
                  </Link>
                ) : (
                  <Link
                    key={chip.title}
                    to="/settings"
                    hash={chip.hash}
                    className={cn(
                      "inline-flex items-center rounded-lg border border-black/[0.08] bg-black/[0.03] px-2.5 py-1 text-xs font-medium text-[#4a4741] transition-colors",
                      "hover:border-black/20 hover:bg-black/[0.06] hover:text-[#1c1b19]",
                      "dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-[#a1a1aa] dark:hover:border-sky-500/40 dark:hover:bg-sky-500/10 dark:hover:text-sky-300",
                    )}
                  >
                    {chip.title}
                  </Link>
                ),
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
