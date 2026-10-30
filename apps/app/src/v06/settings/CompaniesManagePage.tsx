import React, { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  IconArrowDown,
  IconArrowLeft,
  IconArrowUp,
  IconBuildingStore,
  IconCheck,
  IconEdit,
  IconPhoto,
  IconPlus,
} from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { fileToAvatarDataUrl } from "@/lib/agents/connect-avatars";
import { getFlag } from "@/contracts/v06/flags";
import "@/v06/design/tokens.css";
import {
  Button as DesignButton,
  EmptyState as DesignEmptyState,
} from "@/v06/design";
import {
  type ConnectCompany,
  createCompany,
  listCompanies,
  readActiveCompanyId,
  subscribeCompanies,
  updateCompany,
  writeActiveCompanyId,
} from "@/lib/companies/store";

export interface CompaniesManagePageProps {
  className?: string;
}

export function CompaniesManagePage({ className }: CompaniesManagePageProps) {
  const navigate = useNavigate();
  const [companies, setCompanies] = useState<ConnectCompany[]>(() => listCompanies());
  const [activeId, setActiveId] = useState<string | null>(() => readActiveCompanyId());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const isDesignV2 = getFlag("designV2");

  // New company state
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const unsub = subscribeCompanies(() => {
      setCompanies(listCompanies());
    });
    const handleActiveChange = () => {
      setActiveId(readActiveCompanyId());
    };
    window.addEventListener("connect-active-company", handleActiveChange);
    return () => {
      unsub();
      window.removeEventListener("connect-active-company", handleActiveChange);
    };
  }, []);

  const handleSetActive = (id: string) => {
    writeActiveCompanyId(id);
    setActiveId(id);
  };

  const handleMove = (index: number, direction: "up" | "down") => {
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= companies.length) return;

    const nextList = [...companies];
    const [moved] = nextList.splice(index, 1);
    nextList.splice(targetIndex, 0, moved);

    setCompanies(nextList);
    try {
      if (typeof window !== "undefined") {
        window.localStorage.setItem("connect.companies.custom", JSON.stringify(nextList));
        window.dispatchEvent(new Event("connect-companies-changed"));
      }
    } catch (err) {
      console.error("Fehler beim Speichern der Firmenreihenfolge:", err);
    }
  };

  const handleCreateCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) {
      setCreateError("Name ist erforderlich.");
      return;
    }
    setCreateError(null);
    setIsSubmitting(true);
    try {
      const created = await createCompany({
        name: newName.trim(),
        description: newDescription.trim() || "Neues Unternehmen",
      });
      setNewName("");
      setNewDescription("");
      setIsCreating(false);
      handleSetActive(created.id);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Erstellen fehlgeschlagen");
    } finally {
      setIsSubmitting(false);
    }
  };

  const editingCompany = companies.find((c) => c.id === editingId) ?? null;

  return (
    <div
      className={cn("mx-auto w-full max-w-4xl px-4 py-6 md:px-6 md:py-8", className)}
      data-testid="companies-manage-page"
    >
      {/* Kopfzeile mit EINZIGEM Zurück-Button */}
      <div className="mb-6 flex items-center justify-between gap-4 border-b border-border/50 pb-4">
        <div className="flex items-center gap-3">
          <Link
            to="/settings"
            className="flex size-9 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            aria-label="Zurück zu den Einstellungen"
          >
            <IconArrowLeft className="size-4" />
          </Link>
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-foreground md:text-2xl">
              Firmen verwalten
            </h1>
            <p className="text-xs text-muted-foreground md:text-sm">
              Firmenprofile pflegen, aktive Firma wählen, Reihenfolge festlegen und Logos bearbeiten.
            </p>
          </div>
        </div>

        {!isCreating && (
          <Button
            size="sm"
            onClick={() => setIsCreating(true)}
            className="gap-1.5 shadow-sm"
          >
            <IconPlus className="size-4" />
            <span>Neue Firma</span>
          </Button>
        )}
      </div>

      {/* Formular zum Anlegen einer neuen Firma */}
      {isCreating && (
        <form
          onSubmit={handleCreateCompany}
          className="mb-6 rounded-xl border border-primary/30 bg-primary/[0.02] p-4 shadow-sm"
        >
          <div className="flex items-center justify-between pb-3">
            <h2 className="text-sm font-semibold text-foreground">
              Neues Firmenprofil anlegen
            </h2>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setIsCreating(false);
                setCreateError(null);
              }}
            >
              Abbrechen
            </Button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-muted-foreground">
                Firmenname *
              </label>
              <input
                type="text"
                required
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="z.B. Acme Corp"
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground">
                Beschreibung
              </label>
              <input
                type="text"
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                placeholder="Kurze Beschreibung"
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>
          {createError && (
            <p className="mt-2 text-xs font-medium text-destructive">
              {createError}
            </p>
          )}
          <div className="mt-4 flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsCreating(false)}
            >
              Abbrechen
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={isSubmitting || !newName.trim()}
            >
              {isSubmitting ? "Wird angelegt…" : "Firma speichern"}
            </Button>
          </div>
        </form>
      )}

      {/* Editier-Formular wenn eine Firma ausgewählt ist */}
      {editingCompany && (
        <CompanyEditCard
          company={editingCompany}
          onClose={() => setEditingId(null)}
          onSaved={() => {
            setCompanies(listCompanies());
            setEditingId(null);
          }}
        />
      )}

      {/* Firmenliste mit Reihenfolge, aktivem Status und Bearbeiten */}
      <div className="space-y-2">
        {companies.length === 0 ? (
          isDesignV2 ? (
            <DesignEmptyState
              icon={<IconBuildingStore className="size-8 text-[var(--p-text-3)]" />}
              title="Keine Firmen vorhanden"
              description="Erstelle deine erste Firma, um Bots und Tools zu organisieren."
              action={
                <DesignButton
                  variant="primary"
                  size="sm"
                  onClick={() => setIsCreating(true)}
                  leftIcon={<IconPlus className="size-4" />}
                >
                  Erste Firma erstellen
                </DesignButton>
              }
            />
          ) : (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border p-12 text-center">
              <IconBuildingStore className="size-10 text-muted-foreground/60" />
              <h3 className="mt-3 text-sm font-semibold text-foreground">
                Keine Firmen vorhanden
              </h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Erstelle deine erste Firma, um Bots und Tools zu organisieren.
              </p>
              <Button
                size="sm"
                onClick={() => setIsCreating(true)}
                className="mt-4 gap-1.5"
              >
                <IconPlus className="size-4" />
                Erste Firma erstellen
              </Button>
            </div>
          )
        ) : (
          companies.map((company, index) => {
            const isActive = activeId === company.id;

            return (
              <div
                key={company.id}
                className={cn(
                  "group relative flex items-center justify-between gap-3 p-3.5 transition-all",
                  isDesignV2
                    ? cn(
                        "rounded-[var(--p-radius-lg)] border bg-[var(--p-surface-2)]",
                        isActive
                          ? "border-[var(--p-accent)]/50 bg-[var(--p-accent)]/[0.06] shadow-sm"
                          : "border-[var(--p-border)] hover:border-[var(--p-border-strong)] hover:bg-[var(--p-surface-hover)]",
                      )
                    : cn(
                        "rounded-xl border",
                        isActive
                          ? "border-primary/50 bg-primary/[0.04] shadow-sm dark:bg-primary/[0.06]"
                          : "border-border bg-card hover:border-border/80 hover:bg-accent/30",
                      ),
                )}
              >
                {/* Firmen-Logo / Avatar */}
                <div
                  className={cn(
                    "flex size-11 shrink-0 items-center justify-center overflow-hidden text-xs font-bold text-white shadow-inner",
                    isDesignV2 ? "rounded-[var(--p-radius-md)] border border-[var(--p-border)]" : "rounded-xl",
                  )}
                  style={{ background: company.accent || "#0284c7" }}
                >
                  {company.logo ? (
                    <img
                      alt={company.name}
                      src={company.logo}
                      className="size-full object-cover"
                    />
                  ) : (
                    company.name.slice(0, 2).toUpperCase()
                  )}
                </div>

                {/* Info */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        "truncate text-sm font-semibold",
                        isDesignV2 ? "text-[var(--p-text-1)]" : "text-foreground",
                      )}
                    >
                      {company.name}
                    </span>
                    {isActive && (
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium",
                          isDesignV2
                            ? "rounded-full bg-[var(--p-accent)]/15 text-[var(--p-accent)] border border-[var(--p-accent)]/20"
                            : "rounded-full bg-primary/15 text-primary",
                        )}
                      >
                        <IconCheck className="size-3" />
                        Aktiv
                      </span>
                    )}
                  </div>
                  <p
                    className={cn(
                      "truncate text-xs",
                      isDesignV2 ? "text-[var(--p-text-3)]" : "text-muted-foreground",
                    )}
                  >
                    {company.description || "Keine Beschreibung"}
                  </p>
                </div>

                {/* Aktionen: Reihenfolge, Aktiv setzen, Bearbeiten (KEIN Löschen laut Regel 2) */}
                <div className="flex shrink-0 items-center gap-1.5">
                  {/* Reihenfolge hoch/runter */}
                  <div className="flex flex-col">
                    <button
                      type="button"
                      disabled={index === 0}
                      onClick={() => handleMove(index, "up")}
                      className={cn(
                        "rounded p-1 transition-colors disabled:opacity-30",
                        isDesignV2
                          ? "text-[var(--p-text-3)] hover:bg-[var(--p-surface-3)] hover:text-[var(--p-text-1)]"
                          : "text-muted-foreground hover:bg-accent hover:text-foreground",
                      )}
                      aria-label={`${company.name} nach oben verschieben`}
                    >
                      <IconArrowUp className="size-3.5" />
                    </button>
                    <button
                      type="button"
                      disabled={index === companies.length - 1}
                      onClick={() => handleMove(index, "down")}
                      className={cn(
                        "rounded p-1 transition-colors disabled:opacity-30",
                        isDesignV2
                          ? "text-[var(--p-text-3)] hover:bg-[var(--p-surface-3)] hover:text-[var(--p-text-1)]"
                          : "text-muted-foreground hover:bg-accent hover:text-foreground",
                      )}
                      aria-label={`${company.name} nach unten verschieben`}
                    >
                      <IconArrowDown className="size-3.5" />
                    </button>
                  </div>

                  {/* Als aktiv setzen */}
                  {!isActive ? (
                    isDesignV2 ? (
                      <DesignButton
                        size="sm"
                        variant="secondary"
                        onClick={() => handleSetActive(company.id)}
                      >
                        Aktivieren
                      </DesignButton>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleSetActive(company.id)}
                        className="h-8 text-xs font-medium"
                      >
                        Aktivieren
                      </Button>
                    )
                  ) : isDesignV2 ? (
                    <DesignButton
                      size="sm"
                      variant="ghost"
                      disabled
                    >
                      Aktiv
                    </DesignButton>
                  ) : (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled
                      className="h-8 text-xs font-medium text-primary"
                    >
                      Aktiv
                    </Button>
                  )}

                  {/* Bearbeiten */}
                  {isDesignV2 ? (
                    <DesignButton
                      size="sm"
                      variant="secondary"
                      onClick={() => setEditingId(company.id)}
                      leftIcon={<IconEdit className="size-3.5" />}
                    >
                      Bearbeiten
                    </DesignButton>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setEditingId(company.id)}
                      className="h-8 gap-1 text-xs"
                    >
                      <IconEdit className="size-3.5" />
                      <span>Bearbeiten</span>
                    </Button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Hinweis zur Datensicherheit / Archivierung */}
      <div className="mt-8 rounded-lg border border-border/60 bg-muted/30 p-3.5 text-center text-xs text-muted-foreground">
        Hinweis: Firmenprofile bleiben für zugehörige Agenten, Verläufe und Workspace-Daten dauerhaft erhalten.
        Ein Löschen von Firmen ist aus Sicherheitsgründen deaktiviert (Regel 2).
      </div>
    </div>
  );
}

