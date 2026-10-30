/**
 * Connect-Sozial: ProjectPage (v06 / A24)
 *
 * Vollständige Ansicht eines kollaborativen Forschungsprojekts.
 * Beinhaltet Zielbeschreibung, GitHub-Repo, Fortschritts-Updates,
 * hierarchischen Aufgabenbaum (DAG) und Bot-Spenden mit Tageskontingent.
 */

import React, { useState } from "react";
import {
  IconArrowLeft,
  IconFlask,
  IconBrandGithub,
  IconHeartHandshake,
  IconChecklist,
  IconRobot,
  IconCalendar,
  IconCircleCheck,
  IconClock,
  IconSparkles,
  IconExternalLink,
  IconPlus,
} from "@tabler/icons-react";
import {
  useProjectDetails,
  useProjectTasks,
  useProjectDonations,
  useSocialTimeline,
} from "./useSocial";
import { TaskTree } from "./TaskTree";
import { DonateBotDialog } from "./DonateBotDialog";
import { PostCard } from "./Timeline";
import type { ResearchProject, BotDonation } from "./types";

export interface ProjectPageProps {
  projectId: string;
  onBack?: () => void;
  currentCompanyId?: string;
  availableBots?: Array<{ id: string; name: string }>;
  onOpenCompany?: (companyId: string) => void;
}

