import {
  IconArrowLeft,
  IconBolt,
  IconBrain,
  IconChevronDown,
  IconCloudUpload,
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
  IconPlugConnected,
  IconRefresh,
  IconSettings,
  IconShieldLock,
  IconTrash,
  IconUser,
} from "@tabler/icons-react";
import { Link, type LinkOptions } from "@tanstack/react-router";
import type * as React from "react";
import { useState } from "react";
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

const appLinkOptions = { to: "/" } satisfies LinkOptions;

// ─── Types ────────────────────────────────────────────────────────────────────

type SubItem = {
  title: string;
  hash?: string;
  linkTo?: string;
  danger?: boolean;
};

type NavGroup = {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  accent: string;
  items: SubItem[];
};

// ─── 3 top-level groups ───────────────────────────────────────────────────────

const GROUPS: NavGroup[] = [
  {
    id: "konto",
    label: "Konto & Sicherheit",
    icon: IconUser,
    accent: "#60a5fa",
    items: [
      { title: "Profil", hash: "profile" },
      { title: "Sitzungen", hash: "security" },
      { title: "Abmelden", linkTo: "/sign" },
    ],
  },
  {
    id: "verbindungen",
    label: "Verbindungen",
    icon: IconPlugConnected,
    accent: "#a78bfa",
    items: [
      { title: "API-Keys", hash: "api-keys" },
      { title: "Model-Provider", hash: "model-provider" },
      { title: "MCP-Server", linkTo: "/settings/mcp" },
      { title: "Connector-Mapping", hash: "connector-mapping" },
      { title: "Browser-Gruppen", hash: "browser-groups" },
      { title: "Ubuntu-Maschinen", hash: "ubuntu-machines" },
      { title: "Voice", hash: "voice" },
    ],
  },
  {
    id: "system",
    label: "System & Hilfe",
    icon: IconSettings,
    accent: "#34d399",
    items: [
      { title: "Sync & Backup", hash: "sync-backup" },
      { title: "Erweitert", hash: "erweitert" },
      { title: "Shortcuts", hash: "shortcuts" },
      { title: "Standing Instructions", hash: "standing-instructions" },
      { title: "Donate", hash: "donate" },
      { title: "Deployment Mode", hash: "deployment-mode" },
      { title: "Background", hash: "background" },
      { title: "Codex Usage", hash: "codex-usage" },
      { title: "Info", hash: "info" },
      { title: "Datenschutz", hash: "privacy" },
      { title: "Nutzungsbedingungen", hash: "terms" },
    ],
  },
];

// ─── Sub-item row ─────────────────────────────────────────────────────────────

