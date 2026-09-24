import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "@/components/ui/item";
import { PageRows, PageSection } from "@/components/layout/page-shell";
import {
  getAgentManusApiKey,
  maskApiKey,
} from "@/lib/agents/agent-api-keys";
import {
  getGlobalApiKeys,
  seedGlobalManusFromEnv,
  setGlobalApiKey,
  clearGlobalApiKey,
  subscribeGlobalApiKeys,
} from "@/lib/agents/global-api-keys";
import {
  type ExternalPath,
  type ModelProviderKind,
  type ModelProviderPrefs,
  getModelProviderPrefs,
  PATH_HINTS,
  PATH_LABELS,
  PROVIDER_HINTS,
  PROVIDER_LABELS,
  setModelProviderPrefs,
  subscribeModelProvider,
} from "@/lib/agents/model-provider";
import { cn } from "@/lib/utils";

/**
 * Settings → Model Provider (Plan 047).
 * Model Two = Hermes | Model One = External (Terminal | API-Key).
 */
export function ModelProviderSettingsPanel() {
  const [prefs, setPrefs] = useState<ModelProviderPrefs>(() =>
    getModelProviderPrefs(),
  );
  const [hasManus, setHasManus] = useState(false);
  const [manusDraft, setManusDraft] = useState("");
  const [statusNote, setStatusNote] = useState<string | null>(null);

  useEffect(() => {
    seedGlobalManusFromEnv();
    const refresh = () => {
      setPrefs(getModelProviderPrefs());
      setHasManus(Boolean(getGlobalApiKeys().manus.trim()));
    };
    refresh();
    const offP = subscribeModelProvider(refresh);
    const offK = subscribeGlobalApiKeys(refresh);
    void fetchProviderStatus().then((s) => {
      if (s) setHasManus(s.hasManusKey);
    });
    return () => {
      offP();
      offK();
    };
  }, []);

  const pickProvider = (provider: ModelProviderKind) => {
    setPrefs(setModelProviderPrefs({ provider }));
  };

  const pickPath = (externalPath: ExternalPath) => {
    setPrefs(setModelProviderPrefs({ externalPath }));
  };

  return (
    <PageSection title="Model Provider">
      <PageRows>
        <Item size="sm">
          <ItemContent>
            <ItemTitle>Model One / Model Two</ItemTitle>
            <ItemDescription>
              Chat + Datei-Upload sind die einzige Oberfläche. Agent-Terminal,
              Sandbox und Browser-Use laufen unsichtbar im Hintergrund.
            </ItemDescription>
          </ItemContent>
        </Item>

        <div className="flex flex-col gap-2 px-1 sm:flex-row">
          {(["external", "hermes"] as const).map((kind) => {
            const active = prefs.provider === kind;
            return (
              <button
                className={cn(
                  "flex-1 rounded-xl border px-3 py-2.5 text-left transition",
                  active
                    ? "border-foreground bg-accent"
                    : "border-border hover:bg-muted/60",
                )}
                key={kind}
                onClick={() => pickProvider(kind)}
                type="button"
              >
                <p className="text-sm font-medium">{PROVIDER_LABELS[kind]}</p>
                <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
                  {PROVIDER_HINTS[kind]}
                </p>
              </button>
            );
          })}
        </div>

        {prefs.provider === "external" ? (
          <>
            <Item size="sm" variant="muted">
              <ItemContent>
                <ItemTitle>External-Pfad</ItemTitle>
                <ItemDescription>
                  Terminal = unsichtbares CLI (Codex Sandboxen / ZGPT). API-Key =
                  HTTP; Manus-Cloud nur mit Key.
                </ItemDescription>
              </ItemContent>
            </Item>
            <div className="flex flex-col gap-2 px-1 sm:flex-row">
              {(["api_key", "terminal"] as const).map((path) => {
                const active = prefs.externalPath === path;
                return (
                  <button
                    className={cn(
                      "flex-1 rounded-xl border px-3 py-2.5 text-left transition",
                      active
                        ? "border-foreground bg-accent"
                        : "border-border hover:bg-muted/60",
                    )}
                    key={path}
                    onClick={() => pickPath(path)}
                    type="button"
                  >
                    <p className="text-sm font-medium">{PATH_LABELS[path]}</p>
                    <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
                      {PATH_HINTS[path]}
                    </p>
                  </button>
                );
              })}
            </div>

            {prefs.externalPath === "api_key" ? (
              <Item size="sm" variant="muted">
                <ItemContent className="gap-2">
                  <ItemTitle>Manus API-Key (Model One)</ItemTitle>
                  <ItemDescription>
                    Ohne Key: keine Manus-Cloud-Features (task.create, Mail
                    Manus). Mit Key: voller Manus-Agent hinter dem Chat.
                  </ItemDescription>
                  {hasManus ? (
                    <p className="font-mono text-[11px] text-muted-foreground">
                      Gespeichert: {maskApiKey(getGlobalApiKeys().manus)}
                    </p>
                  ) : (
                    <p className="text-[11px] text-amber-700 dark:text-amber-300">
                      Noch kein Manus-Key — Manus-Buttons bleiben deaktiviert.
                    </p>
                  )}
                  <div className="flex gap-2">
                    <Input
                      aria-label="Manus API key"
                      autoComplete="off"
                      className="h-8 font-mono text-xs"
                      onChange={(e) => setManusDraft(e.target.value)}
                      placeholder="sk-… Manus Open API"
                      spellCheck={false}
                      type="password"
                      value={manusDraft}
                    />
                    <Button
                      disabled={!manusDraft.trim()}
                      onClick={() => {
                        setGlobalApiKey("manus", manusDraft);
                        setManusDraft("");
                        setHasManus(true);
                        setStatusNote("Manus-API-Key gespeichert.");
                      }}
                      size="sm"
                      type="button"
                    >
                      Speichern
                    </Button>
                  </div>
                </ItemContent>
                {hasManus ? (
                  <ItemActions>
                    <Button
                      onClick={() => {
                        clearGlobalApiKey("manus");
                        setHasManus(false);
                        setStatusNote("Manus-Key entfernt.");
                      }}
                      size="sm"
                      type="button"
                      variant="ghost"
                    >
                      Entfernen
                    </Button>
                  </ItemActions>
                ) : null}
              </Item>
            ) : (
              <Item size="sm" variant="muted">
                <ItemContent>
                  <ItemTitle>Terminal (unsichtbar)</ItemTitle>
                  <ItemDescription>
                    Chat sendet an Codex/ZGPT-CLI im Hintergrund
                    (`/api/cli-bridge`, optional{" "}
                    <code className="text-[10px]">
                      Desktop\Codex Sandboxen\Invoke-Codex.ps1
                    </code>
                    ). Kein sichtbares PowerShell-/Agent-Fenster.
                  </ItemDescription>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {(
                      [
                        ["chatgpt", "ZGPT / ChatGPT"],
                        ["codex", "Codex"],
                        ["manus-cli", "Manus (via Key)"],
                      ] as const
                    ).map(([id, label]) => (
                      <button
                        className={cn(
                          "rounded-full border px-2.5 py-1 text-[11px]",
                          prefs.terminalFlavor === id
                            ? "border-foreground bg-accent font-medium"
                            : "border-border text-muted-foreground hover:bg-muted/60",
                        )}
                        key={id}
                        onClick={() =>
                          setPrefs(
                            setModelProviderPrefs({
                              terminalFlavor: id,
                            }),
                          )
                        }
                        type="button"
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </ItemContent>
              </Item>
            )}
          </>
        ) : (
          <Item size="sm" variant="muted">
            <ItemContent>
              <ItemTitle>Hermes (Model Two)</ItemTitle>
              <ItemDescription>
                Connect AG-UI / lokaler Hermes-Prozess. Dieselbe Chat-UI —
                Router sendet an Hermes statt External.
              </ItemDescription>
            </ItemContent>
          </Item>
        )}

        {statusNote ? (
          <p className="px-1 text-[11px] text-muted-foreground" role="status">
            {statusNote}
          </p>
        ) : null}

        <ProviderStatusLine
          hasManus={hasManus}
          prefs={prefs}
          onRefresh={(s) => {
            if (s) setHasManus(s.hasManusKey);
          }}
        />
      </PageRows>
    </PageSection>
  );
}

type ProviderStatus = {
  provider: string;
  externalPath?: string;
  hasManusKey: boolean;
  hasCodexBridge: boolean;
  manusFeaturesEnabled: boolean;
};

async function fetchProviderStatus(): Promise<ProviderStatus | null> {
  try {
    const res = await fetch("/api/connect/provider-status", {
      credentials: "include",
    });
    if (!res.ok) return null;
    return (await res.json()) as ProviderStatus;
  } catch {
    return null;
  }
}

function ProviderStatusLine({
  prefs,
  hasManus,
  onRefresh,
}: {
  prefs: ModelProviderPrefs;
  hasManus: boolean;
  onRefresh: (s: ProviderStatus | null) => void;
}) {
  const [remote, setRemote] = useState<ProviderStatus | null>(null);

  useEffect(() => {
    void fetchProviderStatus().then((s) => {
      setRemote(s);
      onRefresh(s);
    });
  }, [prefs.provider, prefs.externalPath, hasManus, onRefresh]);

  const manusOn =
    remote?.manusFeaturesEnabled ??
    (prefs.provider === "external" &&
      prefs.externalPath === "api_key" &&
      hasManus);

  return (
    <Item size="sm" variant="muted">
      <ItemContent>
        <ItemTitle className="text-xs">Status (ohne Secrets)</ItemTitle>
        <ItemDescription>
          Provider: {PROVIDER_LABELS[prefs.provider]}
          {prefs.provider === "external"
            ? ` · ${PATH_LABELS[prefs.externalPath]}`
            : ""}
          {" · "}
          Manus-Key: {hasManus || remote?.hasManusKey ? "ja" : "nein"}
          {" · "}
          Manus-Features: {manusOn ? "aktiv" : "aus"}
          {remote
            ? ` · Codex-Bridge: ${remote.hasCodexBridge ? "ok" : "offen"}`
            : ""}
        </ItemDescription>
      </ItemContent>
    </Item>
  );
}

/** @deprecated unused helper kept for agent dialogs */
export function agentHasManusKey(agentId: string): boolean {
  return Boolean(getAgentManusApiKey(agentId));
}
