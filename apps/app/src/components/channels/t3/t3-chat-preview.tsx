/**
 * T3-Bridge — Vorschau & Showcase für T3-Chat-Bausteine (Lane A22).
 *
 * Ermöglicht Storybook/Preview und interaktive Vorführung aller 5 Bausteine:
 * 1. T3AgentChat (Live-Text & Verlauf)
 * 2. T3ToolLine (Tool-Chips / Befehlsausgabe)
 * 3. T3ApprovalCard (Freigaben: Erlauben / Ablehnen)
 * 4. T3ContextSeparator (100k-Kontextwechsel, aufklappbar & bearbeitbar)
 * 5. T3StopButton & T3QueueNotice („wartet (Platz 3)“)
 */

import { useState } from "react";
import { T3AgentChat } from "./t3-agent-chat";
import { T3ToolLine, T3ToolChipGroup } from "./t3-tool-line";
import { T3ApprovalCard } from "./t3-approval-card";
import { T3ContextSeparator } from "./t3-context-separator";
import { T3StopButton } from "./t3-stop-button";
import { T3QueueNotice } from "./t3-queue-notice";
import type {
  ConnectChatToolItem,
  ConnectChatApprovalItem,
  ConnectChatContextSwitchItem,
} from "@/lib/t3";
import { Button } from "@/components/ui/button";

export function T3ChatPreview() {
  const [activeTab, setActiveTab] = useState<"full" | "components">("full");

  // Mock-Tool-Items
  const mockToolDone: ConnectChatToolItem = {
    kind: "tool",
    id: "tool-1",
    label: "bash",
    title: "npm run build",
    status: "done",
    output: "> @connect/app@0.0.4 build\n> vite build\n\nvite v6.2.1 building for production...\n✓ 425 modules transformed.\ndist/index.html 0.82 kB\ndist/assets/index.js 312.45 kB\n✓ built in 842ms",
  };

  const mockToolRunning: ConnectChatToolItem = {
    kind: "tool",
    id: "tool-2",
    label: "git",
    title: "git status -s",
    status: "running",
  };

  // Mock-Approval
  const mockApproval: ConnectChatApprovalItem = {
    kind: "approval",
    id: "app-1",
    requestId: "req-123",
    requestKind: "Befehlsausführung",
    title: "Befehl 'rm -rf node_modules' im Projektordner ausführen?",
    prompt: "Dieser Befehl löscht Abhängigkeiten und erfordert deine Freigabe.",
    detail: "Working directory: C:\\Users\\Kunc GmbH\\Downloads\\OpenBot-v2-Helium\nCommand: rm -rf node_modules",
    options: [
      { id: "opt-1", label: "Erlauben", decision: "allow" },
      { id: "opt-2", label: "Ablehnen", decision: "deny" },
      { id: "opt-3", label: "Immer erlauben", decision: "allow_always" },
    ],
    status: "waiting",
    blocking: true,
  };

  // Mock-Context-Switch (I5)
  const mockContextSwitch: ConnectChatContextSwitchItem = {
    kind: "context_switch",
    id: "ctx-1",
    tokensAtSwitch: 100000,
    summary:
      "Ziel des vorherigen Kontextfensters war die Konfiguration der T3-Bridge.\n" +
      "- Provider-Treiber: Codex und Claude eingerichtet\n" +
      "- SSE Stream Handler: Reconnects mit Last-Event-ID aktiv\n" +
      "- Offene Punkte: A22 Chat-Bausteine im Connect-Look",
    previousThreadId: "th-prev-1",
    newThreadId: "th-new-2",
    createdAt: new Date().toISOString(),
  };

  return (
    <div className="flex flex-col h-full w-full max-w-4xl mx-auto p-4 space-y-6">
      {/* Header mit Tab-Umschalter */}
      <div className="flex items-center justify-between border-b border-border pb-3">
        <div>
          <h2 className="text-lg font-semibold text-foreground">
            T3-Chat-Bausteine Vorschau (Lane A22)
          </h2>
          <p className="text-xs text-muted-foreground">
            Alle Komponenten im Connect-Look gemäß A22-Spezifikation & I5.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant={activeTab === "full" ? "default" : "outline"}
            onClick={() => setActiveTab("full")}
          >
            Gesamter Chat
          </Button>
          <Button
            size="sm"
            variant={activeTab === "components" ? "default" : "outline"}
            onClick={() => setActiveTab("components")}
          >
            Einzel-Bausteine
          </Button>
        </div>
      </div>

      {activeTab === "full" ? (
        <div className="h-[600px] border border-border rounded-xl overflow-hidden shadow-sm">
          <T3AgentChat
            agentId="agent-preview-1"
            cliName="Codex T3"
            queuePosition={0}
            mock={true}
          />
        </div>
      ) : (
        <div className="space-y-6">
          {/* 1. Warteschlange & Stopp-Knopf */}
          <section className="space-y-2 border border-border rounded-xl p-4">
            <h3 className="text-sm font-semibold text-foreground">
              1. Warteschlangen-Hinweis & Stopp-Knopf
            </h3>
            <div className="space-y-3">
              <T3QueueNotice position={3} />
              <div className="flex items-center gap-3">
                <T3StopButton onInterrupt={() => alert("Interrupt ausgelöst")} isRunning={true} />
                <span className="text-xs text-muted-foreground">
                  (Aktiver Stopp-Knopf während der Generierung)
                </span>
              </div>
            </div>
          </section>

          {/* 2. Freigabe-Karte */}
          <section className="space-y-2 border border-border rounded-xl p-4">
            <h3 className="text-sm font-semibold text-foreground">
              2. Freigabe-Karte „Darf &lt;CLI&gt; … ? [Erlauben] [Ablehnen]“
            </h3>
            <T3ApprovalCard
              item={mockApproval}
              cliName="Codex"
              onRespond={(_id, decision) => {
                alert(`Freigabe beantwortet mit: ${decision}`);
              }}
            />
          </section>

          {/* 3. Kontext-Trenner (I5) */}
          <section className="space-y-2 border border-border rounded-xl p-4">
            <h3 className="text-sm font-semibold text-foreground">
              3. Kontext-Trenner (100k-Token-Kompression, aufklappbar & bearbeitbar)
            </h3>
            <T3ContextSeparator
              item={mockContextSwitch}
              defaultExpanded={true}
              onUpdateSummary={(_id, newSummary) => {
                alert(`Zusammenfassung aktualisiert:\n${newSummary}`);
              }}
            />
          </section>

          {/* 4. Tool-Lines & Chips */}
          <section className="space-y-2 border border-border rounded-xl p-4">
            <h3 className="text-sm font-semibold text-foreground">
              4. Tool-Chips / Befehlsausgabe im ToolLine-Stil
            </h3>
            <T3ToolChipGroup
              tools={[mockToolDone, mockToolRunning]}
              onSelectTool={(tool) => alert(`Ausgewählt: ${tool.title}`)}
            />
            <div className="pt-2">
              <T3ToolLine item={mockToolDone} />
              <T3ToolLine item={mockToolRunning} />
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
