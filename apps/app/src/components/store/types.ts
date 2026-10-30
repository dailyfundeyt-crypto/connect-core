/**
 * Frontend Store Types (Lane 8)
 * Conforming to packages/contracts and Store backend API.
 */

import type { StoreItem } from "@connect/contracts/api";

export type StorePackageType = "mcp" | "tool" | "skill" | "company" | "agent";
export type StoreCategory = "agent" | "skill" | "mcp" | "template" | "plugin";

export interface StoreItemDetail extends StoreItem {
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

export interface StoreCategoryItem {
  id: string;
  label: string;
  count: number;
  description: string;
}
