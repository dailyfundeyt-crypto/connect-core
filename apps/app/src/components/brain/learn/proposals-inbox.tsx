/**
 * Proposals Inbox & Self-Improvement Dashboard (Lane 6)
 *
 * Provides:
 * - Proposal list with status filters (pending, approved, rejected, applied) and kind filters
 * - Unified diff preview modal for review
 * - Safe Apply with automatic .bak backup
 * - Reject with feedback for self-improvement learning
 * - Autonomous & on-demand Gardener job execution
 * - Learning statistics & dynamic threshold visualization
 */

import {
  IconCheck,
  IconX,
  IconSparkles,
  IconRefresh,
  IconGitPullRequest,
  IconFileText,
  IconFolder,
  IconLink,
  IconTag,
  IconLayersIntersect,
  IconAlertCircle,
  IconInfoCircle,
  IconPlayerPlay,
  IconBrain,
  IconEye,
  IconShieldCheck,
  IconArrowRight,
} from "@tabler/icons-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export type ProposalKind =
  | "new_note"
  | "add_link"
  | "move"
  | "merge"
  | "tag"
  | "summary";

export type ProposalStatus = "pending" | "approved" | "rejected" | "applied";

export interface Proposal {
  id: string;
  kind: ProposalKind;
  payload: Record<string, unknown>;
  diff?: string;
  rationale: string;
  sources: string[];
  status: ProposalStatus;
  decidedAt?: string;
  appliedAt?: string;
  createdAt?: string;
  rejectionReason?: string;
}

export interface LearningStats {
  totalProposed: number;
  totalApproved: number;
  totalRejected: number;
  approvalRateByKind: Record<
    ProposalKind,
    { approved: number; rejected: number; rate: number }
  >;
  currentThresholds: {
    minLinkSimilarity: number;
    minDuplicateSimilarity: number;
    autoAskHumanImpact: "low" | "medium" | "high";
  };
}

const KIND_META: Record<
  ProposalKind,
  { label: string; icon: typeof IconFileText; color: string }
> = {
  new_note: { label: "Neue Notiz", icon: IconFileText, color: "text-blue-600 bg-blue-50 border-blue-200" },
  add_link: { label: "Link hinzufügen", icon: IconLink, color: "text-emerald-600 bg-emerald-50 border-emerald-200" },
  move: { label: "Verschieben", icon: IconFolder, color: "text-amber-600 bg-amber-50 border-amber-200" },
  merge: { label: "Zusammenführen", icon: IconLayersIntersect, color: "text-purple-600 bg-purple-50 border-purple-200" },
  tag: { label: "Taggen", icon: IconTag, color: "text-indigo-600 bg-indigo-50 border-indigo-200" },
  summary: { label: "Zusammenfassung", icon: IconSparkles, color: "text-cyan-600 bg-cyan-50 border-cyan-200" },
};

const STATUS_META: Record<ProposalStatus, { label: string; badgeClass: string }> = {
  pending: { label: "Ausstehend", badgeClass: "bg-amber-100 text-amber-800 border-amber-300" },
  approved: { label: "Freigegeben", badgeClass: "bg-emerald-100 text-emerald-800 border-emerald-300" },
  rejected: { label: "Abgelehnt", badgeClass: "bg-rose-100 text-rose-800 border-rose-300" },
  applied: { label: "Angewendet", badgeClass: "bg-blue-100 text-blue-800 border-blue-300" },
};

async function fetchProposals(): Promise<Proposal[]> {
  const res = await fetch("/api/brain/learn/proposals");
  if (!res.ok) throw new Error("Fehler beim Laden der Vorschläge");
  const data = await res.json();
  return data.proposals || [];
}

async function fetchStats(): Promise<LearningStats> {
  const res = await fetch("/api/brain/learn/proposals/stats");
  if (!res.ok) throw new Error("Fehler beim Laden der Lernstatistiken");
  const data = await res.json();
  return data.stats;
}

