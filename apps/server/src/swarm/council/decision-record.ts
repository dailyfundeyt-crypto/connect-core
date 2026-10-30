import type {
  CouncilSession,
  CouncilSeat,
  CouncilTurn,
  CouncilVote,
  DecisionRecord,
  ScoringResult,
} from "./types";
import { getSparkFoldersStore } from "../../brain/browser-folders/store";

export class CouncilDecisionRecordGenerator {
  /**
   * Generates the ADR-compliant Markdown document (verdict.md).
   * Incorporates decision matrix, dissent, ruin-risk audit, verified citations, and action steps.
   */
  public static generateRecordMarkdown(
    session: CouncilSession,
    seats: CouncilSeat[],
    turns: CouncilTurn[],
    votes: CouncilVote[],
    scoring: ScoringResult,
    citations: Array<{ citationTag: string; quote: string }> = []
  ): string {
    const dateStr = new Date().toISOString().split("T")[0];
    const timestampStr = new Date().toISOString();

    // Table of options and scores
    const tableHeader = "| Option | Score (0-10) | Gewichteter Score | Borda-Pkt. | Ruin-Risiko | Status |";
    const tableSep = "|---|---|---|---|---|---|";
    const tableRows = scoring.ranking.map((s) => {
      const ruinBadge = s.hasRuinRisk ? "⚠️ VETO" : "✅ 0%";
      const statusBadge = s.status === "capped_ruin" ? "❌ DISQUALIFIZIERT (Ruin)" : s.option === scoring.recommendedOption ? "🏆 EMPFOHLEN" : "Abgelehnt";
      return `| ${s.option} | ${s.averageScore.toFixed(2)} | ${s.totalWeightedScore.toFixed(2)} | ${s.bordaPoints.toFixed(1)} | ${ruinBadge} | ${statusBadge} |`;
    });

    // Seat roster
    const seatsList = seats
      .map((s) => `- **${s.agentId}** (Rolle: ${s.role || "Council Member"}, Gewicht: ${s.weight.toFixed(2)})`)
      .join("\n");

    // Key arguments from turns
    const keyTurns = turns
      .map((t) => {
        const flag = (t as any).isDevilsAdvocate ? "🚨 [DEVIL'S ADVOCATE] " : "";
        return `- **${flag}${t.agentId}** (Runde ${t.round}, Haltung: *${t.stance || "neutral"}*):\n  > ${t.content.replace(/\n+/g, " ")}`;
      })
      .join("\n\n");

    // Citations list (Strict privacy: short excerpts only, max 1-2 sentences)
    const citationsList = citations.length > 0
      ? citations
          .map(
            (c, i) =>
              `${i + 1}. \`${c.citationTag}\`:\n   > "${c.quote.length > 200 ? c.quote.substring(0, 197) + "..." : c.quote}"`
          )
          .join("\n\n")
      : "Keine externen Zitate für diese Sitzung protokolliert.";

    return [
      `# ADR: Council Decision Record – ${session.question}`,
      `\n## Metadaten`,
      `- **Session-ID:** \`${session.id}\``,
      `- **Datum:** ${dateStr} (${timestampStr})`,
      `- **Status:** Abgeschlossen (Verabschiedet)`,
      `- **Debatten-Modus:** \`${session.mode}\``,
      `- **Privacy-Klassifizierung:** \`private\` (Interne Firmenentscheidung – strikt vertraulich)`,
      `- **Export-Restriktion:** Nicht für Connect Sozial oder öffentlichen Marktplatz zugelassen.`,
      `\n## 1. Kontext & Problemstellung`,
      session.context || "Keine zusätzlichen Kontextangaben hinterlegt.",
      `\n## 2. Zusammensetzung des Councils`,
      seatsList,
      `\n## 3. Bewertungsmatrix & Abstimmungsergebnis`,
      tableHeader,
      tableSep,
      ...tableRows,
      `\n## 4. Beschluss & Finale Empfehlung`,
      `### ${scoring.verdict}`,
      `**Konfidenz:** ${(scoring.confidence * 100).toFixed(0)}%`,
      `\n**Begründung:**`,
      scoring.rationale,
      `\n## 5. Dissent & Minderheiten-Voten`,
      scoring.dissent || "Kein Dissens verzeichnet.",
      `\n## 6. Risikobewertung & Ruin-Problem-Check`,
      scoring.hasCappedOptions
        ? "⚠️ **Ruin-Problem interveniert:** Mindestens eine rechnerisch hoch bewertete Option wurde vom Council wegen existenzbedrohender Risiken disqualifiziert."
        : "✅ **Ruin-Audit bestanden:** Für die verabschiedete Option wurde kein existenzbedrohendes Risiko (Ruin Problem) nachgewiesen.",
      `\n## 7. Wichtigste Argumente aus der Debatte`,
      keyTurns,
      `\n## 8. Verifizierte Zitate & Wissensquellen ($100M Money Models)`,
      citationsList,
      `\n## 9. Nächste Schritte & Action Items`,
      `1. **Pilotierung:** Schrittweise Umsetzung von "${scoring.recommendedOption}" mit messbaren Zwischenzielen.`,
      `2. **Monitoring:** Fortlaufende Überprüfung der Cashflow-Metriken und Kundenfeedback im wöchentlichen Turnus.`,
      `3. **Archivierung:** Dieser Decision Record ist dauerhaft im Spark-Ordner 'Entscheidungen' revisionssicher abgelegt.`,
    ].join("\n");
  }

  /**
   * Persists the generated decision record in the Spark Browser Folders store under 'Entscheidungen'.
   */
  public static async saveToSparkDecisionsFolder(
    session: CouncilSession,
    decisionRecord: DecisionRecord
  ): Promise<{ folderId: string; noteId: string }> {
    try {
      const store = getSparkFoldersStore();

      // Find or create 'Entscheidungen' folder
      const allFolders = await store.listFolders();
      let decisionsFolder = allFolders.find(
        (f) => f.name.toLowerCase() === "entscheidungen" || f.id === "folder_decisions"
      );

      if (!decisionsFolder) {
        decisionsFolder = await store.createFolder({
          name: "Entscheidungen",
          kind: "normal",
          ownerScope: "company",
        });
      }

      const noteId = `note_verdict_${session.id}`;
      const title = `ADR: ${session.question.slice(0, 50)}`;

      await store.attachNote({
        folderId: decisionsFolder.id,
        noteId,
        title,
        content: decisionRecord.recordMd,
        setAsInstruction: true,
      });

      return {
        folderId: decisionsFolder.id,
        noteId,
      };
    } catch (err) {
      console.warn("[CouncilDecisionRecord] Could not persist to Spark folder:", err);
      return {
        folderId: "folder_decisions_fallback",
        noteId: `note_verdict_${session.id}`,
      };
    }
  }
}
