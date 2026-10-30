/**
 * Store Package Installation Dialog (v06)
 * Enables company selection, reviews requested package permissions,
 * and confirms security policies before installing.
 */

import React, { useState, useEffect } from "react";
import {
  IconCheck,
  IconDownload,
  IconAlertTriangle,
  IconShieldCheck,
  IconBuilding,
  IconX,
  IconLoader2,
} from "@tabler/icons-react";
import { cn } from "@/lib/utils";
import { listCompanies, type ConnectCompany } from "@/lib/companies/store";
import type { StoreListing, PackagePermission, InstallResult } from "./types";
import { PERMISSION_DEFINITIONS } from "./types";

export interface InstallDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  listing: StoreListing | null;
  currentCompanyId?: string;
  onInstall: (
    listing: StoreListing,
    targetCompanyId: string,
    acceptedPermissions: string[],
  ) => Promise<InstallResult>;
  onSuccess?: (result: InstallResult) => void;
}

export function InstallDialog({
  open,
  onOpenChange,
  listing,
  currentCompanyId,
  onInstall,
  onSuccess,
}: InstallDialogProps) {
  const [companies, setCompanies] = useState<ConnectCompany[]>([]);
  const [targetCompanyId, setTargetCompanyId] = useState<string>("");
  const [confirmed, setConfirmed] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [installError, setInstallError] = useState<string | null>(null);
  const [installSuccess, setInstallSuccess] = useState<boolean>(false);

  // Load available companies
  useEffect(() => {
    if (open) {
      const all = listCompanies();
      setCompanies(all);
      const defaultComp = currentCompanyId || all[0]?.id || "flux";
      setTargetCompanyId(defaultComp);
      setConfirmed(false);
      setIsSubmitting(false);
      setInstallError(null);
      setInstallSuccess(false);
    }
  }, [open, currentCompanyId]);

  if (!open || !listing) return null;

  // Extract permissions
  const spec = (listing.installSpec as Record<string, unknown>) || {};
  const permissions: PackagePermission[] = Array.isArray(spec.permissions)
    ? (spec.permissions as PackagePermission[])
    : Array.isArray((listing as any).permissions)
    ? ((listing as any).permissions as PackagePermission[])
    : [];

  const hasHighRisk = permissions.some(
    (p) => PERMISSION_DEFINITIONS[p]?.risk === "high",
  );

  const handleConfirmInstall = async () => {
    if (!targetCompanyId) {
      setInstallError("Bitte wählen Sie ein Ziel-Unternehmen aus.");
      return;
    }

    if (permissions.length > 0 && !confirmed) {
      setInstallError("Bitte bestätigen Sie die Berechtigungen.");
      return;
    }

    setIsSubmitting(true);
    setInstallError(null);

    try {
      const res = await onInstall(listing, targetCompanyId, permissions);
      if (!res.ok) {
        setInstallError(res.error || res.message || "Installation fehlgeschlagen.");
      } else {
        setInstallSuccess(true);
        if (onSuccess) onSuccess(res);
        setTimeout(() => {
          onOpenChange(false);
        }, 1200);
      }
    } catch (err: any) {
      setInstallError(err?.message || "Fehler beim Installieren.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150"
    >
      <div
        className={cn(
          "relative w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-3xl bg-card border border-border/80 shadow-2xl",
          "p-6 flex flex-col gap-5 text-foreground animate-in zoom-in-95 duration-150",
        )}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-muted border border-border/50 flex items-center justify-center overflow-hidden shrink-0">
              {listing.iconUrl ? (
                <img src={listing.iconUrl} alt={listing.name} className="w-full h-full object-cover" />
              ) : (
                <IconShieldCheck size={28} className="text-primary" />
              )}
            </div>
            <div>
              <h2 className="text-lg font-bold leading-tight">{listing.name} installieren</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Version {listing.version} · {listing.kind.toUpperCase()}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="p-2 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
            aria-label="Schließen"
          >
            <IconX size={20} />
          </button>
        </div>

        {/* Company Selection */}
        <div className="flex flex-col gap-2">
          <label htmlFor="company-select" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Ziel-Unternehmen / Workspace
          </label>
          <div className="relative">
            <select
              id="company-select"
              value={targetCompanyId}
              onChange={(e) => setTargetCompanyId(e.target.value)}
              disabled={isSubmitting || installSuccess}
              className={cn(
                "w-full px-4 py-3 rounded-2xl bg-muted/50 border border-border/70 text-foreground text-sm font-medium",
                "focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent min-h-[48px]",
              )}
            >
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.id})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Permissions Section */}
        <div className="flex flex-col gap-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Geforderte Berechtigungen
            </span>
            <span className="text-xs text-muted-foreground">
              {permissions.length === 0 ? "Keine Berechtigungen nötig" : `${permissions.length} aktiv`}
            </span>
          </div>

          {permissions.length === 0 ? (
            <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs flex items-center gap-2">
              <IconShieldCheck size={18} className="shrink-0" />
              <span>Dieses Paket erfordert keine sensiblen System- oder Dateizugriffe.</span>
            </div>
          ) : (
            <div className="flex flex-col gap-2 max-h-48 overflow-y-auto pr-1">
              {permissions.map((permKey) => {
                const def = PERMISSION_DEFINITIONS[permKey] || {
                  id: permKey,
                  label: permKey,
                  description: "Standard-Berechtigung",
                  risk: "medium",
                };
                const isHigh = def.risk === "high";

                return (
                  <div
                    key={permKey}
                    className={cn(
                      "p-3 rounded-2xl border text-xs flex items-start gap-3 transition-colors",
                      isHigh
                        ? "bg-amber-500/5 border-amber-500/30 text-foreground"
                        : "bg-muted/40 border-border/50 text-foreground",
                    )}
                  >
                    <div className="mt-0.5 shrink-0">
                      {isHigh ? (
                        <IconAlertTriangle size={16} className="text-amber-500" />
                      ) : (
                        <IconShieldCheck size={16} className="text-primary" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-foreground">{def.label}</span>
                        <span
                          className={cn(
                            "px-2 py-0.5 rounded-full text-[10px] font-bold uppercase",
                            isHigh
                              ? "bg-amber-500/20 text-amber-600 dark:text-amber-400"
                              : "bg-muted text-muted-foreground",
                          )}
                        >
                          {def.risk}
                        </span>
                      </div>
                      <p className="text-muted-foreground mt-0.5 leading-relaxed">{def.description}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {hasHighRisk && (
            <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400 text-xs flex items-start gap-2">
              <IconAlertTriangle size={18} className="shrink-0 mt-0.5" />
              <span>
                <strong>Achtung:</strong> Dieses Paket fordert erweiterte Rechte an. Installieren Sie nur Pakete von vertrauenswürdigen Autoren.
              </span>
            </div>
          )}
        </div>

        {/* Confirmation Checkbox */}
        {permissions.length > 0 && (
          <label className="flex items-start gap-3 cursor-pointer select-none text-xs text-foreground p-3 rounded-2xl bg-muted/30 border border-border/50 hover:bg-muted/50 transition-colors">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              disabled={isSubmitting || installSuccess}
              className="mt-0.5 h-4 w-4 rounded text-primary focus:ring-primary border-border shrink-0 cursor-pointer"
            />
            <span className="leading-relaxed">
              Ich bestätige die Berechtigungen für <strong>{targetCompanyId}</strong> und erlaube diesem Paket den Zugriff.
            </span>
          </label>
        )}

        {/* Status / Errors */}
        {installError && (
          <div className="p-3.5 rounded-2xl bg-destructive/10 border border-destructive/20 text-destructive text-xs">
            {installError}
          </div>
        )}

        {installSuccess && (
          <div className="p-3.5 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 text-xs font-semibold flex items-center gap-2">
            <IconCheck size={18} />
            <span>Erfolgreich installiert! Wird im Workspace aktiviert...</span>
          </div>
        )}

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-3 pt-2 border-t border-border/40">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
            className="min-h-[44px] px-5 py-2.5 rounded-full text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            Abbrechen
          </button>
          <button
            type="button"
            onClick={handleConfirmInstall}
            disabled={isSubmitting || installSuccess || (permissions.length > 0 && !confirmed)}
            className={cn(
              "min-h-[44px] px-6 py-2.5 rounded-full text-sm font-semibold flex items-center justify-center gap-2 transition-all active:scale-95 shadow",
              installSuccess
                ? "bg-emerald-600 text-white cursor-default"
                : "bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:pointer-events-none",
            )}
          >
            {isSubmitting ? (
              <>
                <IconLoader2 size={16} className="animate-spin" />
                <span>Installiere...</span>
              </>
            ) : installSuccess ? (
              <>
                <IconCheck size={16} />
                <span>Installiert</span>
              </>
            ) : (
              <>
                <IconDownload size={16} />
                <span>Jetzt Installieren</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
