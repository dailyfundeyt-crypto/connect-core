/**
 * Store Icon Resolver (Lane 8)
 * Maps catalog icon names to Tabler Icons with Play Store style backgrounds.
 */

import React from "react";
import {
  IconApps,
  IconBrandGithub,
  IconBriefcase,
  IconBrowser,
  IconChartBar,
  IconDatabase,
  IconFileText,
  IconFolder,
  IconMicrophone,
  IconPackage,
  IconPalette,
  IconRocket,
  IconSchool,
  IconShare,
  IconSparkles,
  IconTerminal2,
  IconWorld,
  type TablerIcon,
} from "@tabler/icons-react";
import { cn } from "@/lib/utils";

const ICON_MAP: Record<string, { icon: TablerIcon; bg: string; color: string }> = {
  IconFolder: { icon: IconFolder, bg: "bg-blue-500/15", color: "text-blue-500" },
  IconBrandGithub: { icon: IconBrandGithub, bg: "bg-slate-500/15", color: "text-slate-300" },
  IconDatabase: { icon: IconDatabase, bg: "bg-emerald-500/15", color: "text-emerald-500" },
  IconWorld: { icon: IconWorld, bg: "bg-orange-500/15", color: "text-orange-500" },
  IconShare: { icon: IconShare, bg: "bg-violet-500/15", color: "text-violet-500" },
  IconBrowser: { icon: IconBrowser, bg: "bg-cyan-500/15", color: "text-cyan-500" },
  IconTerminal2: { icon: IconTerminal2, bg: "bg-emerald-500/15", color: "text-emerald-400" },
  IconChartBar: { icon: IconChartBar, bg: "bg-pink-500/15", color: "text-pink-500" },
  IconSparkles: { icon: IconSparkles, bg: "bg-amber-500/15", color: "text-amber-500" },
  IconFileText: { icon: IconFileText, bg: "bg-indigo-500/15", color: "text-indigo-500" },
  IconMicrophone: { icon: IconMicrophone, bg: "bg-rose-500/15", color: "text-rose-500" },
  IconBriefcase: { icon: IconBriefcase, bg: "bg-teal-500/15", color: "text-teal-500" },
  IconSchool: { icon: IconSchool, bg: "bg-amber-500/15", color: "text-amber-500" },
  IconRocket: { icon: IconRocket, bg: "bg-red-500/15", color: "text-red-500" },
  IconPalette: { icon: IconPalette, bg: "bg-fuchsia-500/15", color: "text-fuchsia-500" },
  IconPackage: { icon: IconPackage, bg: "bg-sky-500/15", color: "text-sky-500" },
};

interface StoreAppIconProps {
  name?: string;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
}

export function StoreAppIcon({ name, size = "md", className }: StoreAppIconProps) {
  const meta = (name && ICON_MAP[name]) || {
    icon: IconApps,
    bg: "bg-primary/10",
    color: "text-primary",
  };
  const IconComp = meta.icon;

  const sizeClasses = {
    sm: "w-9 h-9 rounded-xl p-2",
    md: "w-12 h-12 rounded-2xl p-2.5",
    lg: "w-16 h-16 rounded-[20px] p-3.5",
    xl: "w-20 h-20 rounded-[24px] p-4",
  };

  const iconSizes = {
    sm: 18,
    md: 24,
    lg: 32,
    xl: 40,
  };

  return (
    <div
      className={cn(
        "flex items-center justify-center shrink-0 shadow-md border border-white/5 transition-transform group-hover:scale-105",
        meta.bg,
        sizeClasses[size],
        className,
      )}
    >
      <IconComp size={iconSizes[size]} className={meta.color} />
    </div>
  );
}
