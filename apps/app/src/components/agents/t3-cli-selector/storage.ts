/**
 * T3-Bridge — Speicherung & State für CLI-Auswahl (Lane A23).
 *
 * EIGENTÜMER: A23.
 *
 * Verwaltet die Persistenz des ausgewählten CLI-Ziels pro Agent:
 *  - Bei Flag AUS: 100% identisch zu `getAgentCliDefault` / `setAgentCliDefault`.
 *  - Bei Flag AN: Unterstützt zusätzlich alle neuen T3-/Fork-Ziele nahtlos,
 *    bleibt aber abwärtskompatibel mit `connect.agent-cli-default`.
 */

import { useCallback, useEffect, useState } from "react";
import {
  type CliTarget,
  CLI_TARGETS,
  getAgentCliDefault,
  setAgentCliDefault,
  subscribeAgentCli,
} from "@/lib/agents/agent-cli";
import { syncModelFamilyFromCli } from "@/lib/agents/agent-models";
import { T3_SWAP_CLI_CATALOG } from "./catalog";

const DEFAULT_KEY = "connect.agent-cli-default";

type DefaultStore = Record<string, string>;

function readStoredDefaults(): DefaultStore {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(DEFAULT_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as DefaultStore;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeStoredDefaults(store: DefaultStore) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(DEFAULT_KEY, JSON.stringify(store));
  window.dispatchEvent(new Event("connect-agent-cli-changed"));
}

/**
 * Liest das gespeicherte CLI-Ziel für einen Agenten.
 *
 * Wenn `isSwapEnabled === false`:
 *  Exakt das Verhalten von `getAgentCliDefault(agentId)`.
 * Wenn `isSwapEnabled === true`:
 *  Liest den gespeicherten Wert; falls er im T3-Katalog existiert, wird er zurückgegeben,
 *  sonst Fallback auf `getAgentCliDefault(agentId)` (Standard: "codex").
 */
export function getSelectedCli(agentId: string, isSwapEnabled: boolean): string {
  if (!isSwapEnabled) {
    return getAgentCliDefault(agentId);
  }

  const store = readStoredDefaults();
  const saved = store[agentId];

  if (saved && T3_SWAP_CLI_CATALOG.some((entry) => entry.id === saved)) {
    return saved;
  }

  // Fallback auf altes Default
  return getAgentCliDefault(agentId);
}

/**
 * Speichert das gewählte CLI-Ziel für einen Agenten.
 *
 * Wenn `isSwapEnabled === false`:
 *  Ruft direkt `setAgentCliDefault` auf.
 * Wenn `isSwapEnabled === true`:
 *  Schreibt in `localStorage["connect.agent-cli-default"]`, dispatchet
 *  `connect-agent-cli-changed`, und synchronisiert abwärtskompatibel,
 *  falls das Ziel ein valides altes `CliTarget` ist.
 */
export function setSelectedCli(
  agentId: string,
  target: string,
  isSwapEnabled: boolean,
): void {
  if (!isSwapEnabled) {
    const isLegacyTarget = CLI_TARGETS.some((t) => t.id === target);
    if (isLegacyTarget) {
      setAgentCliDefault(agentId, target as CliTarget);
      syncModelFamilyFromCli(agentId, target as CliTarget);
    }
    return;
  }

  // Swap ist an: In Default-Store schreiben
  const store = readStoredDefaults();
  store[agentId] = target;
  writeStoredDefaults(store);

  // Wenn das Ziel auch ein legacy CliTarget ist, Modell-Familie und altes System synchronisieren
  const isOldTarget = CLI_TARGETS.some((t) => t.id === target);
  if (isOldTarget) {
    try {
      syncModelFamilyFromCli(agentId, target as CliTarget);
    } catch {
      // Ignorieren falls nicht synchronisierbar
    }
  }
}

/**
 * React-Hook, der reaktiv das aktuelle CLI-Ziel für einen Agenten bereitstellt.
 */
export function useSelectedCli(
  agentId: string,
  isSwapEnabled: boolean,
): [string, (next: string) => void] {
  const [current, setCurrent] = useState<string>(() =>
    getSelectedCli(agentId, isSwapEnabled),
  );

  useEffect(() => {
    const refresh = () => {
      setCurrent(getSelectedCli(agentId, isSwapEnabled));
    };
    refresh();
    return subscribeAgentCli(refresh);
  }, [agentId, isSwapEnabled]);

  const update = useCallback(
    (next: string) => {
      setSelectedCli(agentId, next, isSwapEnabled);
      setCurrent(next);
    },
    [agentId, isSwapEnabled],
  );

  return [current, update];
}
