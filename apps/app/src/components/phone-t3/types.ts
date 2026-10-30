/**
 * Handy-Kopplung — Typen der Oberfläche (Lane A34).
 *
 * Bewusst eigenständig (die App importiert nichts aus dem Server, siehe A01).
 * Die Form entspricht `apps/server/src/t3-bridge/mobile/types.ts`.
 *
 * Kein Typ hier enthält ein Token oder ein Geräte-Credential. Das Einmal-Token
 * steckt ausschließlich in `PhoneT3Pairing.pairUrl` und wird nie gespeichert.
 */

export type PhoneT3Device = {
  id: string;
  label: string;
  createdAt: string;
  lastSeenAt: string | null;
  revokedAt: string | null;
};

export type PhoneT3Status = {
  enabled: boolean;
  secure: boolean;
  baseUrl: string | null;
  devices: PhoneT3Device[];
  activeTickets: number;
  message?: string;
};

export type PhoneT3Pairing = {
  ticketId: string;
  /** Enthält das Einmal-Token im Fragment — nur im Speicher halten. */
  pairUrl: string;
  qrSvg: string;
  expiresAt: string;
  ttlSeconds: number;
};
