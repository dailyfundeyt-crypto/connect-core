export type SupportedApp = "codex" | "antigravity" | "manus" | string;

export interface AppAccountRecord {
  id: string;
  companyId?: string | null;
  userId: string;
  app: string;
  provider: string;
  label: string;
  accountName: string;
  email?: string | null;
  avatarUrl?: string | null;
  dataDir: string;
  isActive: boolean;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface CreateAccountInput {
  companyId?: string | null;
  userId?: string;
  app: string;
  label: string;
  email?: string;
  metadata?: Record<string, unknown>;
}

export interface LaunchAccountResult {
  ok: boolean;
  app: string;
  accountId: string;
  label: string;
  dataDir: string;
  pid?: number;
  message?: string;
  /** helium-appcast: Instanz laeuft mit Debug-Port, Live-Vorschau moeglich. */
  preview?: boolean;
  debugPort?: number;
  /** Laeuft schon ohne Vorschau; Neustart nur nach Klick. */
  needsRestart?: boolean;
}
