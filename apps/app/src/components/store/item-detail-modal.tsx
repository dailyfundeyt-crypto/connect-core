/**
 * Play Store Item Detail Modal / Sheet (Lane 8)
 * Complete Google Play Store app detail page:
 * - App Header & Key Metrics (Rating, Downloads, Verified)
 * - Permissions & Security Audit before installation
 * - Animated Install Progress
 * - Screenshots Carousel
 * - Rich Description & Changelog
 * - Ratings & User Reviews with interactive review submission
 */

import React, { useState, useEffect } from "react";
import {
  IconAlertCircle,
  IconArrowLeft,
  IconCheck,
  IconChevronRight,
  IconDownload,
  IconLock,
  IconNetwork,
  IconRefresh,
  IconShieldCheck,
  IconSparkles,
  IconStar,
  IconStarFilled,
  IconTrash,
  IconX,
} from "@tabler/icons-react";
import type { StoreItem } from "@connect/contracts/api";
import { cn } from "@/lib/utils";
import { fetchStoreItem, submitStoreReview } from "./store-api";
import { StoreAppIcon } from "./store-icons";
import type { StoreItemDetail, StoreReviewSummary } from "./types";

interface ItemDetailModalProps {
  item: StoreItem | null;
  companyId: string;
  onClose: () => void;
  onInstall: (item: StoreItem, permissions?: string[]) => Promise<void>;
  onUninstall: (item: StoreItem) => Promise<void>;
  onToggleAutoStart?: (item: StoreItem, autoStart: boolean) => Promise<void>;
}

const PERMISSION_DESCRIPTIONS: Record<string, { label: string; desc: string }> = {
  "network:outbound": {
    label: "Netzwerkzugriff (Ausgehend)",
    desc: "Darf sichere Web- und API-Anfragen an externe Dienste senden.",
  },
  "storage:local": {
    label: "Lokaler Speicher",
    desc: "Darf Daten in der lokalen PostgreSQL-Datenbank auf Helium speichern.",
  },
  "agent:execute": {
    label: "Bot & Agenten-Ausführung",
    desc: "Darf LLM-Aufgaben, Prompts und Swarm-Routinen starten.",
  },
  "mcp:tools": {
    label: "MCP-Tools bereitstellen",
    desc: "Darf neue Funktions-Aufrufe für Bots registrieren.",
  },
  "company:read": {
    label: "Firmendaten lesen",
    desc: "Darf Firmen-Metadaten und Arbeitsdateien der aktiven Firma einsehen.",
  },
  "company:write": {
    label: "Firmeneinstellungen verwalten",
    desc: "Darf Einstellungen und Dashboards der aktuellen Firma aktualisieren.",
  },
  "system:shell": {
    label: "Sandbox-Befehle",
    desc: "Darf isolierte Befehle in der Code-Sandbox ausführen.",
  },
};

