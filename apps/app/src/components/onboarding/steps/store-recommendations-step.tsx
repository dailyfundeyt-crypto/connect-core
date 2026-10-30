import * as React from "react";
import { Globe, Brain, Terminal, Cloud, Store, Check, ArrowRight, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ToolItem {
  id: string;
  name: string;
  description: string;
  category: "browser" | "brain" | "terminal" | "backup" | "store";
  icon: React.ComponentType<{ className?: string }>;
  recommended: boolean;
}

const TOOLS: ToolItem[] = [
  {
    id: "browser_use",
    name: "Real Browser Automation",
    description: "Echtes Chromium-Surfen mit persistenten Sessions ohne Sandbox-Limits.",
    category: "browser",
    icon: Globe,
    recommended: true,
  },
  {
    id: "brain_memory",
    name: "Brain & Wissensdatenbank",
    description: "Zentrales Gedächtnis und persistente Obsidian-Vault-Synchronisation.",
    category: "brain",
    icon: Brain,
    recommended: true,
  },
  {
    id: "cli_bridge",
    name: "CLI & Terminal Bridge",
    description: "Ausführung lokaler Shell-Befehle und Workspace-Kontrolle per Agent.",
    category: "terminal",
    icon: Terminal,
    recommended: true,
  },
  {
    id: "drive_backup",
    name: "Google Drive Backup",
    description: "Verschlüsselte Sicherung aller Chats, Firmen und Einstellungen.",
    category: "backup",
    icon: Cloud,
    recommended: true,
  },
  {
    id: "store_extensions",
    name: "Store & Agent-Skills",
    description: "Zugriff auf modulare MCP-Tools und vorgefertigte Skill-Pakete.",
    category: "store",
    icon: Store,
    recommended: true,
  },
];

interface StoreRecommendationsStepProps {
  selectedTools: string[];
  onToggleTool: (toolId: string) => void;
  onContinue: () => void;
  onBack: () => void;
}

export function StoreRecommendationsStep({
  selectedTools,
  onToggleTool,
  onContinue,
  onBack,
}: StoreRecommendationsStepProps) {
  return (
    <div className="w-full flex flex-col items-center justify-center max-w-xl mx-auto py-2">
      <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground text-center">
        Empfohlene Tools & Erweiterungen
      </h1>
      <p className="text-sm text-muted-foreground mt-2 text-center max-w-md">
        Wähle die Fähigkeiten aus, die für deine Agents von Beginn an bereitstehen sollen.
      </p>

      {/* Tools list */}
      <div className="w-full mt-6 space-y-2.5 max-h-72 overflow-y-auto pr-1">
        {TOOLS.map((tool) => {
          const isSelected = selectedTools.includes(tool.id);
          const Icon = tool.icon;

          return (
            <div
              key={tool.id}
              role="button"
              tabIndex={0}
              onClick={() => onToggleTool(tool.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  onToggleTool(tool.id);
                }
              }}
              className={`p-3.5 rounded-xl border text-left flex items-center justify-between transition cursor-pointer ${
                isSelected
                  ? "border-primary bg-primary/10 shadow-xs ring-1 ring-primary"
                  : "border-border bg-card/60 hover:bg-card/90"
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="size-9 rounded-lg bg-primary/15 text-primary flex items-center justify-center shrink-0">
                  <Icon className="size-4" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-semibold text-foreground truncate">
                      {tool.name}
                    </h2>
                    {tool.recommended && (
                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-md bg-primary/20 text-primary">
                        Empfohlen
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                    {tool.description}
                  </p>
                </div>
              </div>

              <div
                className={`size-5 rounded-md border flex items-center justify-center shrink-0 ml-3 transition ${
                  isSelected
                    ? "bg-primary border-primary text-primary-foreground"
                    : "border-border bg-card"
                }`}
              >
                {isSelected && <Check className="size-3.5 stroke-[3]" />}
              </div>
            </div>
          );
        })}
      </div>

      {/* Navigation Buttons */}
      <div className="mt-8 flex items-center justify-between w-full max-w-xs gap-3">
        <Button variant="outline" onClick={onBack} size="lg" className="w-1/2">
          <ArrowLeft className="size-4 mr-1.5" />
          Zurück
        </Button>
        <Button onClick={onContinue} size="lg" className="w-1/2">
          Weiter
          <ArrowRight className="size-4 ml-1.5" />
        </Button>
      </div>
    </div>
  );
}
