/**
 * MCP-Tool-Liste pro Agent.
 *
 * Stufe 1: zeigt an, welche Tools dieser Agent über /api/agent-mcp/* anderen
 * Agents / Tools anbietet. Die Felder sind read-only — wer ein Tool aufruft,
 * ist ein anderer Agent (Codex, Manus, Perplexity, …), nicht die UI hier.
 *
 * Stufe 2+ erweitert die Liste um Codex-CLI-Tools, Browser-Tools, GitHub
 * usw. — die Anzeige hier muss dafür nicht angefasst werden, weil sie
 * generisch über `/api/agent-mcp/:id/tools` liest.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  IconBolt,
  IconCheck,
  IconCopy,
  IconRefresh,
  IconTerminal,
} from "@tabler/icons-react";
import { useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  callAgentMcpTool,
  getAgentMcpProfile,
  listAgentMcpTools,
  type AgentMcpProfile,
  type AgentMcpToolInfo,
  type AgentMcpToolResult,
  type AgentMcpToolsResponse,
} from "@/lib/agents/agent-mcp-client";

/**
 * Eine Zeile pro Tool: Name, Beschreibung, ein „Test"-Knopf, der das Tool
 * mit Default-Args aufruft. Nützlich zum Verifizieren, dass der Server-Pfad
 * steht, ohne den ganzen CopilotKit-Turn-Pfad mitzutesten.
 */
function ToolRow({
  agentId,
  tool,
}: {
  agentId: string;
  tool: AgentMcpToolInfo;
}) {
  const queryClient = useQueryClient();
  const [result, setResult] = useState<AgentMcpToolResult | null>(null);
  const invoke = useMutation({
    mutationFn: async () => {
      // Default-Args je nach Tool — minimale Eingabe, damit der Test
      // funktioniert ohne dass der User ein Formular ausfüllen muss.
      let args: Record<string, unknown> = {};
      if (tool.name === "chat" || tool.name === "query") {
        args = { [tool.name === "chat" ? "prompt" : "question"]: "Hallo, wer bist du?" };
      } else if (tool.name === "steer") {
        args = { instruction: "Sag dem User hallo." };
      }
      return callAgentMcpTool(agentId, tool.name, args);
    },
    onSuccess: (data) => {
      setResult(data);
      // Channel-Liste refreshen, damit ein neuer `chat`-Turn auch in der
      // Sidebar als „letzte Nachricht" auftaucht.
      void queryClient.invalidateQueries({ queryKey: ["channels"] });
    },
  });

  return (
    <div className="rounded-xl border border-border bg-card/40 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-mono text-xs font-semibold tracking-tight">
            {tool.name}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {tool.description}
          </p>
        </div>
        <Button
          className="h-7 shrink-0 gap-1 px-2 text-[11px]"
          disabled={invoke.isPending}
          onClick={() => invoke.mutate()}
          size="sm"
          type="button"
          variant="outline"
        >
          <IconBolt className="size-3" />
          Test
        </Button>
      </div>
      {result ? (
        <pre
          className={
            "mt-2 max-h-40 overflow-auto rounded-md border p-2 font-mono text-[11px] leading-snug " +
            (result.isError
              ? "border-destructive/40 bg-destructive/10 text-destructive"
              : "border-border bg-muted/30 text-foreground")
          }
        >
{result.content.map((c) => c.text).join("\n")}
        </pre>
      ) : null}
    </div>
  );
}

/**
 * Kurzinfo, wie ein anderer Agent diesen Agenten ansprechen würde.
 */
function ProfileCard({ profile }: { profile: AgentMcpProfile }) {
  const [copied, setCopied] = useState(false);
  const copyEndpoint = async () => {
    await navigator.clipboard.writeText(`/api/agent-mcp/${profile.id}/tools/chat`);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };
  return (
    <div className="rounded-xl border border-border bg-card/40 p-3">
      <p className="text-xs font-semibold">MCP-Endpoint</p>
      <p className="mt-1 break-all font-mono text-[11px] text-muted-foreground">
        POST /api/agent-mcp/{profile.id}/tools/&lt;name&gt;
      </p>
      <p className="mt-2 text-xs text-muted-foreground">
        Andere Agents rufen diesen Agent über diese URL auf — Body:{" "}
        <span className="font-mono">{"{ args: { ... } }"}</span>. Antwort ist
        im MCP-Standard-Format.
      </p>
      <Button
        className="mt-3 h-7 gap-1 px-2 text-[11px]"
        onClick={() => void copyEndpoint()}
        size="sm"
        type="button"
        variant="ghost"
      >
        {copied ? <IconCheck className="size-3" /> : <IconCopy className="size-3" />}
        Beispiel-Endpoint kopieren
      </Button>
    </div>
  );
}

/**
 * Hauptkomponente: lädt Tool-Liste + Profil, zeigt beides an.
 */
export function AgentMcpTools({ agentId }: { agentId: string }) {
  const toolsQuery = useQuery({
    queryKey: ["agent-mcp", "tools", agentId],
    queryFn: () => listAgentMcpTools(agentId),
  });
  const profileQuery = useQuery({
    queryKey: ["agent-mcp", "profile", agentId],
    queryFn: () => getAgentMcpProfile(agentId),
  });

  if (toolsQuery.isPending || profileQuery.isPending) {
    return (
      <div className="flex flex-col gap-2">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-20 w-full rounded-xl" />
        <Skeleton className="h-20 w-full rounded-xl" />
      </div>
    );
  }

  if (toolsQuery.isError || profileQuery.isError) {
    return (
      <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
        MCP-Tools konnten nicht geladen werden. Läuft der Server mit
        /api/agent-mcp?
        <Button
          className="mt-2 h-7 px-2 text-[11px]"
          onClick={() => {
            void toolsQuery.refetch();
            void profileQuery.refetch();
          }}
          size="sm"
          type="button"
          variant="outline"
        >
          <IconRefresh className="size-3" /> Erneut versuchen
        </Button>
      </div>
    );
  }

  const tools: AgentMcpToolsResponse = toolsQuery.data;
  const profile: AgentMcpProfile = profileQuery.data;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <IconTerminal className="size-4 text-sky-400" />
        <h3 className="text-sm font-semibold tracking-tight">
          MCP-Tools (Stufe 1)
        </h3>
        <span className="ml-auto rounded-full bg-muted/40 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
          {tools.tools.length} Tools
        </span>
      </div>
      <p className="text-xs text-muted-foreground">
        Dieser Agent ist ein eigener MCP-Server. Andere Agents und Tools
        rufen ihn über{" "}
        <span className="font-mono">/api/agent-mcp/{profile.id}/tools/&lt;name&gt;</span>{" "}
        auf.
      </p>
      <ProfileCard profile={profile} />
      <div className="flex flex-col gap-2">
        {tools.tools.map((tool) => (
          <ToolRow agentId={agentId} key={tool.name} tool={tool} />
        ))}
      </div>
    </div>
  );
}
