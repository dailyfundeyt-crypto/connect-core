/**
 * Unternehmensprofil auf der Firmenseite (Handy + PC, helium-social 17.10.2026):
 * das Social-Profil der Firma (Posts · Agenten · Projekte, Kurs-Karte, Folgen) statt der
 * alten Webseiten-/Apps-Ansicht. Ohne Social-Backend bleibt `fallback` (alte Ansicht) sichtbar.
 */
import { IconPencil, IconWorld } from "@tabler/icons-react";
import { useNavigate } from "@tanstack/react-router";
import { type ReactNode, useState } from "react";
import type { ConnectCompany } from "@/lib/companies/catalog";
import { setCompanyPublic } from "@/lib/social/sync";
import { cn } from "@/lib/utils";
import { UnternehmensProfil, useSocialMe } from "./social-app";
import { SocialAvatar } from "./social-ui";

export function CompanySocialProfile({
  company,
  fallback,
  onEdit,
  className,
  stickyTabs = false,
}: {
  company: ConnectCompany;
  fallback?: ReactNode;
  /** PC: öffnet den bisherigen Profil-Editor */
  onEdit?: () => void;
  className?: string;
  stickyTabs?: boolean;
}) {
  const me = useSocialMe();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const server = me.mine.find((p) => p.localId === company.id) ?? null;
  if (me.unavailable) return <>{fallback ?? null}</>;
  if (me.loading) {
    return (
      <div className="flex justify-center py-10">
        <span className="size-6 animate-spin rounded-full border-2 border-white/15 border-t-sky-400" />
      </div>
    );
  }
  const openProfile = (h: string) => void navigate({ to: "/social", search: { h } as never });
  const openPost = (p: string) => void navigate({ to: "/social", search: { p } as never });
  const editButton = onEdit ? (
    <button className="inline-flex h-9 items-center gap-1.5 rounded-full border border-white/20 px-3.5 text-[14px] font-semibold text-white hover:bg-white/10" onClick={onEdit} type="button">
      <IconPencil className="size-4" /> Profil bearbeiten
    </button>
  ) : null;

  if (!server) {
    return (
      <div className={cn("dark text-white", className)} data-testid="company-social-profile">
        <div className="mx-4 mt-4 rounded-3xl border border-white/10 bg-white/[0.03] p-5 text-center">
          <div className="flex justify-center">
            <SocialAvatar profile={{ name: company.name, logo: company.logo?.startsWith("data:") || company.logo?.startsWith("/") || company.logo?.startsWith("https://") ? company.logo : null, accent: company.accent }} size={72} />
          </div>
          <p className="mt-3 text-[19px] font-bold">{company.name}</p>
          <p className="mt-1 text-[14px] text-white/55">Das Unternehmensprofil ist noch nicht in Analysis. Veröffentlichen, damit andere folgen, Posts lesen und Agenten kaufen können.</p>
          <button
            className="mt-4 inline-flex h-10 items-center gap-2 rounded-full bg-white px-5 text-[15px] font-bold text-black disabled:opacity-50"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              setError(null);
              void setCompanyPublic(company.id, true, undefined)
                .catch((e) => setError(e instanceof Error ? e.message : "Nicht veröffentlicht."))
                .finally(() => setBusy(false));
            }}
            type="button"
          >
            <IconWorld className="size-4" /> {busy ? "…" : "Profil veröffentlichen"}
          </button>
          {error ? <p className="mt-2 text-[13px] text-rose-400">{error}</p> : null}
          {editButton ? <div className="mt-3 flex justify-center">{editButton}</div> : null}
        </div>
        {fallback ? <div className="mt-4 opacity-90">{fallback}</div> : null}
      </div>
    );
  }
  return (
    <div className={cn("dark text-white", className)} data-testid="company-social-profile">
      <UnternehmensProfil handle={server.handle} hideTopBar me={me} onOpenPost={openPost} onOpenProfile={openProfile} ownerExtras={editButton} stickyTabs={stickyTabs} />
    </div>
  );
}

/** PC-Firmenseite: Unternehmensprofil (dunkel, X-Breite); „Profil bearbeiten“ öffnet den bisherigen Editor. */
export function CompanyProfileSocialSwitch({ company, editor }: { company: ConnectCompany; editor: ReactNode }) {
  const [editing, setEditing] = useState(false);
  if (editing) {
    return (
      <div className="min-h-full">
        <div className="sticky top-0 z-20 flex items-center gap-2 border-b border-black/5 bg-white/90 px-4 py-2 backdrop-blur">
          <button className="rounded-full bg-foreground px-3.5 py-1.5 text-[13px] font-semibold text-background" onClick={() => setEditing(false)} type="button">
            Fertig – zurück zum Unternehmensprofil
          </button>
        </div>
        {editor}
      </div>
    );
  }
  return (
    <div className="dark min-h-full bg-[#07080c]">
      <div className="mx-auto min-h-full w-full max-w-[640px] border-white/[0.06] pb-16 md:border-x">
        <CompanySocialProfile company={company} fallback={<div className="bg-white">{editor}</div>} onEdit={() => setEditing(true)} stickyTabs />
      </div>
    </div>
  );
}
