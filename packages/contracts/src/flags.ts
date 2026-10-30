import { z } from "zod";

/**
 * Feature Flags for Swarm-v2 Lanes
 * All flags default to true, can be toggled off individually.
 */

export const FeatureFlagsSchema = z.object({
  sidebarV2: z.boolean().default(true),
  focusV2: z.boolean().default(true),
  darkDefault: z.boolean().default(true),
  brainOverview: z.boolean().default(true),
  settingsV2: z.boolean().default(true),
  social2: z.boolean().default(true),
  swarmProjects: z.boolean().default(true),
  mobileV2: z.boolean().default(true),
  store2: z.boolean().default(true),
  onboardingV2: z.boolean().default(true),
  mcpGrants: z.boolean().default(true),
});

export type FeatureFlags = z.infer<typeof FeatureFlagsSchema>;

export const DEFAULT_FEATURE_FLAGS: FeatureFlags = {
  sidebarV2: true,
  focusV2: true,
  darkDefault: true,
  brainOverview: true,
  settingsV2: true,
  social2: true,
  swarmProjects: true,
  mobileV2: true,
  store2: true,
  onboardingV2: true,
  mcpGrants: true,
};

export type FeatureFlagKey = keyof FeatureFlags;

/**
 * Checks whether a feature flag is enabled.
 * Accepts optional runtime overrides (e.g. from environment or user settings).
 */
export function isFeatureEnabled(
  flag: FeatureFlagKey,
  overrides?: Partial<FeatureFlags>,
): boolean {
  if (overrides && typeof overrides[flag] === "boolean") {
    return overrides[flag] as boolean;
  }
  return DEFAULT_FEATURE_FLAGS[flag];
}
