import { memo, useEffect, useState } from "react";
import { resolveBotAvatarUrl } from "@/lib/agents/connect-avatars";
import { cn } from "@/lib/utils";

/** Inline fallback so a stale Vite graph without the named export cannot crash the app. */
const BOT_FALLBACK = "/bots/default.png";

function BotFace({
  agentId,
  size,
}: {
  agentId: string;
  size: number;
}) {
  const [src, setSrc] = useState<string>(() => resolveBotAvatarUrl(agentId));

  useEffect(() => {
    const refresh = () => setSrc(resolveBotAvatarUrl(agentId));
    refresh();
    window.addEventListener("connect-avatars-changed", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("connect-avatars-changed", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, [agentId]);

  return (
    <img
      alt=""
      className="size-full rounded-full object-cover"
      draggable={false}
      height={size}
      onError={(event) => {
        const img = event.currentTarget;
        if (img.src.includes("default.png")) return;
        img.src = BOT_FALLBACK;
      }}
      src={src || BOT_FALLBACK}
      width={size}
    />
  );
}

/**
 * Memoized roster avatar. Row updates usually change preview/timestamp only, and
 * `use-channel-events` preserves participant id arrays for unchanged rows.
 *
 * Connect bots resolve to /bots/*.png, a user upload, or the standard robot.
 */
export const ChannelAvatar = memo(function ChannelAvatar({
  participantIds,
  size = 32,
  typing = false,
}: {
  participantIds: string[];
  size?: number;
  typing?: boolean;
}) {
  const channelSize = participantIds?.length;

  const avatar =
    channelSize === 1 ? (
      <BotFace agentId={participantIds[0]} size={size} />
    ) : (
      <div className="flex flex-row items-center size-full">
        {participantIds.slice(0, 3).map((c, i, shown) => (
          <div
            className="shrink-0 border-2 border-sidebar rounded-full flex items-center justify-center overflow-hidden"
            key={c}
            style={{
              height: size / (shown.length / 2),
              width: size / (shown.length / 2),
              transform: `translateX(${i * -75}%)`,
            }}
          >
            <BotFace
              agentId={c}
              size={size / (shown.length / 2)}
            />
          </div>
        ))}
      </div>
    );

  return (
    <div className="relative" style={{ height: size, width: size }}>
      {avatar}
      {typing ? <TypingBadge /> : null}
    </div>
  );
});

function TypingBadge() {
  return (
    <div className="absolute -bottom-0.5 -right-0.5 flex items-center gap-0.5 rounded-full bg-sidebar p-0.5 ring-2 ring-sidebar">
      <span className="sr-only">Working…</span>
      <Dot className="[animation-delay:-0.3s]" />
      <Dot className="[animation-delay:-0.15s]" />
      <Dot />
    </div>
  );
}

function Dot({ className }: { className?: string }) {
  return (
    <span
      className={cn("size-1 rounded-full bg-primary animate-bounce", className)}
    />
  );
}
