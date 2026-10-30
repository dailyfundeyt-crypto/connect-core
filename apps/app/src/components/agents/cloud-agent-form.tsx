import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { CloudAgentTasksPanel } from "@/components/agents/cloud-agent-tasks";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { setAgentModelFamily } from "@/lib/agents/agent-models";
import {
  CLOUD_PROVIDERS,
  type CloudAgentConfigInput,
  type CloudProvider,
  type PublicCloudAgentConfig,
  cloudAgentConfigQueryOptions,
  cloudAgentKeys,
  saveCloudAgentConfig,
  setAgentRuntime,
  setCloudAgentKeys,
  testCloudAgent,
  testCloudAgentKeys,
} from "@/lib/agents/cloud-agent";
import { cn } from "@/lib/utils";

/**
 * Die Felder eines Cloud-Agents — im Anlege-Assistenten und in den Agent-Einstellungen dieselben.
 *
 * Key-Felder sind immer leer, auch wenn schon ein Key gespeichert ist: der Browser bekommt den Key
 * nie zurück. „Gespeichert – leer lassen zum Behalten“ steht dann als Platzhalter im Feld.
 */
export type CloudAgentDraft = Required<
  Pick<CloudAgentConfigInput, "provider">
> & {
  baseUrl: string;
  model: string;
  apiKey: string;
  webhookUrl: string;
  webhookKey: string;
};

export function emptyCloudDraft(
  provider: CloudProvider = "muse",
): CloudAgentDraft {
  const meta = CLOUD_PROVIDERS.find((p) => p.id === provider);
  return {
    provider,
    baseUrl: meta?.defaultBaseUrl ?? "",
    model: meta?.defaultModel ?? "",
    apiKey: "",
    webhookUrl: "",
    webhookKey: "",
  };
}

export function draftFromConfig(
  config: PublicCloudAgentConfig,
): CloudAgentDraft {
  return {
    provider: config.provider,
    baseUrl: config.baseUrl,
    model: config.model,
    apiKey: "",
    webhookUrl: "",
    webhookKey: "",
  };
}

/** Was vor dem Speichern fehlt, als Satz — oder null. `saved` = was der Server schon hat. */
export function cloudDraftIssue(
  draft: CloudAgentDraft,
  saved?: PublicCloudAgentConfig | null,
): string | null {
  const same = saved?.provider === draft.provider;
  const hasKey = Boolean(draft.apiKey.trim()) || (same && saved?.hasKey);
  if (draft.provider === "openai") {
    if (!draft.baseUrl.trim()) return "Basis-URL fehlt";
    if (!draft.model.trim()) return "Modell fehlt";
    return null;
  }
  if (!hasKey) return "Inbox-Key fehlt";
  if (draft.provider === "grok-webhook") {
    if (!draft.webhookUrl.trim() && !(same && saved?.hasWebhookUrl))
      return "Webhook-URL fehlt";
    if (!draft.webhookKey.trim() && !(same && saved?.hasWebhookKey))
      return "Webhook-Key fehlt";
  }
  return null;
}

