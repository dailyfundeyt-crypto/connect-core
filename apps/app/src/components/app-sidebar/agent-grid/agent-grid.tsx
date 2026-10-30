/**
 * Agenten-Raster für die linke Sidebar (Lane A28 — Idee I6).
 *
 * EIGENTÜMER: A28.
 *
 * Aufbau (Grok-Bot-Stil):
 *   1. Ordner-Reihen (Grok-Bot-Stil, aufklappbar, Drop-Ziel)
 *   2. Avatar-Raster (4–5 Spalten) der Agenten ohne Ordner
 *   3. (je Ordner) ein eigenes Raster der Agenten in diesem Ordner
 *
 * Status-Punkt je Agent aus dem Scheduler (A21: `useSchedulerStatus` →
 * `FleetAgentState.state`, Vertrag `AgentRuntimeState` aus A01).
 *
 * Feature-Flag
 * ------------
 * Hinter `getT3Flag("mascot")` (A01-Vertrag, `apps/app/src/lib/t3/contracts.ts`):
 * Das Raster IST das Maskottchen-Raster (I6 + A29). Ist das Flag aus, rendert
 * die Komponente **nichts** — das alte Verhalten (Agentenliste) bleibt.
 * Ein eigenes Flag `agentGrid` wäre sauberer; das ist ein Wunsch an A01
 * (im Bericht A28 vermerkt), weil `contracts.ts` A01 gehört.
 *
 * Verdrahtung
 * -----------
 * `apps/app/src/components/app-sidebar/app-sidebar.tsx` gehört **A39**. Diese
 * Komponente ist drop-in: A39 setzt sie an die Stelle der alten Agentenliste
 * und lässt APPS / PC-APPS unangetastet (I3/I4).
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { IconFolderPlus, IconRobot } from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { AgentGridItem, type AgentGridItemData } from "./agent-grid-item";
import { AgentFolderRow } from "./agent-folder-row";
import { toGridStatus } from "./status";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  type AgentProfile,
  agentListQueryOptions,
} from "@/lib/agents/queries";
import {
  applyAgentFolderMove,
  createAgentFolder,
  deleteAgentFolder,
  listAgentFolders,
  partitionAgentsByFolder,
  renameAgentFolder,
  subscribeAgentFolders,
  type AgentFolder,
} from "@/lib/agents/agent-folders";
import { DND_AGENT } from "@/lib/companies/sidebar-order";
import {
  getCompany,
  listCompanies,
  readActiveCompanyId,
  resolveCompanyId,
  subscribeCompanies,
} from "@/lib/companies/store";
import { getT3Flag } from "@/lib/t3/contracts";
import { useSchedulerStatus } from "@/lib/t3/hooks";
import { cn } from "@/lib/utils";

/** Spaltenbreite im Raster → 4–5 Spalten je nach Sidebar-Breite. */
const GRID_TEMPLATE = "repeat(auto-fill, minmax(52px, 1fr))";

/** Schlüssel für den Zuklapp-Zustand der Ordner (pro Firma). */
const COLLAPSED_KEY = "connect.agentGrid.collapsedFolders";

function readCollapsed(): Record<string, boolean> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(COLLAPSED_KEY);
    return raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
  } catch {
    return {};
  }
}

