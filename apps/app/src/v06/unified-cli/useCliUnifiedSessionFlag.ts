/** Runtime gate for the unified CLI feature.
 *
 * Vite does not expose the server's CONNECT_FLAGS_V06 environment value to
 * browser bundles. Read the server-owned flag once instead of treating the
 * frontend default as the runtime configuration.
 */
import { useEffect, useState } from "react";
import { API_PATHS_V06 } from "@/contracts/v06/api-paths";
import { type FlagV06Key, getFlag } from "@/contracts/v06/flags";

type RuntimeFlags = Partial<Record<FlagV06Key, boolean>>;

export function useCliUnifiedSessionFlag(): boolean {
  const [enabled, setEnabled] = useState(() => getFlag("cliUnifiedSession"));

  useEffect(() => {
    let active = true;
    void fetch(API_PATHS_V06.flags, { credentials: "include", cache: "no-store" })
      .then(async (response) => (response.ok ? await response.json() : null))
      .then((flags: RuntimeFlags | null) => {
        if (!active || !flags || typeof flags.cliUnifiedSession !== "boolean") return;
        (window as typeof window & { __CONNECT_FLAGS_V06?: RuntimeFlags }).__CONNECT_FLAGS_V06 = flags;
        setEnabled(flags.cliUnifiedSession);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  return enabled;
}
