/**
 * Types for Conductor Supervisor & Failover Monitoring (Lane 5)
 * Aligned with apps/server/src/contracts/conductor/
 */

import type { CliKind } from "@/components/usage/types";

export type FailureClass =
  | "quota"
  | "auth"
  | "network"
  | "task"
  | "unknown";

export type RuntimeState =
  | "available"
  | "cooldown"
  | "unavailable"
  | "auth_error"
  | "paused";

export interface ConductorRuntimeStatus {
  runtimeId: string;
  cliKind: CliKind;
  accountId: string;
  state: RuntimeState;
  lastFailureClass?: FailureClass | null;
  cooldownUntil?: string | null;
  lastProbeAt?: string | null;
  consecutiveFailures?: number;
  activeClaimsCount?: number;
  updatedAt?: string;
}

export interface ConductorConfig {
  enabled: boolean;
  killSwitch: boolean;
  primary: CliKind;
  standby: CliKind;
  cooldownMin: number;
  pollSec: number;
  initialPollSec: number;
  maxHandoffsPerTask: number;
  paidApiFallback: false;
  updatedAt?: string;
}

export interface Checkpoint {
  id: string;
  swarmTaskId: string;
  fromRuntime: string;
  summary: string;
  filesTouched: string[];
  nextSteps: string;
  createdAt: string;
}

export type TransferStatus =
  | "pending"
  | "in_progress"
  | "completed"
  | "failed";

export interface Transfer {
  id: string;
  swarmTaskId: string;
  transferKey: string;
  fromRuntime: string;
  toRuntime: string;
  checkpointId?: string | null;
  reason: string;
  status: TransferStatus;
  createdAt: string;
}

export type ConductorEventSeverity = "info" | "warn" | "error" | "critical";

export interface ConductorEvent {
  id: string;
  taskId?: string | null;
  eventType: string;
  severity: ConductorEventSeverity;
  message: string;
  payload?: Record<string, unknown> | null;
  createdAt: string;
}

export interface ConductorStatusResponse {
  success: boolean;
  config: ConductorConfig;
  runtimes: ConductorRuntimeStatus[];
  activeTransfers: Transfer[];
  recentEvents: ConductorEvent[];
  isPaused: boolean;
  activeKillSwitch: boolean;
}
