/**
 * Online-Status für Connect Sozial (Dailyfun).
 *
 * Verwendet `navigator.onLine` plus die `online`/`offline`-Events, die der
 * Browser beim Wechsel des Netzwerk-Status feuert. Beide Quellen werden
 * miteinander kombiniert, damit der Hook auch dann ein „offline" meldet,
 * wenn das OS noch online ist, der Browser aber keinen Connect-Endpoint
 * mehr erreichen kann.
 *
 * Zusätzlich wird ein leichter „real connectivity"-Check gegen das eigene
 * Backend gemacht (`/api/health`), damit captive Portals (Hotel-WLAN,
 * Coffee-Shop) nicht als „online" durchgehen. Der Check ist debounced
 * und cached — er feuert frühestens 30 s nach dem letzten Wechsel.
 */

import { useEffect, useRef, useState } from "react";

type OnlineState = {
  /** Was Browser + OS glauben. */
  reported: boolean;
  /** Was der letzte echte Server-Check gesagt hat (oder `null`). */
  verified: boolean | null;
  /** Bequeme Zusammenfassung: `true` nur wenn beides online ist. */
  online: boolean;
  /** Wann zuletzt ein Check lief. */
  lastChecked: number | null;
};

const DEFAULT_STATE: OnlineState = {
  reported: true,
  verified: null,
  online: true,
  lastChecked: null,
};

const HEALTH_ENDPOINT = "/api/health";
const RECHECK_INTERVAL_MS = 30_000;
const RECHECK_ON_RECONNECT_MS = 4_000;

async function pingHealth(): Promise<boolean> {
  if (typeof window === "undefined") return true;
  try {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 5_000);
    const response = await fetch(HEALTH_ENDPOINT, {
      method: "GET",
      cache: "no-store",
      signal: controller.signal,
    });
    window.clearTimeout(timer);
    return response.ok;
  } catch {
    return false;
  }
}

export function useOnline(): OnlineState {
  const [state, setState] = useState<OnlineState>(() => {
    if (typeof navigator === "undefined") return DEFAULT_STATE;
    return { ...DEFAULT_STATE, reported: navigator.onLine };
  });

  const lastCheckRef = useRef<number>(0);
  const inflightRef = useRef<Promise<boolean> | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const runCheck = async () => {
      const now = Date.now();
      if (inflightRef.current) return inflightRef.current;
      if (now - lastCheckRef.current < RECHECK_INTERVAL_MS && state.verified !== null) {
        return state.verified;
      }
      lastCheckRef.current = now;
      const promise = pingHealth()
        .then((ok) => {
          setState((prev) => ({ ...prev, verified: ok, lastChecked: Date.now() }));
          return ok;
        })
        .catch(() => {
          setState((prev) => ({ ...prev, verified: false, lastChecked: Date.now() }));
          return false;
        })
        .finally(() => {
          inflightRef.current = null;
        });
      inflightRef.current = promise;
      return promise;
    };

    const handleOnline = () => {
      setState((prev) => ({ ...prev, reported: true }));
      window.setTimeout(() => {
        void runCheck();
      }, RECHECK_ON_RECONNECT_MS);
    };

    const handleOffline = () => {
      setState((prev) => ({ ...prev, reported: false, online: false }));
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    // Initial: einmal echt pingen, damit captive Portals erkannt werden.
    void runCheck();

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    ...state,
    online: state.reported && state.verified !== false,
  };
}

/** Convenience-Komponente: forciert den „online"-State auf einen bestimmten Wert (z. B. für Tests / DevTools). */
export function useSimulatedOffline(): {
  forceOffline: boolean;
  setForceOffline: (next: boolean) => void;
} {
  const [forceOffline, setForceOffline] = useState(false);
  return { forceOffline, setForceOffline };
}
