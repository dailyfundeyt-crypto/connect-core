/**
 * Vercel-Bundle-Einstieg fuer PC-Login (helium-pclogin): wird als IIFE in api/index.js eingesetzt und
 * neben __connectPcBridge per globalThis.__connectPcLogin.install(app, requireUser, db) eingehaengt.
 */
import qrcode from "../tunnel/qrcode-vendor.js";
import { installPcLoginRoutes } from "./pc-login-routes";
import type { Q } from "./store";

function qrSvg(text: string): string {
  const qr = qrcode(0, "M");
  qr.addData(text);
  qr.make();
  return qr.createSvgTag({ cellSize: 6, margin: 3, scalable: true });
}

export function install(app: never, requireUser: never, database: unknown) {
  const client = (database as { $client?: { unsafe: (text: string, values?: unknown[]) => Promise<unknown> } }).$client;
  if (!client?.unsafe) throw new Error("pc-login: database client without unsafe()");
  const q: Q = async (text, values = []) => (await client.unsafe(text, values)) as Record<string, unknown>[];
  installPcLoginRoutes(app, requireUser, q, qrSvg);
}

(globalThis as { __connectPcLogin?: unknown }).__connectPcLogin = { install };