/**
 * Connect Social – kleine Bausteine (Avatar, Folgen-Knopf, Post-Karte, Schalter). Dunkel, minimal.
 */
import {
  IconCheck,
  IconMessageCircle,
  IconRosetteDiscountCheckFilled,
  IconShoppingCart,
  IconClockHour4,
  IconExternalLink,
  IconHeart,
  IconHeartFilled,
  IconLink,
  IconTrash,
} from "@tabler/icons-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";
import { deletePost as deleteLocalPost } from "@/lib/companies/posts";
import { type SocialAgentCard, type SocialPost, type SocialProfile, socialApi, socialKeys } from "@/lib/social/api";
import { cn } from "@/lib/utils";

export function SocialAvatar({ profile, size = 44, className }: { profile: Pick<SocialProfile, "name" | "logo" | "accent">; size?: number; className?: string }) {
  const [broken, setBroken] = useState(false);
  const radius = Math.round(size * 0.28);
  const style = { width: size, height: size, borderRadius: radius };
  if (profile.logo && !broken) {
    return (
      <img
        alt=""
        className={cn("shrink-0 bg-white/5 object-cover ring-1 ring-white/10", className)}
        decoding="async"
        onError={() => setBroken(true)}
        src={profile.logo}
        style={style}
      />
    );
  }
  return (
    <div
      aria-hidden
      className={cn("flex shrink-0 items-center justify-center font-semibold text-white ring-1 ring-white/10", className)}
      style={{ ...style, background: profile.accent || "linear-gradient(145deg,#334155,#0f172a)", fontSize: Math.round(size * 0.42) }}
    >
      {profile.name.trim().charAt(0).toUpperCase() || "?"}
    </div>
  );
}

export function TickerChip({ ticker }: { ticker: string | null }) {
  if (!ticker) return null;
  return <span className="rounded-md bg-emerald-400/10 px-1.5 py-px font-mono text-[11px] font-semibold text-emerald-300/90">{ticker}</span>;
}

export function FollowButton({ profile, as, size = "sm" }: { profile: SocialProfile; as: string | null; size?: "sm" | "lg" }) {
  const queryClient = useQueryClient();
  const [hover, setHover] = useState(false);
  const following = Boolean(profile.isFollowing);
  const mutation = useMutation({
    mutationFn: () => {
      if (!as) throw new Error("Veröffentliche zuerst eine eigene Firma.");
      return socialApi.follow(as, profile.id, !following);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: socialKeys.all }),
  });
  if (profile.mine) return null;
  const base = size === "lg" ? "h-9 px-4 text-[14px]" : "h-8 px-3.5 text-[13px]";
  return (
    <button
      className={cn(
        "shrink-0 rounded-full font-semibold transition-colors disabled:opacity-50",
        base,
        following
          ? "border border-white/15 text-white hover:border-rose-400/40 hover:bg-rose-500/10 hover:text-rose-300"
          : "bg-white text-black hover:bg-white/85",
      )}
      data-testid="social-follow"
      disabled={mutation.isPending || !as}
      onClick={(event) => {
        event.stopPropagation();
        mutation.mutate();
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      title={as ? undefined : "Veröffentliche zuerst eine eigene Firma"}
      type="button"
    >
      {following ? (hover ? "Entfolgen" : "Folge ich") : profile.followsYou ? "Zurückfolgen" : "Folgen"}
    </button>
  );
}

export function Toggle({ checked, onChange, disabled, label }: { checked: boolean; onChange: (next: boolean) => void; disabled?: boolean; label: string }) {
  return (
    <button
      aria-checked={checked}
      aria-label={label}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50",
        checked ? "bg-sky-500" : "bg-white/15",
      )}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      role="switch"
      type="button"
    >
      <span className={cn("inline-block size-5 rounded-full bg-white shadow transition-transform", checked ? "translate-x-[22px]" : "translate-x-0.5")} />
    </button>
  );
}

/** Verifiziert-Haken wie bei X (Firmenprofile in Connect Social). */
export function VerifiedBadge({ className }: { className?: string }) {
  return <IconRosetteDiscountCheckFilled aria-label="Verifiziertes Unternehmen" className={cn("size-[18px] shrink-0 text-sky-400", className)} />;
}

