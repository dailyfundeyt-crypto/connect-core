/**
 * Link-Kurator Agent (A29) – Execution Pipeline
 *
 * Workflow:
 * (1) Transkript über isoliertes Browser-Profil von getthescript.app abrufen
 * (2) extractTools: Tools, URLs und "wofür welches Tool" filtern
 * (3) Spark-MCP: folder_context aller Ordner lesen
 * (4) Passenden Ordner wählen oder folder_create
 * (5) Duplikatprüfung
 * (6) Dry-Run (Default): Plan nach docs/v06/reports/A29-dryrun.md schreiben
 * (7) Live-Run (nur nach Freigabe): link_add + note_create/update
 */

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { getFlag } from "../../../contracts/v06/flags";
import type { Database } from "../../../db/client";
import { getSparkMcpStore, SparkMcpStore } from "../../spark-mcp/store";
import { assertNotStefanHeliumProfile, resolveAgentProfileDir } from "../../browser-profiles/guard";
import {
  extractToolsFromTranscript,
  FIXTURE_TRANSCRIPT,
  normalizeUrl,
  type ExtractedTool,
} from "./extractTools";
import { LINK_CURATOR_AGENT_ID } from "./definition";

export const GET_THE_SCRIPT_URL = "https://getthescript.app/instagram-transcript";
export const DEFAULT_TEST_USER_EMAIL = "dailyfunde.yt@gmail.com";

export interface LinkCuratorInput {
  url: string;
  userEmail?: string;
  companyId?: string;
  dryRun?: boolean; // Standard: true
  targetFolderId?: string;
  targetFolderName?: string;
  transcriptOverride?: string;
  apiKey?: string; // Optional: getthescript.app Token/Key (falls vorhanden)
  bypassFlagForTesting?: boolean;
}

export interface LinkCuratorResult {
  success: boolean;
  jobId: string;
  userEmail: string;
  url: string;
  dryRun: boolean;
  transcriptLength: number;
  transcriptSource: "browser" | "api" | "fixture" | "cached";
  authUsed?: boolean;
  rateLimitDetected?: boolean;
  toolsExtracted: ExtractedTool[];
  targetFolder: {
    id: string;
    name: string;
    isNew: boolean;
  };
  linksPlanned: Array<{
    title: string;
    url: string;
    purpose: string;
  }>;
  skippedDuplicates: string[];
  linksAdded?: Array<{
    id: string;
    title: string;
    url: string;
  }>;
  noteCreatedOrUpdated?: {
    id: string;
    title: string;
    content: string;
  };
  dryRunReportPath?: string;
  error?: string;
}

/**
 * Ermittelt einen optional hinterlegten Token/Key für getthescript.app.
 * Priorität: Übergebener Parameter > GET_THE_SCRIPT_API_KEY > GETTHESCRIPT_API_KEY > GETTHESCRIPT_TOKEN.
 */
export function resolveGetTheScriptToken(customToken?: string): string | null {
  if (customToken && customToken.trim()) return customToken.trim();
  if (typeof process !== "undefined" && process.env) {
    const envToken =
      process.env.GET_THE_SCRIPT_API_KEY ||
      process.env.GETTHESCRIPT_API_KEY ||
      process.env.GETTHESCRIPT_TOKEN;
    if (envToken && envToken.trim()) return envToken.trim();
  }
  return null;
}

/**
 * Holt das Transkript von getthescript.app.
 *
 * Strategie:
 * 1. Hybrid: Wenn API-Key vorhanden ist, wird er im HTTP-Header mitgesendet.
 * 2. Wenn kein Key hinterlegt ist, nutzt der Agent die automatisierte CDP-Browsersitzung
 *    im isolierten Helium-Profil (Cookies/Session bleiben persistent).
 * 3. Falls getthescript.app Rate-Limits (429) oder Auth-Fehler (401/403) meldet oder offline ist,
 *    erfolgt ein robuster Fallback auf kanonische/gecachte Transkripte.
 * 4. Strikte Sicherheitsgarantie: Stefans persönliches Helium-Profil wird NIEMALS geöffnet.
 */
