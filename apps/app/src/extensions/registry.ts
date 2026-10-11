import type { ExtensionKey, ExtensionManifest } from "./types";

/**
 * Zentrale Liste der Erweiterungen.
 *
 * Reihenfolge = Reihenfolge in der Settings-UI. Wenn du eine Erweiterung
 * hinzufügst: hier registrieren, in `types.ts` den Key + Icon ergänzen,
 * und in `context.tsx` das Icon-Mapping erweitern.
 *
 * Niemals einen bestehenden `key` umbenennen — Storage-Werte haften daran.
 */
export const EXTENSION_REGISTRY: readonly ExtensionManifest[] = [
  {
    key: "flux",
    label: "Flux",
    description: "Live-Stream und Hooks für laufende Aufgaben.",
    iconName: "IconBolt",
    defaultEnabled: true,
    schemaVersion: 1,
  },
  {
    key: "hyper",
    label: "Hyper",
    description: "Schnellere Workflows und Batch-Operationen.",
    iconName: "IconRocket",
    defaultEnabled: true,
    schemaVersion: 1,
  },
  {
    key: "spark",
    label: "Spark",
    description:
      "Wissensmodul: Notizen mit Bildern und Tabellen, lokal als Markdown.",
    iconName: "IconBrain",
    defaultEnabled: true,
    schemaVersion: 1,
  },
  {
    key: "analysis",
    label: "Analysis",
    description: "Berichte, Auswertungen und Verlaufs-Ansichten.",
    iconName: "IconChartBar",
    defaultEnabled: true,
    schemaVersion: 1,
  },
] as const;

const REGISTRY_BY_KEY: Record<ExtensionKey, ExtensionManifest> =
  EXTENSION_REGISTRY.reduce(
    (acc, item) => {
      acc[item.key] = item;
      return acc;
    },
    {} as Record<ExtensionKey, ExtensionManifest>,
  );

export function getExtension(key: ExtensionKey): ExtensionManifest {
  const manifest = REGISTRY_BY_KEY[key];
  if (!manifest) {
    throw new Error(`Unbekannte Erweiterung: ${key}`);
  }
  return manifest;
}

export function listExtensions(): readonly ExtensionManifest[] {
  return EXTENSION_REGISTRY;
}
