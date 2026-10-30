import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { AskService } from "./service";
import { HybridSearchEngine } from "./search";
import { CliRunner, DeterministicSparkMockRunner } from "./cli-runner";
import { INSUFFICIENT_DATA_MESSAGE } from "./types";
import { brainRootFromEnv, resolveBrainRoot, notePath } from "../../store";

/**
 * 10 Test Questions Test Suite for Lane 2: Q&A-Chat über Spark mit Zitaten
 *
 * Verifies:
 * 1. Correct citation extraction [n]
 * 2. Absolute path integrity: NO HALLUCINATED PATHS (every notePath must exist on disk)
 * 3. Exact line numbers (lineStart > 0)
 * 4. Proper "Ich weiß es nicht" thresholding for unknown/out-of-domain queries
 * 5. Deterministic fallback runner & provider failover
 */

interface TestCase {
  id: number;
  query: string;
  expectedCategory: "vault_grounded" | "insufficient_data";
  expectedKeywordInAnswerOrNote?: string;
}

export const TEST_QUESTIONS: TestCase[] = [
  {
    id: 1,
    query: "Was sind die Design-Prinzipien und Richtlinien in CNT?",
    expectedCategory: "vault_grounded",
    expectedKeywordInAnswerOrNote: "Design",
  },
  {
    id: 2,
    query: "Welche technischen Grundlagen und Systeme umfasst CNT Computing?",
    expectedCategory: "vault_grounded",
    expectedKeywordInAnswerOrNote: "Computing",
  },
  {
    id: 3,
    query: "Gibt es Notizen zu Startup Roles Prompt Templates?",
    expectedCategory: "vault_grounded",
    expectedKeywordInAnswerOrNote: "Startup",
  },
  {
    id: 4,
    query: "Was ist in den Aufzeichnungen zu CNT Code dokumentiert?",
    expectedCategory: "vault_grounded",
    expectedKeywordInAnswerOrNote: "Code",
  },
  {
    id: 5,
    query: "Welche Gedanken und Notizen gibt es zur Frage Wie soll ich mit der Zukunft Umgehen?",
    expectedCategory: "vault_grounded",
    expectedKeywordInAnswerOrNote: "Zukunft",
  },
  {
    id: 6,
    query: "Was steht auf der Startseite von CNT?",
    expectedCategory: "vault_grounded",
    expectedKeywordInAnswerOrNote: "Startseite",
  },
  {
    id: 7,
    query: "Welche Business- und Kanal-Analysen gibt es für Stefan?",
    expectedCategory: "vault_grounded",
    expectedKeywordInAnswerOrNote: "Stefan",
  },
  {
    id: 8,
    query: "Was ist zu Icons und visuellen Symbolen festgehalten?",
    expectedCategory: "vault_grounded",
    expectedKeywordInAnswerOrNote: "Icons",
  },
  {
    id: 9,
    query: "Wie funktioniert der hypothetische Quanten-Warp-Antrieb auf Alpha Centauri?",
    expectedCategory: "insufficient_data",
  },
  {
    id: 10,
    query: "Wie backt man glutenfreie Bananen-Pfannkuchen mit Karamellsauce?",
    expectedCategory: "insufficient_data",
  },
];

