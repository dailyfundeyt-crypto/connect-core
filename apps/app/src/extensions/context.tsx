import {
  IconBolt,
  IconBrain,
  IconChartBar,
  IconRocket,
  type Icon as TablerIcon,
} from "@tabler/icons-react";
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  getExtensions,
  setExtensionEnabled,
  subscribeExtensions,
} from "./storage";
import type { ExtensionKey, ExtensionsState, TablerIconName } from "./types";

/**
 * Erweiterungs-Context.
 *
 * Bietet:
 * - `useExtensionEnabled(key)` — boolean
 * - `useExtensions()` — kompletter State
 * - `useSetExtension()` — setter
 * - `<ExtensionGate extension="spark" fallback={...}>` — Conditional Render
 *
 * Wir nutzen Context + Pub/Sub. So können imperative Codepfade (außerhalb
 * React) den Storage direkt manipulieren, ohne React-Komponenten neu zu
 * mounten.
 */

const ICON_MAP: Record<TablerIconName, TablerIcon> = {
  IconBolt: IconBolt,
  IconRocket: IconRocket,
  IconBrain: IconBrain,
  IconChartBar: IconChartBar,
};

export function resolveExtensionIcon(name: TablerIconName): TablerIcon {
  return ICON_MAP[name];
}

type ExtensionsContextValue = {
  state: ExtensionsState;
  setEnabled: (key: ExtensionKey, enabled: boolean) => void;
};

const ExtensionsContext = createContext<ExtensionsContextValue | null>(null);

export function ExtensionsProvider({ children }: { children: ReactNode }) {
  // Initiales State aus dem Storage lesen — synchron, damit der erste
  // Render den richtigen Wert hat und kein „deaktiviert"-Flash entsteht.
  const [state, setState] = useState<ExtensionsState>(() => getExtensions());

  useEffect(() => {
    return subscribeExtensions(() => setState(getExtensions()));
  }, []);

  const value = useMemo<ExtensionsContextValue>(
    () => ({
      state,
      setEnabled: (key, enabled) => {
        setState(setExtensionEnabled(key, enabled));
      },
    }),
    [state],
  );

  return <ExtensionsContext value={value}>{children}</ExtensionsContext>;
}

function useExtensionsContext(): ExtensionsContextValue {
  const ctx = useContext(ExtensionsContext);
  if (!ctx) {
    throw new Error(
      "useExtensions* muss innerhalb von <ExtensionsProvider> verwendet werden.",
    );
  }
  return ctx;
}

export function useExtensions(): ExtensionsState {
  return useExtensionsContext().state;
}

export function useExtensionEnabled(key: ExtensionKey): boolean {
  return useExtensionsContext().state[key];
}

export function useSetExtension(): (
  key: ExtensionKey,
  enabled: boolean,
) => void {
  return useExtensionsContext().setEnabled;
}

/**
 * Bedingtes Rendering basierend auf Erweiterungs-Status.
 *
 * - `fallback` (default `null`) wird gezeigt, wenn die Erweiterung AUS ist.
 * - Wenn `keepMounted` true ist, bleibt die Komponente im Baum, kriegt aber
 *   `aria-hidden` und `pointer-events: none`. Nützlich, wenn das Mounten
 *   teuer ist (z. B. Tiptap-Editor).
 */
export function ExtensionGate({
  extension,
  children,
  fallback = null,
  keepMounted = false,
}: {
  extension: ExtensionKey;
  children: ReactNode;
  fallback?: ReactNode;
  keepMounted?: boolean;
}) {
  const enabled = useExtensionEnabled(extension);
  if (enabled) return <>{children}</>;
  if (keepMounted) {
    return (
      <div aria-hidden style={{ pointerEvents: "none" }}>
        {fallback}
      </div>
    );
  }
  return <>{fallback}</>;
}
