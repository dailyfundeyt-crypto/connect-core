/**
 * Browser-Profile Manager v06 (A09).
 *
 * Verwaltet bis zu 10 getrennte Chromium/Helium-Nutzerprofile pro Agent.
 * Jedes Profil besitzt sein eigenes user-data-dir und einen eigenen CDP-Port.
 * Tabs bleiben aktiv bis „Sitzung beenden“ (POST /:id/end).
 */

import { and, desc, eq } from "drizzle-orm";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import type { Database } from "../../db/client";
import {
  MAX_PROFILES_PER_AGENT,
  type BrowserProfile,
} from "../../contracts/v06/browser-profiles";
import {
  cdpCall,
  cdpScreenshot,
  type CdpShot,
} from "../../agent-hub/agent-cdp";
import {
  canonicalCdpPort,
  cdpPortAlive,
  invalidateProcessCache,
  resetLaunchGuard,
  resolveProfileCdp,
} from "../../agent-hub/browser-launch-guard";
import {
  assertNotStefanHeliumProfile,
  resolveAgentProfileDir,
} from "./guard";
import { browserProfilesTable } from "./schema";
import { TabStore } from "./tabStore";
import { GroupStore } from "./groupStore";

export class ProfileLimitExceededError extends Error {
  readonly statusCode = 409;
  constructor(agentId: string, currentCount: number) {
    super(
      `Limit erreicht: Agent '${agentId}' hat bereits ${currentCount} Profile (Maximum: ${MAX_PROFILES_PER_AGENT}).`,
    );
    this.name = "ProfileLimitExceededError";
  }
}

export interface ProfileRecord extends BrowserProfile {
  userDataDir: string;
  cdpPort: number;
  endedAt?: string;
}

export class ProfileManager {
  private inMemory = new Map<string, ProfileRecord>();
  readonly tabStore: TabStore;
  readonly groupStore: GroupStore;

  constructor(private database?: Database) {
    this.tabStore = new TabStore(database);
    this.groupStore = new GroupStore(database);
  }

  setDatabase(database?: Database): void {
    this.database = database;
    this.tabStore.setDatabase(database);
    this.groupStore.setDatabase(database);
  }

  /**
   * Zaehlt aktive Profile eines Agenten.
   */
  async countActiveProfiles(agentId: string): Promise<number> {
    if (this.database) {
      try {
        const rows = await this.database
          .select()
          .from(browserProfilesTable)
          .where(
            and(
              eq(browserProfilesTable.agentId, agentId),
              eq(browserProfilesTable.status, "active"),
            ),
          );
        return rows.length;
      } catch (err) {
        console.warn("[profileManager] DB countActiveProfiles fehlgeschlagen:", err);
      }
    }

    return Array.from(this.inMemory.values()).filter(
      (p) => p.agentId === agentId && p.status === "active",
    ).length;
  }

  /**
   * Listet alle Profile (optional gefiltert nach Agent).
   */
  async listProfiles(agentId?: string): Promise<BrowserProfile[]> {
    if (this.database) {
      try {
        const query = agentId
          ? this.database
              .select()
              .from(browserProfilesTable)
              .where(eq(browserProfilesTable.agentId, agentId))
              .orderBy(desc(browserProfilesTable.createdAt))
          : this.database
              .select()
              .from(browserProfilesTable)
              .orderBy(desc(browserProfilesTable.createdAt));

        const rows = await query;
        return rows.map((r) => ({
          id: r.id,
          agentId: r.agentId,
          name: r.name,
          color: r.color,
          status: (r.status === "ended" ? "ended" : "active") as "active" | "ended",
          createdAt: r.createdAt.toISOString(),
        }));
      } catch (err) {
        console.warn("[profileManager] DB listProfiles fehlgeschlagen:", err);
      }
    }

    return Array.from(this.inMemory.values())
      .filter((p) => (agentId ? p.agentId === agentId : true))
      .map((p) => ({
        id: p.id,
        agentId: p.agentId,
        name: p.name,
        color: p.color,
        status: p.status,
        createdAt: p.createdAt,
      }));
  }

