/**
 * A27 – Bot-Panel: Bibliothek-Tab
 *
 * Zeigt die Dateien des Arbeitsordners des Agenten (A07, nur lesen).
 * Nutzt GET /api/agent-mcp/:agentId/cli-config → paths.workspace
 * und GET /api/workspaces/:agentId/files (A07-Route, falls vorhanden).
 *
 * Abhängigkeit A07:
 *  - API-Route `/api/agent-mcp/:agentId/cli-config` → liefert workspace-Pfad (schon vorhanden)
 *  - Dateilisting: GET /api/workspaces/:agentId/files → vom Server
 *    Falls diese Route noch nicht existiert (A07 hat sie vielleicht noch nicht geliefert),
 *    fällt die Ansicht auf einen Hinweis zurück. Wunsch an A07 im Bericht vermerkt.
 */
import { IconFile, IconFolder, IconLoader2, IconRefresh } from "@tabler/icons-react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { agentCliConfigQueryOptions } from "@/lib/agents/queries";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";

/** Eine Datei oder ein Ordner im Arbeitsverzeichnis. */
type WorkspaceEntry = {
  name: string;
  type: "file" | "directory";
  /** Größe in Bytes (nur bei Dateien). */
  size?: number;
  /** Letzte Änderung als ISO-String. */
  modifiedAt?: string;
};

type WorkspaceFilesResponse = {
  entries: WorkspaceEntry[];
  path: string;
  error?: string;
};

/** Holt die Dateiliste für einen Agenten-Arbeitsordner. */
async function fetchWorkspaceFiles(
  agentId: string,
  signal?: AbortSignal,
): Promise<WorkspaceFilesResponse | null> {
  try {
    const res = await fetch(
      `/api/workspaces/${encodeURIComponent(agentId)}/files`,
      { credentials: "include", signal },
    );
    if (res.status === 404) return null; // Route noch nicht vorhanden (A07 offen)
    if (!res.ok) return { entries: [], path: "", error: `Fehler ${res.status}` };
    return res.json() as Promise<WorkspaceFilesResponse>;
  } catch {
    return null;
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface BibliothekTabProps {
  agentId: string;
}

/**
 * Bibliothek-Tab: Dateien des Arbeitsordners (A07, nur lesen).
 */
export function BibliothekTab({ agentId }: BibliothekTabProps) {
  const { data: cliConfig } = useQuery(agentCliConfigQueryOptions(agentId));

  const [files, setFiles] = useState<WorkspaceFilesResponse | null | undefined>(
    undefined,
  );
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await fetchWorkspaceFiles(agentId);
      setFiles(result);
    } finally {
      setLoading(false);
    }
  }, [agentId]);

  useEffect(() => {
    void load();
  }, [load]);

  const workspacePath = cliConfig?.paths.workspace;

  // Route nicht vorhanden (A07 offen)
  if (files === null) {
    return (
      <div className="flex flex-col gap-3 px-1 py-4 text-center">
        <IconFolder className="mx-auto size-8 text-muted-foreground/60" />
        <p className="text-sm font-medium">Bibliothek noch nicht verfügbar</p>
        <p className="max-w-[16rem] mx-auto text-xs leading-relaxed text-muted-foreground">
          Die Dateiliste steht bereit, sobald A07 (Arbeitsordner-Routen)
          aktiviert ist. Der Workspace-Pfad:
        </p>
        {workspacePath && (
          <code className="mx-auto mt-1 block max-w-full truncate rounded-md bg-muted px-2 py-1 text-[10px] text-muted-foreground">
            {workspacePath}
          </code>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {/* Kopfzeile mit Pfad + Refresh */}
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] font-medium text-muted-foreground">
            Arbeitsordner
          </p>
          {workspacePath && (
            <p className="mt-0.5 truncate text-[10px] text-muted-foreground/60">
              {workspacePath}
            </p>
          )}
        </div>
        <Button
          size="icon"
          variant="ghost"
          className="size-7 shrink-0"
          onClick={() => void load()}
          disabled={loading}
          aria-label="Aktualisieren"
          type="button"
        >
          <IconRefresh
            className={cn("size-3.5", loading && "animate-spin")}
          />
        </Button>
      </div>

      {/* Dateiliste */}
      {loading && files === undefined ? (
        <div className="flex items-center gap-2 py-4 text-muted-foreground text-xs">
          <IconLoader2 className="size-4 animate-spin" />
          Lädt…
        </div>
      ) : files?.error ? (
        <p className="text-xs text-destructive">{files.error}</p>
      ) : !files?.entries.length ? (
        <div className="flex flex-col items-center gap-2 py-6 text-center">
          <IconFolder className="size-7 text-muted-foreground/50" />
          <p className="text-xs text-muted-foreground">
            Der Arbeitsordner ist leer.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-0.5">
          {files.entries
            .slice()
            .sort((a, b) => {
              // Ordner zuerst, dann alphabetisch
              if (a.type !== b.type)
                return a.type === "directory" ? -1 : 1;
              return a.name.localeCompare(b.name);
            })
            .map((entry) => (
              <li
                key={entry.name}
                className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-muted/40"
              >
                {entry.type === "directory" ? (
                  <IconFolder className="size-4 shrink-0 text-amber-500" />
                ) : (
                  <IconFile className="size-4 shrink-0 text-muted-foreground" />
                )}
                <span className="min-w-0 flex-1 truncate text-xs font-medium">
                  {entry.name}
                </span>
                {entry.size !== undefined && entry.type === "file" && (
                  <span className="shrink-0 text-[10px] text-muted-foreground">
                    {formatBytes(entry.size)}
                  </span>
                )}
              </li>
            ))}
        </ul>
      )}
    </div>
  );
}
