/**
 * Profile hub bottom sheet — opens when the avatar in the mobile header is tapped.
 * Contains: Profile, Switch Company, Settings, Browser, Focus, Sync, Sign out.
 */

import {
  IconCompass,
  IconSettings,
  IconLogout,
  IconBuildingStore,
  IconCloudUpload,
  IconWorld,
  IconChevronRight,
} from "@tabler/icons-react";
import { useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { UserAvatar } from "@/components/app-sidebar/user-avatar";
import { getLocalProfile, subscribeLocalProfile, type LocalProfile } from "@/lib/auth/local-profile";
import { currentUserQueryOptions } from "@/lib/auth/queries";
import { signOutMutationOptions } from "@/lib/auth/mutations";
import { listCompanies, subscribeCompanies } from "@/lib/companies/store";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { cn } from "@/lib/utils";

function readActiveCompanyId(): string | null {
  try {
    const raw = window.localStorage.getItem("connect.activeCompanyId");
    if (!raw) return null;
    return raw.startsWith('"') ? (JSON.parse(raw) as string) : raw;
  } catch {
    return null;
  }
}

function useLocalProfileState(): LocalProfile {
  const [profile, setProfile] = useState<LocalProfile>(() => getLocalProfile());
  useEffect(() => subscribeLocalProfile(() => setProfile(getLocalProfile())), []);
  return profile;
}

function useWorkspaceTick(): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const bump = () => setTick((n) => n + 1);
    const offs = [subscribeCompanies(bump)];
    window.addEventListener("connect-active-company", bump);
    return () => {
      for (const off of offs) off();
      window.removeEventListener("connect-active-company", bump);
    };
  }, []);
  return tick;
}

/** Bottom sheet — no external dependencies */
function BottomSheet({ open, onClose, children }: { open: boolean; onClose: () => void; children: React.ReactNode }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[100] flex flex-col justify-end" role="dialog">
      <button
        aria-label="Schließen"
        className="absolute inset-0 bg-black/60"
        onClick={onClose}
        type="button"
      />
      <div className="relative rounded-t-3xl border-t border-white/10 bg-[#1c1c1e] px-3 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2 text-white shadow-2xl">
        <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-white/25" />
        {children}
      </div>
    </div>
  );
}