export function AgentAvatar({ agent, size = 44 }: { agent: Pick<SocialAgentCard, "name" | "avatar">; size?: number }) {
  return <SocialAvatar profile={{ name: agent.name, logo: agent.avatar, accent: "linear-gradient(145deg,#4f46e5,#0ea5e9)" }} size={size} />;
}

/** Agenten-Karte (im Post und im Tab „Agenten“): Kaufen/Mieten führen zur Original-Seite des Anbieters. */
export function AgentCardView({ agent, compact }: { agent: SocialAgentCard; compact?: boolean }) {
  return (
    <div className={cn("flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03]", compact ? "mt-2.5 px-3 py-2.5" : "px-3.5 py-3")} data-testid="social-agent-card" onClick={(e) => e.stopPropagation()}>
      <AgentAvatar agent={agent} size={compact ? 42 : 48} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-semibold text-white">{agent.name}</p>
        <p className="truncate text-[13px] text-white/50">{agent.role || "Agent"}</p>
        {agent.price ? <p className="mt-0.5 text-[12px] font-semibold text-emerald-300/90">{agent.price}</p> : null}
      </div>
      <div className="flex shrink-0 flex-col gap-1.5 sm:flex-row">
        {agent.buyUrl ? (
          <a className="inline-flex h-8 items-center gap-1 rounded-full bg-white px-3 text-[13px] font-bold text-black hover:bg-white/85" href={agent.buyUrl} rel="noopener noreferrer nofollow" target="_blank">
            <IconShoppingCart className="size-3.5" /> Kaufen
          </a>
        ) : null}
        {agent.rentUrl ? (
          <a className="inline-flex h-8 items-center gap-1 rounded-full border border-white/20 px-3 text-[13px] font-semibold text-white hover:bg-white/10" href={agent.rentUrl} rel="noopener noreferrer nofollow" target="_blank">
            <IconClockHour4 className="size-3.5" /> Mieten
          </a>
        ) : null}
        {!agent.buyUrl && !agent.rentUrl ? <span className="text-[12px] text-white/35">Kein Angebot</span> : null}
      </div>
    </div>
  );
}

/** Zeichen-Kreis wie bei X (2000 Zeichen). */
export function CharRing({ length, max = 2000 }: { length: number; max?: number }) {
  if (length === 0) return null;
  const r = 9;
  const c = 2 * Math.PI * r;
  const ratio = Math.min(1, length / max);
  const left = max - length;
  const color = left < 0 ? "#f43f5e" : left <= 100 ? "#f59e0b" : "#38bdf8";
  return (
    <span className="relative inline-flex items-center justify-center" title={`${left} Zeichen übrig`}>
      <svg aria-hidden className="-rotate-90" height="24" viewBox="0 0 24 24" width="24">
        <circle cx="12" cy="12" fill="none" r={r} stroke="rgba(255,255,255,0.15)" strokeWidth="2" />
        <circle cx="12" cy="12" fill="none" r={r} stroke={color} strokeDasharray={c} strokeDashoffset={c * (1 - ratio)} strokeLinecap="round" strokeWidth="2" />
      </svg>
      {left <= 100 ? <span className="absolute text-[9px] tabular-nums" style={{ color }}>{left}</span> : null}
    </span>
  );
}

export function ImageGrid({ images, large }: { images: string[]; large?: boolean }) {
  if (images.length === 0) return null;
  return (
    <div className={cn("mt-2.5 grid gap-0.5 overflow-hidden rounded-2xl border border-white/10", images.length > 1 && "grid-cols-2")}>
      {images.slice(0, 4).map((src, i) => (
        <img alt="" className={cn("w-full object-cover", images.length === 1 ? (large ? "max-h-[560px]" : "max-h-[420px]") : "aspect-square")} key={`${i}-${src.slice(-12)}`} loading="lazy" src={src} />
      ))}
    </div>
  );
}

const shortTime = (iso: string): string => {
  const at = new Date(iso).getTime();
  if (!Number.isFinite(at)) return "";
  const diff = Math.max(0, Date.now() - at);
  if (diff < 60_000) return "jetzt";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} Min.`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} Std.`;
  const date = new Date(at);
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return date.toLocaleDateString("de-DE", { day: "numeric", month: "short", ...(sameYear ? {} : { year: "numeric" }) });
};

