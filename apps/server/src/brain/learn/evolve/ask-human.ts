/**
 * Integration with brain_ask_human (Braucht-dich.md)
 */

import * as path from "node:path";
import { existsSync } from "node:fs";
import { readFile, writeFile, appendFile } from "node:fs/promises";
import { berlinStamp, coreOf, resolveBrainRoot, brainRootFor } from "../../store";
import type { Proposal } from "./types";

const NEEDS_FILE = "Braucht-dich.md";

function needsTemplate() {
  return [
    "# Braucht dich",
    "",
    "> Von Agenten und Routinen fuer Stefan gesammelt. Nur Stefan hakt ab.",
    "",
    "## Offen",
    "",
  ].join("\n");
}

/**
 * Notifies Stefan via Braucht-dich.md about a proposal that requires his approval.
 */
export async function notifyStefanOfProposal(
  proposal: Proposal,
  corePath?: string,
): Promise<boolean> {
  let core = corePath;
  if (!core) {
    const rootRes = await resolveBrainRoot(brainRootFor(null));
    if (!rootRes.available) return false;
    core = coreOf(rootRes.root);
  }

  const promptText = `Spark-Vorschlag (${proposal.kind}) #${proposal.id}: ${proposal.rationale}`;
  const clean = promptText.replace(/[\r\n]+/g, " ").replace(/\s+—\s+@/g, " - @").trim().slice(0, 400);

  const file = path.join(core, NEEDS_FILE);
  if (!existsSync(file)) {
    await writeFile(file, needsTemplate(), "utf8").catch(() => {});
  }

  try {
    const current = await readFile(file, "utf8");
    // Don't add duplicate entries for the same proposal id
    if (current.includes(proposal.id)) {
      return false;
    }

    const line = `${current.endsWith("\n") ? "" : "\n"}- [ ] ${clean} — @spark-evolve · ${berlinStamp()}\n`;
    await appendFile(file, line, "utf8");
    return true;
  } catch {
    return false;
  }
}
