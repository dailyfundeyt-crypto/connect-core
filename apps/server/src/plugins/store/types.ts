/**
 * Store Types (Lane 8)
 * Conforming to Swarm-v2 Canonical Store Item Schema and Manifests.
 */

import type { StoreItem } from "@connect/contracts/api";

export type StorePackageType = "mcp" | "tool" | "skill" | "company" | "agent";
export type StoreCategory = "agent" | "skill" | "mcp" | "template" | "plugin";

export interface StorePricing {
  type: "free" | "buy" | "rent" | "subscription";
  price?: string;
  period?: "Tag" | "Woche" | "Monat" | "Jahr";
  label?: string;
}

export interface StoreManifest {
  id: string;
  name: string;
  displayName: string;
  version: string;
  type: StorePackageType;
  category?: StoreCategory;
  description: string;
  author: string;
  entryPoint: string;
  permissions: string[];
  icon?: string;
  tags?: string[];
  pricing?: StorePricing;
  screenshots?: string[];
  configSchema?: Record<string, unknown>;
  hash?: string;
  signature?: string;
}

export interface StoreItemDetail extends Omit<StoreItem, "isInstalled"> {
  isInstalled?: boolean;
  itemType: StorePackageType;
  pricingType: string;
  price?: string;
  badge?: string;
  tags: string[];
  screenshots: string[];
  permissionsRequired: string[];
  entryPoint?: string;
  isVerified: boolean;
  autoStart?: boolean;
  installedCompanyIds: string[];
  versions?: StoreVersionSummary[];
  reviews?: StoreReviewSummary[];
}

export interface StoreVersionSummary {
  id: string;
  version: string;
  changelog?: string;
  packageHash: string;
  signature?: string;
  createdAt: string;
}

export interface StoreReviewSummary {
  id: string;
  userId: string;
  userName: string;
  rating: number;
  comment: string;
  createdAt: string;
}

export interface StoreInstallInfo {
  id: string;
  itemId: string;
  versionId: string;
  companyId: string;
  installedBy: string;
  permissions: string[];
  status: "active" | "disabled" | "uninstalled";
  autoStart: boolean;
  installedAt: string;
  updatedAt: string;
}
