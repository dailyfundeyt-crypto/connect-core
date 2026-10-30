import type { CompanyAppToggle } from "@/contracts/swarm-v3";

export interface CompanyAppItem extends CompanyAppToggle {
  description?: string;
  category?: string;
}

export const APP_METADATA: Record<
  string,
  { name: string; description: string; logoColor: string; defaultLogo?: string; iconName?: string }
> = {
  "connect-sozial": {
    name: "Connect Sozial",
    description: "Social-Media-Feed mit Artikeln, AI und Follower-Profilen",
    logoColor: "#ec4899",
    defaultLogo: "/brand/connect-logo.png",
    iconName: "IconNews",
  },
  flux: {
    name: "Flux",
    description: "Multiposter, Verkauf und Warenverwaltung",
    logoColor: "#10b981",
    defaultLogo: "/brand/flux-logo.png",
    iconName: "IconShoppingBag",
  },
  analysis: {
    name: "Analysis",
    description: "Feed, Suche, Cohorts und Unternehmensprofile",
    logoColor: "#a855f7",
    defaultLogo: "/brand/analysis-logo.png",
    iconName: "IconChartHistogram",
  },
  brain: {
    name: "Brain",
    description: "Wissensgraph: Notizen, Links und Zeitachse",
    logoColor: "#0ea5e9",
    defaultLogo: "/brand/brain-logo.png",
    iconName: "IconBrain",
  },
  finance: {
    name: "Finance",
    description: "Buchhaltung, UStVA, BWA — GoBD-konform",
    logoColor: "#14b8a6",
    defaultLogo: "/brand/finance-logo.png",
    iconName: "IconReceiptTax",
  },
};
