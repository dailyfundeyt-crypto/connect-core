import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  BRAIN_AREAS,
  type BrainAreaId,
  brainAgentsQueryOptions,
  saveBrainScopesMutationOptions,
} from "@/lib/brain/queries";

/**
 * Lesen/Schreiben je Brain-Bereich als Checkboxen. Gespeichert wird in Brain/agents.json
 * (plus eine Zeile in log.md und ein lokaler git-Commit) – nichts anderes im Brain ändert sich.
 */
export function BrainScopeEditor({
  slug,
  name,
  kind,
  connectAgentId,
  read,
  write,
  onSaved,
}: {
  slug: string;
  name?: string;
  kind?: string;
  connectAgentId?: string;
  read: BrainAreaId[];
  write: BrainAreaId[];
  onSaved?: () => void;
}) {
  const queryClient = useQueryClient();
  const projects = useQuery(brainAgentsQueryOptions()).data?.projects ?? [];
  const save = useMutation(saveBrainScopesMutationOptions(queryClient));
  const [nextRead, setNextRead] = useState<BrainAreaId[]>(read);
  const [nextWrite, setNextWrite] = useState<BrainAreaId[]>(write);
  const key = `${read.join(",")}|${write.join(",")}`;
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset only when the saved scopes change
  useEffect(() => {
    setNextRead(read);
    setNextWrite(write);
  }, [key]);

  const dirty = `${[...nextRead].sort().join(",")}|${[...nextWrite].sort().join(",")}` !== `${[...read].sort().join(",")}|${[...write].sort().join(",")}`;
  const toggle = (list: BrainAreaId[], id: BrainAreaId, on: boolean) =>
    on ? [...new Set([...list, id])] : list.filter((item) => item !== id);

  return (
    <div className="flex flex-col gap-3" data-testid={`brain-scope-${slug}`}>
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
      <div className="flex items-center gap-2">
        <Button
          disabled={!dirty || save.isPending}
          onClick={() =>
            save.mutate(
              { slug, name, kind, connectAgentId, read: nextRead, write: nextWrite },
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
