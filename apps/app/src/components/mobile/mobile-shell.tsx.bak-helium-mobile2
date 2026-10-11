import { IconChevronLeft } from "@tabler/icons-react";
import { Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { SidebarToggle } from "@/components/layout/sidebar-toggle";
import { MobileHome } from "@/components/mobile/mobile-home";
import { useChannelEvents } from "@/lib/channels/use-channel-events";
import { useMobileShell } from "@/lib/mobile/use-mobile-shell";
import "./mobile.css";

const MOBILE_BG = "#0e0e10";

/** Pfade, die auf dem Handy die eigene Handy-Ansicht bekommen. */
export function isMobileShellPath(pathname: string): boolean {
  return pathname === "/" || pathname === "" || pathname.startsWith("/channel/");
}

/** Darker Seitenhintergrund + Statusleistenfarbe, solange die Handy-Ansicht offen ist. */
function useMobileChrome() {
  useEffect(() => {
    const html = document.documentElement;
    const previousBg = html.style.backgroundColor;
    const previousScheme = html.style.colorScheme;
    html.style.backgroundColor = MOBILE_BG;
    html.style.colorScheme = "dark";
    const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    const previousTheme = meta?.content;
    if (meta) meta.content = MOBILE_BG;
    return () => {
      html.style.backgroundColor = previousBg;
      html.style.colorScheme = previousScheme;
      if (meta && previousTheme !== undefined) meta.content = previousTheme;
    };
  }, []);
}

/**
 * Mobile home. The swipe navigator that used to live here was a shell: three
 * sections whose whole content was a heading plus "Browser-Tabs erscheinen
 * hier", navigating to /browser, /focus and /companies -- none of which are
 * routes. MobileHome is the real mobile page (tabs, bots, profile, companies),
 * so "/" renders that instead.
 */
function SwipeNavigator() {
  return <MobileHome />;
}

/**
 * Rahmen der Handy-Version (nur unter 768px auf Touch-Geräten, siehe useMobileShell):
 * "/" zeigt den Swipe-Navigator (Browser/Focus/Unternehmen), "/channel/…" den Chat bildschirmfüllend.
 */
export function MobileShell() {
  const location = useLocation();
  useChannelEvents();
  useMobileChrome();
  const isHome = location.pathname === "/" || location.pathname === "";
  if (isHome) return <SwipeNavigator />;
  return (
    <div
      className="dark connect-mobile-chat flex h-svh flex-col overflow-hidden bg-background pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)] text-foreground"
      style={{ backgroundColor: MOBILE_BG }}
    >
      <Outlet />
    </div>
  );
}

/**
 * Im Chat-Kopf: auf dem Handy ein Zurück-Pfeil zur Chatliste, sonst unverändert
 * der normale Sidebar-Schalter (Desktop bleibt gleich).
 */
export function MobileBackOrSidebarToggle() {
  const mobile = useMobileShell();
  const navigate = useNavigate();
  if (!mobile) return <SidebarToggle />;
  return (
    <button
      aria-label="Zurück zur Chatliste"
      className="-ml-1 flex size-9 shrink-0 items-center justify-center rounded-full text-foreground active:bg-white/10"
      onClick={() => void navigate({ to: "/" })}
      type="button"
    >
      <IconChevronLeft className="size-6" />
    </button>
  );
}
