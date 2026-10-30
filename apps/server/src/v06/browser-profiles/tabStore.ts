/**
 * Tab-Store fuer Browser-Profile v06 (A09).
 *
 * Verwaltet Tabs pro Profil persistent (DB & In-Memory Fallback),
 * synchronisiert mit CDP-Page-Targets und stellt Tabs beim Profil-Start wieder her.
 */

import { and, asc, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import type { Database } from "../../db/client";
import type { ProfileTab } from "../../contracts/v06/browser-profiles";
import { cdpCall, cdpPageTargets } from "../../agent-hub/agent-cdp";
import { openUrlInProfileTab } from "../../agent-hub/browser-launch-guard";
import { browserProfileTabsTable } from "./schema";

export interface TabStoreOptions {
  database?: Database;
}

export class TabStore {
  private inMemory = new Map<string, ProfileTab & { isArchived: boolean }>();

  constructor(private database?: Database) {}

  setDatabase(database?: Database): void {
    this.database = database;
  }

  async listTabs(profileId: string): Promise<ProfileTab[]> {
    if (this.database) {
      try {
        const rows = await this.database
          .select()
          .from(browserProfileTabsTable)
          .where(
            and(
              eq(browserProfileTabsTable.profileId, profileId),
              eq(browserProfileTabsTable.isArchived, false),
            ),
          )
          .orderBy(asc(browserProfileTabsTable.orderIndex));

        return rows.map((r) => ({
          id: r.id,
          profileId: r.profileId,
          groupId: r.groupId ?? undefined,
          url: r.url,
          title: r.title,
          cdpTargetId: r.cdpTargetId ?? undefined,
          order: r.orderIndex,
        }));
      } catch (err) {
        console.warn("[tabStore] DB-Abfrage fehlgeschlagen, Fallback auf In-Memory:", err);
      }
    }

    return Array.from(this.inMemory.values())
      .filter((t) => t.profileId === profileId && !t.isArchived)
      .sort((a, b) => a.order - b.order)
      .map(({ isArchived: _, ...t }) => t);
  }

  async getTab(tabId: string): Promise<ProfileTab | null> {
    const mem = this.inMemory.get(tabId);
    if (mem && !mem.isArchived) {
      const { isArchived: _, ...clean } = mem;
      return clean;
    }

    if (this.database) {
      try {
        const rows = await this.database
          .select()
          .from(browserProfileTabsTable)
          .where(
            and(
              eq(browserProfileTabsTable.id, tabId),
              eq(browserProfileTabsTable.isArchived, false),
            ),
          );
        if (rows[0]) {
          return {
            id: rows[0].id,
            profileId: rows[0].profileId,
            groupId: rows[0].groupId ?? undefined,
            url: rows[0].url,
            title: rows[0].title,
            cdpTargetId: rows[0].cdpTargetId ?? undefined,
            order: rows[0].orderIndex,
          };
        }
      } catch (err) {
        console.warn("[tabStore] DB getTab fehlgeschlagen:", err);
      }
    }

    return null;
  }

  async addTab(
    profileId: string,
    data: {
      url: string;
      title?: string;
      groupId?: string;
      cdpTargetId?: string;
      order?: number;
    },
  ): Promise<ProfileTab> {
    const id = `tab_${randomUUID()}`;
    const order = data.order ?? (await this.getNextOrder(profileId));
    const title = data.title ?? (data.url.startsWith("http") ? data.url : "Neuer Tab");

    const tab: ProfileTab = {
      id,
      profileId,
      groupId: data.groupId,
      url: data.url || "about:blank",
      title,
      cdpTargetId: data.cdpTargetId,
      order,
    };

    this.inMemory.set(id, { ...tab, isArchived: false });

    if (this.database) {
      try {
        await this.database.insert(browserProfileTabsTable).values({
          id,
          profileId,
          groupId: data.groupId ?? null,
          url: tab.url,
          title: tab.title,
          cdpTargetId: tab.cdpTargetId ?? null,
          orderIndex: order,
          isArchived: false,
        });
      } catch (err) {
        console.warn("[tabStore] DB-Insert fehlgeschlagen:", err);
      }
    }

    return tab;
  }

  async updateTab(
    tabId: string,
    data: Partial<{
      url: string;
      title: string;
      groupId?: string;
      cdpTargetId?: string;
      order: number;
    }>,
  ): Promise<ProfileTab | null> {
    const mem = this.inMemory.get(tabId);
    if (mem && !mem.isArchived) {
      if (data.url !== undefined) mem.url = data.url;
      if (data.title !== undefined) mem.title = data.title;
      if (data.groupId !== undefined) mem.groupId = data.groupId;
      if (data.cdpTargetId !== undefined) mem.cdpTargetId = data.cdpTargetId;
      if (data.order !== undefined) mem.order = data.order;
    }

    if (this.database) {
      try {
        const updates: Record<string, unknown> = {
          updatedAt: new Date(),
        };
        if (data.url !== undefined) updates.url = data.url;
        if (data.title !== undefined) updates.title = data.title;
        if (data.groupId !== undefined) updates.groupId = data.groupId ?? null;
        if (data.cdpTargetId !== undefined) updates.cdpTargetId = data.cdpTargetId ?? null;
        if (data.order !== undefined) updates.orderIndex = data.order;

        await this.database
          .update(browserProfileTabsTable)
          .set(updates)
          .where(eq(browserProfileTabsTable.id, tabId));
      } catch (err) {
        console.warn("[tabStore] DB-Update fehlgeschlagen:", err);
      }
    }

    if (mem) {
      const { isArchived: _, ...clean } = mem;
      return clean;
    }
    return null;
  }

  async archiveTab(tabId: string): Promise<boolean> {
    const mem = this.inMemory.get(tabId);
    if (mem) {
      mem.isArchived = true;
    }

    if (this.database) {
      try {
        await this.database
          .update(browserProfileTabsTable)
          .set({ isArchived: true, updatedAt: new Date() })
          .where(eq(browserProfileTabsTable.id, tabId));
        return true;
      } catch (err) {
        console.warn("[tabStore] DB-Archivierung fehlgeschlagen:", err);
      }
    }

    return Boolean(mem);
  }

  /**
   * Liest die aktuellen Page-Targets aus dem laufenden Browser via CDP aus
   * und aktualisiert bzw. ergaenzt die gespeicherten Tabs.
   */
  async syncTabsFromCdp(profileId: string, port: number): Promise<ProfileTab[]> {
    let targets: Array<{ id: string; title: string; url: string }> = [];
    try {
      targets = await cdpPageTargets(port);
    } catch {
      return this.listTabs(profileId);
    }

    const existingTabs = await this.listTabs(profileId);

    for (const target of targets) {
      const match = existingTabs.find(
        (t) => t.cdpTargetId === target.id || (t.url === target.url && !t.cdpTargetId),
      );
      if (match) {
        await this.updateTab(match.id, {
          title: target.title,
          url: target.url,
          cdpTargetId: target.id,
        });
      } else {
        await this.addTab(profileId, {
          url: target.url,
          title: target.title,
          cdpTargetId: target.id,
        });
      }
    }

    return this.listTabs(profileId);
  }

  /**
   * Stellt beim Profil-Start alle gespeicherten Tabs im Browser via CDP wieder her.
   */
  async restoreTabsToCdp(
    profileId: string,
    port: number,
    userDataDir: string,
  ): Promise<ProfileTab[]> {
    const tabs = await this.listTabs(profileId);

    if (tabs.length === 0) {
      // Wenn noch keine Tabs existieren, Default-Tab anlegen
      const defaultTab = await this.addTab(profileId, {
        url: "about:blank",
        title: "Neuer Tab",
      });
      return [defaultTab];
    }

    for (const tab of tabs) {
      if (tab.url && tab.url !== "about:blank") {
        try {
          const res = await openUrlInProfileTab(port, tab.url, userDataDir);
          if (res.ok && res.targetId) {
            await this.updateTab(tab.id, { cdpTargetId: res.targetId });
          }
        } catch (err) {
          console.warn(`[tabStore] Wiederherstellen von Tab ${tab.id} fehlgeschlagen:`, err);
        }
      }
    }

    return this.listTabs(profileId);
  }

  private async getNextOrder(profileId: string): Promise<number> {
    const tabs = await this.listTabs(profileId);
    if (tabs.length === 0) return 0;
    return Math.max(...tabs.map((t) => t.order)) + 1;
  }
}