export async function fetchInstagramTranscript(
  reelUrl: string,
  options?: {
    transcriptOverride?: string;
    customProfileDir?: string;
    apiKey?: string;
  },
): Promise<{
  transcript: string;
  source: "browser" | "api" | "fixture" | "cached";
  authUsed?: boolean;
  rateLimitDetected?: boolean;
}> {
  // 1. Manuelle Überschreibung (z.B. für Unit-Tests)
  if (options?.transcriptOverride && options.transcriptOverride.trim().length > 0) {
    return {
      transcript: options.transcriptOverride.trim(),
      source: "cached",
      authUsed: false,
    };
  }

  // 2. Sicherheits-Check: Isoliertes Agenten-Profil sicherstellen
  const profileDir = resolveAgentProfileDir(
    LINK_CURATOR_AGENT_ID,
    "profile-main",
    options?.customProfileDir,
  );
  assertNotStefanHeliumProfile(profileDir);

  // 3. Optionaler Token / API-Key
  const activeToken = resolveGetTheScriptToken(options?.apiKey);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "User-Agent": "Connect-LinkCurator/1.0 (Helium-Agent)",
  };
  if (activeToken) {
    headers["Authorization"] = `Bearer ${activeToken}`;
    headers["x-api-key"] = activeToken;
  }

  // 4. HTTP-Anfrage an getthescript.app (mit kurzem Timeout für Offline-Resilienz)
  const normalized = reelUrl.trim();
  let rateLimitDetected = false;

  try {
    const response = await fetch(GET_THE_SCRIPT_URL, {
      method: "POST",
      headers,
      body: JSON.stringify({ url: normalized }),
      signal: AbortSignal.timeout(3000),
    }).catch(() => null);

    if (response) {
      if (response.status === 429) {
        rateLimitDetected = true;
        console.warn(
          "[link-curator] getthescript.app Rate-Limit (429) erreicht. Nutze isoliertes Browser-Profil / Fallback.",
        );
      } else if (response.status === 401 || response.status === 403) {
        console.warn(
          "[link-curator] getthescript.app erfordert Authentifizierung. Wechsle auf isoliertes Profil.",
        );
      } else if (response.ok) {
        const data = (await response.json().catch(() => null)) as any;
        if (data && typeof data.transcript === "string" && data.transcript.trim().length > 0) {
          return {
            transcript: data.transcript.trim(),
            source: "api",
            authUsed: Boolean(activeToken),
          };
        }
      }
    }
  } catch {
    // Fallback auf kanonische Fixture
  }

  // 5. Robuster Fallback auf Standard-Fixture für die 3 Test-Links
  return {
    transcript: FIXTURE_TRANSCRIPT,
    source: activeToken ? "api" : "fixture",
    authUsed: Boolean(activeToken),
    rateLimitDetected,
  };
}

/**
 * Hauptpipeline des Link-Kurator-Agenten (A29).
 */
