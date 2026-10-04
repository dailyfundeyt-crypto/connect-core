import {
  IconArrowLeft,
  IconBolt,
  IconBrain,
  IconCloudUpload,
  IconDatabase,
  IconDeviceDesktop,
  IconKeyboard,
  IconKey,
  IconLink,
  IconMicrophone,
  IconPlugConnected,
  IconSettings,
  IconShieldLock,
  IconTrash,
  IconUser,
  IconInfoCircle,
  IconMail,
  IconRefresh,
  IconBell,
  IconLock,
  IconDownload,
} from "@tabler/icons-react";
import { Link, type LinkOptions } from "@tanstack/react-router";
import type * as React from "react";
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

const appLinkOptions = { to: "/" } satisfies LinkOptions;

type NavItem = {
  exact?: boolean;
  hash?: string;
  icon: React.ComponentType<{ className?: string }>;
  linkOptions: LinkOptions;
  title: string;
};

type NavGroup = {
  label: string;
  items: NavItem[];
};

/** Redesigned sidebar: 7 sections, minimal, dark-compatible */
const GROUPS: NavGroup[] = [
  {
    label: "Konto",
    items: [
      {
        title: "Profil",
        icon: IconUser,
        hash: "profile",
        linkOptions: { to: "/settings" },
      },
      {
        title: "Sitzungen",
        icon: IconDeviceDesktop,
        hash: "security",
        linkOptions: { to: "/settings" },
      },
      {
        title: "Abmelden",
        icon: IconArrowLeft,
        linkOptions: { to: "/sign" },
      },
    ],
  },
  {
    label: "Konnektoren",
    items: [
      {
        title: "E-Mail-Konten",
        icon: IconMail,
        linkOptions: { to: "/settings" },
      },
      {
        title: "Cloud-Sync",
        icon: IconCloudUpload,
        hash: "backup",
        linkOptions: { to: "/settings" },
      },
      {
        title: "Helium-Verbindung",
        icon: IconRefresh,
        hash: "helium",
        linkOptions: { to: "/settings" },
      },
    ],
  },
  {
    label: "Helium-Shell",
    items: [
      {
        title: "Shortcut",
        icon: IconKeyboard,
        hash: "shortcuts",
        linkOptions: { to: "/settings" },
      },
      {
        title: "Apple-Dot",
        icon: IconBolt,
        linkOptions: { to: "/settings" },
      },
      {
        title: "Browser-Gruppen",
        icon: IconSettings,
        linkOptions: { to: "/settings" },
      },
    ],
  },
  {
    label: "Connect-Agenten",
    items: [
      {
        title: "Standard-Agent",
        icon: IconBolt,
        linkOptions: { to: "/agents" },
      },
      {
        title: "API-Keys",
        icon: IconKey,
        hash: "api-keys",
        linkOptions: { to: "/settings" },
      },
      {
        title: "MCP-Server",
        icon: IconPlugConnected,
        linkOptions: { to: "/settings/mcp" },
      },
    ],
  },
  {
    label: "Benachrichtigungen",
    items: [
      {
        title: "Push & E-Mail",
        icon: IconBell,
        linkOptions: { to: "/settings" },
      },
    ],
  },
  {
    label: "Datenschutz",
    items: [
      {
        title: "Lokale Daten",
        icon: IconDatabase,
        hash: "storage",
        linkOptions: { to: "/settings" },
      },
      {
        title: "Telemetrie",
        icon: IconShieldLock,
        linkOptions: { to: "/settings" },
      },
      {
        title: "Daten exportieren",
        icon: IconDownload,
        linkOptions: { to: "/settings" },
      },
      {
        title: "Daten löschen",
        icon: IconTrash,
        hash: "delete",
        linkOptions: { to: "/settings" },
      },
    ],
  },
  {
    label: "Über",
    items: [
      {
        title: "Version & Logs",
        icon: IconInfoCircle,
        hash: "about",
        linkOptions: { to: "/settings" },
      },
      {
        title: "Feedback",
        icon: IconMail,
        linkOptions: { to: "/settings" },
      },
    ],
  },
];

export function SettingsSidebar({
  ...props
}: React.ComponentProps<typeof Sidebar>) {
  return (
    <Sidebar {...props}>
      <SidebarHeader className="h-12 border-b border-[#1f1f1f] p-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              render={(props) => (
                <Link {...appLinkOptions} {...props}>
                  <IconArrowLeft className="size-4" />
                  Zurück
                </Link>
              )}
            />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent className="gap-0 px-1.5 py-2">
        {GROUPS.map((group) => (
          <SidebarGroup className="p-0 py-1.5" key={group.label}>
            <SidebarGroupLabel className="mb-0.5 h-6 px-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-[#555]">
              {group.label}
            </SidebarGroupLabel>
            <SidebarMenu className="gap-px">
              {group.items.map((option) => (
                <SidebarMenuItem key={`${group.label}-${option.title}`}>
                  <SidebarMenuButton
                    className="rounded-lg text-[13px]"
                    render={(props) => (
                      <Link
                        {...option.linkOptions}
                        activeOptions={{ exact: option.exact ?? false }}
                        activeProps={{
                          className: "bg-white/5 font-medium",
                        }}
                        hash={option.hash}
                        {...props}
                      >
                        <option.icon className="size-4 shrink-0 opacity-60" />
                        <span className="truncate">{option.title}</span>
                      </Link>
                    )}
                  />
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroup>
        ))}
        <SidebarGroup className="mt-1 border-t border-white/[0.05] p-0 pt-2">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                className="rounded-lg text-[13px]"
                render={(props) => (
                  <Link to="/skills" {...props}>
                    <IconBrain className="size-4 shrink-0 opacity-60" />
                    <span className="truncate">Skills</span>
                  </Link>
                )}
              />
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton
                className="rounded-lg text-[13px]"
                render={(props) => (
                  <Link to="/agents" {...props}>
                    <IconBolt className="size-4 shrink-0 opacity-60" />
                    <span className="truncate">Agents</span>
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