export function AgentGrid({
  /** Optional: vorgefilterte Agenten (z. B. aus der Suche der Sidebar). */
  agents: agentsProp,
  search = "",
}: {
  agents?: readonly AgentProfile[];
  search?: string;
}) {
  const enabled = getT3Flag("mascot");
  const navigate = useNavigate();
  const agentsQuery = useQuery(agentListQueryOptions());
  const scheduler = useSchedulerStatus({
    refetchInterval: enabled ? 5000 : undefined,
  });

  const [companyId, setCompanyId] = useState<string | null>(() =>
    typeof window === "undefined" ? null : resolveCompanyId(readActiveCompanyId()),
  );
  const [companies, setCompanies] = useState(() => listCompanies());
  const [folders, setFolders] = useState<AgentFolder[]>([]);
  const [folderTick, setFolderTick] = useState(0);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() =>
    readCollapsed(),
  );
  const [renameTarget, setRenameTarget] = useState<AgentFolder | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");

  useEffect(() => {
    const sync = () => {
      setCompanyId(resolveCompanyId(readActiveCompanyId()));
      setCompanies(listCompanies());
    };
    window.addEventListener("connect-active-company", sync);
    const off = subscribeCompanies(sync);
    return () => {
      window.removeEventListener("connect-active-company", sync);
      off();
    };
  }, []);

  useEffect(() => subscribeAgentFolders(() => setFolderTick((n) => n + 1)), []);

  const company = companyId
    ? (getCompany(companyId) ?? companies.find((c) => c.id === companyId))
    : companies[0];

  useEffect(() => {
    setFolders(listAgentFolders(company?.id ?? null));
  }, [company?.id, folderTick]);

  /** Alle Agenten dieser Firma (Roster), ungefiltert. */
  const roster = useMemo(() => {
    const all = agentsProp ?? agentsQuery.data ?? [];
    if (!company) return all as AgentProfile[];
    const ids = new Set(company.agentIds);
    const own = all.filter((a) => ids.has(a.id));
    // Wenn der Roster leer ist (Company ohne Agenten), bleibt die Liste leer —
    // andere Firmen dürfen nicht hier erscheinen.
    return own;
  }, [agentsProp, agentsQuery.data, company]);

  /** Suche über Name und Titel. */
  const searched = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return roster;
    return roster.filter(
      (a) =>
        a.name.toLowerCase().includes(needle) ||
        (a.title ?? "").toLowerCase().includes(needle),
    );
  }, [roster, search]);

  /** Aufteilung: Ordner (mit Agenten) und Agenten ohne Ordner. */
  const partition = useMemo(
    () => partitionAgentsByFolder(searched, folders),
    [searched, folders],
  );

  /** Status je Agent-ID aus dem Scheduler. */
  const statusByAgent = useMemo(() => {
    const map = new Map<string, ReturnType<typeof toGridStatus>>();
    for (const agent of scheduler.agents) {
      map.set(agent.agentId, toGridStatus(agent.state));
    }
    return map;
  }, [scheduler.agents]);

  const openAgent = useCallback(
    async (agent: AgentGridItemData) => {
      await navigate({ to: "/agent/$agentId", params: { agentId: agent.id } });
    },
    [navigate],
  );

  const handleDropOnFolder = useCallback(
    (folderId: string, agentId: string) => {
      if (!company) return;
      applyAgentFolderMove(company.id, agentId, {
        kind: "into",
        folderId,
      });
    },
    [company],
  );

  const handleDropUnfiled = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      if (!company) return;
      const agentId = event.dataTransfer.getData(DND_AGENT);
      if (!agentId) return;
      applyAgentFolderMove(company.id, agentId, { kind: "out" });
    },
    [company],
  );

  const toggleFolder = useCallback((folderId: string) => {
    setCollapsed((prev) => {
      const next = { ...prev, [folderId]: !prev[folderId] };
      try {
        window.localStorage.setItem(COLLAPSED_KEY, JSON.stringify(next));
      } catch {
        /* quota */
      }
      return next;
    });
  }, []);

  const submitRename = useCallback(() => {
    if (!company || !renameTarget) return;
    renameAgentFolder(company.id, renameTarget.id, renameValue);
    setRenameTarget(null);
    setRenameValue("");
  }, [company, renameTarget, renameValue]);

  const submitNewFolder = useCallback(() => {
    if (!company) return;
    try {
      createAgentFolder(company.id, newFolderName);
    } catch {
      /* leerer Name — der Button ist deaktiviert */
    }
    setNewFolderOpen(false);
    setNewFolderName("");
  }, [company, newFolderName]);

  if (!enabled) return null;

  const renderGrid = (items: AgentProfile[], testId: string) => (
    <div
      className="grid w-full gap-0.5"
      data-testid={testId}
      style={{ gridTemplateColumns: GRID_TEMPLATE }}
    >
      {items.map((agent) => (
        <AgentGridItem
          agent={agent}
          key={agent.id}
          onOpen={(a) => void openAgent(a)}
          status={statusByAgent.get(agent.id) ?? "idle"}
        />
      ))}
    </div>
  );

  return (
    <div className="mb-2 w-full group-data-[collapsible=icon]:items-center">
      <div className="mb-0.5 flex h-7 items-center justify-between px-2 group-data-[collapsible=icon]:hidden">
        <span className="truncate text-[11px] font-semibold uppercase tracking-[0.06em] text-sidebar-foreground/45">
          Agenten
        </span>
        <button
          aria-label="Neuer Ordner"
          className="flex size-5 items-center justify-center rounded-md text-sidebar-foreground/45 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
          onClick={() => setNewFolderOpen(true)}
          title="Neuer Ordner"
          type="button"
        >
          <IconFolderPlus className="size-3.5" />
        </button>
      </div>

      {folders.length > 0 ? (
        <ul className="flex flex-col gap-0.5 px-0.5">
          {folders.map((folder) => {
            const entry = partition.folders.find(
              (f) => f.folder.id === folder.id,
            );
            const agents = entry?.agents ?? [];
            const isOpen = !collapsed[folder.id];
            return (
              <li key={folder.id}>
                <AgentFolderRow
                  count={agents.length}
                  name={folder.name}
                  onDelete={() => {
                    if (!company) return;
                    deleteAgentFolder(company.id, folder.id);
                  }}
                  onDropAgent={(agentId) =>
                    handleDropOnFolder(folder.id, agentId)
                  }
                  onRename={() => {
                    setRenameTarget(folder);
                    setRenameValue(folder.name);
                  }}
                  onToggle={() => toggleFolder(folder.id)}
                  open={isOpen}
                />
                {isOpen && agents.length > 0 ? (
                  <div className="px-1 pb-1 pt-0.5">
                    {renderGrid(agents, `agent-grid-folder-${folder.id}`)}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}

      <div
        className="rounded-xl px-0.5"
        onDragOver={(event) => {
          if (!event.dataTransfer.types.includes(DND_AGENT)) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
        }}
        onDrop={handleDropUnfiled}
      >
        {partition.unfiled.length > 0 ? (
          renderGrid(partition.unfiled, "agent-grid-unfiled")
        ) : (
          <p className="flex items-center gap-2 px-2 py-2 text-[11px] italic text-sidebar-foreground/40">
            <IconRobot className="size-3.5" />
            Keine Agenten ohne Ordner.
          </p>
        )}
      </div>

      <Dialog open={newFolderOpen} onOpenChange={setNewFolderOpen}>
        <DialogContent className="max-w-sm rounded-2xl">
          <DialogHeader>
            <DialogTitle>Neuer Ordner</DialogTitle>
            <DialogDescription>
              Ordner, in die du Agenten ablegen kannst.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <Input
              autoFocus
              onChange={(event) => setNewFolderName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") submitNewFolder();
              }}
              placeholder="Ordnername (z. B. Research, Trading)"
              value={newFolderName}
            />
          </DialogBody>
          <DialogFooter>
            <Button
              onClick={() => setNewFolderOpen(false)}
              type="button"
              variant="ghost"
            >
              Abbrechen
            </Button>
            <Button
              disabled={!newFolderName.trim()}
              onClick={submitNewFolder}
              type="button"
            >
              Erstellen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={renameTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setRenameTarget(null);
            setRenameValue("");
          }
        }}
      >
        <DialogContent className="max-w-sm rounded-2xl">
          <DialogHeader>
            <DialogTitle>Ordner umbenennen</DialogTitle>
            <DialogDescription>
              Der neue Name erscheint sofort in der Sidebar.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <Input
              autoFocus
              onChange={(event) => setRenameValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") submitRename();
              }}
              value={renameValue}
            />
          </DialogBody>
          <DialogFooter>
            <Button
              onClick={() => {
                setRenameTarget(null);
                setRenameValue("");
              }}
              type="button"
              variant="ghost"
            >
              Abbrechen
            </Button>
            <Button
              disabled={!renameValue.trim()}
              onClick={submitRename}
              type="button"
            >
              Speichern
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default AgentGrid;
