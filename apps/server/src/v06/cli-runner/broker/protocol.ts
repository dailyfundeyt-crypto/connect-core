/**
 * CLI-Broker Protokoll-Definitionen für Connect v06.
 * Kommunikationsprotokoll zwischen dem erhöhten Connect-Server und dem
 * nicht-erhöhten Benutzer-CLI-Broker auf 127.0.0.1.
 */

import { homedir } from "node:os";
import { join } from "node:path";

export const DEFAULT_BROKER_PORT = 5210;
export const DEFAULT_BROKER_HOST = "127.0.0.1";

export interface BrokerInfo {
  port: number;
  token: string;
  pid: number;
  startedAt: string;
  elevated: boolean;
  host: string;
}

export type ClientMessage =
  | { type: "auth"; token: string }
  | {
      type: "spawn";
      id: string;
      cmd: string;
      args: string[];
      cwd: string;
      env?: Record<string, string>;
      cols?: number;
      rows?: number;
      usePty?: boolean;
    }
  | { type: "write"; id: string; data: string }
  | { type: "resize"; id: string; cols: number; rows: number }
  | { type: "kill"; id: string; signal?: string }
  | { type: "ping" };

export type BrokerMessage =
  | { type: "auth_ack"; ok: boolean; error?: string }
  | {
      type: "spawn_ack";
      id: string;
      pid: number | null;
      mode: "pty" | "pipe";
      error?: string;
    }
  | { type: "data"; id: string; data: string }
  | { type: "exit"; id: string; exitCode: number | null; signal?: string }
  | { type: "error"; id?: string; message: string }
  | { type: "pong" };

export function getBrokerDir(): string {
  const base = process.env.USERPROFILE || homedir();
  return join(base, ".connect-cli-broker");
}

export function getBrokerInfoPath(): string {
  return join(getBrokerDir(), "broker.json");
}

export function getBrokerTokenPath(): string {
  return join(getBrokerDir(), "token");
}

export function encodeMessage(msg: ClientMessage | BrokerMessage): string {
  return JSON.stringify(msg);
}

export function decodeMessage<T = ClientMessage | BrokerMessage>(raw: string): T {
  try {
    return JSON.parse(raw) as T;
  } catch (err) {
    throw new Error(`Ungültige Protokollnachricht: ${String(err)}`);
  }
}

export function isClientMessage(m: unknown): m is ClientMessage {
  if (typeof m !== "object" || m === null) return false;
  const type = (m as { type?: unknown }).type;
  return (
    type === "auth" ||
    type === "spawn" ||
    type === "write" ||
    type === "resize" ||
    type === "kill" ||
    type === "ping"
  );
}

export function isBrokerMessage(m: unknown): m is BrokerMessage {
  if (typeof m !== "object" || m === null) return false;
  const type = (m as { type?: unknown }).type;
  return (
    type === "auth_ack" ||
    type === "spawn_ack" ||
    type === "data" ||
    type === "exit" ||
    type === "error" ||
    type === "pong"
  );
}
