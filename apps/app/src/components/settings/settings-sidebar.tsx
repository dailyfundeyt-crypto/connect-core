import {
  IconArrowLeft,
  IconBolt,
  IconBrain,
  IconBuildingStore,
  IconChevronDown,
  IconCloudUpload,
  IconCpu,
  IconDeviceDesktop,
  IconDownload,
  IconHeartHandshake,
  IconInfoCircle,
  IconKey,
  IconKeyboard,
  IconLink,
  IconLock,
  IconMail,
  IconMicrophone,
  IconPalette,
  IconPlugConnected,
  IconRefresh,
  IconRobot,
  IconSearch,
  IconServer,
  IconSettings,
  IconShieldLock,
  IconTrash,
  IconUser,
  IconX,
} from "@tabler/icons-react";
import { Link, type LinkOptions } from "@tanstack/react-router";
import type * as React from "react";
import { useMemo, useState } from "react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import { useSignOut } from "@/lib/auth/use-sign-out";
import { getT3Flag } from "@/lib/t3/contracts";

const appLinkOptions = { to: "/" } satisfies LinkOptions;

// ─── Types ────────────────────────────────────────────────────────────────────

export type SubItem = {
  title: string;
  hash?: string;
  linkTo?: string;
  danger?: boolean;
  legacy?: boolean;
};

export type NavGroup = {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  items: SubItem[];
};

// ─── 7 Grok-Bot Style Navigation Groups (Prompt 4.3) ──────────────────────────

export const GROUPS: NavGroup[] = [
  {
    id: "konto",
    label: "Konto",
    icon: IconUser,
    items: [
      { title: "Profil & Name", hash: "konto" },
      { title: "Abmelden", linkTo: "/sign", danger: true },
    ],
  },
  {
    id: "unternehmen",
    label: "Unternehmen",
    icon: IconBuildingStore,
    items: [
      { title: "Firmenprofile", linkTo: "/settings/companies", hash: "profile" },
      { title: "Tools pro Firma", hash: "company-tools" },
      { title: "Sidebar-Tools", hash: "sidebar-tools" },
      { title: "Browser-Gruppen", hash: "browser-groups" },
    ],
  },
  {
    id: "agenten",
    label: "Agenten",
    icon: IconRobot,
    items: [
      { title: "Standing Instructions", hash: "standing-instructions" },
      { title: "Fokus-Kette", hash: "fokus" },
      { title: "Voice & Keyring", hash: "voice" },
      { title: "Desktop-Steuerung & Sicherheit", hash: "desktop-control" },
    ],
  },
  {
    id: "browser-profiles",
    label: "Browser-Profile",
    icon: IconDeviceDesktop,
    items: [
      { title: "Profile", hash: "browser-profiles" },
      { title: "Gruppen", hash: "browser-groups" },
    ],
  },
  {
    id: "modelle",
    label: "Modelle & CLIs",
    icon: IconCpu,
    items: [
      { title: "Globale API-Keys", hash: "api-keys" },
      { title: "Modell-Provider", hash: "model-provider" },
      { title: "Anbieter-CLIs", hash: "cli-providers" },
      { title: "Model One", hash: "model-one" },
      { title: "Codex-Nutzung", hash: "codex-usage" },
    ],
  },
  {
    id: "integrationen",
    label: "Integrationen & MCP",
    icon: IconPlugConnected,
    items: [
      { title: "MCP-Server", hash: "mcp" },
      { title: "Connector-Mapping", hash: "connector-mapping" },
      { title: "MCP-Freigaben (Grok Bot)", hash: "mcp-grants" },
      { title: "E-Mail-Agenten", hash: "email-agents" },
      { title: "Handy verbinden", hash: "handy-verbinden" },
      { title: "Mein Helium", hash: "mein-helium" },
      { title: "Sync & Backup", hash: "sync-backup" },
      { title: "Kalender", hash: "calendar" },
      { title: "Ubuntu-Maschinen", hash: "ubuntu-machines" },
    ],
  },
  {
    id: "darstellung",
    label: "Darstellung",
    icon: IconPalette,
    items: [
      { title: "Farbmodus", hash: "appearance" },
      { title: "Tastatur-Shortcuts", hash: "shortcuts" },
    ],
  },
  {
    id: "sicherheit",
    label: "Sicherheit & System",
    icon: IconShieldLock,
    items: [
      { title: "Deployment Mode", hash: "deployment-mode" },
      { title: "Erweitert & Lab", hash: "erweitert" },
      { title: "Über & Info", hash: "uber" },
    ],
  },
];

