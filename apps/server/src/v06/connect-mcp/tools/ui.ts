/**
 * Tool: open_ui_link (v06 / Wave 2 / A18).
 *
 * Erzeugt einen mobilen QR-Kopplungs-Link für Connect und öffnet die
 * Benutzeroberfläche optional im lokalen Standard-Browser.
 *
 * Scope: 'open_ui' (z.B. für "grokbot:hyper").
 */

import { createOpenUiLink, type OpenUiResult } from "../qrOpenUi";
import type { ToolExecutionContext } from "../types";

export async function handleOpenUiLink(
  args: Record<string, unknown>,
  ctx: ToolExecutionContext,
): Promise<OpenUiResult> {
  const companyId = String(args.companyId || ctx.companyId || "*");
  const target = (args.target as "connect" | "swarm" | "settings" | "mobile") || "connect";
  const openInBrowser = args.open_in_browser !== false;

  return createOpenUiLink(ctx.auth, companyId, {
    target,
    openInBrowser,
  });
}

export const OPEN_UI_LINK_TOOL = {
  name: "open_ui_link",
  description:
    "Erzeugt einen kurzlebigen QR-Kopplungslink über das Mobile-QR-System und öffnet Connect optional im Standardbrowser (Scope: open_ui).",
  inputSchema: {
    type: "object",
    properties: {
      target: {
        type: "string",
        enum: ["connect", "swarm", "settings", "mobile"],
        description: "Zielansicht in Connect (Standard: 'connect')",
      },
      open_in_browser: {
        type: "boolean",
        description: "Ob Connect zusätzlich im Browser gestartet werden soll (Standard: true auf Host)",
      },
      companyId: {
        type: "string",
        description: "Optionale Firmen-ID",
      },
    },
  },
  handler: handleOpenUiLink,
};

export const CONNECT_OPEN_UI_TOOL = {
  ...OPEN_UI_LINK_TOOL,
  name: "connect_open_ui",
};
