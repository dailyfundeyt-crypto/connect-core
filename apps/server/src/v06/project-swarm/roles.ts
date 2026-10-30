/**
 * Project-Swarm: Role Management (v06 / A27)
 *
 * Verwaltet die Rollenverteilung im Schwarm ähnlich einer Firma:
 * - Planer (Planner): Zerlegt Projektziele in DAG-Teilaufgaben mit Akzeptanzkriterien
 * - Arbeiter (Worker): Führt zugewiesene Aufgaben aus und liefert Teilergebnisse
 * - Prüfer (Reviewer): Validiert Arbeitsergebnisse gegen Akzeptanzkriterien vor dem Status 'done'
 * - Berichterstatter (Reporter): Fasst Meilensteine zusammen und erstellt Fortschrittsberichte
 */

export type SwarmRole = "planner" | "worker" | "reviewer" | "reporter";

export interface BotRoleAssignment {
  botId: string;
  roles: SwarmRole[];
  capabilities?: string[];
  maxParallelTasks?: number;
}

export interface RoleRegistry {
  getRoles(botId: string): SwarmRole[];
  hasRole(botId: string, role: SwarmRole): boolean;
  assignRoles(botId: string, roles: SwarmRole[], capabilities?: string[]): void;
  findBotsForRole(role: SwarmRole): string[];
}

export class SwarmRoleManager implements RoleRegistry {
  private assignments = new Map<string, BotRoleAssignment>();

  constructor() {
    this.seedDefaultRoles();
  }

  private seedDefaultRoles(): void {
    // Standard-Rollen für Kern-Agenten
    this.assignRoles("bot-planner-01", ["planner"], ["task-decomposition", "goal-analysis"]);
    this.assignRoles("bot-reviewer-01", ["reviewer"], ["acceptance-verification", "code-review"]);
    this.assignRoles("bot-reporter-01", ["reporter"], ["summary-generation", "timeline-posting"]);
  }

  public assignRoles(
    botId: string,
    roles: SwarmRole[],
    capabilities: string[] = [],
    maxParallelTasks = 1,
  ): void {
    if (!botId || botId.trim() === "") {
      throw new Error("botId ist erforderlich.");
    }
    if (!Array.isArray(roles) || roles.length === 0) {
      throw new Error("Mindestens eine Rolle muss zugewiesen werden.");
    }

    this.assignments.set(botId, {
      botId: botId.trim(),
      roles: [...new Set(roles)],
      capabilities,
      maxParallelTasks,
    });
  }

  public getRoles(botId: string): SwarmRole[] {
    const assignment = this.assignments.get(botId);
    if (!assignment) {
      // Wenn ein Bot noch nicht explizit registriert ist, ist er standardmäßig Worker
      return ["worker"];
    }
    return [...assignment.roles];
  }

  public hasRole(botId: string, role: SwarmRole): boolean {
    const roles = this.getRoles(botId);
    return roles.includes(role);
  }

  public findBotsForRole(role: SwarmRole): string[] {
    const result: string[] = [];
    for (const [botId, assignment] of this.assignments.entries()) {
      if (assignment.roles.includes(role)) {
        result.push(botId);
      }
    }
    return result;
  }

  public getAllAssignments(): BotRoleAssignment[] {
    return Array.from(this.assignments.values());
  }

  public clear(): void {
    this.assignments.clear();
  }
}

// Globaler Singleton für Laufzeit
export const roleManager = new SwarmRoleManager();
