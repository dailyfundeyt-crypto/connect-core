/**
 * Canonical Application Routes and External Service Links
 * Shared across frontend and server lanes in Swarm-v2.
 */

export const ROUTES = {
  social: "/social",
  socialCompany: "/social/company/:companyId",
  settingsCompanies: "/settings/companies",
  store: "/store",
  brain: "/brain",
  onboarding: "/onboarding",
} as const;

export type RouteKey = keyof typeof ROUTES;
export type RoutePath = (typeof ROUTES)[RouteKey];

export const EXTERNAL_LINKS = {
  grokBot: "https://grok.com",
  manus: "https://manus.im/app",
  perplexityComputer: "https://www.perplexity.ai/computer",
  ottermind: "https://ottermind.ai/studio/task",
  lovable: "https://lovable.dev/dashboard",
} as const;

export type ExternalLinkKey = keyof typeof EXTERNAL_LINKS;
export type ExternalLinkUrl = (typeof EXTERNAL_LINKS)[ExternalLinkKey];
