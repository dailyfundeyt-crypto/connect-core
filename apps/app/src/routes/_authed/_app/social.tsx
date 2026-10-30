import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useState } from "react";
import { SocialApp, type SocialView } from "@/components/social/social-app";
import { CompanyProfilePage as CompanyProfilePageLegacy } from "@/components/social/company-profile-page";
import { ArticlesAndMarketplaceView } from "@/components/social/articles-and-marketplace";
import { BotPostComposer } from "@/components/social/bot-post-composer";
import { PostCardView } from "@/components/social/post-card-view";
import {
  IconFileText,
  IconShoppingBag,
  IconBuilding,
  IconHome,
  IconFlask,
} from "@tabler/icons-react";
import { getFlag } from "@/contracts/v06/flags";
import {
  Timeline as TimelineV06,
  Composer as ComposerV06,
  CompanyProfilePage as CompanyProfilePageV06,
  ProjectPage as ProjectPageV06,
} from "@/v06/social";

type SocialSearch = {
  tab?: "search" | "me" | "company" | "articles" | "marketplace" | "projects" | "project";
  h?: string;
  q?: string;
  p?: string;
  companyId?: string;
  projectId?: string;
};

/** Connect Social (helium-social): /social, /social?tab=search, /social?h=<handle>, /social?tab=me, /social?p=<post-id>. */
export const Route = createFileRoute("/_authed/_app/social")({
  validateSearch: (search: Record<string, unknown>): SocialSearch => ({
    tab:
      search.tab === "search" ||
      search.tab === "me" ||
      search.tab === "company" ||
      search.tab === "articles" ||
      search.tab === "marketplace" ||
      search.tab === "projects" ||
      search.tab === "project"
        ? (search.tab as any)
        : undefined,
    h: typeof search.h === "string" && search.h ? search.h.replace(/^@/, "").slice(0, 40) : undefined,
    q: typeof search.q === "string" ? search.q.slice(0, 60) : undefined,
    p: typeof search.p === "string" && /^[\w-]{1,64}$/.test(search.p) ? search.p : undefined,
    companyId: typeof search.companyId === "string" ? search.companyId : undefined,
    projectId: typeof search.projectId === "string" ? search.projectId : undefined,
  }),
  component: SocialRoute,
});

