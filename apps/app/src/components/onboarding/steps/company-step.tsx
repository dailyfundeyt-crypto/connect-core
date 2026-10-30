import * as React from "react";
import { Building2, Plus, Check, ArrowRight, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  listCompanies,
  createCompany,
} from "@/lib/companies/store";
import type { ConnectCompany } from "@/lib/companies/catalog";

interface CompanyStepProps {
  selectedCompanyId?: string;
  onSelectCompany: (companyId: string) => void;
  onContinue: () => void;
  onBack: () => void;
}

export function CompanyStep({
  selectedCompanyId,
  onSelectCompany,
  onContinue,
  onBack,
}: CompanyStepProps) {
  const [companies, setCompanies] = React.useState<ConnectCompany[]>([]);
  const [showCreateForm, setShowCreateForm] = React.useState(false);
  const [newName, setNewName] = React.useState("");
  const [newDescription, setNewDescription] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [isCreating, setIsCreating] = React.useState(false);

  // Load companies
  React.useEffect(() => {
    try {
      const list = listCompanies();
      setCompanies(list);
      if (!selectedCompanyId && list.length > 0) {
        onSelectCompany(list[0].id);
      }
    } catch (e: any) {
      console.warn("Failed to load companies:", e);
    }
  }, []);

  const handleCreateNew = async (e: React.FormEvent) => {
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
        description: newDescription.trim() || "Unternehmen in Connect",
      });
      setCompanies((prev) => [created, ...prev]);
      onSelectCompany(created.id);
      // Persist active company
      if (typeof window !== "undefined") {
        window.localStorage.setItem("connect.activeCompanyId", created.id);
        window.dispatchEvent(new Event("connect-active-company"));
      }
      setShowCreateForm(false);
      setNewName("");
      setNewDescription("");
    } catch (err: any) {
      setError(err?.message || "Fehler beim Erstellen der Firma.");
    } finally {
      setIsCreating(false);
    }
  };

  const handlePickCompany = (id: string) => {
    onSelectCompany(id);
    if (typeof window !== "undefined") {
      window.localStorage.setItem("connect.activeCompanyId", id);
      window.dispatchEvent(new Event("connect-active-company"));
    }
  };

  return (
    <div className="w-full flex flex-col items-center justify-center max-w-xl mx-auto py-2">
      <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground text-center">
        Unternehmen wählen oder anlegen
      </h1>
      <p className="text-sm text-muted-foreground mt-2 text-center max-w-md">
        Alle Agents, Dokumente und Chats werden einem Unternehmen zugeordnet. Du kannst später beliebig viele weitere Firmen verwalten.
      </p>

      {/* Companies List */}
      <div className="w-full mt-6 space-y-2.5 max-h-64 overflow-y-auto pr-1">
        {companies.map((company) => {
          const isSelected = selectedCompanyId === company.id;
          return (
            <div
              key={company.id}
              role="button"
              tabIndex={0}
              onClick={() => handlePickCompany(company.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  handlePickCompany(company.id);
                }
              }}
              className={`p-3.5 rounded-xl border text-left flex items-center justify-between transition cursor-pointer ${
                isSelected
                  ? "border-primary bg-primary/10 shadow-xs ring-1 ring-primary"
                  : "border-border bg-card/60 hover:bg-card/90"
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="size-10 rounded-lg bg-primary/15 text-primary flex items-center justify-center font-bold text-sm shrink-0 overflow-hidden">
                  {company.logo ? (
                    <img
                      src={company.logo}
                      alt={company.name}
                      className="size-full object-cover"
                      onError={(e) => {
                        (e.currentTarget as HTMLElement).style.display = "none";
                      }}
                    />
                  ) : (
                    company.name.slice(0, 2).toUpperCase()
                  )}
                </div>
                <div className="min-w-0">
                  <h2 className="text-sm font-semibold text-foreground truncate">
                    {company.name}
                  </h2>
                  <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                    {company.description || "Unternehmen in Connect"}
                  </p>
                </div>
              </div>
              {isSelected && <Check className="size-4 text-primary shrink-0 ml-2" />}
            </div>
          );
        })}

        {companies.length === 0 && !showCreateForm && (
          <div className="p-4 text-center text-sm text-muted-foreground border border-dashed rounded-xl">
            Noch keine Firmen vorhanden. Lege jetzt deine erste Firma an!
          </div>
        )}
      </div>

      {/* Toggle Create Form */}
      {!showCreateForm ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setShowCreateForm(true)}
          className="mt-4 gap-1.5 text-xs"
        >
          <Plus className="size-3.5" />
          Neues Unternehmen anlegen
        </Button>
      ) : (
        <form
          onSubmit={handleCreateNew}
          className="w-full mt-4 p-4 rounded-xl border border-border bg-card/70 space-y-3"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-foreground">
              Neues Unternehmen
            </span>
            <button
              type="button"
              onClick={() => setShowCreateForm(false)}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Abbrechen
            </button>
          </div>

          <div className="space-y-2">
            <Input
              placeholder="Name des Unternehmens (z.B. Acme Corp)"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="text-sm h-9"
              autoFocus
            />
            <Input
              placeholder="Kurzbeschreibung (optional)"
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
              className="text-sm h-9"
            />
          </div>

          {error && <p className="text-xs text-destructive">{error}</p>}

          <Button
            type="submit"
            size="sm"
            disabled={isCreating}
            className="w-full text-xs"
          >
            {isCreating ? "Speichern…" : "Unternehmen anlegen"}
          </Button>
        </form>
      )}

      {/* Navigation Buttons */}
      <div className="mt-8 flex items-center justify-between w-full max-w-xs gap-3">
        <Button variant="outline" onClick={onBack} size="lg" className="w-1/2">
          <ArrowLeft className="size-4 mr-1.5" />
          Zurück
        </Button>
        <Button
          onClick={() => {
            if (selectedCompanyId) {
              onContinue();
            } else if (companies.length > 0) {
              handlePickCompany(companies[0].id);
              onContinue();
            } else {
              setShowCreateForm(true);
            }
          }}
          size="lg"
          className="w-1/2"
        >
          Weiter
          <ArrowRight className="size-4 ml-1.5" />
        </Button>
      </div>
    </div>
  );
}
