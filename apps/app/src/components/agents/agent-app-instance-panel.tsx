/**
 * Agent-App-Instance Panel (Stufe 2).
 *
 * Zeigt die App-Instanzen eines Agents und erlaubt:
 * - Neue Instanz hinzufügen (App wählen, Slot, Name, E-Mail)
 * - Instanz bearbeiten (Name, E-Mail, Enabled)
 * - Instanz löschen
 * - Instanz extern starten
 *
 * Die Instanzen werden in der DB-Tabelle `agent_app_instances` gespeichert.
 */

import { IconApps, IconEdit, IconPlus, IconRocket, IconTrash } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  type CliProvider,
  type CliStreamEvent,
  getLastAgentCliRun,
  streamAgentCli,
} from "@/lib/agents/agent-mcp-client";

export type AppInstance = {
  id: string;
  appId: string;
  slot: number;
  name: string;
  email: string;
  enabled: boolean;
  createdAt: string;
};

export type AppDefinition = {
  id: string;
  displayName: string;
  icon: string;
  description: string;
  defaultSlots: number;
};

async function fetchAppInstances(agentId: string): Promise<AppInstance[]> {
  const res = await fetch(`/api/agent-mcp/${encodeURIComponent(agentId)}/app-instances`, {
    credentials: "include",
  });
  const data = (await res.json()) as { instances: AppInstance[] };
  return data.instances ?? [];
}

async function fetchApps(): Promise<AppDefinition[]> {
  const res = await fetch("/api/agent-mcp/apps", { credentials: "include" });
  const data = (await res.json()) as { apps: AppDefinition[] };
  return data.apps ?? [];
}

async function createInstance(agentId: string, appId: string, slot: number, name: string, email: string): Promise<AppInstance | null> {
  const res = await fetch(`/api/agent-mcp/${encodeURIComponent(agentId)}/app-instances`, {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ appId, slot, name, email }),
  });
  const data = (await res.json()) as { instance: AppInstance | null };
  return data.instance;
}

async function updateInstance(agentId: string, instanceId: string, patch: { name?: string; email?: string; enabled?: boolean }): Promise<void> {
  await fetch(`/api/agent-mcp/${encodeURIComponent(agentId)}/app-instances/${instanceId}`, {
    method: "PATCH",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(patch),
  });
}

async function deleteInstance(agentId: string, instanceId: string): Promise<void> {
  await fetch(`/api/agent-mcp/${encodeURIComponent(agentId)}/app-instances/${instanceId}`, {
    method: "DELETE",
    credentials: "include",
  });
}

async function launchInstance(agentId: string, instanceId: string): Promise<{ ok: boolean; message: string }> {
  const res = await fetch(`/api/agent-mcp/${encodeURIComponent(agentId)}/app-instances/${instanceId}/launch`, {
    method: "POST",
    credentials: "include",
  });
  return (await res.json()) as { ok: boolean; message: string };
}

