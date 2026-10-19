/** Analysis – Einstieg in Feed, Suche und Firmenprofile. */
import { useLocation, useNavigate } from "@tanstack/react-router";
import { IconUsersGroup } from "@tabler/icons-react";
import { getActiveLevel, setActiveLevel } from "@/lib/companies/level";
import { cn } from "@/lib/utils";

export function SocialRailButton() {
  const navigate = useNavigate();
  const location = useLocation();
  const active = location.pathname === "/social" || location.pathname.startsWith("/social/");
  return (
    <button
      aria-current={active ? "page" : undefined}
      aria-label="Analysis"
      className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-lg transition-colors",
        active
          ? "bg-sidebar-accent text-sidebar-foreground shadow-[inset_0_0_0_1px_var(--sidebar-border)]"
          : "text-sidebar-foreground/55 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground",
      )}
      data-testid="social-rail-button"
      onClick={() => {
        if (getActiveLevel() === 1) setActiveLevel(2);
        void navigate({ to: "/social" });
      }}
      title="Analysis – Feed, Suche, Firmenprofile"
      type="button"
    >
      <IconUsersGroup aria-hidden className="size-5" stroke={1.8} />
    </button>
  );
}
