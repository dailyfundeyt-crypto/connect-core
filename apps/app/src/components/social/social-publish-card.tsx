/**
 * Connect Social – Schalter „Profil öffentlich“ im Firmenprofil (helium-social). Eigenständige
 * Komponente; im Firmenprofil nur eingehängt. Veröffentlicht nur Profilfelder + öffentliche Posts.
 */
import { IconWorld } from "@tabler/icons-react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { SocialUnavailableError, socialApi, socialKeys } from "@/lib/social/api";
import { SOCIAL_CHANGED, setCompanyPublic } from "@/lib/social/sync";
import { cn } from "@/lib/utils";

export function SocialPublishCard({ companyId, className }: { companyId: string; className?: string }) {
  const queryClient = useQueryClient();
  const me = useQuery({ queryKey: socialKeys.me(), queryFn: socialApi.me, staleTime: 20_000, retry: 1 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const onChange = () => void queryClient.invalidateQueries({ queryKey: socialKeys.me() });
    window.addEventListener(SOCIAL_CHANGED, onChange);
    return () => window.removeEventListener(SOCIAL_CHANGED, onChange);
  }, [queryClient]);
  if (me.error instanceof SocialUnavailableError) return null;
  const profile = me.data?.profiles.find((p) => p.localId === companyId);
  const isPublic = Boolean(profile?.isPublic);
  const toggle = () => {
    setBusy(true);
    setError(null);
    void setCompanyPublic(companyId, !isPublic, profile)
      .then(() => queryClient.invalidateQueries({ queryKey: socialKeys.all }))
      .catch((e) => setError(e instanceof Error ? e.message : "Nicht gespeichert."))
      .finally(() => setBusy(false));
  };
  return (
    <div className={cn("mt-3 rounded-2xl border border-border px-3.5 py-3", className)} data-testid="social-publish-card">
      <div className="flex items-center gap-3">
        <IconWorld className={cn("size-5 shrink-0", isPublic ? "text-sky-500" : "text-muted-foreground")} />
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-semibold">Profil öffentlich</p>
          <p className="text-[12px] leading-snug text-muted-foreground">
            {isPublic
              ? `In Analysis sichtbar als @${profile?.handle} · ${profile?.followers ?? 0} Follower`
              : "Andere finden die Firma in Analysis (nur Profil + öffentliche Posts)."}
          </p>
        </div>
        <button
          aria-checked={isPublic}
          aria-label="Profil öffentlich"
          className={cn("relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50", isPublic ? "bg-sky-500" : "bg-foreground/15")}
          disabled={busy || me.isLoading}
          onClick={toggle}
          role="switch"
          type="button"
        >
          <span className={cn("inline-block size-5 rounded-full bg-white shadow transition-transform", isPublic ? "translate-x-[22px]" : "translate-x-0.5")} />
        </button>
      </div>
      {isPublic && profile ? (
        <Link className="mt-2 inline-block text-[12px] font-semibold text-sky-600 hover:underline" search={{ h: profile.handle }} to="/social">
          In Analysis ansehen →
        </Link>
      ) : null}
      {error ? <p className="mt-1 text-[12px] text-destructive">{error}</p> : null}
    </div>
  );
}
