/**
 * Profile hub — opens from the avatar. Profile + company switch in one sheet. The company part
 * uses the same source as the desktop rail menu (useCompanySwitcher in company-switcher.tsx).
 */

import {
  IconBuilding,
  IconChevronRight,
  IconCloudUpload,
  IconPlus,
  IconLogout,
  IconSettings,
  IconWorld,
} from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { UserAvatar } from "@/components/app-sidebar/user-avatar";
import { CompanyMark, useCompanySwitcher } from "@/components/companies/company-switcher";
import {
  getLocalProfile,
  type LocalProfile,
  subscribeLocalProfile,
} from "@/lib/auth/local-profile";
import { goToSignInAfterSignOut, signOutMutationOptions } from "@/lib/auth/mutations";
import { currentUserQueryOptions } from "@/lib/auth/queries";
import { cn } from "@/lib/utils";

function useLocalProfileState(): LocalProfile {
  const [profile, setProfile] = useState<LocalProfile>(() => getLocalProfile());
  useEffect(() => subscribeLocalProfile(() => setProfile(getLocalProfile())), []);
  return profile;
}

function BottomSheet({
  open,
  onClose,
  children,
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[100] flex flex-col justify-end" role="dialog">
      <button
        aria-label="Schließen"
        className="absolute inset-0 bg-black/60"
        onClick={onClose}
        type="button"
      />
      <div className="relative max-h-[85svh] overflow-y-auto rounded-t-3xl border-t border-white/10 bg-[#12131a] px-3 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2 text-white shadow-2xl">
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
      {description ? <span className="text-[13px] text-white/40">{description}</span> : null}
      {!danger ? <IconChevronRight className="size-4 text-white/30" /> : null}
    </button>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="mb-1 px-3 pt-1 text-[12px] font-medium uppercase tracking-[0.14em] text-white/35">{children}</p>;
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
  const sw = useCompanySwitcher();
  const signOut = useMutation(signOutMutationOptions(queryClient));
  const [signOutError, setSignOutError] = useState<string | null>(null);

  const displayName =
    profile.name.trim() && profile.name !== "Connect User"
      ? profile.name.trim()
      : currentUser?.name || currentUser?.email || "Du";

  const { companies, labels } = sw;
  const activeCompanyId = sw.activeId;

  const handleSignOut = useCallback(async () => {
    setSignOutError(null);
    try {
      await signOut.mutateAsync();
    } catch {
      setSignOutError("Abmelden fehlgeschlagen. Bitte erneut versuchen.");
      return;
    }
    onClose();
    goToSignInAfterSignOut();
  }, [signOut, onClose]);

  return (
    <BottomSheet onClose={onClose} open={open}>
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
        </div>
      </div>

      <div className="border-t border-white/10 pt-2">
        <SectionLabel>Unternehmen wechseln</SectionLabel>
        {companies.length === 0 ? (
          <p className="px-3 py-2 text-[14px] text-white/40">{labels.empty}</p>
        ) : (
          companies.map((company) => {
            const active = company.id === activeCompanyId;
            return (
              <button
                aria-current={active ? "true" : undefined}
                key={company.id}
                className={cn(
                  "flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left active:bg-white/10",
                  active && "bg-white/[0.06]",
                )}
                onClick={() => sw.select(company, { navigateTo: false })}
                type="button"
              >
                <CompanyMark company={company} size={36} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[16px] text-white">{company.name}</span>
                  {company.description ? (
                    <span className="block truncate text-[13px] text-white/45">{company.description}</span>
                  ) : null}
                </span>
                {active ? (
                  <span className="rounded-full bg-sky-400/20 px-2 py-0.5 text-[11px] font-medium text-sky-300">
                    {labels.active}
                  </span>
                ) : null}
              </button>
            );
          })
        )}
        {sw.active ? (
          <SheetItem
            icon={<IconBuilding className="size-5" />}
            label={labels.profile}
            onClick={() => {
              onClose();
              sw.openProfile();
            }}
          />
        ) : null}
        <SheetItem
          icon={<IconPlus className="size-5" />}
          label={labels.create}
          onClick={() => {
            onClose();
            sw.newCompany();
          }}
        />
        <SheetItem
          icon={<IconSettings className="size-5" />}
          label={labels.manage}
          onClick={() => {
            onClose();
            sw.manageCompanies();
          }}
        />
      </div>

      <div className="border-t border-white/10 pt-1">
        <SectionLabel>Einstellungen</SectionLabel>
        <SheetItem
          icon={<IconSettings className="size-5" />}
          label="Globale Einstellungen"
          onClick={() => {
            onClose();
            void navigate({ to: "/settings" });
          }}
        />
        <SheetItem
          icon={<IconCloudUpload className="size-5" />}
          label="Sicherung / Sync"
          onClick={() => {
            onClose();
            void navigate({ to: "/settings", hash: "sync-backup" });
          }}
        />
        <SheetItem
          icon={<IconWorld className="size-5" />}
          label="Browser-Gruppen"
          onClick={() => {
            onClose();
            void navigate({ to: "/settings", hash: "browser-groups" });
          }}
        />
      </div>

      <div className="border-t border-white/10 pt-1">
        {signOutError ? <p className="mb-1 px-3 text-[12px] text-red-400">{signOutError}</p> : null}
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
          <span className="flex-1">{signOut.isPending ? "Abmelde…" : "Abmelden"}</span>
        </button>
      </div>
    </BottomSheet>
  );
}
