/**
 * Connect Social (helium-social): Feed wie bei X, Suche, Profile fremder Firmen, Folgen, Posten.
 * Varianten: "page" (Route /social – PC mit Seitenleiste, Handy mit Tab-Leiste unten) und
 * "embedded" (Wisch-Seite „Social“ der Handy-Startseite). Daten zentral über /api/social/*.
 */
import {
  IconArrowLeft,
  IconBuildingStore,
  IconCalendar,
  IconTrendingDown,
  IconTrendingUp,
  IconHome,
  IconHomeFilled,
  IconLink,
  IconMapPin,
  IconGif,
  IconPhoto,
  IconRobot,
  IconPlus,
  IconSearch,
  IconUser,
  IconUserFilled,
  IconX,
} from "@tabler/icons-react";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPost as createLocalPost } from "@/lib/companies/posts";
import { getCompany, listCompanies, subscribeCompanies } from "@/lib/companies/store";
import { getLiveQuote } from "@/lib/marketplace/live-prices";
import { type SocialAgentCard, type SocialPage, type SocialProfile, SocialUnavailableError, socialApi, socialKeys } from "@/lib/social/api";
import { deleteSocialDraft, listSocialDrafts, subscribeSocialDrafts, type SocialDraft } from "@/lib/social/drafts";
import { imageToDataUrl, pickActiveProfile, SOCIAL_CHANGED, setCompanyPublic, writeSocialAs } from "@/lib/social/sync";
import { cn } from "@/lib/utils";
import { AgentAvatar, AgentCardView, CharRing, EmptyState, FollowButton, ImageGrid, PostCard, ProfileRow, SocialAvatar, Toggle, VerifiedBadge } from "./social-ui";

export type SocialView =
  | { tab: "home" }
  | { tab: "search"; q?: string }
  | { tab: "profile"; handle: string }
  | { tab: "post"; id: string }
  | { tab: "me" };

// ------------------------------------------------------------------ data hooks

export function useSocialMe() {
  const queryClient = useQueryClient();
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const onChange = () => {
      setTick((n) => n + 1);
      void queryClient.invalidateQueries({ queryKey: socialKeys.all });
    };
    window.addEventListener(SOCIAL_CHANGED, onChange);
    return () => window.removeEventListener(SOCIAL_CHANGED, onChange);
  }, [queryClient]);
  const query = useQuery({ queryKey: socialKeys.me(), queryFn: socialApi.me, staleTime: 20_000, retry: 1 });
  const mine = query.data?.profiles ?? [];
  // biome-ignore lint/correctness/useExhaustiveDependencies: tick = Auswahl geändert
  const active = useMemo(() => pickActiveProfile(mine), [mine, tick]);
  return {
    mine,
    active,
    as: active?.isPublic ? active.id : null,
    loading: query.isLoading,
    unavailable: query.error instanceof SocialUnavailableError ? query.error.message : null,
    error: query.error && !(query.error instanceof SocialUnavailableError) ? (query.error as Error).message : null,
  };
}

function useInfinite(key: readonly unknown[], fetchPage: (before: string | null) => Promise<SocialPage>, enabled = true) {
  return useInfiniteQuery({
    queryKey: key,
    queryFn: ({ pageParam }) => fetchPage(pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.next,
    enabled,
    staleTime: 15_000,
    refetchInterval: 60_000,
  });
}

function LoadMore({ onVisible, active }: { onVisible: () => void; active: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = ref.current;
    if (!node || !active) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) onVisible();
    }, { rootMargin: "600px 0px" });
    observer.observe(node);
    return () => observer.disconnect();
  }, [active, onVisible]);
  return <div className="h-10" ref={ref} />;
}

function Spinner() {
  return (
    <div className="flex justify-center py-8">
      <span className="size-6 animate-spin rounded-full border-2 border-white/15 border-t-sky-400" />
    </div>
  );
}

