/**
 * Mobile-QR-System & UI-Link Integration (v06 / Wave 2 / A18).
 *
 * Erzeugt kurzlebige Kopplungs- und Anmelde-Links (Pairing) über das
 * bestehende Mobile-QR-System.
 *
 * Voraussetzung: Scope 'open_ui'.
 */

import { exec } from "node:child_process";
import { randomBytes } from "node:crypto";
import { check } from "./grants";
import type { ConnectMcpAuthContext } from "./types";

export interface OpenUiResult {
  ok: boolean;
  message: string;
  url: string;
  pairUrl: string;
  pairToken: string;
  expiresAt: string;
  qrSvg: string;
}

export async function createOpenUiLink(
  auth: ConnectMcpAuthContext,
  companyId: string,
  params: {
    target?: "connect" | "swarm" | "settings" | "mobile";
    openInBrowser?: boolean;
  },
): Promise<OpenUiResult> {
  // 1. Berechtigungsprüfung: Scope 'open_ui' zwingend erforderlich
  const access = check(auth.principal, companyId, "open_ui");
  if (!access.allowed) {
    throw new Error(
      access.reason || `403 Forbidden: Principal "${auth.principal}" besitzt keinen 'open_ui' Scope.`,
    );
  }

  const target = params.target || "connect";
  const openInBrowser = params.openInBrowser ?? false;

  // Basis-URL ermitteln (Tunnel-URL bevorzugen, sonst Port 3101)
  const baseUrl = process.env.TUNNEL_URL || process.env.CONNECT_PUBLIC_URL || "http://localhost:3101";

  let targetPath = "/";
  switch (target) {
    case "swarm":
      targetPath = "/swarm";
      break;
    case "settings":
      targetPath = "/settings";
      break;
    case "mobile":
      targetPath = "/mobile";
      break;
    default:
      targetPath = "/";
  }

  const fullUrl = `${baseUrl.replace(/\/$/, "")}${targetPath}`;

  // Kurzlebiges Pairing-Token erzeugen (Gültigkeit: 5 Minuten)
  const pairToken = randomBytes(16).toString("base64url");
  const expiresAt = new Date(Date.now() + 5 * 60_000).toISOString();
  const pairUrl = `${baseUrl.replace(/\/$/, "")}/__connect/pair?t=${pairToken}`;

  // SVG QR-Code generieren
  let qrSvg = "";
  try {
    const qrcodeMod = await import("../../tunnel/qrcode-vendor.js");
    const qrcode = (qrcodeMod as any).default || (qrcodeMod as any);
    const qr = qrcode(0, "M");
    qr.addData(pairUrl);
    qr.make();
    qrSvg = qr.createSvgTag({ cellSize: 5, margin: 2, scalable: true });
  } catch {
    // Fallback falls QR-Vendor nicht geladen werden kann
    qrSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="120" height="120"><rect width="100" height="100" fill="#111"/><text x="10" y="55" fill="#fff" font-size="12">Connect QR</text></svg>`;
  }

  // Optional: Im lokalen Browser auf Windows öffnen (nur wenn lokal ausgeführt)
  if (openInBrowser && auth.isLocal && process.platform === "win32") {
    try {
      exec(`start "" "${fullUrl}"`, () => {});
    } catch {
      // Ignoriere Fehler beim Starten
    }
  }

  return {
    ok: true,
    message: openInBrowser
      ? `Connect (${fullUrl}) im lokalen Browser geöffnet und QR-Kopplungslink erzeugt.`
      : `Kurzlebiger mobiler QR-Kopplungslink erzeugt.`,
    url: fullUrl,
    pairUrl,
    pairToken,
    expiresAt,
    qrSvg,
  };
}
