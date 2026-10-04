import { IconChevronLeft } from "@tabler/icons-react";
import { Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { SidebarToggle } from "@/components/layout/sidebar-toggle";
import { useChannelEvents } from "@/lib/channels/use-channel-events";
import { useMobileShell } from "@/lib/mobile/use-mobile-shell";
import { cn } from "@/lib/utils";
import "./mobile.css";

const MOBILE_BG = "#0e0e10";

/** Swipeable sections — 0=Browser, 1=Focus, 2=Companies */
const SWIPE_SECTIONS = [
  { id: "browser", label: "Browser" },
  { id: "focus", label: "Focus" },
  { id: "companies", label: "Unternehmen" },
] as const;
type SwipeSection = (typeof SWIPE_SECTIONS)[number]["id"];

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
 * Horizontal swipe navigator for mobile sections.
 * Swipe left/right to move between Home, Browser, Settings.
 */
function SwipeNavigator() {
  const navigate = useNavigate();
  const [section, setSection] = useState<SwipeSection>("home");
  const [offset, setOffset] = useState(0);
  const startX = useRef(0);
  const startSection = useRef<SwipeSection>("home");
  const containerRef = useRef<HTMLDivElement>(null);

  const goTo = useCallback(
    (s: SwipeSection) => {
      if (s === startSection.current) return;
      const from = SWIPE_SECTIONS.findIndex((x) => x.id === startSection.current);
      const to = SWIPE_SECTIONS.findIndex((x) => x.id === s);
      setOffset(to - from);
      startSection.current = s;
      setSection(s);
      // Navigate to the route for this section
      if (s === "companies") void navigate({ to: "/settings", hash: "companies" });
      else if (s === "browser") void navigate({ to: "/browser" });
      else if (s === "focus") void navigate({ to: "/focus" });
    },
    [navigate],
  );

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    startX.current = e.touches[0].clientX;
  }, []);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    const dx = e.touches[0].clientX - startX.current;
    const w = containerRef.current?.offsetWidth ?? window.innerWidth;
    setOffset(dx / w);
  }, []);

  const onTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      const dx = e.changedTouches[0].clientX - startX.current;
      const w = containerRef.current?.offsetWidth ?? window.innerWidth;
      const threshold = w * 0.2;
      const currentIdx = SWIPE_SECTIONS.findIndex((x) => x.id === startSection.current);
      if (dx < -threshold && currentIdx < SWIPE_SECTIONS.length - 1) {
        goTo(SWIPE_SECTIONS[currentIdx + 1].id);
      } else if (dx > threshold && currentIdx > 0) {
        goTo(SWIPE_SECTIONS[currentIdx - 1].id);
      } else {
        setOffset(0);
      }
    },
    [goTo],
  );

  return (
    <div
      className="relative flex flex-1 flex-col overflow-hidden"
      ref={containerRef}
      onTouchEnd={onTouchEnd}
      onTouchMove={onTouchMove}
      onTouchStart={onTouchStart}
    >
      {/* Progress bar at top showing current page index */}
      <div className="absolute left-0 right-0 top-0 z-20 flex justify-center gap-1 px-4 pt-[max(0.5rem,env(safe-area-inset-top))]">
        {SWIPE_SECTIONS.map((s, i) => (
          <div
            key={s.id}
            className={cn(
              "h-[3px] rounded-full transition-all duration-200",
              section === s.id ? "w-8 bg-white" : "w-3 bg-white/25",
            )}
          />
        ))}
      </div>

      {/* Dot indicators at bottom center */}
      <div className="absolute bottom-2 left-0 right-0 z-20 flex justify-center gap-1.5">
        {SWIPE_SECTIONS.map((s) => (
          <button
            aria-label={s.label}
            className={cn(
              "h-1 rounded-full transition-all duration-200",
              section === s.id ? "w-4 bg-white/70" : "w-1 bg-white/30",
            )}
            key={s.id}
            onClick={() => goTo(s.id)}
            type="button"
          />
        ))}
      </div>

      {/* Slide wrapper */}
      <div
        className="flex flex-1 transition-transform duration-200"
        style={{ transform: `translateX(${offset * 100}%)` }}
      >
        {/* Browser section */}
        <div className="min-w-full flex-1 overflow-y-auto bg-[#0e0e10] pb-8">
          <div className="p-4 pt-[max(2.5rem,env(safe-area-inset-top))]">
            <h2 className="text-lg font-semibold text-white">Browser</h2>
            <p className="mt-2 text-sm text-white/50">
              Browser-Tabs erscheinen hier. Öffne einen Tab aus der Chats-Liste.
            </p>
          </div>
        </div>
        {/* Focus section */}
        <div className="min-w-full flex-1 overflow-y-auto bg-[#0e0e10] pb-8">
          <div className="p-4 pt-[max(2.5rem,env(safe-area-inset-top))]">
            <h2 className="text-lg font-semibold text-white">Focus</h2>
            <p className="mt-2 text-sm text-white/50">
              Fokussierte Tabs und Ansichten erscheinen hier.
            </p>
          </div>
        </div>
        {/* Companies section */}
        <div className="min-w-full flex-1 overflow-y-auto bg-[#0e0e10] pb-8">
          <div className="p-4 pt-[max(2.5rem,env(safe-area-inset-top))]">
            <h2 className="text-lg font-semibold text-white">Unternehmen</h2>
            <p className="mt-2 text-sm text-white/50">
              Unternehmens- und Team-Einstellungen.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
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