function SheetItem({
  icon,
  label,
  onClick,
  danger,
  description,
}: {
  icon: React.ReactNode;
  label: string;
  onClick?: () => void;
  danger?: boolean;
  description?: string;
}) {
  return (
    <button
      className={cn(
        "flex w-full items-center gap-3 rounded-2xl px-3 py-3.5 text-left text-[16px] active:bg-white/10",
        danger ? "text-red-400" : "text-white",
      )}
      onClick={onClick}
      type="button"
    >
      <span className="text-white/70">{icon}</span>
      <span className="flex-1">{label}</span>
      {description && <span className="text-[13px] text-white/40">{description}</span>}
      {!danger && <IconChevronRight className="size-4 text-white/30" />}
    </button>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="mb-1 px-3 text-[12px] text-white/35">{children}</p>;
}

export interface ProfileSheetProps {
  open: boolean;
  onClose: () => void;
}

export function ProfileSheet({ open, onClose }: ProfileSheetProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: currentUser } = useQuery(currentUserQueryOptions());
  const profile = useLocalProfileState();
  const tick = useWorkspaceTick();
  const signOut = useMutation(signOutMutationOptions(queryClient));

  const [signOutError, setSignOutError] = useState<string | null>(null);

  const displayName =
    profile.name.trim() && profile.name !== "Connect User"
      ? profile.name.trim()
      : currentUser?.name || currentUser?.email || "Du";

  const activeCompanyId = readActiveCompanyId();
  const companies = useMemo(() => {
    void tick;
    return listCompanies();
  }, [tick]);

  const setActiveCompany = (id: string) => {
    window.localStorage.setItem("connect.activeCompanyId", id);
    window.dispatchEvent(new Event("connect-active-company"));
    onClose();
  };

  const handleSignOut = useCallback(async () => {
    setSignOutError(null);
    try {
      await signOut.mutateAsync();
      onClose();
      await navigate({ to: "/sign" });
    } catch {
      setSignOutError("Abmelden fehlgeschlagen. Bitte erneut versuchen.");
    }
  }, [signOut, navigate, onClose]);

  return (
    <BottomSheet onClose={onClose} open={open}>
      {/* Profile header */}
      <div className="flex items-center gap-3 px-3 pb-3 pt-1">
        <UserAvatar
          className="size-12 bg-white/10 text-base font-medium text-white!"
          fallbackEmail={currentUser?.email}
          fallbackImage={currentUser?.image}
          profile={profile}
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[17px] font-semibold">{displayName}</p>
          {currentUser?.email ? (
            <p className="truncate text-[14px] text-white/50">{currentUser.email}</p>
          ) : null}
          {companies.length > 1 && (
            <p className="truncate text-[13px] text-white/35">
              {companies.find((c) => c.id === activeCompanyId)?.name || "Kein Unternehmen"}
            </p>
          )}
        </div>
      </div>

      <div className="border-t border-white/10 pt-1">
        <SectionLabel>Profil</SectionLabel>
        <SheetItem
          icon={<IconCompass className="size-5" />}
          label="Browser"
          onClick={() => { onClose(); void navigate({ to: "/browser" }); }}
        />
        <SheetItem
          icon={<IconCompass className="size-5" />}
          label="Focus"
          onClick={() => { onClose(); void navigate({ to: "/focus" }); }}
        />
      </div>

      {companies.length > 1 && (
        <div className="border-t border-white/10 pt-1">
          <SectionLabel>Unternehmen</SectionLabel>
          {companies.map((company) => (
            <button
              key={company.id}
              className={cn(
                "flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left text-[16px] active:bg-white/10",
                activeCompanyId === company.id ? "text-sky-400" : "text-white",
              )}
              onClick={() => setActiveCompany(company.id)}
              type="button"
            >
              {company.logo ? (
                <img alt={company.name} className="size-7 rounded-full object-cover" src={company.logo} />
              ) : (
                <span className="size-7 rounded-full" style={{ background: company.accent }} />
              )}
              <span className="flex-1 truncate">{company.name}</span>
              {activeCompanyId === company.id && <span className="text-[13px] text-white/50">✓</span>}
            </button>
          ))}
        </div>
      )}

      <div className="border-t border-white/10 pt-1">
        <SectionLabel>Einstellungen</SectionLabel>
        <SheetItem
          icon={<IconSettings className="size-5" />}
          label="Globale Einstellungen"
          onClick={() => { onClose(); void navigate({ to: "/settings" }); }}
        />
        <SheetItem
          icon={<IconCloudUpload className="size-5" />}
          label="Sync"
          onClick={() => { onClose(); void navigate({ to: "/settings", hash: "backup" }); }}
        />
      </div>

      <div className="border-t border-white/10 pt-1">
        {signOutError && (
          <p className="mb-1 px-3 text-[12px] text-red-400">{signOutError}</p>
        )}
        <button
          className={cn(
            "flex w-full items-center gap-3 rounded-2xl px-3 py-3.5 text-left text-[16px] active:bg-white/10",
            signOut.isPending ? "cursor-not-allowed text-white/30" : "text-red-400",
          )}
          disabled={signOut.isPending}
          onClick={handleSignOut}
          type="button"
        >
          <span className="text-white/70">
            {signOut.isPending ? (
              <span className="inline-block size-5 animate-spin rounded-full border-2 border-white/30 border-t-white/70" />
            ) : (
              <IconLogout className="size-5" />
            )}
          </span>
          <span className="flex-1">
            {signOut.isPending ? "Abmelde…" : "Abmelden"}
          </span>
        </button>
      </div>
    </BottomSheet>
  );
}