function SocialRoute() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const isSocialV1 = getFlag("socialV1");

  const view: SocialView = search.p
    ? { tab: "post", id: search.p }
    : search.h
    ? { tab: "profile", handle: search.h }
    : search.tab === "search"
      ? { tab: "search", q: search.q }
      : search.tab === "me"
        ? { tab: "me" }
        : { tab: "home" };

  const onNavigate = useCallback(
    (next: SocialView) => {
      const target: SocialSearch =
        next.tab === "post"
          ? { p: next.id }
          : next.tab === "profile"
          ? { h: next.handle }
          : next.tab === "search"
            ? { tab: "search", ...(next.q ? { q: next.q } : {}) }
            : next.tab === "me"
              ? { tab: "me" }
              : {};
      void navigate({ to: "/social", search: target });
    },
    [navigate],
  );

  const activeCompanyId = search.companyId || "kunc_gmbh";

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-[#07080c]" data-testid="connect-social-root">
      {/* Top Quick-Navigation Navigation Pill Bar */}
      <div className="flex items-center justify-between border-b border-white/10 bg-[#0d0e19]/90 px-4 py-2.5 backdrop-blur-md">
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
          <button
            type="button"
            onClick={() => void navigate({ to: "/social", search: {} })}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-[13px] font-semibold transition-colors ${
              !search.tab || search.tab === "search" || search.tab === "me"
                ? "bg-sky-500 text-white shadow-sm shadow-sky-500/20"
                : "text-white/60 hover:bg-white/10 hover:text-white"
            }`}
            data-testid="nav-feed"
          >
            <IconHome className="size-3.5" /> Feed & Timeline
          </button>
          <button
            type="button"
            onClick={() => void navigate({ to: "/social", search: { tab: "company", companyId: activeCompanyId } })}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-[13px] font-semibold transition-colors ${
              search.tab === "company"
                ? "bg-sky-500 text-white shadow-sm shadow-sky-500/20"
                : "text-white/60 hover:bg-white/10 hover:text-white"
            }`}
            data-testid="nav-company"
          >
            <IconBuilding className="size-3.5" /> Firmenprofil
          </button>

          {isSocialV1 && (
            <button
              type="button"
              onClick={() => void navigate({ to: "/social", search: { tab: "projects" } })}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-[13px] font-semibold transition-colors ${
                search.tab === "projects" || search.tab === "project"
                  ? "bg-sky-500 text-white shadow-sm shadow-sky-500/20"
                  : "text-white/60 hover:bg-white/10 hover:text-white"
              }`}
              data-testid="nav-projects"
            >
              <IconFlask className="size-3.5" /> Forschungsprojekte
            </button>
          )}

          <button
            type="button"
            onClick={() => void navigate({ to: "/social", search: { tab: "articles" } })}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-[13px] font-semibold transition-colors ${
              search.tab === "articles"
                ? "bg-sky-500 text-white shadow-sm shadow-sky-500/20"
                : "text-white/60 hover:bg-white/10 hover:text-white"
            }`}
            data-testid="nav-articles"
          >
            <IconFileText className="size-3.5" /> Artikel
          </button>
          <button
            type="button"
            onClick={() => void navigate({ to: "/social", search: { tab: "marketplace" } })}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-[13px] font-semibold transition-colors ${
              search.tab === "marketplace"
                ? "bg-sky-500 text-white shadow-sm shadow-sky-500/20"
                : "text-white/60 hover:bg-white/10 hover:text-white"
            }`}
            data-testid="nav-marketplace"
          >
            <IconShoppingBag className="size-3.5" /> Bot-Marktplatz
          </button>
        </div>
      </div>

      {/* Main View Switcher */}
      <div className="flex-1 overflow-y-auto">
        {search.tab === "company" ? (
          isSocialV1 ? (
            <CompanyProfilePageV06
              companyId={activeCompanyId}
              currentCompanyId={activeCompanyId}
              onBack={() => void navigate({ to: "/social", search: {} })}
              onOpenArticle={(_artId) => void navigate({ to: "/social", search: { tab: "articles" } })}
              onOpenProject={(projId) =>
                void navigate({ to: "/social", search: { tab: "project", projectId: projId } })
              }
            />
          ) : (
            <CompanyProfilePageLegacy
              companyId={activeCompanyId}
              onBack={() => void navigate({ to: "/social", search: {} })}
            />
          )
        ) : search.tab === "projects" || search.tab === "project" ? (
          <ProjectPageV06
            projectId={search.projectId || "research-swarm-1"}
            currentCompanyId={activeCompanyId}
            onBack={() => void navigate({ to: "/social", search: {} })}
            onOpenCompany={(cId) => void navigate({ to: "/social", search: { tab: "company", companyId: cId } })}
          />
        ) : search.tab === "articles" ? (
          <ArticlesAndMarketplaceView defaultTab="articles" />
        ) : search.tab === "marketplace" ? (
          <ArticlesAndMarketplaceView defaultTab="marketplace" />
        ) : isSocialV1 ? (
          <TimelineV06
            currentCompanyId={activeCompanyId}
            composerSlot={<ComposerV06 companyId={activeCompanyId} className="mb-6" />}
            onOpenCompany={(cId) => void navigate({ to: "/social", search: { tab: "company", companyId: cId } })}
            onOpenArticle={(_artId) => void navigate({ to: "/social", search: { tab: "articles" } })}
            onOpenProject={(projId) =>
              void navigate({ to: "/social", search: { tab: "project", projectId: projId } })
            }
          />
        ) : (
          <SocialApp onExit={() => void navigate({ to: "/" })} onNavigate={onNavigate} view={view} variant="page" />
        )}
      </div>
    </div>
  );
}
