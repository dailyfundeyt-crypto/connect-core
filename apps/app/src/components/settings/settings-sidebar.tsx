import {
  IconArrowLeft,
  IconBolt,
  IconBuilding,
  IconChartBar,
  IconClock,
  IconDatabase,
  IconDeviceDesktop,
  IconHeartHandshake,
  IconKeyboard,
  IconKey,
  IconLink,
  IconMicrophone,
  IconPlugConnected,
  IconPuzzle,
  IconSettings,
  IconShieldLock,
  IconUser,
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
        title: "Unternehmen",
        icon: IconBuilding,
        hash: "companies",
        linkOptions: { to: "/settings" },
      },
      {
        title: "Sicherheit",
        icon: IconShieldLock,
        hash: "security",
        linkOptions: { to: "/settings" },
      },
    ],
  },
  {
    label: "KI & Keys",
    items: [
      {
        title: "Model Provider",
        icon: IconBolt,
        hash: "model-provider",
        linkOptions: { to: "/settings" },
      },
      {
        title: "API-Keys",
        icon: IconKey,
        hash: "api-keys",
        linkOptions: { to: "/settings" },
      },
      {
        title: "MCP / Connectors",
        icon: IconPlugConnected,
        linkOptions: { to: "/settings/mcp" },
      },
    ],
  },
  {
    label: "Integrationen",
    items: [
      {
        title: "Accounts",
        icon: IconLink,
        linkOptions: { to: "/settings/connected-accounts" },
      },
      {
        title: "Voice",
        icon: IconMicrophone,
        hash: "voice",
        linkOptions: { to: "/settings" },
      },
    ],
  },
  {
    label: "App",
    items: [
      {
        title: "Allgemein",
        icon: IconSettings,
        exact: true,
        linkOptions: { to: "/settings" },
      },
      {
        title: "Speicher",
        icon: IconDatabase,
        hash: "storage",
        linkOptions: { to: "/settings" },
      },
      {
        title: "Ubuntu",
        icon: IconDeviceDesktop,
        hash: "ubuntu",
        linkOptions: { to: "/settings" },
      },
      {
        title: "Skills",
        icon: IconPuzzle,
        linkOptions: { to: "/skills" },
      },
      {
        title: "Shortcuts",
        icon: IconKeyboard,
        hash: "shortcuts",
        linkOptions: { to: "/settings" },
      },
    ],
  },
  {
    label: "Mehr",
    items: [
      {
        title: "Usage",
        icon: IconChartBar,
        hash: "usage",
        linkOptions: { to: "/settings" },
      },
      {
        title: "Timer",
        icon: IconClock,
        hash: "timer",
        linkOptions: { to: "/settings" },
      },
      {
        title: "Admin",
        icon: IconShieldLock,
        linkOptions: { to: "/admin" },
      },
      {
        title: "Spenden",
        icon: IconHeartHandshake,
        hash: "donate",
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
      <SidebarHeader className="h-12 border-b border-sidebar-border/60 p-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              render={(props) => (
                <Link {...appLinkOptions} {...props}>
                  <IconArrowLeft className="size-4" />
                  Zurück zur App
                </Link>
              )}
            />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent className="gap-0 px-1.5 py-2">
        {GROUPS.map((group) => (
          <SidebarGroup className="p-0 py-1.5" key={group.label}>
            <SidebarGroupLabel className="mb-0.5 h-6 px-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-sidebar-foreground/40">
              {group.label}
            </SidebarGroupLabel>
            <SidebarMenu className="gap-px">
              {group.items.map((option) => (
                <SidebarMenuItem key={`${group.label}-${option.title}`}>
                  <SidebarMenuButton
                    className="rounded-lg"
                    render={(props) => (
                      <Link
                        {...option.linkOptions}
                        activeOptions={{ exact: option.exact ?? false }}
                        activeProps={{
                          className: "bg-foreground/5 font-medium",
                        }}
                        hash={option.hash}
                        {...props}
                      >
                        <option.icon className="size-4 shrink-0 opacity-70" />
                        <span className="truncate">{option.title}</span>
                      </Link>
                    )}
                  />
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroup>
        ))}
        <SidebarGroup className="mt-1 border-t border-sidebar-border/50 p-0 pt-2">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                className="rounded-lg"
                render={(props) => (
                  <Link to="/agents" {...props}>
                    <IconBolt className="size-4 shrink-0 opacity-70" />
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