export function AgentAppInstancePanel({ agentId }: { agentId: string }) {
  const [instances, setInstances] = useState<AppInstance[]>([]);
  const [apps, setApps] = useState<AppDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [launchMsg, setLaunchMsg] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      const [inst, appList] = await Promise.all([
        fetchAppInstances(agentId).catch(() => []),
        fetchApps().catch(() => []),
      ]);
      setInstances(inst);
      setApps(appList);
      setLoading(false);
    })();
  }, [agentId]);

  const addInstance = async (appId: string, name: string, email: string) => {
    const inst = await createInstance(agentId, appId, 1, name, email);
    if (inst) setInstances((prev) => [...prev, inst]);
    setShowAdd(false);
  };

  const handleDelete = async (id: string) => {
    await deleteInstance(agentId, id);
    setInstances((prev) => prev.filter((i) => i.id !== id));
  };

  const handleLaunch = async (id: string) => {
    const result = await launchInstance(agentId, id);
    setLaunchMsg(result.message);
    setTimeout(() => setLaunchMsg(null), 3000);
  };

  if (loading) {
    return (
      <section className="grid gap-3 rounded-xl border border-border bg-card/40 p-4">
        <div className="flex items-center gap-2">
          <IconApps className="size-4 text-muted-foreground" />
          <h3 className="text-sm font-medium">App-Instanzen</h3>
        </div>
        <p className="text-muted-foreground text-xs">Lädt…</p>
      </section>
    );
  }

  return (
    <section className="grid gap-3 rounded-xl border border-border bg-card/40 p-4">
      <header className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <IconApps className="size-4 text-muted-foreground" />
          <h3 className="text-sm font-medium">App-Instanzen (Stufe 2)</h3>
          {instances.length > 0 && (
            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
              {instances.length}
            </span>
          )}
        </div>
        <Button
          onClick={() => setShowAdd(true)}
          size="sm"
          type="button"
          variant="outline"
        >
          <IconPlus className="size-3" />
          Hinzufügen
        </Button>
      </header>

      {launchMsg && (
        <p className="rounded-md bg-muted/40 px-2 py-1 text-xs text-muted-foreground">
          {launchMsg}
        </p>
      )}

      {instances.length === 0 && !showAdd ? (
        <p className="text-muted-foreground text-xs">
          Noch keine App-Instanzen. Klicke „Hinzufügen" um eine App (Codex,
          Ottermind, Manus, Figma, …) mit einem Account zu registrieren.
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {instances.map((inst) => {
            const app = apps.find((a) => a.id === inst.appId);
            const isEditing = editingId === inst.id;
            return (
              <li
                key={inst.id}
                className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/20 p-2"
              >
                <span className="text-lg">{app?.icon ?? "📦"}</span>
                <div className="flex-1 min-w-0">
                  <p className="truncate text-xs font-medium">
                    {inst.name || app?.displayName || inst.appId}
                  </p>
                  {inst.email && (
                    <p className="truncate text-[11px] text-muted-foreground">
                      {inst.email}
                    </p>
                  )}
                  <p className="text-[10px] text-muted-foreground">
                    Slot {inst.slot} · {app?.description ?? inst.appId}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  {!isEditing && (
                    <Button
                      onClick={() => void handleLaunch(inst.id)}
                      size="icon"
                      title="App starten"
                      type="button"
                      variant="ghost"
                    >
                      <IconRocket className="size-3.5" />
                    </Button>
                  )}
                  {!isEditing && (
                    <Button
                      onClick={() => setEditingId(isEditing ? null : inst.id)}
                      size="icon"
                      title="Bearbeiten"
                      type="button"
                      variant="ghost"
                    >
                      <IconEdit className="size-3.5" />
                    </Button>
                  )}
                  {!isEditing && (
                    <Button
                      onClick={() => void handleDelete(inst.id)}
                      size="icon"
                      title="Löschen"
                      type="button"
                      variant="ghost"
                    >
                      <IconTrash className="size-3.5 text-destructive" />
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {showAdd && (
        <AddInstanceForm
          apps={apps}
          onAdd={addInstance}
          onCancel={() => setShowAdd(false)}
        />
      )}
    </section>
  );
}

function AddInstanceForm({
  apps,
  onAdd,
  onCancel,
}: {
  apps: AppDefinition[];
  onAdd: (appId: string, name: string, email: string) => void;
  onCancel: () => void;
}) {
  const [appId, setAppId] = useState(apps[0]?.id ?? "");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");

  return (
    <div className="grid gap-2 rounded-lg border border-border bg-muted/20 p-3">
      <p className="text-xs font-medium">Neue App-Instanz</p>
      <select
        className="h-8 rounded-md border border-border bg-background px-2 text-xs"
        onChange={(e) => setAppId(e.target.value)}
        value={appId}
      >
        {apps.map((app) => (
          <option key={app.id} value={app.id}>
            {app.icon} {app.displayName}
          </option>
        ))}
      </select>
      <Input
        onChange={(e) => setName(e.target.value)}
        placeholder="Anzeigename (z.B. Arbeit, Privat)"
        value={name}
      />
      <Input
        onChange={(e) => setEmail(e.target.value)}
        placeholder="E-Mail-Adresse (optional)"
        type="email"
        value={email}
      />
      <div className="flex gap-1.5">
        <Button
          onClick={() => void onAdd(appId, name, email)}
          size="sm"
          type="button"
        >
          Speichern
        </Button>
        <Button onClick={onCancel} size="sm" type="button" variant="outline">
          Abbrechen
        </Button>
      </div>
    </div>
  );
}
