/**
 * Study Analytics & Statistics View (Lane 4)
 *
 * Displays:
 * - Retention rate gauge & FSRS stability metrics
 * - 7-day review activity history
 * - Folder mastery distribution table
 */

import React from "react";
import {
  Activity,
  BarChart3,
  Calendar,
  CheckCircle2,
  Clock,
  Folder,
  Layers,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import type { StudyStats } from "./types";

interface StudyStatsProps {
  stats: StudyStats | null;
  onSelectFolder?: (folder: string) => void;
}

export function StudyStatsView({ stats, onSelectFolder }: StudyStatsProps) {
  if (!stats) {
    return (
      <div className="p-8 text-center text-muted-foreground text-sm">
        Statistiken werden geladen...
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-5xl mx-auto w-full p-4 md:p-6">
      {/* Top Level Metric Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Retention Rate */}
        <div className="bg-card border border-border/60 rounded-2xl p-5 space-y-2 shadow-sm">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-semibold uppercase tracking-wider">Retention-Rate</span>
            <TrendingUp className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="text-2xl md:text-3xl font-extrabold text-cyan-400">
            {stats.overallRetentionRate}%
          </div>
          <span className="text-xs text-muted-foreground block">Ziel: 90% (FSRS Optimierung)</span>
        </div>

        {/* Mastered Cards */}
        <div className="bg-card border border-border/60 rounded-2xl p-5 space-y-2 shadow-sm">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-semibold uppercase tracking-wider">Gemeistert</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl md:text-3xl font-extrabold text-emerald-400">
            {stats.masteredCards}
          </div>
          <span className="text-xs text-muted-foreground block">Stabilität &ge; 21 Tage</span>
        </div>

        {/* In Learning */}
        <div className="bg-card border border-border/60 rounded-2xl p-5 space-y-2 shadow-sm">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-semibold uppercase tracking-wider">In Lernphase</span>
            <Clock className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl md:text-3xl font-extrabold text-amber-400">
            {stats.learningCards + stats.relearningCards}
          </div>
          <span className="text-xs text-muted-foreground block">
            {stats.newCards} neue Karten verfügbar
          </span>
        </div>

        {/* Average Stability */}
        <div className="bg-card border border-border/60 rounded-2xl p-5 space-y-2 shadow-sm">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-semibold uppercase tracking-wider">Ø Stabilität</span>
            <Activity className="w-4 h-4 text-primary" />
          </div>
          <div className="text-2xl md:text-3xl font-extrabold text-foreground">
            {stats.averageStabilityDays} <span className="text-sm font-normal text-muted-foreground">Tage</span>
          </div>
          <span className="text-xs text-muted-foreground block">Gedächtnishalbwertzeit</span>
        </div>
      </div>

      {/* 7-Day Review Activity Bars */}
      <div className="bg-card border border-border/60 rounded-2xl p-6 space-y-4 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-primary" />
            <h3 className="text-base font-bold text-foreground">Wiederholungs-Aktivität (letzte 7 Tage)</h3>
          </div>
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <Calendar className="w-3.5 h-3.5" />
            Tägliche Reviews
          </span>
        </div>

        <div className="grid grid-cols-7 gap-2 pt-4 items-end min-h-[140px]">
          {stats.history.map((day) => {
            const maxVal = Math.max(10, ...stats.history.map((h) => h.count));
            const barHeight = Math.max(8, Math.round((day.count / maxVal) * 100));

            return (
              <div key={day.date} className="flex flex-col items-center gap-2">
                <span className="text-xs font-mono text-muted-foreground">{day.count}</span>
                <div className="w-full max-w-[40px] h-28 bg-muted/40 rounded-lg flex flex-col justify-end p-1">
                  <div
                    className="w-full bg-primary/80 hover:bg-primary rounded transition-all duration-300"
                    style={{ height: `${barHeight}%` }}
                    title={`${day.date}: ${day.count} Reviews (${day.goodOrEasy} erfolgreich)`}
                  />
                </div>
                <span className="text-[11px] font-mono text-muted-foreground">
                  {day.date.slice(5)}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Folder Mastery Table */}
      <div className="bg-card border border-border/60 rounded-2xl p-6 space-y-4 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Layers className="w-5 h-5 text-emerald-400" />
            <h3 className="text-base font-bold text-foreground">Beherrschung pro Ordner & Themenfeld</h3>
          </div>
          <span className="text-xs text-muted-foreground font-mono">{stats.folders.length} Ordner</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-muted/40 border-b border-border/60 text-muted-foreground uppercase font-semibold">
              <tr>
                <th className="py-3 px-4">Ordner</th>
                <th className="py-3 px-3 text-center">Karten</th>
                <th className="py-3 px-3 text-center">Fällig</th>
                <th className="py-3 px-3 text-center">Gemeistert</th>
                <th className="py-3 px-3 text-center">Ø Stabilität</th>
                <th className="py-3 px-4">Retention</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {stats.folders.map((f) => (
                <tr
                  key={f.folder}
                  onClick={() => onSelectFolder && onSelectFolder(f.folder)}
                  className="hover:bg-muted/20 transition-colors cursor-pointer"
                >
                  <td className="py-3 px-4 font-medium text-foreground flex items-center gap-2">
                    <Folder className="w-3.5 h-3.5 text-primary shrink-0" />
                    <span>{f.folder}</span>
                  </td>
                  <td className="py-3 px-3 text-center font-mono text-muted-foreground">{f.totalCards}</td>
                  <td className="py-3 px-3 text-center font-mono">
                    {f.dueCards > 0 ? (
                      <span className="text-rose-400 font-bold">{f.dueCards}</span>
                    ) : (
                      "0"
                    )}
                  </td>
                  <td className="py-3 px-3 text-center font-mono text-emerald-400 font-medium">
                    {f.masteredCards}
                  </td>
                  <td className="py-3 px-3 text-center font-mono text-muted-foreground">
                    {f.averageStability}d
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2">
                      <div className="w-24 h-1.5 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-cyan-400 rounded-full"
                          style={{ width: `${Math.round(f.retentionRate * 100)}%` }}
                        />
                      </div>
                      <span className="text-[11px] font-mono text-muted-foreground">
                        {Math.round(f.retentionRate * 100)}%
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default StudyStatsView;