export function ProjectPage({
  projectId,
  onBack,
  currentCompanyId = "kunc_gmbh",
  availableBots = [
    { id: "researcher-bot", name: "Deep Research Agent" },
    { id: "coder-bot", name: "Fullstack Coder" },
    { id: "evaluator-bot", name: "Task Evaluator" },
  ],
  onOpenCompany,
}: ProjectPageProps) {
  const [activeTab, setActiveTab] = useState<"tasks" | "donations" | "updates">("tasks");
  const [isDonateOpen, setIsDonateOpen] = useState(false);

  // Queries
  const { project, isLoading: isProjectLoading, isError, error } = useProjectDetails(projectId);
  const { tasks, createTask, updateTask } = useProjectTasks(projectId);
  const { donations, refetch: refetchDonations } = useProjectDonations(projectId);
  const { posts } = useSocialTimeline({ kind: "project_update" });

  const projectUpdates = posts.filter((p) => p.text.includes(projectId) || p.authorCompanyId === project?.accountCompanyId);

  if (isProjectLoading) {
    return (
      <div className="flex h-64 items-center justify-center text-white/50" data-testid="project-loading">
        <div className="flex items-center gap-2">
          <IconFlask className="size-6 animate-pulse text-amber-400" />
          <span>Forschungsprojekt wird geladen…</span>
        </div>
      </div>
    );
  }

  if (isError || !project) {
    return (
      <div className="mx-auto max-w-4xl p-6 text-center text-rose-300">
        <p className="font-semibold">{error?.message || "Projekt konnte nicht geladen werden."}</p>
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="mt-4 rounded-full bg-white/10 px-4 py-1.5 text-xs font-bold text-white hover:bg-white/20"
          >
            Zurück zur Übersicht
          </button>
        )}
      </div>
    );
  }

  const totalDailyQuota = donations.reduce((sum, d) => sum + (d.dailyQuota || 0), 0);

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 text-white space-y-6" data-testid="research-project-page">
      {/* Top Navigation & Back Bar */}
      <div className="flex items-center justify-between">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="flex items-center gap-1.5 text-[13px] font-medium text-white/60 hover:text-white transition-colors"
            data-testid="project-back-button"
          >
            <IconArrowLeft className="size-4" />
            <span>Zurück zur Timeline</span>
          </button>
        )}

        <div className="flex items-center gap-2">
          {project.isNonProfit && (
            <span className="rounded-full bg-emerald-500/15 border border-emerald-500/30 px-3 py-1 text-[11px] font-bold text-emerald-400">
              🌱 Gemeinnützig / Non-Profit
            </span>
          )}
          <span
            className={`rounded-full px-3 py-1 text-[11px] font-bold border ${
              project.status === "running"
                ? "bg-amber-500/15 border-amber-500/30 text-amber-300"
                : project.status === "done"
                ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-300"
                : "bg-sky-500/15 border-sky-500/30 text-sky-300"
            }`}
          >
            Status: {project.status.toUpperCase()}
          </span>
        </div>
      </div>

      {/* Hero Header Card */}
      <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-[#121428] via-[#0d0f1e] to-[#080912] p-6 shadow-xl">
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-6">
          <div className="space-y-3 flex-1">
            <div className="flex items-center gap-3">
              <div className="flex size-12 items-center justify-center rounded-2xl bg-amber-500/20 border border-amber-500/40 text-amber-400 font-bold">
                <IconFlask className="size-6" />
              </div>
              <div>
                <h1 className="text-2xl font-black text-white" data-testid="project-title">
                  {project.title}
                </h1>
                <p className="text-[13px] text-white/50">
                  Initiiert von{" "}
                  <button
                    type="button"
                    onClick={() => onOpenCompany?.(project.accountCompanyId)}
                    className="font-bold text-sky-400 hover:underline"
                  >
                    {project.accountCompanyId}
                  </button>
                </p>
              </div>
            </div>

            {/* Goal Description */}
            <p className="text-[14px] leading-relaxed text-white/80 whitespace-pre-wrap font-sans">
              {project.goal}
            </p>

            {/* Links and Metrics */}
            <div className="flex items-center gap-4 pt-2 flex-wrap text-[13px]">
              {project.repoUrl && (
                <a
                  href={project.repoUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1.5 rounded-xl bg-white/5 border border-white/10 px-3.5 py-1.5 text-white/80 hover:bg-white/10 hover:text-white transition-colors"
                  data-testid="project-repo-link"
                >
                  <IconBrandGithub className="size-4" />
                  <span>GitHub Repository</span>
                  <IconExternalLink className="size-3 text-white/40" />
                </a>
              )}

              <div className="flex items-center gap-1.5 text-white/60">
                <IconRobot className="size-4 text-emerald-400" />
                <span>
                  <strong className="text-white">{donations.length}</strong> Bot-Spenden
                </span>
              </div>

              <div className="flex items-center gap-1.5 text-white/60">
                <IconClock className="size-4 text-amber-400" />
                <span>
                  <strong className="text-white">{totalDailyQuota}</strong> Runs/Tag Quota
                </span>
              </div>
            </div>
          </div>

          {/* Primary CTA: Donate Bot */}
          <div className="shrink-0 flex flex-col items-stretch sm:items-end gap-2">
            <button
              type="button"
              onClick={() => setIsDonateOpen(true)}
              className="flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-500 px-6 py-3 text-[14px] font-bold text-white shadow-lg shadow-amber-500/25 hover:from-amber-400 hover:to-orange-400 transition-all active:scale-95"
              data-testid="project-donate-button"
            >
              <IconHeartHandshake className="size-5" />
              <span>Bot spenden</span>
            </button>
            <span className="text-[11px] text-white/40 text-center sm:text-right">
              Unterstütze das Projekt mit täglicher Rechenzeit
            </span>
          </div>
        </div>
      </div>

      {/* Tabs Bar */}
      <div className="flex items-center gap-2 border-b border-white/10 pb-2">
        <button
          type="button"
          onClick={() => setActiveTab("tasks")}
          className={`flex items-center gap-2 rounded-xl px-4 py-2 text-[13px] font-bold transition-all ${
            activeTab === "tasks"
              ? "bg-sky-500 text-white shadow-md shadow-sky-500/20"
              : "text-white/60 hover:bg-white/5 hover:text-white"
          }`}
          data-testid="project-tab-tasks"
        >
          <IconChecklist className="size-4" />
          <span>Aufgabenbaum ({tasks.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("donations")}
          className={`flex items-center gap-2 rounded-xl px-4 py-2 text-[13px] font-bold transition-all ${
            activeTab === "donations"
              ? "bg-sky-500 text-white shadow-md shadow-sky-500/20"
              : "text-white/60 hover:bg-white/5 hover:text-white"
          }`}
          data-testid="project-tab-donations"
        >
          <IconRobot className="size-4" />
          <span>Bot-Spenden ({donations.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("updates")}
          className={`flex items-center gap-2 rounded-xl px-4 py-2 text-[13px] font-bold transition-all ${
            activeTab === "updates"
              ? "bg-sky-500 text-white shadow-md shadow-sky-500/20"
              : "text-white/60 hover:bg-white/5 hover:text-white"
          }`}
          data-testid="project-tab-updates"
        >
          <IconSparkles className="size-4" />
          <span>Updates ({projectUpdates.length})</span>
        </button>
      </div>

      {/* Main Tab Content */}
      <div>
        {/* Tab 1: Task Tree */}
        {activeTab === "tasks" && (
          <TaskTree
            projectId={project.id}
            tasks={tasks}
            availableBots={availableBots}
            canEdit={true}
            onCreateTask={async (t) => {
              await createTask(t);
            }}
            onUpdateStatus={async (taskId, status) => {
              await updateTask({ taskId, data: { status } });
            }}
          />
        )}

        {/* Tab 2: Bot Donations */}
        {activeTab === "donations" && (
          <div className="space-y-4" data-testid="project-donations-list">
            <div className="flex items-center justify-between">
              <h3 className="text-[15px] font-bold text-white">Aktive Bot-Spenden für dieses Projekt</h3>
              <button
                type="button"
                onClick={() => setIsDonateOpen(true)}
                className="flex items-center gap-1.5 rounded-xl bg-amber-500/20 border border-amber-500/30 px-3 py-1.5 text-[12px] font-bold text-amber-300 hover:bg-amber-500/30"
              >
                <IconPlus className="size-3.5" />
                <span>Weitere Spende anlegen</span>
              </button>
            </div>

            {donations.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {donations.map((d, idx) => (
                  <div
                    key={`${d.botId}-${idx}`}
                    className="rounded-2xl border border-white/10 bg-[#0e101f] p-4.5 space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="flex size-9 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-400">
                          <IconRobot className="size-5" />
                        </div>
                        <div>
                          <h4 className="text-[14px] font-bold text-white">Bot: {d.botId}</h4>
                          <span className="text-[11px] text-white/50">Besitzer: {d.ownerId}</span>
                        </div>
                      </div>

                      <span className="rounded-full bg-amber-500/15 border border-amber-500/30 px-2.5 py-1 text-[12px] font-black text-amber-400">
                        {d.dailyQuota} Runs/Tag
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-[12px] text-white/50 pt-2 border-t border-white/5">
                      <span>Laufzeit:</span>
                      <span className="font-medium text-white/80">
                        {d.until ? new Date(d.until).toLocaleDateString("de-DE") : "Unbefristet"}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-white/10 p-10 text-center space-y-3">
                <IconRobot className="size-10 mx-auto text-white/30" />
                <h4 className="font-bold text-white">Bisher keine Bot-Spenden</h4>
                <p className="text-[13px] text-white/50 max-w-md mx-auto">
                  Unterstütze dieses Projekt mit Rechenzeit deines Bots. Klicke auf &quot;Bot spenden&quot; oben rechts.
                </p>
              </div>
            )}
          </div>
        )}

        {/* Tab 3: Updates */}
        {activeTab === "updates" && (
          <div className="space-y-4" data-testid="project-updates-list">
            {projectUpdates.length > 0 ? (
              projectUpdates.map((post) => (
                <PostCard
                  key={post.id}
                  post={post}
                  currentCompanyId={currentCompanyId}
                  onOpenCompany={onOpenCompany}
                />
              ))
            ) : (
              <div className="rounded-2xl border border-dashed border-white/10 p-10 text-center text-white/40 text-[13px]">
                Noch keine Fortschritts-Updates für dieses Projekt veröffentlicht.
              </div>
            )}
          </div>
        )}
      </div>

      {/* Donate Bot Modal Dialog */}
      <DonateBotDialog
        projectId={project.id}
        projectTitle={project.title}
        isOpen={isDonateOpen}
        onClose={() => setIsDonateOpen(false)}
        availableBots={availableBots}
        currentOwnerId={currentCompanyId}
        onDonationSuccess={() => {
          void refetchDonations();
        }}
      />
    </div>
  );
}

export default ProjectPage;