function SubItemRow({
  item,
  activeHash,
}: {
  item: SubItem;
  activeHash?: string;
}) {
  const isActive = item.hash ? activeHash === item.hash : false;

  const content = (
    <SidebarMenuButton
      className={cn(
        "h-8 rounded-lg px-2 text-[13px] transition-colors",
        isActive && "bg-white/[0.06] font-medium text-white",
        !isActive && !item.danger && "text-[#888] hover:bg-white/[0.04] hover:text-[#ccc]",
        item.danger && "text-red-400/70 hover:text-red-400",
      )}
    >
      <span className="truncate">{item.title}</span>
    </SidebarMenuButton>
  );

  if (item.linkTo) {
    return (
      <SidebarMenuItem key={item.title}>
        <Link to={item.linkTo}>{content}</Link>
      </SidebarMenuItem>
    );
  }

  return (
    <SidebarMenuItem key={item.title}>
      <Link
        to="/settings"
        hash={item.hash}
        activeOptions={{ exact: false }}
        activeProps={{ className: "bg-white/[0.06] font-medium text-white" }}
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
  return (
    <SidebarGroup className="p-0 py-1">
      {/* Header row — click to expand/collapse */}
      <button
        className={cn(
          "flex h-9 w-full items-center gap-2 rounded-lg px-2 text-left",
          "transition-colors hover:bg-white/[0.04]",
        )}
        onClick={onToggle}
        type="button"
        aria-expanded={isOpen}
      >
        {/* Left accent bar when active */}
        {isOpen && (
          <div
            className="absolute left-0 h-6 w-0.5 rounded-full"
            style={{ backgroundColor: group.accent }}
          />
        )}

        {/* Icon */}
        <div
          className="flex size-6 items-center justify-center rounded-md"
          style={{
            backgroundColor: `${group.accent}18`,
            color: group.accent,
          }}
        >
          <group.icon className="size-3.5" />
        </div>

        {/* Label */}
        <span className="flex-1 truncate text-[13px] font-medium text-white/90">
          {group.label}
        </span>

        {/* Count badge */}
        <span className="rounded-full bg-white/[0.06] px-1.5 py-0.5 text-[10px] text-[#666]">
          {group.items.length}
        </span>

        {/* Chevron */}
        <IconChevronDown
          className={cn(
            "size-3.5 text-[#555] transition-transform duration-150",
            !isOpen && "-rotate-90",
          )}
        />
      </button>

      {/* Sub-items — animated */}
      <div
        className={cn(
          "overflow-hidden transition-all duration-200 ease-out",
          isOpen ? "max-h-96 opacity-100" : "max-h-0 opacity-0",
        )}
      >
        <div className="mt-1 flex flex-col gap-px pl-2">
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
  /** The current hash from the URL — highlights the active group */
  activeHash?: string;
}) {
  // All groups open by default, but only one can be open on mobile
  const [openGroups, setOpenGroups] = useState<Set<string>>(
    new Set(GROUPS.map((g) => g.id)),
  );

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

  // Mobile: only one group open at a time
  const [mobileOpen, setMobileOpen] = useState<string | null>("konto");

  const toggleMobileGroup = (id: string) => {
    setMobileOpen((prev) => (prev === id ? null : id));
  };

  const isMobileOpen = (id: string) =>
    mobileOpen === null ? openGroups.has(id) : mobileOpen === id;

  return (
    <Sidebar {...props}>
      <SidebarHeader className="h-12 border-b border-[#1f1f1f] p-2">
        <SidebarMenu>
          {/* Overview link */}
          <SidebarMenuItem>
            <SidebarMenuButton
              className="rounded-lg text-[13px]"
              render={(p) => (
                <Link to="/settings" {...p}>
                  <IconSettings className="size-4 shrink-0 text-[#888]" />
                  <span className="truncate font-medium text-white/80">
                    Übersicht
                  </span>
                </Link>
              )}
            />
          </SidebarMenuItem>
          {/* Back link */}
          <SidebarMenuItem>
            <SidebarMenuButton
              className="rounded-lg text-[13px] text-[#666] hover:text-[#999]"
              render={(p) => (
                <Link {...appLinkOptions} {...p}>
                  <IconArrowLeft className="size-4 shrink-0" />
                  <span className="truncate">Zurück</span>
                </Link>
              )}
            />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent className="gap-0 px-1.5 py-2">
        {/* ── 3 top-level groups (desktop) ── */}
        <div className="hidden md:block">
          {GROUPS.map((group) => (
            <GroupSection
              key={group.id}
              group={group}
              isOpen={openGroups.has(group.id)}
              onToggle={() => toggleGroup(group.id)}
              activeHash={activeHash}
            />
          ))}
        </div>

        {/* ── Mobile accordion ── */}
        <div className="flex flex-col gap-0 md:hidden">
          {GROUPS.map((group) => (
            <div key={group.id} className="py-1">
              {/* Accordion trigger */}
              <button
                className="flex h-10 w-full items-center gap-2 rounded-xl px-3 text-left transition-colors hover:bg-white/[0.04]"
                onClick={() => toggleMobileGroup(group.id)}
                type="button"
              >
                <div
                  className="flex size-7 items-center justify-center rounded-lg"
                  style={{
                    backgroundColor: `${group.accent}18`,
                    color: group.accent,
                  }}
                >
                  <group.icon className="size-4" />
                </div>
                <span className="flex-1 text-[14px] font-medium text-white/90">
                  {group.label}
                </span>
                <span className="rounded-full bg-white/[0.06] px-1.5 py-0.5 text-[10px] text-[#666]">
                  {group.items.length}
                </span>
                <IconChevronDown
                  className={cn(
                    "size-3.5 text-[#555] transition-transform duration-150",
                    !isMobileOpen(group.id) && "-rotate-90",
                  )}
                />
              </button>

              {/* Accordion content */}
              <div
                className={cn(
                  "overflow-hidden transition-all duration-200",
                  isMobileOpen(group.id)
                    ? "max-h-96 opacity-100"
                    : "max-h-0 opacity-0",
                )}
              >
                <div className="mt-1 flex flex-col gap-px px-2">
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
          ))}
        </div>

        {/* ── Footer nav: Skills + Agents ── */}
        <SidebarGroup className="mt-2 border-t border-white/[0.05] p-0 pt-2">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                className="rounded-lg text-[13px]"
                render={(p) => (
                  <Link to="/skills" {...p}>
                    <IconBrain className="size-4 shrink-0 text-[#888]" />
                    <span className="truncate text-[#888]">Skills</span>
                  </Link>
                )}
              />
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton
                className="rounded-lg text-[13px]"
                render={(p) => (
                  <Link to="/agents" {...p}>
                    <IconBolt className="size-4 shrink-0 text-[#888]" />
                    <span className="truncate text-[#888]">Agents</span>
                  </Link>
                )}
              />
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>

      <SidebarRail />
    </Sidebar>
  );
}