/** Text mit klickbaren Links (nur http/https), Zeilenumbrüche bleiben. */
function RichText({ text }: { text: string }) {
  const parts: ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(/https?:\/\/[^\s<>"')]+/g)) {
    const raw = match[0].replace(/[.,;:!?]+$/, "");
    const start = match.index ?? 0;
    if (start > last) parts.push(text.slice(last, start));
    parts.push(
      <a className="text-sky-400 hover:underline" href={raw} key={start} onClick={(e) => e.stopPropagation()} rel="noopener noreferrer nofollow" target="_blank">
        {raw.replace(/^https?:\/\//, "").slice(0, 48)}
        {raw.replace(/^https?:\/\//, "").length > 48 ? "…" : ""}
      </a>,
    );
    last = start + raw.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <p className="whitespace-pre-wrap break-words text-[15px] leading-[1.45] text-white/90">{parts}</p>;
}

export function PostCard({ post, as, onOpenProfile, onOpenPost }: { post: SocialPost; as: string | null; onOpenProfile: (handle: string) => void; onOpenPost?: (id: string) => void }) {
  const queryClient = useQueryClient();
  const [liked, setLiked] = useState(post.liked);
  const [likes, setLikes] = useState(post.likes);
  const [copied, setCopied] = useState(false);
  const [removed, setRemoved] = useState(false);
  const likeMutation = useMutation({
    mutationFn: (on: boolean) => {
      if (!as) throw new Error("Veröffentliche zuerst eine eigene Firma.");
      return socialApi.like(post.id, as, on);
    },
    onMutate: (on) => {
      setLiked(on);
      setLikes((n) => Math.max(0, n + (on ? 1 : -1)));
    },
    onSuccess: (data) => setLikes(data.likes),
    onError: () => {
      setLiked(post.liked);
      setLikes(post.likes);
    },
  });
  const deleteMutation = useMutation({
    mutationFn: () => socialApi.deletePost(post.id),
    onSuccess: () => {
      setRemoved(true);
      if (post.localId) deleteLocalPost(post.localId);
      void queryClient.invalidateQueries({ queryKey: socialKeys.all });
    },
  });
  if (removed) return null;
  const p = post.profile;
  const open = () => onOpenProfile(p.handle);
  const firstLink = post.links[0];
  return (
    <article
      className={cn("flex gap-3 border-b border-white/[0.06] px-4 py-3.5 transition-colors hover:bg-white/[0.015]", onOpenPost && "cursor-pointer")}
      data-testid="social-post"
      onClick={(e) => {
        if (!onOpenPost || (e.target as HTMLElement).closest("a,button,input,textarea")) return;
        onOpenPost(post.id);
      }}
    >
      <button aria-label={`${p.name} öffnen`} className="shrink-0 self-start" onClick={open} type="button">
        <SocialAvatar profile={p} size={42} />
      </button>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-1.5 text-[14px]">
          <button className="truncate font-semibold text-white hover:underline" onClick={open} type="button">
            {p.name}
          </button>
          {p.kind === "company" ? <VerifiedBadge /> : null}
          <span className="truncate text-white/40">@{p.handle}</span>
          <span className="text-white/25">·</span>
          <time className="shrink-0 text-white/40" dateTime={post.createdAt} title={new Date(post.createdAt).toLocaleString("de-DE")}>
            {shortTime(post.createdAt)}
          </time>
          {p.ticker ? <span className="ml-auto hidden sm:inline"><TickerChip ticker={p.ticker} /></span> : null}
        </div>
        {post.title && !post.body.startsWith(post.title) ? <p className="mt-0.5 text-[15px] font-semibold text-white">{post.title}</p> : null}
        <div className="mt-0.5">
          <RichText text={post.body} />
        </div>
        {post.attachment?.type === "agent" ? <AgentCardView agent={post.attachment.agent} compact /> : null}
        {post.images.length ? (
          <ImageGrid images={post.images} />
        ) : firstLink && !post.attachment ? (
          <a
            className="mt-2.5 flex items-center gap-2 rounded-2xl border border-white/10 px-3 py-2.5 text-[13px] text-white/60 hover:bg-white/[0.03]"
            href={firstLink}
            rel="noopener noreferrer nofollow"
            target="_blank"
          >
            <IconExternalLink className="size-4 shrink-0" />
            <span className="truncate">{firstLink.replace(/^https?:\/\//, "")}</span>
          </a>
        ) : null}
        <div className="mt-2 flex items-center gap-5 text-[13px] text-white/45">
          <button
            aria-label="Antworten"
            className="-ml-1.5 flex items-center gap-1.5 rounded-full px-1.5 py-1 transition-colors hover:text-sky-400"
            data-testid="social-reply-open"
            onClick={() => onOpenPost?.(post.id)}
            type="button"
          >
            <IconMessageCircle className="size-[18px]" />
            {post.replies > 0 ? <span>{post.replies}</span> : null}
          </button>
          <button
            aria-label={liked ? "Gefällt mir nicht mehr" : "Gefällt mir"}
            aria-pressed={liked}
            className={cn("flex items-center gap-1.5 rounded-full px-1.5 py-1 transition-colors hover:text-rose-400 disabled:opacity-50", liked && "text-rose-400")}
            data-testid="social-like"
            disabled={!as || likeMutation.isPending}
            onClick={() => likeMutation.mutate(!liked)}
            type="button"
          >
            {liked ? <IconHeartFilled className="size-[18px]" /> : <IconHeart className="size-[18px]" />}
            {likes > 0 ? <span>{likes}</span> : null}
          </button>
          <button
            aria-label="Link kopieren"
            className="flex items-center gap-1.5 rounded-full px-1.5 py-1 transition-colors hover:text-sky-400"
            onClick={() => {
              const url = `${window.location.origin}/social?h=${encodeURIComponent(p.handle)}`;
              void navigator.clipboard?.writeText(url).then(() => {
                setCopied(true);
                window.setTimeout(() => setCopied(false), 1500);
              });
            }}
            type="button"
          >
            {copied ? <IconCheck className="size-[18px]" /> : <IconLink className="size-[18px]" />}
          </button>
          {post.mine ? (
            <button
              aria-label="Post löschen"
              className="ml-auto flex items-center gap-1.5 rounded-full px-1.5 py-1 transition-colors hover:text-rose-400"
              disabled={deleteMutation.isPending}
              onClick={() => {
                if (window.confirm("Post löschen? Er verschwindet aus dem Feed.")) deleteMutation.mutate();
              }}
              type="button"
            >
              <IconTrash className="size-[17px]" />
            </button>
          ) : null}
        </div>
      </div>
    </article>
  );
}

export function ProfileRow({ profile, as, onOpen }: { profile: SocialProfile; as: string | null; onOpen: (handle: string) => void }) {
  return (
    <div
      className="flex cursor-pointer items-center gap-3 px-4 py-3 transition-colors hover:bg-white/[0.025]"
      data-testid="social-profile-row"
      onClick={() => onOpen(profile.handle)}
      onKeyDown={(e) => {
        if (e.key === "Enter") onOpen(profile.handle);
      }}
      role="button"
      tabIndex={0}
    >
      <SocialAvatar profile={profile} size={46} />
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-1.5">
          <p className="truncate text-[15px] font-semibold text-white">{profile.name}</p>
          <TickerChip ticker={profile.ticker} />
        </div>
        <p className="truncate text-[13px] text-white/40">
          @{profile.handle}
          {profile.followsYou ? <span className="ml-1.5 rounded bg-white/10 px-1 py-px text-[11px] text-white/60">Folgt dir</span> : null}
        </p>
        {profile.subtitle ? <p className="mt-0.5 line-clamp-2 text-[13px] text-white/65">{profile.subtitle}</p> : null}
      </div>
      {profile.mine ? (
        <span className="shrink-0 rounded-full border border-white/10 px-2.5 py-1 text-[12px] text-white/50">{profile.isPublic ? "Deine Firma" : "Privat"}</span>
      ) : (
        <FollowButton as={as} profile={profile} />
      )}
    </div>
  );
}

export function EmptyState({ title, text, action }: { title: string; text: string; action?: ReactNode }) {
  return (
    <div className="px-8 py-14 text-center">
      <p className="text-[19px] font-bold text-white">{title}</p>
      <p className="mx-auto mt-2 max-w-sm text-[14px] leading-relaxed text-white/50">{text}</p>
      {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
    </div>
  );
}
