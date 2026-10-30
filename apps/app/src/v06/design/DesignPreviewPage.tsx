import React, { useState } from "react";
import {
  Sparkles,
  Bot,
  Zap,
  Sliders,
  Layers,
  Check,
  AlertTriangle,
  Info,
  ChevronRight,
  Plus,
  Play,
  RotateCcw,
  Palette,
  Layout,
  Sun,
  Moon,
  ShieldCheck,
  Cpu,
} from "lucide-react";
import { getFlag } from "@/contracts/v06/flags";
import { colors, radii, spacing, typography } from "./tokens";
import { Button } from "./Button";
import { IconButton } from "./IconButton";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "./Card";
import { ListRow } from "./ListRow";
import { Toggle } from "./Toggle";
import { SegmentedControl } from "./SegmentedControl";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "./Dialog";
import { ToastProvider, useToast } from "./Toast";
import { SidebarSection } from "./SidebarSection";
import { EmptyState } from "./EmptyState";
import { Skeleton } from "./Skeleton";
import { ParticlesBackground } from "./ParticlesBackground";
import "./tokens.css";

export const DesignPreviewPage: React.FC = () => {
  const isFlagActive = getFlag("designV2");
  const [overridePreview, setOverridePreview] = useState(false);
  const [previewTheme, setPreviewTheme] = useState<"dark" | "light" | "split">("dark");
  const [showParticles, setShowParticles] = useState(true);

  const isEnabled = isFlagActive || overridePreview;

  if (!isEnabled) {
    return (
      <div className="min-h-screen bg-[#09090b] text-[#ededef] flex flex-col items-center justify-center p-6 text-center">
        <div className="w-16 h-16 rounded-2xl bg-[#18181e] border border-[rgba(255,255,255,0.08)] flex items-center justify-center text-[#38bdf8] mb-4 shadow-lg">
          <ShieldCheck className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-bold tracking-tight mb-2">Design System v2 (Inaktiv)</h2>
        <p className="text-sm text-[#71717a] max-w-md mb-6 leading-relaxed">
          Das Feature-Flag <code className="text-[#38bdf8] bg-[#121216] px-1.5 py-0.5 rounded text-xs font-mono">FLAGS_V06.designV2</code> ist standardmäßig deaktiviert (Safe-by-default).
        </p>
        <button
          type="button"
          onClick={() => setOverridePreview(true)}
          className="px-4 py-2 bg-[#38bdf8] text-[#09090b] text-sm font-semibold rounded-lg hover:bg-[#0ea5e9] transition-all"
        >
          Preview für diesen Tab erzwingen
        </button>
      </div>
    );
  }

  return (
    <ToastProvider>
      <div className="min-h-screen bg-[var(--p-bg)] text-[var(--p-text-1)] font-sans antialiased transition-colors duration-200">
        {/* Top Control Bar */}
        <header className="sticky top-0 z-40 bg-[var(--p-surface-2)] border-b border-[var(--p-border)] backdrop-blur-md px-6 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[var(--p-accent-subtle)] border border-[rgba(56,189,248,0.3)] flex items-center justify-center text-[var(--p-accent)]">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-sm tracking-tight text-[var(--p-text-1)]">
                  Connect Premium Design System
                </span>
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-[var(--p-accent-subtle)] text-[var(--p-accent)] border border-[rgba(56,189,248,0.25)]">
                  Wave 3 · A26
                </span>
              </div>
              <p className="text-[11px] text-[var(--p-text-3)]">
                Obsidian Palette · 4/8-px Raster · Hairline Borders · Micro-Motion (180ms)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <SegmentedControl
              size="sm"
              value={previewTheme}
              onChange={(val) => setPreviewTheme(val as any)}
              items={[
                { value: "dark", label: "Dark", icon: <Moon className="w-3.5 h-3.5" /> },
                { value: "light", label: "Light", icon: <Sun className="w-3.5 h-3.5" /> },
                { value: "split", label: "Split Side-by-Side", icon: <Layout className="w-3.5 h-3.5" /> },
              ]}
            />
          </div>
        </header>

        {/* Content Area */}
        <main className="max-w-7xl mx-auto p-6 space-y-10">
          {previewTheme === "split" ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <div className="p-theme-dark bg-[#09090b] text-[#ededef] p-6 rounded-2xl border border-[rgba(255,255,255,0.08)] space-y-10">
                <div className="flex items-center gap-2 pb-3 border-b border-[rgba(255,255,255,0.08)]">
                  <Moon className="w-4 h-4 text-[#38bdf8]" />
                  <span className="text-sm font-bold tracking-tight">Dark Mode Palette</span>
                </div>
                <ComponentShowcase mode="dark" />
              </div>
              <div className="p-theme-light bg-[#f9fafb] text-[#0f172a] p-6 rounded-2xl border border-[rgba(0,0,0,0.08)] space-y-10">
                <div className="flex items-center gap-2 pb-3 border-b border-[rgba(0,0,0,0.08)]">
                  <Sun className="w-4 h-4 text-[#0284c7]" />
                  <span className="text-sm font-bold tracking-tight">Light Mode Palette</span>
                </div>
                <ComponentShowcase mode="light" />
              </div>
            </div>
          ) : (
            <div className={previewTheme === "dark" ? "p-theme-dark" : "p-theme-light"}>
              <ComponentShowcase mode={previewTheme} />
            </div>
          )}
        </main>
      </div>
    </ToastProvider>
  );
};

