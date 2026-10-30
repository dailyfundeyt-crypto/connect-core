/**
 * Project-Swarm: Goal Decomposer (v06 / A27)
 *
 * Zerlegt Projektziele rekursiv in einen DAG-Aufgabenbaum (ProjectTask)
 * mit konfigurierbarer maximaler Tiefe und Breite.
 * Jede Teilaufgabe besitzt zwingend überprüfbare Akzeptanzkriterien (acceptance).
 */

import { randomUUID } from "node:crypto";
import type { ProjectTask } from "../../contracts/v06/social";

export interface DecomposeOptions {
  maxDepth?: number; // Standard: 3
  maxBranching?: number; // Standard: 4
  llmInvoker?: (prompt: string) => Promise<string>;
  domain?: "biomedical" | "software" | "general";
}

export interface RawTaskNode {
  title: string;
  acceptance: string;
  subtasks?: RawTaskNode[];
}

export class GoalDecomposer {
  /**
   * Zerlegt ein Ziel in eine flache Liste von ProjectTasks mit parentId-Beziehungen
   */
  public async decomposeGoal(
    projectId: string,
    goal: string,
    options: DecomposeOptions = {},
  ): Promise<ProjectTask[]> {
    if (!projectId || projectId.trim() === "") {
      throw new Error("projectId ist erforderlich.");
    }
    if (!goal || goal.trim() === "") {
      throw new Error("goal ist erforderlich.");
    }

    const maxDepth = Math.max(1, Math.min(options.maxDepth ?? 3, 5));
    const maxBranching = Math.max(1, Math.min(options.maxBranching ?? 4, 8));

    let nodes: RawTaskNode[] = [];

    // 1. Wenn LLM verfügbar ist, versuchen wir LLM-gestützte Zerlegung
    if (options.llmInvoker) {
      try {
        nodes = await this.decomposeWithLlm(goal, options.llmInvoker, maxDepth, maxBranching);
      } catch (err) {
        // Fallback auf deterministische Heuristik
        nodes = this.decomposeHeuristic(goal, maxDepth, maxBranching, options.domain);
      }
    } else {
      nodes = this.decomposeHeuristic(goal, maxDepth, maxBranching, options.domain);
    }

    // 2. Erzeuge den flachen Task-Baum mit UUIDs und parentId
    const resultTasks: ProjectTask[] = [];

    // Root-Aufgabe für das Gesamtprojekt
    const rootId = `task_${randomUUID().replace(/-/g, "").slice(0, 24)}`;
    const rootTask: ProjectTask = {
      id: rootId,
      projectId,
      parentId: undefined,
      title: `Gesamtkoordination: ${goal.slice(0, 60)}${goal.length > 60 ? "..." : ""}`,
      acceptance: "Alle untergeordneten Teilaufgaben erfolgreich von Prüfer-Bots abgenommen.",
      status: "todo",
    };
    resultTasks.push(rootTask);

    // Rekursiv Kinder einfügen
    this.flattenNodes(nodes, rootId, projectId, 1, maxDepth, maxBranching, resultTasks);

    return resultTasks;
  }

  private flattenNodes(
    nodes: RawTaskNode[],
    parentId: string,
    projectId: string,
    currentDepth: number,
    maxDepth: number,
    maxBranching: number,
    accumulator: ProjectTask[],
  ): void {
    if (currentDepth > maxDepth) return;

    const slice = nodes.slice(0, maxBranching);
    for (const node of slice) {
      const taskId = `task_${randomUUID().replace(/-/g, "").slice(0, 24)}`;
      const task: ProjectTask = {
        id: taskId,
        projectId,
        parentId,
        title: node.title.trim(),
        acceptance: node.acceptance.trim() || "Ergebnis entspricht der Aufgabenbeschreibung und ist verifizierbar.",
        status: "todo",
      };
      accumulator.push(task);

      if (node.subtasks && node.subtasks.length > 0 && currentDepth < maxDepth) {
        this.flattenNodes(
          node.subtasks,
          taskId,
          projectId,
          currentDepth + 1,
          maxDepth,
          maxBranching,
          accumulator,
        );
      }
    }
  }