/**
 * Karte zum Bearbeiten von Name, Beschreibung und Logo einer Firma.
 */
function CompanyEditCard({
  company,
  onClose,
  onSaved,
}: {
  company: ConnectCompany;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(company.name);
  const [description, setDescription] = useState(company.description);
  const [logo, setLogo] = useState(company.logo ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    void fileToAvatarDataUrl(file)
      .then((dataUrl) => {
        setLogo(dataUrl);
        setError(null);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Bild konnte nicht gelesen werden.");
      });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Name darf nicht leer sein.");
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      await updateCompany(company.id, {
        name: name.trim(),
        description: description.trim(),
        logo: logo || null,
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Speichern fehlgeschlagen");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <form
      onSubmit={handleSave}
      className="mb-6 rounded-xl border border-border bg-card p-4 shadow-sm"
    >
      <div className="flex items-center justify-between pb-3 border-b border-border">
        <h2 className="text-sm font-semibold text-foreground">
          Firma &bdquo;{company.name}&ldquo; bearbeiten
        </h2>
        <Button type="button" variant="ghost" size="sm" onClick={onClose}>
          Schließen
        </Button>
      </div>

      <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-center">
        {/* Logo Avatar & Upload */}
        <div className="flex items-center gap-3">
          <div
            className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-border text-base font-bold text-white shadow-inner"
            style={{ background: company.accent || "#0284c7" }}
          >
            {logo ? (
              <img alt="Logo" src={logo} className="size-full object-cover" />
            ) : (
              name.slice(0, 2).toUpperCase()
            )}
          </div>
          <div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              className="gap-1.5 text-xs"
            >
              <IconPhoto className="size-3.5" />
              Logo wählen
            </Button>
            {logo && (
              <button
                type="button"
                onClick={() => setLogo("")}
                className="ml-2 text-xs text-muted-foreground underline hover:text-foreground"
              >
                Entfernen
              </button>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleLogoUpload}
            />
          </div>
        </div>

        {/* Name und Beschreibung */}
        <div className="flex-1 space-y-2">
          <div>
            <label className="block text-xs font-medium text-muted-foreground">
              Firmenname
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground">
              Beschreibung
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary"
            />
          </div>
        </div>
      </div>

      {error && (
        <p className="mt-3 text-xs font-medium text-destructive">{error}</p>
      )}

      <div className="mt-4 flex justify-end gap-2 border-t border-border pt-3">
        <Button type="button" variant="ghost" size="sm" onClick={onClose}>
          Abbrechen
        </Button>
        <Button type="submit" size="sm" disabled={isSaving}>
          {isSaving ? "Speichert…" : "Änderungen speichern"}
        </Button>
      </div>
    </form>
  );
}

export default CompaniesManagePage;
