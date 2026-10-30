/**
 * Connect-Sozial React Hooks (v06 / A24)
 *
 * Stellt Typsichere Hooks für Timeline, Artikel, Forschungsprojekte,
 * DAG-Aufgaben, Bot-Spenden und Firmenprofile bereit.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { API_PATHS_V06 } from "../../contracts/v06/api-paths";
import { getFlag } from "../../contracts/v06/flags";
import type {
  SocialPost,
  ResearchProject,
  BotDonation,
  ProjectTask,
  CompanySocialProfile,
  SocialArticleDetail,
  SocialMediaRecord,
  TimelineFilter,
  CreatePostInput,
  CreateArticleInput,
  CreateProjectInput,
  CreateDonationInput,
  CreateTaskInput,
} from "./types";

/* ========================================================================== */
/* Query Keys                                                                 */
/* ========================================================================== */

export const socialKeys = {
  all: ["v06", "social"] as const,
  timeline: (filter: TimelineFilter, companyId?: string, kind?: string) =>
    [...socialKeys.all, "timeline", filter, companyId ?? "all", kind ?? "all"] as const,
  post: (id: string) => [...socialKeys.all, "post", id] as const,
  articles: (companyId?: string) => [...socialKeys.all, "articles", companyId ?? "all"] as const,
  article: (id: string) => [...socialKeys.all, "article", id] as const,
  projects: (companyId?: string, status?: string) =>
    [...socialKeys.all, "projects", companyId ?? "all", status ?? "all"] as const,
  project: (id: string) => [...socialKeys.all, "project", id] as const,
  tasks: (projectId: string) => [...socialKeys.all, "tasks", projectId] as const,
  donations: (projectId: string) => [...socialKeys.all, "donations", projectId] as const,
  companyProfile: (companyId: string) => [...socialKeys.all, "companyProfile", companyId] as const,
};

/* ========================================================================== */
/* Helper Functions                                                           */
/* ========================================================================== */

async function handleResponse<T>(res: Response, fallbackMsg: string): Promise<T> {
  if (!res.ok) {
    let errDetail = fallbackMsg;
    try {
      const errJson = await res.json();
      errDetail = errJson.error || fallbackMsg;
    } catch {
      errDetail = `${fallbackMsg} (Status: ${res.status})`;
    }
    throw new Error(errDetail);
  }
  return res.json() as Promise<T>;
}

/* ========================================================================== */
/* Timeline & Posts Hooks                                                     */
/* ========================================================================== */

export interface UseTimelineOptions {
  filter?: TimelineFilter;
  companyId?: string;
  authorBotId?: string;
  kind?: "post" | "article" | "project_update";
  limit?: number;
  enabled?: boolean;
}

export function useSocialTimeline(options: UseTimelineOptions = {}) {
  const { filter = "for-you", companyId, authorBotId, kind, limit, enabled = true } = options;
  const queryClient = useQueryClient();
  const isFlagActive = getFlag("socialV1");

  const query = useQuery({
    queryKey: socialKeys.timeline(filter, companyId, kind),
    queryFn: async (): Promise<SocialPost[]> => {
      const params = new URLSearchParams();
      params.set("filter", filter);
      if (companyId) params.set("companyId", companyId);
      if (authorBotId) params.set("authorBotId", authorBotId);
      if (kind) params.set("kind", kind);
      if (limit) params.set("limit", String(limit));

      const url = `${API_PATHS_V06.socialPosts}?${params.toString()}`;
      const res = await fetch(url);
      return handleResponse<SocialPost[]>(res, "Fehler beim Laden der Timeline");
    },
    enabled: enabled && isFlagActive,
    staleTime: 10_000,
  });

  const createPostMutation = useMutation({
    mutationFn: async (input: CreatePostInput): Promise<SocialPost> => {
      const res = await fetch(API_PATHS_V06.socialPosts, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      return handleResponse<SocialPost>(res, "Fehler beim Erstellen des Beitrags");
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: socialKeys.all });
    },
  });

  const archivePostMutation = useMutation({
    mutationFn: async (postId: string): Promise<{ ok: boolean; id: string }> => {
      const res = await fetch(`${API_PATHS_V06.socialPosts}/${encodeURIComponent(postId)}`, {
        method: "DELETE",
      });
      return handleResponse<{ ok: boolean; id: string }>(res, "Fehler beim Archivieren");
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: socialKeys.all });
    },
  });

  return {
    posts: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error as Error | null,
    refetch: query.refetch,
    createPost: createPostMutation.mutateAsync,
    isCreating: createPostMutation.isPending,
    archivePost: archivePostMutation.mutateAsync,
    isArchiving: archivePostMutation.isPending,
  };
}

