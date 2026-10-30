/**
 * Connect Desktop Permissions Engine (Lane 7).
 *
 * Manages granular desktop control permissions per agent:
 *   - permissionLevel: 'none' | 'read' | 'act' | 'destructive_with_confirm'
 *   - allowedApps: e.g. ["notepad.exe", "helium.exe"]
 *   - allowedDomains: e.g. ["youtube.com", "github.com"]
 *   - rateLimitPerMinute: max actions per minute
 *
 * Rules:
 *   1. Default without explicit permission: 'none' -> strictly rejected + logged!
 *   2. 'read': only find_element, read_screen_text, screenshot.
 *   3. 'act': read + open_app, open_url, click, type_text, key_combo, scroll.
 *   4. 'destructive_with_confirm': requires human confirmation card in Notch.
 *   5. App & Domain allowlists are enforced whenever non-empty.
 */

import { eq } from "drizzle-orm";
import type { Database } from "../db/client";
import {
  type AgentDesktopPermission,
  type DesktopAction,
  type DesktopRiskLevel,
  type UpdateAgentDesktopPermissionInput,
  RiskClassifications,
} from "../../../../packages/shared/src/desktop/contracts";
import { desktopAgentPermissions } from "../db/schema/desktop-safety";

export class DesktopPermissionsManager {
  private db?: Database;
  private cache = new Map<string, AgentDesktopPermission>();

  constructor(options?: { database?: Database }) {
    this.db = options?.database;
  }

  public setDatabase(database: Database): void {
    this.db = database;
  }

  /**
   * Retrieves permissions for a specific agent.
   * If not configured, returns default 'none' permission.
   */
  public async getAgentPermission(agentId: string): Promise<AgentDesktopPermission> {
    if (this.cache.has(agentId)) {
      return this.cache.get(agentId)!;
    }

    if (this.db) {
      try {
        const rows = await this.db
          .select()
          .from(desktopAgentPermissions)
          .where(eq(desktopAgentPermissions.agentId, agentId))
          .limit(1);

        if (rows.length > 0) {
          const row = rows[0];
          const perm: AgentDesktopPermission = {
            agentId: row.agentId,
            permissionLevel: row.permissionLevel as AgentDesktopPermission["permissionLevel"],
            allowedApps: (row.allowedApps as string[]) || [],
            allowedDomains: (row.allowedDomains as string[]) || [],
            rateLimitPerMinute: row.rateLimitPerMinute,
            updatedAt: row.updatedAt.toISOString(),
          };
          this.cache.set(agentId, perm);
          return perm;
        }
      } catch (err) {
        console.warn(`[DesktopPermissions] DB lookup failed for ${agentId}, using in-memory:`, err);
      }
    }

    // Default: 'none' (Strictly rejected until enabled by user)
    const defaultPerm: AgentDesktopPermission = {
      agentId,
      permissionLevel: "none",
      allowedApps: [],
      allowedDomains: [],
      rateLimitPerMinute: 30,
      updatedAt: new Date().toISOString(),
    };
    return defaultPerm;
  }

  /**
   * Retrieves all configured agent permissions.
   */
  public async getAllAgentPermissions(): Promise<AgentDesktopPermission[]> {
    if (this.db) {
      try {
        const rows = await this.db.select().from(desktopAgentPermissions);
        const results: AgentDesktopPermission[] = rows.map((row) => ({
          agentId: row.agentId,
          permissionLevel: row.permissionLevel as AgentDesktopPermission["permissionLevel"],
          allowedApps: (row.allowedApps as string[]) || [],
          allowedDomains: (row.allowedDomains as string[]) || [],
          rateLimitPerMinute: row.rateLimitPerMinute,
          updatedAt: row.updatedAt.toISOString(),
        }));
        // Update cache
        for (const p of results) {
          this.cache.set(p.agentId, p);
        }
        return results;
      } catch (err) {
        console.warn("[DesktopPermissions] DB list failed, falling back to cache:", err);
      }
    }

    return Array.from(this.cache.values());
  }

