import { useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Connect brand mark — the 2nd Connect logo (vortex / aperture spiral).
 *
 * Renders the asset shipped at `/brand/connect-logo.png` with crisp
 * high-DPI scaling and a subtle aperture glow. Falls back to a flat
 * monogram if the image is missing so the brand always stays legible.
 */
export function ConnectLogo({
  size = 28,
  glow = false,
  className,
}: {
  size?: number;
  glow?: boolean;
  className?: string;
}) {
  const [broken, setBroken] = useState(false);

  if (broken) {
    return (
      <span
        aria-hidden
        className={cn(
          "flex shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-neutral-900 via-neutral-800 to-neutral-700 text-[13px] font-semibold tracking-tight text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)]",
          className,
        )}
        style={{ width: size, height: size }}
      >
        ✦
      </span>
    );
  }

  return (
    <span
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-xl bg-transparent",
        glow &&
          "before:pointer-events-none before:absolute before:-inset-1 before:rounded-2xl before:bg-[radial-gradient(circle_at_center,rgba(56,189,248,0.45),transparent_70%)] before:opacity-60 before:blur-md before:content-['']",
        className,
      )}
      style={{ width: size, height: size }}
    >
      <img
        alt="Connect"
        className="relative z-10 h-full w-full select-none object-contain"
        draggable={false}
        height={size * 2}
        onError={() => setBroken(true)}
        src="/brand/connect-logo.png"
        style={{
          width: size,
          height: size,
          imageRendering: "-webkit-optimize-contrast",
        }}
        width={size * 2}
      />
    </span>
  );
}