interface ShowcaseProps {
  mode: "dark" | "light";
}

const ComponentShowcase: React.FC<ShowcaseProps> = ({ mode }) => {
  const { toast } = useToast();
  const [toggleState1, setToggleState1] = useState(true);
  const [toggleState2, setToggleState2] = useState(false);
  const [selectedTab, setSelectedTab] = useState("all");
  const [selectedRow, setSelectedRow] = useState<string>("row-1");

  return (
    <div className="space-y-10">
      {/* 1. TOKENS OVERVIEW: SURFACES & HIERARCHY */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <Palette className="w-4 h-4 text-[var(--p-accent)]" />
          <h3 className="text-base font-semibold tracking-tight">1. Layered Surfaces & Elevation</h3>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-4 rounded-[var(--p-radius-md)] bg-[var(--p-bg)] border border-[var(--p-border)] flex flex-col gap-1">
            <span className="text-[11px] font-mono text-[var(--p-text-3)]">bg</span>
            <span className="text-xs font-semibold text-[var(--p-text-1)]">Base Ground</span>
            <span className="text-[10px] text-[var(--p-text-dim)] font-mono">{colors[mode].bg}</span>
          </div>
          <div className="p-4 rounded-[var(--p-radius-md)] bg-[var(--p-surface-1)] border border-[var(--p-border)] flex flex-col gap-1">
            <span className="text-[11px] font-mono text-[var(--p-text-3)]">surface-1</span>
            <span className="text-xs font-semibold text-[var(--p-text-1)]">Sidebar / Subtle</span>
            <span className="text-[10px] text-[var(--p-text-dim)] font-mono">{colors[mode].surface1}</span>
          </div>
          <div className="p-4 rounded-[var(--p-radius-md)] bg-[var(--p-surface-2)] border border-[var(--p-border)] flex flex-col gap-1">
            <span className="text-[11px] font-mono text-[var(--p-text-3)]">surface-2</span>
            <span className="text-xs font-semibold text-[var(--p-text-1)]">Card / Modal</span>
            <span className="text-[10px] text-[var(--p-text-dim)] font-mono">{colors[mode].surface2}</span>
          </div>
          <div className="p-4 rounded-[var(--p-radius-md)] bg-[var(--p-surface-3)] border border-[var(--p-border)] flex flex-col gap-1">
            <span className="text-[11px] font-mono text-[var(--p-text-3)]">surface-3</span>
            <span className="text-xs font-semibold text-[var(--p-text-1)]">Floating / Dropdown</span>
            <span className="text-[10px] text-[var(--p-text-dim)] font-mono">{colors[mode].surface3}</span>
          </div>
        </div>

        {/* Semantic Colors */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
          <div className="p-3 rounded-[var(--p-radius-md)] bg-[var(--p-accent-subtle)] border border-[rgba(56,189,248,0.25)] flex items-center justify-between">
            <span className="text-xs font-semibold text-[var(--p-accent)]">Accent</span>
            <span className="w-3 h-3 rounded-full bg-[var(--p-accent)]" />
          </div>
          <div className="p-3 rounded-[var(--p-radius-md)] bg-[var(--p-success-subtle)] border border-[rgba(52,211,153,0.25)] flex items-center justify-between">
            <span className="text-xs font-semibold text-[var(--p-success)]">Success</span>
            <span className="w-3 h-3 rounded-full bg-[var(--p-success)]" />
          </div>
          <div className="p-3 rounded-[var(--p-radius-md)] bg-[var(--p-warning-subtle)] border border-[rgba(251,191,36,0.25)] flex items-center justify-between">
            <span className="text-xs font-semibold text-[var(--p-warning)]">Warning</span>
            <span className="w-3 h-3 rounded-full bg-[var(--p-warning)]" />
          </div>
          <div className="p-3 rounded-[var(--p-radius-md)] bg-[var(--p-danger-subtle)] border border-[rgba(248,113,113,0.25)] flex items-center justify-between">
            <span className="text-xs font-semibold text-[var(--p-danger)]">Danger</span>
            <span className="w-3 h-3 rounded-full bg-[var(--p-danger)]" />
          </div>
        </div>
      </section>

      {/* 2. BUTTONS & ICON BUTTONS */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-[var(--p-accent)]" />
          <h3 className="text-base font-semibold tracking-tight">2. Buttons & Icon Buttons</h3>
        </div>
        <div className="p-5 rounded-[var(--p-radius-lg)] bg-[var(--p-surface-1)] border border-[var(--p-border-subtle)] space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="primary" size="md" leftIcon={<Sparkles className="w-4 h-4" />}>
              Primary Action
            </Button>
            <Button variant="secondary" size="md">
              Secondary Button
            </Button>
            <Button variant="accentSubtle" size="md" leftIcon={<Bot className="w-4 h-4" />}>
              Subtle Accent
            </Button>
            <Button variant="ghost" size="md">
              Ghost / Tertiary
            </Button>
            <Button variant="danger" size="md">
              Danger Action
            </Button>
            <Button variant="primary" size="md" loading>
              Loading State
            </Button>
            <Button variant="secondary" size="md" disabled>
              Disabled
            </Button>
          </div>

          <div className="flex items-center gap-3 pt-2 border-t border-[var(--p-border-subtle)]">
            <span className="text-xs font-medium text-[var(--p-text-3)] mr-2">Icon Buttons:</span>
            <IconButton size="xs" variant="ghost" aria-label="Add item" icon={<Plus className="w-3.5 h-3.5" />} />
            <IconButton size="sm" variant="secondary" aria-label="Play" icon={<Play className="w-3.5 h-3.5" />} />
            <IconButton size="md" variant="primary" aria-label="Sparkle action" icon={<Sparkles className="w-4 h-4" />} />
            <IconButton size="md" variant="accentSubtle" aria-label="Settings" icon={<Sliders className="w-4 h-4" />} />
            <IconButton size="md" variant="danger" aria-label="Reset" icon={<RotateCcw className="w-4 h-4" />} />
          </div>
        </div>
      </section>

      {/* 3. CARDS & ELEVATIONS */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-[var(--p-accent)]" />
          <h3 className="text-base font-semibold tracking-tight">3. Cards & Containers</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card elevation="raised" interactive>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Interactive Agent Card</CardTitle>
                <span className="w-2.5 h-2.5 rounded-full bg-[var(--p-success)]" />
              </div>
              <CardDescription>Hover over this card to observe the smooth 180ms micro-elevation.</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-[var(--p-text-2)] leading-relaxed">
                Precision 1px hairline border, surface-2 background, and subtle glow accent on active states.
              </p>
            </CardContent>
            <CardFooter className="justify-between">
              <span>Status: Bereit für Wave 4</span>
              <Button size="sm" variant="ghost" rightIcon={<ChevronRight className="w-3 h-3" />}>
                Details
              </Button>
            </CardFooter>
          </Card>

          <Card elevation="glass">
            <CardHeader>
              <CardTitle>Glassmorphism Surface</CardTitle>
              <CardDescription>Translucent backdrop blur with hairline border.</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-[var(--p-text-2)] leading-relaxed">
                Calm reading experience without distracting specular highlights or overblown gradients.
              </p>
            </CardContent>
            <CardFooter>
              <span className="text-[11px] text-[var(--p-text-dim)]">CSS backdrop-filter: blur(12px)</span>
            </CardFooter>
          </Card>
        </div>
      </section>

      {/* 4. LIST ROWS & DATA LISTS */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <Sliders className="w-4 h-4 text-[var(--p-accent)]" />
          <h3 className="text-base font-semibold tracking-tight">4. High-Density List Rows</h3>
        </div>
        <div className="p-2 rounded-[var(--p-radius-lg)] bg-[var(--p-surface-1)] border border-[var(--p-border-subtle)] space-y-1">
          <ListRow
            title="Helium Conductor Bot"
            subtitle="Orchestriert autonome Unteragenten im Hintergrund"
            status="online"
            badge="v06"
            selected={selectedRow === "row-1"}
            onClick={() => setSelectedRow("row-1")}
            leftAccessory={
              <div className="w-8 h-8 rounded-lg bg-[var(--p-surface-2)] border border-[var(--p-border)] flex items-center justify-center text-[var(--p-accent)]">
                <Bot className="w-4 h-4" />
              </div>
            }
            rightAccessory={<ChevronRight className="w-4 h-4 text-[var(--p-text-3)]" />}
          />
          <ListRow
            title="Spark Wissens-Graph"
            subtitle="Indexiert Notizen, DAG-Tasks und Web-Transkripte"
            status="idle"
            badge="Graph"
            selected={selectedRow === "row-2"}
            onClick={() => setSelectedRow("row-2")}
            leftAccessory={
              <div className="w-8 h-8 rounded-lg bg-[var(--p-surface-2)] border border-[var(--p-border)] flex items-center justify-center text-[var(--p-warning)]">
                <Cpu className="w-4 h-4" />
              </div>
            }
            rightAccessory={<ChevronRight className="w-4 h-4 text-[var(--p-text-3)]" />}
          />
          <ListRow
            title="Security Sandboxing Guard"
            subtitle="Blockiert unbefugte Dateizugriffe und CLI-Elevation"
            status="online"
            badge="SEC-01"
            selected={selectedRow === "row-3"}
            onClick={() => setSelectedRow("row-3")}
            leftAccessory={
              <div className="w-8 h-8 rounded-lg bg-[var(--p-surface-2)] border border-[var(--p-border)] flex items-center justify-center text-[var(--p-success)]">
                <ShieldCheck className="w-4 h-4" />
              </div>
            }
            rightAccessory={<ChevronRight className="w-4 h-4 text-[var(--p-text-3)]" />}
          />
        </div>
      </section>

      {/* 5. FORM & INTERACTIVE CONTROLS */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <Sliders className="w-4 h-4 text-[var(--p-accent)]" />
          <h3 className="text-base font-semibold tracking-tight">5. Form & Selection Controls</h3>
        </div>
        <div className="p-5 rounded-[var(--p-radius-lg)] bg-[var(--p-surface-1)] border border-[var(--p-border-subtle)] grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <Toggle
              checked={toggleState1}
              onCheckedChange={setToggleState1}
              label="Echtes 4/8-px Raster erzwingen"
              description="Verhindert asymmetrische Abstände und Mischstile"
            />
            <Toggle
              checked={toggleState2}
              onCheckedChange={setToggleState2}
              label="Reduzierte Bewegung (Accessibility)"
              description="Schaltet Mikro-Animationen für barrierefreie Nutzung ab"
            />
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-xs font-medium text-[var(--p-text-2)]">Segmented Tab Switcher</span>
            <SegmentedControl
              value={selectedTab}
              onChange={setSelectedTab}
              items={[
                { value: "all", label: "Alle Bots", badge: 12 },
                { value: "active", label: "Aktiv", badge: 4 },
                { value: "archived", label: "Archiviert" },
              ]}
              fullWidth
            />
            <span className="text-[11px] text-[var(--p-text-3)] mt-2">
              Ausgewählter Filter: <strong className="text-[var(--p-text-1)]">{selectedTab}</strong>
            </span>
          </div>
        </div>
      </section>

      {/* 6. MODALS & TOAST NOTIFICATIONS */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <Info className="w-4 h-4 text-[var(--p-accent)]" />
          <h3 className="text-base font-semibold tracking-tight">6. Feedback & Dialogs</h3>
        </div>
        <div className="p-5 rounded-[var(--p-radius-lg)] bg-[var(--p-surface-1)] border border-[var(--p-border-subtle)] flex flex-wrap items-center gap-4">
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="primary">Interaktiven Dialog öffnen</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Bestätigung erforderlich</DialogTitle>
                <DialogDescription>
                  Dies ist eine Demonstration des barrierefreien Modal-Dialogs mit echtem Blur-Backdrop und 180ms Zoom-In Animation.
                </DialogDescription>
              </DialogHeader>
              <div className="py-2 text-xs text-[var(--p-text-2)]">
                Drücken Sie <kbd className="px-1.5 py-0.5 rounded bg-[var(--p-surface-3)] border border-[var(--p-border)] text-xs font-mono">ESC</kbd> oder klicken Sie daneben zum Schließen.
              </div>
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="ghost">Abbrechen</Button>
                </DialogClose>
                <DialogClose asChild>
                  <Button variant="primary" onClick={() => toast.success("Aktion bestätigt", "Der Dialog wurde erfolgreich geschlossen.")}>
                    Bestätigen
                  </Button>
                </DialogClose>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Button
            variant="secondary"
            onClick={() => toast.success("Erfolg", "Design-Tokens wurden erfolgreich geladen.")}
          >
            Toast: Success
          </Button>

          <Button
            variant="secondary"
            onClick={() => toast.warning("Warnung", "Abhängigkeit 'daisyUI' benötigt Freigabe.")}
          >
            Toast: Warning
          </Button>

          <Button
            variant="secondary"
            onClick={() => toast.error("Fehler", "Fremde Dateien dürfen nicht berührt werden.")}
          >
            Toast: Error
          </Button>
        </div>
      </section>

      {/* 7. NAVIGATION & SIDEBAR SECTIONS */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <Layout className="w-4 h-4 text-[var(--p-accent)]" />
          <h3 className="text-base font-semibold tracking-tight">7. Navigation & Structure</h3>
        </div>
        <div className="w-full max-w-sm p-3 rounded-[var(--p-radius-lg)] bg-[var(--p-surface-1)] border border-[var(--p-border-subtle)]">
          <SidebarSection
            title="Eigene Agenten"
            badge={3}
            collapsible
            action={<IconButton size="xs" variant="ghost" aria-label="Agent hinzufügen" icon={<Plus className="w-3.5 h-3.5" />} />}
          >
            <ListRow compact title="Research Bot" status="online" />
            <ListRow compact title="Code Reviewer" status="idle" />
            <ListRow compact title="Release Manager" status="offline" />
          </SidebarSection>
        </div>
      </section>

      {/* 8. SKELETONS & EMPTY STATE */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-[var(--p-accent)]" />
          <h3 className="text-base font-semibold tracking-tight">8. Loading Skeletons & Empty States</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-5 rounded-[var(--p-radius-lg)] bg-[var(--p-surface-1)] border border-[var(--p-border-subtle)] space-y-3">
            <span className="text-xs font-semibold text-[var(--p-text-2)]">Shimmer Skeletons</span>
            <div className="flex items-center gap-3">
              <Skeleton variant="circle" />
              <div className="space-y-2 flex-1">
                <Skeleton variant="text" width="60%" />
                <Skeleton variant="text" width="90%" />
              </div>
            </div>
            <Skeleton variant="rect" height={60} />
          </div>

          <div className="rounded-[var(--p-radius-lg)] bg-[var(--p-surface-1)] border border-[var(--p-border-subtle)]">
            <EmptyState
              compact
              icon={<Bot className="w-6 h-6" />}
              title="Keine Unterhaltungen"
              description="Starten Sie einen neuen Chat mit einem Ihrer KI-Agenten."
              action={<Button size="sm" variant="primary">Neuer Chat</Button>}
            />
          </div>
        </div>
      </section>

      {/* 9. PARTICLES BACKGROUND & CASBERRY/ORIGIN ARCHITEKTUR-LÖSUNG */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <Cpu className="w-4 h-4 text-[var(--p-accent)]" />
          <h3 className="text-base font-semibold tracking-tight">9. Ambient Particles (Casberry / Grok Bot Stil)</h3>
        </div>
        <div className="relative overflow-hidden p-6 rounded-[var(--p-radius-lg)] bg-[var(--p-surface-2)] border border-[var(--p-border)] min-h-[160px] flex flex-col justify-between">
          <ParticlesBackground density={35} speed={0.35} interactive />
          <div className="relative z-10 max-w-lg space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-[var(--p-accent)] bg-[var(--p-accent-subtle)] px-2 py-0.5 rounded-full border border-[rgba(56,189,248,0.25)]">
                Zero-Dependency Lösung
              </span>
              <span className="text-xs text-[var(--p-text-3)]">Canvas 2D / 60 FPS</span>
            </div>
            <h4 className="text-sm font-semibold text-[var(--p-text-1)]">
              Elegante Partikel-Vernetzung ohne externe npm-Abhängigkeiten
            </h4>
            <p className="text-xs text-[var(--p-text-2)] leading-relaxed">
              Ersetzt schwere WebGL-Pakete durch ein leichtes Canvas-Element. Reagiert auf Maus-Hover, schont CPU/GPU und pausiert automatisch bei reduzierter Bewegung.
            </p>
          </div>
          <div className="relative z-10 pt-4 flex items-center gap-3 text-xs text-[var(--p-text-3)] border-t border-[var(--p-border-subtle)]">
            <span>Komponente: <code className="text-[var(--p-accent)] font-mono">&lt;ParticlesBackground /&gt;</code></span>
            <span>·</span>
            <span>Status: Bereit für Landing & App-Shell</span>
          </div>
        </div>
      </section>
    </div>
  );
};
