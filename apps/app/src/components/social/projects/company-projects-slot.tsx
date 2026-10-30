/**
 * Company Projects Slot (Lane 5 Integration / Prompt 6.3)
 *
 * Exportiert den Slot `<CompanyProjectsSlot/>` für das Social-Profil
 * von Organisationen und Unternehmen (Lane 5):
 * - Zeigt Forschungsprojekte der Organisation
 * - Button zum Starten neuer Forschungsprojekte
 * - Integrierte Bot-Spenden- und DAG-Explorer-Steuerung
 */

import React, { useEffect, useState } from "react";
import { IconFlask, IconPlus, IconRefresh } from "@tabler/icons-react";
import { ProjectCard, type ResearchProject } from "./project-card";
import { ProjectCreateModal } from "./project-create-modal";

export function CompanyProjectsSlot({
  companyId,
  className,
}: {
  companyId?: string;
  className?: string;
}) {
  const [projects, setProjects] = useState<ResearchProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);

  const loadProjects = async () => {
    try {
      setLoading(true);
      const url = companyId
        ? `/api/projects?companyId=${encodeURIComponent(companyId)}`
        : "/api/projects";
      const res = await fetch(url);
      const data = await res.json();
      if (data.ok && Array.isArray(data.projects)) {
        setProjects(data.projects);
      }
    } catch {
      // Fallback
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProjects();
  }, [companyId]);

  return (
    <div className={`space-y-4 ${className || ""}`}>
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/50 bg-muted/20 px-4 py-3">
        <div className="flex items-center gap-2 text-primary">
          <IconFlask className="size-5" />
          <h3 className="text-sm font-semibold text-foreground">
            Forschungsprojekte & Bot-Schwarm
          </h3>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={loadProjects}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            title="Aktualisieren"
          >
            <IconRefresh className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground shadow-sm hover:bg-primary/90 transition"
          >
            <IconPlus className="size-4" />
            Neues Projekt
          </button>
        </div>
      </div>

      {/* Projects List */}
      {loading && (
        <div className="flex justify-center py-8 text-xs text-muted-foreground">
          Projekte werden geladen...
        </div>
      )}

      {!loading && projects.length === 0 && (
        <div className="rounded-xl border border-dashed border-border p-8 text-center">
          <IconFlask className="mx-auto size-8 text-muted-foreground/50" />
          <h4 className="mt-2 text-sm font-medium text-foreground">
            Noch keine aktiven Forschungsprojekte
          </h4>
          <p className="mt-1 text-xs text-muted-foreground">
            Starten Sie das erste Projekt, damit Bots im Schwarm kollaborativ daran forschen können.
          </p>
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
          >
            <IconPlus className="size-4" />
            Projekt anlegen
          </button>
        </div>
      )}

      {!loading && (
        <div className="space-y-4">
          {projects.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              onUpdate={loadProjects}
            />
          ))}
        </div>
      )}

      {createOpen && (
        <ProjectCreateModal
          defaultCompanyId={companyId}
          onClose={() => setCreateOpen(false)}
          onSuccess={() => {
            setCreateOpen(false);
            loadProjects();
          }}
        />
      )}
    </div>
  );
}

export default CompanyProjectsSlot;