  /**
   * Deterministische Zerlegungs-Heuristik
   */
  public decomposeHeuristic(
    goal: string,
    maxDepth: number,
    maxBranching: number,
    domainOverride?: string,
  ): RawTaskNode[] {
    const lower = goal.toLowerCase();

    const isBio =
      domainOverride === "biomedical" ||
      lower.includes("krebs") ||
      lower.includes("cancer") ||
      lower.includes("kras") ||
      lower.includes("medizin") ||
      lower.includes("pharma") ||
      lower.includes("docking") ||
      lower.includes("protein");

    const isSoftware =
      domainOverride === "software" ||
      lower.includes("code") ||
      lower.includes("programm") ||
      lower.includes("api") ||
      lower.includes("refactor") ||
      lower.includes("software") ||
      lower.includes("feature");

    if (isBio) {
      return [
        {
          title: "Literatur- & Bindungstaschen-Recherche (PDB & PubMed)",
          acceptance: "Mindestens 20 validierte Bindungsmuster mit Affinitäten strukturiert extrahiert.",
          subtasks: [
            {
              title: "Switch-II Taschendaten aus Kristallstrukturen isolieren",
              acceptance: "PDB-Koordinaten und allosterische Konformationen tabellarisch abgelegt.",
            },
            {
              title: "Widerstands-Mutationen (z.B. Y96D) dokumentieren",
              acceptance: "Plausible Resistenzpfade anhand Veröffentlichungen aufgeschlüsselt.",
            },
          ],
        },
        {
          title: "Molekulares Docking & Affinitäts-Screening",
          acceptance: "Docking-Scores für definierte Molekül-Klassen berechnet (Zielwert < -8.5 kcal/mol).",
          subtasks: [
            {
              title: "Piperazin- und Makrozyklus-Kandidaten filtern",
              acceptance: "Top 50 Molekül-Strukturen mit höchster Bindungsenergie exportiert.",
            },
          ],
        },
        {
          title: "ADMET-Toxizitäts- & Pharmakokinetik-Prüfung",
          acceptance: "ADMET-Filter angewendet; keine toxischen Alarmsignale in den Top 5 Kandidaten.",
        },
        {
          title: "Wissenschaftlicher Entwurfsbericht & Syntheseempfehlung",
          acceptance: "Synthesebericht mit Non-Clinical Disclaimer und Labor-Prüfprotokoll fertiggestellt.",
        },
      ];
    }

    if (isSoftware) {
      return [
        {
          title: "Architektur- & Schnittstellen-Spezifikation",
          acceptance: "TypeScript-Interfaces, API-Routen und Fehler-Responses vollständig definiert.",
          subtasks: [
            {
              title: "Datenmodell und Schema definieren",
              acceptance: "Schema-Migrationen und Drizzle-Definitionen ohne Syntaxfehler.",
            },
            {
              title: "REST- & Event-Contracts abstimmen",
              acceptance: "Endpoint-Pfade und Schemata mit CONTRACTS_V06 abgeglichen.",
            },
          ],
        },
        {
          title: "Kern-Implementierung des Moduls",
          acceptance: "Alle Geschäftslogik-Funktionen fehlerfrei implementiert.",
        },
        {
          title: "Automatisierte Unit- & Integrationstests",
          acceptance: "Alle Testsuiten bestehen; Testabdeckung >= 85%.",
        },
        {
          title: "Sicherheits-Audit & Dokumentation",
          acceptance: "Keine Auth-Bypasses oder Command Injections; README aktualisiert.",
        },
      ];
    }

    // Allgemeiner Fall
    return [
      {
        title: "Ist-Analyse & Informationsbeschaffung",
        acceptance: "Rahmenbedingungen, Anforderungen und Datenquellen vollständig dokumentiert.",
        subtasks: [
          {
            title: "Relevante Daten und Ressourcen aggregieren",
            acceptance: "Verifizierte Datengrundlage liegt strukturiert vor.",
          },
        ],
      },
      {
        title: "Konzeption & Meilenstein-Strukturierung",
        acceptance: "Messbare Kriterien für Zwischenergebnisse festgelegt.",
      },
      {
        title: "Durchführung & Teilergebnis-Erstellung",
        acceptance: "Lösungsartefakte erstellt und Zwischenschritte dokumentiert.",
      },
      {
        title: "Qualitätsprüfung & Abschlussbericht",
        acceptance: "Prüfer-Freigabe erteilt und Fortschrittsbericht veröffentlicht.",
      },
    ];
  }

  private async decomposeWithLlm(
    goal: string,
    invoker: (prompt: string) => Promise<string>,
    maxDepth: number,
    maxBranching: number,
  ): Promise<RawTaskNode[]> {
    const prompt = `
Du bist der Planer-Bot eines dezentralen Bot-Schwarms.
Zerlege das folgende Projektziel in einen hierarchischen Aufgabenbaum mit maximaler Tiefe ${maxDepth} und maximal ${maxBranching} Teilaufgaben pro Ebene.
Jede Teilaufgabe MUSS einen klaren Titel und messbare, testbare Akzeptanzkriterien ('acceptance') enthalten!

Projektziel:
"${goal}"

Antworte AUSSCHLIESSLICH mit einem gültigen JSON-Objekt in folgendem Format:
{
  "tasks": [
    {
      "title": "Aufgabentitel",
      "acceptance": "Genaue messbare Kriterien zur Abnahme",
      "subtasks": [
        {
          "title": "Unteraufgabe",
          "acceptance": "Messbare Kriterien"
        }
      ]
    }
  ]
}
`.trim();

    const response = await invoker(prompt);
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("Kein gültiges JSON im LLM-Ergebnis gefunden.");
    }

    const parsed = JSON.parse(jsonMatch[0]);
    if (!parsed || !Array.isArray(parsed.tasks)) {
      throw new Error("JSON enthält kein 'tasks'-Array.");
    }

    return parsed.tasks;
  }
}

export const goalDecomposer = new GoalDecomposer();
