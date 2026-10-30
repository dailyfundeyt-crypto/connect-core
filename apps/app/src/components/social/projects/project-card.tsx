/**
 * Research Project Timeline Card (Lane 6)
 *
 * Präsentiert Forschungsprojekte auf der Social-Timeline und im Company-Profil:
 * - Titel, Non-Profit-Kennzeichen, Beschreibung & Ziel
 * - Fortschrittsanzeige (erledigte vs offene Tasks, verbrauchte Tokens)
 * - Gespendete Bots
 * - Direkte Interaktionen: Bot spenden, Task-Baum ansehen, GitHub Repo
 */

import React, { useState } from "react";
import {
  IconArrowRight,
  IconBrandGithub,
  IconCpu,
  IconHeartHandshake,
  IconListCheck,
  IconReportAnalytics,
  IconShieldCheck,
} from "@tabler/icons-react";
import type { Project } from "@contracts/api";
import { ProjectDonationModal } from "./project-donation-modal";
import { ProjectTaskTreeModal } from "./project-task-tree";

export type ResearchProject = Project & {
  goal?: string;
  githubRepoUrl?: string;
  nonProfit?: boolean;
  budgetTokens?: number;
  usedTokens?: number;
  tags?: string[];
  category?: string;
};

export function ProjectCard({
  project,
  onUpdate,
}: {
  project: ResearchProject;
  onUpdate?: () => void;
}) {
  const [donateOpen, setDonateOpen] = useState(false);
  const [tasksOpen, setTasksOpen] = useState(false);

  const budget = project.budgetTokens || 10_000_000;
  const used = project.usedTokens || 0;
  const percentUsed = Math.min(100, Math.round((used / budget) * 100));

  return (
    <div className="rounded-xl border border-border/60 bg-card p-5 text-card-foreground shadow-sm transition hover:border-primary/40">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-semibold tracking-tight text-foreground">
              {project.title}
            </h3>
            {project.nonProfit && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                <IconShieldCheck className="size-3.5" />
                Non-Profit Research
              </span>
            )}
            {project.category && (
              <span className="rounded-full bg-secondary px-2 py-0.5 text-xs text-secondary-foreground">
                {project.category}
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground line-clamp-2">
            {project.description}
          </p>
        </div>

        {project.githubRepoUrl && (
          <a
            href={project.githubRepoUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg border border-border/80 px-2.5 py-1 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <IconBrandGithub className="size-3.5" />
            GitHub
          </a>
        )}
      </div>

      {/* Goal Banner */}
      {project.goal && (
        <div className="mt-3.5 rounded-lg bg-muted/50 p-2.5 text-xs text-muted-foreground">
          <span className="font-semibold text-foreground">Projektziel: </span>
          {project.goal}
        </div>
      )}

      {/* Progress & Stats */}
      <div className="mt-4 space-y-2">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Token-Budget Auslastung</span>
          <span className="font-medium text-foreground">
            {used.toLocaleString()} / {budget.toLocaleString()} ({percentUsed}%)
          </span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full bg-primary transition-all duration-300"
            style={{ width: `${percentUsed}%` }}
          />
        </div>
      </div>

      {/* Meta Pills */}
      <div className="mt-4 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <IconCpu className="size-4 text-primary" />
          <span>
            <strong className="text-foreground">{project.botCount}</strong> Bots gespendet
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <IconListCheck className="size-4 text-emerald-500" />
          <span>
            <strong className="text-foreground">{project.tasksCount}</strong> Aufgaben im Graph
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <IconReportAnalytics className="size-4 text-sky-500" />
          <span>Status: <strong className="capitalize text-foreground">{project.status}</strong></span>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="mt-5 flex flex-wrap items-center gap-2.5 pt-3 border-t border-border/40">
        <button
          type="button"
          onClick={() => setDonateOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground shadow-sm hover:bg-primary/90 transition"
        >
          <IconHeartHandshake className="size-4" />
          Bot spenden
        </button>

        <button
          type="button"
          onClick={() => setTasksOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted transition"
        >
          <IconListCheck className="size-4" />
          Aufgabenbaum (DAG)
        </button>
      </div>

      {/* Modals */}
      {donateOpen && (
        <ProjectDonationModal
          projectId={project.id}
          projectTitle={project.title}
          onClose={() => setDonateOpen(false)}
          onSuccess={() => {
            setDonateOpen(false);
            onUpdate?.();
          }}
        />
      )}

      {tasksOpen && (
        <ProjectTaskTreeModal
          projectId={project.id}
          projectTitle={project.title}
          onClose={() => setTasksOpen(false)}
          onUpdate={onUpdate}
        />
      )}
    </div>
  );
}
