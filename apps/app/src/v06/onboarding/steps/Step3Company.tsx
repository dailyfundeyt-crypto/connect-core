/**
 * Schritt 3: Erste Firma anlegen oder auswählen (A25 / Wave 3)
 */

import * as React from "react";
import { Building2, Plus, Check, ArrowRight, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { listCompanies, createCompany } from "@/lib/companies/store";
import { getFlag } from "@/contracts/v06/flags";
import { Button as DesignButton } from "@/v06/design";
import "@/v06/design/tokens.css";
import type { ConnectCompany } from "@/lib/companies/catalog";
import type { OnboardingData } from "../types";

export interface Step3CompanyProps {
  data: OnboardingData;
  onUpdateData: (patch: Partial<OnboardingData>) => void;
  onContinue: () => void;
  onBack: () => void;
  isSaving?: boolean;
}

export function Step3Company({
  data,
  onUpdateData,
  onContinue,
  onBack,
  isSaving = false,
}: Step3CompanyProps) {
  const [companies, setCompanies] = React.useState<ConnectCompany[]>([]);
  const [selectedId, setSelectedId] = React.useState<string>(data.companyId || "");
  const [showNewForm, setShowNewForm] = React.useState(false);
  const [newName, setNewName] = React.useState("");
  const [newDesc, setNewDesc] = React.useState("");
  const [isCreating, setIsCreating] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    try {
      const list = listCompanies();
      setCompanies(list);
      if (!selectedId && list.length > 0) {
        setSelectedId(list[0].id);
        onUpdateData({ companyId: list[0].id, companyName: list[0].name });
      } else if (list.length === 0) {
        setShowNewForm(true);
      }
    } catch {
      setShowNewForm(true);
    }
  }, []);

  const handleSelect = (comp: ConnectCompany) => {
    setSelectedId(comp.id);
    onUpdateData({ companyId: comp.id, companyName: comp.name });
    if (typeof window !== "undefined") {
      window.localStorage.setItem("connect.activeCompanyId", comp.id);
      window.dispatchEvent(new Event("connect-active-company"));
    }
  };

  const handleCreateCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) {
      setError("Bitte gib einen Firmennamen ein.");
      return;
    }
    setError(null);
    setIsCreating(true);

    try {
      const created = await createCompany({
        name: newName.trim(),
        description: newDesc.trim() || "Unternehmen in Connect",
      });

      setCompanies((prev) => [created, ...prev]);
      setSelectedId(created.id);
      onUpdateData({ companyId: created.id, companyName: created.name });

      if (typeof window !== "undefined") {
        window.localStorage.setItem("connect.activeCompanyId", created.id);
        window.dispatchEvent(new Event("connect-active-company"));
      }

      setShowNewForm(false);
      setNewName("");
      setNewDesc("");
    } catch (err: any) {
      setError(err?.message || "Fehler beim Erstellen der Firma.");
    } finally {
      setIsCreating(false);
    }
  };

  const handleProceed = () => {
    if (!selectedId && companies.length > 0) {
      handleSelect(companies[0]);
    }
    onContinue();
  };

  const isDesignV2 = getFlag("designV2");

  return (
    <div className="w-full flex flex-col items-center justify-center max-w-xl mx-auto py-2 text-center select-none">
      <div className="relative mb-6">
        <div
          className={`size-16 flex items-center justify-center shadow-md transition-transform duration-300 hover:scale-105 ${
            isDesignV2
              ? "rounded-[var(--p-radius-lg)] border border-[var(--p-accent)]/30 bg-[var(--p-accent)]/15 text-[var(--p-accent)] shadow-[0_0_24px_rgba(56,189,248,0.18)]"
              : "rounded-2xl bg-primary/10 border border-primary/20 text-primary mb-4 shadow-sm"
          }`}
        >
          <Building2 className={`size-8 ${isDesignV2 ? "text-[var(--p-accent)]" : ""}`} />
        </div>
      </div>

      <h1
        className={`text-2xl sm:text-3xl font-bold tracking-tight ${
          isDesignV2 ? "text-[var(--p-text-1)]" : "text-foreground"
        }`}
      >
        Erste Firma anlegen oder auswählen
      </h1>
      <p
        className={`text-sm mt-2 max-w-md ${
          isDesignV2 ? "text-[var(--p-text-2)]" : "text-muted-foreground"
        }`}
      >
        Alle Agents, Dokumente, Notizen und Chats sind immer einem Unternehmen zugeordnet. Du kannst später beliebig viele Firmen ergänzen.
      </p>

      {/* List of existing companies */}
      {!showNewForm && companies.length > 0 && (
        <div className="w-full mt-6 space-y-2.5 max-h-64 overflow-y-auto pr-1 text-left">
          {companies.map((c) => {
            const isSelected = selectedId === c.id;
            return (
              <div
                key={c.id}
                role="button"
                tabIndex={0}
                onClick={() => handleSelect(c)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") handleSelect(c);
                }}
                className={`p-3.5 flex items-center justify-between cursor-pointer transition-all duration-200 ${
                  isDesignV2
                    ? isSelected
                      ? "rounded-[var(--p-radius-lg)] border border-[var(--p-accent)] bg-[var(--p-accent)]/10 ring-1 ring-[var(--p-accent)] shadow-[0_0_20px_rgba(56,189,248,0.15)]"
                      : "rounded-[var(--p-radius-lg)] border border-[var(--p-border)] bg-[var(--p-surface-2)] hover:border-[var(--p-accent)]/40 hover:bg-[var(--p-surface-hover)]"
                    : isSelected
                      ? "rounded-xl border border-primary bg-primary/10 ring-1 ring-primary shadow-xs"
                      : "rounded-xl border border-border/80 bg-card/60 hover:border-primary/40 hover:bg-accent/40"
                }`}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`size-10 flex items-center justify-center font-bold text-sm ${
                      isDesignV2
                        ? isSelected
                          ? "rounded-[var(--p-radius-md)] bg-[var(--p-accent)] text-[var(--p-text-on-accent)]"
                          : "rounded-[var(--p-radius-md)] border border-[var(--p-border)] bg-[var(--p-surface-3)] text-[var(--p-text-1)]"
                        : isSelected
                          ? "rounded-lg bg-primary text-primary-foreground"
                          : "rounded-lg bg-muted text-muted-foreground"
                    }`}
                  >
                    {c.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <h3
                      className={`text-sm font-semibold ${
                        isDesignV2 ? "text-[var(--p-text-1)]" : "text-foreground"
                      }`}
                    >
                      {c.name}
                    </h3>
                    <p
                      className={`text-xs line-clamp-1 ${
                        isDesignV2 ? "text-[var(--p-text-3)]" : "text-muted-foreground"
                      }`}
                    >
                      {c.description || "Aktives Connect-Unternehmen"}
                    </p>
                  </div>
                </div>

                <div
                  className={`size-5 rounded-full border flex items-center justify-center ${
                    isDesignV2
                      ? isSelected
                        ? "border-[var(--p-accent)] bg-[var(--p-accent)] text-[var(--p-text-on-accent)]"
                        : "border-[var(--p-border-strong)] bg-transparent"
                      : isSelected
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-muted-foreground/30"
                  }`}
                >
                  {isSelected && <Check className="size-3 stroke-[3]" />}
                </div>
              </div>
            );
          })}

          {isDesignV2 ? (
            <DesignButton
              type="button"
              variant="secondary"
              onClick={() => setShowNewForm(true)}
              leftIcon={<Plus className="size-3.5" />}
              className="w-full mt-2"
            >
              Weiteres Unternehmen hinzufügen
            </DesignButton>
          ) : (
            <Button
              type="button"
              variant="ghost"
              onClick={() => setShowNewForm(true)}
              className="w-full text-xs text-muted-foreground hover:text-foreground mt-2 border border-dashed border-border"
            >
              <Plus className="size-3.5 mr-1" />
              Weiteres Unternehmen hinzufügen
            </Button>
          )}
        </div>
      )}

      {/* New Company Form */}
      {(showNewForm || companies.length === 0) && (
        <form onSubmit={handleCreateCompany} className="w-full mt-6 text-left max-w-md space-y-4">
          <div
            className={`p-4 space-y-3 ${
              isDesignV2
                ? "rounded-[var(--p-radius-lg)] border border-[var(--p-border)] bg-[var(--p-surface-2)] shadow-sm"
                : "rounded-xl border border-primary/30 bg-primary/5"
            }`}
          >
            <h3
              className={`text-sm font-semibold flex items-center gap-1.5 ${
                isDesignV2 ? "text-[var(--p-text-1)]" : "text-foreground"
              }`}
            >
              <Plus className={`size-4 ${isDesignV2 ? "text-[var(--p-accent)]" : "text-primary"}`} />
              Neues Unternehmen erstellen
            </h3>

            <div className="space-y-1.5">
              <Label
                htmlFor="company-name"
                className={`text-xs font-medium ${
                  isDesignV2 ? "text-[var(--p-text-1)]" : "text-foreground"
                }`}
              >
                Firmenname
              </Label>
              <Input
                id="company-name"
                placeholder="z. B. Kunc GmbH"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className={`h-9 text-sm ${
                  isDesignV2
                    ? "rounded-[var(--p-radius-md)] border-[var(--p-border)] bg-[var(--p-surface-1)] text-[var(--p-text-1)] placeholder:text-[var(--p-text-3)] focus:border-[var(--p-accent)]"
                    : "bg-background"
                }`}
                autoFocus
              />
            </div>

            <div className="space-y-1.5">
              <Label
                htmlFor="company-desc"
                className={`text-xs font-medium ${
                  isDesignV2 ? "text-[var(--p-text-3)]" : "text-muted-foreground"
                }`}
              >
                Beschreibung (optional)
              </Label>
              <Input
                id="company-desc"
                placeholder="z. B. Softwareentwicklung & KI-Lösungen"
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                className={`h-9 text-sm ${
                  isDesignV2
                    ? "rounded-[var(--p-radius-md)] border-[var(--p-border)] bg-[var(--p-surface-1)] text-[var(--p-text-1)] placeholder:text-[var(--p-text-3)] focus:border-[var(--p-accent)]"
                    : "bg-background"
                }`}
              />
            </div>

            {error && <p className="text-xs text-destructive">{error}</p>}

            <div className="flex items-center gap-2 pt-1">
              {companies.length > 0 && (
                isDesignV2 ? (
                  <DesignButton
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowNewForm(false)}
                    disabled={isCreating}
                  >
                    Abbrechen
                  </DesignButton>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setShowNewForm(false)}
                    disabled={isCreating}
                    className="text-xs"
                  >
                    Abbrechen
                  </Button>
                )
              )}
              {isDesignV2 ? (
                <DesignButton
                  type="submit"
                  variant="primary"
                  size="sm"
                  loading={isCreating}
                  className="flex-1"
                >
                  Unternehmen anlegen
                </DesignButton>
              ) : (
                <Button type="submit" size="sm" disabled={isCreating} className="text-xs flex-1">
                  {isCreating ? "Wird erstellt…" : "Unternehmen anlegen"}
                </Button>
              )}
            </div>
          </div>
        </form>
      )}

      {/* Navigation Buttons */}
      <div className="mt-8 flex items-center justify-between w-full max-w-md gap-3">
        {isDesignV2 ? (
          <>
            <DesignButton
              type="button"
              variant="secondary"
              onClick={onBack}
              disabled={isSaving}
              leftIcon={<ArrowLeft className="size-4" />}
              className="w-1/3"
            >
              Zurück
            </DesignButton>
            <DesignButton
              type="button"
              variant="primary"
              onClick={handleProceed}
              loading={isSaving}
              disabled={!selectedId && companies.length === 0}
              rightIcon={<ArrowRight className="size-4" />}
              className="w-2/3"
            >
              Tools aktivieren
            </DesignButton>
          </>
        ) : (
          <>
            <Button
              type="button"
              variant="outline"
              onClick={onBack}
              disabled={isSaving}
              className="w-1/3 gap-1.5"
            >
              <ArrowLeft className="size-4" />
              Zurück
            </Button>
            <Button
              type="button"
              onClick={handleProceed}
              disabled={isSaving || (!selectedId && companies.length === 0)}
              className="w-2/3 gap-2 shadow-sm font-medium"
            >
              Tools aktivieren
              <ArrowRight className="size-4" />
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
