/**
 * Types and Contracts for Connect Store v06
 * Consumes: contracts/v06/store.ts, docs/v06/store-manifest.md
 */

import type { StoreKind, StoreListingStatus, StoreListing, InstallReq } from "@/contracts/v06/store";

export type { StoreKind, StoreListingStatus, StoreListing, InstallReq };

// TODO-CONTRACT: Request addition to contracts/v06/store.ts
export type PackagePermission =
  | "network:outbound"
  | "filesystem:read"
  | "filesystem:write"
  | "mcp:access"
  | "channel:read"
  | "channel:post"
  | "agent:execute"
  | "company:manage";

export interface PermissionDefinition {
  id: PackagePermission;
  label: string;
  description: string;
  risk: "low" | "medium" | "high";
}

export const PERMISSION_DEFINITIONS: Record<PackagePermission, PermissionDefinition> = {
  "network:outbound": {
    id: "network:outbound",
    label: "Netzwerkzugriff (Ausgehend)",
    description: "Erlaubt ausgehende HTTP- und WebSocket-Verbindungen zu externen Diensten.",
    risk: "low",
  },
  "filesystem:read": {
    id: "filesystem:read",
    label: "Dateisystem lesen",
    description: "Erlaubt das Lesen von Dateien im aktiven Workspace.",
    risk: "medium",
  },
  "filesystem:write": {
    id: "filesystem:write",
    label: "Dateisystem schreiben",
    description: "Erlaubt das Erstellen und Ändern von Dateien im Workspace.",
    risk: "high",
  },
  "mcp:access": {
    id: "mcp:access",
    label: "MCP-Server Zugriff",
    description: "Zugriff auf konfigurierte Model Context Protocol Server und Werkzeuge.",
    risk: "medium",
  },
  "channel:read": {
    id: "channel:read",
    label: "Kanäle lesen",
    description: "Lesen von Nachrichten in Unterhaltungen und Firmenkanälen.",
    risk: "medium",
  },
  "channel:post": {
    id: "channel:post",
    label: "Nachrichten senden",
    description: "Senden von Antworten und Beiträgen im Namen des Agenten.",
    risk: "medium",
  },
  "agent:execute": {
    id: "agent:execute",
    label: "Agenten / CLI ausführen",
    description: "Starten von CLI-Prozessen und Sub-Agenten im Terminal.",
    risk: "high",
  },
  "company:manage": {
    id: "company:manage",
    label: "Firma verwalten",
    description: "Ändern von Firmenkonfigurationen, Vorlagen und Tool-Zuweisungen.",
    risk: "high",
  },
};

/** Alle Berechtigungen, die der Publish-Wizard anbietet – in der Reihenfolge der Definition. */
export const KNOWN_PERMISSIONS = Object.keys(PERMISSION_DEFINITIONS) as PackagePermission[];

export interface ConnectPackageAuthor {
  name: string;
  handle?: string;
  email?: string;
  url?: string;
}

export interface ConnectPackageManifest {
  $schema?: string;
  schemaVersion?: "1.0" | string;
  kind: StoreKind;
  slug: string;
  name: string;
  version: string;
  summary: string;
  description: string;
  author: ConnectPackageAuthor | string;
  icon?: string;
  screenshots?: string[];
  entry?: string;
  permissions: PackagePermission[];
  priceCents: 0;
  installSpec: Record<string, unknown>;
  tags?: string[];
  minConnectVersion?: string;
}

export type StoreSortOption = "popular" | "newest" | "alphabetical";

export interface StoreInstallRecord {
  id: string;
  listingId: string;
  companyId: string;
  version: string;
  installedBy: string;
  installedAt: string;
  status: "active" | "uninstalled" | "error";
  permissionsAccepted: string[];
  metadata?: Record<string, unknown>;
}

export interface InstallResult {
  ok: boolean;
  listingId?: string;
  companyId?: string;
  kind?: StoreKind;
  version?: string;
  requireConfirmation?: boolean;
  permissions?: PackagePermission[];
  permissionsAccepted?: string[];
  installedItem?: unknown;
  message?: string;
  error?: string;
}

export interface ReviewResult {
  ok: boolean;
  listing?: StoreListing;
  error?: string;
}

export interface UploadResult {
  ok: boolean;
  listing?: StoreListing;
  version?: unknown;
  packageHash?: string;
  packagePath?: string;
  error?: string;
  details?: string[];
}
