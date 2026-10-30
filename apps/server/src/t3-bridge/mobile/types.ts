/**
 * T3-Bridge — Handy-Kopplung (Lane A34).
 *
 * Diese Typen beschreiben ausschließlich die **Öffentliche** Sicht der Kopplung.
 * Sie enthalten bewusst niemals:
 *  - das Kopplungs-Token,
 *  - den Hash eines Tokens,
 *  - das Geräte-Credential.
 *
 * Tokens laufen (wie bei A10) nur serverseitig; der Browser sieht ein Token
 * ausschließlich einmalig im QR-Code.
 */

/** Grund, warum eine Kopplung nicht möglich war / abgelehnt wurde. */
export type MobilePairingFailureReason =
  | "insecure"
  | "expired"
  | "used"
  | "invalid"
  | "rate_limited"
  | "revoked";

/**
 * Ein gekoppeltes Gerät, wie es die UI sehen darf.
 *
 * `credentialHash` ist absichtlich nicht Teil dieses Typs: Der Wert liegt nur in
 * `MobileDeviceRecord` (Server-intern).
 */
export type MobileDevice = {
  id: string;
  label: string;
  /** ISO-Zeitpunkt der Kopplung. */
  createdAt: string;
  /** ISO-Zeitpunkt der letzten Nutzung; `null` = noch nie benutzt. */
  lastSeenAt: string | null;
  /** ISO-Zeitpunkt der Abmeldung; `null` = aktiv. */
  revokedAt: string | null;
};

/** Server-interner Gerätedatensatz inklusive Hashes (niemals ausliefern). */
export type MobileDeviceRecord = MobileDevice & {
  /** SHA-256 (hex) des Geräte-Credentials. */
  credentialHash: string;
};

/** Ein aktiver Kopplungs-Ticket-Datensatz (Server-intern). */
export type MobilePairingTicket = {
  id: string;
  /** SHA-256 (hex) des Einmal-Tokens. */
  tokenHash: string;
  /** SHA-256 (hex) des Geräte-Credentials, erst nach dem Einlösen gesetzt. */
  credentialHash: string | null;
  createdAt: string;
  expiresAt: string;
  usedAt: string | null;
};

/** Antwort auf `GET /api/t3/mobile/status` — garantiert ohne Token. */
export type MobilePairingStatus = {
  /** Brücke/Flag aktiv? */
  enabled: boolean;
  /** Ist die aktuelle Adresse HTTPS oder Loopback? */
  secure: boolean;
  /** Adresse, die im QR-Code landet (nur Origin, ohne Token). */
  baseUrl: string | null;
  /** Aktive (nicht abgemeldete) Geräte. */
  devices: MobileDevice[];
  /** Noch gültige, nicht eingelöste Codes. */
  activeTickets: number;
  /** Hinweis für die UI, wenn keine Kopplung möglich ist. */
  message?: string;
};

/** Ergebnis von `POST /api/t3/mobile/pair`. Enthält das Token genau einmal. */
export type MobilePairing = {
  ticketId: string;
  /** Vollständige Kopplungs-URL inkl. `#token=…` — nie protokollieren. */
  pairUrl: string;
  /** QR-Code als SVG (serverseitig erzeugt, keine Fremddaten). */
  qrSvg: string;
  expiresAt: string;
  ttlSeconds: number;
};

export type MobilePairingStartResult =
  | { ok: true; pairing: MobilePairing }
  | { ok: false; reason: MobilePairingFailureReason; message: string };

/**
 * Ergebnis des Einlösens auf dem Handy.
 *
 * `credential` wird genau einmal ausgeliefert und gehört auf das Handy
 * (z. B. `Authorization: Bearer …`). Der Server speichert nur den Hash.
 */
export type MobileRedeemResult =
  | { ok: true; device: MobileDevice; credential: string }
  | { ok: false; reason: MobilePairingFailureReason; message: string };

/** Persistenz-Schnittstelle für gekoppelte Geräte (ohne Klartext-Geheimnisse). */
export type MobileDeviceStore = {
  load(): Promise<MobileDeviceRecord[]>;
  save(devices: MobileDeviceRecord[]): Promise<void>;
};
