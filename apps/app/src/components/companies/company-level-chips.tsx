import {
  IconBrowser,
  IconBuilding,
  IconChevronLeft,
  IconMessages,
  IconBolt,
} from "@tabler/icons-react";
import { useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  type CompanyLevel,
  getActiveLevel,
  LEVEL_LABELS,
  MODE_NAMES,
  setActiveLevel,
  subscribeLevel,
} from "@/lib/companies/level";
import { notifyDesktopLevel } from "@/lib/desktop-bridge";
import { cn } from "@/lib/utils";

/** Focus · Messages · Browser · Unternehmen */
const MODE_ICONS = {
  1: IconBolt,
  2: IconMessages,
  3: IconBrowser,
  4: IconBuilding,
} as const;

const MODES = [1, 2, 3, 4] as const;

/**
 * Mode emblems in the sidebar header rail.
 */
export function CompanyLevelChips({
  className,
  compact: _compact,
}: {
  className?: string;
  compact?: boolean;
}) {
  const navigate = useNavigate();
  const params = useParams({ strict: false }) as { companyId?: string };
  const search = useSearch({ strict: false }) as { level?: number };
  const [activeId, setActiveId] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return window.localStorage.getItem("connect.activeCompanyId");
  });
  const [storedLevel, setStoredLevel] = useState<CompanyLevel>(() =>
    getActiveLevel(),
  );

  useEffect(() => {
    const sync = () =>
      setActiveId(window.localStorage.getItem("connect.activeCompanyId"));
    window.addEventListener("connect-active-company", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("connect-active-company", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  useEffect(() => subscribeLevel(() => setStoredLevel(getActiveLevel())), []);

  const companyId = params.companyId ?? activeId;
  if (!companyId) return null;

  const levelFromRoute =
    params.companyId && search.level != null ? search.level : undefined;
  const level: CompanyLevel =
    storedLevel === 1
      ? 1
      : levelFromRoute === 2 ||
          levelFromRoute === 3 ||
          levelFromRoute === 4
        ? (levelFromRoute as CompanyLevel)
        : storedLevel === 2 || storedLevel === 3 || storedLevel === 4
          ? storedLevel
          : 2;

  return (
    <div
      aria-label="Company mode"
      className={cn(
        "flex w-fit shrink-0 items-center gap-1",
        "group-data-[collapsible=icon]:w-full group-data-[collapsible=icon]:flex-col group-data-[collapsible=icon]:gap-1",
        className,
      )}
    >
      {MODES.map((value) => {
        const Icon = MODE_ICONS[value];
        const active = level === value;
        return (
          <button
            aria-current={active ? "page" : undefined}
            aria-label={MODE_NAMES[value]}
            className={cn(
              "flex size-8 shrink-0 items-center justify-center rounded-lg transition-colors",
              active
                ? "bg-sidebar-accent text-sidebar-foreground shadow-[inset_0_0_0_1px_var(--sidebar-border)]"
                : "text-sidebar-foreground/55 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground",
            )}
            key={value}
            onClick={() => {
              setActiveLevel(value);
              notifyDesktopLevel(value);
              if (value === 1) return;
              if (value === 2) {
                void navigate({ to: "/" });
                return;
              }
              void navigate({
                to: "/company/$companyId",
                params: { companyId },
                search: { level: value },
              });
            }}
            title={LEVEL_LABELS[value]}
            type="button"
          >
            <Icon className="size-4" stroke={1.75} />
          </button>
        );
      })}
    </div>
  );
}

/** Compact expand control for the icon rail. */
export function SidebarCollapseGlyph({ expanded }: { expanded: boolean }) {
  return (
    <IconChevronLeft
      className={cn(
        "size-4 transition-transform",
        !expanded && "rotate-180",
      )}
      stroke={1.75}
    />
  );
}
