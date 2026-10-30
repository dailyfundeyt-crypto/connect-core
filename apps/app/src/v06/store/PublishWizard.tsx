/**
 * Store Package Publish Wizard (v06)
 * 4-Step wizard:
 * 1. Paket wählen & Basismetadaten (Art, Slug, Name, Version)
 * 2. Manifest prüfen (Beschreibung, Berechtigungen & installSpec)
 * 3. Medien & Screenshots (Icon, Screenshots-URLs)
 * 4. Überprüfung & Einreichen (Status: 'review', verständliche Validierungsfehler)
 */

import React, { useState } from "react";
import {
  IconX,
  IconCheck,
  IconChevronRight,
  IconChevronLeft,
  IconAlertTriangle,
  IconUpload,
  IconFileCode,
  IconCpu,
  IconTool,
  IconSparkles,
  IconBuildingStore,
  IconLoader2,
  IconPlus,
  IconTrash,
} from "@tabler/icons-react";
import { cn } from "@/lib/utils";
import type {
  StoreKind,
  PackagePermission,
  ConnectPackageManifest,
  UploadResult,
} from "./types";
import { KNOWN_PERMISSIONS, PERMISSION_DEFINITIONS } from "./types";

export interface PublishWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (manifest: ConnectPackageManifest, file?: File) => Promise<UploadResult>;
  onSuccess?: (res: UploadResult) => void;
}

const KINDS: { key: StoreKind; title: string; subtitle: string; icon: React.ComponentType<{ size?: number; className?: string }> }[] = [
  { key: "tool", title: "Tool / App", subtitle: "Interaktives Werkzeug oder Dashboard", icon: IconTool },
  { key: "mcp", title: "MCP Server", subtitle: "Model Context Protocol Server für Bots", icon: IconCpu },
  { key: "skill", title: "Bot Skill", subtitle: "Wiederverwendbare Prompts & Tool-Bindings", icon: IconSparkles },
  { key: "company", title: "Firmen-Vorlage", subtitle: "Vollständiges Workspace-Template", icon: IconBuildingStore },
];

