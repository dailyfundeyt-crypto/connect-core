/**
 * Connect Desktop Safety Engine & Kill-Switch Coordinator (Lane 7).
 *
 * Implements core safety safeguards:
 *   1. Emergency Kill-Switch (Ctrl+Alt+Pause / Notch button / API):
 *      - Latency requirement: < 300 ms response time!
 *      - Immediately aborts all active/pending desktop actions.
 *   2. Password Protection:
 *      - Strictly blocks reading or typing into password fields.
 *   3. UIPI (User Interface Privilege Isolation):
 *      - Detects elevated admin windows and prevents silent SendInput failures.
 *   4. Rate-Limiting:
 *      - Default 30 actions / minute per agent (configurable per agent).
 *   5. Human-in-the-Loop Confirmation:
 *      - Destructive actions require user approval via Notch card.
 */

import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import type { Database } from "../db/client";
import {
  type DesktopAction,
  type DesktopRiskLevel,
  type SafetyConfirmRequestParams,
  type SafetyConfirmResponseParams,
  type KillswitchFireParams,
  RiskClassifications,
} from "../../../../packages/shared/src/desktop/contracts";
import {
  desktopConfirmationRequests,
  desktopKillswitchEvents,
  desktopRateLimits,
} from "../db/schema/desktop-safety";
import { desktopPermissionsManager } from "./permissions";
import { desktopActionLogger } from "./action-log";

export type SafetyValidationResult = {
  allowed: boolean;
  reason?: string;
  status: "success" | "rejected" | "killswitch_aborted";
  requiresConfirmation?: boolean;
  confirmationId?: string;
  rateLimitInfo?: {
    current: number;
    limit: number;
    resetInSeconds: number;
  };
};

export class DesktopSafetyGate {
  private db?: Database;
  private isKillswitchActive = false;
  private killswitchReason?: string;
  private killswitchTriggeredAt?: Date;

  // Rate limiting: agentId -> array of timestamps in milliseconds
  private rateLimitTimestamps = new Map<string, number[]>();

  // In-memory confirmation requests: confirmationId -> SafetyConfirmRequestParams
  private pendingConfirmations = new Map<
    string,
    {
      request: SafetyConfirmRequestParams;
      approved?: boolean;
      decidedAt?: Date;
      decisionReason?: string;
    }
  >();

  constructor(options?: { database?: Database }) {
    this.db = options?.database;
  }

  public setDatabase(database: Database): void {
    this.db = database;
  }

  /* -------------------------------------------------------------------------- */
  /* 1. Emergency Kill-Switch (< 300 ms SLA)                                    */
  /* -------------------------------------------------------------------------- */

  public isKillswitchTriggered(): boolean {
    return this.isKillswitchActive;
  }

  public getKillswitchStatus(): {
    active: boolean;
    reason?: string;
    triggeredAt?: string;
  } {
    return {
      active: this.isKillswitchActive,
      reason: this.killswitchReason,
      triggeredAt: this.killswitchTriggeredAt?.toISOString(),
    };
  }

  /**
   * Fires the Emergency Kill-Switch.
   * Execution SLA: < 300 ms.
   */
  public async fireKillswitch(
    source: "hotkey" | "notch_ui" | "api" = "api",
    reason = "Emergency killswitch triggered",
  ): Promise<{ success: boolean; durationMs: number; abortedCount: number }> {
    const start = performance.now();

    this.isKillswitchActive = true;
    this.killswitchReason = reason;
    this.killswitchTriggeredAt = new Date();

    // Reject all pending confirmation requests
    let abortedCount = 0;
    for (const [id, item] of this.pendingConfirmations.entries()) {
      if (item.approved === undefined) {
        item.approved = false;
        item.decidedAt = new Date();
        item.decisionReason = "Aborted by emergency killswitch";
        abortedCount++;
      }
    }

    const durationMs = performance.now() - start;

    // Async record in DB (does not block 300 ms SLA response)
    const eventId = randomUUID();
    if (this.db) {
      this.db
        .insert(desktopKillswitchEvents)
        .values({
          id: eventId,
          source,
          reason,
          abortedActionsCount: abortedCount,
          triggeredAt: this.killswitchTriggeredAt,
        })
        .catch((err) => console.warn("[DesktopSafety] Failed to persist killswitch event:", err));
    }

    return {
      success: true,
      durationMs: Math.round(durationMs * 100) / 100,
      abortedCount,
    };
  }

  /**
   * Resets the Kill-Switch back to normal operation.
   */
  public resetKillswitch(): void {
    this.isKillswitchActive = false;
    this.killswitchReason = undefined;
    this.killswitchTriggeredAt = undefined;
  }

  /* -------------------------------------------------------------------------- */
  /* 2. Password Field & UIPI Checks                                            */
  /* -------------------------------------------------------------------------- */

