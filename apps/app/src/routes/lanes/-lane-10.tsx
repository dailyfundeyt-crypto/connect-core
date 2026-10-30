import React, { useState } from "react";
import {
  IconMail,
  IconKey,
  IconCpu,
  IconQrcode,
  IconHeartbeat,
  IconPlayerPlay,
  IconCheck,
  IconAlertCircle,
} from "@tabler/icons-react";
import { EmailAgentsSettings } from "../../components/settings/email-agents/email-agents-settings";
import { McpGrantsSettings } from "../../components/settings/email-agents/mcp-grants-settings";

/**
 * Lane 10 Route: Connect-MCP & External Email Agents Dashboard
 */
export function Lane10Route() {
  const [activeTab, setActiveTab] = useState<"email" | "grants" | "tools">("email");

  // State für interaktive MCP-Tool-Tests
  const [selectedTool, setSelectedTool] = useState<string>("swarm.list");
  const [toolArgs, setToolArgs] = useState<string>("{}");
  const [toolResult, setToolResult] = useState<any>(null);
  const [callingTool, setCallingTool] = useState(false);
  const [toolError, setToolError] = useState<string | null>(null);

  const executeToolTest = async (name: string, argsObj: Record<string, unknown>) => {
    setCallingTool(true);
    setToolError(null);
    setToolResult(null);
    try {
      const res = await fetch("/api/connect-mcp/jsonrpc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: {
            name,
            arguments: argsObj,
          },
        }),
      });
      const data = await res.json();
      if (data.error) {
        throw new Error(data.error.message || JSON.stringify(data.error));
      }
      setToolResult(data.result);
    } catch (err: any) {
      setToolError(err?.message || String(err));
    } finally {
      setCallingTool(false);
    }
  };

  const handleRunTest = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const parsed = JSON.parse(toolArgs || "{}");
      void executeToolTest(selectedTool, parsed);
    } catch {
      setToolError("Argumente müssen valides JSON sein.");
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Top Banner */}
      <div className="border rounded-xl p-6 bg-gradient-to-r from-background to-muted/30 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-mono text-primary font-semibold uppercase tracking-wider mb-1">
              <span>Lane 10 · Swarm-v2</span>
              <span>•</span>
              <span>Port 3101</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight">Connect-MCP & Externe E-Mail-Bots</h1>
            <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
              Swarm-Zugriff für Grok-Bot-Agenten (Hyper, Flux, Analysis, CNT Code), mobile QR-Connect-Kopplung
              und sichere Anbindung externer E-Mail-Bots mit Pflicht-Beschreibung und Stefans Freigabe.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setActiveTab("email")}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium transition-colors ${
                activeTab === "email" ? "bg-primary text-primary-foreground shadow" : "bg-card border hover:bg-muted"
              }`}
            >
              <IconMail className="w-4 h-4" />
              E-Mail-Bots & Freigabe
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("grants")}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium transition-colors ${
                activeTab === "grants" ? "bg-primary text-primary-foreground shadow" : "bg-card border hover:bg-muted"
              }`}
            >
              <IconKey className="w-4 h-4" />
              Grok-Bot Grants & Audit
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("tools")}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium transition-colors ${
                activeTab === "tools" ? "bg-primary text-primary-foreground shadow" : "bg-card border hover:bg-muted"
              }`}
            >
              <IconCpu className="w-4 h-4" />
              MCP-Tools Testen
            </button>
          </div>
        </div>
      </div>

      {/* Tab 1: E-Mail-Bots */}
      {activeTab === "email" && <EmailAgentsSettings />}

      {/* Tab 2: MCP Grants */}
      {activeTab === "grants" && <McpGrantsSettings />}

      {/* Tab 3: MCP Tools Testen */}
      {activeTab === "tools" && (
        <div className="space-y-6">
          <div className="border rounded-lg p-5 bg-card">
            <h3 className="font-semibold text-base mb-2 flex items-center gap-2">
              <IconCpu className="w-5 h-5 text-primary" />
              Interaktiver Connect-MCP Tool-Tester (Prompt 10.1)
            </h3>
            <p className="text-xs text-muted-foreground mb-4">
              Testen Sie die neuen MCP-Tools direkt über die JSON-RPC 2.0 Schnittstelle (`/api/connect-mcp/jsonrpc`).
            </p>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
              <button
                type="button"
                onClick={() => {
                  setSelectedTool("swarm.list");
                  setToolArgs("{}");
                  void executeToolTest("swarm.list", {});
                }}
                className="p-3 border rounded text-left hover:bg-muted transition text-xs font-medium"
              >
                <div className="font-mono text-primary">swarm.list</div>
                <div className="text-[11px] text-muted-foreground mt-0.5">Alle Swarms auflisten</div>
              </button>

              <button
                type="button"
                onClick={() => {
                  setSelectedTool("swarm.status");
                  setToolArgs("{}");
                  void executeToolTest("swarm.status", {});
                }}
                className="p-3 border rounded text-left hover:bg-muted transition text-xs font-medium"
              >
                <div className="font-mono text-primary">swarm.status</div>
                <div className="text-[11px] text-muted-foreground mt-0.5">Live CPU/RAM & Queue</div>
              </button>

              <button
                type="button"
                onClick={() => {
                  setSelectedTool("agents.health");
                  setToolArgs("{}");
                  void executeToolTest("agents.health", {});
                }}
                className="p-3 border rounded text-left hover:bg-muted transition text-xs font-medium"
              >
                <div className="font-mono text-primary">agents.health</div>
                <div className="text-[11px] text-muted-foreground mt-0.5">Connect Wartung Check</div>
              </button>

              <button
                type="button"
                onClick={() => {
                  setSelectedTool("app.open_qr");
                  setToolArgs(JSON.stringify({ open_in_browser: false, target: "connect" }, null, 2));
                  void executeToolTest("app.open_qr", { open_in_browser: false, target: "connect" });
                }}
                className="p-3 border rounded text-left hover:bg-muted transition text-xs font-medium"
              >
                <div className="font-mono text-primary">app.open_qr</div>
                <div className="text-[11px] text-muted-foreground mt-0.5">Mobiles QR-System</div>
              </button>
            </div>

            <form onSubmit={handleRunTest} className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-medium block mb-1">Tool-Name</label>
                  <select
                    value={selectedTool}
                    onChange={(e) => setSelectedTool(e.target.value)}
                    className="w-full text-xs font-mono rounded border bg-background px-3 py-2"
                  >
                    <option value="swarm.create">swarm.create</option>
                    <option value="swarm.list">swarm.list</option>
                    <option value="swarm.dispatch">swarm.dispatch</option>
                    <option value="swarm.status">swarm.status</option>
                    <option value="agents.list">agents.list</option>
                    <option value="agents.health">agents.health</option>
                    <option value="app.open_qr">app.open_qr</option>
                    <option value="email_agents.list">email_agents.list</option>
                  </select>
                </div>
                <div className="md:col-span-2">
                  <label className="text-xs font-medium block mb-1">Argumente (JSON)</label>
                  <textarea
                    value={toolArgs}
                    onChange={(e) => setToolArgs(e.target.value)}
                    rows={2}
                    className="w-full text-xs font-mono rounded border bg-background px-3 py-1.5"
                  />
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={callingTool}
                  className="flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground text-xs font-medium rounded hover:opacity-90 disabled:opacity-50"
                >
                  <IconPlayerPlay className="w-3.5 h-3.5" />
                  {callingTool ? "Führe aus..." : "Tool aufrufen"}
                </button>
              </div>
            </form>

            {toolError && (
              <div className="mt-4 p-3 text-xs bg-destructive/15 text-destructive border border-destructive/30 rounded flex items-center gap-2">
                <IconAlertCircle className="w-4 h-4 shrink-0" />
                <span>{toolError}</span>
              </div>
            )}

            {toolResult && (
              <div className="mt-4 border rounded p-4 bg-background">
                <h4 className="text-xs font-semibold mb-2 text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                  <IconCheck className="w-4 h-4" />
                  JSON-RPC Ergebnis ({selectedTool}):
                </h4>
                <pre className="text-xs font-mono bg-muted/40 p-3 rounded overflow-x-auto max-h-72">
                  {JSON.stringify(toolResult, null, 2)}
                </pre>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default Lane10Route;
