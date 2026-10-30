/**
 * Conductor Kill-Switch Evaluator & Controller.
 *
 * Checks both database / runtime configuration and process environment variables:
 * - CONNECT_CONDUCTOR="off"
 * - CONNECT_CONDUCTOR_KILL_SWITCH="1" | "true"
 * - config.killSwitch === true
 * - config.enabled === false
 *
 * When engaged:
 * - No new task claims are allowed.
 * - No task transfers or handoffs are allowed.
 * - In-flight processes are NOT forcefully terminated.
 */

import type { ConductorConfig } from "../contracts/conductor/types";

export class ConductorKillSwitchActiveError extends Error {
  constructor(public readonly reason: string) {
    super(`Conductor Kill-Switch is ACTIVE (${reason}). Claims and handoffs are blocked.`);
    this.name = "ConductorKillSwitchActiveError";
  }
}

export interface KillSwitchStatus {
  engaged: boolean;
  reason?: string;
  source?: "env" | "config";
}

export function evaluateKillSwitch(config?: Partial<ConductorConfig>): KillSwitchStatus {
  const envVal = process.env.CONNECT_CONDUCTOR?.trim().toLowerCase();
  if (envVal === "off" || envVal === "0" || envVal === "false") {
    return {
      engaged: true,
      reason: "Environment variable CONNECT_CONDUCTOR is set to 'off'",
      source: "env",
    };
  }

  const envKillSwitch = process.env.CONNECT_CONDUCTOR_KILL_SWITCH?.trim().toLowerCase();
  if (envKillSwitch === "1" || envKillSwitch === "true" || envKillSwitch === "on") {
    return {
      engaged: true,
      reason: "Environment variable CONNECT_CONDUCTOR_KILL_SWITCH is enabled",
      source: "env",
    };
  }

  if (config) {
    if (config.killSwitch === true) {
      return {
        engaged: true,
        reason: "Conductor configuration killSwitch is set to true",
        source: "config",
      };
    }
    if (config.enabled === false) {
      return {
        engaged: true,
        reason: "Conductor configuration enabled is set to false",
        source: "config",
      };
    }
  }

  return { engaged: false };
}

export function isKillSwitchEngaged(config?: Partial<ConductorConfig>): boolean {
  return evaluateKillSwitch(config).engaged;
}

export function assertConductorActive(config?: Partial<ConductorConfig>): void {
  const status = evaluateKillSwitch(config);
  if (status.engaged) {
    throw new ConductorKillSwitchActiveError(status.reason ?? "kill switch engaged");
  }
}
