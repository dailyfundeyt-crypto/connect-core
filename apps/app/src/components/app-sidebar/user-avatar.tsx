import { useState } from "react";
import type { LocalProfile } from "@/lib/auth/local-profile";

/**
 * The one user avatar for every Connect sidebar (Focus/Messages: app-sidebar, Browser/Unternehmen:
 * level-chrome-sidebar). Order: own photo (Settings › Profil › Name & Foto) → sign-in account picture
 * (Google `user.image`) → initials.
 */
export function UserAvatar({
  profile,
  fallbackEmail,
  fallbackImage,
  className = "size-[28px]",
}: {
  /** Size / ring classes (default 28 px). */
  className?: string;
  profile: LocalProfile;
  fallbackEmail?: string | null;
  /** Account picture from sign-in (Google: Better-Auth `user.image`) when no own photo is set. */
  fallbackImage?: string | null;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const src = profile.avatarUrl || (imageFailed ? undefined : fallbackImage || undefined);
  const customName =
    profile.name.trim() && profile.name !== "Connect User"
      ? profile.name.trim()
      : "";
  const displayName = customName || fallbackEmail || "?";
  const initials = displayName.includes("@")
    ? displayName.slice(0, 2).toUpperCase()
    : displayName
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase() ?? "")
        .join("") || "?";

  return (
    <div
      className={`flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted-foreground/10 text-xs text-foreground/70 ${className}`}
    >
      {src ? (
        <img
          alt=""
          className="size-full object-cover"
          onError={() => {
            if (!profile.avatarUrl) setImageFailed(true);
          }}
          referrerPolicy="no-referrer"
          src={src}
        />
      ) : (
        initials
      )}
    </div>
  );
}