  /**
   * Holt ein einzelnes Profil anhand seiner ID.
   */
  async getProfile(profileId: string): Promise<ProfileRecord | null> {
    const mem = this.inMemory.get(profileId);
    if (mem) return mem;

    if (this.database) {
      try {
        const rows = await this.database
          .select()
          .from(browserProfilesTable)
          .where(eq(browserProfilesTable.id, profileId));
        if (rows[0]) {
          const record: ProfileRecord = {
            id: rows[0].id,
            agentId: rows[0].agentId,
            name: rows[0].name,
            color: rows[0].color,
            status: (rows[0].status === "ended" ? "ended" : "active") as "active" | "ended",
            userDataDir: rows[0].userDataDir,
            cdpPort: rows[0].cdpPort,
            createdAt: rows[0].createdAt.toISOString(),
            endedAt: rows[0].endedAt?.toISOString(),
          };
          this.inMemory.set(profileId, record);
          return record;
        }
      } catch (err) {
        console.warn("[profileManager] DB getProfile fehlgeschlagen:", err);
      }
    }

    return null;
  }

  /**
   * Startet oder erstellt ein neues Profil fuer den Agenten.
   * Prueft das Limit MAX_PROFILES_PER_AGENT (10).
   * Verhindert zwingend Stefans Helium-Profil.
   */
  async startProfile(
    agentId: string,
    name: string,
    options?: {
      color?: string;
      profileId?: string;
      customDir?: string;
      launchBrowser?: boolean;
    },
  ): Promise<BrowserProfile> {
    const activeCount = await this.countActiveProfiles(agentId);
    if (activeCount >= MAX_PROFILES_PER_AGENT) {
      throw new ProfileLimitExceededError(agentId, activeCount);
    }

    const profileId = options?.profileId || `prof_${randomUUID()}`;
    const color = options?.color || "#00f2fe";

    // Ermittelt user-data-dir unter %LOCALAPPDATA%\Connect\agent-profiles\<agentId>\<profileId>
    // und wirft sofort, falls Stefans Helium-Profil betroffen ist.
    const userDataDir = resolveAgentProfileDir(agentId, profileId, options?.customDir);
    assertNotStefanHeliumProfile(userDataDir);

    const cdpPort = canonicalCdpPort(userDataDir);
    const createdAt = new Date().toISOString();

    const record: ProfileRecord = {
      id: profileId,
      agentId,
      name,
      color,
      status: "active",
      userDataDir,
      cdpPort,
      createdAt,
    };

    this.inMemory.set(profileId, record);

    if (this.database) {
      try {
        await this.database
          .insert(browserProfilesTable)
          .values({
            id: profileId,
            agentId,
            name,
            color,
            status: "active",
            userDataDir,
            cdpPort,
            createdAt: new Date(),
            updatedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: browserProfilesTable.id,
            set: {
              status: "active",
              updatedAt: new Date(),
              endedAt: null,
            },
          });
      } catch (err) {
        console.warn("[profileManager] DB startProfile fehlgeschlagen:", err);
      }
    }

    // Wenn launchBrowser aktiv ist (Standard: true), starten wir den Browserprozess via CDP
    const shouldLaunch = options?.launchBrowser !== false;
    if (shouldLaunch) {
      try {
        const { launchAgentChrome } = await import("../../agent-hub/agent-cdp");
        const launchResult = await launchAgentChrome("about:blank", userDataDir);
        if (launchResult.ok) {
          // Tabs wiederherstellen
          await this.tabStore.restoreTabsToCdp(profileId, cdpPort, userDataDir);
        } else {
          console.warn(`[profileManager] Browser-Start Warnung: ${launchResult.detail}`);
        }
      } catch (err) {
        console.warn("[profileManager] Browser-Start fehlgeschlagen (evtl. Headless/Test-Env):", err);
      }
    }

    return {
      id: record.id,
      agentId: record.agentId,
      name: record.name,
      color: record.color,
      status: "active",
      createdAt: record.createdAt,
    };
  }