/* ========================================================================== */
/* Articles Hooks                                                             */
/* ========================================================================== */

export function useSocialArticles(companyId?: string) {
  const queryClient = useQueryClient();
  const isFlagActive = getFlag("socialV1");

  const query = useQuery({
    queryKey: socialKeys.articles(companyId),
    queryFn: async (): Promise<SocialPost[]> => {
      const params = new URLSearchParams();
      if (companyId) params.set("companyId", companyId);
      const url = `${API_PATHS_V06.socialArticles}${params.toString() ? `?${params.toString()}` : ""}`;
      const res = await fetch(url);
      return handleResponse<SocialPost[]>(res, "Fehler beim Laden der Artikel");
    },
    enabled: isFlagActive,
    staleTime: 15_000,
  });

  const createArticleMutation = useMutation({
    mutationFn: async (input: CreateArticleInput): Promise<{ article: any; post: SocialPost }> => {
      const res = await fetch(API_PATHS_V06.socialArticles, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      return handleResponse<{ article: any; post: SocialPost }>(res, "Fehler beim Erstellen des Artikels");
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: socialKeys.all });
    },
  });

  return {
    articles: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error as Error | null,
    refetch: query.refetch,
    createArticle: createArticleMutation.mutateAsync,
    isCreating: createArticleMutation.isPending,
  };
}

export function useArticleDetail(articleId?: string) {
  const isFlagActive = getFlag("socialV1");

  const query = useQuery({
    queryKey: socialKeys.article(articleId || ""),
    queryFn: async (): Promise<SocialArticleDetail> => {
      if (!articleId) throw new Error("Keine Artikel-ID übergeben");
      const url = `${API_PATHS_V06.socialArticles}/${encodeURIComponent(articleId)}`;
      const res = await fetch(url);
      return handleResponse<SocialArticleDetail>(res, "Fehler beim Laden des Artikels");
    },
    enabled: Boolean(articleId) && isFlagActive,
    staleTime: 30_000,
  });

  return {
    article: query.data ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error as Error | null,
    refetch: query.refetch,
  };
}

/* ========================================================================== */
/* Research Projects Hooks                                                    */
/* ========================================================================== */

export function useSocialProjects(options?: { accountCompanyId?: string; status?: "open" | "running" | "done" }) {
  const queryClient = useQueryClient();
  const isFlagActive = getFlag("socialV1");

  const query = useQuery({
    queryKey: socialKeys.projects(options?.accountCompanyId, options?.status),
    queryFn: async (): Promise<ResearchProject[]> => {
      const params = new URLSearchParams();
      if (options?.accountCompanyId) params.set("accountCompanyId", options.accountCompanyId);
      if (options?.status) params.set("status", options.status);
      const url = `${API_PATHS_V06.socialProjects}${params.toString() ? `?${params.toString()}` : ""}`;
      const res = await fetch(url);
      return handleResponse<ResearchProject[]>(res, "Fehler beim Laden der Projekte");
    },
    enabled: isFlagActive,
    staleTime: 15_000,
  });

  const createProjectMutation = useMutation({
    mutationFn: async (input: CreateProjectInput): Promise<ResearchProject> => {
      const res = await fetch(API_PATHS_V06.socialProjects, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      return handleResponse<ResearchProject>(res, "Fehler beim Erstellen des Projekts");
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: socialKeys.all });
    },
  });

  return {
    projects: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error as Error | null,
    refetch: query.refetch,
    createProject: createProjectMutation.mutateAsync,
    isCreating: createProjectMutation.isPending,
  };
}

