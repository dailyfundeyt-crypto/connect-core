/**
 * BUG-05 Fix: Hitodama Desktop Settings Persistenz
 *
 * Verwaltet und speichert den Zustand der Desktop-Steuerung (Permissions,
 * Whitelist-Apps, Killswitch, erlaubte Domains) dauerhaft im lokalen
 * Dateisystem (%LOCALAPPDATA%\ConnectApp\data\hitodama-settings.json).
 */

import { Hono } from "hono";
import type { Context } from "hono";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type {
  AgentDesktopPermission,
  DesktopRiskLevel,
} from "../../../../packages/shared/src/desktop/contracts";

export type HitodamaSettings = {
  killswitch: boolean;
  globalSafetyGateEnabled: boolean;
  whitelistedApps: string[];
  allowedDomains: string[];
  permissions: Record<string, AgentDesktopPermission>;
  updatedAt: string;
};

const DEFAULT_SETTINGS: HitodamaSettings = {
  killswitch: false,
  globalSafetyGateEnabled: true,
  whitelistedApps: ["notepad.exe", "helium.exe", "code.exe"],
  allowedDomains: ["youtube.com", "github.com", "google.com"],
  permissions: {
    agent_daily: {
      agentId: "agent_daily",
      permissionLevel: "act",
      allowedApps: ["notepad.exe", "helium.exe"],
      allowedDomains: ["youtube.com", "github.com"],
      rateLimitPerMinute: 30,
      updatedAt: new Date().toISOString(),
    },
    agent_external: {
      agentId: "agent_external",
      permissionLevel: "none",
      allowedApps: [],
      allowedDomains: [],
      rateLimitPerMinute: 0,
      updatedAt: new Date().toISOString(),
    },
    agent_devops: {
      agentId: "agent_devops",
      permissionLevel: "destructive_with_confirm",
      allowedApps: ["code.exe", "powershell.exe"],
      allowedDomains: ["github.com"],
      rateLimitPerMinute: 20,
      updatedAt: new Date().toISOString(),
    },
    agent_researcher: {
      agentId: "agent_researcher",
      permissionLevel: "read",
      allowedApps: ["helium.exe"],
      allowedDomains: ["*"],
      rateLimitPerMinute: 60,
      updatedAt: new Date().toISOString(),
    },
  },
  updatedAt: new Date().toISOString(),
};

export class HitodamaStateStore {
  private static instance: HitodamaStateStore;
  private filePath: string;
  private current: HitodamaSettings;

  constructor(customPath?: string) {
    if (customPath) {
      this.filePath = customPath;
    } else {
      const base = process.env.LOCALAPPDATA
        ? join(process.env.LOCALAPPDATA, "ConnectApp", "data")
        : join(homedir(), ".connect-app", "data");
      this.filePath = join(base, "hitodama-settings.json");
    }
    this.current = this.load();
  }

  public static getInstance(): HitodamaStateStore {
    if (!HitodamaStateStore.instance) {
      HitodamaStateStore.instance = new HitodamaStateStore();
    }
    return HitodamaStateStore.instance;
  }

  private load(): HitodamaSettings {
    try {
      if (existsSync(this.filePath)) {
        const raw = readFileSync(this.filePath, "utf-8");
        const parsed = JSON.parse(raw);
        return {
          ...DEFAULT_SETTINGS,
          ...parsed,
          permissions: {
            ...DEFAULT_SETTINGS.permissions,
            ...(parsed.permissions || {}),
          },
        };
      }
    } catch (err) {
      console.warn("[HitodamaStateStore] Fehler beim Laden der Einstellungen, nutze Defaults:", err);
    }
    return { ...DEFAULT_SETTINGS };
  }

  public save(): void {
    try {
      const dir = join(this.filePath, "..");
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
      this.current.updatedAt = new Date().toISOString();
      writeFileSync(this.filePath, JSON.stringify(this.current, null, 2), "utf-8");
    } catch (err) {
      console.error("[HitodamaStateStore] Fehler beim Speichern der Einstellungen:", err);
    }
  }

  public getSettings(): HitodamaSettings {
    return { ...this.current };
  }

  public updateSettings(partial: Partial<HitodamaSettings>): HitodamaSettings {
    this.current = {
      ...this.current,
      ...partial,
      permissions: {
        ...this.current.permissions,
        ...(partial.permissions || {}),
      },
      updatedAt: new Date().toISOString(),
    };
    this.save();
    return this.getSettings();
  }

  public setAgentPermission(agentId: string, permission: Partial<AgentDesktopPermission>): AgentDesktopPermission {
    const existing = this.current.permissions[agentId] || {
      agentId,
      permissionLevel: "none",
      allowedApps: [],
      allowedDomains: [],
      rateLimitPerMinute: 0,
      updatedAt: new Date().toISOString(),
    };

    const updated: AgentDesktopPermission = {
      ...existing,
      ...permission,
      agentId,
      updatedAt: new Date().toISOString(),
    };

    this.current.permissions[agentId] = updated;
    this.save();
    return updated;
  }

  public getAgentPermission(agentId: string): AgentDesktopPermission | null {
    return this.current.permissions[agentId] || null;
  }

  public setKillswitch(active: boolean): boolean {
    this.current.killswitch = active;
    this.save();
    return this.current.killswitch;
  }

  public resetToDefaults(): HitodamaSettings {
    this.current = { ...DEFAULT_SETTINGS, updatedAt: new Date().toISOString() };
    this.save();
    return this.getSettings();
  }
}

/**
 * Erstellt den Hono-Router fuer Hitodama-Desktop-Einstellungen.
 */
export function createHitodamaStateRouter(customStore?: HitodamaStateStore): Hono {
  const router = new Hono();
  const store = customStore || HitodamaStateStore.getInstance();

  // GET /api/desktop/settings
  router.get("/settings", (c: Context) => {
    return c.json({ ok: true, settings: store.getSettings() }, 200);
  });

  // POST /api/desktop/settings
  router.post("/settings", async (c: Context) => {
    try {
      const body = await c.req.json().catch(() => ({}));
      const updated = store.updateSettings(body);
      return c.json({ ok: true, settings: updated }, 200);
    } catch (err: any) {
      return c.json({ ok: false, error: err?.message || String(err) }, 400);
    }
  });

  // GET /api/desktop/permissions
  router.get("/permissions", (c: Context) => {
    const settings = store.getSettings();
    return c.json({ ok: true, permissions: settings.permissions }, 200);
  });

  // POST /api/desktop/permissions
  router.post("/permissions", async (c: Context) => {
    try {
      const body = await c.req.json();
      const agentId = body.agentId;
      if (!agentId || typeof agentId !== "string") {
        return c.json({ ok: false, error: "agentId ist erforderlich" }, 400);
      }
      const updated = store.setAgentPermission(agentId, body);
      return c.json({ ok: true, permission: updated }, 200);
    } catch (err: any) {
      return c.json({ ok: false, error: err?.message || String(err) }, 400);
    }
  });

  // POST /api/desktop/killswitch
  router.post("/killswitch", async (c: Context) => {
    try {
      const body = await c.req.json().catch(() => ({ active: true }));
      const active = body.active !== false;
      const result = store.setKillswitch(active);
      return c.json({ ok: true, killswitch: result }, 200);
    } catch (err: any) {
      return c.json({ ok: false, error: err?.message || String(err) }, 400);
    }
  });

  return router;
}

export default createHitodamaStateRouter;
