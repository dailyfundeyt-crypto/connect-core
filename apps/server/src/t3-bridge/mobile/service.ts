/**
 * T3-Bridge — Kopplungsdienst für Handys (Lane A34).
 *
 * Ablauf:
 *  1. Der PC öffnet „Handy verbinden“. `startPairing()` erzeugt ein Einmal-Token
 *     (Default 5 Minuten), legt nur dessen Hash ab und liefert QR + URL zurück.
 *  2. Das Handy scannt, öffnet die Connect-App und schickt das Token aus dem
 *     URL-Fragment per POST an `/pair/redeem`.
 *  3. Der Server prüft Hash, Ablauf und Einmaligkeit, legt ein Gerät an und
 *     gibt genau einmal ein Geräte-Credential zurück (gespeichert wird der Hash).
 *
 * Sicherheit:
 *  - Kopplung nur über HTTPS oder Loopback (siehe `secure.ts`).
 *  - Token und Credential werden nie geloggt; der Logger bekommt nur Ids.
 *  - Kein Löschen von Geräten: Abmelden setzt `revokedAt`.
 */

import { RedactedLogger } from "../auth/redact.js";
import { FileMobileDeviceStore, MemoryMobileDeviceStore } from "./store.js";
import {
  buildPairUrl,
  createDeviceId,
  createTicketId,
  createToken,
  hashToken,
  renderPairQrSvg,
} from "./tokens.js";
import type {
  MobileDevice,
  MobileDeviceRecord,
  MobileDeviceStore,
  MobilePairing,
  MobilePairingStartResult,
  MobilePairingStatus,
  MobilePairingTicket,
  MobileRedeemResult,
} from "./types.js";

/** Kurze Gültigkeit: Der Code ist für „jetzt scannen“, nicht zum Aufheben. */
export const DEFAULT_MOBILE_PAIRING_TTL_MS = 5 * 60 * 1000;

/** Höchstens so viele offene Codes gleichzeitig (Schutz vor Flut). */
export const DEFAULT_MAX_ACTIVE_TICKETS = 5;

/** Abgelaufene Codes bleiben eine Stunde für die richtige Fehlermeldung erhalten. */
const EXPIRED_TICKET_RETENTION_MS = 60 * 60 * 1000;

const INSECURE_MESSAGE =
  "Kopplung nur über HTTPS oder diesen PC (Loopback). Eine unverschlüsselte Netzwerkadresse wird abgelehnt.";

export type MobilePairingServiceOptions = {
  /** Injizierbare Uhr (Tests). */
  now?: () => number;
  /** Gültigkeit eines Kopplungs-Codes in Millisekunden. */
  ttlMs?: number;
  maxActiveTickets?: number;
  store?: MobileDeviceStore;
  logger?: RedactedLogger;
};

function toPublicDevice(record: MobileDeviceRecord): MobileDevice {
  return {
    id: record.id,
    label: record.label,
    createdAt: record.createdAt,
    lastSeenAt: record.lastSeenAt,
    revokedAt: record.revokedAt,
  };
}

export class MobilePairingService {
  readonly #now: () => number;
  readonly #ttlMs: number;
  readonly #maxActiveTickets: number;
  readonly #store: MobileDeviceStore;
  readonly #logger: RedactedLogger;

  #tickets = new Map<string, MobilePairingTicket>();
  #devices: MobileDeviceRecord[] | null = null;
  #loading: Promise<MobileDeviceRecord[]> | null = null;
  #writeChain: Promise<void> = Promise.resolve();

  constructor(options: MobilePairingServiceOptions = {}) {
    this.#now = options.now ?? (() => Date.now());
    this.#ttlMs = options.ttlMs ?? DEFAULT_MOBILE_PAIRING_TTL_MS;
    this.#maxActiveTickets =
      options.maxActiveTickets ?? DEFAULT_MAX_ACTIVE_TICKETS;
    this.#store = options.store ?? new MemoryMobileDeviceStore();
    this.#logger = options.logger ?? new RedactedLogger("T3MobilePairing");
  }

