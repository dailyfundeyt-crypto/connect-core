import {
  IconBrandChrome,
  IconDeviceDesktop,
  IconLogout,
  IconMoon,
  IconPuzzle,
  IconSettings,
  IconSun,
} from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  CompanyLevelChips,
  SidebarCollapseGlyph,
} from "@/components/companies/company-level-chips";
import { CompanySwitcher } from "@/components/companies/company-switcher";
import { CompanyAgentsNav } from "@/components/companies/company-agents-nav";
import { CompanyAppFoldersNav } from "@/components/companies/company-app-folders-nav";
import { CometSlideOver } from "@/components/companies/comet-slide-over";
import { LabIconRail, LabToolsNav } from "@/components/companies/lab-tools-nav";
import { UserAvatar } from "@/components/app-sidebar/user-avatar";
import { useTheme } from "@/components/theme-provider";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";
import { goToSignInAfterSignOut, signOutMutationOptions } from "@/lib/auth/mutations";
import { currentUserQueryOptions } from "@/lib/auth/queries";
import {
  getLocalProfile,
  subscribeLocalProfile,
  type LocalProfile,
} from "@/lib/auth/local-profile";
import {
  type CompanyLevel,
  getActiveLevel,
  subscribeLevel,
} from "@/lib/companies/level";
import { getCompanySiteUrl, normalizeSiteUrl } from "@/lib/companies/company-site";
import {
  getLevel3Browser,
  resolveTabUrl,
} from "@/lib/companies/level3-tools";
import {
  CHROME_START_PATH_HINT,
  openLabUrlInChrome,
} from "@/lib/ui/lab-prefs";

/**
 * Slim chrome for Lab + Unternehmen — tools / company bots.
 * User footer: profile menu (Settings / Dark mode / Log out / Connect-Chrome); same avatar as app-sidebar.
 */