/**
 * Die T3-Gruppe (A25) — nur sichtbar, wenn die T3-Brücke aktiv ist.
 *
 * Das sind die Bereiche, die Stefan im Einstellungs-Menü haben wollte: das Sidecar,
 * die Anbieter-CLIs, Gleichzeitigkeit, Kontext-Rotation und Token-Sparen.
 */
const T3_GROUP: NavGroup = {
  id: "t3",
  label: "T3 Backend",
  icon: IconServer,
  items: [
    { title: "T3-Einstellungen", hash: "t3" },
    { title: "Nutzung & Limits", hash: "nutzung-limits" },
  ],
};

/**
 * Die Maschinen-Gruppe (A26) — nur sichtbar, wenn die Cua-Maschinen aktiv sind.
 *
 * "Maschinen" ist das neue Panel (Cua-Sandboxes, Bot→Maschine-Zuweisung); der alte
 * Eintrag "Ubuntu-Maschinen" bleibt unangetastet daneben stehen.
 */
const MACHINES_GROUP: NavGroup = {
  id: "maschinen",
  label: "Maschinen",
  icon: IconDeviceDesktop,
  items: [{ title: "Maschinen & Sandboxes", hash: "machines" }],
};

/**
 * Die Navigationsgruppen, die in der Sidebar stehen.
 *
 * Die T3-Gruppe und die Maschinen-Gruppe kommen nur dazu, wenn ihr Feature-Flag
 * gesetzt ist (`connect.t3.bridge` bzw. `connect.t3.cuaMachines`). Flag aus = die
 * Sidebar sieht exakt aus wie vorher.
 */
export function visibleGroups(): NavGroup[] {
  const groups = [...GROUPS];
  if (getT3Flag("bridge")) groups.push(T3_GROUP);
  if (getT3Flag("cuaMachines")) groups.push(MACHINES_GROUP);
  return groups;
}

// ─── Sub-item row ─────────────────────────────────────────────────────────────

function SubItemRow({
  item,
  activeHash,
}: {
  item: SubItem;
  activeHash?: string;
}) {
  const isActive = item.hash ? activeHash === item.hash : false;
  const { signOut } = useSignOut();

  const content = (
    <SidebarMenuButton
      className={cn(
        "w-full rounded-lg border border-black/[0.07] bg-white/60 px-3.5 py-2 text-[13px]",
        "transition-all duration-150 hover:bg-white/90",
        "dark:border-white/[0.07] dark:bg-white/[0.03] dark:hover:bg-white/[0.06] dark:hover:border-white/15",
        isActive &&
          "border-black/[0.14] bg-black/[0.08] font-medium text-[#1c1b19] dark:border-sky-500/40 dark:bg-sky-500/[0.08] dark:text-sky-300 dark:shadow-[0_0_12px_rgba(56,189,248,0.12)]",
        !isActive &&
          !item.danger &&
          "text-[#4a4741] hover:text-[#1c1b19] dark:text-[#a1a1aa] dark:hover:text-[#ededef]",
        item.danger &&
          "text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300",
      )}
    >
      <span className="truncate">{item.title}</span>
    </SidebarMenuButton>
  );

  if (item.linkTo) {
    return (
      <SidebarMenuItem key={item.title}>
        <Link
          onClick={(event) => {
            if (item.linkTo === "/sign") {
              event.preventDefault();
              void signOut();
            }
          }}
          to={item.linkTo}
          className="w-full"
        >
          {content}
        </Link>
      </SidebarMenuItem>
    );
  }

  return (
    <SidebarMenuItem key={item.title}>
      <Link
        to="/settings"
        hash={item.hash}
        activeOptions={{ exact: false }}
        className="w-full"
      >
        {content}
      </Link>
    </SidebarMenuItem>
  );
}

// ─── Collapsible top-level group ─────────────────────────────────────────────

