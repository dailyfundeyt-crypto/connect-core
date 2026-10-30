import { IconChevronLeft } from "@tabler/icons-react";
import { Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { SidebarToggle } from "@/components/layout/sidebar-toggle";
import { useChannelEvents } from "@/lib/channels/use-channel-events";
import { useMobileShell } from "@/lib/mobile/use-mobile-shell";
import { ROUTES } from "@connect/contracts";
import { MobileHome } from "./mobile-home";
import "./mobile.css";

const MOBILE_BG = "#07080c";

/** Pfade, die auf dem Handy die eigene Handy-Ansicht bekommen. */
export function isMobileShellPath(pathname: string): boolean {
  // oneconv: /agent/<id> is the conversation now; /channel/<id> forwards there.
  return (
    pathname === "/" ||
    pathname === "" ||
    pathname.startsWith("/channel/") ||
    pathname.startsWith("/agent/") ||
    // helium-social: Connect Social auf dem Handy bildschirmfüllend im dunklen Rahmen
    pathname === ROUTES.social ||
    pathname.startsWith(`${ROUTES.social}/`)
  );
}

/** Dunkler Seitenhintergrund + Statusleistenfarbe, solange die Handy-Ansicht offen ist. */
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
 * Rahmen der Handy-Version (nur unter 768px auf Touch-Geräten, siehe useMobileShell):
 * "/" = Swipe Fokus/Chats/Browser/Unternehmen, "/channel/…" = Chat bildschirmfüllend.
 */
export function MobileShell() {
  const location = useLocation();
  useChannelEvents();
  useMobileChrome();
  const isHome = location.pathname === "/" || location.pathname === "";
  if (isHome) return <MobileHome />;
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