export function PublishWizard({
  open,
  onOpenChange,
  onSubmit,
  onSuccess,
}: PublishWizardProps) {
  const [step, setStep] = useState<number>(1);
  const [packageFile, setPackageFile] = useState<File | undefined>(undefined);

  // Form State
  const [kind, setKind] = useState<StoreKind>("tool");
  const [slug, setSlug] = useState<string>("");
  const [name, setName] = useState<string>("");
  const [version, setVersion] = useState<string>("1.0.0");
  const [authorName, setAuthorName] = useState<string>("stefan");
  const [authorHandle, setAuthorHandle] = useState<string>("@stefan");

  const [summary, setSummary] = useState<string>("");
  const [description, setDescription] = useState<string>("");
  const [selectedPermissions, setSelectedPermissions] = useState<PackagePermission[]>([]);

  const [iconUrl, setIconUrl] = useState<string>("/brand/connect-logo.png");
  const [screenshotInput, setScreenshotInput] = useState<string>("");
  const [screenshots, setScreenshots] = useState<string[]>([]);

  // Raw installSpec JSON or custom entry
  const [installSpecJson, setInstallSpecJson] = useState<string>(
    JSON.stringify(
      {
        toolId: "custom-tool",
        name: "Custom Tool",
        kind: "custom",
      },
      null,
      2,
    ),
  );

  // Validation & Submission State
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [submittedResult, setSubmittedResult] = useState<UploadResult | null>(null);

  if (!open) return null;

  // Validate step 1
  const validateStep1 = (): boolean => {
    const errors: string[] = [];
    if (!slug.trim()) errors.push("Paket-Slug darf nicht leer sein.");
    else if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug.trim())) {
      errors.push("Slug darf nur Kleinbuchstaben, Ziffern und Bindestriche enthalten (z.B. 'meine-app').");
    }
    if (!name.trim()) errors.push("Anzeigename ist erforderlich.");
    if (!version.trim() || !/^\d+\.\d+\.\d+/.test(version.trim())) {
      errors.push("Version muss einem gültigen SemVer-Format entsprechen (z.B. '1.0.0').");
    }
    setValidationErrors(errors);
    return errors.length === 0;
  };

  // Validate step 2
  const validateStep2 = (): boolean => {
    const errors: string[] = [];
    if (!summary.trim()) errors.push("Kurzbeschreibung ist erforderlich.");
    if (summary.trim().length > 140) {
      errors.push(`Kurzbeschreibung darf max. 140 Zeichen lang sein (aktuell: ${summary.trim().length}).`);
    }
    if (!description.trim()) errors.push("Ausführliche Beschreibung ist erforderlich.");
    try {
      JSON.parse(installSpecJson);
    } catch {
      errors.push("Das installSpec-Feld enthält kein gültiges JSON.");
    }
    setValidationErrors(errors);
    return errors.length === 0;
  };

  // Handle next
  const handleNext = () => {
    if (step === 1) {
      if (validateStep1()) setStep(2);
    } else if (step === 2) {
      if (validateStep2()) setStep(3);
    } else if (step === 3) {
      setStep(4);
    }
  };

  const handlePrev = () => {
    setValidationErrors([]);
    setStep((s) => Math.max(1, s - 1));
  };

  const handleAddScreenshot = () => {
    if (screenshotInput.trim() && !screenshots.includes(screenshotInput.trim())) {
      setScreenshots([...screenshots, screenshotInput.trim()]);
      setScreenshotInput("");
    }
  };

  const handleRemoveScreenshot = (idx: number) => {
    setScreenshots(screenshots.filter((_, i) => i !== idx));
  };

  const togglePermission = (perm: PackagePermission) => {
    if (selectedPermissions.includes(perm)) {
      setSelectedPermissions(selectedPermissions.filter((p) => p !== perm));
    } else {
      setSelectedPermissions([...selectedPermissions, perm]);
    }
  };

  const handleManifestFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.name.endsWith(".json")) {
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const json = JSON.parse(event.target?.result as string);
          if (json.kind) setKind(json.kind);
          if (json.slug) setSlug(json.slug);
          if (json.name) setName(json.name);
          if (json.version) setVersion(json.version);
          if (json.summary) setSummary(json.summary);
          if (json.description) setDescription(json.description);
          if (json.icon) setIconUrl(json.icon);
          if (Array.isArray(json.screenshots)) setScreenshots(json.screenshots);
          if (Array.isArray(json.permissions)) setSelectedPermissions(json.permissions);
          if (json.installSpec) setInstallSpecJson(JSON.stringify(json.installSpec, null, 2));
          if (json.author) {
            if (typeof json.author === "string") setAuthorName(json.author);
            else {
              setAuthorName(json.author.name || "stefan");
              setAuthorHandle(json.author.handle || "@stefan");
            }
          }
          setValidationErrors([]);
        } catch {
          setValidationErrors(["Die hochgeladene Datei ist kein gültiges JSON."]);
        }
      };
      reader.readAsText(file);
    } else if (file.name.endsWith(".zip") || file.name.endsWith(".tar.gz")) {
      setPackageFile(file);
    }
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    setValidationErrors([]);

    let parsedSpec = {};
    try {
      parsedSpec = JSON.parse(installSpecJson);
    } catch {
      // Ignored
    }

    const manifest: ConnectPackageManifest = {
      schemaVersion: "1.0",
      kind,
      slug: slug.trim(),
      name: name.trim(),
      version: version.trim(),
      summary: summary.trim(),
      description: description.trim(),
      author: {
        name: authorName.trim(),
        handle: authorHandle.trim(),
      },
      icon: iconUrl.trim(),
      screenshots,
      permissions: selectedPermissions,
      priceCents: 0,
      installSpec: {
        ...parsedSpec,
        permissions: selectedPermissions,
      },
    };

    try {
      const res = await onSubmit(manifest, packageFile);
      if (!res.ok) {
        const errorList: string[] = [];
        if (res.error) errorList.push(res.error);
        if (Array.isArray(res.details)) {
          errorList.push(...res.details);
        }
        setValidationErrors(errorList.length > 0 ? errorList : ["Einreichung fehlgeschlagen."]);
      } else {
        setSubmittedResult(res);
        if (onSuccess) onSuccess(res);
      }
    } catch (err: any) {
      setValidationErrors([err?.message || "Fehler beim Einreichen des Pakets."]);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in"
    >
      <div
        className={cn(
          "relative w-full max-w-2xl max-h-[92vh] overflow-y-auto rounded-3xl bg-card border border-border/80 shadow-2xl",
          "p-6 sm:p-8 flex flex-col gap-6 text-foreground animate-in zoom-in-95",
        )}
      >
        {/* Wizard Header */}
        <div className="flex items-center justify-between gap-4 border-b border-border/40 pb-4">
          <div>
            <h2 className="text-xl font-extrabold text-foreground">Paket im Store veröffentlichen</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Schritt {step} von 4:{" "}
              {step === 1 && "Paket-Typ & Metadaten"}
              {step === 2 && "Manifest & Berechtigungen"}
              {step === 3 && "Medien & Screenshots"}
              {step === 4 && "Überprüfung & Einreichen"}
            </p>
          </div>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="p-2 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
            aria-label="Schließen"
          >
            <IconX size={20} />
          </button>
        </div>

        {/* Step Progress Pills */}
        <div className="grid grid-cols-4 gap-2">
          {[1, 2, 3, 4].map((s) => (
            <div
              key={s}
              className={cn(
                "h-1.5 rounded-full transition-all duration-300",
                s === step
                  ? "bg-primary"
                  : s < step
                  ? "bg-primary/50"
                  : "bg-muted",
              )}
            />
          ))}
        </div>

        {/* Errors Alert */}
        {validationErrors.length > 0 && (
          <div className="p-4 rounded-2xl bg-destructive/10 border border-destructive/20 text-destructive text-xs flex flex-col gap-1.5">
            <div className="flex items-center gap-2 font-bold">
              <IconAlertTriangle size={16} />
              <span>Bitte beheben Sie folgende Validierungsfehler:</span>
            </div>
            <ul className="list-disc list-inside space-y-1 pl-1">
              {validationErrors.map((err, i) => (
                <li key={i}>{err}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Success Screen after Step 4 */}
        {submittedResult ? (
          <div className="py-8 flex flex-col items-center justify-center text-center gap-4">
            <div className="w-16 h-16 rounded-3xl bg-emerald-500/20 text-emerald-500 flex items-center justify-center border border-emerald-500/30">
              <IconCheck size={36} />
            </div>
            <h3 className="text-xl font-bold text-foreground">Paket erfolgreich eingereicht!</h3>
            <p className="text-sm text-muted-foreground max-w-md leading-relaxed">
              Das Paket <strong>{name}</strong> (v{version}) wurde im lokalen Store-Verzeichnis gespeichert und befindet sich im Status <strong>Review</strong>.
              Stefan kann es nun in der Admin-Warteschlange prüfen und freigeben.
            </p>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="mt-2 min-h-[44px] px-8 py-2.5 rounded-full bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition-all"
            >
              Fertig
            </button>
          </div>
        ) : (
          <>
            {/* STEP 1: Type & Basics */}
            {step === 1 && (
              <div className="flex flex-col gap-5">
                {/* File Upload Shortcut */}
                <div className="p-4 rounded-2xl bg-muted/40 border border-dashed border-border/80 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <IconFileCode size={24} className="text-primary" />
                    <div>
                      <h4 className="text-xs font-bold text-foreground">connect-package.json importieren</h4>
                      <p className="text-[11px] text-muted-foreground">Füllt alle Formularfelder automatisch aus</p>
                    </div>
                  </div>
                  <label className="min-h-[40px] px-4 py-2 rounded-full bg-muted border border-border text-xs font-semibold hover:bg-card cursor-pointer transition-colors flex items-center gap-2">
                    <IconUpload size={14} />
                    <span>Datei wählen</span>
                    <input
                      type="file"
                      accept=".json,.zip"
                      onChange={handleManifestFileUpload}
                      className="hidden"
                    />
                  </label>
                </div>

                {/* Kind Selector */}
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                    Paket-Art (StoreKind)
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    {KINDS.map((k) => {
                      const Icon = k.icon;
                      const isSelected = kind === k.key;
                      return (
                        <button
                          key={k.key}
                          type="button"
                          onClick={() => setKind(k.key)}
                          className={cn(
                            "flex flex-col items-center justify-center p-3.5 rounded-2xl border text-center transition-all min-h-[80px]",
                            isSelected
                              ? "bg-primary/10 border-primary text-primary font-bold shadow-sm"
                              : "bg-muted/40 border-border/60 text-muted-foreground hover:bg-muted hover:text-foreground",
                          )}
                        >
                          <Icon size={24} className="mb-1" />
                          <span className="text-xs">{k.title}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Name, Slug, Version */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-semibold text-muted-foreground">Anzeigename</label>
                    <input
                      type="text"
                      placeholder="z.B. MarketTrace Pro"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="px-4 py-2.5 rounded-2xl bg-muted/50 border border-border text-sm text-foreground focus:ring-2 focus:ring-primary focus:outline-none min-h-[44px]"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-semibold text-muted-foreground">Slug (eindeutige Kennung)</label>
                    <input
                      type="text"
                      placeholder="z.B. markettrace-pro"
                      value={slug}
                      onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/\s+/g, "-"))}
                      className="px-4 py-2.5 rounded-2xl bg-muted/50 border border-border text-sm text-foreground focus:ring-2 focus:ring-primary focus:outline-none min-h-[44px]"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-semibold text-muted-foreground">Version (SemVer)</label>
                    <input
                      type="text"
                      placeholder="1.0.0"
                      value={version}
                      onChange={(e) => setVersion(e.target.value)}
                      className="px-4 py-2.5 rounded-2xl bg-muted/50 border border-border text-sm text-foreground focus:ring-2 focus:ring-primary focus:outline-none min-h-[44px]"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-semibold text-muted-foreground">Autor / Handle</label>
                    <input
                      type="text"
                      placeholder="Stefan Kunc (@stefan)"
                      value={authorName}
                      onChange={(e) => setAuthorName(e.target.value)}
                      className="px-4 py-2.5 rounded-2xl bg-muted/50 border border-border text-sm text-foreground focus:ring-2 focus:ring-primary focus:outline-none min-h-[44px]"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* STEP 2: Manifest & Permissions */}
            {step === 2 && (
              <div className="flex flex-col gap-5">
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-muted-foreground">Kurzbeschreibung (Summary)</label>
                    <span className="text-[11px] text-muted-foreground">{summary.length} / 140 Zeichen</span>
                  </div>
                  <input
                    type="text"
                    maxLength={140}
                    placeholder="Prägnanter Einzeiler für die Play-Store Kachel..."
                    value={summary}
                    onChange={(e) => setSummary(e.target.value)}
                    className="px-4 py-2.5 rounded-2xl bg-muted/50 border border-border text-sm text-foreground focus:ring-2 focus:ring-primary focus:outline-none min-h-[44px]"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-muted-foreground">Ausführliche Beschreibung (Markdown unterstützt)</label>
                  <textarea
                    rows={4}
                    placeholder="Detaillierte Funktionsbeschreibung, Features und Nutzungshinweise..."
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="px-4 py-2.5 rounded-2xl bg-muted/50 border border-border text-sm text-foreground focus:ring-2 focus:ring-primary focus:outline-none resize-none"
                  />
                </div>

                {/* Permissions Picker */}
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                    Erforderliche Berechtigungen
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-1">
                    {KNOWN_PERMISSIONS.map((perm) => {
                      const def = PERMISSION_DEFINITIONS[perm];
                      const isChecked = selectedPermissions.includes(perm);
                      return (
                        <label
                          key={perm}
                          className={cn(
                            "p-2.5 rounded-2xl border text-xs flex items-start gap-2.5 cursor-pointer select-none transition-colors",
                            isChecked
                              ? "bg-primary/10 border-primary text-foreground"
                              : "bg-muted/30 border-border/50 text-muted-foreground hover:bg-muted/60",
                          )}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => togglePermission(perm)}
                            className="mt-0.5 h-3.5 w-3.5 rounded text-primary focus:ring-primary shrink-0"
                          />
                          <div className="flex-1 min-w-0">
                            <span className="font-semibold block truncate text-foreground">{def?.label || perm}</span>
                            <span className="text-[10px] text-muted-foreground line-clamp-1">{def?.description}</span>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>

                {/* installSpec Inspector */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-muted-foreground">Installations-Spezifikation (JSON)</label>
                  <textarea
                    rows={4}
                    value={installSpecJson}
                    onChange={(e) => setInstallSpecJson(e.target.value)}
                    className="px-4 py-2 rounded-2xl bg-muted/60 border border-border font-mono text-xs text-foreground focus:ring-2 focus:ring-primary focus:outline-none"
                  />
                </div>
              </div>
            )}

            {/* STEP 3: Media & Screenshots */}
            {step === 3 && (
              <div className="flex flex-col gap-5">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-muted-foreground">Icon Pfad oder URL</label>
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-muted border border-border flex items-center justify-center overflow-hidden shrink-0">
                      <img src={iconUrl} alt="Vorschau" className="w-full h-full object-cover" />
                    </div>
                    <input
                      type="text"
                      placeholder="/brand/connect-logo.png oder https://..."
                      value={iconUrl}
                      onChange={(e) => setIconUrl(e.target.value)}
                      className="flex-1 px-4 py-2.5 rounded-2xl bg-muted/50 border border-border text-sm text-foreground focus:ring-2 focus:ring-primary focus:outline-none min-h-[44px]"
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-xs font-semibold text-muted-foreground">Screenshots hinzufügen (URLs oder relative Pfade)</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      placeholder="/brand/analysis-logo.png"
                      value={screenshotInput}
                      onChange={(e) => setScreenshotInput(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleAddScreenshot())}
                      className="flex-1 px-4 py-2.5 rounded-2xl bg-muted/50 border border-border text-sm text-foreground focus:ring-2 focus:ring-primary focus:outline-none min-h-[44px]"
                    />
                    <button
                      type="button"
                      onClick={handleAddScreenshot}
                      className="min-h-[44px] px-4 py-2 rounded-2xl bg-muted border border-border text-xs font-semibold hover:bg-card transition-colors flex items-center gap-1.5"
                    >
                      <IconPlus size={16} />
                      <span>Hinzufügen</span>
                    </button>
                  </div>

                  {/* Screenshot list */}
                  {screenshots.length > 0 && (
                    <div className="flex items-center gap-3 overflow-x-auto py-2">
                      {screenshots.map((s, idx) => (
                        <div key={idx} className="relative group shrink-0 w-32 h-20 rounded-xl overflow-hidden border border-border">
                          <img src={s} alt="Screenshot" className="w-full h-full object-cover" />
                          <button
                            type="button"
                            onClick={() => handleRemoveScreenshot(idx)}
                            className="absolute top-1 right-1 p-1 rounded-full bg-black/70 text-white hover:bg-destructive transition-colors opacity-80 group-hover:opacity-100"
                          >
                            <IconTrash size={12} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* STEP 4: Review & Final Submission */}
            {step === 4 && (
              <div className="flex flex-col gap-5">
                <div className="p-4 rounded-3xl bg-muted/40 border border-border/70 flex flex-col gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-muted border border-border flex items-center justify-center overflow-hidden shrink-0">
                      <img src={iconUrl} alt={name} className="w-full h-full object-cover" />
                    </div>
                    <div>
                      <h4 className="text-base font-bold text-foreground">{name}</h4>
                      <p className="text-xs text-muted-foreground">
                        {kind.toUpperCase()} · Slug: <code>{slug}</code> · v{version}
                      </p>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed italic">{summary}</p>

                  <div className="flex items-center gap-2 pt-2 border-t border-border/40 text-xs text-muted-foreground">
                    <span>Preis: <strong>0 € (Kostenlos)</strong></span>
                    <span>·</span>
                    <span>Berechtigungen: <strong>{selectedPermissions.length} deklariert</strong></span>
                    <span>·</span>
                    <span>Status nach Upload: <span className="text-amber-500 font-bold">Review</span></span>
                  </div>
                </div>

                <div className="p-3.5 rounded-2xl bg-blue-500/10 border border-blue-500/20 text-blue-600 dark:text-blue-400 text-xs">
                  Nach dem Einreichen wird Ihr Paket lokal unter <code>%APPDATA%\Connect\store\packages</code> gespeichert. Der Administrator prüft die Manifest-Sicherheit vor der Veröffentlichung.
                </div>
              </div>
            )}

            {/* Wizard Navigation Footer */}
            <div className="flex items-center justify-between pt-4 border-t border-border/40 mt-2">
              <button
                type="button"
                onClick={handlePrev}
                disabled={step === 1 || isSubmitting}
                className="min-h-[44px] px-5 py-2.5 rounded-full text-sm font-medium text-muted-foreground hover:bg-muted disabled:opacity-30 disabled:pointer-events-none flex items-center gap-1.5 transition-colors"
              >
                <IconChevronLeft size={16} />
                <span>Zurück</span>
              </button>

              {step < 4 ? (
                <button
                  type="button"
                  onClick={handleNext}
                  className="min-h-[44px] px-6 py-2.5 rounded-full bg-primary text-primary-foreground font-semibold hover:bg-primary/90 flex items-center gap-1.5 transition-all active:scale-95 shadow"
                >
                  <span>Weiter</span>
                  <IconChevronRight size={16} />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={isSubmitting}
                  className="min-h-[44px] px-7 py-2.5 rounded-full bg-primary text-primary-foreground font-bold hover:bg-primary/90 flex items-center gap-2 transition-all active:scale-95 shadow"
                >
                  {isSubmitting ? (
                    <>
                      <IconLoader2 size={16} className="animate-spin" />
                      <span>Reiche ein...</span>
                    </>
                  ) : (
                    <>
                      <IconCheck size={16} />
                      <span>Zur Prüfung einreichen</span>
                    </>
                  )}
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
