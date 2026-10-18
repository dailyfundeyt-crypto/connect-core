/**
 * Agent-Engine Panel (Stufe 2 Phase E+F).
 *
 * Erlaubt das Wechseln der Engine eines Agents:
 * - Keine Engine (lokales Modell)
 * - CLI-Engine (Antigravity / Codex / Claude mit Modell + allowWrite)
 * - Browser-Profile-Engine (Helium mit Start-URL + Allow-Write)
 *
 * Das PATCH-Endpoint nimmt die Felder entgegen, der profileStore
 * speichert sie in configuration.cli bzw. configuration.browserProfile.
 */

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { IconBrain, IconBrowser, IconCheck, IconX } from "@tabler/icons-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { agentQueryOptions } from "@/lib/agents/queries";
import { updateAgentMutationOptions } from "@/lib/agents/mutations";
import type { AgentProfile } from "@/lib/agents/queries";

type EngineKind = "none" | "cli" | "browser_profile";

const CLI_KINDS = ["antigravity", "codex", "claude"] as const;
type CliKind = (typeof CLI_KINDS)[number];

function deriveKind(profile: AgentProfile): EngineKind {
  if (!profile.engine) return "none";
  if (profile.engine.kind === "browser_profile") return "browser_profile";
  return "cli";
}

function buildEnginePatch(
  kind: EngineKind,
  cliKind: CliKind,
  cliModel: string,
  cliAllowWrite: boolean,
  browserUrl: string,
  browserAllowWrite: boolean,
): { cliEngine?: { kind: CliKind; model: string; allowWrite: boolean }; browserProfile?: { kind: "browser_profile"; startUrl: string; profileName: string; allowWrite: boolean } } {
  if (kind === "none") return {};
  if (kind === "cli") {
    return {
      cliEngine: {
        kind: cliKind,
        model: cliModel || "auto",
        allowWrite: cliAllowWrite,
      },
    };
  }
  return {
    browserProfile: {
      kind: "browser_profile" as const,
      startUrl: browserUrl,
      profileName: "",
      allowWrite: browserAllowWrite,
    },
  };
}

export function AgentEnginePanel({ agentId }: { agentId: string }) {
  const queryClient = useQueryClient();
  const agent = queryClient.getQueryData(agentQueryOptions(agentId).queryKey);
  const profile = agent as AgentProfile | undefined;

  const [kind, setKind] = useState<EngineKind>(() => (profile ? deriveKind(profile) : "none"));
  const [cliKind, setCliKind] = useState<CliKind>(
    (profile?.engine?.kind as CliKind | undefined) ?? "antigravity",
  );
  const [cliModel, setCliModel] = useState<string>(profile?.engine?.model ?? "auto");
  const [cliAllowWrite, setCliAllowWrite] = useState<boolean>(profile?.engine?.allowWrite ?? false);
  const [browserUrl, setBrowserUrl] = useState<string>(profile?.engine?.startUrl ?? "");
  const [browserAllowWrite, setBrowserAllowWrite] = useState<boolean>(profile?.engine?.allowWrite ?? false);
  const [lastSaved, setLastSaved] = useState<null | "ok" | "err">(null);

  const update = useMutation(updateAgentMutationOptions(queryClient));

  if (!profile) return null;

  const save = async () => {
    const patch = buildEnginePatch(kind, cliKind, cliModel, cliAllowWrite, browserUrl, browserAllowWrite);
    try {
      await update.mutateAsync({ agentId, input: { ...patch, name: profile.name, title: profile.title, roleDescription: profile.roleDescription, visibility: "private" } });
      setLastSaved("ok");
      setTimeout(() => setLastSaved(null), 2000);
    } catch {
      setLastSaved("err");
      setTimeout(() => setLastSaved(null), 2000);
    }
  };

  return (
    <section className="grid gap-3 rounded-xl border border-border bg-card/40 p-4">
      <header className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-medium">Engine</h3>
        {lastSaved === "ok" && (
          <span className="flex items-center gap-1 text-[10px] text-green-600">
            <IconCheck className="size-3" /> gespeichert
          </span>
        )}
        {lastSaved === "err" && (
          <span className="flex items-center gap-1 text-[10px] text-destructive">
            <IconX className="size-3" /> fehlgeschlagen
          </span>
        )}
      </header>

      <div className="grid grid-cols-3 gap-1.5">
        <button
          className={`flex flex-col items-center gap-1 rounded-lg border p-2 text-[11px] font-medium transition ${
            kind === "none"
              ? "border-primary bg-primary/10 text-foreground"
              : "border-border bg-muted/30 text-muted-foreground hover:text-foreground"
          }`}
          onClick={() => setKind("none")}
          type="button"
        >
          <IconBrain className="size-4" />
          Lokal
        </button>
        <button
          className={`flex flex-col items-center gap-1 rounded-lg border p-2 text-[11px] font-medium transition ${
            kind === "cli"
              ? "border-primary bg-primary/10 text-foreground"
              : "border-border bg-muted/30 text-muted-foreground hover:text-foreground"
          }`}
          onClick={() => setKind("cli")}
          type="button"
        >
          <IconBrain className="size-4" />
          CLI
        </button>
        <button
          className={`flex flex-col items-center gap-1 rounded-lg border p-2 text-[11px] font-medium transition ${
            kind === "browser_profile"
              ? "border-primary bg-primary/10 text-foreground"
              : "border-border bg-muted/30 text-muted-foreground hover:text-foreground"
          }`}
          onClick={() => setKind("browser_profile")}
          type="button"
        >
          <IconBrowser className="size-4" />
          Browser
        </button>
      </div>

      {kind === "cli" && (
        <div className="grid gap-2">
          <select
            className="h-8 rounded-md border border-border bg-background px-2 text-xs"
            onChange={(e) => setCliKind(e.target.value as CliKind)}
            value={cliKind}
          >
            {CLI_KINDS.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
          <Input
            onChange={(e) => setCliModel(e.target.value)}
            placeholder="Modell (z.B. auto, gemini-3.8-flash, gpt-5)"
            value={cliModel}
          />
          <label className="flex items-center gap-2 text-xs">
            <Switch
              checked={cliAllowWrite}
              onCheckedChange={setCliAllowWrite}
            />
            Dateien schreiben erlauben
          </label>
        </div>
      )}

      {kind === "browser_profile" && (
        <div className="grid gap-2">
          <Input
            onChange={(e) => setBrowserUrl(e.target.value)}
            placeholder="Start-URL (z.B. https://github.com)"
            value={browserUrl}
          />
          <label className="flex items-center gap-2 text-xs">
            <Switch
              checked={browserAllowWrite}
              onCheckedChange={setBrowserAllowWrite}
            />
            Schreiben erlauben (Formulare ausfüllen)
          </label>
        </div>
      )}

      {kind !== "none" && (
        <Button
          disabled={update.isPending}
          onClick={() => void save()}
          size="sm"
          type="button"
        >
          {update.isPending ? "Speichert…" : "Engine speichern"}
        </Button>
      )}

      {kind === "none" && (
        <Button
          disabled={update.isPending}
          onClick={() => {
            setKind("none");
            void save();
          }}
          size="sm"
          type="button"
          variant="outline"
        >
          Engine entfernen
        </Button>
      )}

      {kind === "none" && (
        <p className="text-[10px] text-muted-foreground">
          Aktuell: Lokales Modell (kein Engine-Wechsel).
        </p>
      )}
    </section>
  );
}
