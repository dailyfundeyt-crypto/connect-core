/**
 * Publish Wizard Dialog (Lane 8)
 * Assistant to publish custom Tools, MCP servers, Skills, and Company Templates.
 */

import React, { useState } from "react";
import {
  IconApps,
  IconBuildingStore,
  IconCheck,
  IconCpu,
  IconSparkles,
  IconTool,
  IconUpload,
  IconX,
} from "@tabler/icons-react";
import { cn } from "@/lib/utils";
import { publishStoreItem } from "./store-api";
import type { StorePackageType } from "./types";

interface PublishDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onPublished: () => void;
}

const PERMISSION_OPTIONS = [
  { id: "network:outbound", label: "Ausgehende Web-Anfragen", desc: "APIs & Webhooks erreichen" },
  { id: "storage:local", label: "Lokale Postgres-Daten", desc: "Persistenz in Port 5544" },
  { id: "agent:execute", label: "Agenten & Bot-Routinen", desc: "LLM-Prompts ausführen" },
  { id: "mcp:tools", label: "MCP-Tools anbieten", desc: "Werkzeuge für Bots registrieren" },
  { id: "company:read", label: "Firmendaten lesen", desc: "Firma & Workspace inspizieren" },
  { id: "company:write", label: "Workspace anpassen", desc: "Firmeneinstellungen verwalten" },
];

