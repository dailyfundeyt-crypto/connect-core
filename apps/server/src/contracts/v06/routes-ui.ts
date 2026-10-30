/** Contract v06 – Änderungen nur durch A00/Integrator */

export const ROUTES_V06 = {
  socialCompanyProfile: (companyId: string) => `/social/company/${encodeURIComponent(companyId)}`,
  settingsCompanies: "/settings/companies",
  settingsSection: (id: string) => `/settings#${encodeURIComponent(id)}`,
  store: "/store",
  social: "/social",
  sparkOverview: "/spark-overview",
} as const;
