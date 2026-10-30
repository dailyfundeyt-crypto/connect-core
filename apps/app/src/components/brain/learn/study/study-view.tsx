/**
 * Spark-Learn Study Mode Master Component (Lane 4)
 *
 * Coordinates:
 * - Dashboard with due queue & "Was als Nächstes" recommendations
 * - Interactive FSRS study session runner
 * - Flashcard generator dialog
 * - Summaries cache viewer
 * - Analytics & folder mastery stats
 */

import React, { useState, useEffect, useCallback } from "react";
import {
  BarChart3,
  BookOpen,
  Calendar,
  Compass,
  FileText,
  Folder,
  Layers,
  Plus,
  RefreshCw,
  Sparkles,
  Target,
  Zap,
} from "lucide-react";
import { StudyDashboard } from "./study-dashboard";
import { StudyGeneratorDialog } from "./study-generator-dialog";
import { StudySession } from "./study-session";
import { StudyStatsView } from "./study-stats";
import { StudySummaryView } from "./study-summary-view";
import type { NextUpRecommendation, StudyGoal, StudyQueueItem, StudyStats } from "./types";

interface StudyViewProps {
  onOpenNote?: (notePath: string, line?: number) => void;
  folderScope?: string;
}

export function StudyView({ onOpenNote, folderScope }: StudyViewProps) {
  const [activeTab, setActiveTab] = useState<"dashboard" | "summaries" | "stats">("dashboard");
  const [isSessionActive, setIsSessionActive] = useState(false);
  const [sessionFolderScope, setSessionFolderScope] = useState<string | undefined>(folderScope);
  const [isGeneratorOpen, setIsGeneratorOpen] = useState(false);
  const [generatorFolder, setGeneratorFolder] = useState<string>("");

  const [queue, setQueue] = useState<StudyQueueItem[]>([]);
  const [stats, setStats] = useState<StudyStats | null>(null);
  const [recommendations, setRecommendations] = useState<NextUpRecommendation[]>([]);
  const [goals, setGoals] = useState<StudyGoal[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Goal creation modal state
  const [isGoalModalOpen, setIsGoalModalOpen] = useState(false);
  const [newGoalTitle, setNewGoalTitle] = useState("");
  const [newGoalFolder, setNewGoalFolder] = useState("");
  const [newGoalTarget, setNewGoalTarget] = useState(20);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const folderParam = folderScope ? `?folder=${encodeURIComponent(folderScope)}` : "";

      const [queueRes, statsRes, recsRes, goalsRes] = await Promise.all([
        fetch(`/api/brain/learn/study/queue${folderParam}`).then((r) => r.json()).catch(() => ({ queue: [] })),
        fetch(`/api/brain/learn/study/stats${folderParam}`).then((r) => r.json()).catch(() => ({ stats: null })),
        fetch(`/api/brain/learn/study/next-up${folderParam}`).then((r) => r.json()).catch(() => ({ recommendations: [] })),
        fetch(`/api/brain/learn/study/goals`).then((r) => r.json()).catch(() => ({ goals: [] })),
      ]);

      if (queueRes.queue) setQueue(queueRes.queue);
      if (statsRes.stats) setStats(statsRes.stats);
      if (recsRes.recommendations) setRecommendations(recsRes.recommendations);
      if (goalsRes.goals) setGoals(goalsRes.goals);
    } catch (err) {
      console.warn("[StudyView] Failed to load study data:", err);
    } finally {
      setIsLoading(false);
    }
  }, [folderScope]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleStartSession = (scope?: string) => {
    setSessionFolderScope(scope);
    setIsSessionActive(true);
  };

  const handleFinishSession = () => {
    setIsSessionActive(false);
    loadData();
  };

  const handleOpenGenerator = (folder?: string) => {
    setGeneratorFolder(folder || "");
    setIsGeneratorOpen(true);
  };

  const handleSaveGoal = async () => {
    if (!newGoalTitle.trim()) return;
    try {
      await fetch("/api/brain/learn/study/goals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: `goal_${Date.now()}`,
          title: newGoalTitle.trim(),
          folderPath: newGoalFolder.trim() || undefined,
          targetCardsPerDay: newGoalTarget,
          active: true,
        }),
      });
      setIsGoalModalOpen(false);
      setNewGoalTitle("");
      setNewGoalFolder("");
      loadData();
    } catch (err) {
      console.warn("Save goal error:", err);
    }
  };

  // If study session is currently running, render full-screen session runner
  if (isSessionActive) {
    const activeQueue = sessionFolderScope
      ? queue.filter((c) => c.notePath.startsWith(sessionFolderScope))
      : queue;

    return (
      <StudySession
        queue={activeQueue}
        onFinish={handleFinishSession}
        onOpenNote={onOpenNote}
      />
    );
  }

  return (
    <div className="flex flex-col h-full w-full bg-background">
      {/* Top Navigation Bar */}
      <div className="border-b border-border/40 px-6 py-3 flex flex-wrap items-center justify-between gap-4 bg-card/60 backdrop-blur-sm sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <h1 className="text-base font-bold text-foreground">Spark-Lernmodus</h1>
            <span className="text-xs text-muted-foreground">FSRS Spaced Repetition & Zusammenfassungen</span>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center gap-1 bg-muted/50 p-1 rounded-xl border border-border/40 text-xs font-medium">
          <button
            onClick={() => setActiveTab("dashboard")}
            className={`px-3 py-1.5 rounded-lg transition-all ${
              activeTab === "dashboard"
                ? "bg-card text-foreground shadow-sm font-semibold"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Lernen & Review
          </button>
          <button
            onClick={() => setActiveTab("summaries")}
            className={`px-3 py-1.5 rounded-lg transition-all ${
              activeTab === "summaries"
                ? "bg-card text-foreground shadow-sm font-semibold"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Zusammenfassungen
          </button>
          <button
            onClick={() => setActiveTab("stats")}
            className={`px-3 py-1.5 rounded-lg transition-all ${
              activeTab === "stats"
                ? "bg-card text-foreground shadow-sm font-semibold"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Statistiken
          </button>
        </div>

        {/* Right Actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => handleOpenGenerator()}
            className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 flex items-center gap-1.5 shadow-sm"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Karten generieren</span>
          </button>
          <button
            onClick={loadData}
            disabled={isLoading}
            className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground"
            title="Aktualisieren"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Main Tab Content */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === "dashboard" && (
          <StudyDashboard
            queue={queue}
            stats={stats}
            recommendations={recommendations}
            goals={goals}
            onStartSession={handleStartSession}
            onOpenGenerator={handleOpenGenerator}
            onOpenSummary={(folder) => {
              setActiveTab("summaries");
            }}
            onCreateGoal={() => setIsGoalModalOpen(true)}
            isLoading={isLoading}
          />
        )}

        {activeTab === "summaries" && (
          <StudySummaryView
            initialTargetType="folder"
            initialTargetId={generatorFolder || "Architektur"}
            onOpenNote={onOpenNote}
          />
        )}

        {activeTab === "stats" && (
          <StudyStatsView
            stats={stats}
            onSelectFolder={(folder) => {
              setGeneratorFolder(folder);
              setActiveTab("dashboard");
            }}
          />
        )}
      </div>

      {/* Flashcard Generator Modal */}
      <StudyGeneratorDialog
        isOpen={isGeneratorOpen}
        onClose={() => setIsGeneratorOpen(false)}
        defaultFolder={generatorFolder}
        onCardsCreated={() => {
          loadData();
        }}
      />

      {/* Goal Creation Modal */}
      {isGoalModalOpen && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl">
            <h3 className="text-base font-bold text-foreground">Neues Lernziel festlegen</h3>

            <div className="space-y-3 text-sm">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground uppercase font-semibold">Titel des Ziels</label>
                <input
                  type="text"
                  value={newGoalTitle}
                  onChange={(e) => setNewGoalTitle(e.target.value)}
                  placeholder="z. B. Business & Strategie meistern"
                  className="w-full px-3 py-2 rounded-xl bg-muted/40 border border-border text-foreground"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs text-muted-foreground uppercase font-semibold">Themen-Ordner (optional)</label>
                <input
                  type="text"
                  value={newGoalFolder}
                  onChange={(e) => setNewGoalFolder(e.target.value)}
                  placeholder="z. B. Business oder Architektur"
                  className="w-full px-3 py-2 rounded-xl bg-muted/40 border border-border text-foreground"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs text-muted-foreground uppercase font-semibold">
                  Tagesziel: {newGoalTarget} Karten / Tag
                </label>
                <input
                  type="range"
                  min={5}
                  max={50}
                  step={5}
                  value={newGoalTarget}
                  onChange={(e) => setNewGoalTarget(Number(e.target.value))}
                  className="w-full accent-primary"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-border/40">
              <button
                onClick={() => setIsGoalModalOpen(false)}
                className="px-4 py-2 rounded-lg bg-muted text-muted-foreground hover:text-foreground text-xs"
              >
                Abbrechen
              </button>
              <button
                onClick={handleSaveGoal}
                disabled={!newGoalTitle.trim()}
                className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 disabled:opacity-50"
              >
                Lernziel speichern
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default StudyView;