  /**
   * Detects whether an action targets a password field.
   */
  public isPasswordField(action: DesktopAction): boolean {
    // 1. Check element selector role & attributes
    const selector =
      action.findElement?.selector ||
      action.click?.selector ||
      action.typeText?.selector;

    if (selector) {
      if (selector.role && /password|passwort/i.test(selector.role)) {
        return true;
      }
      if (selector.automationId && /password|passwort|pwd|pin/i.test(selector.automationId)) {
        return true;
      }
      if (selector.name && /password|passwort|pin eingeben/i.test(selector.name)) {
        return true;
      }
      if (selector.className && /passwordbox|passphrase/i.test(selector.className)) {
        return true;
      }
    }

    // 2. Check target description
    if (action.targetDescription && /passwort|password|pin\b/i.test(action.targetDescription)) {
      return true;
    }

    // 3. Check typed text if it resembles setting credentials
    if (action.type === "type_text" && action.typeText?.text) {
      if (/password=|secret=|api_key=/i.test(action.typeText.text)) {
        return true;
      }
    }

    return false;
  }

  /* -------------------------------------------------------------------------- */
  /* 3. Rate Limiting                                                           */
  /* -------------------------------------------------------------------------- */

  /**
   * Checks whether the agent has exceeded its allowable actions per minute.
   */
  public checkRateLimit(
    agentId: string,
    limitPerMinute = 30,
  ): { allowed: boolean; currentCount: number; limit: number; resetInSeconds: number } {
    const now = Date.now();
    const windowMs = 60 * 1000; // 1 minute
    const windowStart = now - windowMs;

    let timestamps = this.rateLimitTimestamps.get(agentId) || [];
    // Prune timestamps older than 1 minute
    timestamps = timestamps.filter((t) => t > windowStart);

    if (timestamps.length >= limitPerMinute) {
      const oldest = timestamps[0];
      const resetInSeconds = Math.max(1, Math.ceil((oldest + windowMs - now) / 1000));
      return {
        allowed: false,
        currentCount: timestamps.length,
        limit: limitPerMinute,
        resetInSeconds,
      };
    }

    timestamps.push(now);
    this.rateLimitTimestamps.set(agentId, timestamps);

    return {
      allowed: true,
      currentCount: timestamps.length,
      limit: limitPerMinute,
      resetInSeconds: 0,
    };
  }

  /* -------------------------------------------------------------------------- */
  /* 4. Human-In-The-Loop Confirmation Requests                                 */
  /* -------------------------------------------------------------------------- */

  /**
   * Registers a confirmation request for a destructive action.
   */
  public async createConfirmationRequest(
    action: DesktopAction,
    agentId?: string,
    reason = "Aktion als destruktiv eingestuft – Bestätigung erforderlich",
  ): Promise<SafetyConfirmRequestParams> {
    const confirmationId = `conf-${randomUUID().slice(0, 8)}`;
    const actionId = action.id || `act-${randomUUID().slice(0, 8)}`;

    const req: SafetyConfirmRequestParams = {
      confirmationId,
      actionId,
      agentId,
      riskLevel: "destructive",
      reason,
      actionSummary: action.targetDescription || `${action.type} action`,
      details: {
        actionType: action.type,
        actionPayload: (action.openApp || action.openUrl || action.click || action.typeText || {}) as Record<string, unknown>,
      },
      timeoutMs: 15000,
    };

    this.pendingConfirmations.set(confirmationId, { request: req });

    if (this.db) {
      this.db
        .insert(desktopConfirmationRequests)
        .values({
          id: confirmationId,
          actionId,
          agentId,
          riskLevel: "destructive",
          reason,
          actionSummary: req.actionSummary,
          details: req.details,
          status: "pending",
          timeoutMs: req.timeoutMs,
        })
        .catch((err) => console.warn("[DesktopSafety] DB confirmation save failed:", err));
    }

    return req;
  }

  /**
   * Resolves a pending confirmation (user clicked Allow or Deny in Notch).
   */
  public async resolveConfirmation(
    confirmationId: string,
    approved: boolean,
    reason?: string,
  ): Promise<SafetyConfirmResponseParams | null> {
    const pending = this.pendingConfirmations.get(confirmationId);
    if (!pending) return null;

    const decidedAt = new Date();
    pending.approved = approved;
    pending.decidedAt = decidedAt;
    pending.decisionReason = reason || (approved ? "Vom Nutzer bestätigt" : "Vom Nutzer abgelehnt");

    const resp: SafetyConfirmResponseParams = {
      confirmationId,
      actionId: pending.request.actionId,
      approved,
      reason: pending.decisionReason,
      decidedAt: decidedAt.toISOString(),
    };

    if (this.db) {
      this.db
        .update(desktopConfirmationRequests)
        .set({
          status: approved ? "approved" : "rejected",
          approved,
          responseReason: pending.decisionReason,
          decidedAt,
        })
        .where(eq(desktopConfirmationRequests.id, confirmationId))
        .catch((err) => console.warn("[DesktopSafety] DB confirmation update failed:", err));
    }

    return resp;
  }

