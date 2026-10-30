/**
 * Tools: brain_write & connect_read_brain (v06 / Wave 2 / A18).
 *
 * Exponiert Schreib- und Lesezugriff auf das Connect-Brain für Agenten
 * wie "cnt-code" (Scope: brain_write / read).
 */

import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import * as path from "node:path";
import { check } from "../grants";
import type { ToolExecutionContext } from "../types";
import { brainRootFromEnv } from "../../../brain/store";

export async function handleBrainWrite(
  args: Record<string, unknown>,
  ctx: ToolExecutionContext,
): Promise<{ ok: boolean; message: string; path: string }> {
  const companyId = String(args.companyId || ctx.companyId || "*");
  const access = check(ctx.auth.principal, companyId, "brain_write");
  if (!access.allowed) {
    throw new Error(
      access.reason || `403 Forbidden: Principal "${ctx.auth.principal}" besitzt keinen 'brain_write' Scope.`,
    );
  }

  const title = String(args.title || "Notiz ohne Titel").trim();
  const content = String(args.content || "").trim();
  const folder = String(args.folder || "Inbox").trim();

  // Bereinige Dateinamen
  const safeFilename = `${title.replace(/[/\\?%*:|"<>]/g, "-").slice(0, 80)}.md`;
  const root = brainRootFromEnv() || path.resolve(process.cwd(), "brain");
  const targetDir = path.join(root, folder);
  const targetPath = path.join(targetDir, safeFilename);

  try {
    if (!existsSync(targetDir)) {
      await mkdir(targetDir, { recursive: true });
    }

    const fileContent = [
      `# ${title}`,
      ``,
      `*Autor:* ${ctx.auth.principal} (Connect-MCP)`,
      `*Datum:* ${new Date().toISOString()}`,
      `*Firma:* ${companyId}`,
      ``,
      content,
    ].join("\n");

    await writeFile(targetPath, fileContent, "utf-8");

    return {
      ok: true,
      message: `Brain-Notiz "${title}" erfolgreich gespeichert.`,
      path: targetPath,
    };
  } catch (err: any) {
    throw new Error(`Brain-Schreibfehler: ${err?.message || String(err)}`);
  }
}

export async function handleBrainRead(
  args: Record<string, unknown>,
  ctx: ToolExecutionContext,
): Promise<{ ok: boolean; title?: string; content?: string }> {
  const companyId = String(args.companyId || ctx.companyId || "*");
  const access = check(ctx.auth.principal, companyId, "read");
  if (!access.allowed) {
    throw new Error(
      access.reason || `403 Forbidden: Principal "${ctx.auth.principal}" besitzt keinen 'read' Scope.`,
    );
  }

  const notePath = String(args.path || "");
  const root = brainRootFromEnv() || path.resolve(process.cwd(), "brain");
  const resolved = path.resolve(root, notePath);

  if (!resolved.startsWith(path.resolve(root))) {
    throw new Error("Pfad liegt außerhalb des Brain-Verzeichnisses.");
  }

  if (!existsSync(resolved)) {
    throw new Error(`Notiz unter "${notePath}" nicht gefunden.`);
  }

  const content = await readFile(resolved, "utf-8");
  return {
    ok: true,
    title: path.basename(resolved, ".md"),
    content,
  };
}

export const BRAIN_WRITE_TOOL = {
  name: "brain_write",
  description: "Schreibt eine Notiz oder Recherche-Erkenntnis in das Connect Brain (Scope: brain_write).",
  inputSchema: {
    type: "object",
    properties: {
      title: { type: "string", description: "Titel der Notiz" },
      content: { type: "string", description: "Markdown-Inhalt der Notiz" },
      folder: { type: "string", description: "Zielordner im Brain (Standard: 'Inbox')" },
      companyId: { type: "string", description: "Optionale Firmen-ID" },
    },
    required: ["title", "content"],
  },
  handler: handleBrainWrite,
};

export const BRAIN_READ_TOOL = {
  name: "connect_read_brain",
  description: "Liest den Inhalt einer Notiz aus dem Connect Brain (Scope: read).",
  inputSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "Relativer Pfad zur Notiz im Brain" },
      companyId: { type: "string", description: "Optionale Firmen-ID" },
    },
    required: ["path"],
  },
  handler: handleBrainRead,
};
