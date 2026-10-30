import {
  IconAppWindow,
  IconCheck,
  IconDeviceDesktop,
  IconFileCode,
  IconLoader2,
  IconMovie,
  IconPhoto,
  IconPlus,
  IconSparkles,
  IconVideo,
} from "@tabler/icons-react";
import { useEffect, useState } from "react";
import type { PcAppEntry } from "@/contracts/v06/pc-apps";
import { getFlag } from "@/contracts/v06/flags";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Button as DesignButton } from "@/v06/design/Button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export interface AddPcAppDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groupId: string;
  onAppAdded?: (app: PcAppEntry) => void;
}

interface PresetItem {
  preset: {
    key: string;
    name: string;
    defaultProcessName: string;
    titleRegex?: string;
    possiblePaths: string[];
  };
  installed: boolean;
  foundPath?: string;
}

const PRESET_ICONS: Record<string, React.ReactNode> = {
  notepad: <IconFileCode className="size-4 text-sky-400" />,
  premiere: <IconVideo className="size-4 text-purple-400" />,
  aftereffects: <IconMovie className="size-4 text-indigo-400" />,
  photoshop: <IconPhoto className="size-4 text-blue-400" />,
};

export function AddPcAppDialog({
  open,
  onOpenChange,
  groupId,
  onAppAdded,
}: AddPcAppDialogProps) {
  const isDesignV2 = getFlag("designV2");
  const [name, setName] = useState("");
  const [exePath, setExePath] = useState("");
  const [processName, setProcessName] = useState("");
  const [titleRegex, setTitleRegex] = useState("");
  const [iconPath, setIconPath] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [presets, setPresets] = useState<PresetItem[]>([]);
  const [loadingPresets, setLoadingPresets] = useState(false);

  // Presets vom Server laden (inklusive Erkennung installierter Adobe-Suiten)
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoadingPresets(true);

    fetch("/api/v06/pc-apps/presets")
      .then((r) => (r.ok ? r.json() : []))
      .then((data: PresetItem[]) => {
        if (!cancelled && Array.isArray(data)) {
          setPresets(data);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoadingPresets(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open]);

  const applyPreset = (item: PresetItem) => {
    setName(item.preset.name);
    setExePath(item.foundPath || item.preset.possiblePaths[0] || "");
    setProcessName(item.preset.defaultProcessName);
    setTitleRegex(item.preset.titleRegex || "");
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !exePath.trim()) {
      setError("Name und Pfad zur .exe-Datei sind erforderlich.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/v06/pc-apps", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          groupId,
          name: name.trim(),
          exePath: exePath.trim(),
          windowMatch: {
            processName: processName.trim() || undefined,
            titleRegex: titleRegex.trim() || undefined,
          },
          iconPath: iconPath.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || `HTTP ${res.status}`);
      }

      const created = (await res.json()) as PcAppEntry;
      onAppAdded?.(created);
      onOpenChange(false);
      resetForm();
    } catch (err: any) {
      setError(err.message || "Fehler beim Anlegen der PC-App.");
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setName("");
    setExePath("");
    setProcessName("");
    setTitleRegex("");
    setIconPath("");
    setError(null);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "max-w-lg transition-colors",
          isDesignV2 && "border-[var(--p-border-strong)] bg-[var(--p-surface-2)] text-[var(--p-text-1)] shadow-[var(--p-shadow-lg)] rounded-[var(--p-radius-lg)]",
        )}
      >
        <DialogHeader>
          <div className="flex items-center gap-2.5">
            <div
              className={cn(
                "flex size-9 items-center justify-center rounded-xl",
                isDesignV2
                  ? "border border-[var(--p-accent)]/20 bg-[var(--p-accent-subtle)] text-[var(--p-accent)] rounded-[var(--p-radius-md)]"
                  : "bg-primary/10 text-primary",
              )}
            >
              <IconDeviceDesktop className="size-5" />
            </div>
            <div>
              <DialogTitle
                className={cn(
                  isDesignV2 ? "text-[var(--p-text-1)] font-semibold tracking-tight" : "",
                )}
              >
                PC-App in Browser-Gruppe einbinden
              </DialogTitle>
              <DialogDescription
                className={cn(
                  isDesignV2 ? "text-[var(--p-text-3)] text-xs" : "",
                )}
              >
                Binde lokale Desktop-Programme (Notepad, Premiere Pro, After Effects …) als
                interaktive Live-Vorschau in die Gruppe ein.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Schnell-Presets */}
        <div className="space-y-2 pt-2">
          <div
            className={cn(
              "flex items-center justify-between text-xs",
              isDesignV2 ? "text-[var(--p-text-3)] font-medium uppercase tracking-wider text-[10px]" : "text-muted-foreground font-medium",
            )}
          >
            <span>Schnellauswahl installierter Apps:</span>
            {loadingPresets ? <IconLoader2 className="size-3 animate-spin" /> : null}
          </div>
          <div className="grid grid-cols-2 gap-2">
            {presets.map((item) => {
              const icon = PRESET_ICONS[item.preset.key] || <IconAppWindow className="size-4" />;
              const selected = name === item.preset.name;
              return (
                <button
                  key={item.preset.key}
                  type="button"
                  onClick={() => applyPreset(item)}
                  className={cn(
                    "flex items-center justify-between p-2 text-left text-xs transition-all duration-[180ms]",
                    isDesignV2
                      ? selected
                        ? "rounded-[var(--p-radius-sm)] border border-[var(--p-accent)] bg-[var(--p-accent-subtle)] text-[var(--p-text-1)] shadow-[var(--p-shadow-sm)] font-medium"
                        : "rounded-[var(--p-radius-sm)] border border-[var(--p-border)] bg-[var(--p-surface-1)] text-[var(--p-text-2)] hover:border-[var(--p-border-strong)] hover:text-[var(--p-text-1)] hover:bg-[var(--p-surface-hover)]"
                      : selected
                        ? "rounded-lg border border-primary bg-primary/5"
                        : "rounded-lg border border-border hover:border-primary/50 hover:bg-accent/40",
                  )}
                >
                  <div className="flex min-w-0 items-center gap-2">
                    {icon}
                    <div className="min-w-0">
                      <p className="truncate font-medium">{item.preset.name}</p>
                      <p
                        className={cn(
                          "text-[10px]",
                          isDesignV2 ? "text-[var(--p-text-3)]" : "text-muted-foreground",
                        )}
                      >
                        {item.installed ? "Erkannt" : "Preset"}
                      </p>
                    </div>
                  </div>
                  {item.installed ? (
                    <span
                      className={cn(
                        "px-1.5 py-0.5 text-[9px] font-medium",
                        isDesignV2
                          ? "rounded-[var(--p-radius-xs)] border border-[var(--p-success)]/20 bg-[var(--p-success-subtle)] text-[var(--p-success)]"
                          : "rounded-full bg-emerald-500/10 text-emerald-500",
                      )}
                    >
                      Installiert
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3 pt-2">
          {error ? (
            <div
              className={cn(
                "p-2.5 text-xs",
                isDesignV2
                  ? "rounded-[var(--p-radius-sm)] border border-[var(--p-danger)]/20 bg-[var(--p-danger-subtle)] text-[var(--p-danger)] font-medium"
                  : "rounded-lg border border-destructive/30 bg-destructive/10 text-destructive",
              )}
            >
              {error}
            </div>
          ) : null}

          <div className="space-y-1">
            <Label
              htmlFor="pcapp-name"
              className={cn("text-xs", isDesignV2 && "text-[var(--p-text-2)]")}
            >
              App-Name *
            </Label>
            <Input
              id="pcapp-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="z. B. Adobe Premiere Pro"
              className={cn(
                "h-8 text-xs",
                isDesignV2 && "rounded-[var(--p-radius-sm)] border-[var(--p-border)] bg-[var(--p-surface-1)] text-[var(--p-text-1)] placeholder:text-[var(--p-text-3)] focus-visible:ring-[var(--p-border-focus)]",
              )}
              required
            />
          </div>

          <div className="space-y-1">
            <Label
              htmlFor="pcapp-path"
              className={cn("text-xs", isDesignV2 && "text-[var(--p-text-2)]")}
            >
              Ausführbarer Pfad (.exe) *
            </Label>
            <Input
              id="pcapp-path"
              value={exePath}
              onChange={(e) => setExePath(e.target.value)}
              placeholder="C:\Program Files\Adobe\Adobe Premiere Pro 2026\Adobe Premiere Pro.exe"
              className={cn(
                "h-8 text-xs font-mono",
                isDesignV2 && "rounded-[var(--p-radius-sm)] border-[var(--p-border)] bg-[var(--p-surface-1)] text-[var(--p-text-1)] placeholder:text-[var(--p-text-3)] focus-visible:ring-[var(--p-border-focus)]",
              )}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label
                htmlFor="pcapp-process"
                className={cn("text-xs", isDesignV2 && "text-[var(--p-text-2)]")}
              >
                Prozessname
              </Label>
              <Input
                id="pcapp-process"
                value={processName}
                onChange={(e) => setProcessName(e.target.value)}
                placeholder="Adobe Premiere Pro.exe"
                className={cn(
                  "h-8 text-xs font-mono",
                  isDesignV2 && "rounded-[var(--p-radius-sm)] border-[var(--p-border)] bg-[var(--p-surface-1)] text-[var(--p-text-1)] placeholder:text-[var(--p-text-3)] focus-visible:ring-[var(--p-border-focus)]",
                )}
              />
            </div>
            <div className="space-y-1">
              <Label
                htmlFor="pcapp-regex"
                className={cn("text-xs", isDesignV2 && "text-[var(--p-text-2)]")}
              >
                Fenstertitel-Muster (Regex)
              </Label>
              <Input
                id="pcapp-regex"
                value={titleRegex}
                onChange={(e) => setTitleRegex(e.target.value)}
                placeholder=".*Premiere Pro.*"
                className={cn(
                  "h-8 text-xs font-mono",
                  isDesignV2 && "rounded-[var(--p-radius-sm)] border-[var(--p-border)] bg-[var(--p-surface-1)] text-[var(--p-text-1)] placeholder:text-[var(--p-text-3)] focus-visible:ring-[var(--p-border-focus)]",
                )}
              />
            </div>
          </div>

          <DialogFooter className="pt-2">
            {isDesignV2 ? (
              <>
                <DesignButton
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => onOpenChange(false)}
                  disabled={loading}
                >
                  Abbrechen
                </DesignButton>
                <DesignButton
                  type="submit"
                  variant="primary"
                  size="sm"
                  loading={loading}
                  leftIcon={!loading ? <IconPlus className="size-3.5" /> : null}
                >
                  Hinzufügen
                </DesignButton>
              </>
            ) : (
              <>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => onOpenChange(false)}
                  disabled={loading}
                >
                  Abbrechen
                </Button>
                <Button type="submit" size="sm" disabled={loading} className="gap-1.5">
                  {loading ? (
                    <IconLoader2 className="size-3.5 animate-spin" />
                  ) : (
                    <IconPlus className="size-3.5" />
                  )}
                  Hinzufügen
                </Button>
              </>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default AddPcAppDialog;