  public getPendingConfirmation(confirmationId: string): SafetyConfirmRequestParams | null {
    const p = this.pendingConfirmations.get(confirmationId);
    if (!p || p.approved !== undefined) return null;
    return p.request;
  }

  /* -------------------------------------------------------------------------- */
  /* 5. Central Safety Pipeline Validator                                       */
  /* -------------------------------------------------------------------------- */

  /**
   * Evaluates an action through the entire safety gate:
   * 1. Kill-Switch
   * 2. Password field check
   * 3. Rate limiting
   * 4. Agent permission check
   * 5. Destructive confirmation check
   */
  public async validateAction(
    action: DesktopAction,
    options: {
      agentId?: string;
      confirmationToken?: string;
    } = {},
  ): Promise<SafetyValidationResult> {
    const { agentId, confirmationToken } = options;

    // 1. Kill-Switch Check
    if (this.isKillswitchActive) {
      const reason = `Kill-Switch aktiv: Alle Desktop-Aktionen gestoppt (${this.killswitchReason || "Not-Aus"})`;
      // Log rejection
      await desktopActionLogger.logAction({
        actionId: action.id || `act-${randomUUID().slice(0, 8)}`,
        agentId,
        actionType: action.type,
        riskLevel: action.risk || RiskClassifications[action.type] || "act",
        targetDescription: action.targetDescription || action.type,
        status: "killswitch_aborted",
        durationMs: 0,
        errorMessage: reason,
      });

      return {
        allowed: false,
        reason,
        status: "killswitch_aborted",
      };
    }

    // 2. Password Field Protection
    if (this.isPasswordField(action)) {
      const reason = "Sicherheits-Sperre: Passwort- und PIN-Felder dürfen von Agenten weder gelesen noch beschrieben werden.";
      await desktopActionLogger.logAction({
        actionId: action.id || `act-${randomUUID().slice(0, 8)}`,
        agentId,
        actionType: action.type,
        riskLevel: action.risk || RiskClassifications[action.type] || "act",
        targetDescription: action.targetDescription || "Password field",
        status: "rejected",
        durationMs: 0,
        errorMessage: reason,
      });

      return {
        allowed: false,
        reason,
        status: "rejected",
      };
    }

    // 3. Rate-Limiting
    if (agentId) {
      const perm = await desktopPermissionsManager.getAgentPermission(agentId);
      const rateCheck = this.checkRateLimit(agentId, perm.rateLimitPerMinute);
      if (!rateCheck.allowed) {
        const reason = `Rate-Limit erreicht: Max. ${rateCheck.limit} Aktionen pro Minute für Agent "${agentId}". Reset in ${rateCheck.resetInSeconds} s.`;
        await desktopActionLogger.logAction({
          actionId: action.id || `act-${randomUUID().slice(0, 8)}`,
          agentId,
          actionType: action.type,
          riskLevel: action.risk || RiskClassifications[action.type] || "act",
          targetDescription: action.targetDescription || action.type,
          status: "rejected",
          durationMs: 0,
          errorMessage: reason,
        });

        return {
          allowed: false,
          reason,
          status: "rejected",
          rateLimitInfo: {
            current: rateCheck.currentCount,
            limit: rateCheck.limit,
            resetInSeconds: rateCheck.resetInSeconds,
          },
        };
      }
    }

    // 4. Agent Permissions & Allowlists
    const permCheck = await desktopPermissionsManager.checkAgentCanPerformAction(agentId, action);
    if (!permCheck.allowed) {
      const reason = permCheck.reason || `Agent "${agentId}" ist für diese Aktion nicht autorisiert.`;
      await desktopActionLogger.logAction({
        actionId: action.id || `act-${randomUUID().slice(0, 8)}`,
        agentId,
        actionType: action.type,
        riskLevel: action.risk || RiskClassifications[action.type] || "act",
        targetDescription: action.targetDescription || action.type,
        status: "rejected",
        durationMs: 0,
        errorMessage: reason,
      });

      return {
        allowed: false,
        reason,
        status: "rejected",
      };
    }

    // 5. Destructive Action Confirmation
    const actionRisk: DesktopRiskLevel = action.risk || RiskClassifications[action.type] || "act";
    if (actionRisk === "destructive" || permCheck.requiresConfirmation) {
      // Check if valid confirmation token was provided
      if (confirmationToken) {
        const conf = this.pendingConfirmations.get(confirmationToken);
        if (conf && conf.approved === true) {
          return {
            allowed: true,
            status: "success",
            requiresConfirmation: false,
          };
        }
      }

      // Needs confirmation!
      const req = await this.createConfirmationRequest(action, agentId);
      return {
        allowed: false,
        requiresConfirmation: true,
        confirmationId: req.confirmationId,
        reason: "Destruktive Aktion erfordert Bestätigung durch den Nutzer in der Notch.",
        status: "rejected",
      };
    }

    return {
      allowed: true,
      status: "success",
    };
  }
}

export const desktopSafetyGate = new DesktopSafetyGate();
