import {
  IconAlertOctagon,
  IconAlertTriangle,
  IconBolt,
  IconCalendarEvent,
  IconCheck,
  IconCircleDot,
  IconDeviceDesktop,
  IconEye,
  IconHistory,
  IconKey,
  IconKeyboard,
  IconLock,
  IconMicrophone,
  IconRefresh,
  IconRobot,
  IconSearch,
  IconShieldX,
  IconShieldCheck,
  IconTrash,
  IconWorld,
  IconX,
} from "@tabler/icons-react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "@/components/ui/item";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SettingsSectionHeader } from "@/components/settings/settings-section-header";
import {
  type AgentDesktopPermission,
  type DesktopActionLogEntry,
  type DesktopRiskLevel,
} from "../../../../../packages/shared/src/desktop/contracts";

export type DesktopRoutineItem = {
  id: string;
  name: string;
  cronExpression: string;
  targetAgentId?: string;
  enabled: boolean;
  actionSummary: string;
};

export type DesktopTodoItem = {
  id: string;
  title: string;
  dueTime?: string;
  completed: boolean;
  associatedApp?: string;
};

const DEFAULT_AGENTS = [
  { id: "agent_researcher", name: "Research Agent (Recherche)", defaultLevel: "read" },
  { id: "agent_devops", name: "DevOps & Deployment Agent", defaultLevel: "destructive_with_confirm" },
  { id: "agent_daily", name: "Daily Work & Productivity Bot", defaultLevel: "act" },
  { id: "agent_external", name: "External / Untrusted Agent", defaultLevel: "none" },
];

