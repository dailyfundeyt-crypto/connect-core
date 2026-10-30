/**
 * Connect-Sozial Types & Contract Re-exports (v06 / A24)
 */

import type {
  SocialPost,
  BotOffer,
  ResearchProject,
  BotDonation,
  ProjectTask,
} from "../../contracts/v06/social";

export type {
  SocialPost,
  BotOffer,
  ResearchProject,
  BotDonation,
  ProjectTask,
};

// TODO-CONTRACT: CompanySocialProfile sollte in contracts/v06/social.ts aufgenommen werden
export interface CompanySocialProfile {
  companyId: string;
  name: string;
  bio?: string;
  avatarUrl?: string;
  websiteUrl?: string;
  posts: SocialPost[];
  articles: SocialArticleDetail[];
  projects: ResearchProject[];
  stats: {
    postsCount: number;
    articlesCount: number;
    projectsCount: number;
    botOffersCount: number;
    donationsCount: number;
  };
}

// TODO-CONTRACT: SocialArticleDetail sollte in contracts/v06/social.ts aufgenommen werden
export interface SocialArticleDetail {
  id: string;
  authorCompanyId: string;
  authorBotId?: string;
  authorName: string;
  authorAvatar?: string;
  title: string;
  slug?: string;
  summary?: string;
  content: string;
  coverImageUrl?: string;
  tags?: string[];
  attachedOffer?: BotOffer;
  createdAt: string;
}

// TODO-CONTRACT: SocialMediaRecord sollte in contracts/v06/social.ts aufgenommen werden
export interface SocialMediaRecord {
  id: string;
  filename: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  url: string;
  uploadedBy: string;
  postId?: string;
  companyId?: string;
  exifRemoved: boolean;
  createdAt: string;
}

export type TimelineFilter = "for-you" | "following";

export interface CreatePostInput {
  authorCompanyId: string;
  authorBotId?: string;
  kind: "post" | "article" | "project_update";
  text: string;
  mediaUrls?: string[];
}

export interface CreateArticleInput {
  authorCompanyId: string;
  authorBotId?: string;
  authorName?: string;
  authorAvatar?: string;
  title: string;
  slug?: string;
  summary?: string;
  content: string;
  coverImageUrl?: string;
  tags?: string[];
  attachedOffer?: BotOffer;
}

export interface CreateProjectInput {
  title: string;
  goal: string;
  repoUrl?: string;
  accountCompanyId: string;
  isNonProfit: boolean;
}

export interface CreateDonationInput {
  botId: string;
  ownerId: string;
  dailyQuota: number;
  until?: string;
}

export interface CreateTaskInput {
  parentId?: string;
  title: string;
  acceptance: string;
  status: "todo" | "claimed" | "done" | "blocked";
  assigneeBotId?: string;
}
