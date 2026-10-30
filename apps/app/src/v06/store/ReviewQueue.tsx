/**
 * Store Admin Review Queue (v06)
 * Review and approval interface for Stefan / Admins.
 * Allows inspecting packages awaiting moderation and approving or rejecting them.
 */

import React, { useState, useEffect, useCallback } from "react";
import {
  IconX,
  IconCheck,
  IconBan,
  IconRefresh,
  IconShieldCheck,
  IconAlertTriangle,
  IconFileCode,
  IconLoader2,
  IconCpu,
  IconTool,
  IconSparkles,
  IconBuildingStore,
} from "@tabler/icons-react";
import { cn } from "@/lib/utils";
import type { StoreListing, StoreKind, ReviewResult } from "./types";
import { PERMISSION_DEFINITIONS } from "./types";

export interface ReviewQueueProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fetchQueue: () => Promise<StoreListing[]>;
  onReview: (listingId: string, action: "approve" | "reject", reason?: string) => Promise<ReviewResult>;
  onListingUpdated?: () => void;
}

const KIND_ICONS: Record<StoreKind, React.ComponentType<{ size?: number; className?: string }>> = {
  mcp: IconCpu,
  tool: IconTool,
  skill: IconSparkles,
  company: IconBuildingStore,
};

export function ReviewQueue({
  open,
  onOpenChange,
  fetchQueue,
  onReview,
  onListingUpdated,
}: ReviewQueueProps) {
  const [items, setItems] = useState<StoreListing[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedItem, setSelectedItem] = useState<StoreListing | null>(null);
  const [rejectReason, setRejectReason] = useState<string>("");
  const [isRejecting, setIsRejecting] = useState<boolean>(false);
  const [actionLoading, setActionLoading] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const loadQueue = useCallback(async () => {
    setLoading(true);
    setFeedback(null);
    try {
      const data = await fetchQueue();
      setItems(data);
      if (data.length > 0 && !selectedItem) {
        setSelectedItem(data[0]);
      }
    } catch {
      setFeedback({ type: "error", message: "Fehler beim Laden der Review-Warteschlange." });
    } finally {
      setLoading(false);
    }
  }, [fetchQueue, selectedItem]);

  useEffect(() => {
    if (open) {
      void loadQueue();
    }
  }, [open, loadQueue]);

  if (!open) return null;

  const handleApprove = async (item: StoreListing) => {
    setActionLoading(true);
    setFeedback(null);
    try {
      const res = await onReview(item.id, "approve");
      if (res.ok) {
        setFeedback({ type: "success", message: `Paket '${item.name}' wurde freigegeben und ist nun im Store veröffentlicht!` });
        setItems((prev) => prev.filter((i) => i.id !== item.id));
        setSelectedItem(null);
        if (onListingUpdated) onListingUpdated();
      } else {
        setFeedback({ type: "error", message: res.error || "Freigabe fehlgeschlagen." });
      }
    } catch (err: any) {
      setFeedback({ type: "error", message: err?.message || "Fehler beim Ausführen der Freigabe." });
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async (item: StoreListing) => {
    setActionLoading(true);
    setFeedback(null);
    try {
      const res = await onReview(item.id, "reject", rejectReason.trim() || "Entspricht nicht den Richtlinien");
      if (res.ok) {
        setFeedback({ type: "success", message: `Paket '${item.name}' wurde abgelehnt.` });
        setItems((prev) => prev.filter((i) => i.id !== item.id));
        setSelectedItem(null);
        setIsRejecting(false);
        setRejectReason("");
        if (onListingUpdated) onListingUpdated();
      } else {
        setFeedback({ type: "error", message: res.error || "Ablehnung fehlgeschlagen." });
      }
    } catch (err: any) {
      setFeedback({ type: "error", message: err?.message || "Fehler beim Ausführen der Ablehnung." });
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in"
    >
      <div
        className={cn(
          "relative w-full max-w-4xl max-h-[92vh] overflow-hidden rounded-3xl bg-card border border-border/80 shadow-2xl",
          "flex flex-col text-foreground animate-in zoom-in-95",
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/10 text-amber-500 flex items-center justify-center border border-amber-500/30">
              <IconShieldCheck size={22} />
            </div>
            <div>
              <h2 className="text-lg font-bold">Admin Review Queue</h2>
              <p className="text-xs text-muted-foreground">
                Stefan Moderations-Konsole · {items.length} Paket{items.length === 1 ? "" : "e"} ausstehend
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={loadQueue}
              disabled={loading}
              className="p-2 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
              aria-label="Aktualisieren"
            >
              <IconRefresh size={18} className={cn(loading && "animate-spin")} />
            </button>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="p-2 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
              aria-label="Schließen"
            >
              <IconX size={20} />
            </button>
          </div>
        </div>

        {/* Feedback Alert */}
        {feedback && (
          <div
            className={cn(
              "px-6 py-3 text-xs font-semibold flex items-center justify-between",
              feedback.type === "success"
                ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-b border-emerald-500/30"
                : "bg-destructive/15 text-destructive border-b border-destructive/30",
            )}
          >
            <span>{feedback.message}</span>
            <button type="button" onClick={() => setFeedback(null)} className="text-muted-foreground hover:text-foreground">
              <IconX size={14} />
            </button>
          </div>
        )}

        {/* Main Body */}
        <div className="flex-1 overflow-hidden grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-border/50">
          {/* Left Column: List of Pending Items */}
          <div className="p-4 overflow-y-auto flex flex-col gap-2 max-h-[40vh] md:max-h-none">
            {loading ? (
              <div className="flex items-center justify-center py-12 text-muted-foreground text-xs gap-2">
                <IconLoader2 size={16} className="animate-spin" />
                <span>Lade ausstehende Pakete...</span>
              </div>
            ) : items.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground text-xs gap-2">
                <IconCheck size={28} className="text-emerald-500" />
                <span>Keine Pakete in Prüfung. Alles freigegeben!</span>
              </div>
            ) : (
              items.map((it) => {
                const Icon = KIND_ICONS[it.kind] || IconTool;
                const isSelected = selectedItem?.id === it.id;
                return (
                  <button
                    key={it.id}
                    type="button"
                    onClick={() => {
                      setSelectedItem(it);
                      setIsRejecting(false);
                    }}
                    className={cn(
                      "flex items-start gap-3 p-3 rounded-2xl border text-left transition-all min-h-[60px]",
                      isSelected
                        ? "bg-primary/10 border-primary text-foreground shadow-sm"
                        : "bg-muted/30 border-border/50 hover:bg-muted/60 text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <div className="w-10 h-10 rounded-xl bg-muted border border-border/50 overflow-hidden shrink-0 flex items-center justify-center">
                      {it.iconUrl ? (
                        <img src={it.iconUrl} alt={it.name} className="w-full h-full object-cover" />
                      ) : (
                        <Icon size={20} className="text-primary" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-xs font-bold text-foreground truncate">{it.name}</span>
                        <span className="text-[10px] text-muted-foreground font-mono">v{it.version}</span>
                      </div>
                      <p className="text-[11px] text-muted-foreground truncate mt-0.5">{it.summary}</p>
                    </div>
                  </button>
                );
              })
            )}
          </div>

          {/* Right Column: Detail & Actions */}
          <div className="p-6 md:col-span-2 overflow-y-auto flex flex-col justify-between gap-6">
            {selectedItem ? (
              <div className="flex flex-col gap-5">
                {/* Header item */}
                <div className="flex items-start gap-4">
                  <div className="w-16 h-16 rounded-2xl bg-muted border border-border overflow-hidden shrink-0 flex items-center justify-center">
                    <img src={selectedItem.iconUrl || "/brand/connect-logo.png"} alt={selectedItem.name} className="w-full h-full object-cover" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-lg font-bold text-foreground">{selectedItem.name}</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Slug: <code>{selectedItem.slug}</code> · Version: <code>{selectedItem.version}</code> · Kind: <strong>{selectedItem.kind.toUpperCase()}</strong>
                    </p>
                    <p className="text-xs text-primary font-medium mt-1">Autor: @{selectedItem.authorId}</p>
                  </div>
                </div>

                {/* Summary & Description */}
                <div className="flex flex-col gap-1.5">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Beschreibung</span>
                  <div className="p-3.5 rounded-2xl bg-muted/40 border border-border/60 text-xs text-foreground/90 leading-relaxed whitespace-pre-line">
                    {selectedItem.description || selectedItem.summary}
                  </div>
                </div>

                {/* Permissions */}
                <div className="flex flex-col gap-1.5">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Deklarierte Berechtigungen</span>
                  <div className="p-3 rounded-2xl bg-muted/30 border border-border/50 text-xs text-muted-foreground">
                    {(() => {
                      const spec = (selectedItem.installSpec as any) || {};
                      const perms: string[] = spec.permissions || (selectedItem as any).permissions || [];
                      if (perms.length === 0) return "Keine Berechtigungen angefordert.";
                      return (
                        <div className="flex flex-wrap gap-1.5">
                          {perms.map((p) => {
                            const def = (PERMISSION_DEFINITIONS as Record<string, any>)[p];
                            return (
                              <span
                                key={p}
                                className={cn(
                                  "px-2 py-0.5 rounded-md text-[11px] font-semibold border",
                                  def?.risk === "high"
                                    ? "bg-amber-500/15 border-amber-500/30 text-amber-600 dark:text-amber-400"
                                    : "bg-muted border-border text-foreground",
                                )}
                              >
                                {def?.label || p}
                              </span>
                            );
                          })}
                        </div>
                      );
                    })()}
                  </div>
                </div>

                {/* installSpec Inspector */}
                <div className="flex flex-col gap-1.5">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">installSpec</span>
                  <pre className="p-3 rounded-2xl bg-muted/60 border border-border/60 text-[11px] font-mono text-muted-foreground overflow-x-auto max-h-36">
                    {JSON.stringify(selectedItem.installSpec, null, 2)}
                  </pre>
                </div>

                {/* Reject Input */}
                {isRejecting && (
                  <div className="p-4 rounded-2xl bg-destructive/10 border border-destructive/20 flex flex-col gap-2">
                    <label className="text-xs font-bold text-destructive">Begründung für die Ablehnung:</label>
                    <input
                      type="text"
                      placeholder="z.B. Sicherheitsbedenken oder unvollständige Spezifikation..."
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                      className="px-3.5 py-2 rounded-xl bg-card border border-destructive/30 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-destructive"
                    />
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-20 text-muted-foreground text-xs">
                <span>Wählen Sie ein Paket aus der linken Liste aus, um es zu prüfen.</span>
              </div>
            )}

            {/* Actions Footer */}
            {selectedItem && (
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-border/50">
                {isRejecting ? (
                  <>
                    <button
                      type="button"
                      onClick={() => setIsRejecting(false)}
                      disabled={actionLoading}
                      className="min-h-[44px] px-4 py-2 rounded-full text-xs font-medium text-muted-foreground hover:bg-muted"
                    >
                      Abbrechen
                    </button>
                    <button
                      type="button"
                      onClick={() => handleReject(selectedItem)}
                      disabled={actionLoading}
                      className="min-h-[44px] px-5 py-2 rounded-full bg-destructive text-destructive-foreground text-xs font-bold hover:bg-destructive/90 flex items-center gap-1.5 transition-all"
                    >
                      {actionLoading ? <IconLoader2 size={14} className="animate-spin" /> : <IconBan size={14} />}
                      <span>Ablehnung bestätigen</span>
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => setIsRejecting(true)}
                      disabled={actionLoading}
                      className="min-h-[44px] px-5 py-2 rounded-full bg-muted border border-border text-xs font-semibold hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30 transition-colors flex items-center gap-1.5"
                    >
                      <IconBan size={14} />
                      <span>Ablehnen</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleApprove(selectedItem)}
                      disabled={actionLoading}
                      className="min-h-[44px] px-6 py-2 rounded-full bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-500 shadow-sm flex items-center gap-1.5 transition-all"
                    >
                      {actionLoading ? <IconLoader2 size={14} className="animate-spin" /> : <IconCheck size={14} />}
                      <span>Freigeben (Publish)</span>
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