export function useProjectDetails(projectId?: string) {
  const isFlagActive = getFlag("socialV1");

  const query = useQuery({
    queryKey: socialKeys.project(projectId || ""),
    queryFn: async (): Promise<ResearchProject> => {
      if (!projectId) throw new Error("Keine Projekt-ID übergeben");
      const url = `${API_PATHS_V06.socialProjects}/${encodeURIComponent(projectId)}`;
      const res = await fetch(url);
      return handleResponse<ResearchProject>(res, "Fehler beim Laden der Projektdetails");
    },
    enabled: Boolean(projectId) && isFlagActive,
    staleTime: 15_000,
  });

  return {
    project: query.data ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error as Error | null,
    refetch: query.refetch,
  };
}

/* ========================================================================== */
/* Project Tasks & DAG Hooks                                                  */
/* ========================================================================== */

export function useProjectTasks(projectId?: string) {
  const queryClient = useQueryClient();
  const isFlagActive = getFlag("socialV1");

  const query = useQuery({
    queryKey: socialKeys.tasks(projectId || ""),
    queryFn: async (): Promise<ProjectTask[]> => {
      if (!projectId) return [];
      const url = API_PATHS_V06.socialProjectTasks(projectId);
      const res = await fetch(url);
      return handleResponse<ProjectTask[]>(res, "Fehler beim Laden der Aufgaben");
    },
    enabled: Boolean(projectId) && isFlagActive,
    staleTime: 10_000,
  });

  const createTaskMutation = useMutation({
    mutationFn: async (input: CreateTaskInput): Promise<ProjectTask> => {
      if (!projectId) throw new Error("Keine Projekt-ID");
      const url = API_PATHS_V06.socialProjectTasks(projectId);
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      return handleResponse<ProjectTask>(res, "Fehler beim Erstellen der Aufgabe");
    },
    onSuccess: () => {
      if (projectId) {
        void queryClient.invalidateQueries({ queryKey: socialKeys.tasks(projectId) });
      }
    },
  });

  const updateTaskMutation = useMutation({
    mutationFn: async ({ taskId, data }: { taskId: string; data: Partial<CreateTaskInput> }): Promise<ProjectTask> => {
      if (!projectId) throw new Error("Keine Projekt-ID");
      const url = `${API_PATHS_V06.socialProjects}/${encodeURIComponent(projectId)}/tasks/${encodeURIComponent(taskId)}`;
      const res = await fetch(url, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      return handleResponse<ProjectTask>(res, "Fehler beim Aktualisieren der Aufgabe");
    },
    onSuccess: () => {
      if (projectId) {
        void queryClient.invalidateQueries({ queryKey: socialKeys.tasks(projectId) });
      }
    },
  });

  return {
    tasks: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error as Error | null,
    refetch: query.refetch,
    createTask: createTaskMutation.mutateAsync,
    isCreating: createTaskMutation.isPending,
    updateTask: updateTaskMutation.mutateAsync,
    isUpdating: updateTaskMutation.isPending,
  };
}

/* ========================================================================== */
/* Bot Donation Hooks                                                         */
/* ========================================================================== */

export function useProjectDonations(projectId?: string) {
  const queryClient = useQueryClient();
  const isFlagActive = getFlag("socialV1");

  const query = useQuery({
    queryKey: socialKeys.donations(projectId || ""),
    queryFn: async (): Promise<BotDonation[]> => {
      if (!projectId) return [];
      const url = `${API_PATHS_V06.socialProjects}/${encodeURIComponent(projectId)}/donations`;
      const res = await fetch(url);
      return handleResponse<BotDonation[]>(res, "Fehler beim Laden der Spenden");
    },
    enabled: Boolean(projectId) && isFlagActive,
    staleTime: 15_000,
  });

  const donateMutation = useMutation({
    mutationFn: async (input: CreateDonationInput): Promise<{ ok: boolean; donation: BotDonation }> => {
      if (!projectId) throw new Error("Keine Projekt-ID");
      const url = API_PATHS_V06.socialProjectDonate(projectId);
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      return handleResponse<{ ok: boolean; donation: BotDonation }>(res, "Fehler beim Spenden des Bots");
    },
    onSuccess: () => {
      if (projectId) {
        void queryClient.invalidateQueries({ queryKey: socialKeys.donations(projectId) });
        void queryClient.invalidateQueries({ queryKey: socialKeys.project(projectId) });
      }
    },
  });

  return {
    donations: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error as Error | null,
    refetch: query.refetch,
    donateBot: donateMutation.mutateAsync,
    isDonating: donateMutation.isPending,
  };
}

/* ========================================================================== */
/* Company Social Profile Hook                                                */
/* ========================================================================== */

export function useCompanySocialProfile(companyId?: string) {
  const isFlagActive = getFlag("socialV1");

  const query = useQuery({
    queryKey: socialKeys.companyProfile(companyId || ""),
    queryFn: async (): Promise<CompanySocialProfile> => {
      if (!companyId) throw new Error("Keine Firmen-ID angegeben");
      const url = `/api/v06/social/companies/${encodeURIComponent(companyId)}/profile`;
      const res = await fetch(url);
      return handleResponse<CompanySocialProfile>(res, "Fehler beim Laden des Firmenprofils");
    },
    enabled: Boolean(companyId) && isFlagActive,
    staleTime: 15_000,
  });

  return {
    profile: query.data ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error as Error | null,
    refetch: query.refetch,
  };
}

/* ========================================================================== */
/* Media Upload Hook                                                          */
/* ========================================================================== */

export function useMediaUpload() {
  const uploadMutation = useMutation({
    mutationFn: async ({
      file,
      companyId,
      postId,
      uploadedBy = "user",
    }: {
      file: File;
      companyId?: string;
      postId?: string;
      uploadedBy?: string;
    }): Promise<SocialMediaRecord> => {
      const formData = new FormData();
      formData.append("file", file);
      if (companyId) formData.append("companyId", companyId);
      if (postId) formData.append("postId", postId);
      formData.append("uploadedBy", uploadedBy);

      const res = await fetch("/api/v06/social/media", {
        method: "POST",
        body: formData,
      });

      return handleResponse<SocialMediaRecord>(res, "Upload fehlgeschlagen");
    },
  });

  const uploadDataUrlMutation = useMutation({
    mutationFn: async ({
      dataUrl,
      filename = "image.png",
      companyId,
      postId,
      uploadedBy = "user",
    }: {
      dataUrl: string;
      filename?: string;
      companyId?: string;
      postId?: string;
      uploadedBy?: string;
    }): Promise<SocialMediaRecord> => {
      const res = await fetch("/api/v06/social/media", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dataUrl, filename, companyId, postId, uploadedBy }),
      });

      return handleResponse<SocialMediaRecord>(res, "Upload fehlgeschlagen");
    },
  });

  return {
    uploadFile: uploadMutation.mutateAsync,
    isUploadingFile: uploadMutation.isPending,
    uploadDataUrl: uploadDataUrlMutation.mutateAsync,
    isUploadingDataUrl: uploadDataUrlMutation.isPending,
    isUploading: uploadMutation.isPending || uploadDataUrlMutation.isPending,
  };
}
