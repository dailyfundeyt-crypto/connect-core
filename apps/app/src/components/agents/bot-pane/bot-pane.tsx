/**
 * A27 – Bot-Panel mit Computer-Tab (Grok-Bot-Stil)
 *
 * Hauptkomponente <BotPane>:
 *   - Kopf: Avatar (BotAvatar A29 → Fallback), Name darunter
 *   - Tabs als Pill-Umschalter: Details / Bibliothek / Computer
 *   - Computer-Tab: Live-Screenshot-Karte (A19), Schlafzustand
 *   - Details-Tab: bestehende Agent-Infos (AgentGeneralSection importiert)
 *   - Bibliothek-Tab: Dateien des Arbeitsordners (A07, read-only)
 *
 * Feature-Flag: connect.t3.mascot (A01)
 *   → Flag aus: Komponente rendert nichts, kein Seiteneffekt.
 *
 * Abhängigkeiten:
 *   A19 (Maschinen-Backend) – vorhanden
 *   A21 (useMachines, useAgentAvatar) – vorhanden
 *   A29 (BotAvatar) – FEHLT → BotAvatarFallback (im Bericht vermerkt)
 *
 * Lane: apps/app/src/components/agents/bot-pane/**
 * Eigentümer: A27
 */
import { useState } from "react";
import { getT3Flag } from "@/lib/t3/contracts";
import { cn } from "@/lib/utils";
import { BibliothekTab } from "./bibliothek-tab";
import { BotAvatarFallback } from "./bot-avatar-fallback";
import { BotPaneTabBar } from "./bot-pane-tab-bar";
import { ComputerTab } from "./computer-tab";
import { DetailsTab } from "./details-tab";
import type { BotPaneTab } from "./types";

export interface BotPaneProps {
  agentId: string;
  name: string;
  /** Optionale Überschrift; Standard = name. */
  title?: string;
  /** Zusätzliche className für den äußeren Wrapper. */
  className?: string;
}

/**
 * Rechtes Bot-Panel im Grok-Bot-Stil.
 *
 * Nutzung (hinter Flag in detail-panel.tsx durch A39/A40):
 * ```tsx
 * import { BotPane } from "@/components/agents/bot-pane";
 * // ...
 * {getT3Flag("mascot") && <BotPane agentId={agent.id} name={agent.name} />}
 * ```
 *
 * A27 darf detail-panel.tsx NICHT anfassen (außerhalb der Lane).
 * Die Einbindung ist Wunsch an A39/A40 (im Bericht).
 */
export function BotPane({ agentId, name, title, className }: BotPaneProps) {
  // Feature-Flag-Guard: Flag aus = altes Verhalten (nichts rendern)
  if (!getT3Flag("mascot")) return null;

  return <BotPaneInner agentId={agentId} name={title ?? name} className={className} />;
}

/** Innerer Kern ohne Flag-Guard – für Tests isolierbar. */
export function BotPaneInner({
  agentId,
  name,
  className,
}: {
  agentId: string;
  name: string;
  className?: string;
}) {
  const [activeTab, setActiveTab] = useState<BotPaneTab>("details");

  const cuaEnabled = getT3Flag("cuaMachines");

  return (
    <div
      className={cn(
        "flex flex-col gap-4 overflow-y-auto px-4 py-4",
        className,
      )}
      data-testid="bot-pane"
    >
      {/* ── Kopf: Avatar + Name ── */}
      <div className="flex flex-col items-center gap-2 text-center">
        <BotAvatarFallback
          agentId={agentId}
          name={name}
          size={72}
          sleeping={false}
        />
        <p className="text-base font-semibold tracking-tight">{name}</p>
      </div>

      {/* ── Tab-Umschalter ── */}
      <BotPaneTabBar
        active={activeTab}
        onChange={setActiveTab}
        computerDisabled={!cuaEnabled}
      />

      {/* ── Tab-Inhalte ── */}
      <div
        id={`bot-pane-tab-${activeTab}`}
        role="tabpanel"
        aria-label={activeTab}
        className="min-h-0"
      >
        {activeTab === "details" && <DetailsTab agentId={agentId} />}
        {activeTab === "bibliothek" && <BibliothekTab agentId={agentId} />}
        {activeTab === "computer" && (
          <ComputerTab
            agentId={agentId}
            name={name}
            active={activeTab === "computer"}
          />
        )}
      </div>
    </div>
  );
}