export function DesktopControlSettingsPanel() {
  const [activeTab, setActiveTab] = useState<string>("permissions");

  // Kill-Switch state
  const [killswitchActive, setKillswitchActive] = useState<boolean>(false);
  const [killswitchLatencyMs, setKillswitchLatencyMs] = useState<number>(1.2);

  // Agent permissions
  const [permissions, setPermissions] = useState<Record<string, AgentDesktopPermission>>({
    agent_researcher: {
      agentId: "agent_researcher",
      permissionLevel: "read",
      allowedApps: ["helium.exe", "code.exe"],
      allowedDomains: ["github.com", "arxiv.org", "wikipedia.org"],
      rateLimitPerMinute: 30,
      updatedAt: new Date().toISOString(),
    },
    agent_devops: {
      agentId: "agent_devops",
      permissionLevel: "destructive_with_confirm",
      allowedApps: ["powershell.exe", "wt.exe", "docker.exe"],
      allowedDomains: ["vercel.com", "github.com", "cloud.google.com"],
      rateLimitPerMinute: 20,
      updatedAt: new Date().toISOString(),
    },
    agent_daily: {
      agentId: "agent_daily",
      permissionLevel: "act",
      allowedApps: ["notepad.exe", "spotify.exe", "helium.exe"],
      allowedDomains: ["youtube.com", "google.com", "notion.so"],
      rateLimitPerMinute: 45,
      updatedAt: new Date().toISOString(),
    },
    agent_external: {
      agentId: "agent_external",
      permissionLevel: "none",
      allowedApps: [],
      allowedDomains: [],
      rateLimitPerMinute: 0,
      updatedAt: new Date().toISOString(),
    },
  });

  // Action audit logs
  const [logs, setLogs] = useState<DesktopActionLogEntry[]>([
    {
      id: "log-1",
      actionId: "act-101",
      agentId: "agent_daily",
      actionType: "open_url",
      riskLevel: "act",
      targetDescription: "Open URL: https://youtube.com in Helium",
      status: "success",
      durationMs: 245,
      executedAt: new Date(Date.now() - 1000 * 60 * 3).toISOString(),
    },
    {
      id: "log-2",
      actionId: "act-102",
      agentId: "agent_external",
      actionType: "click",
      riskLevel: "act",
      targetDescription: "Click element: Submit Order Button",
      status: "rejected",
      durationMs: 0,
      errorMessage: "Agent 'agent_external' has permissionLevel: 'none'. Access rejected.",
      executedAt: new Date(Date.now() - 1000 * 60 * 12).toISOString(),
    },
    {
      id: "log-3",
      actionId: "act-103",
      agentId: "agent_devops",
      actionType: "type_text",
      riskLevel: "act",
      targetDescription: "Type text into: Windows PasswordBox",
      status: "rejected",
      durationMs: 0,
      errorMessage: "Sicherheits-Sperre: Passwort- und PIN-Felder dürfen von Agenten weder gelesen noch beschrieben werden.",
      executedAt: new Date(Date.now() - 1000 * 60 * 25).toISOString(),
    },
    {
      id: "log-4",
      actionId: "act-104",
      agentId: "agent_researcher",
      actionType: "screenshot",
      riskLevel: "read",
      targetDescription: "Screen region capture (800x600)",
      status: "success",
      durationMs: 120,
      executedAt: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
    },
  ]);

  // Routines & Todos
  const [routines, setRoutines] = useState<DesktopRoutineItem[]>([
    {
      id: "rout-1",
      name: "Morgen-Start",
      cronExpression: "0 9 * * 1-5",
      targetAgentId: "agent_daily",
      enabled: true,
      actionSummary: "Öffne Unity + Spotify + Connect Notch",
    },
    {
      id: "rout-2",
      name: "Abend-Backup & Log Check",
      cronExpression: "0 18 * * 1-5",
      targetAgentId: "agent_devops",
      enabled: true,
      actionSummary: "Prüfe Git-Status & Drive-Synchronisation",
    },
  ]);

  const [todos, setTodos] = useState<DesktopTodoItem[]>([
    {
      id: "todo-1",
      title: "Design Review in Helium Browser",
      dueTime: "14:00 Uhr",
      completed: false,
      associatedApp: "helium.exe",
    },
    {
      id: "todo-2",
      title: "Daily Standup Notizen prüfen",
      dueTime: "10:30 Uhr",
      completed: true,
      associatedApp: "notepad.exe",
    },
  ]);

  const [filterAgent, setFilterAgent] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");

  // Kill-Switch trigger
  const handleTriggerKillswitch = useCallback(() => {
    const start = performance.now();
    setKillswitchActive(true);
    const ms = performance.now() - start;
    setKillswitchLatencyMs(Math.max(0.5, Math.round(ms * 10) / 10));

    // Append killswitch log
    setLogs((prev) => [
      {
        id: `log-kill-${Date.now()}`,
        actionId: `act-kill-${Date.now()}`,
        actionType: "key_combo",
        riskLevel: "destructive",
        targetDescription: "EMERGENCY KILL-SWITCH TRIGGERED (Not-Aus)",
        status: "killswitch_aborted",
        durationMs: 1,
        errorMessage: "Alle Desktop-Aktionen sofort gestoppt (< 300 ms SLA)",
        executedAt: new Date().toISOString(),
      },
      ...prev,
    ]);
  }, []);

  const handleResetKillswitch = useCallback(() => {
    setKillswitchActive(false);
  }, []);

  // Update permission level
  const handleUpdateLevel = (agentId: string, level: AgentDesktopPermission["permissionLevel"]) => {
    setPermissions((prev) => ({
      ...prev,
      [agentId]: {
        ...prev[agentId],
        permissionLevel: level,
        updatedAt: new Date().toISOString(),
      },
    }));
  };

  // Update allowlists
  const handleUpdateAllowedApps = (agentId: string, val: string) => {
    const list = val
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    setPermissions((prev) => ({
      ...prev,
      [agentId]: {
        ...prev[agentId],
        allowedApps: list,
      },
    }));
  };

  const handleUpdateAllowedDomains = (agentId: string, val: string) => {
    const list = val
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    setPermissions((prev) => ({
      ...prev,
      [agentId]: {
        ...prev[agentId],
        allowedDomains: list,
      },
    }));
  };

  const handleUpdateRateLimit = (agentId: string, val: number) => {
    setPermissions((prev) => ({
      ...prev,
      [agentId]: {
        ...prev[agentId],
        rateLimitPerMinute: val,
      },
    }));
  };

  const filteredLogs = logs.filter((log) => {
    if (filterAgent !== "all" && log.agentId !== filterAgent) return false;
    if (filterStatus !== "all" && log.status !== filterStatus) return false;
    return true;
  });

  return (
    <div className="flex flex-col gap-6">
      <SettingsSectionHeader
        description="Native Windows-PC-Steuerung (Hitodama-Features): Sicherheit, Rechte je Agent, Hotkeys, Audit-Log und Not-Aus."
        title="Desktop-Steuerung & Sicherheit"
      />

      {/* ─── Emergency Kill-Switch Banner ─────────────────────────────────── */}
      <div
        className={`rounded-xl border p-4 transition-all duration-200 ${
          killswitchActive
            ? "border-red-500/60 bg-red-950/20 text-red-200 shadow-[0_0_20px_rgba(239,68,68,0.25)]"
            : "border-border/60 bg-card/40"
        }`}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div
              className={`mt-0.5 rounded-lg p-2.5 ${
                killswitchActive
                  ? "bg-red-500/20 text-red-400"
                  : "bg-primary/10 text-primary"
              }`}
            >
              {killswitchActive ? (
                <IconAlertOctagon className="size-6 animate-pulse" />
              ) : (
                <IconShieldCheck className="size-6 text-emerald-400" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-sm">
                  {killswitchActive
                    ? "NOT-AUS AKTIV: Alle Aktionen gestoppt"
                    : "Not-Aus-Schalter (Kill-Switch) Bereit"}
                </h3>
                <span
                  className={`rounded-full px-2 py-0.5 font-mono text-[10px] uppercase font-bold tracking-wider ${
                    killswitchActive
                      ? "bg-red-500 text-white"
                      : "bg-emerald-500/20 text-emerald-300"
                  }`}
                >
                  {killswitchActive ? "AUSGELÖST" : "BEREIT (< 300 ms)"}
                </span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Tastenkürzel:{" "}
                <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-[11px] font-semibold text-foreground">
                  Ctrl + Alt + Pause
                </kbd>{" "}
                bricht sofort jede Maus-, Tastatur- und Browser-Aktion aller Agenten in unter 300 ms ab.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 self-end sm:self-center">
            {killswitchActive ? (
              <Button
                className="gap-1.5 border-emerald-500/50 bg-emerald-600/20 text-emerald-300 hover:bg-emerald-600/30"
                size="sm"
                variant="outline"
                onClick={handleResetKillswitch}
              >
                <IconRefresh className="size-4" />
                Zurücksetzen (Freigeben)
              </Button>
            ) : (
              <Button
                className="gap-1.5 border-red-500/50 bg-red-600/20 text-red-300 hover:bg-red-600/30 hover:text-white"
                size="sm"
                variant="outline"
                onClick={handleTriggerKillswitch}
              >
                <IconAlertOctagon className="size-4" />
                Not-Aus auslösen
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* ─── Tabs Navigation ─────────────────────────────────────────────── */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-4 bg-muted/40 p-1">
          <TabsTrigger value="permissions" className="flex items-center gap-1.5 text-xs">
            <IconRobot className="size-4" />
            Rechte je Agent
          </TabsTrigger>
          <TabsTrigger value="hotkeys" className="flex items-center gap-1.5 text-xs">
            <IconKeyboard className="size-4" />
            Globale Hotkeys
          </TabsTrigger>
          <TabsTrigger value="log" className="flex items-center gap-1.5 text-xs">
            <IconHistory className="size-4" />
            Audit-Log ({logs.length})
          </TabsTrigger>
          <TabsTrigger value="routines" className="flex items-center gap-1.5 text-xs">
            <IconCalendarEvent className="size-4" />
            Routinen & Todos
          </TabsTrigger>
        </TabsList>

        {/* ─── TAB 1: RECHTE JE AGENT ─────────────────────────────────────── */}
        <TabsContent value="permissions" className="mt-4 flex flex-col gap-4">
          <div className="rounded-lg border border-border/60 bg-muted/20 p-3 text-xs text-muted-foreground flex items-center justify-between">
            <div className="flex items-center gap-2">
              <IconLock className="size-4 text-amber-400" />
              <span>
                <strong>Sicherheits-Grundregel:</strong> Neue oder unbekannte Agenten haben standardmäßig <em>keine Rechte (none)</em>.
                Passwortfelder sind dauerhaft gesperrt (weder lesbar noch beschreibbar).
              </span>
            </div>
            <span className="font-mono text-[11px] text-muted-foreground">Port 3101 · Host Kunc GmbH</span>
          </div>

          <div className="flex flex-col gap-4">
            {DEFAULT_AGENTS.map((agent) => {
              const perm = permissions[agent.id] || {
                agentId: agent.id,
                permissionLevel: "none",
                allowedApps: [],
                allowedDomains: [],
                rateLimitPerMinute: 30,
              };

              return (
                <div
                  key={agent.id}
                  className="rounded-xl border border-border/60 bg-card p-4 shadow-sm"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-border/40">
                    <div className="flex items-center gap-2">
                      <IconRobot className="size-5 text-primary" />
                      <div>
                        <h4 className="font-medium text-sm">{agent.name}</h4>
                        <p className="font-mono text-[11px] text-muted-foreground">{agent.id}</p>
                      </div>
                    </div>
                    {/* Permission Level Selector */}
                    <div className="flex items-center gap-1.5 bg-muted/50 p-1 rounded-lg">
                      {(
                        [
                          { id: "none", label: "None (Gesperrt)", color: "text-red-400" },
                          { id: "read", label: "Nur Lesen", color: "text-blue-400" },
                          { id: "act", label: "Aktionen", color: "text-emerald-400" },
                          { id: "destructive_with_confirm", label: "Destruktiv + Karte", color: "text-amber-400" },
                        ] as const
                      ).map((lvl) => (
                        <button
                          key={lvl.id}
                          type="button"
                          onClick={() => handleUpdateLevel(agent.id, lvl.id)}
                          className={`px-2.5 py-1 text-xs rounded-md transition-all font-medium ${
                            perm.permissionLevel === lvl.id
                              ? "bg-background text-foreground shadow-sm"
                              : "text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          {lvl.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Settings details: allowlists & rate-limit */}
                  {perm.permissionLevel !== "none" && (
                    <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                      <div>
                        <label className="font-medium flex items-center gap-1.5 mb-1 text-muted-foreground">
                          <IconDeviceDesktop className="size-3.5" />
                          App-Allowlist (Kommagetrennt):
                        </label>
                        <Input
                          placeholder="z. B. notepad.exe, helium.exe"
                          className="h-8 text-xs font-mono"
                          value={perm.allowedApps.join(", ")}
                          onChange={(e) => handleUpdateAllowedApps(agent.id, e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="font-medium flex items-center gap-1.5 mb-1 text-muted-foreground">
                          <IconWorld className="size-3.5" />
                          Domain-Allowlist (Kommagetrennt):
                        </label>
                        <Input
                          placeholder="z. B. youtube.com, github.com"
                          className="h-8 text-xs font-mono"
                          value={perm.allowedDomains.join(", ")}
                          onChange={(e) => handleUpdateAllowedDomains(agent.id, e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="font-medium flex items-center gap-1.5 mb-1 text-muted-foreground">
                          <IconBolt className="size-3.5" />
                          Rate-Limit (Aktionen / Minute):
                        </label>
                        <Input
                          type="number"
                          min={1}
                          max={120}
                          className="h-8 text-xs font-mono"
                          value={perm.rateLimitPerMinute}
                          onChange={(e) =>
                            handleUpdateRateLimit(agent.id, parseInt(e.target.value, 10) || 30)
                          }
                        />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </TabsContent>

        {/* ─── TAB 2: GLOBALE HOTKEYS ──────────────────────────────────────── */}
        <TabsContent value="hotkeys" className="mt-4 flex flex-col gap-3">
          <Item size="sm" variant="muted">
            <ItemContent>
              <ItemTitle className="flex items-center gap-2">
                <IconMicrophone className="size-4 text-indigo-400" />
                Diktat (Push-to-Talk)
              </ItemTitle>
              <ItemDescription>
                Drücken & Halten: Sprache wird lokal mit Whisper aufgenommen. Loslassen: Bereinigung & direktes Einfügen in das aktive Textfeld via UIA / SendInput.
              </ItemDescription>
            </ItemContent>
            <ItemActions>
              <kbd className="rounded border bg-background px-2.5 py-1 font-mono text-xs font-semibold shadow-sm">
                Ctrl + Win (Halten)
              </kbd>
            </ItemActions>
          </Item>

          <Item size="sm" variant="muted">
            <ItemContent>
              <ItemTitle className="flex items-center gap-2">
                <IconCircleDot className="size-4 text-sky-400" />
                Circle to ask (Bildschirm-Lasso)
              </ItemTitle>
              <ItemDescription>
                Bildschirm einfrieren, Bereich einkreisen, Frage stellen. Lokales Vision-Modell erkennt Intent und führt Aktionen aus.
              </ItemDescription>
            </ItemContent>
            <ItemActions>
              <kbd className="rounded border bg-background px-2.5 py-1 font-mono text-xs font-semibold shadow-sm">
                Ctrl + Shift (Halten)
              </kbd>
            </ItemActions>
          </Item>

          <Item size="sm" variant="muted">
            <ItemContent>
              <ItemTitle className="flex items-center gap-2">
                <IconKeyboard className="size-4 text-emerald-400" />
                Schwebendes Chat-Menü
              </ItemTitle>
              <ItemDescription>
                Öffnet das globale Dispatch-Menü über allen Fenstern zur direkten Agenten-Interaktion.
              </ItemDescription>
            </ItemContent>
            <ItemActions>
              <kbd className="rounded border bg-background px-2.5 py-1 font-mono text-xs font-semibold shadow-sm">
                Ctrl + Alt + K
              </kbd>
            </ItemActions>
          </Item>

          <Item size="sm" variant="muted">
            <ItemContent>
              <ItemTitle className="flex items-center gap-2">
                <IconAlertOctagon className="size-4 text-red-400" />
                Not-Aus (Kill-Switch)
              </ItemTitle>
              <ItemDescription>
                Bricht alle laufenden Desktop-Aktionen, Mausklicks, Tastatureingaben und Hintergrundroutinen garantiert in unter 300 ms ab.
              </ItemDescription>
            </ItemContent>
            <ItemActions>
              <kbd className="rounded border border-red-500/40 bg-red-950/20 text-red-300 px-2.5 py-1 font-mono text-xs font-semibold shadow-sm">
                Ctrl + Alt + Pause
              </kbd>
            </ItemActions>
          </Item>
        </TabsContent>

        {/* ─── TAB 3: AUDIT-LOG ────────────────────────────────────────────── */}
        <TabsContent value="log" className="mt-4 flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Filter:</span>
              <select
                className="h-8 rounded-md border bg-background px-2 text-xs"
                value={filterAgent}
                onChange={(e) => setFilterAgent(e.target.value)}
              >
                <option value="all">Alle Agenten</option>
                {DEFAULT_AGENTS.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
              <select
                className="h-8 rounded-md border bg-background px-2 text-xs"
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
              >
                <option value="all">Alle Status</option>
                <option value="success">Erfolgreich</option>
                <option value="rejected">Abgelehnt / Gesperrt</option>
                <option value="killswitch_aborted">Not-Aus (Killswitch)</option>
              </select>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 text-xs h-8"
              onClick={() => {
                const blob = new Blob([JSON.stringify(logs, null, 2)], { type: "application/json" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `desktop-action-log-${new Date().toISOString().slice(0, 10)}.json`;
                a.click();
              }}
            >
              Export JSONL
            </Button>
          </div>

          <div className="rounded-xl border border-border/60 bg-card overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="bg-muted/50 text-muted-foreground font-medium border-b border-border/40">
                <tr>
                  <th className="py-2.5 px-3">Zeit</th>
                  <th className="py-2.5 px-3">Agent</th>
                  <th className="py-2.5 px-3">Aktion & Risiko</th>
                  <th className="py-2.5 px-3">Zielbeschreibung</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3 text-right">Dauer</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/20">
                {filteredLogs.map((log) => {
                  const statusColors: Record<string, string> = {
                    success: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
                    rejected: "bg-amber-500/10 text-amber-400 border-amber-500/20",
                    killswitch_aborted: "bg-red-500/20 text-red-400 border-red-500/30",
                    failed: "bg-red-500/10 text-red-400 border-red-500/20",
                  };

                  return (
                    <tr key={log.id} className="hover:bg-muted/10 transition-colors">
                      <td className="py-2.5 px-3 font-mono text-[11px] text-muted-foreground">
                        {new Date(log.executedAt).toLocaleTimeString()}
                      </td>
                      <td className="py-2.5 px-3 font-medium">
                        {log.agentId || "local"}
                      </td>
                      <td className="py-2.5 px-3">
                        <span className="font-mono text-[11px] font-semibold">{log.actionType}</span>
                        <span className="ml-1.5 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                          {log.riskLevel}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-muted-foreground max-w-xs truncate" title={log.targetDescription}>
                        {log.targetDescription}
                        {log.errorMessage && (
                          <div className="text-[10px] text-red-400 mt-0.5">{log.errorMessage}</div>
                        )}
                      </td>
                      <td className="py-2.5 px-3">
                        <span
                          className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase ${
                            statusColors[log.status] || "bg-muted text-muted-foreground"
                          }`}
                        >
                          {log.status}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-[11px] text-muted-foreground">
                        {log.durationMs} ms
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </TabsContent>

        {/* ─── TAB 4: ROUTINEN & TODOS ─────────────────────────────────────── */}
        <TabsContent value="routines" className="mt-4 flex flex-col gap-4">
          <div>
            <h4 className="font-medium text-sm mb-2 flex items-center gap-1.5">
              <IconCalendarEvent className="size-4 text-primary" />
              Automatisierte PC-Routinen
            </h4>
            <div className="flex flex-col gap-2">
              {routines.map((r) => (
                <Item key={r.id} size="sm" variant="muted">
                  <ItemContent>
                    <ItemTitle className="flex items-center gap-2">
                      {r.name}
                      <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                        {r.cronExpression}
                      </span>
                    </ItemTitle>
                    <ItemDescription>{r.actionSummary}</ItemDescription>
                  </ItemContent>
                  <ItemActions>
                    <Switch
                      checked={r.enabled}
                      onCheckedChange={(checked) =>
                        setRoutines((prev) =>
                          prev.map((item) => (item.id === r.id ? { ...item, enabled: checked } : item))
                        )
                      }
                    />
                  </ItemActions>
                </Item>
              ))}
            </div>
          </div>

          <Separator />

          <div>
            <h4 className="font-medium text-sm mb-2 flex items-center gap-1.5">
              <IconCheck className="size-4 text-emerald-400" />
              Zeitgebundene Desktop To-dos
            </h4>
            <div className="flex flex-col gap-2">
              {todos.map((todo) => (
                <Item key={todo.id} size="sm" variant="muted">
                  <ItemContent>
                    <ItemTitle className={todo.completed ? "line-through text-muted-foreground" : ""}>
                      {todo.title}
                    </ItemTitle>
                    <ItemDescription>
                      Fällig: {todo.dueTime} · Ziel-App: <span className="font-mono">{todo.associatedApp}</span>
                    </ItemDescription>
                  </ItemContent>
                  <ItemActions>
                    <Button
                      size="sm"
                      variant={todo.completed ? "outline" : "default"}
                      className="text-xs h-7"
                      onClick={() =>
                        setTodos((prev) =>
                          prev.map((t) => (t.id === todo.id ? { ...t, completed: !t.completed } : t))
                        )
                      }
                    >
                      {todo.completed ? "Erledigt" : "Abhaken"}
                    </Button>
                  </ItemActions>
                </Item>
              ))}
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