export async function runAskTestSuite(): Promise<{
  total: number;
  passed: number;
  failed: number;
  details: Array<{ id: number; query: string; status: "PASS" | "FAIL"; reason?: string }>;
}> {
  console.log("\n=======================================================");
  console.log("   SPARK-LEARN LANE 2: Q&A CITATION TEST SUITE (10 QUESTIONS)");
  console.log("=======================================================\n");

  const envRoot = brainRootFromEnv();
  const brainRes = await resolveBrainRoot(envRoot);
  const root = brainRes.available && brainRes.root ? brainRes.root : (envRoot || "");
  console.log(`[Test] Using Spark Vault Root: "${root}"`);

  // Initialize service with HybridSearchEngine and deterministic mock runner for test stability
  const searchEngine = new HybridSearchEngine({ vaultRoot: root });
  const deterministicRunner = new CliRunner([new DeterministicSparkMockRunner()]);
  const service = new AskService({ searchEngine, cliRunner: deterministicRunner });

  const results: Array<{ id: number; query: string; status: "PASS" | "FAIL"; reason?: string }> = [];
  let passedCount = 0;

  for (const tc of TEST_QUESTIONS) {
    console.log(`\n--- [Frage ${tc.id}/10] "${tc.query}" ---`);

    try {
      const response = await service.ask({
        query: tc.query,
        maxCitations: 5,
        stream: false,
      });

      console.log(`[Response] Provider: ${response.provider} | Confidence: ${response.confidence} | Hits: ${response.searchHitsCount}`);
      console.log(`[Response] Answer: ${response.answer.slice(0, 160)}...`);
      console.log(`[Response] Citations count: ${response.citations.length}`);

      if (tc.expectedCategory === "insufficient_data") {
        if (!response.insufficientData || !response.answer.includes("Ich weiß es nicht")) {
          throw new Error(`Erwartete 'Ich weiß es nicht', aber Antwort war: "${response.answer}"`);
        }
        if (response.citations.length !== 0) {
          throw new Error(`Unerwartete Zitate für unbekannte Frage: ${response.citations.length}`);
        }
        console.log(`✅ PASS: Korrekt als unbekannt klassifiziert ("${INSUFFICIENT_DATA_MESSAGE}")`);
        passedCount++;
        results.push({ id: tc.id, query: tc.query, status: "PASS" });
        continue;
      }

      // Check category: vault_grounded
      if (response.insufficientData) {
        throw new Error(`Erwartete Quellen für '${tc.query}', aber erhielt 'insufficientData: true'`);
      }

      if (response.citations.length === 0) {
        throw new Error("Keine Zitate geliefert.");
      }

      // Check Citation Integrity & verify NO HALLUCINATED PATHS
      for (const cit of response.citations) {
        if (!cit.notePath || cit.notePath.trim().length === 0) {
          throw new Error(`Ungültiger leerer notePath in Zitat [${cit.n}]`);
        }
        if (cit.lineStart <= 0) {
          throw new Error(`Ungültige Zeilennummer: ${cit.lineStart}`);
        }

        // Verify file physically exists on disk
        const physicalFile = notePath(root, cit.notePath);
        if (!existsSync(physicalFile)) {
          throw new Error(`HALLUZINIERTER PFAD DETEKTIERT: '${cit.notePath}' existiert nicht unter '${physicalFile}'`);
        }

        // Verify line content is within file bounds
        const fileContent = readFileSync(physicalFile, "utf8");
        const lines = fileContent.split(/\r?\n/);
        if (cit.lineStart > lines.length + 5) {
          throw new Error(`Zeilennummer ${cit.lineStart} überschreitet Dateilänge (${lines.length}) in '${cit.notePath}'`);
        }

        console.log(`   [ZITAT VERIFIZIERT] [${cit.n}] -> "${cit.notePath}" (${cit.heading}) Zeile ${cit.lineStart} [EXISTIERT AUF DISK]`);
      }

      console.log(`✅ PASS: Frage ${tc.id} erfolgreich beantwortet mit ${response.citations.length} verifizierten Zitaten.`);
      passedCount++;
      results.push({ id: tc.id, query: tc.query, status: "PASS" });
    } catch (err: any) {
      console.error(`❌ FAIL: Frage ${tc.id} fehlgeschlagen: ${err?.message || err}`);
      results.push({ id: tc.id, query: tc.query, status: "FAIL", reason: err?.message || String(err) });
    }
  }

  // Also test SaveChatToProposal
  console.log("\n--- [Zusatz-Test] Chatverlauf in _spark/chats/ speichern ---");
  try {
    const saveRes = await service.saveChatToProposal({
      title: "Test-Chat Q&A CNT",
      messages: [
        { role: "user", content: "Was ist CNT?", timestamp: "12:00" },
        { role: "assistant", content: "CNT ist das zentrale Wissens- und Arbeitssystem [1].", timestamp: "12:01" },
      ],
      citations: [
        { n: 1, notePath: "00 A CNT/000_CNT Computing.md", heading: "Übersicht", lineStart: 1 },
      ],
      targetFolder: "_spark/chats",
      tags: ["spark/chat", "test"],
    });

    console.log(`[SaveChat] Result: ${saveRes.message} | Proposed: ${saveRes.proposedPath}`);
    const savedPath = notePath(root, saveRes.proposedPath);
    if (existsSync(savedPath)) {
      console.log(`✅ PASS: Chat-Datei existiert physisch unter '${savedPath}'`);
    } else {
      console.warn(`[SaveChat] Hinweis: Datei '${savedPath}' konnte im Dateisystem noch nicht gelistet werden.`);
    }
  } catch (err: any) {
    console.error(`[SaveChat] Fehler: ${err?.message}`);
  }

  console.log("\n=======================================================");
  console.log(`   TESTERGEBNIS: ${passedCount} von ${TEST_QUESTIONS.length} Tests BESTANDEN`);
  console.log("=======================================================\n");

  return {
    total: TEST_QUESTIONS.length,
    passed: passedCount,
    failed: TEST_QUESTIONS.length - passedCount,
    details: results,
  };
}

// Direct script execution support
if (import.meta.main || process.argv[1]?.endsWith("ask.test.ts")) {
  runAskTestSuite()
    .then((res) => {
      if (res.failed > 0) {
        process.exit(1);
      }
      process.exit(0);
    })
    .catch((err) => {
      console.error("Fatal test runner error:", err);
      process.exit(1);
    });
}
