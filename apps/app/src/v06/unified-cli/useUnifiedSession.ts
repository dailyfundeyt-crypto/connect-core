/**
 * useUnifiedSession(conversationId) – gemeinsamer Zustand für Chat- und CLI-Tab (A15).
 * Beide Tabs rufen denselben Hook mit derselben conversationId auf und steuern damit
 * dasselbe Browser-Profil und denselben Anbieter.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { CliProviderId, CliSessionRef } from "@/contracts/v06/cli";
import {
  CLI_SWITCH_PROVIDER_PATH,
  type ProviderSwitchState,
  beginSwitch,
  cliMessagesPath,
  cliSessionPath,
  failSwitch,
  initialSwitchState,
  isBrokerNotStarted,
  parseSwitchResponse,
  succeedSwitch,
} from "./unifiedCli";
import type { UnifiedMessageLike } from "./unifiedCli";

type UnifiedRole = UnifiedMessageLike["role"];
type UnifiedSource = UnifiedMessageLike["source"];

export interface UseUnifiedSessionResult {
  session: CliSessionRef | null;
  loading: boolean;
  switchState: ProviderSwitchState;
  /** Wechselt den Anbieter für beide Ansichten. Fehler stellen den alten Wert wieder her. */
  switchProvider: (to: CliProviderId) => Promise<boolean>;
  /** Sendet Text an das Terminal bzw. speichert ihn als Nachricht. Freebuff nutzt denselben Pfad. */
  sendInput: (text: string) => Promise<boolean>;
  /** Persistiert eine vorhandene Chat-Zeile unter derselben conversationId (idempotent per id). */
  recordMessage: (input: {
    id: string;
    role: UnifiedRole;
    source: UnifiedSource;
    content: string;
    createdAt?: string;
  }) => Promise<boolean>;
  /** Gemeinsamer, dauerhaft geladener Verlauf. */
  messages: readonly UnifiedMessageLike[];
  /** Hinweis, wenn der CLI-Broker nicht läuft. Sonst null. */
  brokerNotice: boolean;
  /** Letzter Fehlertext (roh) für Toasts. */
  lastError: string | null;
}

export function useUnifiedSession(conversationId: string | null | undefined): UseUnifiedSessionResult {
  const [session, setSession] = useState<CliSessionRef | null>(null);
  const [loading, setLoading] = useState(false);
  const [switchState, setSwitchState] = useState<ProviderSwitchState>(initialSwitchState("antigravity"));
  const [brokerNotice, setBrokerNotice] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const [messages, setMessages] = useState<readonly UnifiedMessageLike[]>([]);
  const stateRef = useRef(switchState);
  stateRef.current = switchState;

  useEffect(() => {
    if (!conversationId) {
      setSession(null);
      setMessages([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetch(cliSessionPath(conversationId), { credentials: "include" })
      .then(async (res) => {
        if (!res.ok) return null;
        return (await res.json()) as CliSessionRef;
      })
      .then((data) => {
        if (cancelled || !data?.provider) return;
        setSession(data);
        setSwitchState(initialSwitchState(data.provider));
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    const pollMessages = () => {
      fetch(cliMessagesPath(conversationId), { credentials: "include" })
        .then(async (res) => (res.ok ? await res.json() : null))
        .then((data: { messages?: UnifiedMessageLike[] } | null) => {
          if (!cancelled && Array.isArray(data?.messages)) {
            setMessages((previous) => {
              if (previous.length === data.messages!.length && previous.at(-1)?.id === data.messages!.at(-1)?.id) {
                return previous;
              }
              return data.messages!;
            });
          }
        })
        .catch(() => undefined);
    };

    pollMessages();
    const interval = setInterval(pollMessages, 2000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [conversationId]);

  const switchProvider = useCallback(
    async (to: CliProviderId): Promise<boolean> => {
      if (!conversationId) return false;
      const current = stateRef.current;
      const next = beginSwitch(current, to);
      if (next === current) return false;
      stateRef.current = next;
      setSwitchState(next);
      setLastError(null);
      setBrokerNotice(false);
      try {
        const res = await fetch(CLI_SWITCH_PROVIDER_PATH, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ conversationId, from: current.committed, to }),
        });
        const raw = await res.json().catch(() => null);
        const parsed = parseSwitchResponse(raw);
        if (!parsed.ok) {
          throw new Error(parsed.error);
        }
        setSession(parsed.session);
        const done = succeedSwitch(stateRef.current, parsed.session);
        stateRef.current = done;
        setSwitchState(done);
        return true;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setLastError(message);
        setBrokerNotice(isBrokerNotStarted(message));
        const failed = failSwitch(stateRef.current, message);
        stateRef.current = failed;
        setSwitchState(failed);
        return false;
      }
    },
    [conversationId],
  );

  const recordMessage = useCallback(
    async (input: {
      id: string;
      role: UnifiedRole;
      source: UnifiedSource;
      content: string;
      createdAt?: string;
    }): Promise<boolean> => {
      if (!conversationId || !input.content.trim()) return false;
      try {
        const res = await fetch(cliMessagesPath(conversationId), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(input),
        });
        if (!res.ok) {
          const data = (await res.json().catch(() => null)) as { error?: string } | null;
          const message = data?.error || `HTTP ${res.status}`;
          setLastError(message);
          setBrokerNotice(isBrokerNotStarted(message));
          return false;
        }
        const data = (await res.json().catch(() => null)) as { message?: UnifiedMessageLike } | null;
        if (data?.message) {
          setMessages((previous) => {
            const found = previous.some((message) => message.id === data.message!.id);
            return found ? previous : [...previous, data.message!];
          });
        }
        return true;
      } catch (err) {
        setLastError(err instanceof Error ? err.message : String(err));
        return false;
      }
    },
    [conversationId],
  );

  const sendInput = useCallback(
    async (text: string): Promise<boolean> => {
      const ok = await recordMessage({
        id: `cli-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        role: "user",
        source: "cli",
        content: text,
      });
      if (ok && conversationId) {
        setTimeout(() => {
          fetch(cliMessagesPath(conversationId), { credentials: "include" })
            .then(async (res) => (res.ok ? await res.json() : null))
            .then((data: { messages?: UnifiedMessageLike[] } | null) => {
              if (Array.isArray(data?.messages)) setMessages(data.messages);
            })
            .catch(() => undefined);
        }, 800);
      }
      return ok;
    },
    [conversationId, recordMessage],
  );

  return {
    session,
    loading,
    switchState,
    switchProvider,
    sendInput,
    recordMessage,
    messages,
    brokerNotice,
    lastError,
  };
}
