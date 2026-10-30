/**
 * Handy-Kopplung — React-Hook (Lane A34).
 *
 * Kapselt Status, QR-Code und Geräteverwaltung:
 *  - lädt den Status beim Öffnen und danach alle 5 s (Geräte-Liste),
 *  - erzeugt automatisch einen Code, sobald die Verbindung sicher ist,
 *  - zählt den Ablauf sekundengenau herunter,
 *  - hält das Einmal-Token ausschließlich im React-State.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { getT3Flag } from "@/lib/t3/contracts";
import {
  createPhoneT3Pairing,
  fetchPhoneT3Status,
  PhoneT3Error,
  revokePhoneT3Device,
} from "./client";
import { secondsUntil } from "./format";
import type { PhoneT3Pairing, PhoneT3Status } from "./types";

export type UsePhoneT3Options = {
  /** Poll-Intervall für die Geräteliste (Default 5000 ms). */
  pollMs?: number;
  /** Erzwingt an/aus (Vorschau/Tests); Default ist das Feature-Flag. */
  enabled?: boolean;
};

export type UsePhoneT3Result = {
  enabled: boolean;
  status: PhoneT3Status | null;
  pairing: PhoneT3Pairing | null;
  secondsLeft: number;
  loading: boolean;
  busy: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  newCode: () => Promise<void>;
  revoke: (deviceId: string) => Promise<void>;
  dismissError: () => void;
};

function messageOf(error: unknown): string {
  if (error instanceof PhoneT3Error) return error.message;
  if (error instanceof Error) return error.message;
  return "Unbekannter Fehler.";
}

export function usePhoneT3(options: UsePhoneT3Options = {}): UsePhoneT3Result {
  const enabled = options.enabled ?? getT3Flag("bridge");
  const pollMs = options.pollMs ?? 5_000;

  const [status, setStatus] = useState<PhoneT3Status | null>(null);
  const [pairing, setPairing] = useState<PhoneT3Pairing | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(() => Date.now());

  const alive = useRef(true);
  const autoStarted = useRef(false);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    try {
      const next = await fetchPhoneT3Status();
      if (!alive.current) return;
      setStatus(next);
      setError(null);
    } catch (caught) {
      if (alive.current) setError(messageOf(caught));
    } finally {
      if (alive.current) setLoading(false);
    }
  }, [enabled]);

  const newCode = useCallback(async () => {
    if (!enabled || busy) return;
    setBusy(true);
    setError(null);
    try {
      const next = await createPhoneT3Pairing("Connect App");
      if (!alive.current) return;
      setPairing(next);
      setTick(Date.now());
    } catch (caught) {
      if (alive.current) {
        setPairing(null);
        setError(messageOf(caught));
      }
    } finally {
      if (alive.current) setBusy(false);
    }
  }, [busy, enabled]);

  const revoke = useCallback(
    async (deviceId: string) => {
      try {
        await revokePhoneT3Device(deviceId);
        await refresh();
      } catch (caught) {
        if (alive.current) setError(messageOf(caught));
      }
    },
    [refresh],
  );

  // Erstes Laden + Polling der Geräteliste.
  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    void refresh();
    const id = window.setInterval(() => void refresh(), pollMs);
    return () => window.clearInterval(id);
  }, [enabled, pollMs, refresh]);

  // Sekundentakt für den Ablauf-Countdown.
  useEffect(() => {
    if (!pairing) return;
    setTick(Date.now());
    const id = window.setInterval(() => setTick(Date.now()), 1_000);
    return () => window.clearInterval(id);
  }, [pairing]);

  // Sobald die Verbindung sicher ist, genau einmal automatisch einen Code zeigen.
  useEffect(() => {
    if (!enabled || !status?.secure || pairing || busy || error) return;
    if (autoStarted.current) return;
    autoStarted.current = true;
    void newCode();
  }, [busy, enabled, error, newCode, pairing, status?.secure]);

  return {
    enabled,
    status,
    pairing,
    secondsLeft: pairing ? secondsUntil(pairing.expiresAt, tick) : 0,
    loading,
    busy,
    error,
    refresh,
    newCode,
    revoke,
    dismissError: () => setError(null),
  };
}
