/**
 * A27 – Bot-Panel: Mock-Avatar-Fallback
 *
 * A29 (BotAvatar) ist noch nicht vorhanden.
 * Dieser Fallback rendert den AbstractAvatar + einen einfachen Sleep-Zustand,
 * bis A29 deployed ist. Beim Import aus @/components/bot-avatar wird auf
 * diesen Fallback umgeleitet, sofern die echte Komponente nicht existiert.
 *
 * Hinweis im Bericht: Abhängigkeit A29 fehlt → Fallback aktiv.
 */
import { AbstractAvatar } from "@/components/agents/abstract-avatar";
import { cn } from "@/lib/utils";

export interface BotAvatarProps {
  agentId: string;
  name: string;
  /** Größe in Pixel. Standard 64. */
  size?: number;
  /** Wenn true: grau eingeblendet (Schlaf-Zustand). */
  sleeping?: boolean;
  /** Zusätzliche className. */
  className?: string;
}

/**
 * Mock-Implementierung für `<BotAvatar>` (A29).
 * Wird ersetzt, sobald `apps/app/src/components/bot-avatar/` durch A29 angelegt ist.
 */
export function BotAvatarFallback({
  agentId,
  name,
  size = 64,
  sleeping = false,
  className,
}: BotAvatarProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center transition-all duration-300",
        sleeping && "opacity-40 grayscale",
        className,
      )}
      aria-label={sleeping ? `${name} schläft` : name}
    >
      <AbstractAvatar
        agentId={agentId}
        name={name}
        seed={agentId}
        size={size}
      />
    </span>
  );
}
