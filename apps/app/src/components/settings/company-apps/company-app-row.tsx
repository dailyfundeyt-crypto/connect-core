import { useState } from "react";
import {
  IconArrowUp,
  IconArrowDown,
  IconBrain,
  IconChartHistogram,
  IconNews,
  IconReceiptTax,
  IconShoppingBag,
  IconApps,
} from "@tabler/icons-react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { CompanyAppItem } from "./types";

interface CompanyAppRowProps {
  app: CompanyAppItem;
  index: number;
  totalCount: number;
  onToggle: (appId: string, enabled: boolean) => void;
  onReorder: (appId: string, direction: "up" | "down") => void;
  disabled?: boolean;
}

function FallbackAppIcon({ appId, className }: { appId: string; className?: string }) {
  switch (appId) {
    case "connect-sozial":
      return <IconNews className={className} />;
    case "flux":
      return <IconShoppingBag className={className} />;
    case "analysis":
      return <IconChartHistogram className={className} />;
    case "brain":
      return <IconBrain className={className} />;
    case "finance":
      return <IconReceiptTax className={className} />;
    default:
      return <IconApps className={className} />;
  }
}

export function CompanyAppRow({
  app,
  index,
  totalCount,
  onToggle,
  onReorder,
  disabled = false,
}: CompanyAppRowProps) {
  const [imgError, setImgError] = useState(false);

  return (
    <div
      className={cn(
        "group flex flex-col gap-3 rounded-2xl border p-3.5 transition-all duration-200 sm:flex-row sm:items-center sm:justify-between sm:gap-4",
        app.enabled
          ? "border-white/10 bg-neutral-900/60 shadow-sm hover:border-white/20 hover:bg-neutral-900/80"
          : "border-white/5 bg-neutral-950/40 opacity-70 hover:opacity-90"
      )}
    >
      {/* Linke Seite: Logo + Name + Beschreibung */}
      <div className="flex min-w-0 items-start gap-3 sm:items-center">
        {/* App Logo mit Fallback */}
        <div className="relative flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-neutral-800/80 shadow-inner">
          {app.appLogo && !imgError ? (
            <img
              src={app.appLogo}
              alt={app.appName}
              className="size-7 object-contain transition-transform group-hover:scale-105"
              onError={() => setImgError(true)}
              loading="lazy"
            />
          ) : (
            <FallbackAppIcon appId={app.appId} className="size-6 text-sky-400" />
          )}
          {app.enabled && (
            <span
              className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full bg-emerald-500 ring-2 ring-neutral-900"
              title="Aktiv"
            />
          )}
        </div>

        {/* Name, Status & Kurzbeschreibung */}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="truncate text-sm font-semibold tracking-tight text-white">
              {app.appName || app.appId}
            </h4>
            <span
              className={cn(
                "inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-medium tracking-wide uppercase",
                app.enabled
                  ? "border border-emerald-500/20 bg-emerald-500/10 text-emerald-400"
                  : "border border-white/10 bg-white/5 text-neutral-400"
              )}
            >
              {app.enabled ? "Aktiv" : "Deaktiviert"}
            </span>
          </div>
          {app.description ? (
            <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-neutral-400">
              {app.description}
            </p>
          ) : null}
        </div>
      </div>

      {/* Rechte Seite: Sortierung & Toggle */}
      <div className="flex items-center justify-between gap-3 border-t border-white/5 pt-2 sm:border-t-0 sm:pt-0">
        {/* Sortierung: Nach oben / nach unten */}
        <div className="flex items-center gap-1 rounded-lg border border-white/10 bg-neutral-950/60 p-0.5">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-7 rounded-md text-neutral-400 hover:bg-white/10 hover:text-white disabled:opacity-30"
            disabled={disabled || index === 0}
            onClick={() => onReorder(app.appId, "up")}
            title="Nach oben verschieben"
            aria-label="Nach oben verschieben"
          >
            <IconArrowUp className="size-3.5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-7 rounded-md text-neutral-400 hover:bg-white/10 hover:text-white disabled:opacity-30"
            disabled={disabled || index === totalCount - 1}
            onClick={() => onReorder(app.appId, "down")}
            title="Nach unten verschieben"
            aria-label="Nach unten verschieben"
          >
            <IconArrowDown className="size-3.5" />
          </Button>
        </div>

        {/* Toggle Switch */}
        <div className="flex items-center gap-2.5">
          <span className="text-xs font-medium text-neutral-300 sm:hidden">
            {app.enabled ? "Aktiviert" : "Aus"}
          </span>
          <Switch
            checked={app.enabled}
            disabled={disabled}
            onCheckedChange={(checked: boolean) => onToggle(app.appId, checked)}
            aria-label={`${app.appName} aktivieren oder deaktivieren`}
          />
        </div>
      </div>
    </div>
  );
}