  /** Gültigkeit in Sekunden (für die UI). */
  get ttlSeconds(): number {
    return Math.max(1, Math.round(this.#ttlMs / 1000));
  }

  async #loadDevices(): Promise<MobileDeviceRecord[]> {
    if (this.#devices) return this.#devices;
    if (!this.#loading) {
      this.#loading = this.#store
        .load()
        .then((devices) => {
          this.#devices = devices;
          return devices;
        })
        .catch((error) => {
          this.#logger.warn(
            "Geräte konnten nicht geladen werden — starte leer.",
            error,
          );
          this.#devices = [];
          return this.#devices;
        })
        .finally(() => {
          this.#loading = null;
        });
    }
    return this.#loading;
  }

  async #persist(): Promise<void> {
    const devices = this.#devices ?? [];
    this.#writeChain = this.#writeChain
      .then(() => this.#store.save(devices))
      .catch((error) => {
        this.#logger.warn("Geräte konnten nicht gespeichert werden.", error);
      });
    await this.#writeChain;
  }

  /**
   * Entfernt benutzte Tickets und abgelaufene erst nach der Kulanzzeit.
   *
   * Die Kulanzzeit ist der Grund, warum ein Scan nach Ablauf „abgelaufen“
   * meldet und nicht „ungültig“: Der Code ist weg, die Erklärung bleibt.
   */
  #pruneTickets(): void {
    const now = this.#now();
    for (const [hash, ticket] of this.#tickets) {
      const expiredSince = now - Date.parse(ticket.expiresAt);
      if (ticket.usedAt || expiredSince > EXPIRED_TICKET_RETENTION_MS) {
        this.#tickets.delete(hash);
      }
    }
  }

  /** Anzahl noch gültiger, nicht eingelöster Codes. */
  activeTicketCount(): number {
    this.#pruneTickets();
    const now = this.#now();
    let active = 0;
    for (const ticket of this.#tickets.values()) {
      if (!ticket.usedAt && Date.parse(ticket.expiresAt) > now) active += 1;
    }
    return active;
  }

  /**
   * Erzeugt einen Kopplungs-Code. `secure` muss vom Aufrufer aus der echten
   * Anfrage ermittelt worden sein (siehe `resolveMobileBaseUrl`).
   */
  startPairing(input: {
    baseUrl: string | null;
    secure: boolean;
    label?: string | null;
  }): MobilePairingStartResult {
    if (!input.secure || !input.baseUrl) {
      return { ok: false, reason: "insecure", message: INSECURE_MESSAGE };
    }

    this.#pruneTickets();
    if (this.activeTicketCount() >= this.#maxActiveTickets) {
      return {
        ok: false,
        reason: "rate_limited",
        message:
          "Zu viele offene Kopplungs-Codes. Bitte kurz warten oder einen alten Code verfallen lassen.",
      };
    }

    const token = createToken();
    const tokenHash = hashToken(token);
    const ticketId = createTicketId();
    const now = this.#now();
    const expiresAt = new Date(now + this.#ttlMs).toISOString();

    this.#tickets.set(tokenHash, {
      id: ticketId,
      tokenHash,
      credentialHash: null,
      createdAt: new Date(now).toISOString(),
      expiresAt,
      usedAt: null,
    });

    const pairUrl = buildPairUrl(input.baseUrl, token);
    const pairing: MobilePairing = {
      ticketId,
      pairUrl,
      qrSvg: renderPairQrSvg(pairUrl),
      expiresAt,
      ttlSeconds: this.ttlSeconds,
    };

