/**
 * Tab-Gruppen-Store fuer Browser-Profile v06 (A09).
 *
 * Verwaltet Tab-Gruppen (Ordner) hierarchisch und additiv (kein Hard-Delete).
 */

import { and, asc, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import type { Database } from "../../db/client";
import type { ProfileTabGroup } from "../../contracts/v06/browser-profiles";
import { browserProfileGroupsTable } from "./schema";

export interface GroupStoreOptions {
  database?: Database;
}

export class GroupStore {
  private inMemory = new Map<string, ProfileTabGroup & { isArchived: boolean }>();

  constructor(private database?: Database) {}

  setDatabase(database?: Database): void {
    this.database = database;
  }

  async listGroups(profileId: string): Promise<ProfileTabGroup[]> {
    if (this.database) {
      try {
        const rows = await this.database
          .select()
          .from(browserProfileGroupsTable)
          .where(
            and(
              eq(browserProfileGroupsTable.profileId, profileId),
              eq(browserProfileGroupsTable.isArchived, false),
            ),
          )
          .orderBy(asc(browserProfileGroupsTable.orderIndex));

        return rows.map((r) => ({
          id: r.id,
          profileId: r.profileId,
          name: r.name,
          parentId: r.parentId ?? undefined,
          order: r.orderIndex,
        }));
      } catch (err) {
        console.warn("[groupStore] DB-Abfrage fehlgeschlagen, Fallback auf In-Memory:", err);
      }
    }

    return Array.from(this.inMemory.values())
      .filter((g) => g.profileId === profileId && !g.isArchived)
      .sort((a, b) => a.order - b.order)
      .map(({ isArchived: _, ...g }) => g);
  }

  async createGroup(
    profileId: string,
    data: { name: string; parentId?: string; order?: number },
  ): Promise<ProfileTabGroup> {
    const id = `grp_${randomUUID()}`;
    const order = data.order ?? (await this.getNextOrder(profileId));

    const group: ProfileTabGroup = {
      id,
      profileId,
      name: data.name,
      parentId: data.parentId,
      order,
    };

    this.inMemory.set(id, { ...group, isArchived: false });

    if (this.database) {
      try {
        await this.database.insert(browserProfileGroupsTable).values({
          id,
          profileId,
          name: data.name,
          parentId: data.parentId ?? null,
          orderIndex: order,
          isArchived: false,
        });
      } catch (err) {
        console.warn("[groupStore] DB-Insert fehlgeschlagen:", err);
      }
    }

    return group;
  }

  async updateGroup(
    groupId: string,
    data: Partial<{ name: string; parentId?: string; order: number }>,
  ): Promise<ProfileTabGroup | null> {
    const mem = this.inMemory.get(groupId);
    if (mem && !mem.isArchived) {
      if (data.name !== undefined) mem.name = data.name;
      if (data.parentId !== undefined) mem.parentId = data.parentId;
      if (data.order !== undefined) mem.order = data.order;
    }

    if (this.database) {
      try {
        const updates: Record<string, unknown> = {
          updatedAt: new Date(),
        };
        if (data.name !== undefined) updates.name = data.name;
        if (data.parentId !== undefined) updates.parentId = data.parentId;
        if (data.order !== undefined) updates.orderIndex = data.order;

        await this.database
          .update(browserProfileGroupsTable)
          .set(updates)
          .where(eq(browserProfileGroupsTable.id, groupId));
      } catch (err) {
        console.warn("[groupStore] DB-Update fehlgeschlagen:", err);
      }
    }

    if (mem) {
      const { isArchived: _, ...clean } = mem;
      return clean;
    }
    return null;
  }

  async archiveGroup(groupId: string): Promise<boolean> {
    const mem = this.inMemory.get(groupId);
    if (mem) {
      mem.isArchived = true;
    }

    if (this.database) {
      try {
        await this.database
          .update(browserProfileGroupsTable)
          .set({ isArchived: true, updatedAt: new Date() })
          .where(eq(browserProfileGroupsTable.id, groupId));
        return true;
      } catch (err) {
        console.warn("[groupStore] DB-Archivierung fehlgeschlagen:", err);
      }
    }

    return Boolean(mem);
  }

  private async getNextOrder(profileId: string): Promise<number> {
    const groups = await this.listGroups(profileId);
    if (groups.length === 0) return 0;
    return Math.max(...groups.map((g) => g.order)) + 1;
  }
}