  /**
   * „Sitzung beenden“:
   * 1. Speichert alle Tabs aus CDP in den tabStore.
   * 2. Schliesst den Browserprozess dieses Profils sauber.
   * 3. Setzt status='ended'.
   */
  async endProfile(
    profileId: string,
  ): Promise<{ ok: boolean; id: string; status: "ended" }> {
    const record = await this.getProfile(profileId);
    if (!record) {
      throw new Error(`Browser-Profil '${profileId}' nicht gefunden.`);
    }

    // 1. Offene Tabs vor dem Schliessen aus CDP synchronisieren
    try {
      await this.tabStore.syncTabsFromCdp(profileId, record.cdpPort);
    } catch (err) {
      console.warn(`[profileManager] Tab-Sync vor Beenden fehlgeschlagen:`, err);
    }

    // 2. Browserprozess sauber schliessen
    await this.closeBrowserProcess(record.userDataDir, record.cdpPort);

    // 3. Status auf 'ended' setzen
    record.status = "ended";
    record.endedAt = new Date().toISOString();
    this.inMemory.set(profileId, record);

    if (this.database) {
      try {
        await this.database
          .update(browserProfilesTable)
          .set({
            status: "ended",
            endedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(browserProfilesTable.id, profileId));
      } catch (err) {
        console.warn("[profileManager] DB endProfile fehlgeschlagen:", err);
      }
    }

    return { ok: true, id: profileId, status: "ended" };
  }

  /**
   * Schliesst den Browserprozess eines Profils via CDP (Browser.close)
   * und Taskkill-Fallback falls noetig.
   */
  private async closeBrowserProcess(userDataDir: string, port: number): Promise<void> {
    try {
      // 1. Zuerst sauber via CDP Browser.close
      const alive = await cdpPortAlive(port, 400);
      if (alive) {
        try {
          const verRes = await fetch(`http://127.0.0.1:${port}/json/version`, {
            signal: AbortSignal.timeout(1000),
          });
          if (verRes.ok) {
            const verData = (await verRes.json()) as { webSocketDebuggerUrl?: string };
            if (verData.webSocketDebuggerUrl) {
              await new Promise<void>((resolve) => {
                const ws = new WebSocket(verData.webSocketDebuggerUrl!);
                const timer = setTimeout(() => {
                  try { ws.close(); } catch {}
                  resolve();
                }, 2000);
                ws.onopen = () => {
                  ws.send(JSON.stringify({ id: 999, method: "Browser.close" }));
                };
                ws.onmessage = () => {
                  clearTimeout(timer);
                  try { ws.close(); } catch {}
                  resolve();
                };
                ws.onerror = () => {
                  clearTimeout(timer);
                  resolve();
                };
              });
            }
          }
        } catch {
          /* ignore CDP close failure */
        }
      }

      // 2. Pruefen ob Prozess noch laeuft
      const procInfo = await resolveProfileCdp(userDataDir);
      if (procInfo.running && procInfo.pid && process.platform === "win32") {
        await new Promise<void>((resolve) => {
          execFile("taskkill.exe", ["/pid", String(procInfo.pid), "/T", "/F"], { windowsHide: true }, () => {
            resolve();
          });
        });
      }

      invalidateProcessCache();
      resetLaunchGuard(userDataDir);
    } catch (err) {
      console.warn(`[profileManager] Fehler beim Schliessen des Browsers (${userDataDir}):`, err);
    }
  }

  /**
   * Live-Preview / Screenshot fuer ein Profil bzw. Tab.
   */
  async getProfilePreview(profileId: string, targetId?: string): Promise<CdpShot> {
    const record = await this.getProfile(profileId);
    if (!record) {
      return { ok: false, error: "Profil nicht gefunden." };
    }

    if (record.status !== "active") {
      return { ok: false, error: "Profil ist nicht aktiv ('ended')." };
    }

    return await cdpScreenshot(record.cdpPort, targetId);
  }
}
