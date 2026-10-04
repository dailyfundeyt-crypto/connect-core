/**
 * Mobile agent settings — rendered on mobile viewports instead of the desktop sidebar.
 * Contains: Profile (read-only), Agent identity, phone, shell, plus API keys, model, MCP, voice cards.
 */

import {
  IconUser,
  IconRobot,
  IconKey,
  IconPlugConnected,
  IconMicrophone,
  IconCloudUpload,
  IconShieldLock,
  IconSettings,
  IconPlug,
  IconChevronRight,
  IconMail,
  IconDatabase,
  IconArrowLeft,
  IconBrain,
  IconBolt,
} from "@tabler/icons-react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/app-sidebar/user-avatar";
import { getLocalProfile } from "@/lib/auth/local-profile";
import { currentUserQueryOptions } from "@/lib/auth/queries";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";

function useIsMobile(): boolean {
  const [mobile, setMobile] = useState(false);
  if (typeof window !== "undefined" && !mobile) {
    setMobile(window.innerWidth < 768);
  }
  return mobile;
}

interface SettingsCardProps {
  icon: React.ReactNode;
  title: string;
  description?: string;
  onClick?: () => void;
  href?: string;
  badge?: string;
}

function SettingsCard({ icon, title, description, onClick, href, badge }: SettingsCardProps) {
  const content = (
    <>
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white/[0.06] text-white/60">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate text-[15px] font-medium text-white">{title}</span>
          {badge && (
            <span className="shrink-0 rounded-full bg-sky-500/20 px-2 py-0.5 text-[11px] text-sky-400">
              {badge}
            </span>
          )}
        </span>
        {description && (
          <span className="block truncate text-[13px] text-white/40">{description}</span>
        )}
      </span>
      <IconChevronRight className="size-4 shrink-0 text-white/25" />
    </>
  );

  if (href) {
    return (
      <Link
        className="flex items-center gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.03] p-4 text-white active:bg-white/[0.07]"
        to={href}
      >
        {content}
      </Link>
    );
  }

  return (
    <button
      className="flex w-full items-center gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.03] p-4 text-left text-white active:bg-white/[0.07]"
      onClick={onClick}
      type="button"
    >
      {content}
    </button>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="mb-2 px-1 text-[12px] font-semibold uppercase tracking-wider text-white/30">{children}</p>;
}

function CardRow({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-2">{children}</div>;
}

/** Export to check if mobile viewport */
export { useIsMobile };

export function MobileAgentSettings({ agentId }: { agentId?: string }) {
  const { data: currentUser } = useQuery(currentUserQueryOptions());
  const profile = getLocalProfile();

  const displayName =
    profile.name.trim() && profile.name !== "Connect User"
      ? profile.name.trim()
      : currentUser?.name || currentUser?.email || "Du";

  return (
    <div className="min-h-0 flex-1 overflow-y-auto bg-[#000]">
      <div className="mx-auto flex w-full max-w-[560px] flex-col px-4 pb-8 pt-4">
        {/* Back */}
        <div className="mb-4 flex items-center">
          <Button
            render={(props) => (
              <Link {...props} to="/">
                <IconArrowLeft className="mr-1 size-4" />
                Zurück
              </Link>
            )}
            size="sm"
            type="button"
            variant="ghost"
            className="text-[#666] hover:text-white"
          />
        </div>

        <h1 className="mb-6 text-xl font-bold text-white">Agent-Einstellungen</h1>

        {/* Profile (read-only) */}
        <SectionLabel>Profil</SectionLabel>
        <div className="mb-4 flex items-center gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.03] p-4">
          <UserAvatar
            className="size-12 shrink-0 bg-white/10 text-base font-medium text-white!"
            fallbackEmail={currentUser?.email}
            fallbackImage={currentUser?.image}
            profile={profile}
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[16px] font-semibold text-white">{displayName}</p>
            {currentUser?.email && (
              <p className="truncate text-[13px] text-white/40">{currentUser.email}</p>
            )}
            <p className="mt-1 text-[12px] text-white/25">Rolle: Admin</p>
          </div>
        </div>

        {/* Agent Identity */}
        <SectionLabel>Connect-Agenten</SectionLabel>
        <div className="mb-4 flex flex-col gap-2">
          <SettingsCard
            href={agentId ? `/agents?agent=${agentId}&tab=mine` : "/agents"}
            icon={<IconRobot className="size-5" />}
            title="Agent-Identität"
            description="Name, Avatar, Verhalten"
          />
          <SettingsCard
            href={agentId ? `/agents?agent=${agentId}&tab=phone` : "/agents"}
            icon={<IconPlug className="size-5" />}
            title="Agent-Phone"
            description="Telefonnummer & Anruf"
          />
          <SettingsCard
            href={agentId ? `/agents?agent=${agentId}&tab=shell` : "/agents"}
            icon={<IconBolt className="size-5" />}
            title="Agent-Shell"
            description="Browser & Shell-Verhalten"
          />
          <SettingsCard
            icon={<IconKey className="size-5" />}
            title="API-Keys"
            description="Globale Keys für alle Agents"
            href="/settings"
          />
          <SettingsCard
            icon={<IconBrain className="size-5" />}
            title="Model Provider"
            description="OpenAI, Anthropic, etc."
            href="/settings"
          />
          <SettingsCard
            icon={<IconPlugConnected className="size-5" />}
            title="MCP-Server"
            description="Model Context Protocol"
            href="/settings/mcp"
          />
          <SettingsCard
            icon={<IconMicrophone className="size-5" />}
            title="Voice"
            description="Sprachausgabe & ElevenLabs"
            href="/settings"
          />
        </div>

        {/* Sync row */}
        <SectionLabel>Sync & Backup</SectionLabel>
        <CardRow className="mb-4">
          <SettingsCard
            icon={<IconCloudUpload className="size-5" />}
            title="Cloud-Sync"
            description="Google Drive"
            href="/settings"
          />
          <SettingsCard
            icon={<IconDatabase className="size-5" />}
            title="Supabase Sync"
            description="Echtzeit-Backup"
            href="/settings"
          />
        </CardRow>

        {/* Bottom row */}
        <SectionLabel>Weitere</SectionLabel>
        <CardRow className="mb-4">
          <SettingsCard
            icon={<IconShieldLock className="size-5" />}
            title="Datenschutz"
            description="Lokale Daten"
            href="/settings"
          />
          <SettingsCard
            icon={<IconSettings className="size-5" />}
            title="Erweitert"
            description="Agent-Konfiguration"
            href="/settings"
          />
        </CardRow>
      </div>
    </div>
  );
}
