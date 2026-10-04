import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { IconCircleCheck, IconCircleX, IconLoader2 } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  agentHubAgentQuery,
  invalidateAgentHub,
  type ModelProvider,
  ollamaModelsQuery,
  saveAgentModel,
  testAgentModel,
} from "@/lib/agent-hub/api";

const PROVIDERS: { id: ModelProvider; label: string; hint: string }[] = [
  { id: "default", label: "Standard (globale Einstellung)", hint: "Nutzt das Modell aus Einstellungen → Modelle." },
  { id: "openai", label: "OpenAI", hint: "Ohne eigenen Key wird der globale OpenAI-Key genutzt." },
  { id: "anthropic", label: "Anthropic", hint: "Ohne eigenen Key wird der globale Anthropic-Key genutzt." },
  { id: "ollama-local", label: "Ollama lokal", hint: "Läuft auf diesem PC über http://127.0.0.1:11434 – kein Key nötig." },
  { id: "ollama-cloud", label: "Ollama Cloud", hint: "Eigener Key pro Agent – erstellen unter ollama.com/settings/keys." },
  { id: "openai-compatible", label: "OpenAI-kompatibel", hint: "Beliebiger Anbieter mit /v1/chat/completions (LM Studio, vLLM, OpenRouter …)." },
];

const SUGGESTIONS: Partial<Record<ModelProvider, string[]>> = {
  openai: ["gpt-4.1-mini", "gpt-4.1", "gpt-5-mini", "gpt-5"],
  anthropic: ["claude-sonnet-4-5", "claude-haiku-4-5", "claude-opus-4-1"],
  "ollama-cloud": ["gpt-oss:120b", "gpt-oss:20b", "qwen3-coder:480b", "deepseek-v3.1:671b", "kimi-k2:1t", "glm-4.6"],
};

const DEFAULT_URLS: Partial<Record<ModelProvider, string>> = {
  "ollama-local": "http://127.0.0.1:11434/v1",
  "ollama-cloud": "https://ollama.com/v1",
  "openai-compatible": "http://127.0.0.1:1234/v1",
};

