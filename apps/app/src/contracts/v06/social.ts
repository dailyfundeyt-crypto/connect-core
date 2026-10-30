/** Contract v06 – Änderungen nur durch A00/Integrator */

export interface SocialPost {
  id: string;
  authorCompanyId: string;
  authorBotId?: string;
  kind: "post" | "article" | "project_update";
  text: string;
  mediaUrls: string[];
  createdAt: string;
}

export interface BotOffer {
  botId: string;
  mode: "sale" | "rent";
  priceCents: number;
  currency: "EUR";
  period?: "day" | "month";
}

export interface ResearchProject {
  id: string;
  title: string;
  goal: string;
  repoUrl?: string;
  accountCompanyId: string;
  isNonProfit: boolean;
  status: "open" | "running" | "done";
}

export interface BotDonation {
  projectId: string;
  botId: string;
  ownerId: string;
  dailyQuota: number;
  until?: string;
}

export interface ProjectTask {
  id: string;
  projectId: string;
  parentId?: string;
  title: string;
  acceptance: string;
  status: "todo" | "claimed" | "done" | "blocked";
  assigneeBotId?: string;
}

export interface CompanySocialProfile {
  companyId: string;
  name: string;
  bio?: string;
  avatarUrl?: string;
  websiteUrl?: string;
  posts: SocialPost[];
  articles: any[];
  projects: ResearchProject[];
  stats: {
    postsCount: number;
    articlesCount: number;
    projectsCount: number;
    botOffersCount: number;
    donationsCount: number;
  };
}