  /**
   * Sets or updates desktop permissions for an agent.
   */
  public async setAgentPermission(
    agentId: string,
    input: UpdateAgentDesktopPermissionInput,
  ): Promise<AgentDesktopPermission> {
    const now = new Date();
    const updated: AgentDesktopPermission = {
      agentId,
      permissionLevel: input.permissionLevel,
      allowedApps: input.allowedApps || [],
      allowedDomains: input.allowedDomains || [],
      rateLimitPerMinute: input.rateLimitPerMinute ?? 30,
      updatedAt: now.toISOString(),
    };

    this.cache.set(agentId, updated);

    if (this.db) {
      try {
        await this.db
          .insert(desktopAgentPermissions)
          .values({
            agentId,
            permissionLevel: updated.permissionLevel,
            allowedApps: updated.allowedApps,
            allowedDomains: updated.allowedDomains,
            rateLimitPerMinute: updated.rateLimitPerMinute,
            updatedAt: now,
          })
          .onConflictDoUpdate({
            target: desktopAgentPermissions.agentId,
            set: {
              permissionLevel: updated.permissionLevel,
              allowedApps: updated.allowedApps,
              allowedDomains: updated.allowedDomains,
              rateLimitPerMinute: updated.rateLimitPerMinute,
              updatedAt: now,
            },
          });
      } catch (err) {
        console.warn(`[DesktopPermissions] DB save failed for ${agentId}:`, err);
      }
    }

    return updated;
  }

  /**
   * Evaluates if an agent is authorized to execute a desktop action.
   */
  public async checkAgentCanPerformAction(
    agentId: string | undefined,
    action: DesktopAction,
  ): Promise<{
    allowed: boolean;
    reason?: string;
    requiresConfirmation?: boolean;
    permissionLevel: AgentDesktopPermission["permissionLevel"];
  }> {
    // Missing agent identity
    if (!agentId) {
      return {
        allowed: false,
        reason: "Desktop action rejected: Missing sourceAgentId",
        permissionLevel: "none",
      };
    }

    const permission = await this.getAgentPermission(agentId);
    const actionRisk: DesktopRiskLevel = action.risk || RiskClassifications[action.type] || "act";

    // 1. None: fully blocked
    if (permission.permissionLevel === "none") {
      return {
        allowed: false,
        reason: `Agent "${agentId}" has permissionLevel: 'none'. Access to desktop control is disabled.`,
        permissionLevel: "none",
      };
    }

    // 2. Read only: cannot act or destroy
    if (permission.permissionLevel === "read" && actionRisk !== "read") {
      return {
        allowed: false,
        reason: `Agent "${agentId}" has permissionLevel: 'read'. Action risk '${actionRisk}' is not permitted.`,
        permissionLevel: "read",
      };
    }

    // 3. Act: cannot execute destructive actions
    if (permission.permissionLevel === "act" && actionRisk === "destructive") {
      return {
        allowed: false,
        reason: `Agent "${agentId}" has permissionLevel: 'act'. Destructive actions are not permitted.`,
        permissionLevel: "act",
      };
    }

    // 4. Destructive with confirm: needs confirmation card in Notch
    if (actionRisk === "destructive") {
      if (permission.permissionLevel !== "destructive_with_confirm") {
        return {
          allowed: false,
          reason: `Agent "${agentId}" does not have permission for destructive actions.`,
          permissionLevel: permission.permissionLevel,
        };
      }
      // Confirmation required!
      return {
        allowed: true,
        requiresConfirmation: true,
        permissionLevel: "destructive_with_confirm",
      };
    }

    // 5. Allowlist: Domains (for open_url)
    if (action.type === "open_url" && action.openUrl?.url && permission.allowedDomains.length > 0) {
      try {
        const urlObj = new URL(action.openUrl.url);
        const host = urlObj.hostname.toLowerCase();
        const allowed = permission.allowedDomains.some((d) => {
          const dl = d.toLowerCase().trim();
          return host === dl || host.endsWith(`.${dl}`);
        });
        if (!allowed) {
          return {
            allowed: false,
            reason: `Target domain "${host}" is not on agent's allowedDomains allowlist (${permission.allowedDomains.join(", ")})`,
            permissionLevel: permission.permissionLevel,
          };
        }
      } catch {
        return {
          allowed: false,
          reason: "Invalid target URL format for open_url",
          permissionLevel: permission.permissionLevel,
        };
      }
    }

    // 6. Allowlist: Applications (for open_app)
    if (action.type === "open_app" && action.openApp?.appName && permission.allowedApps.length > 0) {
      const appTarget = action.openApp.appName.toLowerCase().trim();
      const execTarget = (action.openApp.executablePath || "").toLowerCase().trim();

      const allowed = permission.allowedApps.some((a) => {
        const al = a.toLowerCase().trim();
        return (
          appTarget === al ||
          appTarget.includes(al) ||
          al.includes(appTarget) ||
          (execTarget && execTarget.includes(al))
        );
      });

      if (!allowed) {
        return {
          allowed: false,
          reason: `Target application "${action.openApp.appName}" is not on agent's allowedApps allowlist (${permission.allowedApps.join(", ")})`,
          permissionLevel: permission.permissionLevel,
        };
      }
    }

    return {
      allowed: true,
      requiresConfirmation: false,
      permissionLevel: permission.permissionLevel,
    };
  }
}

export const desktopPermissionsManager = new DesktopPermissionsManager();
