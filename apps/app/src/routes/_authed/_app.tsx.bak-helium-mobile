import {
  createFileRoute,
  Outlet,
  useLocation,
  useNavigate,
  useParams,
} from "@tanstack/react-router";
import { useEffect, useState } from "react";
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
import { isDesktopApp } from "@/lib/desktop-bridge";

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

  // Browser (3) + Unternehmen (4) leave HQ work routes.
  useEffect(() => {
    if (level !== 3 && level !== 4) return;
    if (!isHqPath(location.pathname)) return;
    const companyId =
      params.companyId ??
      (typeof window !== "undefined"
        ? window.localStorage.getItem("connect.activeCompanyId")
        : null);
    if (!companyId) return;
    void navigate({
      to: "/company/$companyId",
      params: { companyId },
      search: { level },
      replace: true,
    });
  }, [level, location.pathname, navigate, params.companyId]);

  const companyId =
    params.companyId ??
    (typeof window !== "undefined"
      ? window.localStorage.getItem("connect.activeCompanyId")
      : null);

  const focusAgent =
    level === 1
      ? (location.search as { agent?: string }).agent
      : undefined;

  // Focus + Messages share AppSidebar. Browser + Unternehmen get slim chrome.
  const hqShell = level === 1 || level === 2;
  const isDesktop = isDesktopApp();
  const isSidebarRole =
    typeof window !== "undefined" && (window as any).__CONNECT_SIDEBAR__ === true;
  const isMainRole =
    typeof window !== "undefined" && (window as any).__CONNECT_SIDEBAR__ === false;

  const hideMainInDesktop = isDesktop && level === 3 && !isMainRole;

  return (
    <SidebarShell
      className={
        hqShell
          ? "h-svh overflow-hidden"
          : "lab-light h-svh overflow-hidden bg-background"
      }
      width={hqShell ? "340px" : "300px"}
    >
      {isMainRole ? null : (hqShell ? <AppSidebar /> : <LevelChromeSidebar />)}
      {!isSidebarRole && !hideMainInDesktop && (
        <main
          className={
            hqShell
              ? "relative flex min-h-0 flex-1 flex-col overflow-hidden"
              : "relative flex min-h-0 flex-1 flex-col overflow-hidden border-l border-neutral-200 bg-background"
          }
        >
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <Outlet />
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