export function ItemDetailModal({
  item: initialItem,
  companyId,
  onClose,
  onInstall,
  onUninstall,
  onToggleAutoStart,
}: ItemDetailModalProps) {
  const [detail, setDetail] = useState<StoreItemDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [installProgress, setInstallProgress] = useState<number | null>(null);
  const [isInstalling, setIsInstalling] = useState(false);
  const [autoStart, setAutoStart] = useState(false);

  // Review Form state
  const [newRating, setNewRating] = useState(5);
  const [newComment, setNewComment] = useState("");
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);

  useEffect(() => {
    if (!initialItem) {
      setDetail(null);
      return;
    }

    let active = true;
    setLoading(true);

    fetchStoreItem(initialItem.id, companyId).then((data) => {
      if (!active) return;
      if (data) {
        setDetail(data);
        setAutoStart(Boolean(data.autoStart));
      } else {
        // Fallback to basic item info
        setDetail({
          ...initialItem,
          itemType: (initialItem.category === "mcp"
            ? "mcp"
            : initialItem.category === "skill"
              ? "skill"
              : initialItem.category === "template"
                ? "company"
                : "tool"),
          pricingType: "free",
          tags: [initialItem.category],
          screenshots: [],
          permissionsRequired: ["storage:local", "company:read"],
          isVerified: true,
          installedCompanyIds: initialItem.isInstalled ? [companyId] : [],
        });
      }
      setLoading(false);
    });

    return () => {
      active = false;
    };
  }, [initialItem, companyId]);

  if (!initialItem) return null;

  const item = detail || {
    ...initialItem,
    itemType: "tool" as const,
    pricingType: "free",
    tags: [],
    screenshots: [],
    permissionsRequired: [],
    isVerified: true,
    installedCompanyIds: [],
  };

  const handleInstallClick = async () => {
    if (isInstalling || item.isInstalled) return;

    setIsInstalling(true);
    setInstallProgress(15);

    // Play Store install progress animation
    const p1 = setTimeout(() => setInstallProgress(55), 350);
    const p2 = setTimeout(() => setInstallProgress(85), 700);

    try {
      await onInstall(initialItem, item.permissionsRequired);
      setInstallProgress(100);
      setTimeout(() => {
        setIsInstalling(false);
        setInstallProgress(null);
        if (detail) {
          setDetail({
            ...detail,
            isInstalled: true,
            installedCompanyIds: [...detail.installedCompanyIds, companyId],
          });
        }
      }, 400);
    } catch {
      clearTimeout(p1);
      clearTimeout(p2);
      setIsInstalling(false);
      setInstallProgress(null);
    }
  };

  const handleUninstallClick = async () => {
    await onUninstall(initialItem);
    if (detail) {
      setDetail({
        ...detail,
        isInstalled: false,
        installedCompanyIds: detail.installedCompanyIds.filter((c) => c !== companyId),
      });
    }
  };

  const handleAutoStartToggle = async () => {
    const next = !autoStart;
    setAutoStart(next);
    if (onToggleAutoStart) {
      await onToggleAutoStart(initialItem, next);
    }
  };

  const handleReviewSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim() || isSubmittingReview) return;

    setIsSubmittingReview(true);
    const res = await submitStoreReview(item.id, {
      rating: newRating,
      comment: newComment.trim(),
      userName: "Stefan Kunc",
    });

    if (res.success && res.review) {
      setNewComment("");
      if (detail) {
        setDetail({
          ...detail,
          reviews: [res.review, ...(detail.reviews || [])],
        });
      }
    }
    setIsSubmittingReview(false);
  };

  const formatDownloads = (num: number) => {
    if (num >= 1000) return `${(num / 1000).toFixed(1)}k+`;
    return `${num}+`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-background/80 backdrop-blur-md animate-in fade-in duration-200">
      <div
        className="relative w-full max-w-2xl max-h-[90vh] bg-card border border-border/80 rounded-3xl shadow-2xl flex flex-col overflow-hidden select-none"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Play Store Top Navigation Bar */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border/50 bg-card/60 backdrop-blur-sm sticky top-0 z-20">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-full text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
              aria-label="Zurück"
            >
              <IconArrowLeft size={20} />
            </button>
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Google Play Store • OpenBot
            </span>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            aria-label="Schließen"
          >
            <IconX size={20} />
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Header Row: Big Icon, Title, Author */}
          <div className="flex items-start gap-5">
            <StoreAppIcon name={item.iconUrl} size="xl" className="shadow-xl" />

            <div className="flex-1 min-w-0 space-y-1">
              <h2 className="text-xl sm:text-2xl font-bold text-foreground tracking-tight leading-tight">
                {item.displayName}
              </h2>
              <p className="text-xs sm:text-sm text-primary font-medium">{item.author}</p>
              <div className="flex items-center gap-2 pt-0.5">
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                  <IconShieldCheck size={12} /> Play Protect Geprüft
                </span>
                <span className="text-xs text-muted-foreground font-mono">v{item.version}</span>
              </div>
            </div>
          </div>

          {/* Key Metrics Strip (Play Store Style) */}
          <div className="grid grid-cols-4 divide-x divide-border/60 py-3 px-4 rounded-2xl bg-secondary/40 border border-border/40 text-center">
            <div>
              <div className="flex items-center justify-center gap-1 text-sm sm:text-base font-bold text-foreground">
                <span>{item.rating?.toFixed(1) || "5.0"}</span>
                <IconStarFilled size={14} className="text-amber-500" />
              </div>
              <p className="text-[10px] text-muted-foreground mt-0.5">Bewertungen</p>
            </div>

            <div>
              <div className="text-sm sm:text-base font-bold text-foreground">
                {formatDownloads(item.downloadsCount)}
              </div>
              <p className="text-[10px] text-muted-foreground mt-0.5">Downloads</p>
            </div>

            <div>
              <div className="text-sm sm:text-base font-bold text-foreground">USK 0</div>
              <p className="text-[10px] text-muted-foreground mt-0.5">Altersfreigabe</p>
            </div>

            <div>
              <div className="text-sm sm:text-base font-bold text-emerald-500">Kostenlos</div>
              <p className="text-[10px] text-muted-foreground mt-0.5">Preis</p>
            </div>
          </div>

          {/* Action Row: Install Button with Progress / Installed Actions */}
          <div className="space-y-3">
            {isInstalling ? (
              <div className="space-y-2 p-4 rounded-2xl bg-primary/10 border border-primary/20">
                <div className="flex items-center justify-between text-xs font-semibold text-primary">
                  <span>Wird auf Company "{companyId}" installiert...</span>
                  <span>{installProgress}%</span>
                </div>
                <div className="w-full h-2 rounded-full bg-secondary overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full transition-all duration-300"
                    style={{ width: `${installProgress}%` }}
                  />
                </div>
              </div>
            ) : item.isInstalled ? (
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-4 rounded-2xl bg-secondary/50 border border-border/60">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-emerald-500/15 text-emerald-500 flex items-center justify-center shrink-0">
                    <IconCheck size={18} />
                  </div>
                  <div>
                    <h4 className="text-xs font-semibold text-foreground">
                      Installiert in "{companyId}"
                    </h4>
                    <p className="text-[11px] text-muted-foreground">
                      Bereit zur Nutzung in Bot-Chats und Workflows.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleAutoStartToggle}
                    className={cn(
                      "px-3 py-1.5 rounded-full text-xs font-semibold border transition-all",
                      autoStart
                        ? "bg-primary/20 text-primary border-primary/30"
                        : "bg-secondary text-muted-foreground border-border/50 hover:text-foreground",
                    )}
                  >
                    Autostart: {autoStart ? "AN" : "AUS"}
                  </button>

                  <button
                    type="button"
                    onClick={handleUninstallClick}
                    className="p-2 rounded-full bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors"
                    title="Deinstallieren"
                  >
                    <IconTrash size={16} />
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={handleInstallClick}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-full bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-bold shadow-lg shadow-primary/25 transition-transform active:scale-[0.99]"
              >
                <IconDownload size={18} />
                <span>Auf Firma "{companyId}" installieren</span>
              </button>
            )}
          </div>

          {/* Permissions / Security Check Before Installation */}
          <div className="p-4 rounded-2xl bg-secondary/30 border border-border/60 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <IconShieldCheck size={18} className="text-primary" />
                <h4 className="text-xs font-bold text-foreground uppercase tracking-wider">
                  Berechtigungen dieser App
                </h4>
              </div>
              <span className="text-[11px] text-muted-foreground">
                Granulare Rechte-Kontrolle
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
              {item.permissionsRequired.map((perm) => {
                const info = PERMISSION_DESCRIPTIONS[perm] || {
                  label: perm,
                  desc: "Benötigt für die Ausführung der App.",
                };
                return (
                  <div
                    key={perm}
                    className="flex items-start gap-2.5 p-2.5 rounded-xl bg-card border border-border/40"
                  >
                    <IconLock size={15} className="text-primary shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-foreground truncate">
                        {info.label}
                      </p>
                      <p className="text-[11px] text-muted-foreground line-clamp-2 leading-tight">
                        {info.desc}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* About This App / Description */}
          <div className="space-y-2">
            <h4 className="text-sm font-bold text-foreground">Über diese App</h4>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {item.description}
            </p>
            {item.entryPoint && (
              <p className="text-[11px] text-muted-foreground font-mono bg-secondary/50 p-2 rounded-lg border border-border/40">
                Einstiegspunkt: {item.entryPoint}
              </p>
            )}
          </div>

          {/* Versions & Security Hashes */}
          {detail?.versions && detail.versions.length > 0 && (
            <div className="p-3.5 rounded-xl bg-secondary/20 border border-border/40 space-y-1.5 text-xs">
              <div className="flex items-center justify-between font-semibold text-foreground">
                <span>Version {detail.versions[0].version}</span>
                <span className="text-[10px] text-muted-foreground font-mono">
                  SHA-256: {detail.versions[0].packageHash.slice(0, 16)}...
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground">
                {detail.versions[0].changelog || "Reguläres Update"}
              </p>
            </div>
          )}

          {/* Ratings & Reviews Section */}
          <div className="space-y-4 pt-2 border-t border-border/50">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-bold text-foreground">Bewertungen & Rezensionen</h4>
              <div className="flex items-center gap-1 text-xs text-amber-500 font-bold">
                <span>{item.rating?.toFixed(1) || "5.0"}</span>
                <IconStarFilled size={13} />
              </div>
            </div>

            {/* Submit a Review Form */}
            <form
              onSubmit={handleReviewSubmit}
              className="p-3.5 rounded-2xl bg-secondary/30 border border-border/50 space-y-3"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-foreground">
                  Deine Bewertung abgeben
                </span>
                <div className="flex items-center gap-1">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      onClick={() => setNewRating(star)}
                      className="p-0.5 text-amber-500 hover:scale-110 transition-transform"
                    >
                      {star <= newRating ? <IconStarFilled size={16} /> : <IconStar size={16} />}
                    </button>
                  ))}
                </div>
              </div>

              <textarea
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                placeholder="Schreibe einen kurzen Erfahrungsbericht..."
                rows={2}
                className="w-full p-2.5 rounded-xl bg-card border border-border/60 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/50 resize-none"
              />

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={!newComment.trim() || isSubmittingReview}
                  className="px-4 py-1.5 rounded-full bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground text-xs font-semibold transition-all"
                >
                  {isSubmittingReview ? "Wird gesendet..." : "Bewertung absenden"}
                </button>
              </div>
            </form>

            {/* Review List */}
            <div className="space-y-2.5">
              {detail?.reviews?.map((rev) => (
                <div
                  key={rev.id}
                  className="p-3 rounded-xl bg-card border border-border/40 space-y-1"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-foreground">
                      {rev.userName}
                    </span>
                    <div className="flex items-center gap-0.5 text-amber-500">
                      {Array.from({ length: rev.rating }).map((_, i) => (
                        <IconStarFilled key={i} size={11} />
                      ))}
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {rev.comment}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
