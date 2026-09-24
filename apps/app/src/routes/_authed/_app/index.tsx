import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Composer, toAgentOptions } from "@/components/channels/composer";
import { FloatingComposerBar } from "@/components/channels/floating-composer-bar";
import { SidebarToggleBar } from "@/components/layout/sidebar-toggle";
import { VoiceCallOverlay } from "@/components/voice/voice-call-overlay";
import { defaultAgentProfile } from "@/lib/agents/default-agent";
import { agentListQueryOptions } from "@/lib/agents/queries";
import { routeMessage } from "@/lib/channels/route";
import { useStartChannel } from "@/lib/channels/start";

export const Route = createFileRoute("/_authed/_app/")({
  component: RouteComponent,
});

function RouteComponent() {
  const {
    data: agents,
    isError: failed,
  } = useQuery(agentListQueryOptions());
  const { start, startChosen, pending } = useStartChannel();
  const [error, setError] = useState<string | null>(null);
  const [voiceOpen, setVoiceOpen] = useState(false);

  const fallback = defaultAgentProfile(
    agents,
    agents?.find((agent) => agent.id === "cto") ??
      agents?.find((agent) => agent.visibility === "public"),
  );

  return (
    <>
      <SidebarToggleBar />
      <div className="relative flex w-full flex-1 flex-col items-center justify-center p-6">
        <div className="pointer-events-none max-w-sm text-center">
          <p className="text-sm font-medium text-muted-foreground">
            Level 2 · Workspace
          </p>
          <p className="mt-1 text-xs text-muted-foreground/80">
            Channels und Agents in der Sidebar. Composer zum Starten einer
            Unterhaltung — ziehe die Leiste am oberen Rand.
          </p>
        </div>
        {error ? (
          <p className="mt-4 text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : failed && agents === undefined ? (
          <p className="mt-4 text-sm text-destructive" role="alert">
            Your coworkers couldn&apos;t be loaded yet.
          </p>
        ) : null}
      </div>
      <FloatingComposerBar>
        <Composer
          agentId={fallback?.id}
          agents={toAgentOptions(agents)}
          className="w-full"
          compact
          disabled={!fallback}
          enableVoice
          floating
          onSubmit={async (draft) => {
            setError(null);
            try {
              if (draft.agentId) {
                await startChosen(draft.agentId, draft.text);
                return;
              }
              let agentId: string | undefined;
              try {
                agentId = (await routeMessage(draft.text)).agentId;
              } catch {
                agentId = fallback?.id;
              }
              if (!agentId) return;
              await start(agentId, draft.text);
            } catch (caught) {
              setError(
                caught instanceof Error
                  ? caught.message
                  : "Could not start the conversation.",
              );
            }
          }}
          onVoiceCall={() => setVoiceOpen(true)}
          pending={pending}
        />
      </FloatingComposerBar>
      <VoiceCallOverlay
        agentId={fallback?.id}
        agentName={fallback?.name ?? "CTO"}
        onClose={() => setVoiceOpen(false)}
        onUserUtterance={async (spoken) => {
          const agentId = fallback?.id;
          if (!agentId) {
            throw new Error("Kein CTO / Standard-Agent verfügbar.");
          }
          await start(agentId, spoken);
          return `${fallback?.name ?? "CTO"} hier. Verstanden: „${spoken.slice(0, 140)}${spoken.length > 140 ? "…" : ""}“. Ich öffne den Chat und arbeite daran.`;
        }}
        open={voiceOpen}
      />
    </>
  );
}
