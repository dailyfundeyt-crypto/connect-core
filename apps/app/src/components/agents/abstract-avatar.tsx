import { useEffect, useState } from "react";
import { resolveBotAvatarUrl } from "@/lib/agents/connect-avatars";

const BOT_FALLBACK = "/bots/default.png";

export function AbstractAvatar({
  name,
  seed,
  size = 40,
  agentId,
}: {
  name: string;
  seed: string;
  size?: number;
  /** When set, prefers Connect profile images / uploads over the default robot. */
  agentId?: string;
}) {
  const lookupId = agentId ?? seed;
  const [src, setSrc] = useState<string>(() =>
    resolveBotAvatarUrl(lookupId),
  );

  useEffect(() => {
    const refresh = () => setSrc(resolveBotAvatarUrl(lookupId));
    refresh();
    window.addEventListener("connect-avatars-changed", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("connect-avatars-changed", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, [lookupId]);

  return (
    <span
      role="img"
      aria-label={name}
      className="inline-flex shrink-0 overflow-hidden rounded-full bg-muted"
      style={{ height: size, width: size }}
    >
      <span aria-hidden="true" className="contents">
        <img
          alt=""
          className="size-full object-cover"
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
      </span>
    </span>
  );
}