export function CloudAgentFields({
  draft,
  onChange,
  saved,
  error,
}: {
  draft: CloudAgentDraft;
  onChange: (next: CloudAgentDraft) => void;
  saved?: PublicCloudAgentConfig | null;
  error?: string | null;
}) {
  const same = saved?.provider === draft.provider;
  const set = <K extends keyof CloudAgentDraft>(
    key: K,
    value: CloudAgentDraft[K],
  ) => onChange({ ...draft, [key]: value });
  const keptPlaceholder = "gespeichert – leer lassen zum Behalten";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2" role="radiogroup">
        {CLOUD_PROVIDERS.map((p) => {
          const selected = p.id === draft.provider;
          return (
            <button
              aria-checked={selected}
              className={cn(
                "rounded-xl border px-3 py-2.5 text-left transition-colors",
                selected
                  ? "border-foreground bg-accent"
                  : "border-border hover:bg-muted/60",
              )}
              key={p.id}
              onClick={() =>
                onChange(
                  saved?.provider === p.id
                    ? draftFromConfig(saved)
                    : emptyCloudDraft(p.id),
                )
              }
              role="radio"
              type="button"
            >
              <p className="text-sm font-medium">{p.label}</p>
              <p className="text-xs text-muted-foreground">{p.hint}</p>
            </button>
          );
        })}
      </div>

      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="cloud-base-url">Basis-URL</FieldLabel>
          <Input
            autoComplete="off"
            id="cloud-base-url"
            onChange={(e) => set("baseUrl", e.target.value)}
            placeholder={
              draft.provider === "openai"
                ? "https://api.example.com/v1"
                : "https://prototyping-muse.vercel.app/v1"
            }
            spellCheck={false}
            value={draft.baseUrl}
          />
        </Field>
        {draft.provider === "openai" ? (
          <Field>
            <FieldLabel htmlFor="cloud-model">Modell</FieldLabel>
            <Input
              autoComplete="off"
              id="cloud-model"
              onChange={(e) => set("model", e.target.value)}
              placeholder="z. B. manus-1.5"
              spellCheck={false}
              value={draft.model}
            />
          </Field>
        ) : null}
        <Field>
          <FieldLabel htmlFor="cloud-api-key">
            {draft.provider === "openai" ? "API-Key (optional)" : "Inbox-Key"}
          </FieldLabel>
          <Input
            autoComplete="new-password"
            id="cloud-api-key"
            onChange={(e) => set("apiKey", e.target.value)}
            placeholder={same && saved?.hasKey ? keptPlaceholder : "Bearer-Key"}
            spellCheck={false}
            type="password"
            value={draft.apiKey}
          />
          <FieldDescription>
            Wird verschlüsselt auf dem Connect-Server gespeichert und nie wieder
            angezeigt.
          </FieldDescription>
        </Field>
        {draft.provider === "grok-webhook" ? (
          <>
            <Field>
              <FieldLabel htmlFor="cloud-webhook-url">Webhook-URL</FieldLabel>
              <Input
                autoComplete="off"
                id="cloud-webhook-url"
                onChange={(e) => set("webhookUrl", e.target.value)}
                placeholder={
                  same && saved?.hasWebhookUrl
                    ? `${saved.webhookHost ?? "gespeichert"} – leer lassen zum Behalten`
                    : "https://…"
                }
                spellCheck={false}
                type="password"
                value={draft.webhookUrl}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="cloud-webhook-key">Webhook-Key</FieldLabel>
              <Input
                autoComplete="new-password"
                id="cloud-webhook-key"
                onChange={(e) => set("webhookKey", e.target.value)}
                placeholder={
                  same && saved?.hasWebhookKey ? keptPlaceholder : "Webhook-Key"
                }
                spellCheck={false}
                type="password"
                value={draft.webhookKey}
              />
            </Field>
          </>
        ) : null}
      </FieldGroup>
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Der Tab „Token“: hier kommen die beiden Schlüssel eines Cloud-Agenten hinein.
 *
 * Der Browser kennt die Schlüssel nur als Maske. Beim Setzen wird der Wert einmal an den Server
 * geschickt und dort verschlüsselt abgelegt; danach ist das Feld wieder leer.
 */
function CloudAgentTokenTab({ agentId }: { agentId: string }) {
  const queryClient = useQueryClient();
  const config = useQuery(cloudAgentConfigQueryOptions(agentId));
  const saved = config.data?.config ?? null;
  const [inboxKey, setInboxKey] = useState("");
  const [ownerKey, setOwnerKey] = useState("");
  const [agentName, setAgentName] = useState(saved?.inboxAgentName ?? "");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<"save" | "test" | null>(null);

  const savedVersion = saved ? `${saved.updatedAt}:${saved.hasOwnerKey}` : "";
  // biome-ignore lint/correctness/useExhaustiveDependencies: keyed on the saved version on purpose
  useEffect(() => {
    if (saved) setAgentName(saved.inboxAgentName);
  }, [savedVersion]);

  if (config.isPending) return <p className="text-sm text-muted-foreground">Lädt …</p>;

  const save = async () => {
    setBusy("save");
    setError(null);
    setNotice(null);
    try {
      if (inboxKey.trim() || ownerKey.trim()) {
        await setCloudAgentKeys(agentId, {
          inboxKey: inboxKey.trim() || undefined,
          ownerKey: ownerKey.trim() || undefined,
        });
      }
      if (agentName.trim() && agentName.trim() !== saved?.inboxAgentName) {
        /*
         * Nur der Name ändert sich. Basis-URL und Modell werden mitgeschickt, weil der Server
         * die Konfiguration vollständig ersetzt — sonst stünde dort gleich wieder der Standard.
         */
        await saveCloudAgentConfig(agentId, {
          provider: saved?.provider ?? "muse",
          baseUrl: saved?.baseUrl ?? "",
          model: saved?.model ?? "",
          inboxAgentName: agentName.trim(),
        } as CloudAgentConfigInput);
      }
      setInboxKey("");
      setOwnerKey("");
      await queryClient.invalidateQueries({ queryKey: cloudAgentKeys.all });
      setNotice("Gespeichert.");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  const test = async () => {
    setBusy("test");
    setError(null);
    setNotice(null);
    try {
      const result = await testCloudAgentKeys(agentId);
      if (result.ok) setNotice(result.message);
      else setError(result.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs leading-snug text-muted-foreground">
        Keys gibt nur Stefan hier ein. Sie werden verschlüsselt gespeichert und nie angezeigt.
      </p>

      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="cloud-token-inbox">Inbox-Key</FieldLabel>
          <Input
            autoComplete="new-password"
            data-testid="cloud-token-inbox-key"
            id="cloud-token-inbox"
            onChange={(e) => setInboxKey(e.target.value)}
            placeholder={
              saved?.hasKey ? `${saved.apiKeyMask} – leer lassen zum Behalten` : "Bearer-Key"
            }
            spellCheck={false}
            type="password"
            value={inboxKey}
          />
          <FieldDescription>
            {saved?.hasKey
              ? `Gespeichert (${saved.apiKeyMask}).`
              : "Noch nicht gespeichert — ohne diesen Key kommen keine Nachrichten an."}
          </FieldDescription>
        </Field>

        <Field>
          <FieldLabel htmlFor="cloud-token-owner">Owner-Key</FieldLabel>
          <Input
            autoComplete="new-password"
            data-testid="cloud-token-owner-key"
            id="cloud-token-owner"
            onChange={(e) => setOwnerKey(e.target.value)}
            placeholder={
              saved?.hasOwnerKey
                ? `${saved.ownerKeyMask} – leer lassen zum Behalten`
                : "Owner-Key"
            }
            spellCheck={false}
            type="password"
            value={ownerKey}
          />
          <FieldDescription>
            {saved?.hasOwnerKey
              ? `Gespeichert (${saved.ownerKeyMask}).`
              : "Fehlt – die Ja/Nein-Knöpfe bleiben gesperrt."}
          </FieldDescription>
        </Field>

        <Field>
          <FieldLabel htmlFor="cloud-token-agent-name">Inbox-Agent-Name</FieldLabel>
          <Input
            autoComplete="off"
            id="cloud-token-agent-name"
            onChange={(e) => setAgentName(e.target.value)}
            spellCheck={false}
            value={agentName}
          />
          <FieldDescription>
            Unter diesem Namen erscheinen die Nachrichten in der Muse-Inbox.
          </FieldDescription>
        </Field>
      </FieldGroup>

      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="text-sm text-muted-foreground" role="status">
          {notice}
        </p>
      ) : null}

      <div className="flex gap-2">
        <Button disabled={busy !== null} onClick={() => void save()} size="sm">
          {busy === "save" ? "Speichert …" : "Setzen"}
        </Button>
        <Button
          disabled={busy !== null || !saved?.hasKey}
          onClick={() => void test()}
          size="sm"
          variant="outline"
        >
          {busy === "test" ? "Teste …" : "Testen"}
        </Button>
      </div>
    </div>
  );
}

/**
 * Einstellungen → „Cloud-Agent“, mit drei Reitern: „Verbindung“ (Anbieter und Keys), „Token“
 * (Inbox-Key, Owner-Key, Inbox-Agent-Name) und „Geplante Aufgaben“ (Prompts, die der Server zu
 * festen Zeiten schickt).
 */
export function CloudAgentSettings({ agentId }: { agentId: string }) {
  const [tab, setTab] = useState<"connection" | "token" | "tasks">("connection");
  const tabs = [
    { id: "connection", label: "Verbindung" },
    { id: "token", label: "Token" },
    { id: "tasks", label: "Geplante Aufgaben" },
  ] as const;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-1 border-b border-border" role="tablist">
        {tabs.map((t) => (
          <button
            aria-selected={tab === t.id}
            className={cn(
              "-mb-px border-b-2 px-2.5 py-1.5 text-sm transition-colors",
              tab === t.id
                ? "border-foreground text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
            key={t.id}
            onClick={() => setTab(t.id)}
            role="tab"
            type="button"
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === "connection" ? (
        <CloudAgentConnectionSettings agentId={agentId} />
      ) : tab === "token" ? (
        <CloudAgentTokenTab agentId={agentId} />
      ) : (
        <CloudAgentTasksTab agentId={agentId} />
      )}
    </div>
  );
}

function CloudAgentTasksTab({ agentId }: { agentId: string }) {
  const config = useQuery(cloudAgentConfigQueryOptions(agentId));
  if (config.isPending) return <p className="text-sm text-muted-foreground">Lädt …</p>;
  if (!config.data?.config) {
    return (
      <p className="text-sm text-muted-foreground">
        Erst unter „Verbindung“ einen Anbieter einrichten – dann lassen sich Aufgaben planen.
      </p>
    );
  }
  return <CloudAgentTasksPanel agentId={agentId} />;
}

/** Bestehenden Agent als Cloud-Agent einrichten oder ändern. */
export function CloudAgentConnectionSettings({ agentId }: { agentId: string }) {
  const queryClient = useQueryClient();
  const config = useQuery(cloudAgentConfigQueryOptions(agentId));
  const saved = config.data?.config ?? null;
  const [draft, setDraft] = useState<CloudAgentDraft>(() => emptyCloudDraft());
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<"save" | "test" | "cli" | null>(null);

  // Nur wenn sich der gespeicherte Stand ändert — ein Refetch darf getippte Werte nicht löschen.
  const savedVersion = saved ? `${saved.provider}:${saved.updatedAt}` : "";
  // biome-ignore lint/correctness/useExhaustiveDependencies: keyed on the saved version on purpose
  useEffect(() => {
    if (saved) setDraft(draftFromConfig(saved));
  }, [savedVersion]);

  if (config.isPending) {
    return <p className="text-sm text-muted-foreground">Lädt …</p>;
  }
  if (config.error) {
    return (
      <p className="text-sm text-destructive" role="alert">
        {config.error.message}
      </p>
    );
  }

  const save = async () => {
    const issue = cloudDraftIssue(draft, saved);
    if (issue) {
      setError(issue);
      return;
    }
    setBusy("save");
    setError(null);
    setNotice(null);
    try {
      await saveCloudAgentConfig(agentId, draft);
      setAgentModelFamily(agentId, "cloud", { syncCli: false, resetModel: true });
      await queryClient.invalidateQueries({ queryKey: cloudAgentKeys.all });
      setDraft((d) => ({ ...d, apiKey: "", webhookUrl: "", webhookKey: "" }));
      setNotice("Gespeichert.");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  /* Der Rückweg: Cloud ist eine Zusage, kein Verlies. Die Verbindung bleibt für später liegen. */
  const useAsCli = async () => {
    setBusy("cli");
    setError(null);
    setNotice(null);
    try {
      await setAgentRuntime(agentId, "cli");
      setAgentModelFamily(agentId, "connect", { syncCli: false, resetModel: true });
      await queryClient.invalidateQueries({ queryKey: cloudAgentKeys.all });
      setNotice("Dieser Agent läuft wieder als CLI-Agent. Die Verbindung bleibt gespeichert.");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  const test = async () => {
    setBusy("test");
    setError(null);
    setNotice(null);
    try {
      const result = await testCloudAgent(agentId);
      if (result.ok) setNotice(result.message);
      else setError(result.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs leading-snug text-muted-foreground">
        {saved
          ? "Dieser Agent läuft als Cloud-Agent. Nachrichten gehen an den Anbieter; Antworten erscheinen im Chat, sobald sie da sind."
          : "Noch kein Cloud-Agent. Anbieter wählen, Werte eintragen, speichern."}
        {config.data && !config.data.canStoreKeys
          ? " Achtung: Dieser Server hat keinen KEY_ENCRYPTION_KEY und kann keine Keys speichern."
          : ""}
      </p>
      <CloudAgentFields
        draft={draft}
        error={error}
        onChange={(next) => {
          setDraft(next);
          setError(null);
          setNotice(null);
        }}
        saved={saved}
      />
      {notice ? (
        <p className="text-sm text-muted-foreground" role="status">
          {notice}
        </p>
      ) : null}
      <div className="flex gap-2">
        <Button disabled={busy !== null} onClick={() => void save()} size="sm">
          {busy === "save" ? "Speichert …" : "Speichern"}
        </Button>
        <Button
          disabled={busy !== null || !saved}
          onClick={() => void test()}
          size="sm"
          variant="outline"
        >
          {busy === "test" ? "Teste …" : "Verbindung testen"}
        </Button>
        {config.data?.runtime === "cloud" ? (
          <Button
            disabled={busy !== null}
            onClick={() => void useAsCli()}
            size="sm"
            variant="ghost"
          >
            {busy === "cli" ? "Stelle um …" : "Als CLI-Agent verwenden"}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
