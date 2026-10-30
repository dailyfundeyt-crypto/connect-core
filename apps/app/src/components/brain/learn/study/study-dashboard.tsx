/**
 * Study Mode Dashboard (Lane 4)
 *
 * Provides:
 * - Review Queue status & primary session launcher
 * - "Was als Nächstes lernen" knowledge-gap recommendations
 * - Active study goals with daily progress
 * - Folder-level mastery breakdown
 */

import React, { useState } from "react";
import {
  AlertCircle,
  ArrowRight,
  BookOpen,
  Calendar,
  CheckCircle2,
  Compass,
  Folder,
  Layers,
  Play,
  Plus,
  RefreshCw,
  Sparkles,
  Target,
  Zap,
} from "lucide-react";
import type { NextUpRecommendation, StudyGoal, StudyQueueItem, StudyStats } from "./types";

interface StudyDashboardProps {
  queue: StudyQueueItem[];
  stats: StudyStats | null;
  recommendations: NextUpRecommendation[];
  goals: StudyGoal[];
  onStartSession: (folderScope?: string) => void;
  onOpenGenerator: (targetFolder?: string) => void;
  onOpenSummary: (folder: string) => void;
  onCreateGoal: () => void;
  isLoading?: boolean;
}

export function StudyDashboard({
  queue,
  stats,
  recommendations,
  goals,
  onStartSession,
  onOpenGenerator,
  onOpenSummary,
  onCreateGoal,
  isLoading,
}: StudyDashboardProps) {
  const [selectedFolderFilter, setSelectedFolderFilter] = useState<string>("");

  const dueCount = queue.length;
  const filteredQueue = selectedFolderFilter
    ? queue.filter((c) => c.notePath.startsWith(selectedFolderFilter))
    : queue;

  return (
    <div className="space-y-8 max-w-5xl mx-auto w-full p-4 md:p-6">
      {/* Hero Banner: Today's Review Queue */}
      <div className="relative overflow-hidden rounded-2xl border border-border/60 bg-gradient-to-br from-card via-card to-primary/5 p-6 md:p-8 shadow-sm">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="space-y-2 max-w-xl">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-primary/10 text-primary border border-primary/20 flex items-center gap-1">
                <Sparkles className="w-3 h-3" />
                FSRS Spaced Repetition
              </span>
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                Heute fällig
              </span>
            </div>

            <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">
              {dueCount > 0 ? (
                <span>
                  Du hast <span className="text-primary">{dueCount} Lernkarten</span> zur Wiederholung
                </span>
              ) : (
                "Alle Wiederholungen für heute erledigt!"
              )}
            </h1>

            <p className="text-sm text-muted-foreground leading-relaxed">
              {dueCount > 0
                ? "Wiederhole deine Karten mit FSRS-4.5. Kurze, regelmäßige Reviews festigen das Wissen in deinem Obsidian-Brain dauerhaft."
                : "Hervorragend! Keine überfälligen Karten. Du kannst neue Karten aus deinen Notizen generieren oder Lernziele vertiefen."}
            </p>
          </div>

          {/* Action Button */}
          <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto shrink-0">
            {dueCount > 0 ? (
              <button
                onClick={() => onStartSession(selectedFolderFilter || undefined)}
                className="px-6 py-3.5 rounded-xl bg-primary text-primary-foreground font-semibold flex items-center justify-center gap-2 hover:bg-primary/90 transition-all shadow-md shadow-primary/20 hover:scale-[1.02] cursor-pointer"
              >
                <Play className="w-4 h-4 fill-current" />
                <span>Jetzt lernen ({filteredQueue.length})</span>
              </button>
            ) : (
              <button
                onClick={() => onOpenGenerator()}
                className="px-5 py-3 rounded-xl bg-primary text-primary-foreground font-semibold flex items-center justify-center gap-2 hover:bg-primary/90 transition-all cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Neue Karten generieren</span>
              </button>
            )}
          </div>
        </div>

        {/* Quick Stats Grid */}
        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-8 pt-6 border-t border-border/40">
            <div className="space-y-0.5">
              <span className="text-xs text-muted-foreground">Gesamte Karten</span>
              <div className="text-xl font-bold text-foreground">{stats.totalCards}</div>
            </div>
            <div className="space-y-0.5">
              <span className="text-xs text-muted-foreground">In Lernphase</span>
              <div className="text-xl font-bold text-amber-400">
                {stats.learningCards + stats.relearningCards}
              </div>
            </div>
            <div className="space-y-0.5">
              <span className="text-xs text-muted-foreground">Gemeistert (S &ge; 21d)</span>
              <div className="text-xl font-bold text-emerald-400">{stats.masteredCards}</div>
            </div>
            <div className="space-y-0.5">
              <span className="text-xs text-muted-foreground">Retention-Rate</span>
              <div className="text-xl font-bold text-cyan-400">{stats.overallRetentionRate}%</div>
            </div>
          </div>
        )}
      </div>

      {/* "Was als Nächstes lernen" Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Compass className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-bold text-foreground">Was als Nächstes lernen?</h2>
          </div>
          <span className="text-xs text-muted-foreground">Automatische Wissenslücken-Analyse</span>
        </div>

        {recommendations.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {recommendations.map((rec) => (
              <div
                key={rec.id}
                className="p-4 rounded-xl border border-border/60 bg-card hover:border-border transition-all flex flex-col justify-between space-y-3"
              >
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                        rec.kind === "overdue_reviews"
                          ? "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                          : rec.kind === "goal_aligned"
                          ? "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                          : rec.kind === "gap_retention"
                          ? "bg-purple-500/10 text-purple-400 border border-purple-500/20"
                          : "bg-cyan-500/10 text-cyan-400 border border-cyan-500/20"
                      }`}
                    >
                      {rec.kind === "overdue_reviews"
                        ? "Überfällig"
                        : rec.kind === "goal_aligned"
                        ? "Lernziel"
                        : rec.kind === "gap_retention"
                        ? "Wissenslücke"
                        : "Neues Thema"}
                    </span>
                    <span className="text-[11px] font-mono text-muted-foreground">
                      Priorität {rec.priority}
                    </span>
                  </div>

                  <h3 className="text-sm font-semibold text-foreground">{rec.title}</h3>
                  <p className="text-xs text-muted-foreground line-clamp-2">{rec.reason}</p>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-border/30">
                  <span className="text-[11px] text-muted-foreground font-mono truncate max-w-[180px]">
                    {rec.folderPath || rec.notePath || "Vault"}
                  </span>
                  <div className="flex gap-1.5">
                    {rec.suggestedAction === "review" && (
                      <button
                        onClick={() => onStartSession(rec.folderPath)}
                        className="px-3 py-1.5 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary text-xs font-medium flex items-center gap-1 transition-colors"
                      >
                        <span>Lernen</span>
                        <ArrowRight className="w-3 h-3" />
                      </button>
                    )}
                    {rec.suggestedAction === "generate" && (
                      <button
                        onClick={() => onOpenGenerator(rec.folderPath)}
                        className="px-3 py-1.5 rounded-lg bg-muted hover:bg-muted/80 text-foreground text-xs font-medium flex items-center gap-1 transition-colors"
                      >
                        <Plus className="w-3 h-3" />
                        <span>Karten generieren</span>
                      </button>
                    )}
                    {rec.suggestedAction === "summary" && (
                      <button
                        onClick={() => onOpenSummary(rec.folderPath || rec.notePath || "")}
                        className="px-3 py-1.5 rounded-lg bg-muted hover:bg-muted/80 text-foreground text-xs font-medium flex items-center gap-1 transition-colors"
                      >
                        <BookOpen className="w-3 h-3" />
                        <span>Zusammenfassung</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-6 rounded-xl border border-dashed border-border/60 text-center text-sm text-muted-foreground">
            Keine offenen Lücken gefunden. Alle Themenbereiche sind aktuell.
          </div>
        )}
      </div>

      {/* Active Learning Goals Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Target className="w-5 h-5 text-amber-400" />
            <h2 className="text-lg font-bold text-foreground">Aktive Lernziele</h2>
          </div>
          <button
            onClick={onCreateGoal}
            className="text-xs text-primary hover:underline flex items-center gap-1"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Neues Ziel festlegen</span>
          </button>
        </div>

        {goals.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {goals.map((goal) => (
              <div
                key={goal.id}
                className="p-4 rounded-xl border border-border/60 bg-card space-y-3"
              >
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-foreground">{goal.title}</h3>
                  <span className="text-xs px-2 py-0.5 rounded bg-muted text-muted-foreground font-mono">
                    {goal.targetCardsPerDay} Karten/Tag
                  </span>
                </div>

                {goal.folderPath && (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Folder className="w-3.5 h-3.5 text-primary" />
                    <span>{goal.folderPath}</span>
                  </div>
                )}

                <div className="pt-2 flex justify-between items-center text-xs">
                  <span className="text-muted-foreground">Fokus-Bereich</span>
                  <button
                    onClick={() => onStartSession(goal.folderPath)}
                    className="text-primary hover:underline flex items-center gap-1"
                  >
                    <span>Karten üben</span>
                    <ArrowRight className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-6 rounded-xl border border-dashed border-border/60 text-center text-sm text-muted-foreground">
            Noch keine Lernziele hinterlegt. Lege ein Tagesziel fest (z. B. 20 Karten/Tag für „Architektur“).
          </div>
        )}
      </div>

      {/* Folder Mastery Breakdown */}
      {stats && stats.folders.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Layers className="w-5 h-5 text-emerald-400" />
              <h2 className="text-lg font-bold text-foreground">Fortschritt nach Themen & Ordnern</h2>
            </div>
            <span className="text-xs text-muted-foreground">{stats.folders.length} Bereiche</span>
          </div>

          <div className="border border-border/60 rounded-xl overflow-hidden bg-card">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-muted/40 border-b border-border/60 text-muted-foreground uppercase tracking-wider font-semibold">
                  <tr>
                    <th className="py-3 px-4">Themen-Ordner</th>
                    <th className="py-3 px-3 text-center">Gesamt</th>
                    <th className="py-3 px-3 text-center">Fällig</th>
                    <th className="py-3 px-3 text-center">Gemeistert</th>
                    <th className="py-3 px-4">Fortschritt</th>
                    <th className="py-3 px-4 text-right">Aktion</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {stats.folders.map((f) => {
                    const percent = Math.round(f.retentionRate * 100);
                    return (
                      <tr key={f.folder} className="hover:bg-muted/20 transition-colors">
                        <td className="py-3 px-4 font-medium text-foreground flex items-center gap-2">
                          <Folder className="w-3.5 h-3.5 text-primary shrink-0" />
                          <span className="truncate max-w-[200px]">{f.folder}</span>
                        </td>
                        <td className="py-3 px-3 text-center font-mono text-muted-foreground">{f.totalCards}</td>
                        <td className="py-3 px-3 text-center">
                          {f.dueCards > 0 ? (
                            <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20 font-mono">
                              {f.dueCards}
                            </span>
                          ) : (
                            <span className="text-muted-foreground font-mono">0</span>
                          )}
                        </td>
                        <td className="py-3 px-3 text-center font-mono text-emerald-400">{f.masteredCards}</td>
                        <td className="py-3 px-4">
                          <div className="w-28 flex items-center gap-2">
                            <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                              <div
                                className="h-full bg-emerald-500 rounded-full"
                                style={{ width: `${percent}%` }}
                              />
                            </div>
                            <span className="text-[11px] font-mono text-muted-foreground">{percent}%</span>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="flex justify-end gap-1.5">
                            {f.dueCards > 0 ? (
                              <button
                                onClick={() => onStartSession(f.folder)}
                                className="px-2.5 py-1 rounded bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90"
                              >
                                Lernen
                              </button>
                            ) : (
                              <button
                                onClick={() => onOpenGenerator(f.folder)}
                                className="px-2.5 py-1 rounded bg-muted hover:bg-muted/80 text-foreground text-xs"
                              >
                                + Karten
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default StudyDashboard;