export function PublishDialog({ isOpen, onClose, onPublished }: PublishDialogProps) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [type, setType] = useState<StorePackageType>("tool");
  const [name, setName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [version, setVersion] = useState("1.0.0");
  const [description, setDescription] = useState("");
  const [entryPoint, setEntryPoint] = useState("@/components/tools/my-tool");
  const [author, setAuthor] = useState("Stefan Kunc");
  const [permissions, setPermissions] = useState<string[]>(["storage:local"]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const togglePermission = (id: string) => {
    setPermissions((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id],
    );
  };

  const handleNext = () => {
    setErrorMessage(null);
    if (step === 1) {
      if (!name) {
        setName(`${type}-${Date.now().toString().slice(-4)}`);
      }
      if (!displayName) {
        setDisplayName(
          type === "tool"
            ? "Mein Connect Tool"
            : type === "mcp"
              ? "Mein MCP Server"
              : type === "skill"
                ? "Mein Agent Skill"
                : "Mein Firmen Workspace",
        );
      }
      setStep(2);
    } else if (step === 2) {
      if (!displayName.trim() || !description.trim()) {
        setErrorMessage("Bitte fülle Anzeigename und Beschreibung aus.");
        return;
      }
      setStep(3);
    }
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    setErrorMessage(null);

    const slug = (name.trim() || `${type}-app`).toLowerCase().replace(/[^a-z0-9-_]/g, "-");
    const manifest = {
      id: `${type}-${slug}`,
      name: slug,
      displayName: displayName.trim(),
      version: version.trim() || "1.0.0",
      type,
      description: description.trim(),
      author: author.trim() || "Stefan Kunc",
      entryPoint: entryPoint.trim() || `/apps/${slug}`,
      permissions,
      icon:
        type === "mcp"
          ? "IconCpu"
          : type === "tool"
            ? "IconTool"
            : type === "skill"
              ? "IconSparkles"
              : "IconBuildingStore",
      tags: [type, "custom"],
    };

    const res = await publishStoreItem({
      manifest,
      changelog: "Erstveröffentlichung im Swarm-v2 Play Store.",
      author: manifest.author,
    });

    if (res.success) {
      setIsSubmitting(false);
      onPublished();
      onClose();
    } else {
      setIsSubmitting(false);
      setErrorMessage(res.error || "Fehler beim Veröffentlichen.");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-md animate-in fade-in duration-150">
      <div
        className="relative w-full max-w-lg bg-card border border-border/80 rounded-3xl shadow-2xl overflow-hidden flex flex-col select-none"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border/50 bg-secondary/30">
          <div>
            <h3 className="text-sm font-bold text-foreground">
              App im Play Store veröffentlichen
            </h3>
            <p className="text-[11px] text-muted-foreground">Schritt {step} von 3</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-full text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          >
            <IconX size={18} />
          </button>
        </div>

        {/* Form Body */}
        <div className="p-6 space-y-4">
          {errorMessage && (
            <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-xs text-destructive">
              {errorMessage}
            </div>
          )}

          {step === 1 && (
            <div className="space-y-3">
              <label className="text-xs font-semibold text-foreground">
                Was möchtest du veröffentlichen?
              </label>
              <div className="grid grid-cols-2 gap-3">
                {[
                  {
                    type: "tool" as const,
                    label: "Tool / App",
                    desc: "Interaktives Connect-Modul",
                    icon: <IconTool size={20} className="text-violet-500" />,
                  },
                  {
                    type: "mcp" as const,
                    label: "MCP Server",
                    desc: "Tools für Agenten",
                    icon: <IconCpu size={20} className="text-blue-500" />,
                  },
                  {
                    type: "skill" as const,
                    label: "Agent Skill",
                    desc: "Prompts & Heuristiken",
                    icon: <IconSparkles size={20} className="text-amber-500" />,
                  },
                  {
                    type: "company" as const,
                    label: "Company Template",
                    desc: "Fertiger Workspace",
                    icon: <IconBuildingStore size={20} className="text-emerald-500" />,
                  },
                ].map((item) => (
                  <button
                    key={item.type}
                    type="button"
                    onClick={() => setType(item.type)}
                    className={cn(
                      "flex flex-col items-start p-3.5 rounded-2xl border text-left transition-all",
                      type === item.type
                        ? "bg-primary/10 border-primary shadow-sm"
                        : "bg-secondary/40 border-border/60 hover:bg-secondary",
                    )}
                  >
                    <div className="p-2 rounded-xl bg-card border border-border/40 mb-2">
                      {item.icon}
                    </div>
                    <span className="text-xs font-bold text-foreground">{item.label}</span>
                    <span className="text-[11px] text-muted-foreground mt-0.5">
                      {item.desc}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-foreground">Anzeigename</label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="z.B. Flux MultiPoster"
                  className="w-full mt-1 p-2.5 rounded-xl bg-secondary/50 border border-border/60 text-xs text-foreground outline-none focus:border-primary/50"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-foreground">Paket-ID / Slug</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="z.B. custom-tool"
                    className="w-full mt-1 p-2.5 rounded-xl bg-secondary/50 border border-border/60 text-xs text-foreground outline-none focus:border-primary/50 font-mono"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-foreground">Version (SemVer)</label>
                  <input
                    type="text"
                    value={version}
                    onChange={(e) => setVersion(e.target.value)}
                    placeholder="1.0.0"
                    className="w-full mt-1 p-2.5 rounded-xl bg-secondary/50 border border-border/60 text-xs text-foreground outline-none focus:border-primary/50 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-foreground">Beschreibung</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Beschreibe Funktion und Zweck dieser App..."
                  rows={3}
                  className="w-full mt-1 p-2.5 rounded-xl bg-secondary/50 border border-border/60 text-xs text-foreground outline-none focus:border-primary/50 resize-none"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-foreground">Einstiegspunkt</label>
                <input
                  type="text"
                  value={entryPoint}
                  onChange={(e) => setEntryPoint(e.target.value)}
                  placeholder="Pfad oder Modul-Import"
                  className="w-full mt-1 p-2.5 rounded-xl bg-secondary/50 border border-border/60 text-xs text-foreground outline-none focus:border-primary/50 font-mono"
                />
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-3">
              <label className="text-xs font-semibold text-foreground">
                Erforderliche Berechtigungen festlegen
              </label>
              <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                {PERMISSION_OPTIONS.map((perm) => {
                  const checked = permissions.includes(perm.id);
                  return (
                    <div
                      key={perm.id}
                      onClick={() => togglePermission(perm.id)}
                      className={cn(
                        "flex items-center justify-between p-2.5 rounded-xl border cursor-pointer transition-colors",
                        checked
                          ? "bg-primary/10 border-primary"
                          : "bg-secondary/40 border-border/50 hover:bg-secondary",
                      )}
                    >
                      <div>
                        <p className="text-xs font-semibold text-foreground">{perm.label}</p>
                        <p className="text-[11px] text-muted-foreground">{perm.desc}</p>
                      </div>
                      <div
                        className={cn(
                          "w-5 h-5 rounded-md flex items-center justify-center border transition-all",
                          checked
                            ? "bg-primary text-primary-foreground border-primary"
                            : "border-border/60 bg-card",
                        )}
                      >
                        {checked && <IconCheck size={14} />}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-border/50 bg-secondary/30">
          {step > 1 ? (
            <button
              type="button"
              onClick={() => setStep((s) => (s - 1) as any)}
              className="px-4 py-2 rounded-full text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
            >
              Zurück
            </button>
          ) : (
            <div />
          )}

          {step < 3 ? (
            <button
              type="button"
              onClick={handleNext}
              className="px-5 py-2 rounded-full bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-semibold shadow-md transition-transform active:scale-95"
            >
              Weiter →
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="flex items-center gap-1.5 px-6 py-2 rounded-full bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground text-xs font-bold shadow-md transition-transform active:scale-95"
            >
              <IconUpload size={14} />
              <span>{isSubmitting ? "Wird signiert..." : "Veröffentlichen"}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
