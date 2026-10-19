/**
 * „Veröffentlichen"-Dialog für den Marketplace.
 *
 * Zwei Wege, wie in der Vorlage:
 *   1. „Server veröffentlichen" — Tool, MCP-Server oder klassische Software
 *      (zip / exe / npm …) anbieten.
 *   2. „Tool im Verzeichnis veröffentlichen" — Agent, MCP, Tool oder Company
 *      ohne Binary, dafür mit Konfiguration.
 *
 * In beiden Fällen wird der Eintrag im Market-Katalog angelegt
 * (`useMarketListings().publish`). Bei Software wird zusätzlich die Datei
 * aus dem Upload in eine Object-URL verwandelt, damit der „Download"-Button
 * im Detail-Panel das echte Browser-Download auslösen kann.
 */

import { useState, type ChangeEvent } from "react";
import {
  IconArchive,
  IconBrandGithub,
  IconCheck,
  IconFile,
  IconPackage,
  IconPlugConnected,
  IconRobot,
  IconShoppingBag,
  IconUpload,
  IconX,
} from "@tabler/icons-react";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  type MarketListing,
  type MarketPricing,
  type SoftwareFormat,
  type SoftwarePackage,
  useMarketListings,
} from "@/lib/market/catalog";
import { cn } from "@/lib/utils";

type PublishKind = "tool" | "mcp" | "agent" | "company" | "software";

const KIND_LABEL: Record<PublishKind, string> = {
  tool: "Tool",
  mcp: "MCP-Server",
  agent: "Agent",
  company: "Unternehmen",
  software: "Software-Paket",
};

const SOFTWARE_FORMATS: Array<{
  value: SoftwareFormat;
  label: string;
  hint: string;
}> = [
  { value: "zip", label: ".zip", hint: "Plattformneutrales Archiv" },
  { value: "tar", label: ".tar.gz", hint: "Linux / Quellcode" },
  { value: "exe", label: ".exe", hint: "Windows-Installer" },
  { value: "msi", label: ".msi", hint: "Windows MSI" },
  { value: "dmg", label: ".dmg", hint: "macOS-Image" },
  { value: "appimage", label: "AppImage", hint: "Linux portable" },
  { value: "npm", label: "npm", hint: "Paket auf npmjs.com" },
  { value: "pip", label: "pip", hint: "Python-Paket" },
  { value: "binary", label: "binary", hint: "Statisch gelinkt" },
  { value: "source", label: "source", hint: "Source-Code" },
];

const PLATFORMS: Array<SoftwarePackage["platform"]> = [
  "Alle",
  "Windows",
  "macOS",
  "Linux",
  "Web",
];

const PRICING_KIND: Array<MarketPricing["kind"]> = [
  "free",
  "buy",
  "rent",
  "subscription",
];

const PRICING_LABEL: Record<MarketPricing["kind"], string> = {
  free: "Kostenlos",
  buy: "Einmalig kaufen",
  rent: "Mieten",
  subscription: "Abonnement",
};

type Mode = "binary" | "directory";

const COLORS = [
  "#0ea5e9",
  "#10b981",
  "#a855f7",
  "#f59e0b",
  "#ec4899",
  "#ef4444",
  "#22c55e",
  "#06b6d4",
  "#8b5cf6",
  "#f97316",
];

const ICONS: Record<PublishKind, string> = {
  tool: "IconTool",
  mcp: "IconPlugConnected",
  agent: "IconRobot",
  company: "IconBuildingStore",
  software: "IconPackage",
};

function defaultLogoColor(): string {
  return COLORS[Math.floor(Math.random() * COLORS.length)];
}