    // Nur die Id — niemals Token oder URL.
    this.#logger.info("Kopplungs-Code erzeugt.", {
      ticketId,
      expiresAt,
      label: input.label?.trim() || null,
    });

    return { ok: true, pairing };
  }

  /**
   * Löst einen Code auf dem Handy ein (einmalig).
   * `label` ist der Gerätename, den das Handy mitschickt.
   */
  async redeem(input: {
    token: string;
    label?: string | null;
  }): Promise<MobileRedeemResult> {
    const raw = input.token?.trim();
    if (!raw)
      return {
        ok: false,
        reason: "invalid",
        message: "Kein Kopplungs-Code übergeben.",
      };

    const tokenHash = hashToken(raw);
    const ticket = this.#tickets.get(tokenHash);
    if (!ticket) {
      return {
        ok: false,
        reason: "invalid",
        message: "Der Kopplungs-Code ist ungültig oder wurde bereits benutzt.",
      };
    }

    const now = this.#now();
    if (Date.parse(ticket.expiresAt) <= now) {
      this.#tickets.delete(tokenHash);
      this.#logger.info("Kopplungs-Code abgelaufen.", { ticketId: ticket.id });
      return {
        ok: false,
        reason: "expired",
        message:
          "Der Kopplungs-Code ist abgelaufen. Bitte am PC einen neuen erzeugen.",
      };
    }

    if (ticket.usedAt) {
      this.#tickets.delete(tokenHash);
      return {
        ok: false,
        reason: "used",
        message: "Dieser Kopplungs-Code wurde bereits benutzt.",
      };
    }

    const credential = createToken();
    const credentialHash = hashToken(credential);
    const device: MobileDeviceRecord = {
      id: createDeviceId(),
      label: input.label?.trim()?.slice(0, 80) || "Handy",
      createdAt: new Date(now).toISOString(),
      lastSeenAt: null,
      revokedAt: null,
      credentialHash,
    };

    ticket.usedAt = new Date(now).toISOString();
    ticket.credentialHash = credentialHash;
    this.#tickets.delete(tokenHash);

    const devices = await this.#loadDevices();
    this.#devices = [...devices, device];
    await this.#persist();

    this.#logger.info("Handy gekoppelt.", {
      ticketId: ticket.id,
      deviceId: device.id,
    });

    return { ok: true, device: toPublicDevice(device), credential };
  }

  /** Status für die UI — ohne Token, ohne Hashes. */
  async status(input: {
    secure: boolean;
    baseUrl: string | null;
  }): Promise<MobilePairingStatus> {
    const devices = await this.#loadDevices();
    const active = devices.filter((device) => !device.revokedAt);
    const activeTickets = this.activeTicketCount();

    return {
      enabled: true,
      secure: input.secure,
      baseUrl: input.baseUrl,
      devices: active.map(toPublicDevice),
      activeTickets,
      ...(input.secure ? {} : { message: INSECURE_MESSAGE }),
    };
  }

  /** Prüft ein Geräte-Credential (z. B. vom Handy bei API-Aufrufen). */
  async authenticate(credential: string): Promise<MobileDevice | null> {
    const raw = credential?.trim();
    if (!raw) return null;
    const hash = hashToken(raw);
    const devices = await this.#loadDevices();
    const device = devices.find(
      (candidate) => candidate.credentialHash === hash && !candidate.revokedAt,
    );
    if (!device) return null;

    device.lastSeenAt = new Date(this.#now()).toISOString();
    await this.#persist();
    return toPublicDevice(device);
  }

  /** Meldet ein Gerät ab (kein Löschen; `revokedAt` bleibt nachvollziehbar). */
  async revoke(deviceId: string): Promise<boolean> {
    const devices = await this.#loadDevices();
    const device = devices.find((candidate) => candidate.id === deviceId);
    if (!device || device.revokedAt) return false;
    device.revokedAt = new Date(this.#now()).toISOString();
    await this.#persist();
    this.#logger.info("Handy abgemeldet.", { deviceId });
    return true;
  }
}

/** Produktionsinstanz mit Datei-Ablage; wird vom Router verwendet. */
export function createMobilePairingService(
  options: MobilePairingServiceOptions = {},
): MobilePairingService {
  return new MobilePairingService({
    ...options,
    store: options.store ?? new FileMobileDeviceStore(),
  });
}
