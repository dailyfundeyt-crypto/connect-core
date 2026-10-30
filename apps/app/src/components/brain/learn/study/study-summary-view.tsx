/**
 * Study Summary View (Lane 4)
 *
 * Displays AI-generated summaries and key points for notes, folders, and videos.
 * Rule 6 compliant: Strictly cached in DB/memory.
 * Provides a one-click button to propose adding summary to vault via Proposal Queue.
 */

import React, { useState, useEffect } from "react";
import {
  BookOpen,
  Check,
  CheckCircle2,
  Copy,
  ExternalLink,
  FileText,
  Folder,
  Loader2,
  RefreshCw,
  Send,
  Sparkles,
} from "lucide-react";
import type { SummaryItem, SummaryTargetType } from "./types";

interface StudySummaryViewProps {
  initialTargetType?: SummaryTargetType;
  initialTargetId?: string;
  onOpenNote?: (notePath: string) => void;
}

export function StudySummaryView({
  initialTargetType = "folder",
  initialTargetId = "Architektur",
  onOpenNote,
}: StudySummaryViewProps) {
  const [targetType, setTargetType] = useState<SummaryTargetType>(initialTargetType);
  const [targetId, setTargetId] = useState<string>(initialTargetId);
  const [summary, setSummary] = useState<SummaryItem | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isProposing, setIsProposing] = useState(false);
  const [proposalSuccess, setProposalSuccess] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSummary = async (force = false) => {
    if (!targetId.trim()) return;
    setIsLoading(true);
    setError(null);
    setProposalSuccess(false);

    try {
      const res = await fetch("/api/brain/learn/study/summary/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetType,
          targetId: targetId.trim(),
          forceRefresh: force,
          createProposal: false,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Zusammenfassung konnte nicht geladen werden.");
      }

      setSummary(data.summary);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchSummary(false);
  }, [targetType]);

  const handleCreateProposal = async () => {
    if (!summary) return;
    setIsProposing(true);

    try {
      const res = await fetch("/api/brain/learn/study/summary/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetType: summary.targetType,
          targetId: summary.targetId,
          forceRefresh: false,
          createProposal: true,
        }),
      });

      const data = await res.json();
      if (data.proposal) {
        setProposalSuccess(true);
      }
    } catch (err) {
      console.warn("Proposal submission failed:", err);
    } finally {
      setIsProposing(false);
    }
  };

  const copyToClipboard = () => {
    if (!summary) return;
    const text = `# ${summary.title || summary.targetId}\n\n${summary.summary}\n\n### Kernpunkte:\n${summary.keyPoints.map((k) => `- ${k}`).join("\n")}`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto w-full p-4 md:p-6">
      {/* Target Selector Toolbar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-4 bg-card border border-border/60 rounded-2xl shadow-sm">
        <div className="flex items-center gap-2">
          <select
            value={targetType}
            onChange={(e) => setTargetType(e.target.value as SummaryTargetType)}
            className="px-3 py-2 rounded-xl bg-muted/50 border border-border/60 text-xs font-semibold text-foreground"
          >
            <option value="folder">Ordner-Übersicht</option>
            <option value="note">Einzelne Notiz</option>
            <option value="video">YouTube-Video</option>
          </select>

          <input
            type="text"
            value={targetId}
            onChange={(e) => setTargetId(e.target.value)}
            placeholder={
              targetType === "folder"
                ? "z. B. Architektur oder Business"
                : targetType === "note"
                ? "z. B. Architektur/Spark-Learn.md"
                : "Video-ID"
            }
            className="px-3.5 py-2 rounded-xl bg-muted/40 border border-border/60 text-sm text-foreground flex-1 min-w-[200px]"
          />
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => fetchSummary(false)}
            disabled={isLoading}
            className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-semibold flex items-center justify-center gap-1.5 hover:bg-primary/90 disabled:opacity-50"
          >
            {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            <span>Zusammenfassen</span>
          </button>

          <button
            onClick={() => fetchSummary(true)}
            disabled={isLoading}
            className="p-2 rounded-xl bg-muted/60 text-muted-foreground hover:text-foreground hover:bg-muted text-xs"
            title="Neu generieren (Cache umgehen)"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm">
          {error}
        </div>
      )}

      {/* Summary Content Card */}
      {summary && (
        <div className="bg-card border border-border/60 rounded-2xl p-6 md:p-8 space-y-6 shadow-sm">
          {/* Header */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/40 pb-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-primary/10 text-primary border border-primary/20 flex items-center gap-1">
                  {summary.targetType === "folder" ? (
                    <Folder className="w-3 h-3" />
                  ) : summary.targetType === "note" ? (
                    <FileText className="w-3 h-3" />
                  ) : (
                    <BookOpen className="w-3 h-3" />
                  )}
                  {summary.targetType === "folder" ? "Themen-Zusammenfassung" : "Notiz-Zusammenfassung"}
                </span>
                <span className="text-xs text-muted-foreground">Cache aktiv</span>
              </div>
              <h2 className="text-xl md:text-2xl font-bold text-foreground">{summary.title || summary.targetId}</h2>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={copyToClipboard}
                className="px-3 py-1.5 rounded-lg bg-muted text-muted-foreground hover:text-foreground text-xs font-medium flex items-center gap-1.5 transition-colors"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? "Kopiert" : "Kopieren"}</span>
              </button>

              {onOpenNote && summary.targetType === "note" && (
                <button
                  onClick={() => onOpenNote(summary.targetId)}
                  className="px-3 py-1.5 rounded-lg bg-muted text-muted-foreground hover:text-foreground text-xs font-medium flex items-center gap-1.5 transition-colors"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Notiz öffnen</span>
                </button>
              )}
            </div>
          </div>

          {/* Executive Summary Paragraph */}
          <div className="space-y-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Kern-Zusammenfassung
            </span>
            <p className="text-base text-foreground leading-relaxed bg-muted/20 p-4 rounded-xl border border-border/40">
              {summary.summary}
            </p>
          </div>

          {/* Key Takeaways */}
          {summary.keyPoints && summary.keyPoints.length > 0 && (
            <div className="space-y-3">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Zentrale Erkenntnisse & Kernaussagen
              </span>
              <ul className="space-y-2.5">
                {summary.keyPoints.map((point, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-3 text-sm text-foreground bg-muted/10 p-3 rounded-xl border border-border/30"
                  >
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    <span className="leading-relaxed">{point}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Proposal Action Footer (Rule 6 compliant) */}
          <div className="pt-4 border-t border-border/40 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="text-xs text-muted-foreground">
              <span className="font-semibold text-foreground/80">Vault-Schutz (Regel 6):</span> Zusammenfassungen werden
              ausschließlich im Cache gehalten, niemals ohne Freigabe in Notizen geschrieben.
            </div>

            {proposalSuccess ? (
              <span className="px-4 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4" />
                Vorschlag in Proposal-Queue eingereicht!
              </span>
            ) : (
              <button
                onClick={handleCreateProposal}
                disabled={isProposing}
                className="px-4 py-2 rounded-xl bg-muted/80 hover:bg-muted text-foreground text-xs font-semibold flex items-center gap-2 transition-colors shrink-0"
                title="Erstellt einen Freigabe-Vorschlag für die Proposal-Queue von Lane 6"
              >
                {isProposing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                <span>Als Vorschlag für Notiz einreichen</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default StudySummaryView;
