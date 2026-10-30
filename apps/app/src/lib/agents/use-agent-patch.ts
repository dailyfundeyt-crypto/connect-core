import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  type AgentFormValues,
  agentInputFrom,
} from "@/lib/agents/form";
import { updateAgentMutationOptions } from "@/lib/agents/mutations";
import type { AgentProfile } from "@/lib/agents/queries";

/**
 * One field at a time, over the whole update endpoint.
 *
 * The API takes the full profile, so every field the caller is not changing rides along exactly as
 * it is on screen. Written once because four sections save: while each had its own copy of this
 * argument list they drifted, and a copy that left out `websiteList` blanked the websites whenever
 * somebody toggled a skill. A field added to the profile belongs here, and then in every section at
 * once.
 */
export function useAgentPatch(agentId: string, profile: AgentProfile) {
  const queryClient = useQueryClient();
  const updateAgent = useMutation(updateAgentMutationOptions(queryClient));

  return (patch: Partial<AgentFormValues>) =>
    updateAgent.mutateAsync({
      agentId,
      input: agentInputFrom({
        name: profile.name,
        title: profile.title,
        roleDescription: profile.roleDescription,
        visibility: "private",
        /*
         * Not a built-in coworker's endpoint. That is the managed Bot's own address, which nobody
         * typed, and the route checks any endpoint it is sent as one somebody did: on a deployment
         * whose Bot is on localhost it refused every edit. Empty leaves the stored one where it is.
         */
        endpoint: profile.builtIn ? "" : (profile.endpoint ?? ""),
        authValue: "",
        // Engine-Felder (Stufe 1.1 / 2 / 3 / 4). Default = lokales Modell
        // (kein Engine). `patch` überschreibt die Werte, die der User
        // gerade editiert.
        cliEngineKind: null as "antigravity" | "codex" | "claude" | "freebuff" | null,
        cliEngineModel: "auto",
        cliEngineAllowWrite: false,
        browserProfileEnabled: false,
        browserProfileStartUrl: "",
        browserProfileAllowWrite: false,
        freebuffEnabled: false,
        freebuffModel: "auto",
        freebuffAllowWrite: false,
        manusEnabled: false,
        manusModel: "auto",
        manusProfileName: "",
        browserUseEnabled: false,
        browserUseStartUrl: "",
        browserUseAllowWrite: false,
        // Phase B Schritt 9: Eigenes Konto pro Bot
        accountEmail: profile.accountEmail ?? null,
        accountDisplayName: null,
        // Phase C Schritt 10: Skills
        skills: profile.skills ?? null,
        // Phase C Schritt 13: Webseiten
        websiteList: profile.websiteList ?? null,
        // Phase C Schritt 14: Subagenten (Online-KIs)
        subagents: profile.subagents ?? null,
        ...patch,
      }),
    });
}

