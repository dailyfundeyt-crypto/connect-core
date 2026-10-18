/**
 * useAgentQuery — Wrapper um agentQueryOptions + useQuery.
 *
 * Vereinfacht die Agent-Profil-Abfrage an einer zentralen Stelle.
 */

import { useQuery } from "@tanstack/react-query";
import { agentQueryOptions } from "./queries";

export function useAgentQuery(agentId: string) {
  return useQuery(agentQueryOptions(agentId));
}
