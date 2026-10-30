/**
 * Hooks fuer das E-Mail-Agenten-Modul v06 (A19).
 *
 * Konsumiert die durch A19 bereitgestellten Endpunkte:
 * - GET/POST /api/v06/email-agents
 * - GET/POST /api/v06/outbound-emails (+ approve/reject)
 * (Pfaddefinitionen aus contracts/v06/api-paths.ts.)
 */

import { useCallback, useEffect, useState } from "react";
import type { EmailAgent, OutboundEmail } from "@/contracts/v06/email-agents";
import { API_PATHS_V06 } from "@/contracts/v06/api-paths";

export function useEmailAgents(options: { enabled?: boolean } = {}) {
  const enabled = options.enabled ?? true;
  const [agents, setAgents] = useState<EmailAgent[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(enabled);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!enabled) {
      setAgents([]);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(API_PATHS_V06.emailAgents);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setAgents((await res.json()) as EmailAgent[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    void load();
  }, [load]);

  const createAgent = useCallback(
    async (input: {
      address: string;
      name: string;
      description: string;
      capabilities?: string[];
      companyIds?: string[];
    }): Promise<EmailAgent | null> => {
      const res = await fetch(API_PATHS_V06.emailAgents, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        throw new Error(payload?.error ?? `HTTP ${res.status}`);
      }
      const agent = (await res.json()) as EmailAgent;
      await load();
      return agent;
    },
    [load],
  );

  return { agents, isLoading, error, reload: load, createAgent };
}

export function useOutbox(options: { enabled?: boolean } = {}) {
  const enabled = options.enabled ?? true;
  const [emails, setEmails] = useState<OutboundEmail[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(enabled);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!enabled) {
      setEmails([]);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(API_PATHS_V06.outboundEmails);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setEmails((await res.json()) as OutboundEmail[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    void load();
  }, [load]);

  const approve = useCallback(
    async (id: string) => {
      const res = await fetch(API_PATHS_V06.outboundEmailApprove(id), { method: "POST" });
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        throw new Error(payload?.error ?? `HTTP ${res.status}`);
      }
      await load();
    },
    [load],
  );

  const reject = useCallback(
    async (id: string, reason?: string) => {
      const res = await fetch(API_PATHS_V06.outboundEmailReject(id), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(reason ? { reason } : {}),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        throw new Error(payload?.error ?? `HTTP ${res.status}`);
      }
      await load();
    },
    [load],
  );

  return { emails, isLoading, error, reload: load, approve, reject };
}

/** Reines Validierungshelfer (getestet ohne React). */
export function validateAgentDraft(input: {
  address: string;
  name: string;
  description: string;
}): string | null {
  const address = input.address.trim();
  const name = input.name.trim();
  const description = input.description.trim();
  if (!address) return "E-Mail-Adresse des Bots fehlt.";
  if (!address.includes("@") || /\s/.test(address)) return "E-Mail-Adresse ist nicht gültig.";
  if (!name) return "Name des Bots fehlt.";
  if (!description) return "Beschreibung ist Pflichtfeld: Was macht der Bot?";
  return null;
}
