import {
  IconFileText,
  IconFolder,
  IconPlus,
  IconSparkles,
  IconTrash,
} from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  BRAIN_AREAS,
  type BrainAreaId,
  type BrainFileRule,
  brainAgentsQueryOptions,
  saveBrainScopesMutationOptions,
} from "@/lib/brain/queries";

const SPARK_PRESETS: { label: string; path: string; read: boolean; write: boolean }[] = [
  { label: "Knowledge/Spark/", path: "Knowledge/Spark/", read: true, write: true },
  { label: "Projects/Projekt Spark.md", path: "Projects/Projekt Spark.md", read: true, write: true },
  { label: "Vault/Spark/", path: "Vault/Spark/", read: true, write: false },
];

/**
 * Lesen/Schreiben je Brain-Bereich und spezifische Spark-Ordner/Dateien als Checkboxen.
 * Gespeichert wird in Brain/agents.json und Postgres (spark_permissions).
 */
export function BrainScopeEditor({
  slug,
  name,
  kind,
  connectAgentId,
  read,
  write,
  files = [],
  onSaved,
}: {
  slug: string;
  name?: string;
  kind?: string;
  connectAgentId?: string;
  read: BrainAreaId[];
  write: BrainAreaId[];
  files?: BrainFileRule[];
  onSaved?: () => void;
}) {
  const queryClient = useQueryClient();
  const projects = useQuery(brainAgentsQueryOptions()).data?.projects ?? [];
  const save = useMutation(saveBrainScopesMutationOptions(queryClient));
  const [nextRead, setNextRead] = useState<BrainAreaId[]>(read);
  const [nextWrite, setNextWrite] = useState<BrainAreaId[]>(write);
  const [nextFiles, setNextFiles] = useState<BrainFileRule[]>(files);
  const [newPath, setNewPath] = useState("");
  const [newRead, setNewRead] = useState(true);
  const [newWrite, setNewWrite] = useState(true);

  const filesKey = (files ?? []).map((f) => `${f.path}:${f.read}:${f.write}`).join("|");
  const key = `${read.join(",")}|${write.join(",")}|${filesKey}`;

  // biome-ignore lint/correctness/useExhaustiveDependencies: reset only when the saved scopes change
  useEffect(() => {
    setNextRead(read);
    setNextWrite(write);
    setNextFiles(files ?? []);
  }, [key]);

  const currentFilesKey = nextFiles.map((f) => `${f.path}:${f.read}:${f.write}`).sort().join("|");
  const originalFilesKey = (files ?? []).map((f) => `${f.path}:${f.read}:${f.write}`).sort().join("|");

  const dirty =
    `${[...nextRead].sort().join(",")}|${[...nextWrite].sort().join(",")}|${currentFilesKey}` !==
    `${[...read].sort().join(",")}|${[...write].sort().join(",")}|${originalFilesKey}`;

  const toggle = (list: BrainAreaId[], id: BrainAreaId, on: boolean) =>
    on ? [...new Set([...list, id])] : list.filter((item) => item !== id);

  const addRule = (targetPath: string, r = true, w = false) => {
    const clean = targetPath.trim().replace(/\\/g, "/");
    if (!clean) return;
    const isVault = clean.toLowerCase().startsWith("vault/");
    setNextFiles((prev) => {
      const filtered = prev.filter((item) => item.path.toLowerCase() !== clean.toLowerCase());
      return [...filtered, { path: clean, read: r, write: isVault ? false : w }];
    });
    setNewPath("");
  };

  const removeRule = (targetPath: string) => {
    setNextFiles((prev) => prev.filter((item) => item.path.toLowerCase() !== targetPath.toLowerCase()));
  };

  const toggleFileRule = (targetPath: string, field: "read" | "write", value: boolean) => {
    setNextFiles((prev) =>
      prev.map((item) => {
        if (item.path.toLowerCase() === targetPath.toLowerCase()) {
          const isVault = item.path.toLowerCase().startsWith("vault/");
          return {
            ...item,
            [field]: field === "write" && isVault ? false : value,
          };
        }
        return item;
      }),
    );
  };

  return (
    <div className="flex flex-col gap-4" data-testid={`brain-scope-${slug}`}>
      {/* 1. Bereiche & Projekte */}
      <div className="overflow-hidden rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Bereich</th>
              <th className="w-20 px-3 py-2 text-center font-medium">Lesen</th>
              <th className="w-24 px-3 py-2 text-center font-medium">Schreiben</th>
            </tr>
          </thead>
          <tbody>
            {BRAIN_AREAS.map((area) => (
              <ScopeRow
                hint={area.id === "Projects" ? "Alle Projekte inkl. ihrer Vault-Notizen" : area.hint}
                id={area.id}
                key={area.id}
                label={area.id === "Projects" ? "Projekte (alle)" : area.label}
                nextRead={nextRead}
                nextWrite={nextWrite}
                setNextRead={setNextRead}
                setNextWrite={setNextWrite}
                toggle={toggle}
              />
            ))}
            {projects.length ? (
              <tr className="border-t bg-muted/20">
                <td className="px-3 py-1.5 text-xs font-semibold text-muted-foreground" colSpan={3}>
                  Pro Projekt / Firma – Lesen: Übersicht und Vault-Notizen (Vault immer nur lesen), Schreiben: an die Übersicht anhängen
                </td>
              </tr>
            ) : null}
            {projects.map((project) => (
              <ScopeRow
                coveredRead={nextRead.includes("Projects")}
                coveredWrite={nextWrite.includes("Projects")}
                hint={[project.parent ? "Unterfirma von Connect" : project.kind === "mutterfirma" ? "Mutterfirma" : "", project.folders.length ? `Vault: ${project.folders.join(", ")}/` : "", ...project.files].filter(Boolean).join(" · ")}
                id={`Projekt:${project.id}`}
                indent
                key={project.id}
                label={project.name}
                nextRead={nextRead}
                nextWrite={nextWrite}
                setNextRead={setNextRead}
                setNextWrite={setNextWrite}
                toggle={toggle}
              />
            ))}
          </tbody>
        </table>
      </div>

      {/* 2. Spezifische Spark-Ordner & Dateien */}
      <div className="flex flex-col gap-2 rounded-lg border p-3">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="flex items-center gap-1.5 text-xs font-semibold">
              <IconSparkles className="size-3.5 text-amber-500" />
              Spezifische Spark-Ordner & Datei-Rechte
            </h4>
            <p className="text-[11px] text-muted-foreground">
              Ordner (mit / am Ende) oder einzelne Markdown-Dateien freigeben. Datei-Regeln gehen vor Bereichs-Rechten.
            </p>
          </div>
        </div>

        {/* Spark-Presets */}
        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          <span className="text-[11px] text-muted-foreground">Schnellwahl:</span>
          {SPARK_PRESETS.map((preset) => {
            const alreadyAdded = nextFiles.some((f) => f.path.toLowerCase() === preset.path.toLowerCase());
            return (
              <button
                type="button"
                key={preset.path}
                disabled={alreadyAdded}
                onClick={() => addRule(preset.path, preset.read, preset.write)}
                className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] transition-colors ${
                  alreadyAdded
                    ? "bg-muted text-muted-foreground/50 cursor-not-allowed"
                    : "bg-primary/10 text-primary hover:bg-primary/20"
                }`}
              >
                <IconPlus className="size-3" />
                {preset.label}
              </button>
            );
          })}
        </div>

        {/* Tabelle der Datei-/Ordner-Regeln */}
        {nextFiles.length > 0 ? (
          <div className="mt-2 overflow-hidden rounded border">
            <table className="w-full text-xs">
              <thead className="bg-muted/40 text-muted-foreground">
                <tr>
                  <th className="px-2.5 py-1.5 text-left font-medium">Pfad</th>
                  <th className="w-16 px-2 py-1.5 text-center font-medium">Lesen</th>
                  <th className="w-20 px-2 py-1.5 text-center font-medium">Schreiben</th>
                  <th className="w-10 px-2 py-1.5 text-center font-medium">Aktion</th>
                </tr>
              </thead>
              <tbody>
                {nextFiles.map((rule) => {
                  const isFolder = rule.path.endsWith("/");
                  const isVault = rule.path.toLowerCase().startsWith("vault/");
                  return (
                    <tr key={rule.path} className="border-t hover:bg-muted/10">
                      <td className="px-2.5 py-1.5">
                        <div className="flex items-center gap-1.5">
                          {isFolder ? (
                            <IconFolder className="size-3.5 shrink-0 text-amber-500" />
                          ) : (
                            <IconFileText className="size-3.5 shrink-0 text-sky-500" />
                          )}
                          <code className="rounded bg-muted px-1 py-0.5 text-[11px] font-mono">
                            {rule.path}
                          </code>
                          {isVault && (
                            <span className="text-[10px] text-muted-foreground">(Vault: read-only)</span>
                          )}
                        </div>
                      </td>
                      <td className="px-2 py-1.5 text-center">
                        <div className="flex justify-center">
                          <Checkbox
                            checked={rule.read !== false}
                            onCheckedChange={(checked) =>
                              toggleFileRule(rule.path, "read", checked === true)
                            }
                          />
                        </div>
                      </td>
                      <td className="px-2 py-1.5 text-center">
                        <div className="flex justify-center">
                          <Checkbox
                            checked={rule.write === true && !isVault}
                            disabled={isVault}
                            onCheckedChange={(checked) =>
                              toggleFileRule(rule.path, "write", checked === true)
                            }
                          />
                        </div>
                      </td>
                      <td className="px-2 py-1.5 text-center">
                        <button
                          type="button"
                          onClick={() => removeRule(rule.path)}
                          className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                          title="Regel entfernen"
                        >
                          <IconTrash className="size-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-1 text-xs text-muted-foreground italic">
            Noch keine spezifischen Ordner- oder Datei-Regeln festgelegt. Der Agent nutzt die Bereichs-Rechte oben.
          </p>
        )}

        {/* Neues Formular */}
        <div className="mt-2 flex flex-wrap items-center gap-2 border-t pt-2">
          <Input
            placeholder="Ordner (z.B. Knowledge/Spark/) oder Datei..."
            value={newPath}
            onChange={(e) => setNewPath(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addRule(newPath, newRead, newWrite);
              }
            }}
            className="h-7 text-xs flex-1 min-w-[200px]"
          />
          <label className="flex items-center gap-1 text-[11px] text-muted-foreground cursor-pointer">
            <Checkbox
              checked={newRead}
              onCheckedChange={(c) => setNewRead(c === true)}
            />
            Lesen
          </label>
          <label className="flex items-center gap-1 text-[11px] text-muted-foreground cursor-pointer">
            <Checkbox
              checked={newWrite && !newPath.toLowerCase().startsWith("vault/")}
              disabled={newPath.toLowerCase().startsWith("vault/")}
              onCheckedChange={(c) => setNewWrite(c === true)}
            />
            Schreiben
          </label>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="h-7 text-xs px-2.5"
            disabled={!newPath.trim()}
            onClick={() => addRule(newPath, newRead, newWrite)}
          >
            <IconPlus className="size-3 mr-1" />
            Hinzufügen
          </Button>
        </div>
      </div>

      {/* 3. Aktionen: Speichern & Zurücksetzen */}
      <div className="flex items-center gap-2">
        <Button
          disabled={!dirty || save.isPending}
          onClick={() =>
            save.mutate(
              {
                slug,
                name,
                kind,
                connectAgentId,
                read: nextRead,
                write: nextWrite,
                files: nextFiles,
              },
              { onSuccess: () => onSaved?.() },
            )
          }
          size="sm"
        >
          {save.isPending ? "Speichert …" : "Rechte speichern"}
        </Button>
        {dirty ? (
          <Button
            onClick={() => {
              setNextRead(read);
              setNextWrite(write);
              setNextFiles(files ?? []);
            }}
            size="sm"
            variant="ghost"
          >
            Zurücksetzen
          </Button>
        ) : null}
        {save.isSuccess && !dirty ? (
          <span className="text-xs text-muted-foreground">
            Gespeichert{save.data ? ` (Commit ${save.data})` : ""}
          </span>
        ) : null}
        {save.error ? (
          <span className="text-xs text-destructive" role="alert">
            {save.error.message}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function ScopeRow({
  id,
  label,
  hint,
  indent,
  coveredRead,
  coveredWrite,
  nextRead,
  nextWrite,
  setNextRead,
  setNextWrite,
  toggle,
}: {
  id: BrainAreaId;
  label: string;
  hint?: string;
  indent?: boolean;
  coveredRead?: boolean;
  coveredWrite?: boolean;
  nextRead: BrainAreaId[];
  nextWrite: BrainAreaId[];
  setNextRead: (update: (list: BrainAreaId[]) => BrainAreaId[]) => void;
  setNextWrite: (update: (list: BrainAreaId[]) => BrainAreaId[]) => void;
  toggle: (list: BrainAreaId[], id: BrainAreaId, on: boolean) => BrainAreaId[];
}) {
  return (
    <tr className="border-t">
      <td className={indent ? "py-1.5 pr-3 pl-6" : "px-3 py-1.5"}>
        <div className="font-medium">{label}</div>
        {hint ? <div className="text-xs text-muted-foreground">{hint}</div> : null}
      </td>
      <td className="px-3 py-1.5">
        <div className="flex justify-center">
          <Checkbox
            aria-label={`${label} lesen`}
            checked={coveredRead || nextRead.includes(id)}
            disabled={coveredRead}
            onCheckedChange={(on) => setNextRead((list) => toggle(list, id, on === true))}
          />
        </div>
      </td>
      <td className="px-3 py-1.5">
        <div className="flex justify-center">
          <Checkbox
            aria-label={`${label} schreiben`}
            checked={coveredWrite || nextWrite.includes(id)}
            disabled={coveredWrite}
            onCheckedChange={(on) => setNextWrite((list) => toggle(list, id, on === true))}
          />
        </div>
      </td>
    </tr>
  );
}
