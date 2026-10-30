/**
 * Safe File Applicator for Approved Proposals (Lane 6)
 *
 * Implements strict vault integrity rules:
 * 1. Automatic backup: `<file>.bak-helium-<YYYYMMDD>` before touching any file.
 * 2. NEVER delete notes! Move / Merge only as copy + link.
 * 3. Log to log.md via appendLogLine.
 * 4. Git commit via gitCommit.
 * 5. MCP audit log via 0091_mcp_audit_log.
 */

import * as path from "node:path";
import { existsSync } from "node:fs";
import { readFile, writeFile, mkdir, copyFile } from "node:fs/promises";
import {
  resolveBrainRoot,
  brainRootFor,
  notePath,
  gitCommit,
  appendLogLine,
} from "../../store";
import { recordAuditLog } from "./audit";
import { updateProposalStatus } from "./store";
import type {
  Proposal,
  ApplyResult,
  NewNotePayload,
  AddLinkPayload,
  MovePayload,
  MergePayload,
  TagPayload,
  SummaryPayload,
} from "./types";

function getTodayStamp(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

async function ensureBackup(absolutePath: string): Promise<string | null> {
  if (!existsSync(absolutePath)) return null;
  const backupPath = `${absolutePath}.bak-helium-${getTodayStamp()}`;
  try {
    await copyFile(absolutePath, backupPath);
    return backupPath;
  } catch (err) {
    throw new Error(`Konnte kein Backup erstellen fuer ${absolutePath}: ${err}`);
  }
}

/**
 * Applies an approved proposal to the Vault with full backup and audit logging.
 */
export async function applyProposal(proposal: Proposal): Promise<ApplyResult> {
  const rootRes = await resolveBrainRoot(brainRootFor(null));
  if (!rootRes.available) {
    throw new Error(`Brain nicht verfuegbar: ${rootRes.reason}`);
  }
  const root = rootRes.root;

  const affectedFiles: string[] = [];
  const backupFiles: string[] = [];
  const payload = proposal.payload as Record<string, unknown>;

  try {
    switch (proposal.kind) {
      case "new_note": {
        const p = payload as unknown as NewNotePayload;
        const relPath = p.path.endsWith(".md") ? p.path : `${p.path}.md`;
        const absPath = notePath(root, relPath);

        const dir = path.dirname(absPath);
        if (!existsSync(dir)) {
          await mkdir(dir, { recursive: true });
        }

        if (existsSync(absPath)) {
          const bak = await ensureBackup(absPath);
          if (bak) backupFiles.push(bak);
        }

        const tagsBlock = p.tags && p.tags.length > 0
          ? `---\ntags: [${p.tags.map((t) => `"${t.replace(/^#/, "")}"`).join(", ")}]\n---\n\n`
          : "";
        const content = `${tagsBlock}# ${p.title}\n\n${p.content}\n`;

        await writeFile(absPath, content, "utf8");
        affectedFiles.push(relPath);
        break;
      }

      case "add_link": {
        const p = payload as unknown as AddLinkPayload;
        const relPath = p.sourcePath;
        const absPath = notePath(root, relPath);

        if (!existsSync(absPath)) {
          throw new Error(`Quelldatei nicht gefunden: ${relPath}`);
        }

        const bak = await ensureBackup(absPath);
        if (bak) backupFiles.push(bak);

        const oldContent = await readFile(absPath, "utf8");
        const linkText = p.linkText || p.targetNote;
        const wikilink = `[[${p.targetNote}|${linkText}]]`;

        let newContent = oldContent;
        if (p.contextAnchor && oldContent.includes(p.contextAnchor)) {
          newContent = oldContent.replace(p.contextAnchor, `${p.contextAnchor} ${wikilink}`);
        } else if (p.position === "bottom" || p.position === "related_section") {
          if (newContent.includes("## Siehe auch") || newContent.includes("## Verwandt")) {
            newContent = newContent.replace(/(## (?:Siehe auch|Verwandt)[\s\S]*)/, `$1\n- ${wikilink}`);
          } else {
            newContent = `${newContent.trim()}\n\n## Siehe auch\n- ${wikilink}\n`;
          }
        } else {
          newContent = `${newContent.trim()}\n- Verwandt: ${wikilink}\n`;
        }

        await writeFile(absPath, newContent, "utf8");
        affectedFiles.push(relPath);
        break;
      }

      case "move": {
        const p = payload as unknown as MovePayload;
        const srcRel = p.sourcePath;
        const dstRel = p.destinationPath.endsWith(".md") ? p.destinationPath : `${p.destinationPath}.md`;
        const srcAbs = notePath(root, srcRel);
        const dstAbs = notePath(root, dstRel);

        if (!existsSync(srcAbs)) {
          throw new Error(`Quelldatei nicht gefunden: ${srcRel}`);
        }

        const srcBak = await ensureBackup(srcAbs);
        if (srcBak) backupFiles.push(srcBak);

        if (existsSync(dstAbs)) {
          const dstBak = await ensureBackup(dstAbs);
          if (dstBak) backupFiles.push(dstBak);
        } else {
          const dstDir = path.dirname(dstAbs);
          if (!existsSync(dstDir)) {
            await mkdir(dstDir, { recursive: true });
          }
        }

        const originalContent = await readFile(srcAbs, "utf8");

        // Write copy to destination
        await writeFile(dstAbs, originalContent, "utf8");

        // HARTE REGEL: NIE Notizen loeschen! Quellnotiz erhaelt Weiterleitungshinweis
        const forwardingNote = `> [!NOTE] Verschoben\n> Diese Notiz wurde verschoben nach [[${dstRel}]].\n\n---\n\n${originalContent}`;
        await writeFile(srcAbs, forwardingNote, "utf8");

        affectedFiles.push(srcRel, dstRel);
        break;
      }

      case "merge": {
        const p = payload as unknown as MergePayload;
        const srcRel = p.sourcePath;
        const dstRel = p.targetPath;
        const srcAbs = notePath(root, srcRel);
        const dstAbs = notePath(root, dstRel);

        if (!existsSync(srcAbs)) {
          throw new Error(`Quelldatei nicht gefunden: ${srcRel}`);
        }

        const srcBak = await ensureBackup(srcAbs);
        if (srcBak) backupFiles.push(srcBak);

        let targetContent = "";
        if (existsSync(dstAbs)) {
          const dstBak = await ensureBackup(dstAbs);
          if (dstBak) backupFiles.push(dstBak);
          targetContent = await readFile(dstAbs, "utf8");
        } else {
          const dstDir = path.dirname(dstAbs);
          if (!existsSync(dstDir)) await mkdir(dstDir, { recursive: true });
        }

        const sourceContent = await readFile(srcAbs, "utf8");
        const merged = p.mergedContent || `${targetContent.trim()}\n\n---\n### Zusammengefuehrter Inhalt aus [[${srcRel}]]\n\n${sourceContent}`;

        await writeFile(dstAbs, merged, "utf8");

        // HARTE REGEL: NIE loeschen! Quelle erhaelt Merge-Hinweis
        const redirectContent = `> [!NOTE] Zusammengefuehrt\n> Diese Notiz wurde zusammengefuehrt in [[${dstRel}]].\n\n---\n\n${sourceContent}`;
        await writeFile(srcAbs, redirectContent, "utf8");

        affectedFiles.push(srcRel, dstRel);
        break;
      }

      case "tag": {
        const p = payload as unknown as TagPayload;
        const relPath = p.path;
        const absPath = notePath(root, relPath);

        if (!existsSync(absPath)) {
          throw new Error(`Datei nicht gefunden: ${relPath}`);
        }

        const bak = await ensureBackup(absPath);
        if (bak) backupFiles.push(bak);

        const oldContent = await readFile(absPath, "utf8");
        const tagList = p.tags.map((t) => t.replace(/^#/, ""));
        let newContent = oldContent;

        if (p.location === "frontmatter" && oldContent.startsWith("---")) {
          const parts = oldContent.split("---");
          if (parts.length >= 3) {
            const fm = parts[1];
            const tagsLine = `tags: [${tagList.map((t) => `"${t}"`).join(", ")}]\n`;
            newContent = `---${fm.trimEnd()}\n${tagsLine}---${parts.slice(2).join("---")}`;
          } else {
            newContent = `---\ntags: [${tagList.map((t) => `"${t}"`).join(", ")}]\n---\n\n${oldContent}`;
          }
        } else {
          const tagBadges = tagList.map((t) => `#${t}`).join(" ");
          newContent = `${oldContent.trim()}\n\n${tagBadges}\n`;
        }

        await writeFile(absPath, newContent, "utf8");
        affectedFiles.push(relPath);
        break;
      }

      case "summary": {
        const p = payload as unknown as SummaryPayload;
        const relPath = p.targetPath.endsWith(".md") ? p.targetPath : `${p.targetPath}.md`;
        const absPath = notePath(root, relPath);

        const dir = path.dirname(absPath);
        if (!existsSync(dir)) {
          await mkdir(dir, { recursive: true });
        }

        if (existsSync(absPath)) {
          const bak = await ensureBackup(absPath);
          if (bak) backupFiles.push(bak);
        }

        const sourcesList = p.sourceNotes.map((s) => `- [[${s}]]`).join("\n");
        const content = `# Zusammenfassung: ${p.topic}\n\n${p.summaryContent}\n\n## Quellen\n${sourcesList}\n`;

        await writeFile(absPath, content, "utf8");
        affectedFiles.push(relPath);
        break;
      }

      default:
        throw new Error(`Unbekannter Proposal-Typ: ${(proposal as any).kind}`);
    }

    // Append to log.md
    await appendLogLine(
      root,
      "spark-evolve",
      "curate",
      affectedFiles,
      `Apply proposal #${proposal.id} (${proposal.kind}): ${proposal.rationale.slice(0, 80)}`,
    ).catch(() => {});

    // Commit to git if git repo is present
    const commitFiles = [...affectedFiles, "log.md"];
    const commitMsg = `[spark-evolve] Apply proposal #${proposal.id} (${proposal.kind})`;
    const commitHash = await gitCommit(root, commitFiles, commitMsg).catch(() => null);

    // Update proposal status in DB / memory
    await updateProposalStatus(proposal.id, "applied", {
      appliedAt: new Date().toISOString(),
      backupPath: backupFiles.join("; "),
    });

    // Record in MCP Audit Log
    await recordAuditLog({
      toolName: "spark_proposal_apply",
      agentName: "stefan",
      paramsSummary: `Apply #${proposal.id} (${proposal.kind}) -> ${affectedFiles.join(", ")}`,
      status: "success",
      statusDetail: `Backup: ${backupFiles.join(", ")} | Commit: ${commitHash ?? "none"}`,
    });

    return {
      success: true,
      proposalId: proposal.id,
      kind: proposal.kind,
      affectedFiles,
      backupFiles,
      commitHash,
      timestamp: new Date().toISOString(),
    };
  } catch (err: any) {
    // Record error in audit log
    await recordAuditLog({
      toolName: "spark_proposal_apply",
      agentName: "stefan",
      paramsSummary: `Failed to apply #${proposal.id} (${proposal.kind})`,
      status: "error",
      statusDetail: String(err?.message || err),
    });

    return {
      success: false,
      proposalId: proposal.id,
      kind: proposal.kind,
      affectedFiles,
      backupFiles,
      error: String(err?.message || err),
      timestamp: new Date().toISOString(),
    };
  }
}