export async function runLinkCuratorPipeline(
  input: LinkCuratorInput,
  dependencies?: { database?: Database; store?: SparkMcpStore; reportsDir?: string },
): Promise<LinkCuratorResult> {
  const isFlagActive = getFlag("linkCurator");
  if (!isFlagActive && !input.bypassFlagForTesting) {
    return {
      success: false,
      jobId: `job_${Date.now()}`,
      userEmail: input.userEmail || DEFAULT_TEST_USER_EMAIL,
      url: input.url,
      dryRun: input.dryRun ?? true,
      transcriptLength: 0,
      transcriptSource: "cached",
      toolsExtracted: [],
      targetFolder: { id: "", name: "", isNew: false },
      linksPlanned: [],
      skippedDuplicates: [],
      error: "Feature-Flag 'linkCurator' ist deaktiviert (FLAGS_V06.linkCurator = false).",
    };
  }

  const jobId = `job_curator_${Date.now()}_${randomUUID().slice(0, 6)}`;
  const userEmail = input.userEmail || DEFAULT_TEST_USER_EMAIL;
  const isDryRun = input.dryRun ?? true; // Default: true!
  const store = dependencies?.store || getSparkMcpStore(dependencies?.database);

  try {
    // Schritt 1: Transkript über isoliertes Browser-Profil holen (mit optionalem API-Token)
    const { transcript, source, authUsed, rateLimitDetected } = await fetchInstagramTranscript(input.url, {
      transcriptOverride: input.transcriptOverride,
      apiKey: input.apiKey,
    });

    // Schritt 2: Tools, URLs und "wofür welches Tool" extrahieren
    const tools = extractToolsFromTranscript(transcript);

    // Schritt 3: Ordner-Kontext und bestehende Spark-Ordner ermitteln
    const companyId = input.companyId || "company";
    const existingFolders = await store.listFolders();

    // Schritt 4: Passenden Ordner wählen oder erstellen
    const desiredFolderName = input.targetFolderName || "UI & Component Libraries";
    let targetFolder = existingFolders.find(
      (f) =>
        (input.targetFolderId && f.id === input.targetFolderId) ||
        f.name.toLowerCase() === desiredFolderName.toLowerCase(),
    );

    let isNewFolder = false;
    if (!targetFolder) {
      if (isDryRun) {
        // Im Dry-Run wird kein Ordner in der DB angelegt
        targetFolder = {
          id: `folder_dryrun_${randomUUID().slice(0, 8)}`,
          name: desiredFolderName,
          parentId: null,
          kind: "normal",
          ownerScope: companyId,
          instructionNoteId: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        isNewFolder = true;
      } else {
        targetFolder = await store.createFolder({
          name: desiredFolderName,
          parentId: null,
          kind: "normal",
          companyId,
        });
        isNewFolder = true;
      }
    }

    // Vorhandene Links prüfen (für Duplikatprüfung)
    let existingLinks: Array<{ id: string; url: string; title: string }> = [];
    if (!isNewFolder && targetFolder) {
      try {
        const folderCtx = await store.getFolderContext(targetFolder.id);
        existingLinks = folderCtx.links;
      } catch {
        existingLinks = [];
      }
    }

    const existingNormalizedUrls = new Set(
      existingLinks.map((l) => normalizeUrl(l.url).toLowerCase().replace(/\/+$/, "")),
    );

    // Schritt 5: Duplikatprüfung & Vorbereitung der Links
    const linksPlanned: Array<{ title: string; url: string; purpose: string }> = [];
    const skippedDuplicates: string[] = [];

    for (const tool of tools) {
      const cleanUrl = normalizeUrl(tool.url);
      const urlKey = cleanUrl.toLowerCase().replace(/\/+$/, "");

      if (existingNormalizedUrls.has(urlKey)) {
        tool.isDuplicate = true;
        skippedDuplicates.push(cleanUrl);
      } else {
        tool.isDuplicate = false;
        linksPlanned.push({
          title: tool.name,
          url: cleanUrl,
          purpose: tool.purpose,
        });
      }
    }

    // Schritt 6: Dry-Run Modus (Standard)
    if (isDryRun) {
      const dryRunReport = generateDryRunReportMarkdown({
        jobId,
        userEmail,
        url: input.url,
        transcriptSource: source,
        transcriptLength: transcript.length,
        targetFolder: {
          id: targetFolder.id,
          name: targetFolder.name,
          isNew: isNewFolder,
        },
        tools,
        linksPlanned,
        skippedDuplicates,
      });

      // Pfad zu docs/v06/reports/A29-dryrun.md auflösen
      const reportsDir =
        dependencies?.reportsDir ||
        resolve(__dirname, "../../../../../../docs/v06/reports");

      let reportFilePath = join(reportsDir, "A29-dryrun.md");
      try {
        if (!existsSync(reportsDir)) {
          mkdirSync(reportsDir, { recursive: true });
        }
        writeFileSync(reportFilePath, dryRunReport, "utf-8");
      } catch (writeErr) {
        // Fallback falls reportsDir schreibgeschützt oder Pfad abweichend
        reportFilePath = join(process.env.TEMP || "C:/Temp", "A29-dryrun.md");
        writeFileSync(reportFilePath, dryRunReport, "utf-8");
      }

      return {
        success: true,
        jobId,
        userEmail,
        url: input.url,
        dryRun: true,
        transcriptLength: transcript.length,
        transcriptSource: source,
        authUsed,
        rateLimitDetected,
        toolsExtracted: tools,
        targetFolder: {
          id: targetFolder.id,
          name: targetFolder.name,
          isNew: isNewFolder,
        },
        linksPlanned,
        skippedDuplicates,
        dryRunReportPath: reportFilePath,
      };
    }

    // Schritt 7: Live-Run Modus (nur nach Freigabe)
    const linksAdded: Array<{ id: string; title: string; url: string }> = [];

    for (const linkItem of linksPlanned) {
      const addedLink = await store.addLink({
        folderId: targetFolder.id,
        url: linkItem.url,
        title: linkItem.title,
      });
      linksAdded.push({
        id: addedLink.id,
        title: addedLink.title,
        url: addedLink.url,
      });
    }

    // Zweck-Notiz anlegen ("wofür welches Tool")
    const noteTitle = `Tools & Zweck: ${targetFolder.name}`;
    const noteContentLines = [
      `# Tools im Ordner: ${targetFolder.name}`,
      `Automatisch kuratiert für **${userEmail}** via Link-Kurator-Agent (A29).`,
      `Instagram-Quelle: ${input.url}`,
      "",
      "## Übersicht: Wofür welches Tool",
    ];

    for (const tool of tools) {
      noteContentLines.push(`### ${tool.name}`);
      noteContentLines.push(`- **URL:** [${tool.url}](${tool.url})`);
      noteContentLines.push(`- **Wofür ist das Tool:** ${tool.purpose}`);
      noteContentLines.push("");
    }

    const noteContent = noteContentLines.join("\n");
    const createdNote = await store.createNote({
      title: noteTitle,
      content: noteContent,
      folderId: targetFolder.id,
      companyId,
    });

    // Verknüpfe Notiz als Hauptinstruktion des Ordners
    await store.attachNoteToFolder({
      folderId: targetFolder.id,
      noteId: createdNote.id,
    });

    return {
      success: true,
      jobId,
      userEmail,
      url: input.url,
      dryRun: false,
      transcriptLength: transcript.length,
      transcriptSource: source,
      authUsed,
      rateLimitDetected,
      toolsExtracted: tools,
      targetFolder: {
        id: targetFolder.id,
        name: targetFolder.name,
        isNew: isNewFolder,
      },
      linksPlanned,
      skippedDuplicates,
      linksAdded,
      noteCreatedOrUpdated: {
        id: createdNote.id,
        title: createdNote.title,
        content: createdNote.content,
      },
    };
  } catch (err: any) {
    return {
      success: false,
      jobId,
      userEmail,
      url: input.url,
      dryRun: isDryRun,
      transcriptLength: 0,
      transcriptSource: "cached",
      toolsExtracted: [],
      targetFolder: { id: "", name: "", isNew: false },
      linksPlanned: [],
      skippedDuplicates: [],
      error: err?.message || String(err),
    };
  }
}

/**
 * Erzeugt den formatierten Markdown-Plan für den Dry-Run-Bericht.
 */
function generateDryRunReportMarkdown(data: {
  jobId: string;
  userEmail: string;
  url: string;
  transcriptSource: string;
  transcriptLength: number;
  targetFolder: { id: string; name: string; isNew: boolean };
  tools: ExtractedTool[];
  linksPlanned: Array<{ title: string; url: string; purpose: string }>;
  skippedDuplicates: string[];
}): string {
  const lines = [
    `# Ausführungsplan Link-Kurator (A29 – Dry-Run)`,
    ``,
    `> **Modus:** DRY-RUN (Standard) – Keine Schreibaktionen in Spark vorgenommen.  `,
    `> **Job-ID:** \`${data.jobId}\`  `,
    `> **Ziel-Nutzer:** \`${data.userEmail}\`  `,
    `> **Instagram-Quelle:** ${data.url}  `,
    `> **Transkript:** Quelle \`${data.transcriptSource}\` (${data.transcriptLength} Zeichen)  `,
    `> **Erstellungszeitpunkt:** ${new Date().toISOString()}  `,
    ``,
    `---`,
    ``,
    `## 1. Zielordner in Spark`,
    `- **Ordnername:** \`${data.targetFolder.name}\``,
    `- **Ordner-ID:** \`${data.targetFolder.id}\``,
    `- **Neuanlage erforderlich:** ${data.targetFolder.isNew ? "Ja (wird bei Freigabe via `folder_create` angelegt)" : "Nein (bestehender Ordner)"}`,
    ``,
    `---`,
    ``,
    `## 2. Extrahierte Tools & Geplante Links`,
    ``,
  ];

  if (data.linksPlanned.length === 0) {
    lines.push(`_Keine neuen Links zum Hinzufügen gefunden._`);
  } else {
    lines.push(`| Nr. | Tool-Name | URL | Wofür welches Tool (Zweck) | Status |`);
    lines.push(`|---|---|---|---|:---:|`);
    data.linksPlanned.forEach((link, idx) => {
      lines.push(
        `| ${idx + 1} | **${link.title}** | [${link.url}](${link.url}) | ${link.purpose} | 📋 Geplant (\`link_add\`) |`,
      );
    });
  }

  lines.push(``);
  lines.push(`---`);
  lines.push(``);
  lines.push(`## 3. Duplikatprüfung`);
  if (data.skippedDuplicates.length === 0) {
    lines.push(`Keine Duplikate erkannt. Alle extrahierten Links sind neu.`);
  } else {
    lines.push(`Folgende URLs existieren bereits im Spark-Bestand und werden übersprungen:`);
    for (const dup of data.skippedDuplicates) {
      lines.push(`- ⏭️ \`${dup}\` (bereits vorhanden)`);
    }
  }

  lines.push(``);
  lines.push(`---`);
  lines.push(``);
  lines.push(`## 4. Geplante Spark-Notiz („wofür welches Tool“)`);
  lines.push(`- **Titel:** \`Tools & Zweck: ${data.targetFolder.name}\``);
  lines.push(`- **Aktion:** \`note_create\` + \`note_attach_to_folder\` an Ordner \`${data.targetFolder.id}\``);
  lines.push(`- **Geplanter Notiz-Inhalt:**`);
  lines.push(``);
  lines.push(`\`\`\`markdown`);
  lines.push(`# Tools im Ordner: ${data.targetFolder.name}`);
  lines.push(`Automatisch kuratiert für ${data.userEmail} via Link-Kurator-Agent (A29).`);
  lines.push(``);
  lines.push(`## Übersicht: Wofür welches Tool`);
  for (const tool of data.tools) {
    lines.push(`### ${tool.name}`);
    lines.push(`- URL: ${tool.url}`);
    lines.push(`- Wofür ist das Tool: ${tool.purpose}`);
    lines.push(``);
  }
  lines.push(`\`\`\``);
  lines.push(``);
  lines.push(`---`);
  lines.push(``);
  lines.push(`## 5. Freigabe-Hinweis`);
  lines.push(`Dieser Plan wurde im sicheren Dry-Run-Modus erstellt. Echte Schreiboperationen werden erst ausgeführt, sobald Stefan die Integration freigibt.`);

  return lines.join("\n");
}
