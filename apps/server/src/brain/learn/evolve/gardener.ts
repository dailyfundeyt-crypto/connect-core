/**
 * Autonomous and On-Demand Gardener Engine (Lane 6)
 *
 * Implements Vault Maintenance & Self-Improvement Jobs:
 * 1. Missing Wikilinks (semantic embedding similarity & title mentions)
 * 2. Duplicates (title & content similarity)
 * 3. Orphan Notes (0 incoming & 0 outgoing links)
 * 4. Folder Structure Suggestions (reorganizing misplaced notes)
 * 5. Summary Notes (clustering & synthesizing dense topics)
 */

import * as path from "node:path";
import { readFile } from "node:fs/promises";
import {
  listAllMarkdown,
  notePath,
  resolveBrainRoot,
  brainRootFor,
} from "../../store";
import { computeProposalDiff } from "./diff";
import { saveProposal, getLearningStats } from "./store";
import { notifyStefanOfProposal } from "./ask-human";
import { recordAuditLog } from "./audit";
import type {
  Proposal,
  GardenerJobKind,
  GardenerOptions,
  GardenerResult,
  AddLinkPayload,
  MergePayload,
  MovePayload,
  SummaryPayload,
} from "./types";

interface NoteSummary {
  relPath: string;
  absPath: string;
  name: string;
  title: string;
  content: string;
  links: string[];
  tags: string[];
}

function extractWikilinks(text: string): string[] {
  const matches = text.matchAll(/\[\[(.*?)\]\]/g);
  const links: string[] = [];
  for (const m of matches) {
    const raw = m[1].split("|")[0].trim();
    if (raw) links.push(raw.toLowerCase());
  }
  return links;
}

