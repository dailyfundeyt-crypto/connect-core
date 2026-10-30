import { launchPcAppPath, resolvePcAppPath } from "../pc-apps";
import type { AppAccountRecord, LaunchAccountResult } from "../types";

/**
 * "PC-App": kein isoliertes Profil, keine Vorschau - der Klick oeffnet einfach
 * das installierte Programm auf diesem Rechner. Pfad/Name stehen in metadata.
 */
export async function launchPcAppAccount(
  account: AppAccountRecord,
): Promise<LaunchAccountResult> {
  const meta = (account.metadata || {}) as Record<string, unknown>;
  const metaPath = typeof meta.path === "string" ? meta.path : undefined;
  const metaName = typeof meta.name === "string" ? meta.name : undefined;

  const target = resolvePcAppPath({
    path: metaPath,
    name: metaName || account.label,
  });
  const base = {
    app: account.app,
    accountId: account.id,
    label: account.label,
    dataDir: account.dataDir,
  };

  if (!target) {
    return {
      ...base,
      ok: false,
      message: `„${account.label}“ wurde auf diesem PC nicht gefunden. Beim Hinzufügen den Pfad zur .exe oder .lnk angeben.`,
    };
  }

  const result = launchPcAppPath(target);
  if (!result.ok) {
    return {
      ...base,
      ok: false,
      message:
        result.error || `„${account.label}“ konnte nicht gestartet werden.`,
    };
  }

  return {
    ...base,
    ok: true,
    pid: result.pid,
    message: `„${account.label}“ wurde auf dem PC geöffnet.`,
  };
}
