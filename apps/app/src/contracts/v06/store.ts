/** Contract v06 – Änderungen nur durch A00/Integrator */

export type StoreKind = "mcp" | "tool" | "skill" | "company";

export type StoreListingStatus = "draft" | "review" | "published" | "rejected";

export type PackagePermission =
  | "network:outbound"
  | "filesystem:read"
  | "filesystem:write"
  | "mcp:access"
  | "channel:read"
  | "channel:post"
  | "agent:execute"
  | "company:manage";

export interface StoreListing {
  id: string;
  kind: StoreKind;
  slug: string;
  name: string;
  version: string;
  authorId: string;
  iconUrl: string;
  screenshots: string[];
  summary: string;
  description: string;
  installSpec: unknown;
  priceCents: number;
  status: StoreListingStatus;
}

export interface InstallReq {
  listingId: string;
  targetCompanyId: string;
  confirmPermissions?: boolean;
  acceptedPermissions?: string[];
}