function extractTags(text: string): string[] {
  const matches = text.matchAll(/#([a-zA-Z0-9_\-\/]+)/g);
  const tags: string[] = [];
  for (const m of matches) {
    tags.push(m[1].toLowerCase());
  }
  return tags;
}

function extractTitle(content: string, fallbackName: string): string {
  const m = content.match(/^#\s+(.+)$/m);
  if (m && m[1]) return m[1].trim();
  return fallbackName.replace(/\.md$/i, "");
}

async function loadVaultNotes(root: string, folderScope?: string): Promise<NoteSummary[]> {
  const files = await listAllMarkdown(root);
  const filtered = folderScope
    ? files.filter((f) => f.path.startsWith(folderScope))
    : files;

  const notes: NoteSummary[] = [];
  // Sample up to 300 notes for memory safety and fast gardener performance
  for (const file of filtered.slice(0, 300)) {
    const abs = notePath(root, file.path);
    try {
      const content = await readFile(abs, "utf8");
      const name = path.basename(file.path);
      notes.push({
        relPath: file.path,
        absPath: abs,
        name,
        title: extractTitle(content, name),
        content,
        links: extractWikilinks(content),
        tags: extractTags(content),
      });
    } catch {
      // Ignore unreadable files
    }
  }
  return notes;
}

/**
 * Gardener Engine Class
 */
export class GardenerEngine {
  /**
   * 1. Detect missing wikilinks between notes
   */
  static async detectMissingWikilinks(
    root: string,
    notes: NoteSummary[],
    options?: GardenerOptions,
  ): Promise<Proposal[]> {
    const stats = await getLearningStats();
    const minSim = options?.minSimilarity ?? stats.currentThresholds.minLinkSimilarity;
    const maxProposals = options?.maxProposals ?? 5;
    const proposals: Proposal[] = [];

    for (let i = 0; i < notes.length && proposals.length < maxProposals; i++) {
      const source = notes[i];
      if (source.content.length < 50) continue;

      for (let j = 0; j < notes.length && proposals.length < maxProposals; j++) {
        if (i === j) continue;
        const target = notes[j];
        if (target.title.length < 4) continue;

        const targetTitleLower = target.title.toLowerCase();
        // Check if target is already linked in source
        if (source.links.includes(targetTitleLower) || source.links.includes(target.name.toLowerCase())) {
          continue;
        }

        // Check if source text mentions target's title verbatim or with high confidence
        const sourceLower = source.content.toLowerCase();
        const mentionsTitle = sourceLower.includes(targetTitleLower);

        // Word overlap heuristic for semantic relatedness
        const sourceWords = new Set(sourceLower.split(/\W+/).filter((w) => w.length > 4));
        const targetWords = targetLowerWords(target.content);
        let intersection = 0;
        for (const w of targetWords) {
          if (sourceWords.has(w)) intersection++;
        }
        const jaccard = targetWords.size > 0 ? intersection / targetWords.size : 0;

        if (mentionsTitle || jaccard >= minSim) {
          const id = `prop-link-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
          const payload: AddLinkPayload = {
            sourcePath: source.relPath,
            targetNote: target.title,
            contextAnchor: mentionsTitle ? target.title : undefined,
            position: mentionsTitle ? "inline" : "bottom",
            linkText: target.title,
          };
          const diff = computeProposalDiff({ kind: "add_link", payload }, source.content);
          const rationale = mentionsTitle
            ? `Fehlender Wikilink: Notiz '${source.relPath}' erwaehnt den Begriff '${target.title}', verlinkt ihn aber noch nicht.`
            : `Semantische Naehe (${(jaccard * 100).toFixed(0)}% Wortueberschneidung): '${source.relPath}' und '${target.relPath}' behandeln aehnliche Themen.`;

          const prop: Proposal = {
            id,
            kind: "add_link",
            payload: payload as any,
            diff,
            rationale,
            sources: [source.relPath, target.relPath],
            status: "pending",
            createdAt: new Date().toISOString(),
          };
          proposals.push(prop);
        }
      }
    }

    return proposals;
  }

  /**
   * 2. Detect duplicate or near-duplicate notes
   */
  static async detectDuplicates(
    root: string,
    notes: NoteSummary[],
    options?: GardenerOptions,
  ): Promise<Proposal[]> {
    const stats = await getLearningStats();
    const minSim = options?.minSimilarity ?? stats.currentThresholds.minDuplicateSimilarity;
    const maxProposals = options?.maxProposals ?? 5;
    const proposals: Proposal[] = [];

    for (let i = 0; i < notes.length && proposals.length < maxProposals; i++) {
      for (let j = i + 1; j < notes.length && proposals.length < maxProposals; j++) {
        const a = notes[i];
        const b = notes[j];

        const titleA = a.title.toLowerCase();
        const titleB = b.title.toLowerCase();

        const isExactTitle = titleA === titleB;
        const isNumberedVariant =
          titleA.replace(/[-_\s]\d+$/, "") === titleB.replace(/[-_\s]\d+$/, "");

        const wordsA = new Set(a.content.toLowerCase().split(/\W+/).filter((w) => w.length > 3));
        const wordsB = new Set(b.content.toLowerCase().split(/\W+/).filter((w) => w.length > 3));
        let match = 0;
        for (const w of wordsA) {
          if (wordsB.has(w)) match++;
        }
        const sim = Math.max(wordsA.size, wordsB.size) > 0 ? match / Math.max(wordsA.size, wordsB.size) : 0;

        if (isExactTitle || isNumberedVariant || sim >= minSim) {
          const id = `prop-dup-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
          const payload: MergePayload = {
            sourcePath: b.relPath,
            targetPath: a.relPath,
            keepSourceAsLink: true,
          };
          const diff = computeProposalDiff({ kind: "merge", payload }, a.content);
          const rationale = `Duplikat erkannt: '${a.relPath}' und '${b.relPath}' haben ${(sim * 100).toFixed(0)}% thematische Uebereinstimmung. Zusammenfuehren und Quelle als Weiterleitung erhalten.`;

          proposals.push({
            id,
            kind: "merge",
            payload: payload as any,
            diff,
            rationale,
            sources: [a.relPath, b.relPath],
            status: "pending",
            createdAt: new Date().toISOString(),
          });
        }
      }
    }

    return proposals;
  }

  /**
   * 3. Detect orphan notes (no incoming and no outgoing links)
   */
  static async detectOrphans(
    root: string,
    notes: NoteSummary[],
    options?: GardenerOptions,
  ): Promise<Proposal[]> {
    const maxProposals = options?.maxProposals ?? 5;
    const proposals: Proposal[] = [];

    // Map of all linked titles
    const allOutgoing = new Set<string>();
    for (const n of notes) {
      for (const l of n.links) allOutgoing.add(l);
    }

    const orphans = notes.filter((n) => {
      // Exclude templates, journals, or daily notes
      if (n.relPath.includes("Daily") || n.relPath.includes("Templates") || n.name.startsWith("_")) {
        return false;
      }
      const hasOutbound = n.links.length > 0;
      const hasInbound = allOutgoing.has(n.title.toLowerCase()) || allOutgoing.has(n.name.toLowerCase());
      return !hasOutbound && !hasInbound;
    });

    for (const orphan of orphans.slice(0, maxProposals)) {
      const id = `prop-orph-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const payload: AddLinkPayload = {
        sourcePath: "index.md",
        targetNote: orphan.title,
        position: "related_section",
        linkText: orphan.title,
      };
      const diff = computeProposalDiff({ kind: "add_link", payload }, "");
      const rationale = `Verwaiste Notiz gefunden: '${orphan.relPath}' besitzt weder eingehende noch ausgehende Wikilinks. Einbindung in index.md vorgeschlagen.`;

      proposals.push({
        id,
        kind: "add_link",
        payload: payload as any,
        diff,
        rationale,
        sources: [orphan.relPath],
        status: "pending",
        createdAt: new Date().toISOString(),
      });
    }

    return proposals;
  }

  /**
   * 4. Suggest folder organization for root notes
   */
  static async suggestFolderOrganization(
    root: string,
    notes: NoteSummary[],
    options?: GardenerOptions,
  ): Promise<Proposal[]> {
    const maxProposals = options?.maxProposals ?? 5;
    const proposals: Proposal[] = [];

    // Identify root-level notes (not in a folder)
    const rootNotes = notes.filter((n) => !n.relPath.includes("/") && !n.name.startsWith("index"));

    for (const note of rootNotes.slice(0, maxProposals)) {
      let suggestedFolder = "Allgemein";
      if (note.tags.length > 0) {
        suggestedFolder = note.tags[0].charAt(0).toUpperCase() + note.tags[0].slice(1);
      } else if (note.content.toLowerCase().includes("projekt") || note.content.toLowerCase().includes("task")) {
        suggestedFolder = "Projects";
      } else if (note.content.toLowerCase().includes("buch") || note.content.toLowerCase().includes("wissen")) {
        suggestedFolder = "Wissen";
      }

      const id = `prop-mov-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const destinationPath = `${suggestedFolder}/${note.name}`;
      const payload: MovePayload = {
        sourcePath: note.relPath,
        destinationPath,
        keepForwardingNote: true,
      };
      const diff = computeProposalDiff({ kind: "move", payload }, note.content);
      const rationale = `Struktur-Optimierung: Notiz '${note.relPath}' liegt auf Root-Ebene. Vorschlag: Verschieben nach '${destinationPath}' (mit Weiterleitung).`;

      proposals.push({
        id,
        kind: "move",
        payload: payload as any,
        diff,
        rationale,
        sources: [note.relPath],
        status: "pending",
        createdAt: new Date().toISOString(),
      });
    }

    return proposals;
  }

  /**
   * 5. Generate summary notes for dense folders
   */
  static async generateSummaryNotes(
    root: string,
    notes: NoteSummary[],
    options?: GardenerOptions,
  ): Promise<Proposal[]> {
    const maxProposals = options?.maxProposals ?? 3;
    const proposals: Proposal[] = [];

    // Group notes by top-level folder
    const folderGroups = new Map<string, NoteSummary[]>();
    for (const n of notes) {
      if (n.relPath.includes("/")) {
        const folder = n.relPath.split("/")[0];
        if (!folderGroups.has(folder)) folderGroups.set(folder, []);
        folderGroups.get(folder)!.push(n);
      }
    }

    for (const [folder, group] of folderGroups.entries()) {
      if (proposals.length >= maxProposals) break;
      if (group.length >= 4 && !group.some((n) => n.name.toLowerCase().startsWith("uebersicht") || n.name.toLowerCase().startsWith("summary"))) {
        const id = `prop-sum-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        const topic = `Themenuebersicht: ${folder}`;
        const sourceNotes = group.map((g) => g.relPath);
        const bulletPoints = group.slice(0, 10).map((g) => `- **[[${g.relPath}|${g.title}]]**: ${g.content.slice(0, 100).replace(/[\r\n]+/g, " ")}...`).join("\n");
        const summaryContent = `Diese Uebersicht fasst ${group.length} Notizen im Ordner \`${folder}\` zusammen.\n\n### Kernnotizen\n${bulletPoints}`;

        const payload: SummaryPayload = {
          targetPath: `${folder}/Uebersicht-${folder}.md`,
          topic,
          sourceNotes,
          summaryContent,
        };
        const diff = computeProposalDiff({ kind: "summary", payload }, "");
        const rationale = `Zusammenfassungs-Notiz: Ordner '${folder}' enthaelt ${group.length} Notizen ohne zentrale Uebersicht. Erstellung einer Uebersichtsnotiz empfohlen.`;

        proposals.push({
          id,
          kind: "summary",
          payload: payload as any,
          diff,
          rationale,
          sources: sourceNotes,
          status: "pending",
          createdAt: new Date().toISOString(),
        });
      }
    }

    return proposals;
  }

  /**
   * Runs the requested gardener job and persists created proposals
   */
  static async runJob(
    kind: GardenerJobKind,
    options?: GardenerOptions,
  ): Promise<GardenerResult> {
    const start = Date.now();
    const rootRes = await resolveBrainRoot(brainRootFor(null));
    if (!rootRes.available) {
      throw new Error(`Brain nicht verfuegbar: ${rootRes.reason}`);
    }
    const root = rootRes.root;

    const notes = await loadVaultNotes(root, options?.folderScope);
    let proposals: Proposal[] = [];

    switch (kind) {
      case "missing_links":
        proposals = await this.detectMissingWikilinks(root, notes, options);
        break;
      case "duplicates":
        proposals = await this.detectDuplicates(root, notes, options);
        break;
      case "orphans":
        proposals = await this.detectOrphans(root, notes, options);
        break;
      case "folders":
        proposals = await this.suggestFolderOrganization(root, notes, options);
        break;
      case "summaries":
        proposals = await this.generateSummaryNotes(root, notes, options);
        break;
      case "all": {
        const links = await this.detectMissingWikilinks(root, notes, { ...options, maxProposals: 2 });
        const dups = await this.detectDuplicates(root, notes, { ...options, maxProposals: 2 });
        const orphs = await this.detectOrphans(root, notes, { ...options, maxProposals: 2 });
        const folds = await this.suggestFolderOrganization(root, notes, { ...options, maxProposals: 2 });
        const sums = await this.generateSummaryNotes(root, notes, { ...options, maxProposals: 1 });
        proposals = [...links, ...dups, ...orphs, ...folds, ...sums];
        break;
      }
    }

    // Persist proposals and notify Stefan via Braucht-dich.md
    if (!options?.dryRun) {
      for (const p of proposals) {
        await saveProposal(p);
        await notifyStefanOfProposal(p);
      }
    }

    // Record in MCP Audit Log
    await recordAuditLog({
      toolName: `spark_gardener_${kind}`,
      agentName: "spark_gardener",
      paramsSummary: `Ran job '${kind}' on ${notes.length} notes -> ${proposals.length} proposals created`,
      status: "success",
      statusDetail: `Duration: ${Date.now() - start}ms`,
    });

    return {
      job: kind,
      timestamp: new Date().toISOString(),
      proposalsCreated: proposals.length,
      proposals,
      durationMs: Date.now() - start,
      details: {
        totalNotesScanned: notes.length,
        folderScope: options?.folderScope ?? "all",
      },
    };
  }
}

function targetLowerWords(content: string): Set<string> {
  return new Set(
    content
      .toLowerCase()
      .split(/\W+/)
      .filter((w) => w.length > 4 && !STOPWORDS.has(w)),
  );
}

const STOPWORDS = new Set([
  "dieser", "diese", "dieses", "nicht", "haben", "einer", "eines",
  "ueber", "unter", "durch", "wurde", "werden", "kann", "kannst",
  "dass", "wenn", "aber", "fuer", "auch", "eine", "oder", "nach",
]);