export function PublishDialog({
  open,
  onOpenChange,
  onPublished,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  onPublished?: (listing: MarketListing) => void;
}) {
  const { publish } = useMarketListings();
  const [step, setStep] = useState<"mode" | "form">("mode");
  const [mode, setMode] = useState<Mode | null>(null);
  const [kind, setKind] = useState<PublishKind>("software");
  const [name, setName] = useState("");
  const [tagline, setTagline] = useState("");
  const [details, setDetails] = useState("");
  const [category, setCategory] = useState("Entwicklung");
  const [seller, setSeller] = useState("Du");
  const [pricingKind, setPricingKind] = useState<MarketPricing["kind"]>("free");
  const [priceText, setPriceText] = useState("0 €");
  const [pricePeriod, setPricePeriod] = useState<"Tag" | "Woche" | "Monat" | "Jahr">(
    "Monat",
  );
  const [version, setVersion] = useState("1.0.0");
  const [platform, setPlatform] = useState<SoftwarePackage["platform"]>("Alle");
  const [format, setFormat] = useState<SoftwareFormat>("zip");
  const [requirements, setRequirements] = useState("");
  const [logoColor, setLogoColor] = useState(defaultLogoColor());
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setStep("mode");
    setMode(null);
    setKind("software");
    setName("");
    setTagline("");
    setDetails("");
    setCategory("Entwicklung");
    setSeller("Du");
    setPricingKind("free");
    setPriceText("0 €");
    setPricePeriod("Monat");
    setVersion("1.0.0");
    setPlatform("Alle");
    setFormat("zip");
    setRequirements("");
    setLogoColor(defaultLogoColor());
    setUploadedFile(null);
    setError(null);
  };

  const close = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const onUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadedFile(file);
    // Auto-Format anhand der Dateiendung erraten
    const ext = file.name.split(".").pop()?.toLowerCase();
    const match = SOFTWARE_FORMATS.find((f) => f.value === ext);
    if (match) setFormat(match.value);
    if (!name) setName(file.name.replace(/\.[^.]+$/, ""));
    if (!version) setVersion("1.0.0");
  };

  const submit = () => {
    if (!name.trim()) {
      setError("Name ist erforderlich.");
      return;
    }
    if (mode === "binary" && !uploadedFile) {
      setError("Bitte lade eine Datei hoch, die andere herunterladen können.");
      return;
    }

    let pricing: MarketPricing;
    if (pricingKind === "free") {
      pricing = { kind: "free", label: "Kostenlos" };
    } else if (pricingKind === "buy") {
      pricing = { kind: "buy", price: priceText };
    } else if (pricingKind === "rent") {
      pricing = { kind: "rent", price: priceText, period: pricePeriod };
    } else {
      pricing = {
        kind: "subscription",
        price: priceText,
        period: pricePeriod === "Tag" ? "Monat" : pricePeriod === "Woche" ? "Monat" : (pricePeriod as "Monat" | "Jahr"),
      };
    }

    let download: SoftwarePackage | undefined;
    if (mode === "binary") {
      const file = uploadedFile as File;
      const url = URL.createObjectURL(file);
      const sizeMb = Math.max(0.1, +(file.size / (1024 * 1024)).toFixed(1));
      download = {
        sizeMb,
        format,
        url,
        fileName: file.name,
        platform,
        version,
        requirements: requirements
          ? requirements.split("\n").map((s) => s.trim()).filter(Boolean)
          : undefined,
      };
    }

    const listing = publish({
      kind,
      name: name.trim(),
      tagline: tagline.trim() || "Frisch veröffentlicht im Marketplace.",
      seller: seller.trim() || "Du",
      pricing,
      category: category.trim() || "Allgemein",
      logoColor,
      icon: ICONS[kind],
      details:
        details.trim() ||
        "Weitere Details folgen. Du kannst diesen Eintrag später bearbeiten.",
      badge: "NEU",
      ...(download ? { download } : {}),
    });

    onPublished?.(listing);
    close(false);
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent
        className="max-w-2xl"
        closeLabel="Schließen"
        overlayClassName="bg-black/25 supports-backdrop-filter:backdrop-blur-none"
      >
        <DialogHeader>
          <DialogTitle>
            {step === "mode"
              ? "Im Marketplace veröffentlichen"
              : mode === "binary"
                ? "Server / Software veröffentlichen"
                : "Tool im Verzeichnis veröffentlichen"}
          </DialogTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            {step === "mode"
              ? "Wähle, was du anbieten willst — einen klassischen Download oder einen Eintrag im Verzeichnis."
              : mode === "binary"
                ? "Lade dein Paket hoch. Andere Nutzer können es dann mit einem Klick herunterladen."
                : "Beschreibe dein Tool, deinen Agent oder dein Unternehmen. Es erscheint im Verzeichnis und kann installiert werden."}
          </p>
        </DialogHeader>

        <DialogBody>
          {step === "mode" ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => {
                  setMode("binary");
                  setKind("software");
                  setStep("form");
                }}
                className="group flex flex-col items-start gap-2 rounded-2xl border border-white/10 bg-white/[0.02] p-4 text-left transition hover:border-sky-400/40 hover:bg-sky-500/5"
              >
                <div className="flex size-10 items-center justify-center rounded-xl bg-sky-500/15 text-sky-300">
                  <IconArchive className="size-5" />
                </div>
                <p className="text-sm font-semibold">Server / Software veröffentlichen</p>
                <p className="text-xs text-muted-foreground">
                  Lade ein .zip, .exe, .msi, .dmg, .AppImage, npm- oder pip-Paket
                  hoch. Andere Nutzer laden es mit einem Klick herunter.
                </p>
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode("directory");
                  setKind("tool");
                  setStep("form");
                }}
                className="group flex flex-col items-start gap-2 rounded-2xl border border-white/10 bg-white/[0.02] p-4 text-left transition hover:border-violet-400/40 hover:bg-violet-500/5"
              >
                <div className="flex size-10 items-center justify-center rounded-xl bg-violet-500/15 text-violet-300">
                  <IconShoppingBag className="size-5" />
                </div>
                <p className="text-sm font-semibold">Tool im Verzeichnis veröffentlichen</p>
                <p className="text-xs text-muted-foreground">
                  Biete einen Agent, MCP-Server, ein Tool oder ein
                  Unternehmen ohne Binary an. Konfiguration reicht.
                </p>
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Modus-Auswahl: Tool / MCP / Agent / Company */}
              {mode === "directory" ? (
                <div>
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Was veröffentlichst du?
                  </label>
                  <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {(["tool", "mcp", "agent", "company"] as PublishKind[]).map((k) => {
                      const active = kind === k;
                      const Icon =
                        k === "tool" ? IconPackage : k === "mcp" ? IconPlugConnected : k === "agent" ? IconRobot : IconShoppingBag;
                      return (
                        <button
                          key={k}
                          type="button"
                          onClick={() => setKind(k)}
                          className={cn(
                            "flex flex-col items-center gap-1 rounded-xl border px-3 py-3 text-xs font-medium transition",
                            active
                              ? "border-sky-400/50 bg-sky-500/10 text-sky-200"
                              : "border-white/10 bg-white/[0.02] text-muted-foreground hover:border-white/20 hover:bg-white/[0.05] hover:text-foreground",
                          )}
                        >
                          <Icon className="size-4" />
                          {KIND_LABEL[k]}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              {/* Datei-Upload */}
              {mode === "binary" ? (
                <div>
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Datei hochladen
                  </label>
                  <label className="mt-2 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-white/15 bg-white/[0.02] p-6 text-center transition hover:border-sky-400/40 hover:bg-sky-500/5">
                    {uploadedFile ? (
                      <>
                        <IconFile className="size-6 text-sky-300" />
                        <p className="text-sm font-semibold">{uploadedFile.name}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {(uploadedFile.size / (1024 * 1024)).toFixed(1)} MB
                        </p>
                      </>
                    ) : (
                      <>
                        <IconUpload className="size-6 text-muted-foreground" />
                        <p className="text-sm font-semibold">Klicken oder Datei hierher ziehen</p>
                        <p className="text-[11px] text-muted-foreground">
                          .zip, .tar.gz, .exe, .msi, .dmg, .AppImage, npm, pip
                        </p>
                      </>
                    )}
                    <input
                      accept=".zip,.tar,.gz,.exe,.msi,.dmg,.appimage,.tgz,.whl,.pkg"
                      className="hidden"
                      onChange={onUpload}
                      type="file"
                    />
                  </label>

                  <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                    <div>
                      <label className="text-[11px] font-medium text-muted-foreground">
                        Format
                      </label>
                      <select
                        value={format}
                        onChange={(e) => setFormat(e.target.value as SoftwareFormat)}
                        className="mt-1 w-full rounded-md border border-white/10 bg-white/[0.04] px-2 py-1.5 text-xs"
                      >
                        {SOFTWARE_FORMATS.map((f) => (
                          <option key={f.value} value={f.value}>
                            {f.label} — {f.hint}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-[11px] font-medium text-muted-foreground">
                        Plattform
                      </label>
                      <select
                        value={platform}
                        onChange={(e) =>
                          setPlatform(e.target.value as SoftwarePackage["platform"])
                        }
                        className="mt-1 w-full rounded-md border border-white/10 bg-white/[0.04] px-2 py-1.5 text-xs"
                      >
                        {PLATFORMS.map((p) => (
                          <option key={p} value={p}>
                            {p}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-[11px] font-medium text-muted-foreground">
                        Version
                      </label>
                      <input
                        value={version}
                        onChange={(e) => setVersion(e.target.value)}
                        className="mt-1 w-full rounded-md border border-white/10 bg-white/[0.04] px-2 py-1.5 text-xs"
                        placeholder="1.0.0"
                      />
                    </div>
                  </div>

                  <div className="mt-2">
                    <label className="text-[11px] font-medium text-muted-foreground">
                      Voraussetzungen (eine pro Zeile)
                    </label>
                    <textarea
                      value={requirements}
                      onChange={(e) => setRequirements(e.target.value)}
                      className="mt-1 w-full rounded-md border border-white/10 bg-white/[0.04] p-2 text-xs"
                      placeholder={"z. B. Windows 10+\nPowerShell 5.1+"}
                      rows={2}
                    />
                  </div>
                </div>
              ) : null}

              {/* Name, Tagline, Details */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="text-[11px] font-medium text-muted-foreground">
                    Name
                  </label>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="mt-1 w-full rounded-md border border-white/10 bg-white/[0.04] px-2 py-1.5 text-sm"
                    placeholder="z. B. Helium CLI"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-medium text-muted-foreground">
                    Anbieter
                  </label>
                  <input
                    value={seller}
                    onChange={(e) => setSeller(e.target.value)}
                    className="mt-1 w-full rounded-md border border-white/10 bg-white/[0.04] px-2 py-1.5 text-sm"
                    placeholder="Wer bietet es an?"
                  />
                </div>
              </div>
              <div>
                <label className="text-[11px] font-medium text-muted-foreground">
                  Kurzbeschreibung
                </label>
                <input
                  value={tagline}
                  onChange={(e) => setTagline(e.target.value)}
                  className="mt-1 w-full rounded-md border border-white/10 bg-white/[0.04] px-2 py-1.5 text-sm"
                  placeholder="Ein Satz, der erklärt, was es tut."
                />
              </div>
              <div>
                <label className="text-[11px] font-medium text-muted-foreground">
                  Ausführliche Beschreibung
                </label>
                <textarea
                  value={details}
                  onChange={(e) => setDetails(e.target.value)}
                  className="mt-1 w-full rounded-md border border-white/10 bg-white/[0.04] p-2 text-sm"
                  rows={3}
                  placeholder="Features, Voraussetzungen, Screenshots, was auch immer hilft."
                />
              </div>

              {/* Kategorie + Logo-Farbe */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="text-[11px] font-medium text-muted-foreground">
                    Kategorie
                  </label>
                  <input
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="mt-1 w-full rounded-md border border-white/10 bg-white/[0.04] px-2 py-1.5 text-sm"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-medium text-muted-foreground">
                    Logo-Farbe
                  </label>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {COLORS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setLogoColor(c)}
                        className={cn(
                          "size-7 rounded-lg border-2",
                          logoColor === c
                            ? "border-foreground"
                            : "border-transparent",
                        )}
                        style={{ background: c }}
                        aria-label={c}
                      />
                    ))}
                  </div>
                </div>
              </div>

              {/* Pricing */}
              <div>
                <label className="text-[11px] font-medium text-muted-foreground">
                  Preis
                </label>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {PRICING_KIND.map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setPricingKind(p)}
                      className={cn(
                        "rounded-full px-3 py-1 text-xs font-medium transition",
                        pricingKind === p
                          ? "bg-foreground text-background"
                          : "bg-white/[0.04] text-muted-foreground hover:bg-white/[0.08]",
                      )}
                    >
                      {PRICING_LABEL[p]}
                    </button>
                  ))}
                </div>
                {pricingKind !== "free" ? (
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <input
                      value={priceText}
                      onChange={(e) => setPriceText(e.target.value)}
                      className="rounded-md border border-white/10 bg-white/[0.04] px-2 py-1.5 text-sm"
                      placeholder="29 €"
                    />
                    {pricingKind !== "buy" ? (
                      <select
                        value={pricePeriod}
                        onChange={(e) => setPricePeriod(e.target.value as "Tag" | "Woche" | "Monat" | "Jahr")}
                        className="rounded-md border border-white/10 bg-white/[0.04] px-2 py-1.5 text-sm"
                      >
                        <option value="Tag">Tag</option>
                        <option value="Woche">Woche</option>
                        <option value="Monat">Monat</option>
                        <option value="Jahr">Jahr</option>
                      </select>
                    ) : null}
                  </div>
                ) : null}
              </div>

              {error ? (
                <div className="flex items-center justify-between gap-2 rounded-md border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
                  <span>{error}</span>
                  <button type="button" onClick={() => setError(null)}>
                    <IconX className="size-3" />
                  </button>
                </div>
              ) : null}
            </div>
          )}
        </DialogBody>

        <DialogFooter>
          {step === "form" ? (
            <Button variant="ghost" onClick={() => setStep("mode")} type="button">
              Zurück
            </Button>
          ) : null}
          <Button variant="ghost" onClick={() => close(false)} type="button">
            Abbrechen
          </Button>
          {step === "form" ? (
            <Button onClick={submit} type="button">
              <IconCheck className="size-4" />
              Veröffentlichen
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
