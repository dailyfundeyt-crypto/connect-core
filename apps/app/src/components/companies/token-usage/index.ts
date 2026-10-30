/**
 * Firmenprofil-Widget „Token-Verbrauch (30 Tage)“ — öffentliche Fassade (Lane A35).
 *
 * Einbau durch A39 in `apps/app/src/components/companies/company-profile-x.tsx`:
 *
 *   import { CompanyTokenUsageSection } from "@/components/companies/token-usage";
 *   <CompanyTokenUsageSection companyId={company.id} isAdmin={isCompanyAdmin} />
 */

export {
  PUBLIC_USAGE_ALLOWLIST,
  PUBLIC_USAGE_PROVIDER_ALLOWLIST,
  toPublicUsage,
  toVisibilitySettings,
} from "./allowlist";
export {
  loadPublicUsage,
  loadVisibility,
  resetTokenUsageMock,
  saveVisibility,
  setMockVisibility,
  TokenUsageApiError,
  type TokenUsageRequestOptions,
} from "./api";
export {
  buildSparklinePath,
  formatComputedAt,
  formatCostUsd,
  formatTokenAmount,
  formatWindowLabel,
  formatWindowPhrase,
  type ProviderShare,
  providerLabel,
  providerShares,
  type SparklineGeometry,
  type TokenAmount,
} from "./format";
export {
  TokenUsageAdminControls,
  type TokenUsageAdminControlsProps,
  type TokenUsageVisibilityKey,
} from "./token-usage-admin-controls";
export {
  CompanyTokenUsageSection,
  type CompanyTokenUsageSectionProps,
} from "./token-usage-section";
export { TokenUsageSparkline } from "./token-usage-sparkline";
export {
  TokenUsageWidget,
  type TokenUsageWidgetProps,
} from "./token-usage-widget";
export type {
  CompanyPublicUsage,
  CompanyUsageSettings,
  PublicUsageResult,
  TokenUsagePoint,
  TokenUsageViewState,
  VisibilityResult,
} from "./types";