export function ProposalsInbox() {
  const queryClient = useQueryClient();
  const [selectedStatus, setSelectedStatus] = useState<string>("all");
  const [selectedKind, setSelectedKind] = useState<string>("all");
  const [activeDiffProposal, setActiveDiffProposal] = useState<Proposal | null>(null);
  const [rejectingProposal, setRejectingProposal] = useState<Proposal | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [gardenerOpen, setGardenerOpen] = useState(false);
  const [selectedJob, setSelectedJob] = useState<string>("all");
  const [statsOpen, setStatsOpen] = useState(false);

  const proposalsQuery = useQuery({
    queryKey: ["brain", "learn", "proposals"],
    queryFn: fetchProposals,
    refetchInterval: 15000,
  });

  const statsQuery = useQuery({
    queryKey: ["brain", "learn", "proposals", "stats"],
    queryFn: fetchStats,
  });

  const approveMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/brain/learn/proposals/${id}/approve`, { method: "POST" });
      if (!res.ok) throw new Error("Konnte Vorschlag nicht freigeben");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["brain", "learn", "proposals"] });
      queryClient.invalidateQueries({ queryKey: ["brain", "learn", "proposals", "stats"] });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const res = await fetch(`/api/brain/learn/proposals/${id}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      if (!res.ok) throw new Error("Konnte Vorschlag nicht ablehnen");
      return res.json();
    },
    onSuccess: () => {
      setRejectingProposal(null);
      setRejectionReason("");
      queryClient.invalidateQueries({ queryKey: ["brain", "learn", "proposals"] });
      queryClient.invalidateQueries({ queryKey: ["brain", "learn", "proposals", "stats"] });
    },
  });

  const applyMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/brain/learn/proposals/${id}/apply`, { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Konnte Vorschlag nicht anwenden");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["brain", "learn", "proposals"] });
      queryClient.invalidateQueries({ queryKey: ["brain", "learn", "proposals", "stats"] });
    },
  });

  const gardenerMutation = useMutation({
    mutationFn: async (kind: string) => {
      const res = await fetch("/api/brain/learn/proposals/gardener/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind }),
      });
      if (!res.ok) throw new Error("Gärtner-Lauf fehlgeschlagen");
      return res.json();
    },
    onSuccess: () => {
      setGardenerOpen(false);
      queryClient.invalidateQueries({ queryKey: ["brain", "learn", "proposals"] });
      queryClient.invalidateQueries({ queryKey: ["brain", "learn", "proposals", "stats"] });
    },
  });

  const proposals = proposalsQuery.data || [];
  const stats = statsQuery.data;

  const counts = useMemo(() => {
    return {
      all: proposals.length,
      pending: proposals.filter((p) => p.status === "pending").length,
      approved: proposals.filter((p) => p.status === "approved").length,
      rejected: proposals.filter((p) => p.status === "rejected").length,
      applied: proposals.filter((p) => p.status === "applied").length,
    };
  }, [proposals]);

  const filtered = useMemo(() => {
    return proposals.filter((p) => {
      if (selectedStatus !== "all" && p.status !== selectedStatus) return false;
      if (selectedKind !== "all" && p.kind !== selectedKind) return false;
      return true;
    });
  }, [proposals, selectedStatus, selectedKind]);

  if (proposalsQuery.isPending) {
    return (
      <div className="flex flex-col gap-4 p-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-6 max-w-6xl mx-auto" data-testid="spark-proposals-inbox">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-border">
        <div>
          <div className="flex items-center gap-2">
            <IconSparkles className="size-6 text-amber-500" />
            <h1 className="text-xl font-semibold tracking-tight">Vorschläge & Selbstverbesserung</h1>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Einziger Schreibpfad für Agenten in den Vault: Vorschlag → Stefan genehmigt → Anwenden mit automatischem Backup.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {stats && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setStatsOpen(true)}
              className="gap-1.5 text-xs"
            >
              <IconBrain className="size-4 text-purple-600" />
              Lern-Status
              <span className="ml-1 rounded-full bg-purple-100 px-1.5 py-0.5 text-[10px] text-purple-700">
                {(stats.currentThresholds.minLinkSimilarity * 100).toFixed(0)}% Schwelle
              </span>
            </Button>
          )}

          <Button
            variant="default"
            size="sm"
            onClick={() => setGardenerOpen(true)}
            className="gap-1.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            <IconPlayerPlay className="size-4" />
            Gärtner ausführen
          </Button>

          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => proposalsQuery.refetch()}
            title="Aktualisieren"
          >
            <IconRefresh className={cn("size-4", proposalsQuery.isFetching && "animate-spin")} />
          </Button>
        </div>
      </div>

      {/* Status Filter Tabs */}
      <div className="flex flex-wrap items-center gap-2">
        {[
          { key: "all", label: "Alle", count: counts.all },
          { key: "pending", label: "Ausstehend", count: counts.pending, alert: counts.pending > 0 },
          { key: "approved", label: "Freigegeben", count: counts.approved },
          { key: "applied", label: "Angewendet", count: counts.applied },
          { key: "rejected", label: "Abgelehnt", count: counts.rejected },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setSelectedStatus(tab.key)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border",
              selectedStatus === tab.key
                ? "bg-foreground text-background border-foreground shadow-xs"
                : "bg-background text-muted-foreground border-border hover:bg-muted/60",
            )}
          >
            <span>{tab.label}</span>
            <span
              className={cn(
                "rounded-full px-1.5 py-0.2 text-[10px]",
                selectedStatus === tab.key
                  ? "bg-background/20 text-background"
                  : tab.alert
                    ? "bg-amber-100 text-amber-800 font-semibold"
                    : "bg-muted text-muted-foreground",
              )}
            >
              {tab.count}
            </span>
          </button>
        ))}

        <div className="ml-auto flex items-center gap-1 overflow-x-auto py-1">
          <button
            onClick={() => setSelectedKind("all")}
            className={cn(
              "px-2.5 py-1 text-[11px] rounded-md transition-colors",
              selectedKind === "all" ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            Alle Arten
          </button>
          {Object.entries(KIND_META).map(([k, meta]) => (
            <button
              key={k}
              onClick={() => setSelectedKind(k)}
              className={cn(
                "px-2.5 py-1 text-[11px] rounded-md transition-colors",
                selectedKind === k ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {meta.label}
            </button>
          ))}
        </div>
      </div>

      {/* Proposals List */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-12 text-center rounded-xl border border-dashed border-border bg-card/40">
          <IconGitPullRequest className="size-10 text-muted-foreground/60 mb-2" />
          <p className="font-medium text-sm">Keine Vorschläge in dieser Ansicht</p>
          <p className="text-xs text-muted-foreground max-w-md mt-1">
            Starte den Gärtner über die Schaltfläche oben rechts, um automatische Vorschläge für Wikilinks, Duplikate oder Strukturverbesserungen zu generieren.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {filtered.map((proposal) => {
            const kindMeta = KIND_META[proposal.kind] || KIND_META.new_note;
            const statusMeta = STATUS_META[proposal.status] || STATUS_META.pending;
            const Icon = kindMeta.icon;

            return (
              <div
                key={proposal.id}
                className={cn(
                  "flex flex-col gap-3 p-4 rounded-xl border bg-card transition-shadow hover:shadow-xs",
                  proposal.status === "pending" ? "border-amber-200/80 bg-amber-50/15" : "border-border",
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium border",
                        kindMeta.color,
                      )}
                    >
                      <Icon className="size-3.5" />
                      {kindMeta.label}
                    </span>

                    <span
                      className={cn(
                        "inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border",
                        statusMeta.badgeClass,
                      )}
                    >
                      {statusMeta.label}
                    </span>

                    {proposal.createdAt && (
                      <span className="text-[11px] text-muted-foreground">
                        {new Date(proposal.createdAt).toLocaleString("de-DE", {
                          dateStyle: "short",
                          timeStyle: "short",
                        })}
                      </span>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    {proposal.diff && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setActiveDiffProposal(proposal)}
                        className="gap-1 text-xs h-7 px-2.5"
                      >
                        <IconEye className="size-3.5" />
                        Diff
                      </Button>
                    )}

                    {proposal.status === "pending" && (
                      <>
                        <Button
                          variant="default"
                          size="sm"
                          onClick={() => approveMutation.mutate(proposal.id)}
                          disabled={approveMutation.isPending}
                          className="gap-1 text-xs h-7 px-2.5 bg-emerald-600 hover:bg-emerald-700 text-white"
                        >
                          <IconCheck className="size-3.5" />
                          Freigeben
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setRejectingProposal(proposal)}
                          className="gap-1 text-xs h-7 px-2.5 text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                        >
                          <IconX className="size-3.5" />
                          Ablehnen
                        </Button>
                      </>
                    )}

                    {proposal.status === "approved" && (
                      <Button
                        variant="default"
                        size="sm"
                        onClick={() => applyMutation.mutate(proposal.id)}
                        disabled={applyMutation.isPending}
                        className="gap-1.5 text-xs h-7 px-3 bg-blue-600 hover:bg-blue-700 text-white"
                      >
                        <IconShieldCheck className="size-3.5" />
                        Anwenden (.bak Backup)
                      </Button>
                    )}

                    {proposal.status === "applied" && (
                      <span className="inline-flex items-center gap-1 text-xs text-blue-700 font-medium bg-blue-50 px-2 py-0.5 rounded-md border border-blue-200">
                        <IconShieldCheck className="size-3.5" />
                        Angewendet
                      </span>
                    )}
                  </div>
                </div>

                {/* Target & Rationale */}
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-1.5 text-xs font-mono text-foreground/80">
                    <span className="text-muted-foreground font-sans">Ziel:</span>
                    <span>
                      {(proposal.payload as any)?.path ||
                        (proposal.payload as any)?.sourcePath ||
                        (proposal.payload as any)?.targetPath ||
                        (proposal.payload as any)?.targetNote ||
                        "Vault"}
                    </span>
                    {(proposal.payload as any)?.destinationPath && (
                      <>
                        <IconArrowRight className="size-3 text-muted-foreground" />
                        <span className="font-semibold">{(proposal.payload as any).destinationPath}</span>
                      </>
                    )}
                  </div>

                  <p className="text-sm text-foreground/90 font-sans leading-relaxed">
                    {proposal.rationale}
                  </p>

                  {proposal.status === "rejected" && proposal.rejectionReason && (
                    <div className="flex items-start gap-1.5 mt-1 p-2 rounded-md bg-rose-50 border border-rose-200 text-xs text-rose-800">
                      <IconAlertCircle className="size-3.5 shrink-0 mt-0.5" />
                      <span><strong>Ablehnungsgrund:</strong> {proposal.rejectionReason}</span>
                    </div>
                  )}

                  {proposal.sources && proposal.sources.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5 mt-1">
                      <span className="text-[10px] text-muted-foreground">Quellen:</span>
                      {proposal.sources.map((src) => (
                        <span
                          key={src}
                          className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-mono"
                        >
                          {src}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Diff Preview Dialog */}
      <Dialog
        open={Boolean(activeDiffProposal)}
        onOpenChange={(open) => !open && setActiveDiffProposal(null)}
      >
        <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <IconEye className="size-5 text-muted-foreground" />
              Diff-Vorschau: {activeDiffProposal && KIND_META[activeDiffProposal.kind]?.label}
            </DialogTitle>
            <DialogDescription>
              {activeDiffProposal?.rationale}
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-auto rounded-lg border border-border bg-neutral-900 text-neutral-100 p-4 font-mono text-xs">
            {activeDiffProposal?.diff ? (
              <pre className="whitespace-pre-wrap leading-relaxed">
                {activeDiffProposal.diff.split("\n").map((line, idx) => {
                  let lineClass = "text-neutral-400";
                  if (line.startsWith("+")) lineClass = "text-emerald-400 bg-emerald-950/40 font-medium";
                  else if (line.startsWith("-")) lineClass = "text-rose-400 bg-rose-950/40 font-medium";
                  else if (line.startsWith("@")) lineClass = "text-cyan-400 font-semibold";
                  return (
                    <div key={idx} className={cn("px-1 rounded-xs", lineClass)}>
                      {line}
                    </div>
                  );
                })}
              </pre>
            ) : (
              <div className="text-muted-foreground italic">Kein visueller Diff vorhanden.</div>
            )}
          </div>

          <div className="p-3 bg-muted/40 rounded-lg border text-xs text-muted-foreground flex items-center gap-2">
            <IconShieldCheck className="size-4 text-emerald-600 shrink-0" />
            <span>
              Sicherheitsgarantie: Vor dem Anwenden wird automatisch eine Kopie <code>.bak-helium-20261023</code> erzeugt.
              Notizen werden niemals gelöscht (Move / Merge nur als Kopie + Link).
            </span>
          </div>

          <DialogFooter className="flex items-center justify-between">
            <Button variant="outline" size="sm" onClick={() => setActiveDiffProposal(null)}>
              Schließen
            </Button>
            {activeDiffProposal && activeDiffProposal.status === "pending" && (
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    const p = activeDiffProposal;
                    setActiveDiffProposal(null);
                    setRejectingProposal(p);
                  }}
                  className="text-rose-600 hover:bg-rose-50"
                >
                  Ablehnen
                </Button>
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => {
                    approveMutation.mutate(activeDiffProposal.id);
                    setActiveDiffProposal(null);
                  }}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  Freigeben
                </Button>
              </div>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject with Feedback Modal */}
      <Dialog
        open={Boolean(rejectingProposal)}
        onOpenChange={(open) => !open && setRejectingProposal(null)}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Vorschlag ablehnen</DialogTitle>
            <DialogDescription>
              Dein Feedback hilft der Selbstverbesserungs-Engine zu lernen und künftig passendere Vorschläge zu generieren.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-3 py-2">
            <label className="text-xs font-medium text-foreground">
              Grund der Ablehnung (optional):
            </label>
            <Input
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              placeholder="z. B. Themen sind zu weit voneinander entfernt / Notiz soll eigenständig bleiben"
              className="text-xs"
            />
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setRejectingProposal(null)}>
              Abbrechen
            </Button>
            <Button
              variant="default"
              size="sm"
              disabled={rejectMutation.isPending}
              onClick={() => {
                if (rejectingProposal) {
                  rejectMutation.mutate({ id: rejectingProposal.id, reason: rejectionReason });
                }
              }}
              className="bg-rose-600 hover:bg-rose-700 text-white"
            >
              Ablehnen & Feedback speichern
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Gardener Trigger Modal */}
      <Dialog open={gardenerOpen} onOpenChange={setGardenerOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <IconPlayerPlay className="size-5 text-emerald-600" />
              Gärtner-Wartungslauf starten
            </DialogTitle>
            <DialogDescription>
              Wähle die automatischen Pflegemaßnahmen für deinen Vault:
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-2 py-2">
            {[
              { id: "all", title: "Alle Scans", desc: "Wikilinks, Duplikate, verwaiste Notizen und Struktur" },
              { id: "missing_links", title: "Fehlende Wikilinks", desc: "Findet nicht verlinkte Begriffe und semantische Nähe" },
              { id: "duplicates", title: "Duplikate erkennen", desc: "Sucht thematisch identische Notizen zum Zusammenführen" },
              { id: "orphans", title: "Verwaiste Notizen", desc: "Findet Notizen ohne eingehende oder ausgehende Links" },
              { id: "folders", title: "Ordner-Vorschläge", desc: "Sortiert lose Notizen aus der Root-Ebene in Themenordner" },
              { id: "summaries", title: "Zusammenfassungs-Notizen", desc: "Erstellt Übersichtsvorschläge für dichte Ordner" },
            ].map((opt) => (
              <label
                key={opt.id}
                onClick={() => setSelectedJob(opt.id)}
                className={cn(
                  "flex items-start gap-3 p-2.5 rounded-lg border cursor-pointer transition-colors",
                  selectedJob === opt.id
                    ? "bg-emerald-50 border-emerald-300 text-emerald-950"
                    : "hover:bg-muted/50 border-border text-foreground",
                )}
              >
                <input
                  type="radio"
                  name="gardener_job"
                  checked={selectedJob === opt.id}
                  onChange={() => setSelectedJob(opt.id)}
                  className="mt-1"
                />
                <div>
                  <p className="text-xs font-semibold">{opt.title}</p>
                  <p className="text-[11px] text-muted-foreground">{opt.desc}</p>
                </div>
              </label>
            ))}
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setGardenerOpen(false)}>
              Abbrechen
            </Button>
            <Button
              variant="default"
              size="sm"
              disabled={gardenerMutation.isPending}
              onClick={() => gardenerMutation.mutate(selectedJob)}
              className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5"
            >
              {gardenerMutation.isPending && <IconRefresh className="size-3.5 animate-spin" />}
              Scan starten
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Learning Stats Dialog */}
      <Dialog open={statsOpen} onOpenChange={setStatsOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <IconBrain className="size-5 text-purple-600" />
              Selbstverbesserungs-Status (Self-Improvement)
            </DialogTitle>
            <DialogDescription>
              Aktuelle Schwellenwerte und historische Zustimmungsraten des Gärtners:
            </DialogDescription>
          </DialogHeader>

          {stats && (
            <div className="flex flex-col gap-4 py-2 text-xs">
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="p-3 rounded-lg border bg-muted/30">
                  <span className="text-lg font-bold text-foreground">{stats.totalProposed}</span>
                  <p className="text-[11px] text-muted-foreground">Vorschläge gesamt</p>
                </div>
                <div className="p-3 rounded-lg border bg-emerald-50/50 border-emerald-200">
                  <span className="text-lg font-bold text-emerald-700">{stats.totalApproved}</span>
                  <p className="text-[11px] text-emerald-800">Freigegeben</p>
                </div>
                <div className="p-3 rounded-lg border bg-rose-50/50 border-rose-200">
                  <span className="text-lg font-bold text-rose-700">{stats.totalRejected}</span>
                  <p className="text-[11px] text-rose-800">Abgelehnt</p>
                </div>
              </div>

              <div>
                <h4 className="font-semibold text-foreground mb-1.5">Aktuelle Schwellenwerte:</h4>
                <div className="flex flex-col gap-1.5 p-3 rounded-lg border bg-card">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Min. Link-Ähnlichkeit:</span>
                    <span className="font-mono font-medium">{(stats.currentThresholds.minLinkSimilarity * 100).toFixed(1)}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Min. Duplikat-Ähnlichkeit:</span>
                    <span className="font-mono font-medium">{(stats.currentThresholds.minDuplicateSimilarity * 100).toFixed(1)}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Stefan benachrichtigen bei Impact:</span>
                    <span className="font-mono font-medium">{stats.currentThresholds.autoAskHumanImpact}</span>
                  </div>
                </div>
              </div>

              <div>
                <h4 className="font-semibold text-foreground mb-1.5">Zustimmungsrate nach Typ:</h4>
                <div className="flex flex-col gap-1.5">
                  {Object.entries(stats.approvalRateByKind).map(([kind, kStats]) => (
                    <div key={kind} className="flex items-center justify-between p-2 rounded border bg-card text-[11px]">
                      <span>{KIND_META[kind as ProposalKind]?.label || kind}</span>
                      <span className="font-mono text-muted-foreground">
                        {kStats.approved} frei / {kStats.rejected} abg. ({ (kStats.rate * 100).toFixed(0) }%)
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setStatsOpen(false)}>
              Schließen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
