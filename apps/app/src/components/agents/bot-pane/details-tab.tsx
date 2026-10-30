/**
 * A27 – Bot-Panel: Details-Tab
 *
 * Zeigt die bestehenden Agent-Info-Komponenten:
 * - Name, Rolle, Modell (via AgentGeneralSection)
 * - Shell-Settings
 * - Browser-Profil
 *
 * Importiert NUR – ändert nichts an bestehenden Komponenten.
 */
import { useQuery } from "@tanstack/react-query";
import { AgentGeneralRegister } from "@/components/agents/agent-general-section";
import { agentQueryOptions } from "@/lib/agents/queries";

interface DetailsTabProps {
  agentId: string;
}

/**
 * Details-Tab: Zeigt Agent-Stammdaten mit den vorhandenen Formular-Bausteinen.
 */
export function DetailsTab({ agentId }: DetailsTabProps) {
  const { data: profile, isLoading, error } = useQuery(
    agentQueryOptions(agentId),
  );

  if (isLoading) {
    return (
      <div className="flex flex-col gap-3 animate-pulse px-1">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-10 rounded-xl bg-muted/60" />
        ))}
      </div>
    );
  }

  if (error || !profile) {
    return (
      <p className="px-1 text-xs text-muted-foreground">
        Agent-Daten konnten nicht geladen werden.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <AgentGeneralRegister agentId={agentId} profile={profile} />
    </div>
  );
}
