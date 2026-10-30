/**
 * BUG-07 Fix: Manus API Key Synchronisation
 *
 * Zentraler Server-Dienst und REST-Endpunkt zur einheitlichen Synchronisation
 * des Manus-API-Keys zwischen Einstellungen › Globale API-Keys und
 * Einstellungen › KI-Modelle / Model Provider.
 *
 * Verhindert Desynchronisation und doppelte Datenhaltung.
 */

import { Hono } from "hono";
import type { Context } from "hono";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export interface ManusKeyStatus {
  configured: boolean;
  source: "env" | "storage" | "none";
  maskedKey: string | null;
  updatedAt: string | null;
}

export class ManusKeySyncService {
  private static instance: ManusKeySyncService;
  private filePath: string;
  private cachedKey: string | null = null;
  private updatedAt: string | null = null;

  constructor(customPath?: string) {
    if (customPath) {
      this.filePath = customPath;
    } else {
      const base = process.env.LOCALAPPDATA
        ? join(process.env.LOCALAPPDATA, "ConnectApp", "data")
        : join(homedir(), ".connect-app", "data");
      this.filePath = join(base, "manus-key.json");
    }
    this.load();
  }

  public static getInstance(): ManusKeySyncService {
    if (!ManusKeySyncService.instance) {
      ManusKeySyncService.instance = new ManusKeySyncService();
    }
    return ManusKeySyncService.instance;
  }

  private load(): void {
    try {
      if (existsSync(this.filePath)) {
        const raw = readFileSync(this.filePath, "utf-8");
        const parsed = JSON.parse(raw);
        if (typeof parsed.apiKey === "string" && parsed.apiKey.trim().length > 0) {
          this.cachedKey = parsed.apiKey.trim();
          this.updatedAt = parsed.updatedAt || null;
          // Synchronisiere in process.env fuer Subsysteme
          if (this.cachedKey) {
            process.env.MANUS_API_KEY = this.cachedKey;
          }
        }
      }
    } catch (err) {
      console.warn("[ManusKeySyncService] Fehler beim Laden der Manus-Schluesseldatei:", err);
    }
  }

  public getManusKey(): string | null {
    if (this.cachedKey) return this.cachedKey;
    const envKey = process.env.MANUS_API_KEY?.trim() || process.env.VITE_MANUS_API_KEY?.trim();
    if (envKey) return envKey;
    return null;
  }

  public hasManusKey(): boolean {
    return Boolean(this.getManusKey());
  }

  public getMaskedKey(): string | null {
    const key = this.getManusKey();
    if (!key) return null;
    if (key.length <= 8) return "********";
    return `${key.slice(0, 4)}...${key.slice(-4)}`;
  }

  public getStatus(): ManusKeyStatus {
    const key = this.getManusKey();
    if (!key) {
      return {
        configured: false,
        source: "none",
        maskedKey: null,
        updatedAt: null,
      };
    }

    const isEnv = Boolean(
      (process.env.MANUS_API_KEY && !this.cachedKey) ||
      (process.env.VITE_MANUS_API_KEY && !this.cachedKey)
    );

    return {
      configured: true,
      source: isEnv ? "env" : "storage",
      maskedKey: this.getMaskedKey(),
      updatedAt: this.updatedAt,
    };
  }

  public setManusKey(key: string): void {
    const cleaned = key.trim();
    if (!cleaned) {
      this.clearManusKey();
      return;
    }

    this.cachedKey = cleaned;
    this.updatedAt = new Date().toISOString();
    process.env.MANUS_API_KEY = cleaned;

    try {
      const dir = join(this.filePath, "..");
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
      writeFileSync(
        this.filePath,
        JSON.stringify({ apiKey: cleaned, updatedAt: this.updatedAt }, null, 2),
        "utf-8"
      );
    } catch (err) {
      console.error("[ManusKeySyncService] Fehler beim Speichern des Manus-Keys:", err);
    }
  }

  public clearManusKey(): void {
    this.cachedKey = null;
    this.updatedAt = new Date().toISOString();
    delete process.env.MANUS_API_KEY;

    try {
      if (existsSync(this.filePath)) {
        writeFileSync(
          this.filePath,
          JSON.stringify({ apiKey: null, updatedAt: this.updatedAt }, null, 2),
          "utf-8"
        );
      }
    } catch (err) {
      console.warn("[ManusKeySyncService] Fehler beim Loeschen des Manus-Keys:", err);
    }
  }
}

/**
 * Erstellt den Hono-Router fuer die Manus-Key-Synchronisation.
 */
export function createManusKeySyncRouter(customService?: ManusKeySyncService): Hono {
  const router = new Hono();
  const service = customService || ManusKeySyncService.getInstance();

  // GET /api/services/manus/key - Status und maskierter Key
  router.get("/key", (c: Context) => {
    const status = service.getStatus();
    return c.json({ ok: true, ...status }, 200);
  });

  // POST /api/services/manus/key - Key speichern / synchronisieren
  router.post("/key", async (c: Context) => {
    try {
      const body = await c.req.json().catch(() => ({}));
      const key = body.apiKey || body.key;
      if (typeof key !== "string" || !key.trim()) {
        return c.json({ ok: false, error: "Ungueltiger oder leerer API-Key." }, 400);
      }

      service.setManusKey(key);
      const status = service.getStatus();
      return c.json({ ok: true, message: "Manus API-Key erfolgreich synchronisiert.", ...status }, 200);
    } catch (err: any) {
      return c.json({ ok: false, error: err?.message || String(err) }, 400);
    }
  });

  // DELETE /api/services/manus/key - Key entfernen
  router.delete("/key", (c: Context) => {
    service.clearManusKey();
    const status = service.getStatus();
    return c.json({ ok: true, message: "Manus API-Key entfernt.", ...status }, 200);
  });

  // GET /api/services/manus/status - Schneller Status-Check fuer UI-Pillen
  router.get("/status", (c: Context) => {
    const status = service.getStatus();
    return c.json({
      ok: true,
      hasKey: status.configured,
      badgeText: status.configured ? "Schlüssel hinterlegt" : "Kein Schlüssel",
      settingsPath: "#api-keys",
      ...status,
    }, 200);
  });

  return router;
}

export default createManusKeySyncRouter;
