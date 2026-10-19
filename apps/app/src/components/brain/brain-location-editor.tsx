import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { IconBrain, IconFolder, IconFolderOpen } from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  brainLocationQueryOptions,
  saveBrainLocationMutationOptions,
} from "@/lib/brain/queries";

/**
 * Picks the folder the Brain and the vault are read from.
 *
 * The Brain is a folder on this PC, so the choice is a plain path with no upload
 * and nothing to browse remotely: type it, or paste it from the Explorer address
 * bar. A server-side folder browser was considered and rejected — it would mean
 * walking the disk from a web page to draw a picker, which is a lot of surface
 * for something the OS already does.
 *
 * The input is validated by the server against the real filesystem, so a typo
 * comes back as "Ordner nicht gefunden" rather than silently pointing the Brain
 * at nothing.
 */
export function BrainLocationEditor() {
  const queryClient = useQueryClient();
  const location = useQuery(brainLocationQueryOptions());
  const save = useMutation(saveBrainLocationMutationOptions(queryClient));

  const [path, setPath] = useState("");
  const [vaultPath, setVaultPath] = useState("");
  const [touched, setTouched] = useState(false);

  /*
   * Fill the fields from the server, but only while the person has not started
   * typing. Overwriting a half-typed path on every refetch would delete whatever
   * was in the box the moment a background query settled.
   */
  useEffect(() => {
    if (touched) return;
    setPath(location.data?.brainPath ?? "");
    setVaultPath(location.data?.vaultPath ?? "");
  }, [location.data, touched]);

  const submit = () => {
    setTouched(true);
    save.mutate({ path: path.trim(), vaultPath: vaultPath.trim() || null });
  };

  return (
    <section className="flex flex-col gap-3 rounded-xl border bg-muted/20 p-4">
      <div className="flex items-center gap-2">
        <IconBrain className="size-4" stroke={1.75} />
        <h3 className="text-sm font-medium">Speicherort</h3>
        {location.data?.source === "saved" ? (
          <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
            gespeichert
          </span>
        ) : location.data?.source === "env" ? (
          <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
            voreingestellt
          </span>
        ) : null}
      </div>

      <p className="text-xs text-muted-foreground">
        Der Ordner, in dem die Notizen liegen. Darf derselbe sein wie der
        Obsidian-Vault — dann liegen die Brain-Notizen einfach mitten im Vault.
      </p>

      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-medium">Brain-Ordner</span>
        <div className="flex flex-wrap gap-2">
          {/*
           * `w-full sm:w-auto` so the row wraps rather than squeezing the field on
           * a phone: the path is long and unreadable when it is only 100px wide,
           * and a wrapped button is easier to hit than a 26px one.
           */}
          <Input
            aria-label="Brain-Ordner"
            className="min-w-0 flex-1 text-[16px] sm:text-sm"
            onChange={(event) => {
              setTouched(true);
              setPath(event.target.value);
            }}
            placeholder="C:\Users\…\Documents\000_CNT\Plannung"
            spellCheck={false}
            value={path}
          />
          <Button
            className="h-11 w-full shrink-0 sm:h-7 sm:w-auto"
            disabled={!path.trim() || save.isPending}
            onClick={submit}
            size="sm"
            type="button"
          >
            {save.isPending ? "Speichert …" : "Speichern"}
          </Button>
        </div>
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-medium">
          Vault-Ordner{" "}
          <span className="font-normal text-muted-foreground">(optional)</span>
        </span>
        <Input
          aria-label="Vault-Ordner"
          className="min-w-0 flex-1 text-[16px] sm:text-sm"
          onChange={(event) => {
            setTouched(true);
            setVaultPath(event.target.value);
          }}
          placeholder="leer lassen, um nur den Brain zu verwenden"
          spellCheck={false}
          value={vaultPath}
        />
      </label>

      {/*
       * The error says what happened and what to do, in that order. The server's
       * message already names the path it tried, which is the useful half; the
       * fix is on this side because the user, not the app, has to choose a folder
       * that exists.
       */}
      {save.isError ? (
        <p className="text-xs text-destructive" role="alert">
          {save.error instanceof Error
            ? save.error.message
            : "Speichern fehlgeschlagen."}{" "}
          Bitte einen existierenden Ordner wählen.
        </p>
      ) : null}

      {save.isSuccess ? (
        <p className="text-xs text-muted-foreground" role="status">
          Gespeichert. Der neue Ordner wird sofort verwendet.
        </p>
      ) : null}

      <details className="text-xs text-muted-foreground">
        <summary className="cursor-pointer select-none">
          Was ist der Unterschied?
        </summary>
        <ul className="mt-1.5 list-disc space-y-1 pl-4">
          <li>
            <span className="inline-flex items-center gap-1 font-medium">
              <IconFolder className="size-3" stroke={1.75} /> Brain
            </span>
            : wird gelesen und geschrieben. Notizen landen dort als{" "}
            <code>.md</code>.
          </li>
          <li>
            <span className="inline-flex items-center gap-1 font-medium">
              <IconFolderOpen className="size-3" stroke={1.75} /> Vault
            </span>
            : nur lesen. Eigene Notizen tauchen in der Liste und im Graphen auf,
            bleiben aber unangetastet.
          </li>
        </ul>
      </details>
    </section>
  );
}