export function LevelChromeSidebar(
  props: React.ComponentProps<typeof Sidebar>,
) {
  const { data: currentUser } = useQuery(currentUserQueryOptions());
  const [profile, setProfile] = useState<LocalProfile>(() => getLocalProfile());
  const { dark, setDark } = useTheme();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const signOut = useMutation(signOutMutationOptions(queryClient));
  const { toggleSidebar, state: sidebarState } = useSidebar();
  const [level, setLevel] = useState<CompanyLevel>(() => getActiveLevel());
  /*
   * The route decides which company is open, not localStorage.
   *
   * This used to read `connect.activeCompanyId` directly, so opening
   * /company/connect while that key said "hyper" showed Hyper's apps (and saved new
   * ones into Hyper) under a URL that read "connect" -- edits appeared to vanish.
   * The route param is the thing the user actually navigated to, so it wins, and
   * localStorage is written to match so the rest of the app agrees.
   */
  const routeCompanyId = useParams({ strict: false }) as { companyId?: string };
  const routeId = routeCompanyId?.companyId ?? null;
  const [storedCompanyId, setStoredCompanyId] = useState<string | null>(() =>
    typeof window === "undefined"
      ? null
      : window.localStorage.getItem("connect.activeCompanyId"),
  );
  const companyId = routeId ?? storedCompanyId;
  const [chromeBusy, setChromeBusy] = useState(false);
  const [chromeMsg, setChromeMsg] = useState<string | null>(null);
  const [chromeOk, setChromeOk] = useState(false);

  useEffect(
    () => subscribeLocalProfile(() => setProfile(getLocalProfile())),
    [],
  );
  useEffect(() => subscribeLevel(() => setLevel(getActiveLevel())), []);
  useEffect(() => {
    const sync = () =>
      setStoredCompanyId(window.localStorage.getItem("connect.activeCompanyId"));
    window.addEventListener("connect-active-company", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("connect-active-company", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  // Keep localStorage in step with the route so the switcher, the mobile shell and
  // anything else reading the key agree with what is on screen.
  useEffect(() => {
    if (!routeId) return;
    if (window.localStorage.getItem("connect.activeCompanyId") === routeId) return;
    window.localStorage.setItem("connect.activeCompanyId", routeId);
    window.dispatchEvent(new Event("connect-active-company"));
  }, [routeId]);

  const displayName =
    profile.name.trim() && profile.name !== "Connect User"
      ? profile.name.trim()
      : currentUser?.name || currentUser?.email || "You";

  const openConnectChrome = async (explicitUrl?: string) => {
    setChromeBusy(true);
    setChromeMsg(null);
    setChromeOk(false);
    try {
      let target =
        explicitUrl?.trim() ||
        "https://chromewebstore.google.com/category/extensions";
      if (!explicitUrl) {
        if (companyId && level === 3) {
          const labUrl = resolveTabUrl(getLevel3Browser(companyId));
          if (labUrl) target = labUrl;
        } else if (companyId && level === 4) {
          const site = getCompanySiteUrl(companyId);
          if (site) target = normalizeSiteUrl(site);
        }
      }
      const result = await openLabUrlInChrome(target);
      if (result.ok) {
        setChromeOk(true);
        setChromeMsg(
          "Connect-Chrome ist der Browser — Fenster mit Connect-Profil (Tabs, Extensions).",
        );
        return;
      }
      setChromeOk(false);
      setChromeMsg(
        result.error?.trim() ||
          `Chrome-Start fehlgeschlagen. ${CHROME_START_PATH_HINT}`,
      );
    } finally {
      setChromeBusy(false);
    }
  };

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader className="gap-0 border-b border-sidebar-border/50 px-1.5 pt-2 pb-2 group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:px-1 group-data-[collapsible=icon]:pt-1.5">
        {/* Top rail: Logo (Company-Switcher) · Focus · Messages · Browser · Unternehmen · collapse */}
        <div className="flex w-full shrink-0 items-center gap-1 group-data-[collapsible=icon]:flex-col group-data-[collapsible=icon]:items-center">
        <CompanySwitcher />
        <CompanyLevelChips />
        <Button
          aria-label={
            sidebarState === "collapsed"
              ? "Sidebar ausklappen"
              : "Sidebar verkleinern"
          }
          className="ml-auto flex size-8 shrink-0 rounded-lg p-0 group-data-[collapsible=icon]:ml-0 text-sidebar-foreground/55 hover:bg-sidebar-accent hover:text-sidebar-foreground"
          onClick={toggleSidebar}
          size="icon"
          title="Icon-Leiste (⌘B)"
          type="button"
          variant="ghost"
        >
          <SidebarCollapseGlyph expanded={sidebarState === "expanded"} />
        </Button>
        </div>
      </SidebarHeader>
      <SidebarContent className="scroll-fade-b px-1.5 pt-2 group-data-[collapsible=icon]:overflow-y-auto group-data-[collapsible=icon]:overflow-x-hidden group-data-[collapsible=icon]:px-1.5">
        {level === 3 && companyId ? (
          <div className="flex min-h-0 flex-1 flex-col gap-2 group-data-[collapsible=icon]:hidden">
            <LabToolsNav companyId={companyId} />
          </div>
        ) : null}
        {level === 3 ? (
          <LabIconRail
            className="hidden group-data-[collapsible=icon]:flex"
            companyId={companyId}
          />
        ) : null}
        {level === 4 ? (
          <div className="flex min-h-0 flex-1 flex-col gap-1 group-data-[collapsible=icon]:items-center">
            <p className="mb-2 px-2 text-[11px] leading-relaxed text-sidebar-foreground/40 group-data-[collapsible=icon]:hidden">
              Bots aus deinen Gruppen — Chat öffnen oder Aufträge aus der
              Firmenseite anstoßen.
            </p>
            <div className="w-full group-data-[collapsible=icon]:flex group-data-[collapsible=icon]:flex-col group-data-[collapsible=icon]:items-center">
              <CompanyAppFoldersNav searching={false} />
            </div>
            <div className="w-full group-data-[collapsible=icon]:flex group-data-[collapsible=icon]:flex-col group-data-[collapsible=icon]:items-center">
              <CompanyAgentsNav searching={false} />
            </div>
          </div>
        ) : null}
      </SidebarContent>
      <CometSlideOver className="group-data-[collapsible=icon]:hidden" />
      <SidebarFooter className="border-t border-sidebar-border/60 bg-gradient-to-b from-sidebar-accent/30 to-sidebar-accent/55 p-2 group-data-[collapsible=icon]:px-1">
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <SidebarMenuButton className="h-11 rounded-xl px-2 data-[state=open]:bg-sidebar-accent hover:bg-sidebar-accent" />
                }
              >
                <span className="relative shrink-0">
                  <UserAvatar
                    className="size-[28px] ring-1 ring-sidebar-border/70"
                    fallbackEmail={displayName}
                    fallbackImage={currentUser?.image}
                    profile={profile}
                  />
                  <span
                    aria-hidden
                    className="absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full bg-emerald-500 shadow-[0_0_0_2px_var(--sidebar)]"
                  />
                </span>
                <span className="min-w-0 flex-1 truncate text-left group-data-[collapsible=icon]:hidden">
                  <span className="block truncate text-[13px] font-medium tracking-tight">
                    {displayName}
                  </span>
                  <span className="block truncate text-[11px] font-normal text-sidebar-foreground/45">
                    {currentUser?.email ?? "online"}
                  </span>
                </span>
                <span
                  aria-hidden
                  className="ml-auto hidden h-1.5 w-4 shrink-0 rounded-full bg-neutral-800 group-data-[collapsible=icon]:hidden sm:block"
                />
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="start"
                className="min-w-56 rounded-xl p-1.5"
                side="top"
                sideOffset={8}
              >
                <div className="flex items-center gap-2.5 px-2 py-2">
                  <UserAvatar
                    className="size-8"
                    fallbackEmail={displayName}
                    fallbackImage={currentUser?.image}
                    profile={profile}
                  />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{displayName}</p>
                    {currentUser?.email ? (
                      <p className="truncate text-xs text-muted-foreground">
                        {currentUser.email}
                      </p>
                    ) : null}
                  </div>
                </div>
                <DropdownMenuGroup>
                  <DropdownMenuItem
                    onClick={async () => {
                      const { isDesktopApp, navigateDesktopBrowser } = await import(
                        "@/lib/desktop-bridge"
                      );
                      if (isDesktopApp()) {
                        navigateDesktopBrowser("http://localhost:3010/settings");
                      } else {
                        void navigate({ to: "/settings" });
                      }
                    }}
                  >
                    <IconSettings />
                    Settings
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setDark(!dark)}>
                    {dark ? <IconSun /> : <IconMoon />}
                    {dark ? "Light mode" : "Dark mode"}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    disabled={chromeBusy}
                    onClick={() => void openConnectChrome()}
                  >
                    <IconBrandChrome />
                    {chromeBusy ? "Chrome startet…" : "Connect-Chrome"}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    disabled={chromeBusy}
                    onClick={() =>
                      void openConnectChrome(
                        "https://chromewebstore.google.com/category/extensions",
                      )
                    }
                  >
                    <IconPuzzle />
                    Extensions
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() =>
                      void navigate({ to: "/settings", hash: "lab-desktop" })
                    }
                  >
                    <IconDeviceDesktop />
                    Connect Desktop
                  </DropdownMenuItem>
                  {chromeMsg ? (
                    <p
                      className={
                        chromeOk
                          ? "max-w-64 px-2 py-1.5 text-[11px] leading-snug text-muted-foreground"
                          : "max-w-64 px-2 py-1.5 text-[11px] leading-snug text-destructive"
                      }
                      role={chromeOk ? "status" : "alert"}
                    >
                      {chromeMsg}
                    </p>
                  ) : null}
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  disabled={signOut.isPending}
                  onClick={async () => {
                    try {
                      await signOut.mutateAsync();
                    } catch {
                      window.alert("Abmelden fehlgeschlagen. Bitte erneut versuchen.");
                      return;
                    }
                    goToSignInAfterSignOut();
                  }}
                  variant="destructive"
                >
                  <IconLogout />
                  Abmelden
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
