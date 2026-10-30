/**
 * T3-Bridge — Token- und QR-Hilfen der Handy-Kopplung (Lane A34).
 *
 * Grundsätze:
 *  - Tokens entstehen mit `crypto.randomBytes` (32 Byte), nie aus Math.random.
 *  - Gespeichert wird ausschließlich der SHA-256-Hash.
 *  - Der QR-Code trägt das Token im Fragment (`#token=…`). Fragmente werden
 *    nicht an Server geschickt und landen deshalb nicht in Zugriffslogs.
 *  - `#token=` ist zusätzlich das Muster, das der Redactor aus A10 schwärzt.
 */

import { createHash, randomBytes } from "node:crypto";
import qrcode from "../../tunnel/qrcode-vendor.js";

/** SHA-256 als Hex — die einzige Form, in der ein Token persistiert wird. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/** Neues, kryptografisch zufälliges Token (URL-sicher). */
export function createToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Neue Geräte-Id (öffentlich sichtbar, ohne Geheimnis). */
export function createDeviceId(): string {
  return `phone_${randomBytes(9).toString("base64url")}`;
}

/** Neue Ticket-Id (öffentlich sichtbar, ohne Geheimnis). */
export function createTicketId(): string {
  return `pair_${randomBytes(9).toString("base64url")}`;
}

/**
 * Baut die Kopplungs-URL: Origin + `/#token=…`.
 *
 * Der Pfad ist bewusst `/` (die Connect-App entscheidet selbst, was sie mit dem
 * Fragment macht). A39 kann später auf `/phone` umstellen, ohne dass sich das
 * Tokenformat ändert.
 */
export function buildPairUrl(baseUrl: string, token: string): string {
  const url = new URL(baseUrl);
  url.pathname = "/";
  url.search = "";
  url.hash = new URLSearchParams({ token }).toString();
  return url.toString();
}

/** QR-Code als SVG — gleiche Bibliothek wie die bestehende Tunnel-Kopplung. */
export function renderPairQrSvg(pairUrl: string): string {
  const qr = qrcode(0, "M");
  qr.addData(pairUrl);
  qr.make();
  return qr.createSvgTag({ cellSize: 6, margin: 3, scalable: true });
}
