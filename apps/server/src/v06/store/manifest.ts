/**
 * Connect Store Package Manifest (v06)
 * Definitionen fuer Pakete, Manifest-Strukturen und Berechtigungen.
 */

import type { StoreKind, StoreListingStatus, StoreListing, InstallReq } from "../../contracts/v06/store";

export type { StoreKind, StoreListingStatus, StoreListing, InstallReq };

export const VALID_STORE_KINDS: readonly StoreKind[] = ["mcp", "tool", "skill", "company"] as const;

export const VALID_LISTING_STATUSES: readonly StoreListingStatus[] = [
  "draft",
  "review",
  "published",
  "rejected",
] as const;

export type PackagePermission =
  | "network:outbound"
  | "filesystem:read"
  | "filesystem:write"
  | "mcp:access"
  | "channel:read"
  | "channel:post"
  | "agent:execute"
  | "company:manage";

export const KNOWN_PERMISSIONS: readonly PackagePermission[] = [
  "network:outbound",
  "filesystem:read",
  "filesystem:write",
  "mcp:access",
  "channel:read",
  "channel:post",
  "agent:execute",
  "company:manage",
] as const;

export interface ConnectPackageAuthor {
  name: string;
  handle?: string;
  email?: string;
  url?: string;
}

export interface ConnectPackageManifest {
  $schema?: string;
  schemaVersion?: string;
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
  priceCents: number;
  installSpec: Record<string, any>;
  tags?: string[];
  minConnectVersion?: string;
}

export interface StoreVersion {
  id: string;
  listingId: string;
  version: string;
  packageHash: string;
  packagePath: string;
  manifest: ConnectPackageManifest;
  status: StoreListingStatus;
  changelog?: string;
  createdAt: string;
}

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

// Slug-Prüfung: Kleinbuchstaben, Ziffern, Bindestriche
const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function isValidSlug(slug: string): boolean {
  if (!slug || typeof slug !== "string") return false;
  if (slug.length < 2 || slug.length > 64) return false;
  return SLUG_REGEX.test(slug);
}

// Einfache, robuste SemVer-Prüfung (z. B. 1.0.0 oder 1.0.0-beta.1)
const SEMVER_REGEX = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

export function isValidSemver(version: string): boolean {
  if (!version || typeof version !== "string") return false;
  return SEMVER_REGEX.test(version.trim());
}
