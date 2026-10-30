/**
 * Unified Diff Generator for Spark-Learn Proposals (Lane 6)
 */

import type {
  Proposal,
  NewNotePayload,
  AddLinkPayload,
  MovePayload,
  MergePayload,
  TagPayload,
  SummaryPayload,
} from "./types";

/**
 * Creates a standard unified diff string between oldText and newText.
 */
export function createUnifiedDiff(
  oldPath: string,
  newPath: string,
  oldText: string,
  newText: string,
): string {
  const oldLines = oldText === "" ? [] : oldText.split(/\r?\n/);
  const newLines = newText === "" ? [] : newText.split(/\r?\n/);

  const header = [
    `--- a/${oldPath}`,
    `+++ b/${newPath}`,
    `@@ -1,${oldLines.length || 1} +1,${newLines.length || 1} @@`,
  ];

  // If old is empty, everything is addition
  if (oldLines.length === 0) {
    const diffLines = newLines.map((l) => `+ ${l}`);
    return [...header, ...diffLines].join("\n");
  }

  // Simple Myers/LCS diff or line comparison
  const diffOutput: string[] = [...header];
  let i = 0;
  let j = 0;

  while (i < oldLines.length || j < newLines.length) {
    if (i < oldLines.length && j < newLines.length && oldLines[i] === newLines[j]) {
      diffOutput.push(`  ${oldLines[i]}`);
      i++;
      j++;
    } else {
      // Lookahead to match next common line
      let matchOld = -1;
      let matchNew = -1;

      for (let look = 1; look < 15; look++) {
        if (i + look < oldLines.length && oldLines[i + look] === newLines[j]) {
          matchOld = i + look;
          break;
        }
        if (j + look < newLines.length && oldLines[i] === newLines[j + look]) {
          matchNew = j + look;
          break;
        }
      }

      if (matchOld !== -1) {
        while (i < matchOld) {
          diffOutput.push(`- ${oldLines[i]}`);
          i++;
        }
      } else if (matchNew !== -1) {
        while (j < matchNew) {
          diffOutput.push(`+ ${newLines[j]}`);
          j++;
        }
      } else {
        if (i < oldLines.length) {
          diffOutput.push(`- ${oldLines[i]}`);
          i++;
        }
        if (j < newLines.length) {
          diffOutput.push(`+ ${newLines[j]}`);
          j++;
        }
      }
    }
  }

  return diffOutput.join("\n");
}

/**
 * Computes or formats the diff for a given proposal.
 */
export function computeProposalDiff(
  proposal: Pick<Proposal, "kind" | "payload">,
  existingFileContent?: string,
): string {
  const payload = proposal.payload as Record<string, unknown>;

  switch (proposal.kind) {
    case "new_note": {
      const p = payload as unknown as NewNotePayload;
      const path = p.path || "neue-notiz.md";
      const tagsBlock = p.tags && p.tags.length > 0 ? `---\ntags: [${p.tags.join(", ")}]\n---\n\n` : "";
      const content = `${tagsBlock}# ${p.title || "Titel"}\n\n${p.content || ""}`;
      return createUnifiedDiff("/dev/null", path, "", content);
    }

    case "add_link": {
      const p = payload as unknown as AddLinkPayload;
      const oldText = existingFileContent ?? "";
      const linkText = p.linkText || p.targetNote;
      const wikilink = `[[${p.targetNote}|${linkText}]]`;

      let newText = oldText;
      if (p.contextAnchor && oldText.includes(p.contextAnchor)) {
        newText = oldText.replace(p.contextAnchor, `${p.contextAnchor} ${wikilink}`);
      } else if (p.position === "bottom" || p.position === "related_section") {
        if (newText.includes("## Siehe auch") || newText.includes("## Verwandt")) {
          newText = newText.replace(/(## (?:Siehe auch|Verwandt)[\s\S]*)/, `$1\n- ${wikilink}`);
        } else {
          newText = `${newText.trim()}\n\n## Siehe auch\n- ${wikilink}\n`;
        }
      } else {
        // inline default
        newText = `${newText.trim()}\n- Verwandt: ${wikilink}\n`;
      }

      return createUnifiedDiff(p.sourcePath, p.sourcePath, oldText, newText);
    }

    case "move": {
      const p = payload as unknown as MovePayload;
      const oldText = existingFileContent ?? "";
      const redirectContent = `> [!NOTE] Verschoben\n> Diese Notiz wurde verschoben nach [[${p.destinationPath}]].\n\n${oldText}`;
      const diff1 = createUnifiedDiff(p.sourcePath, `${p.sourcePath} (Weiterleitung)`, oldText, redirectContent);
      const diff2 = createUnifiedDiff("/dev/null", p.destinationPath, "", oldText);
      return `${diff1}\n\n${diff2}`;
    }

    case "merge": {
      const p = payload as unknown as MergePayload;
      const oldText = existingFileContent ?? "";
      const redirectContent = `> [!NOTE] Zusammengeführt\n> Diese Notiz wurde zusammengeführt in [[${p.targetPath}]].\n`;
      const mergedContent = p.mergedContent || `${oldText}\n\n<!-- Zusätzlicher Inhalt aus Merge -->`;
      const diff1 = createUnifiedDiff(p.sourcePath, `${p.sourcePath} (Merge-Hinweis)`, oldText, redirectContent);
      const diff2 = createUnifiedDiff(p.targetPath, p.targetPath, "", mergedContent);
      return `${diff1}\n\n${diff2}`;
    }

    case "tag": {
      const p = payload as unknown as TagPayload;
      const oldText = existingFileContent ?? "";
      const tagStr = p.tags.map((t) => (t.startsWith("#") ? t : `#${t}`)).join(" ");

      let newText = oldText;
      if (p.location === "frontmatter" && oldText.startsWith("---")) {
        const parts = oldText.split("---");
        if (parts.length >= 3) {
          const fm = parts[1];
          const newFm = `${fm.trimEnd()}\ntags: [${p.tags.map((t) => `"${t.replace(/^#/, "")}"`).join(", ")}]\n`;
          newText = `---${newFm}---${parts.slice(2).join("---")}`;
        } else {
          newText = `${tagStr}\n\n${oldText}`;
        }
      } else {
        newText = `${oldText.trim()}\n\n${tagStr}\n`;
      }

      return createUnifiedDiff(p.path, p.path, oldText, newText);
    }

    case "summary": {
      const p = payload as unknown as SummaryPayload;
      const content = `# Zusammenfassung: ${p.topic}\n\n${p.summaryContent}\n\n## Quellen\n${p.sourceNotes.map((s) => `- [[${s}]]`).join("\n")}\n`;
      return createUnifiedDiff("/dev/null", p.targetPath, "", content);
    }

    default:
      return "";
  }
}
