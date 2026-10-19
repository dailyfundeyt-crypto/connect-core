import {
  createFileRoute,
  Outlet,
  useLocation,
  useNavigate,
  useParams,
} from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppSidebar } from "@/components/app-sidebar/app-sidebar";
import { FocusOverlay } from "@/components/companies/focus-overlay";
import { LevelChromeSidebar } from "@/components/companies/level-chrome-sidebar";
import { SidebarShell } from "@/components/layout/sidebar-shell";
import {
  type CompanyLevel,
  getActiveLevel,
  setActiveLevel,
  subscribeLevel,
} from "@/lib/companies/level";
import {
  readActiveCompanyId,
  resolveCompanyId,
} from "@/lib/companies/store";
import { isDesktopApp } from "@/lib/desktop-bridge";
import { useNotchBridge } from "@/lib/voice/notch-bridge";
import {
  isMobileShellPath,
  MobileShell,
} from "@/components/mobile/mobile-shell";
import { useMobileShell } from "@/lib/mobile/use-mobile-shell";
import { MobilePageFrame } from "@/components/mobile/mobile-page-frame";

export const Route = createFileRoute("/_authed/_app")({
  component: RouteComponent,
});

/** Routes that belong only to HQ (roster + chat). */
const HQ_ONLY_PREFIXES = [
  "/channel",
  "/agents",
  "/market",
  "/bot",
  "/routines",
  "/skills",
];

function isHqPath(pathname: string): boolean {
  if (pathname === "/" || pathname === "") return true;
  return HQ_ONLY_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

function RouteComponent() {
  const [level, setLevel] = useState<CompanyLevel>(() => getActiveLevel());
  const location = useLocation();
  const navigate = useNavigate();
  const params = useParams({ strict: false }) as { companyId?: string };
  // Handy (unter 768px + Touch): eigene Ansicht, Desktop bleibt unverändert.
  const mobileShell = useMobileShell();

  // Connect Notch voice calls: this window takes the spoken turns (never the sidebar-only window).
  const openVoiceChannel = useCallback(
    (channelId: string) => {
      void navigate({ to: "/channel/$channelId", params: { channelId } });
    },
    [navigate],
  );
  useNotchBridge({
    enabled:
      typeof window !== "undefined" &&
      (window as { __CONNECT_SIDEBAR__?: boolean }).__CONNECT_SIDEBAR__ !== true,
    openChannel: openVoiceChannel,
  });

  useEffect(() => subscribeLevel(() => setLevel(getActiveLevel())), []);

  // Sync stored level from /company?level=
  useEffect(() => {
    const match = location.search as { level?: number; agent?: string };
    if (
      location.pathname.includes("/company/") &&
      (match.level === 1 ||
        match.level === 2 ||
        match.level === 3 ||
        match.level === 4)
    ) {
      if (match.level !== getActiveLevel()) {
        setActiveLevel(match.level);
      }
    }
  }, [location.pathname, location.search]);

  // oneconv: a freshly opened /agent/<id> or old /channel/<id> link is a conversation the user
  // asked for — it switches to Messages (2) instead of being sent back to the company page.
  const conversationLinkRef = useRef<string | null>(null);

  // Browser (3) + Unternehmen (4) leave HQ work routes.
  useEffect(() => {
    if (mobileShell) return;
    const conversationLink = /^\/(agent|channel)\/[^/]+/.test(location.pathname);
    const freshLink = conversationLink && conversationLinkRef.current !== location.pathname;
    if (conversationLink) conversationLinkRef.current = location.pathname;
    if (level !== 3 && level !== 4) return;
    if (freshLink) {
      setActiveLevel(2);
      return;
    }
    if (!isHqPath(location.pathname)) return;
    /*
     * Normalized, and verified against the company list. This read the raw stored value, so a
     * JSON-quoted id went straight into the route: the app navigated itself to
     * `/company/"spark"`, which resolves to no company, which showed "Company not found" — and
     * because this runs on a level change, it dragged the user back there every time they left.
     * The stored id is not trustworthy as a route segment; the route is the thing that must be
     * resolvable.
     */
    const companyId = resolveCompanyId(params.companyId ?? readActiveCompanyId());
    if (!companyId) return;
    void navigate({
      to: "/company/$companyId",
      params: { companyId },
      search: { level },
      replace: true,
    });
  }, [level, location.pathname, mobileShell, navigate, params.companyId]);

  const companyId =
    params.companyId ?? readActiveCompanyId();

  const focusAgent =
    level === 1
      ? (location.search as { agent?: string }).agent
      : undefined;

  // Focus is its own fullscreen page (no sidebar, no company chrome). Messages uses AppSidebar;
  // Browser + Unternehmen get slim chrome.
  const focusFullscreen = level === 1;
  const hqShell = level === 2;
  const isDesktop = isDesktopApp();
  const isSidebarRole =
    typeof window !== "undefined" && (window as any).__CONNECT_SIDEBAR__ === true;
  const isMainRole =
    typeof window !== "undefined" && (window as any).__CONNECT_SIDEBAR__ === false;

  const hideMainInDesktop = isDesktop && level === 3 && !isMainRole;

  if (mobileShell && isMobileShellPath(location.pathname)) {
    return <MobileShell />;
  }
  // helium-mobilefix: Handy = nie das PC-Layout. Jede andere Route (Neue Firma, Firmenprofil,
  // Agenten, Brain, Markt …) laeuft im mobilen Vollbild-Rahmen statt in SidebarShell mit
  // LevelChromeSidebar/AppSidebar (die unter 768px als Overlay-Sheet aufging). PC unveraendert.
  if (mobileShell) {
    return (
      <MobilePageFrame>
        <Outlet />
      </MobilePageFrame>
    );
  }

  return (
    <SidebarShell
      className={
        focusFullscreen
          ? "h-svh overflow-hidden bg-neutral-950"
          : hqShell
            ? "h-svh overflow-hidden"
            : "lab-light h-svh overflow-hidden bg-background"
      }
      width={focusFullscreen ? "0px" : hqShell ? "340px" : "300px"}
    >
      {isMainRole || focusFullscreen
        ? null
        : hqShell
          ? <AppSidebar />
          : <LevelChromeSidebar />}
      {!isSidebarRole && !hideMainInDesktop && (
        <main
          className={
            focusFullscreen
              ? "relative flex min-h-0 flex-1 flex-col overflow-hidden bg-neutral-950"
              : hqShell
                ? "relative flex min-h-0 flex-1 flex-col overflow-hidden"
                : "relative flex min-h-0 flex-1 flex-col overflow-hidden border-l border-neutral-200 bg-background"
          }
        >
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            {/* Focus is its own page: the previous page is not rendered underneath. */}
            {focusFullscreen ? null : <Outlet />}
          </div>
          {level === 1 && companyId ? (
            <FocusOverlay
              companyId={companyId}
              initialAgentId={focusAgent}
            />
          ) : null}
        </main>
      )}
    </SidebarShell>
  );
}