// ------------------------------------------------------------------ composer
async function fileToPostImage(file: File): Promise<string | null> {
  if (file.type === "image/gif") {
    if (file.size > 430_000) return null;
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(file);
    });
  }
  const url = URL.createObjectURL(file);
  try {
    const data = await imageToDataUrl(url, 1280, false, 0.82);
    return data && data.length <= 590_000 ? data : await imageToDataUrl(url, 900, false, 0.7);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Verfassen wie bei X: Avatar, Text, bis zu 4 Bilder/GIFs, Agent anhängen (Agenten-Karte mit
 * Kaufen/Mieten), Zeichen-Kreis. `replyTo` = Antwortfeld (Knopf „Antworten“).
 */
export function Composer({
  mine,
  active,
  onPosted,
  autoFocus,
  compact,
  replyTo,
  replyToHandle,
  docked,
}: {
  mine: SocialProfile[];
  active: SocialProfile | null;
  onPosted?: () => void;
  autoFocus?: boolean;
  compact?: boolean;
  replyTo?: string;
  replyToHandle?: string;
  docked?: boolean;
}) {
  const queryClient = useQueryClient();
  const [text, setText] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [agent, setAgent] = useState<SocialAgentCard | null>(null);
  const [agentPicker, setAgentPicker] = useState(false);
  const [focused, setFocused] = useState(Boolean(autoFocus));
  const [error, setError] = useState<string | null>(null);
  const [targetProfileIds, setTargetProfileIds] = useState<string[] | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const gifRef = useRef<HTMLInputElement>(null);
  const localPostIds = useRef<Record<string, { body: string; id: string }>>({});
  const publicMine = mine.filter((p) => p.isPublic);
  const selectedTargets = targetProfileIds === null ? publicMine : publicMine.filter((p) => targetProfileIds.includes(p.id));
  const isReply = Boolean(replyTo);
  const mutation = useMutation({
    mutationFn: async () => {
      if (!active?.isPublic) throw new Error("Veröffentliche zuerst eine Firma (Profil › Meine Firmen).");
      const body = text.trim();
      if (!body && images.length === 0 && !agent) throw new Error("Schreib etwas.");
      const targets = isReply ? [active] : selectedTargets;
      if (targets.length === 0) throw new Error("Wähle mindestens ein Profil aus.");
      const title = (body.split("\n")[0] || (agent ? `Agent ${agent.name}` : "Bild")).slice(0, 80);
      // Ein normaler Post wird unter jedem gewählten öffentlichen Firmenprofil angelegt.
      const results = await Promise.allSettled(targets.map(async (target) => {
        let localId: string | undefined;
        if (!isReply && body && target.localId && getCompany(target.localId)) {
          const remembered = localPostIds.current[target.id];
          if (remembered?.body === body) {
            localId = remembered.id;
          } else {
            const local = createLocalPost({ companyId: target.localId, kind: "update", title, body, authorName: target.name, visibility: "public", source: "manual" });
            localId = local.id;
            localPostIds.current[target.id] = { body, id: local.id };
          }
        }
        return socialApi.createPost({
          as: target.id,
          body,
          title: isReply ? null : title,
          ...(images.length ? { images } : {}),
          ...(localId ? { localId } : {}),
          ...(replyTo ? { replyTo } : {}),
          ...(agent ? { attachment: { type: "agent" as const, agent } } : {}),
        });
      }));
      const failedTargets = targets.filter((_, index) => results[index]?.status === "rejected");
      if (failedTargets.length > 0) {
        const publishedTargets = targets.filter((_, index) => results[index]?.status === "fulfilled");
        if (publishedTargets.length > 0) setTargetProfileIds(failedTargets.map((target) => target.id));
        const firstFailure = results.find((result) => result.status === "rejected");
        const reason = firstFailure?.status === "rejected" ? firstFailure.reason : null;
        if (publishedTargets.length > 0) {
          throw new Error(`Teilweise veröffentlicht. Fehlgeschlagen: ${failedTargets.map((target) => target.name).join(", ")}. Die Auswahl wurde auf diese Profile begrenzt.`);
        }
        throw reason instanceof Error ? reason : new Error("Post nicht veröffentlicht.");
      }
      return results;
    },
    onSuccess: () => {
      setText("");
      setImages([]);
      setAgent(null);
      setError(null);
      localPostIds.current = {};
      void queryClient.invalidateQueries({ queryKey: socialKeys.all });
      onPosted?.();
    },
    onError: (e) => {
      setError(e instanceof Error ? e.message : "Post nicht veröffentlicht.");
      void queryClient.invalidateQueries({ queryKey: socialKeys.all });
    },
  });
  const addFiles = (files: FileList | null) => {
    const list = Array.from(files ?? []).slice(0, 4 - images.length);
    void Promise.all(list.map(fileToPostImage)).then((out) => {
      const ok = out.filter((x): x is string => Boolean(x));
      if (ok.length < list.length) setError("Ein Bild war zu groß (GIF max. ~400 KB).");
      setImages((prev) => [...prev, ...ok].slice(0, 4));
    });
  };
  if (!active?.isPublic) {
    return (
      <div className={cn("border-b border-white/[0.06] px-4 py-4 text-[14px] text-white/55", docked && "border-t border-b-0")}>
        {isReply ? "Zum Antworten" : "Zum Posten"} eine eigene Firma öffentlich schalten: <span className="text-white">Profil › Meine Firmen</span>.
      </div>
    );
  }
  const canSend = (text.trim().length > 0 || images.length > 0 || Boolean(agent)) && text.length <= 2000 && (isReply || selectedTargets.length > 0) && !mutation.isPending;
  const expanded = !docked || focused || text.length > 0 || images.length > 0 || Boolean(agent);
  const agents = active.agents ?? [];
  return (
    <div
      className={cn(
        "flex gap-3 px-4",
        docked ? "border-t border-white/[0.08] bg-[#07080c]/95 py-2.5 backdrop-blur-xl" : cn("border-b border-white/[0.06]", compact ? "py-3" : "py-4"),
      )}
      data-testid={isReply ? "social-reply-composer" : "social-composer"}
    >
      {selectedTargets.length === 1 ? (
        <SocialAvatar profile={selectedTargets[0]} size={docked ? 36 : 42} />
      ) : (
        <img alt={selectedTargets.length ? "Analysis" : ""} className={cn("shrink-0 rounded-xl object-contain", docked ? "size-9" : "size-[42px]")} src="/brand/analysis-logo.png" />
      )}
      <div className="min-w-0 flex-1">
        {isReply && replyToHandle && expanded ? <p className="mb-1 text-[13px] text-white/45">Antwort an <span className="text-sky-400">@{replyToHandle}</span></p> : null}
        {!isReply ? (
          <div aria-label="Veröffentlichungsziele" className="mb-2 flex flex-wrap items-center gap-1.5" role="group">
            {publicMine.length > 1 ? (
              <>
                <span className="mr-1 text-[11px] font-semibold uppercase tracking-wide text-white/40">Posten auf</span>
                <button
                  aria-pressed={targetProfileIds === null}
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-[12px] font-semibold transition-colors",
                    targetProfileIds === null
                      ? "border-sky-300/40 bg-sky-300/15 text-sky-200"
                      : "border-white/10 text-white/55 hover:bg-white/[0.06]",
                  )}
                  onClick={() => setTargetProfileIds(null)}
                  type="button"
                >
                  Alle
                </button>
                {publicMine.map((profile) => {
                  const selected = selectedTargets.some((target) => target.id === profile.id);
                  return (
                    <button
                      aria-pressed={selected}
                      className={cn(
                        "rounded-full border px-2.5 py-1 text-[12px] font-semibold transition-colors",
                        selected
                          ? "border-sky-300/40 bg-sky-300/15 text-sky-200"
                          : "border-white/10 text-white/45 hover:bg-white/[0.06]",
                      )}
                      key={profile.id}
                      onClick={() =>
                        setTargetProfileIds((current) => {
                          const chosen = current === null ? publicMine.map((item) => item.id) : current;
                          const next = chosen.includes(profile.id)
                            ? chosen.filter((id) => id !== profile.id)
                            : [...chosen, profile.id];
                          return next.length === publicMine.length ? null : next;
                        })
                      }
                      type="button"
                    >
                      {profile.name}
                    </button>
                  );
                })}
                <span className="ml-auto text-[11px] text-white/35">{selectedTargets.length}/{publicMine.length}</span>
              </>
            ) : (
              <span className="text-[11px] text-white/40">Wird auf {active.name} veröffentlicht</span>
            )}
          </div>
        ) : null}
        <textarea
          aria-label={isReply ? "Deine Antwort" : "Neuer Post"}
          autoFocus={autoFocus}
          className={cn("block w-full resize-none bg-transparent leading-snug text-white outline-none placeholder:text-white/40", docked && !expanded ? "min-h-[36px] py-1.5 text-[16px]" : "min-h-[56px] text-[17px]")}
          maxLength={2200}
          onChange={(e) => {
            setText(e.target.value);
            e.target.style.height = "auto";
            e.target.style.height = `${Math.min(e.target.scrollHeight, docked ? 160 : 320)}px`;
          }}
          onFocus={() => setFocused(true)}
          placeholder={isReply ? "Deine Antwort posten" : "Was gibt’s Neues?"}
          rows={docked && !expanded ? 1 : 2}
          value={text}
        />
        {images.length ? (
          <div className={cn("mt-2 grid gap-1.5", images.length > 1 && "grid-cols-2")}>
            {images.map((src, i) => (
              <div className="relative" key={`${i}-${src.slice(-10)}`}>
                <img alt="" className="max-h-60 w-full rounded-2xl border border-white/10 object-cover" src={src} />
                <button aria-label="Bild entfernen" className="absolute right-1.5 top-1.5 rounded-full bg-black/75 p-1 text-white" onClick={() => setImages((prev) => prev.filter((_, j) => j !== i))} type="button">
                  <IconX className="size-4" />
                </button>
              </div>
            ))}
          </div>
        ) : null}
        {agent ? (
          <div className="relative">
            <AgentCardView agent={agent} compact />
            <button aria-label="Agent entfernen" className="absolute -right-1.5 -top-1 rounded-full bg-black/80 p-1 text-white ring-1 ring-white/15" onClick={() => setAgent(null)} type="button">
              <IconX className="size-3.5" />
            </button>
          </div>
        ) : null}
        {agentPicker ? (
          <div className="mt-2 max-h-64 overflow-y-auto rounded-2xl border border-white/10 bg-[#0d0e14]" data-testid="social-agent-picker">
            {agents.length === 0 ? <p className="px-3 py-3 text-[13px] text-white/50">Diese Firma hat noch keine Agenten im Profil.</p> : null}
            {agents.map((a) => (
              <button
                className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-white/[0.05]"
                key={a.id}
                onClick={() => {
                  setAgent(a);
                  setAgentPicker(false);
                }}
                type="button"
              >
                <AgentAvatar agent={a} size={34} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-semibold text-white">{a.name}</span>
                  <span className="block truncate text-[12px] text-white/45">{a.role || "Agent"}{a.price ? ` · ${a.price}` : ""}</span>
                </span>
                {a.buyUrl || a.rentUrl ? <span className="text-[11px] text-emerald-300/80">{a.buyUrl ? "Kaufen" : "Mieten"}</span> : null}
              </button>
            ))}
          </div>
        ) : null}
        {error ? <p className="mt-1 text-[13px] text-rose-400" role="alert">{error}</p> : null}
        {expanded ? (
          <div className={cn("mt-2 flex items-center gap-0.5", !docked && "border-t border-white/[0.06] pt-2")}>
            <button aria-label="Bild anhängen" className="rounded-full p-2 text-sky-400 hover:bg-sky-400/10 disabled:opacity-40" disabled={images.length >= 4} onClick={() => fileRef.current?.click()} type="button">
              <IconPhoto className="size-5" />
            </button>
            <button aria-label="GIF anhängen" className="rounded-full p-2 text-sky-400 hover:bg-sky-400/10 disabled:opacity-40" disabled={images.length >= 4} onClick={() => gifRef.current?.click()} type="button">
              <IconGif className="size-5" />
            </button>
            {!isReply ? (
              <button aria-label="Agent anhängen" className={cn("rounded-full p-2 text-sky-400 hover:bg-sky-400/10", agentPicker && "bg-sky-400/10")} data-testid="social-attach-agent" onClick={() => setAgentPicker((v) => !v)} type="button">
                <IconRobot className="size-5" />
              </button>
            ) : null}
            <input accept="image/png,image/jpeg,image/webp" className="hidden" multiple onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} ref={fileRef} type="file" />
            <input accept="image/gif" className="hidden" onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} ref={gifRef} type="file" />
            <span className="ml-auto mr-2"><CharRing length={text.length} /></span>
            <button
              className={cn("h-9 rounded-full px-4 text-[14px] font-bold transition-colors disabled:opacity-40", isReply ? "bg-sky-500 text-white hover:bg-sky-400" : "bg-white text-black hover:bg-white/85")}
              data-testid="social-post-submit"
              disabled={!canSend}
              onClick={() => mutation.mutate()}
              type="button"
            >
              {mutation.isPending ? "…" : isReply ? "Antworten" : selectedTargets.length > 1 ? `Auf ${selectedTargets.length} Profilen posten` : "Posten"}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ views

function TabBar<T extends string>({ tabs, value, onChange, sticky = true }: { tabs: Array<[T, string]>; value: T; onChange: (v: T) => void; sticky?: boolean }) {
  return (
    <div className={cn("z-10 flex border-b border-white/[0.06] bg-[#07080c]/85 backdrop-blur-xl", sticky && "sticky top-0")} role="tablist">
      {tabs.map(([id, label]) => (
        <button
          aria-selected={value === id}
          className={cn("relative flex-1 py-3.5 text-[15px] font-semibold transition-colors hover:bg-white/[0.03]", value === id ? "text-white" : "text-white/45")}
          key={id}
          onClick={() => onChange(id)}
          role="tab"
          type="button"
        >
          {label}
          {value === id ? <span className="absolute bottom-0 left-1/2 h-1 w-14 -translate-x-1/2 rounded-full bg-sky-400" /> : null}
        </button>
      ))}
    </div>
  );
}

function FeedView({ me, onOpenProfile, onOpenPost, header, showComposer }: { me: ReturnType<typeof useSocialMe>; onOpenProfile: (h: string) => void; onOpenPost: (id: string) => void; header?: ReactNode; showComposer: boolean }) {
  const [mode, setMode] = useState<"for-you" | "following">("for-you");
  const [drafts, setDrafts] = useState<SocialDraft[]>(() => listSocialDrafts());
  const feed = useInfinite(socialKeys.feed(mode, me.as), (before) => socialApi.feed(mode, me.as, before), !me.unavailable);
  useEffect(() => subscribeSocialDrafts(() => setDrafts(listSocialDrafts())), []);
  const posts = feed.data?.pages.flatMap((p) => p.posts) ?? [];
  const loadMore = useCallback(() => {
    if (feed.hasNextPage && !feed.isFetchingNextPage) void feed.fetchNextPage();
  }, [feed]);
  return (
    <div>
      <div className="sticky top-0 z-10">
        {header}
        <TabBar onChange={setMode} sticky={false} tabs={[["for-you", "Für dich"], ["following", "Folge ich"]]} value={mode} />
      </div>
      {mode === "for-you" && drafts.length > 0 ? (
        <section aria-label="Gespeicherte Social-Entwürfe" className="border-b border-white/[0.07] px-4 py-3" data-testid="social-draft-shelf">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-[12px] font-semibold uppercase tracking-wide text-white/45">Deine Entwürfe</h2>
            <span className="text-[11px] text-white/30">nur auf diesem Gerät</span>
          </div>
          <div className="space-y-2">
            {drafts.slice(0, 5).map((draft) => (
              <article className="rounded-2xl border border-white/[0.07] bg-white/[0.025] px-3 py-2.5" key={draft.id}>
                <p className="line-clamp-3 whitespace-pre-wrap text-[13px] leading-5 text-white/80">{draft.body}</p>
                <div className="mt-2 flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-[10px] text-white/35">{draft.platforms.join(" · ")} · {getCompany(draft.companyId ?? "")?.name ?? "Connect"}</span>
                  <button className="text-[11px] text-sky-200/80 hover:text-sky-100" onClick={() => void navigator.clipboard?.writeText(draft.body)} type="button">Kopieren</button>
                  <button aria-label="Entwurf löschen" className="text-[11px] text-white/35 hover:text-rose-300" onClick={() => deleteSocialDraft(draft.id)} type="button">Entfernen</button>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}
      {showComposer ? <Composer active={me.active} mine={me.mine} /> : null}
      {feed.isLoading ? <Spinner /> : null}
      {feed.error ? <p className="px-4 py-6 text-center text-[14px] text-rose-400">{(feed.error as Error).message}</p> : null}
      {!feed.isLoading && !feed.error && posts.length === 0 ? (
        mode === "following" ? (
          <EmptyState text="Folge Firmen über die Suche – ihre Posts erscheinen dann hier." title="Noch niemandem gefolgt" />
        ) : (
          <EmptyState text="Sobald öffentliche Firmen posten, erscheinen ihre Beiträge hier. Schreib den ersten Post!" title="Noch keine Posts" />
        )
      ) : null}
      {posts.map((post) => (
        <PostCard as={me.as} key={post.id} onOpenPost={onOpenPost} onOpenProfile={onOpenProfile} post={post} />
      ))}
      {feed.isFetchingNextPage ? <Spinner /> : null}
      <LoadMore active={Boolean(feed.hasNextPage)} onVisible={loadMore} />
      {!feed.hasNextPage && posts.length > 0 ? <p className="pb-10 text-center text-[12px] text-white/25">Du bist auf dem neuesten Stand.</p> : null}
    </div>
  );
}

function SearchView({ me, initial, onOpenProfile, onBack }: { me: ReturnType<typeof useSocialMe>; initial?: string; onOpenProfile: (h: string) => void; onBack?: () => void }) {
  const [text, setText] = useState(initial ?? "");
  const [term, setTerm] = useState(initial ?? "");
  useEffect(() => {
    const id = window.setTimeout(() => setTerm(text.trim()), 250);
    return () => window.clearTimeout(id);
  }, [text]);
  const results = useQuery({ queryKey: socialKeys.search(term, me.as), queryFn: () => socialApi.search(term, me.as), enabled: !me.unavailable, staleTime: 10_000 });
  const list = results.data?.profiles ?? [];
  return (
    <div>
      <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-white/[0.06] bg-[#07080c]/85 px-3 py-2.5 backdrop-blur-xl">
        {onBack ? (
          <button aria-label="Zurück" className="rounded-full p-2 text-white hover:bg-white/10" onClick={onBack} type="button">
            <IconArrowLeft className="size-5" />
          </button>
        ) : null}
        <label className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-4 focus-within:border-sky-400/60">
          <IconSearch className="size-[18px] shrink-0 text-white/45" />
          <input
            aria-label="Firmen und Personen suchen"
            autoFocus
            className="min-w-0 flex-1 bg-transparent text-[16px] text-white outline-none placeholder:text-white/35"
            data-testid="social-search-input"
            onChange={(e) => setText(e.target.value)}
            placeholder="Firmen, @Handles, $Ticker suchen"
            value={text}
          />
          {text ? (
            <button aria-label="Leeren" className="text-white/40" onClick={() => setText("")} type="button">
              <IconX className="size-4" />
            </button>
          ) : null}
        </label>
      </div>
      <p className="px-4 pb-1 pt-4 text-[13px] font-semibold uppercase tracking-wide text-white/35">{term ? "Ergebnisse" : "Vorschläge"}</p>
      {results.isLoading ? <Spinner /> : null}
      {!results.isLoading && list.length === 0 ? <EmptyState text={term ? `Nichts gefunden für „${term}“.` : "Noch keine öffentlichen Profile."} title="Keine Treffer" /> : null}
      {list.map((profile) => (
        <ProfileRow as={me.as} key={profile.id} onOpen={onOpenProfile} profile={profile} />
      ))}
    </div>
  );
}

function joinedLabel(iso: string) {
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? `Seit ${d.toLocaleDateString("de-DE", { month: "long", year: "numeric" })} dabei` : "";
}

/** Kurs-Karte: fester Teil jedes Unternehmensprofils (bestehende Kursdaten, nur Anzeige). */
export function StockHeaderCard({ ticker, companyName }: { ticker: string; companyName: string }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((n) => n + 1), 4_000);
    return () => window.clearInterval(id);
  }, []);
  const quote = getLiveQuote(ticker);
  if (!quote) return null;
  const up = quote.changePct >= 0;
  return (
    <a
      aria-label={`${quote.label} Kurs von ${companyName}`}
      className="flex items-center gap-3 rounded-2xl border border-white/10 bg-gradient-to-r from-white/[0.06] to-white/[0.02] px-3.5 py-2.5 transition-colors hover:border-white/20"
      data-testid="social-stock-card"
      href={quote.marketUrl}
      onClick={(e) => e.stopPropagation()}
      rel="noopener noreferrer nofollow"
      target="_blank"
    >
      <span className="rounded-lg bg-white/[0.08] px-2 py-1 font-mono text-[14px] font-bold tracking-tight text-white">{quote.label}</span>
      <span className="font-mono text-[18px] font-bold tabular-nums text-white">{quote.priceUsd}</span>
      <span className={cn("ml-auto inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[13px] font-bold tabular-nums", up ? "bg-emerald-400/10 text-emerald-300" : "bg-rose-400/10 text-rose-300")}>
        {up ? <IconTrendingUp className="size-4" /> : <IconTrendingDown className="size-4" />}
        {up ? "+" : ""}
        {quote.changePct}%
      </span>
    </a>
  );
}

export const tickerOf = (profile: Pick<SocialProfile, "ticker" | "localId" | "handle">) =>
  profile.ticker?.trim() || `$${(profile.localId || profile.handle).replace(/[^a-z0-9]/gi, "").slice(0, 4).toUpperCase()}`;

type ProfileTab = "posts" | "agents" | "projects" | "followers" | "following";

/**
 * Unternehmensprofil (X-Stil): Banner, Logo, Name + Haken, @handle, Kurs-Karte, Beschreibung,
 * Folgen, Follower/Folgt. Tabs: Posts · Agenten · Projekte. Verfassen-Feld für eigene Firma.
 * Wird in Connect Social und auf der Firmenseite (Handy + PC) verwendet.
 */
export function UnternehmensProfil({
  me,
  handle,
  onOpenProfile,
  onOpenPost,
  onBack,
  backLabel,
  ownerExtras,
  hideTopBar,
  stickyTabs = true,
}: {
  me: ReturnType<typeof useSocialMe>;
  handle: string;
  onOpenProfile: (h: string) => void;
  onOpenPost: (id: string) => void;
  onBack?: () => void;
  backLabel?: string;
  /** z.B. „Profil bearbeiten“ auf der Firmenseite */
  ownerExtras?: ReactNode;
  /** Eingebettet (Firmenseite): eigene Kopfzeile weglassen, Tabs nicht kleben. */
  hideTopBar?: boolean;
  stickyTabs?: boolean;
}) {
  const [tab, setTab] = useState<ProfileTab>("posts");
  const queryClient = useQueryClient();
  const profileQuery = useQuery({ queryKey: socialKeys.profile(handle, me.as), queryFn: () => socialApi.profile(handle, me.as), enabled: !me.unavailable && Boolean(handle), retry: false });
  const profile = profileQuery.data?.profile;
  const posts = useInfinite(socialKeys.posts(profile?.id ?? "-", me.as), (before) => socialApi.profilePosts(profile?.id ?? "", me.as, before), Boolean(profile) && tab === "posts");
  const follows = useQuery({
    queryKey: socialKeys.follows(profile?.id ?? "-", tab, me.as),
    queryFn: () => socialApi.follows(profile?.id ?? "", tab === "followers" ? "followers" : "following", me.as),
    enabled: Boolean(profile) && (tab === "followers" || tab === "following"),
  });
  const publicMutation = useMutation({
    mutationFn: (next: boolean) => {
      if (!profile?.localId) throw new Error("Firma nicht gefunden.");
      return setCompanyPublic(profile.localId, next, profile);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: socialKeys.all }),
  });
  useEffect(() => setTab("posts"), [handle]);
  const loadMore = useCallback(() => {
    if (posts.hasNextPage && !posts.isFetchingNextPage) void posts.fetchNextPage();
  }, [posts]);
  const list = posts.data?.pages.flatMap((p) => p.posts) ?? [];

  const header = hideTopBar ? null : (
    <div className="sticky top-0 z-10 flex items-center gap-4 border-b border-white/[0.06] bg-[#07080c]/85 px-3 py-2 pt-[max(0.5rem,env(safe-area-inset-top))] backdrop-blur-xl">
      {onBack ? (
        <button aria-label={backLabel ?? "Zurück"} className="rounded-full p-2 text-white hover:bg-white/10" onClick={onBack} type="button">
          <IconArrowLeft className="size-5" />
        </button>
      ) : null}
      <div className="min-w-0">
        <p className="flex items-center gap-1 truncate text-[17px] font-bold text-white">
          {profile?.name ?? `@${handle}`}
          {profile?.kind === "company" ? <VerifiedBadge className="size-4" /> : null}
        </p>
        {profile ? <p className="text-[12px] text-white/40">{profile.posts ?? 0} Posts</p> : null}
      </div>
    </div>
  );
  if (profileQuery.isLoading) return <div>{header}<Spinner /></div>;
  if (!profile) return <div>{header}<EmptyState text="Das Profil gibt es nicht oder es ist nicht öffentlich." title="Profil nicht gefunden" /></div>;
  const website = profile.website ? (/^https?:\/\//.test(profile.website) ? profile.website : `https://${profile.website}`) : null;
  const agents = profile.agents ?? [];
  const projects = profile.projects ?? [];
  const tabs: Array<[ProfileTab, string]> = [["posts", "Posts"], ["agents", `Agenten${agents.length ? ` · ${agents.length}` : ""}`], ["projects", "Projekte"]];
  return (
    <div data-testid="social-profile">
      {header}
      <div className="h-28 w-full sm:h-40" style={{ background: profile.accent || "linear-gradient(135deg,#0ea5e9 0%,#6366f1 55%,#0b0b12 100%)", opacity: 0.85 }} />
      <div className="px-4">
        <div className="flex items-end justify-between gap-2">
          <div className="-mt-11 rounded-[26px] bg-[#07080c] p-1 sm:-mt-14">
            <SocialAvatar profile={profile} size={84} />
          </div>
          <div className="mb-1 flex flex-wrap items-center justify-end gap-2 pt-3">
            {profile.mine ? (
              <>
                {ownerExtras}
                <label className="flex items-center gap-2 rounded-full border border-white/10 px-3 py-1.5 text-[13px] text-white/75">
                  Öffentlich
                  <Toggle checked={profile.isPublic} disabled={publicMutation.isPending} label="Profil öffentlich" onChange={(next) => publicMutation.mutate(next)} />
                </label>
              </>
            ) : (
              <FollowButton as={me.as} profile={profile} size="lg" />
            )}
          </div>
        </div>
        <div className="mt-2.5">
          <div className="flex items-center gap-1.5">
            <h2 className="truncate text-[21px] font-extrabold tracking-tight text-white">{profile.name}</h2>
            {profile.kind === "company" ? <VerifiedBadge className="size-5" /> : null}
          </div>
          <p className="text-[14px] text-white/45">
            @{profile.handle}
            {profile.followsYou ? <span className="ml-2 rounded bg-white/10 px-1.5 py-px text-[11px] text-white/60">Folgt dir</span> : null}
          </p>
          {profile.kind === "company" ? (
            <div className="mt-3">
              <StockHeaderCard companyName={profile.name} ticker={tickerOf(profile)} />
            </div>
          ) : null}
          {profile.subtitle ? <p className="mt-3 text-[15px] leading-snug text-white/90">{profile.subtitle}</p> : null}
          {profile.bio ? <p className="mt-1 whitespace-pre-line text-[14px] leading-snug text-white/70">{profile.bio}</p> : null}
          <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-white/45">
            {profile.category ? <span className="inline-flex items-center gap-1"><IconBuildingStore className="size-4" />{profile.category}</span> : null}
            {profile.location ? <span className="inline-flex items-center gap-1"><IconMapPin className="size-4" />{profile.location}</span> : null}
            {website ? (
              <a className="inline-flex items-center gap-1 text-sky-400 hover:underline" href={website} rel="noopener noreferrer nofollow" target="_blank">
                <IconLink className="size-4" />
                {profile.website}
              </a>
            ) : null}
            <span className="inline-flex items-center gap-1"><IconCalendar className="size-4" />{joinedLabel(profile.createdAt)}</span>
          </div>
          <div className="mt-3 flex gap-5 text-[14px]">
            <button className="hover:underline" data-testid="social-following-count" onClick={() => setTab("following")} type="button">
              <strong className="text-white">{profile.following ?? 0}</strong> <span className="text-white/45">Folgt</span>
            </button>
            <button className="hover:underline" data-testid="social-followers-count" onClick={() => setTab("followers")} type="button">
              <strong className="text-white">{profile.followers ?? 0}</strong> <span className="text-white/45">Follower</span>
            </button>
          </div>
          {profile.mine && !profile.isPublic ? (
            <p className="mt-3 rounded-2xl border border-amber-400/20 bg-amber-400/[0.06] px-3 py-2 text-[13px] text-amber-200/90">Nur du siehst dieses Profil. Schalte „Öffentlich“ ein, damit andere es finden.</p>
          ) : null}
        </div>
      </div>
      <div className="mt-3">
        {tab === "followers" || tab === "following" ? (
          <div className="flex items-center gap-2 border-b border-white/[0.06] px-2 py-1.5">
            <button aria-label="Zurück zu Posts" className="rounded-full p-2 text-white hover:bg-white/10" onClick={() => setTab("posts")} type="button">
              <IconArrowLeft className="size-4" />
            </button>
            <TabBar onChange={setTab} sticky={false} tabs={[["followers", "Follower"], ["following", "Folgt"]]} value={tab} />
          </div>
        ) : (
          <TabBar onChange={setTab} sticky={stickyTabs} tabs={tabs} value={tab} />
        )}
      </div>
      {tab === "posts" ? (
        <>
          {profile.mine && profile.isPublic ? <Composer active={profile} compact mine={[profile]} /> : null}
          {posts.isLoading ? <Spinner /> : null}
          {!posts.isLoading && list.length === 0 ? <EmptyState text={profile.mine ? "Schreib den ersten Post deiner Firma." : "Diese Firma hat noch nichts gepostet."} title="Noch keine Posts" /> : null}
          {list.map((post) => (
            <PostCard as={me.as} key={post.id} onOpenPost={onOpenPost} onOpenProfile={onOpenProfile} post={post} />
          ))}
          {posts.isFetchingNextPage ? <Spinner /> : null}
          <LoadMore active={Boolean(posts.hasNextPage)} onVisible={loadMore} />
        </>
      ) : tab === "agents" ? (
        <div className="space-y-2.5 px-4 py-4" data-testid="social-agents-tab">
          {agents.length === 0 ? <EmptyState text={profile.mine ? "Füge der Firma Agenten hinzu – sie erscheinen hier mit Kaufen/Mieten." : "Diese Firma zeigt noch keine Agenten."} title="Keine Agenten" /> : null}
          {agents.map((a) => (
            <AgentCardView agent={a} key={a.id} />
          ))}
        </div>
      ) : tab === "projects" ? (
        <div className="grid gap-2.5 px-4 py-4 sm:grid-cols-2" data-testid="social-projects-tab">
          {projects.length === 0 ? <div className="sm:col-span-2"><EmptyState text="Noch keine Projekte veröffentlicht." title="Keine Projekte" /></div> : null}
          {projects.map((p) => (
            <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-3.5 py-3" key={p.id}>
              <SocialAvatar profile={{ name: p.name, logo: p.logo, accent: p.accent }} size={42} />
              <div className="min-w-0">
                <p className="truncate text-[15px] font-semibold text-white">{p.name}</p>
                {p.description ? <p className="line-clamp-2 text-[13px] text-white/50">{p.description}</p> : null}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <>
          {follows.isLoading ? <Spinner /> : null}
          {!follows.isLoading && (follows.data?.profiles.length ?? 0) === 0 ? (
            <EmptyState text={tab === "followers" ? "Noch keine Follower." : "Folgt noch niemandem."} title={tab === "followers" ? "Follower" : "Folgt"} />
          ) : null}
          {follows.data?.profiles.map((p) => (
            <ProfileRow as={me.as} key={p.id} onOpen={onOpenProfile} profile={p} />
          ))}
        </>
      )}
    </div>
  );
}

/** Post-Detail wie bei X: Post groß, darunter Antworten, Antwort-Feld unten fixiert. */
function PostDetailView({ me, id, onOpenProfile, onOpenPost, onBack }: { me: ReturnType<typeof useSocialMe>; id: string; onOpenProfile: (h: string) => void; onOpenPost: (id: string) => void; onBack: () => void }) {
  const q = useQuery({ queryKey: socialKeys.post(id, me.as), queryFn: () => socialApi.post(id, me.as), enabled: !me.unavailable, retry: false });
  const post = q.data?.post;
  const header = (
    <div className="sticky top-0 z-10 flex items-center gap-4 border-b border-white/[0.06] bg-[#07080c]/85 px-3 py-2 pt-[max(0.5rem,env(safe-area-inset-top))] backdrop-blur-xl">
      <button aria-label="Zurück" className="rounded-full p-2 text-white hover:bg-white/10" onClick={onBack} type="button">
        <IconArrowLeft className="size-5" />
      </button>
      <p className="text-[17px] font-bold text-white">Post</p>
    </div>
  );
  if (q.isLoading) return <div>{header}<Spinner /></div>;
  if (!post) return <div>{header}<EmptyState text="Der Post wurde gelöscht oder ist nicht öffentlich." title="Post nicht gefunden" /></div>;
  const p = post.profile;
  const when = new Date(post.createdAt);
  return (
    <div className="flex min-h-full flex-col" data-testid="social-post-detail">
      {header}
      {post.replyTo ? (
        <button className="px-4 pt-3 text-left text-[13px] text-sky-400 hover:underline" onClick={() => onOpenPost(post.replyTo as string)} type="button">
          Ursprünglichen Post anzeigen
        </button>
      ) : null}
      <article className="border-b border-white/[0.06] px-4 pb-3 pt-3">
        <div className="flex items-center gap-3">
          <button onClick={() => onOpenProfile(p.handle)} type="button">
            <SocialAvatar profile={p} size={44} />
          </button>
          <div className="min-w-0 flex-1">
            <button className="flex items-center gap-1 text-[15px] font-bold text-white hover:underline" onClick={() => onOpenProfile(p.handle)} type="button">
              {p.name}
              {p.kind === "company" ? <VerifiedBadge /> : null}
            </button>
            <p className="text-[14px] text-white/45">@{p.handle}</p>
          </div>
          {!p.mine ? <FollowButton as={me.as} profile={p} /> : null}
        </div>
        {post.body ? <p className="mt-3 whitespace-pre-wrap break-words text-[17px] leading-snug text-white">{post.body}</p> : null}
        {post.attachment?.type === "agent" ? <AgentCardView agent={post.attachment.agent} /> : null}
        <ImageGrid images={post.images} large />
        <p className="mt-3 text-[14px] text-white/45">
          {when.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })} · {when.toLocaleDateString("de-DE", { day: "numeric", month: "short", year: "numeric" })}
        </p>
        <div className="mt-3 flex gap-5 border-t border-white/[0.06] pt-3 text-[14px]">
          <span><strong className="text-white">{post.replies}</strong> <span className="text-white/45">Antworten</span></span>
          <span><strong className="text-white">{post.likes}</strong> <span className="text-white/45">Likes</span></span>
        </div>
      </article>
      <div className="flex-1">
        {(q.data?.replies ?? []).length === 0 ? <p className="px-4 py-8 text-center text-[14px] text-white/40">Noch keine Antworten. Schreib die erste.</p> : null}
        {(q.data?.replies ?? []).map((reply) => (
          <PostCard as={me.as} key={reply.id} onOpenPost={onOpenPost} onOpenProfile={onOpenProfile} post={reply} />
        ))}
        <div className="h-24" />
      </div>
      <div className="sticky bottom-0 z-10 pb-[env(safe-area-inset-bottom)]">
        <Composer active={me.active} docked mine={me.mine} replyTo={post.id} replyToHandle={p.handle} />
      </div>
    </div>
  );
}

/** „Profil“-Tab: eigene Firmen mit Schalter „Profil öffentlich“ + aktive Firma wählen. */
function MeView({ me, onOpenProfile, header }: { me: ReturnType<typeof useSocialMe>; onOpenProfile: (h: string) => void; header?: ReactNode }) {
  const [companies, setCompanies] = useState(() => listCompanies());
  useEffect(() => subscribeCompanies(() => setCompanies(listCompanies())), []);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const byLocal = new Map(me.mine.map((p) => [p.localId ?? "", p]));
  return (
    <div data-testid="social-me">
      {header ?? (
        <div className="sticky top-0 z-10 border-b border-white/[0.06] bg-[#07080c]/85 px-4 py-3 backdrop-blur-xl">
          <p className="text-[19px] font-bold text-white">Meine Firmen</p>
        </div>
      )}
      <p className="px-4 pt-3 text-[13px] leading-relaxed text-white/45">
        Öffentlich werden nur Name, @Handle, Untertitel, Logo, Website, Kategorie, Ort, $-Ticker und öffentliche Firmen-Posts – nie Lab-Tabs, Kanäle, Agenten oder Keys.
      </p>
      {error ? <p className="px-4 pt-2 text-[13px] text-rose-400">{error}</p> : null}
      {companies.length === 0 ? <EmptyState text="Lege zuerst eine Firma an." title="Keine Firmen" /> : null}
      <ul className="mt-2">
        {companies.map((company) => {
          const server = byLocal.get(company.id);
          const isPublic = Boolean(server?.isPublic);
          const active = me.active?.id === server?.id && isPublic;
          return (
            <li className="flex items-center gap-3 border-b border-white/[0.06] px-4 py-3" key={company.id}>
              <button className="flex min-w-0 flex-1 items-center gap-3 text-left" disabled={!server} onClick={() => server && onOpenProfile(server.handle)} type="button">
                <SocialAvatar profile={{ name: company.name, logo: server?.logo ?? (company.logo?.startsWith("data:") || company.logo?.startsWith("/") ? company.logo : null), accent: company.accent }} size={44} />
                <div className="min-w-0">
                  <p className="truncate text-[15px] font-semibold text-white">
                    {company.name}
                    {active ? <span className="ml-2 rounded-full bg-sky-400/15 px-2 py-px text-[11px] font-semibold text-sky-300">Aktiv</span> : null}
                  </p>
                  <p className="truncate text-[13px] text-white/40">{server ? `@${server.handle} · ${server.followers ?? 0} Follower` : "Nicht veröffentlicht"}</p>
                </div>
              </button>
              {isPublic && !active && server ? (
                <button className="rounded-full border border-white/10 px-2.5 py-1 text-[12px] text-white/70 hover:bg-white/5" onClick={() => writeSocialAs(server.id)} type="button">
                  Als aktiv
                </button>
              ) : null}
              <Toggle
                checked={isPublic}
                disabled={busy === company.id || Boolean(me.unavailable)}
                label={`${company.name} öffentlich`}
                onChange={(next) => {
                  setBusy(company.id);
                  setError(null);
                  void setCompanyPublic(company.id, next, server)
                    .catch((e) => setError(e instanceof Error ? e.message : "Nicht gespeichert."))
                    .finally(() => setBusy(null));
                }}
              />
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Suggestions({ me, onOpenProfile }: { me: ReturnType<typeof useSocialMe>; onOpenProfile: (h: string) => void }) {
  const q = useQuery({ queryKey: socialKeys.search("", me.as), queryFn: () => socialApi.search("", me.as), enabled: !me.unavailable, staleTime: 30_000 });
  const list = (q.data?.profiles ?? []).filter((p) => !p.mine && !p.isFollowing).slice(0, 5);
  if (list.length === 0) return null;
  return (
    <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.02]">
      <p className="px-4 pb-1 pt-3 text-[17px] font-bold text-white">Wem folgen</p>
      {list.map((p) => (
        <ProfileRow as={me.as} key={p.id} onOpen={onOpenProfile} profile={p} />
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ shell

const NAV: Array<{ tab: SocialView["tab"]; label: string; icon: typeof IconHome; activeIcon: typeof IconHome }> = [
  { tab: "home", label: "Start", icon: IconHome, activeIcon: IconHomeFilled },
  { tab: "search", label: "Suche", icon: IconSearch, activeIcon: IconSearch },
  { tab: "me", label: "Profil", icon: IconUser, activeIcon: IconUserFilled },
];

export function SocialApp({ variant = "page", view: controlled, onNavigate, onExit }: { variant?: "page" | "embedded"; view?: SocialView; onNavigate?: (view: SocialView, replace?: boolean) => void; onExit?: () => void }) {
  const me = useSocialMe();
  const [internal, setInternal] = useState<SocialView>(controlled ?? { tab: "home" });
  const [history, setHistory] = useState<SocialView[]>([]);
  const [composeOpen, setComposeOpen] = useState(false);
  const view = controlled ?? internal;
  const scrollRef = useRef<HTMLDivElement>(null);

  const go = useCallback(
    (next: SocialView) => {
      setHistory((h) => [...h.slice(-20), view]);
      if (onNavigate) onNavigate(next);
      else setInternal(next);
      scrollRef.current?.scrollTo({ top: 0 });
      if (variant === "embedded") (scrollRef.current?.closest(".connect-mobile-page") as HTMLElement | null)?.scrollTo({ top: 0 });
    },
    [onNavigate, variant, view],
  );
  const back = useCallback(() => {
    const prev = history[history.length - 1] ?? { tab: "home" as const };
    setHistory((h) => h.slice(0, -1));
    if (onNavigate) onNavigate(prev);
    else setInternal(prev);
  }, [history, onNavigate]);
  const openProfile = useCallback((handle: string) => go({ tab: "profile", handle }), [go]);
  const openPost = useCallback((id: string) => go({ tab: "post", id }), [go]);
  const embedded = variant === "embedded";

  let content: ReactNode;
  if (me.unavailable) {
    content = <EmptyState text={me.unavailable} title="Analysis nicht verfügbar" />;
  } else if (view.tab === "search") {
    content = <SearchView initial={view.q} me={me} onBack={embedded ? back : undefined} onOpenProfile={openProfile} />;
  } else if (view.tab === "profile") {
    content = <UnternehmensProfil handle={view.handle} me={me} onBack={back} onOpenPost={openPost} onOpenProfile={openProfile} />;
  } else if (view.tab === "post") {
    content = <PostDetailView id={view.id} me={me} onBack={back} onOpenPost={openPost} onOpenProfile={openProfile} />;
  } else if (view.tab === "me") {
    content = (
      <MeView
        header={
          embedded ? (
            <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-white/[0.06] bg-[#07080c]/85 px-2 py-2 backdrop-blur-xl">
              <button aria-label="Zurück" className="rounded-full p-2 text-white hover:bg-white/10" onClick={back} type="button">
                <IconArrowLeft className="size-5" />
              </button>
              <p className="text-[17px] font-bold text-white">Meine Firmen</p>
            </div>
          ) : undefined
        }
        me={me}
        onOpenProfile={openProfile}
      />
    );
  } else {
    content = (
      <FeedView
        header={
          embedded ? (
            <div className="flex items-center gap-2 bg-[#07080c]/85 px-4 pb-1 pt-2 backdrop-blur-xl">
              <img alt="" className="size-7 rounded-lg object-contain" src="/brand/analysis-logo.png" />
              <p className="text-[22px] font-semibold tracking-tight text-white">Analysis</p>
              <div className="ml-auto flex items-center gap-1">
                <button aria-label="Suche" className="rounded-full p-2 text-white/80 hover:bg-white/10" data-testid="social-open-search" onClick={() => go({ tab: "search" })} type="button">
                  <IconSearch className="size-[21px]" />
                </button>
                <button aria-label="Meine Firmen" className="rounded-full p-0.5 hover:bg-white/10" onClick={() => go({ tab: "me" })} type="button">
                  {me.active ? <SocialAvatar profile={me.active} size={30} /> : <IconUser className="m-1.5 size-[21px] text-white/80" />}
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3 bg-[#07080c]/85 px-4 pb-1 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur-xl md:hidden">
              {onExit ? (
                <button aria-label="Zurück zu Connect" className="-ml-2 rounded-full p-1.5 text-white/80 active:bg-white/10" onClick={onExit} type="button">
                  <IconArrowLeft className="size-5" />
                </button>
              ) : null}
              <button aria-label="Meine Firmen" onClick={() => go({ tab: "me" })} type="button">
                {me.active ? <SocialAvatar profile={me.active} size={32} /> : <IconUser className="size-6 text-white/70" />}
              </button>
              <img alt="" className="size-7 rounded-lg object-contain" src="/brand/analysis-logo.png" />
              <p className="text-[19px] font-bold text-white">Analysis</p>
            </div>
          )
        }
        me={me}
        onOpenPost={openPost}
        onOpenProfile={openProfile}
        showComposer={!embedded}
      />
    );
  }

  const composeOverlay = composeOpen ? (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/70 backdrop-blur-sm sm:pt-20" onClick={() => setComposeOpen(false)}>
      <div className="w-full max-w-[600px] overflow-hidden bg-[#0b0c11] sm:rounded-3xl sm:border sm:border-white/10" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-3 pt-[max(0.5rem,env(safe-area-inset-top))]">
          <button aria-label="Schließen" className="rounded-full p-2 text-white hover:bg-white/10" onClick={() => setComposeOpen(false)} type="button">
            <IconX className="size-5" />
          </button>
        </div>
        <Composer active={me.active} autoFocus mine={me.mine} onPosted={() => setComposeOpen(false)} />
      </div>
    </div>
  ) : null;

  if (embedded) {
    return (
      <div className="relative min-h-full text-white" data-testid="social-embedded" ref={scrollRef}>
        {content}
        {composeOverlay}
      </div>
    );
  }

  return (
    <div className="dark flex h-full min-h-0 w-full flex-1 bg-[#07080c] text-white antialiased" data-testid="social-app">
      {/* PC: Seitenleiste wie bei X */}
      <aside className="hidden w-[76px] shrink-0 flex-col items-center gap-1 border-r border-white/[0.06] px-2 py-4 md:flex lg:w-[248px] lg:items-stretch lg:px-3">
        <div className="mb-3 flex items-center gap-2 px-2 lg:px-3">
          <img alt="" className="size-9 rounded-xl object-contain" src="/brand/analysis-logo.png" />
          <span className="hidden text-[17px] font-bold tracking-tight lg:inline">Analysis</span>
        </div>
        {NAV.map((item) => {
          const active = view.tab === item.tab || (item.tab === "me" && view.tab === "profile" && me.mine.some((p) => p.handle === view.handle));
          const Icon = active ? item.activeIcon : item.icon;
          return (
            <button
              aria-current={active ? "page" : undefined}
              className={cn("flex items-center gap-4 rounded-full px-3 py-3 text-[18px] transition-colors hover:bg-white/[0.06] lg:pr-5", active ? "font-bold text-white" : "text-white/75")}
              data-testid={`social-nav-${item.tab}`}
              key={item.tab}
              onClick={() => go(item.tab === "search" ? { tab: "search" } : item.tab === "me" ? { tab: "me" } : { tab: "home" })}
              title={item.label}
              type="button"
            >
              <Icon className="size-[26px]" />
              <span className="hidden lg:inline">{item.label}</span>
            </button>
          );
        })}
        <button
          className="mt-3 flex h-12 items-center justify-center rounded-full bg-white text-[16px] font-bold text-black transition-colors hover:bg-white/85 disabled:opacity-40"
          disabled={!me.active?.isPublic}
          onClick={() => setComposeOpen(true)}
          title={me.active?.isPublic ? "Neuer Post" : "Zuerst eine Firma veröffentlichen"}
          type="button"
        >
          <IconPlus className="size-6 lg:hidden" />
          <span className="hidden lg:inline">Posten</span>
        </button>
        {me.active ? (
          <button className="mt-auto flex items-center gap-3 rounded-full p-2 text-left hover:bg-white/[0.06]" onClick={() => go({ tab: "profile", handle: me.active?.handle ?? "" })} type="button">
            <SocialAvatar profile={me.active} size={38} />
            <span className="hidden min-w-0 lg:block">
              <span className="block truncate text-[14px] font-semibold">{me.active.name}</span>
              <span className="block truncate text-[13px] text-white/45">@{me.active.handle}</span>
            </span>
          </button>
        ) : null}
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 justify-center">
        <div className="flex min-h-0 w-full max-w-[620px] flex-col border-white/[0.06] md:border-r">
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain" ref={scrollRef}>
            {content}
          </div>
          {/* Handy: Tab-Leiste unten wie bei X */}
          <nav className={cn("flex shrink-0 items-center justify-around border-t border-white/[0.08] bg-[#07080c]/95 pb-[max(0.4rem,env(safe-area-inset-bottom))] pt-1.5 backdrop-blur-xl md:hidden", view.tab === "post" && "hidden")} data-testid="social-bottom-nav">
            {NAV.map((item) => {
              const active = view.tab === item.tab;
              const Icon = active ? item.activeIcon : item.icon;
              return (
                <button aria-label={item.label} className={cn("flex flex-1 flex-col items-center gap-0.5 py-1 text-[11px]", active ? "text-white" : "text-white/50")} key={item.tab} onClick={() => go(item.tab === "search" ? { tab: "search" } : item.tab === "me" ? { tab: "me" } : { tab: "home" })} type="button">
                  <Icon className="size-[25px]" />
                  {item.label}
                </button>
              );
            })}
          </nav>
          {me.active?.isPublic && view.tab !== "me" && view.tab !== "post" ? (
            <button
              aria-label="Neuer Post"
              className="fixed bottom-[calc(4.6rem+env(safe-area-inset-bottom))] right-5 z-20 flex size-14 items-center justify-center rounded-full bg-gradient-to-br from-sky-400 to-indigo-500 text-white shadow-[0_8px_30px_rgba(56,189,248,0.35)] active:scale-95 md:hidden"
              onClick={() => setComposeOpen(true)}
              type="button"
            >
              <IconPlus className="size-7" stroke={2.2} />
            </button>
          ) : null}
        </div>
        <aside className="hidden w-[340px] shrink-0 flex-col gap-4 overflow-y-auto px-5 py-4 xl:flex">
          <button
            className="flex h-11 items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-4 text-left text-[15px] text-white/40 hover:border-white/20"
            onClick={() => go({ tab: "search" })}
            type="button"
          >
            <IconSearch className="size-[18px]" /> Firmen suchen
          </button>
          <Suggestions me={me} onOpenProfile={openProfile} />
          <p className="px-2 text-[12px] leading-relaxed text-white/30">Analysis · öffentliche Connect-Firmenprofile und Beiträge.</p>
        </aside>
      </div>
      {composeOverlay}
    </div>
  );
}
