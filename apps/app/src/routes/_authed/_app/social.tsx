import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";
import { SocialApp, type SocialView } from "@/components/social/social-app";

type SocialSearch = { tab?: "search" | "me"; h?: string; q?: string; p?: string };

/** Connect Social (helium-social): /social, /social?tab=search, /social?h=<handle>, /social?tab=me, /social?p=<post-id>. */
export const Route = createFileRoute("/_authed/_app/social")({
  validateSearch: (search: Record<string, unknown>): SocialSearch => ({
    tab: search.tab === "search" || search.tab === "me" ? search.tab : undefined,
    h: typeof search.h === "string" && search.h ? search.h.replace(/^@/, "").slice(0, 40) : undefined,
    q: typeof search.q === "string" ? search.q.slice(0, 60) : undefined,
    p: typeof search.p === "string" && /^[\w-]{1,64}$/.test(search.p) ? search.p : undefined,
  }),
  component: SocialRoute,
});

function SocialRoute() {
  const search = Route.useSearch();
  const navigate = useNavigate();
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
        next.tab === "post" ? { p: next.id } : next.tab === "profile" ? { h: next.handle } : next.tab === "search" ? { tab: "search", ...(next.q ? { q: next.q } : {}) } : next.tab === "me" ? { tab: "me" } : {};
      void navigate({ to: "/social", search: target });
    },
    [navigate],
  );
  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-[#07080c]">
      <SocialApp onExit={() => void navigate({ to: "/" })} onNavigate={onNavigate} view={view} variant="page" />
    </div>
  );
}