function GroupSection({
  group,
  isOpen,
  onToggle,
  activeHash,
}: {
  group: NavGroup;
  isOpen: boolean;
  onToggle: () => void;
  activeHash?: string;
}) {
  const hasActiveItem = group.items.some((i) => i.hash && i.hash === activeHash);

  return (
    <SidebarGroup className="p-0 py-0.5">
      <button
        className={cn(
          "flex w-full items-center gap-2.5 rounded-lg border border-black/[0.07] bg-white/60 px-3 py-2 text-left",
          "transition-all duration-150 hover:bg-white/90",
          "dark:border-white/[0.07] dark:bg-white/[0.03] dark:hover:bg-white/[0.06] dark:hover:border-white/12",
          hasActiveItem && "dark:border-white/15 dark:bg-white/[0.05]",
        )}
        onClick={onToggle}
        type="button"
        aria-expanded={isOpen}
      >
        {/* Active indicator bar */}
        {isOpen ? (
          <div className="h-5 w-0.5 rounded-full bg-sky-500 shadow-[0_0_8px_rgba(56,189,248,0.5)]" />
        ) : (
          <div className="h-5 w-0.5 rounded-full bg-transparent" />
        )}

        {/* Group Icon */}
        <div className="flex size-6 items-center justify-center rounded-md bg-black/[0.05] text-[#1c1b19] dark:bg-white/[0.06] dark:text-white/90">
          <group.icon className="size-3.5" />
        </div>

        {/* Label */}
        <span className="flex-1 truncate text-[13px] font-medium text-[#1c1b19] dark:text-white/90">
          {group.label}
        </span>

        {/* Count badge */}
        <span className="rounded-full bg-black/[0.07] px-1.5 py-0.5 text-[10px] text-[#6b6862] dark:bg-white/[0.06] dark:text-[#888]">
          {group.items.length}
        </span>

        {/* Chevron */}
        <IconChevronDown
          className={cn(
            "size-3.5 text-[#6b6862] transition-transform duration-150 dark:text-[#555]",
            !isOpen && "-rotate-90",
          )}
        />
      </button>

      {/* Sub-items */}
      <div
        className={cn(
          "overflow-hidden transition-all duration-200 ease-out",
          isOpen ? "max-h-96 opacity-100" : "max-h-0 opacity-0",
        )}
      >
        <div className="mt-1 ml-1 flex flex-col gap-1.5">
          {group.items.map((item) => (
            <SubItemRow key={item.title} item={item} activeHash={activeHash} />
          ))}
        </div>
      </div>
    </SidebarGroup>
  );
}

// ─── Sidebar ─────────────────────────────────────────────────────────────────