/** Agent → Einstellungen → Modell: eigenes Modell pro eingebautem Agent. */
export function AgentModelPanel({ agentId }: { agentId: string }) {
  const queryClient = useQueryClient();
  const agent = useQuery(agentHubAgentQuery(agentId));
  const [provider, setProvider] = useState<ModelProvider>("default");
  const [model, setModel] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const ollama = useQuery({ ...ollamaModelsQuery(), enabled: provider === "ollama-local" });

  useEffect(() => {
    const current = agent.data?.model;
    if (!current) return;
    setProvider(current.provider);
    setModel(current.model);
    setBaseUrl(current.baseUrl ?? "");
  }, [agent.data?.model]);

  const save = useMutation({
    mutationFn: () =>
      saveAgentModel(agentId, {
        provider,
        model,
        ...(baseUrl.trim() ? { baseUrl: baseUrl.trim() } : {}),
        ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
      }),
    onSuccess: async () => {
      setApiKey("");
      await invalidateAgentHub(queryClient);
    },
  });
  const test = useMutation({ mutationFn: () => testAgentModel(agentId) });

  const info = PROVIDERS.find((entry) => entry.id === provider);
  const needsKey = provider === "openai" || provider === "anthropic" || provider === "ollama-cloud" || provider === "openai-compatible";
  const current = agent.data?.model;
  const keyStored = current?.hasKey && current.provider === provider;
  const dirty = !current || current.provider !== provider || current.model !== model || (current.baseUrl ?? "") !== baseUrl || apiKey.trim() !== "";

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h3 className="font-semibold text-[15px]">Modell</h3>
        <p className="mt-0.5 text-[13px] text-muted-foreground">
          Welches Sprachmodell dieser Agent nutzt. Gilt nur für ihn – andere Agents behalten ihr eigenes Modell.
        </p>
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="font-medium text-[13px]">Anbieter</span>
        <select
          value={provider}
          onChange={(event) => {
            const next = event.target.value as ModelProvider;
            setProvider(next);
            setBaseUrl("");
            if (next !== current?.provider) setModel(next === "ollama-local" ? (ollama.data?.models[0]?.name ?? "qwen3:8b") : (SUGGESTIONS[next]?.[0] ?? ""));
            else setModel(current?.model ?? "");
          }}
          className="h-9 rounded-lg border border-input bg-background px-2.5 text-sm"
          data-testid="agent-model-provider"
        >
          {PROVIDERS.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.label}
            </option>
          ))}
        </select>
        {info ? <span className="text-[12px] text-muted-foreground">{info.hint}</span> : null}
      </label>

      {provider !== "default" ? (
        <>
          <label className="flex flex-col gap-1.5">
            <span className="font-medium text-[13px]">Modellname</span>
            <Input list={`agent-model-suggestions-${agentId}`} value={model} onChange={(event) => setModel(event.target.value)} placeholder="z. B. qwen3:8b" data-testid="agent-model-name" />
            <datalist id={`agent-model-suggestions-${agentId}`}>
              {(provider === "ollama-local" ? (ollama.data?.models.map((entry) => entry.name) ?? []) : (SUGGESTIONS[provider] ?? [])).map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
            {provider === "ollama-local" ? (
              ollama.data && !ollama.data.running ? (
                <span className="text-[12px] text-destructive">Ollama läuft gerade nicht auf diesem PC.</span>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {(ollama.data?.models ?? []).map((entry) => (
                    <button
                      key={entry.name}
                      type="button"
                      onClick={() => setModel(entry.name)}
                      className={`rounded-full border px-2.5 py-0.5 text-[12px] transition-colors ${model === entry.name || `${model}:latest` === entry.name ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:bg-muted"}`}
                    >
                      {entry.name}
                      {entry.parameters ? ` · ${entry.parameters}` : ""}
                    </button>
                  ))}
                </div>
              )
            ) : null}
          </label>

          {provider !== "openai" && provider !== "anthropic" ? (
            <label className="flex flex-col gap-1.5">
              <span className="font-medium text-[13px]">Adresse (Base-URL)</span>
              <Input value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} placeholder={DEFAULT_URLS[provider] ?? ""} />
              <span className="text-[12px] text-muted-foreground">Leer lassen für {DEFAULT_URLS[provider] ?? "die Standardadresse"}.</span>
            </label>
          ) : null}

          {needsKey ? (
            <label className="flex flex-col gap-1.5">
              <span className="font-medium text-[13px]">API-Key {provider === "ollama-cloud" ? "(Pflicht)" : "(optional)"}</span>
              <Input
                type="password"
                autoComplete="off"
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
                placeholder={keyStored ? `Gespeichert: ••••${current?.keyHint ?? ""} – leer lassen, um ihn zu behalten` : "Key einfügen"}
                data-testid="agent-model-key"
              />
              <span className="text-[12px] text-muted-foreground">
                {provider === "ollama-cloud"
                  ? "Key von ollama.com/settings/keys. Ein Ollama-Konto pro Person – mehrere Keys in diesem Konto sind erlaubt. Free-Plan: 1 gleichzeitige Anfrage."
                  : "Wird verschlüsselt im Tresor von Connect gespeichert."}
              </span>
            </label>
          ) : null}
        </>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => save.mutate()} disabled={save.isPending || !dirty || (provider !== "default" && !model.trim())} data-testid="agent-model-save">
          {save.isPending ? <IconLoader2 className="animate-spin" /> : null} Speichern
        </Button>
        <Button variant="outline" onClick={() => test.mutate()} disabled={test.isPending || dirty}>
          {test.isPending ? <IconLoader2 className="animate-spin" /> : null} Testen
        </Button>
        {dirty && !save.isPending ? <span className="text-[12px] text-muted-foreground">Erst speichern, dann testen.</span> : null}
      </div>
      {save.isError ? <p className="text-destructive text-xs">{(save.error as Error).message}</p> : null}
      {save.isSuccess && !dirty ? <p className="text-[12px] text-emerald-600">Gespeichert. Gilt ab der nächsten Nachricht.</p> : null}
      {test.data ? (
        <p className={`flex items-start gap-1.5 text-[12.5px] ${test.data.ok ? "text-emerald-700" : "text-destructive"}`}>
          {test.data.ok ? <IconCircleCheck className="mt-0.5 size-4 shrink-0" /> : <IconCircleX className="mt-0.5 size-4 shrink-0" />}
          <span>
            {test.data.ok ? `Antwort: „${test.data.text || "(leer)"}“${test.data.ms ? ` · ${(test.data.ms / 1000).toFixed(1)} s` : ""}` : test.data.error}
          </span>
        </p>
      ) : null}
      {test.isError ? <p className="text-destructive text-xs">{(test.error as Error).message}</p> : null}
    </div>
  );
}
