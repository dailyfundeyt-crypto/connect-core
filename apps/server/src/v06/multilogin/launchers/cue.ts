import type { CastLaunchResult, CastSpec } from "../../../cli-bridge/accounts/app-cast";
import type { AppAccountRecord, LaunchAccountResult } from "../../../cli-bridge/accounts/types";

/**
 * Cue Launcher Stub:
 * Wartet auf Bestaetigung von Stefan bzgl. Produkt, Startart (Web/Desktop) und Authentifizierung.
 * Ist standardmaessig inaktiv (enabled: false) und kann nicht gestartet werden.
 */
export function cueCastSpec(_account: AppAccountRecord): CastSpec | null {
  return null;
}

export async function launchCueAccount(
  account: AppAccountRecord,
  _options: { restart?: boolean } = {},
): Promise<LaunchAccountResult | CastLaunchResult> {
  return {
    ok: false,
    app: "cue",
    accountId: account.id,
    label: account.label,
    dataDir: account.dataDir,
    preview: false,
    message: "Cue ist derzeit noch nicht freigegeben oder konfiguriert (Wartet auf Bestaetigung von Stefan bzgl. Desktop vs. Web).",
  };
}