export function SettingsSidebar({
  activeHash,
  ...props
}: React.ComponentProps<typeof Sidebar> & {
  activeHash?: string;
}) {
  const [search, setSearch] = useState("");
  const [openGroups, setOpenGroups] = useState<Set<string>>(
    /*
     * Alle Gruppen starten offen. Die Liste kommt aus `visibleGroups()`, damit auch die
     * neuen Gruppen (T3, Maschinen) offen starten — sonst wären sie vorhanden, aber
     * eingeklappt, was wie ein Fehler aussieht.
     */
    () => new Set(visibleGroups().map((g) => g.id)),
  );
  /*
   * Die Gruppen hängen an den T3-Flags: `bridge` bringt die T3-Gruppe, `cuaMachines`
   * die Maschinen-Gruppe. Flag aus = die Sidebar ist exakt wie vorher.
   */
  const groups = useMemo(() => visibleGroups(), []);

  const toggleGroup = (id: string) => {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const filteredGroups = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return groups;
    return groups.map((group) => {
      const matchingItems = group.items.filter(
        (item) =>
          item.title.toLowerCase().includes(q) ||
          (item.hash && item.hash.toLowerCase().includes(q)),
      );
      if (group.label.toLowerCase().includes(q)) {
        return group;
      }
      return {
        ...group,
        items: matchingItems,
      };
    }).filter((group) => group.items.length > 0);
  }, [groups, search]);

  // Mobile: only one group open at a time
  const [mobileOpen, setMobileOpen] = useState<string | null>("konto");

  const toggleMobileGroup = (id: string) => {
    setMobileOpen((prev) => (prev === id ? null : id));
  };

  return (
    <Sidebar {...props}>
      <SidebarHeader className="h-auto border-b border-black/[0.08] p-2 dark:border-white/[0.08]">
        <SidebarMenu className="gap-2">
          {/* Top navigation actions */}
          <div className="flex items-center gap-1.5">
            <SidebarMenuItem className="flex-1">
              <SidebarMenuButton
                className="w-full rounded-lg border border-black/[0.07] bg-white/60 px-3 py-2 text-[13px] transition-colors hover:bg-white/80 dark:border-white/[0.07] dark:bg-white/[0.03] dark:hover:bg-white/[0.06]"
                render={(p) => (
                  <Link to="/settings" {...p}>
                    <IconSettings className="size-4 shrink-0 text-[#1c1b19] dark:text-[#888]" />
                    <span className="truncate font-medium text-[#1c1b19] dark:text-white/80">
                      Übersicht
                    </span>
                  </Link>
                )}
              />
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton
                className="rounded-lg border border-black/[0.12] bg-white/60 px-3 py-2 text-[13px] font-medium text-[#1c1b19] transition-colors hover:bg-white/90 dark:border-white/[0.12] dark:bg-white/[0.03] dark:text-white dark:hover:bg-white/[0.06]"
                render={(p) => (
                  <Link {...appLinkOptions} {...p}>
                    <IconArrowLeft className="size-4 shrink-0" />
                    <span className="truncate max-sm:hidden">Zurück</span>
                  </Link>
                )}
              />
            </SidebarMenuItem>
          </div>

          {/* Search bar (Prompt 4.3 requirement) */}
          <div className="relative mt-1">
            <IconSearch className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground/60 dark:text-[#71717a]" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Einstellungen durchsuchen…"
              className="h-8 w-full rounded-lg border border-black/[0.08] bg-white/50 pl-8 pr-7 text-xs text-[#1c1b19] outline-none transition-all placeholder:text-muted-foreground focus:border-sky-500/50 focus:ring-2 focus:ring-sky-500/20 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-[#ededef] dark:placeholder:text-[#71717a]"
            />
            {search ? (
              <button
                type="button"
                onClick={() => setSearch("")}
                aria-label="Suche leeren"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground dark:text-[#71717a] dark:hover:text-[#ededef]"
              >
                <IconX className="size-3.5" />
              </button>
            ) : null}
          </div>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent className="gap-1 px-1.5 py-2">
        {filteredGroups.length === 0 ? (
          <div className="px-3 py-6 text-center text-xs text-muted-foreground dark:text-[#71717a]">
            Keine Treffer für &bdquo;{search}&ldquo;
          </div>
        ) : (
          <>
            {/* Desktop group view */}
            <div className="hidden md:flex md:flex-col md:gap-1">
              {filteredGroups.map((group) => (
                <GroupSection
                  key={group.id}
                  group={group}
                  isOpen={search ? true : openGroups.has(group.id)}
                  onToggle={() => toggleGroup(group.id)}
                  activeHash={activeHash}
                />
              ))}
            </div>

            {/* Mobile accordion view */}
            <div className="flex flex-col gap-1 md:hidden">
              {filteredGroups.map((group) => {
                const isOpen = search ? true : mobileOpen === group.id;
                return (
                  <div key={group.id} className="py-0.5">
                    <button
                      className="flex w-full items-center gap-2.5 rounded-lg border border-black/[0.07] bg-white/60 px-3 py-2 text-left transition-colors hover:bg-white/80 dark:border-white/[0.07] dark:bg-white/[0.03] dark:hover:bg-white/[0.05]"
                      onClick={() => toggleMobileGroup(group.id)}
                      type="button"
                    >
                      <div className="flex size-6 items-center justify-center rounded-lg bg-black/[0.05] text-[#1c1b19] dark:bg-white/[0.06] dark:text-white/90">
                        <group.icon className="size-3.5" />
                      </div>
                      <span className="flex-1 text-[13px] font-medium text-[#1c1b19] dark:text-white/90">
                        {group.label}
                      </span>
                      <span className="rounded-full bg-black/[0.07] px-1.5 py-0.5 text-[10px] text-[#6b6862] dark:bg-white/[0.06] dark:text-[#888]">
                        {group.items.length}
                      </span>
                      <IconChevronDown
                        className={cn(
                          "size-3.5 text-[#6b6862] transition-transform duration-150 dark:text-[#555]",
                          !isOpen && "-rotate-90",
                        )}
                      />
                    </button>

                    <div
                      className={cn(
                        "overflow-hidden transition-all duration-200",
                        isOpen ? "max-h-96 opacity-100" : "max-h-0 opacity-0",
                      )}
                    >
                      <div className="mt-1 ml-1 flex flex-col gap-1.5">
                        {group.items.map((item) => (
                          <SubItemRow
                            key={item.title}
                            item={item}
                            activeHash={activeHash}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </SidebarContent>

      <SidebarRail />
    </Sidebar>
  );
}
