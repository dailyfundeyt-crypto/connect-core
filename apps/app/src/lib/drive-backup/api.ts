/** Browser side of /api/drive-backup (Settings › Sicherung, Onboarding-Schritt). */
export type DriveBackupStatus = {
  configured: boolean;
  redirectUri: string | null;
  connected: boolean;
  email: string | null;
  connectedAt: string | null;
  folderName: string;
  settings: { enabled: boolean; keep: number; keepDays: number; minIntervalMinutes: number; maxAgeHours: number };
  running: boolean;
  scheduler: "on" | "off" | "serverless";
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  lastFileName: string | null;
  lastSize: number | null;
  lastRows: number | null;
  lastTrigger: string | null;
  lastError: string | null;
  lastErrorAt: string | null;
  lastRestoreAt: string | null;
  lastRestoreInfo: string | null;
  keyFingerprint: string;
  localDir: string | null;
};

export type DriveBackupFile = {
  id: string;
  name: string;
  size?: string;
  createdTime?: string;
  appProperties?: Record<string, string>;
};

export const RESTORE_CONFIRMATION = "WIEDERHERSTELLEN";

async function call<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const response = await fetch(`/api/drive-backup${path}`, {
    method: init.method ?? "GET",
    credentials: "include",
    headers: init.body === undefined ? undefined : { "content-type": "application/json" },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const json = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(json.error ?? `Sicherung: HTTP ${response.status}`);
  return json;
}

export const fetchDriveBackupStatus = () => call<DriveBackupStatus>("/status");
export const runDriveBackup = () => call<{ ok: true; status: DriveBackupStatus; trashed: number }>("/run", { method: "POST" });
export const listDriveBackups = () => call<{ backups: DriveBackupFile[] }>("/backups").then((r) => r.backups);
export const disconnectDriveBackup = () => call<DriveBackupStatus>("/disconnect", { method: "POST" });
export const saveDriveBackupSettings = (patch: Partial<DriveBackupStatus["settings"]>) =>
  call<DriveBackupStatus>("/settings", { method: "PUT", body: patch });
export const restoreDriveBackup = (fileId: string, confirm: string) =>
  call<{ ok: true; safetyCopy: string | null; brainDir: string | null; brainFiles: number; restored: { tables: number; rows: number } }>(
    "/restore",
    { method: "POST", body: { fileId, confirm } },
  );

/** Leaves Connect for Google's consent screen; Google sends the browser back to `returnTo`. */
export async function connectGoogleDrive(returnTo: "settings" | "onboarding"): Promise<void> {
  const { url } = await call<{ url: string }>("/oauth/start", { method: "POST", body: { returnTo } });
  window.location.assign(url);
}

export function formatBytes(n: number | null | undefined): string {
  if (!n && n !== 0) return "–";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1).replace(".", ",")} KB`;
  return `${(n / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;
}

export function formatWhen(iso: string | null | undefined): string {
  if (!iso) return "–";
  return new Date(iso).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" });
}
