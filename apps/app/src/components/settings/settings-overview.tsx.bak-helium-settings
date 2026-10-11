/**
 * Settings landing page — the first thing the user sees at /settings.
 *
 * 7-section card grid + search bar, matching the mobile design language
 * (dark, minimal, accessible).
 */
import {
  IconUser,
  IconPlugConnected,
  IconSettings,
  IconCloudUpload,
  IconKeyboard,
  IconShieldLock,
  IconInfoCircle,
  IconSearch,
} from "@tabler/icons-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

type Section = {
  id: string;
  icon: React.ComponentType<{ className?: string }>;
  /** Accent color from globals.css dark palette */
  accent: string;
  title: string;
  description: string;
  chips: string[];
};

const SECTIONS: Section[] = [
  {
    id: "konto",
    icon: IconUser,
    accent: "#60a5fa",
    title: "Konto & Sicherheit",
    description: "Dein Profil, aktive Sitzungen und Abmeldung verwalten.",
    chips: ["Profil", "Sitzungen", "Abmelden"],
  },
  {
    id: "konnektoren",
    icon: IconPlugConnected,
    accent: "#a78bfa",
    title: "Konnektoren",
    description: "API-Keys, Model-Anbieter, MCP-Server und Connector-Mapping.",
    chips: ["API-Keys", "Model-Provider", "MCP", "Connector-Mapping", "Browser-Gruppen", "Ubuntu-Maschinen", "Voice"],
  },
  {
    id: "ki-modelle",
    icon: IconSettings,
    accent: "#34d399",
    title: "KI-Modelle",
    description: "Standard-Agent, Modell-Auswahl und API-Provider pro Agent.",
    chips: ["Modell One", "Modell Two", "Anbieter"],
  },
  {
    id: "browser-gruppen",
    icon: IconSettings,
    accent: "#fb923c",
    title: "Browser-Gruppen",
    description: "Standard-Browser-Gruppen für neue Tabs festlegen.",
    chips: ["Gruppen", "Domains", "Apple-Dot"],
  },
  {
    id: "sync-backup",
    icon: IconCloudUpload,
    accent: "#60a5fa",
    title: "Sync & Backup",
    description: "Google-Drive-Sicherung, Cloud-Sync-Status und Wiederherstellung.",
    chips: ["Drive-Backup", "Supabase-Sync"],
  },
  {
    id: "erweitert",
    icon: IconKeyboard,
    accent: "#f472b6",
    title: "Erweitert",
    description: "Shortcuts, Deployment-Modus, Background-Agent und Codex-Nutzung.",
    chips: ["Shortcuts", "Deployment", "Background", "Codex", "Standing Instructions"],
  },
  {
    id: "info",
    icon: IconInfoCircle,
    accent: "#94a3b8",
    title: "Über & Rechtliches",
    description: "Version, Logs, Datenschutzerklärung und Nutzungsbedingungen.",
    chips: ["Version", "Feedback", "Datenschutz", "Nutzungsbedingungen"],
  },
];

function searchSections(query: string): Section[] {
  const q = query.toLowerCase().trim();
  if (!q) return SECTIONS;
  return SECTIONS.filter(
    (s) =>
      s.title.toLowerCase().includes(q) ||
      s.description.toLowerCase().includes(q) ||
      s.chips.some((c) => c.toLowerCase().includes(q)),
  );
}

export function SettingsOverview() {
  const [query, setQuery] = useState("");

  const sections = searchSections(query);

  return (
    <div className="mx-auto max-w-3xl px-6 pb-16 pt-8">
      {/* ── Page title ── */}
      <h1 className="text-2xl font-bold text-white">Einstellungen</h1>
      <p className="mt-1 text-sm text-[#666]">
        Alles an einem Ort — suchen oder wählen, was du brauchst.
      </p>

      {/* ── Search bar ── */}
      <div className="group relative mt-6">
        <IconSearch className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-[#555] transition-colors group-focus-within:text-[#888]" />
        <input
          autoComplete="off"
          className="h-11 w-full rounded-full border border-white/[0.08] bg-[#161616] pl-10 pr-4 text-sm text-white placeholder:text-[#444] transition-colors focus:border-white/[0.16] focus:outline-none focus:ring-0"
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Einstellungen durchsuchen …"
          type="search"
          value={query}
        />
      </div>

      {/* ── Card grid ── */}
      <div
        className={cn(
          "mt-6 grid gap-3",
          sections.length === 1
            ? "grid-cols-1"
            : "grid-cols-1 sm:grid-cols-2",
        )}
      >
        {sections.map((section) => {
          const Icon = section.icon;
          return (
            <a
              key={section.id}
              href={`/settings#${section.id}`}
              className={cn(
                "group relative flex flex-col gap-3 rounded-2xl border border-white/[0.07]",
                "bg-[#111] p-5 transition-all duration-150",
                "hover:border-white/[0.14] hover:bg-[#141414]",
                "hover:scale-[1.01] cursor-pointer",
              )}
            >
              {/* Left accent bar */}
              <div
                className="absolute left-0 top-4 bottom-4 w-0.5 rounded-full opacity-40 transition-opacity duration-150 group-hover:opacity-70"
                style={{ backgroundColor: section.accent }}
              />

              {/* Icon */}
              <div
                className="inline-flex size-10 items-center justify-center rounded-xl"
                style={{
                  backgroundColor: `${section.accent}18`,
                  color: section.accent,
                }}
              >
                <Icon className="size-5" />
              </div>

              {/* Title */}
              <div>
                <h3 className="text-[15px] font-semibold text-white">
                  {section.title}
                </h3>
                <p className="mt-1 text-[13px] leading-relaxed text-[#666]">
                  {section.description}
                </p>
              </div>

              {/* Chips */}
              <div className="mt-auto flex flex-wrap gap-1.5">
                {section.chips.map((chip) => (
                  <span
                    key={chip}
                    className="rounded-full bg-white/[0.05] px-2 py-0.5 text-[11px] text-[#555] transition-colors group-hover:bg-white/[0.08] group-hover:text-[#888]"
                  >
                    {chip}
                  </span>
                ))}
              </div>
            </a>
          );
        })}

        {sections.length === 0 && (
          <div className="col-span-full py-12 text-center text-sm text-[#555]">
            Keine Ergebnisse für „{query}"
          </div>
        )}
      </div>

      {/* ── Footer hint ── */}
      <p className="mt-8 text-center text-xs text-[#3a3a3a]">
        Du kannst auch direkt über die linke Seitenleiste navigieren.
      </p>
    </div>
  );
}
