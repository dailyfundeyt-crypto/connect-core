import { IconCloud, IconDeviceDesktop } from "@tabler/icons-react";
import { useCallback, useEffect, useState } from "react";
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
  type DeploymentMode,
  type DeploymentModeState,
  fetchDeploymentMode,
  saveDeploymentMode,
  subscribeDeploymentMode,
} from "@/lib/deployment/mode";
import { cn } from "@/lib/utils";

/**
 * Compact Speicher toggle — Lokal vs Cloud (Supabase), no duplicate cards.
 */
export function DeploymentModePanel() {
  const [state, setState] = useState<DeploymentModeState>({ mode: "local" });
  const [cloudUrl, setCloudUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const next = await fetchDeploymentMode();
    setState(next);
    setCloudUrl(next.cloudUrl ?? "");
  }, []);

  useEffect(() => {
    void refresh();
    return subscribeDeploymentMode(() => {
      void refresh();
    });
  }, [refresh]);

  const select = async (mode: DeploymentMode) => {
    setSaving(true);
    setMessage(null);
    try {
      const saved = await saveDeploymentMode({
        mode,
        cloudUrl: mode === "cloud" ? cloudUrl.trim() : undefined,
      });
      setState(saved);
      setMessage(
        mode === "local"
          ? "Lokal aktiv — Daten bleiben auf diesem Gerät."
          : "Cloud aktiv — Supabase für den Workspace.",
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Speichern fehlgeschlagen.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <PageSection
      description="Lokal empfohlen für Datenschutz. Cloud nur wenn erlaubt."
      title="Speicher"
    >
      <PageRows>
        <Item size="sm">
          <ItemContent>
            <ItemTitle>Einsatz-Modus</ItemTitle>
            <ItemDescription>
              Workspace, Lab-Tabs und Profil — lokal oder in deiner Supabase.
            </ItemDescription>
          </ItemContent>
          <ItemActions>
            <div
              aria-label="Einsatz-Modus"
              className="inline-flex rounded-xl border border-border bg-muted/40 p-0.5"
              role="group"
            >
              <button
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition",
                  state.mode === "local"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
                disabled={saving}
                onClick={() => void select("local")}
                type="button"
              >
                <IconDeviceDesktop className="size-3.5" />
                Lokal
              </button>
              <button
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition",
                  state.mode === "cloud"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
                disabled={saving}
                onClick={() => {
                  if (!cloudUrl.trim()) {
                    setMessage("Zuerst die Supabase-URL eintragen.");
                    return;
                  }
                  void select("cloud");
                }}
                type="button"
              >
                <IconCloud className="size-3.5" />
                Cloud
              </button>
            </div>
          </ItemActions>
        </Item>

        {state.mode === "cloud" || cloudUrl.trim() ? (
          <Item size="sm">
            <ItemContent className="min-w-0 flex-1 gap-2">
              <ItemTitle>Supabase-URL</ItemTitle>
              <Input
                className="h-8 max-w-md font-mono text-xs"
                onChange={(e) => setCloudUrl(e.target.value)}
                placeholder="https://xxxx.supabase.co"
                value={cloudUrl}
              />
            </ItemContent>
            <ItemActions>
              <Button
                disabled={saving || !cloudUrl.trim()}
                onClick={() => void select("cloud")}
                size="sm"
                type="button"
                variant="secondary"
              >
                Speichern
              </Button>
            </ItemActions>
          </Item>
        ) : (
          <Item size="sm">
            <ItemContent>
              <ItemDescription>
                Für Cloud: Supabase-URL eintragen, dann oben „Cloud“ wählen.
              </ItemDescription>
              <Input
                className="mt-2 h-8 max-w-md font-mono text-xs"
                onChange={(e) => setCloudUrl(e.target.value)}
                placeholder="https://xxxx.supabase.co"
                value={cloudUrl}
              />
            </ItemContent>
          </Item>
        )}

        {message ? (
          <p className="px-1 pb-2 text-xs text-muted-foreground" role="status">
            {message}
          </p>
        ) : null}
      </PageRows>
    </PageSection>
  );
}
