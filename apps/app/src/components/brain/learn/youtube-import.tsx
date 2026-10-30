import { useState, useEffect } from "react";
import {
  IconBrandYoutube,
  IconSparkles,
  IconRefresh,
  IconDownload,
  IconUpload,
  IconCheck,
  IconAlertCircle,
  IconExternalLink,
  IconClock,
  IconFolder,
  IconFileText,
  IconSearch,
  IconPlayerPlay,
  IconCopy,
  IconDatabase,
  IconEye,
  IconChecklist,
} from "@tabler/icons-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export interface TranscriberSegment {
  start: number;
  end: number;
  text: string;
}

export interface YtVideoItem {
  videoId: string;
  channelId?: string | null;
  channelTitle?: string | null;
  folder: string;
  title: string;
  url: string;
  publishedAt?: string | null;
  transcriptStatus: "missing" | "fetching" | "available" | "failed";
  transcriptText?: string | null;
  transcriptSegments?: TranscriberSegment[] | null;
  notePath?: string | null;
  watched: boolean;
  durationSeconds?: number | null;
  rawMetadata?: Record<string, unknown> | null;
}

export interface YouTubeStats {
  totalVideos: number;
  totalTranscribed: number;
  totalMissingTranscripts: number;
  totalWatched: number;
  totalDurationSeconds: number;
  folders: { folder: string; count: number }[];
}

export function YouTubeImportPanel({
  onOpenNote,
  className,
}: {
  onOpenNote?: (path: string, line?: number) => void;
  className?: string;
}) {
  const [videos, setVideos] = useState<YtVideoItem[]>([]);
  const [stats, setStats] = useState<YouTubeStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"supabase" | "json" | "single" | "seed">("seed");
  const [selectedVideo, setSelectedVideo] = useState<YtVideoItem | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedFolder, setSelectedFolder] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [statusMessage, setStatusMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Form states
  const [supabaseUrl, setSupabaseUrl] = useState("");
  const [anonKey, setAnonKey] = useState("");
  const [jsonInput, setJsonInput] = useState("");
  const [singleUrl, setSingleUrl] = useState("");
  const [targetFolder, setTargetFolder] = useState("YouTube");

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [videosRes, statsRes] = await Promise.all([
        fetch("/api/brain/learn/youtube/videos").then((r) => r.json()),
        fetch("/api/brain/learn/youtube/stats").then((r) => r.json()),
      ]);

      if (videosRes.success) {
        setVideos(videosRes.videos || []);
      }
      if (statsRes.success) {
        setStats(statsRes);
      }
    } catch (err: any) {
      console.warn("Error loading YouTube data:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleSeedImport = async () => {
    setIsProcessing(true);
    setStatusMessage(null);
    try {
      const res = await fetch("/api/brain/learn/youtube/seed-dod", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();
      if (data.success) {
        setStatusMessage({
          type: "success",
          text: `Erfolgreich importiert: ${data.importedVideosCount} Videos in ${data.importedFoldersCount} Ordner, ${data.transcribedCount} Transkripte indexiert!`,
        });
        await loadData();
      } else {
        setStatusMessage({
          type: "error",
          text: data.error || (data.errors && data.errors[0]) || "Import fehlgeschlagen.",
        });
      }
    } catch (err: any) {
      setStatusMessage({ type: "error", text: err.message || "Netzwerkfehler beim Seed-Import." });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSupabaseImport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabaseUrl.trim() || !anonKey.trim()) return;

    setIsProcessing(true);
    setStatusMessage(null);
    try {
      const res = await fetch("/api/brain/learn/youtube/import/focus-tube", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supabaseUrl: supabaseUrl.trim(),
          anonKey: anonKey.trim(),
          targetFolderPrefix: targetFolder.trim() || "YouTube",
          autoTranscribe: true,
          createNotes: true,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setStatusMessage({
          type: "success",
          text: `Focus-Tube Sync abgeschlossen: ${data.importedVideosCount} Videos importiert!`,
        });
        await loadData();
      } else {
        setStatusMessage({
          type: "error",
          text: data.error || "Fehler beim Focus-Tube-Filter Import.",
        });
      }
    } catch (err: any) {
      setStatusMessage({ type: "error", text: err.message || "Netzwerkfehler beim Supabase-Import." });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleJsonImport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!jsonInput.trim()) return;

    setIsProcessing(true);
    setStatusMessage(null);
    try {
      let parsedData: unknown;
      try {
        parsedData = JSON.parse(jsonInput);
      } catch {
        throw new Error("Ungültiges JSON-Format.");
      }

      const res = await fetch("/api/brain/learn/youtube/import/json", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          data: parsedData,
          targetFolderPrefix: targetFolder.trim() || "YouTube",
          autoTranscribe: true,
          createNotes: true,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setStatusMessage({
          type: "success",
          text: `JSON-Import abgeschlossen: ${data.importedVideosCount} Videos importiert!`,
        });
        setJsonInput("");
        await loadData();
      } else {
        setStatusMessage({ type: "error", text: data.error || "JSON-Import fehlgeschlagen." });
      }
    } catch (err: any) {
      setStatusMessage({ type: "error", text: err.message || "Fehler beim Verarbeiten des JSON." });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSingleUrlImport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!singleUrl.trim()) return;

    setIsProcessing(true);
    setStatusMessage(null);
    try {
      const res = await fetch("/api/brain/learn/youtube/import/url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: singleUrl.trim(),
          folder: `YouTube/${targetFolder.trim() || "Allgemein"}`,
          autoTranscribe: true,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setStatusMessage({
          type: "success",
          text: `Video erfolgreich importiert!`,
        });
        setSingleUrl("");
        await loadData();
      } else {
        setStatusMessage({ type: "error", text: data.error || "Import fehlgeschlagen." });
      }
    } catch (err: any) {
      setStatusMessage({ type: "error", text: err.message || "Fehler beim Importieren des Videos." });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleTranscribe = async (videoId: string) => {
    try {
      setVideos((prev) =>
        prev.map((v) => (v.videoId === videoId ? { ...v, transcriptStatus: "fetching" } : v)),
      );
      const res = await fetch(`/api/brain/learn/youtube/transcribe/${videoId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force: true }),
      });
      const data = await res.json();
      if (data.success && data.video) {
        setVideos((prev) => prev.map((v) => (v.videoId === videoId ? data.video : v)));
        if (selectedVideo?.videoId === videoId) {
          setSelectedVideo(data.video);
        }
      }
      await loadData();
    } catch (err: any) {
      console.warn("Transcribe error:", err);
    }
  };

  const handleGenerateNote = async (videoId: string) => {
    try {
      const res = await fetch(`/api/brain/learn/youtube/generate-note/${videoId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();
      if (data.success) {
        await loadData();
        if (onOpenNote && data.notePath) {
          onOpenNote(data.notePath);
        }
      }
    } catch (err: any) {
      console.warn("Generate note error:", err);
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const formatSeconds = (sec?: number | null) => {
    if (!sec) return "–";
    const mins = Math.floor(sec / 60);
    const s = sec % 60;
    return `${mins}:${s.toString().padStart(2, "0")}`;
  };

  const filteredVideos = videos.filter((v) => {
    if (selectedFolder !== "all" && v.folder !== selectedFolder) return false;
    if (statusFilter !== "all" && v.transcriptStatus !== statusFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        v.title.toLowerCase().includes(q) ||
        v.videoId.toLowerCase().includes(q) ||
        (v.channelTitle && v.channelTitle.toLowerCase().includes(q))
      );
    }
    return true;
  });

  return (
    <div className={cn("flex flex-col h-full bg-background text-foreground", className)}>
      {/* Header */}
      <div className="border-b p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-muted/20">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-lg bg-red-600/10 text-red-600 dark:text-red-400">
            <IconBrandYoutube className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-semibold flex items-center gap-2">
              YouTube & Focus-Tube-Filter
              <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-normal">
                Lane 5 · Spark-Learn
              </span>
            </h2>
            <p className="text-xs text-muted-foreground">
              Importiere Ordner aus focus-tube-filter, generiere zeitgestempelte Transkripte und Spark-Notizen.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={loadData}
            disabled={isLoading || isProcessing}
            className="h-8 gap-1.5 text-xs"
          >
            <IconRefresh className={cn("w-3.5 h-3.5", isLoading && "animate-spin")} />
            Aktualisieren
          </Button>

          <Button
            size="sm"
            onClick={handleSeedImport}
            disabled={isProcessing}
            className="h-8 gap-1.5 text-xs bg-red-600 hover:bg-red-700 text-white font-medium"
          >
            <IconSparkles className="w-3.5 h-3.5" />
            1-Klick Seed Import (5 Videos)
          </Button>
        </div>
      </div>

      {/* KPI Stats Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 p-4 border-b bg-muted/10 text-xs">
        <div className="p-2.5 rounded-lg border bg-card/60">
          <div className="text-muted-foreground flex items-center gap-1.5 mb-1">
            <IconBrandYoutube className="w-3.5 h-3.5 text-red-500" />
            Videos Gesamt
          </div>
          <div className="text-lg font-bold">{stats?.totalVideos ?? videos.length}</div>
        </div>

        <div className="p-2.5 rounded-lg border bg-card/60">
          <div className="text-muted-foreground flex items-center gap-1.5 mb-1">
            <IconCheck className="w-3.5 h-3.5 text-emerald-500" />
            Transkribiert
          </div>
          <div className="text-lg font-bold text-emerald-600 dark:text-emerald-400">
            {stats?.totalTranscribed ?? 0}
          </div>
        </div>

        <div className="p-2.5 rounded-lg border bg-card/60">
          <div className="text-muted-foreground flex items-center gap-1.5 mb-1">
            <IconFolder className="w-3.5 h-3.5 text-blue-500" />
            Ordner
          </div>
          <div className="text-lg font-bold">{stats?.folders?.length ?? 1}</div>
        </div>

        <div className="p-2.5 rounded-lg border bg-card/60">
          <div className="text-muted-foreground flex items-center gap-1.5 mb-1">
            <IconEye className="w-3.5 h-3.5 text-purple-500" />
            Gesehen
          </div>
          <div className="text-lg font-bold">{stats?.totalWatched ?? 0}</div>
        </div>

        <div className="p-2.5 rounded-lg border bg-card/60">
          <div className="text-muted-foreground flex items-center gap-1.5 mb-1">
            <IconClock className="w-3.5 h-3.5 text-amber-500" />
            Gesamtdauer
          </div>
          <div className="text-lg font-bold">
            {stats ? Math.round((stats.totalDurationSeconds / 3600) * 10) / 10 : 0} h
          </div>
        </div>
      </div>

      {/* Status banner */}
      {statusMessage && (
        <div
          className={cn(
            "mx-4 mt-3 p-3 rounded-lg flex items-center gap-2 text-xs",
            statusMessage.type === "success"
              ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20"
              : "bg-destructive/10 text-destructive border border-destructive/20",
          )}
        >
          {statusMessage.type === "success" ? (
            <IconCheck className="w-4 h-4 shrink-0 text-emerald-500" />
          ) : (
            <IconAlertCircle className="w-4 h-4 shrink-0 text-destructive" />
          )}
          <span className="flex-1">{statusMessage.text}</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setStatusMessage(null)}
            className="h-6 w-6 p-0 text-muted-foreground"
          >
            ✕
          </Button>
        </div>
      )}

      {/* Main Content: Split View */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 min-h-0 overflow-hidden">
        {/* Left column: Import tools & Video Table (8 cols) */}
        <div className="lg:col-span-7 xl:col-span-8 flex flex-col border-r overflow-hidden">
          {/* Import Navigation Tabs */}
          <div className="flex items-center gap-1 border-b px-4 py-2 bg-muted/20 text-xs">
            <span className="text-muted-foreground mr-2 font-medium">Import:</span>
            <Button
              variant={activeTab === "seed" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setActiveTab("seed")}
              className="h-7 text-xs gap-1"
            >
              <IconSparkles className="w-3.5 h-3.5 text-amber-500" />
              DoD Preset
            </Button>
            <Button
              variant={activeTab === "supabase" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setActiveTab("supabase")}
              className="h-7 text-xs gap-1"
            >
              <IconDatabase className="w-3.5 h-3.5 text-blue-500" />
              Focus-Tube (Supabase)
            </Button>
            <Button
              variant={activeTab === "json" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setActiveTab("json")}
              className="h-7 text-xs gap-1"
            >
              <IconUpload className="w-3.5 h-3.5 text-purple-500" />
              JSON Export
            </Button>
            <Button
              variant={activeTab === "single" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setActiveTab("single")}
              className="h-7 text-xs gap-1"
            >
              <IconBrandYoutube className="w-3.5 h-3.5 text-red-500" />
              Einzelnes Video
            </Button>
          </div>

          {/* Import Forms Drawer / Area */}
          <div className="p-4 border-b bg-muted/5 text-xs">
            {activeTab === "seed" && (
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3 rounded-lg border bg-card/60">
                <div>
                  <h4 className="font-semibold text-sm flex items-center gap-1.5">
                    <IconChecklist className="w-4 h-4 text-emerald-500" />
                    Definition of Done (DoD) Schnell-Setup
                  </h4>
                  <p className="text-muted-foreground text-xs mt-0.5">
                    Importiert 1 Ordner ("AI & Modern Web") mit 5 kuratierten Fachvideos (Karpathy, Rich Harris, Lee Robinson, Whisper, TypeScript), lädt Zeitstempel-Transkripte, legt Notizen in <code>_spark/</code> an und verlinkt Browser-Folders.
                  </p>
                </div>
                <Button
                  onClick={handleSeedImport}
                  disabled={isProcessing}
                  className="shrink-0 h-8 text-xs bg-red-600 hover:bg-red-700 text-white gap-1.5"
                >
                  <IconSparkles className="w-3.5 h-3.5" />
                  Jetzt importieren & indexieren
                </Button>
              </div>
            )}

            {activeTab === "supabase" && (
              <form onSubmit={handleSupabaseImport} className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[11px] font-medium text-muted-foreground mb-1">
                      Supabase Project URL
                    </label>
                    <Input
                      placeholder="https://xyzcompany.supabase.co"
                      value={supabaseUrl}
                      onChange={(e) => setSupabaseUrl(e.target.value)}
                      className="h-8 text-xs font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-muted-foreground mb-1">
                      Anon / Service Key (wird nicht gespeichert)
                    </label>
                    <Input
                      type="password"
                      placeholder="eyJhbGciOiJIUzI1NiIsIn..."
                      value={anonKey}
                      onChange={(e) => setAnonKey(e.target.value)}
                      className="h-8 text-xs font-mono"
                    />
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-muted-foreground">
                    Liest <code>channel_folders</code>, <code>cached_videos</code>, <code>watched_videos</code> read-only aus.
                  </span>
                  <Button
                    type="submit"
                    disabled={isProcessing || !supabaseUrl || !anonKey}
                    size="sm"
                    className="h-8 text-xs gap-1.5"
                  >
                    <IconDownload className="w-3.5 h-3.5" />
                    Focus-Tube synchronisieren
                  </Button>
                </div>
              </form>
            )}

            {activeTab === "json" && (
              <form onSubmit={handleJsonImport} className="space-y-2.5">
                <textarea
                  rows={3}
                  placeholder="Focus-Tube-Filter JSON Export hier einfügen ({ channel_folders: [...], cached_videos: [...] })..."
                  value={jsonInput}
                  onChange={(e) => setJsonInput(e.target.value)}
                  className="w-full text-xs font-mono p-2 rounded-md border bg-background resize-none focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <div className="flex items-center justify-end">
                  <Button
                    type="submit"
                    disabled={isProcessing || !jsonInput.trim()}
                    size="sm"
                    className="h-8 text-xs gap-1.5"
                  >
                    <IconUpload className="w-3.5 h-3.5" />
                    JSON Importieren
                  </Button>
                </div>
              </form>
            )}

            {activeTab === "single" && (
              <form onSubmit={handleSingleUrlImport} className="flex gap-2">
                <Input
                  placeholder="YouTube Video URL oder ID (z. B. https://www.youtube.com/watch?v=kCc8FmEb1nY)..."
                  value={singleUrl}
                  onChange={(e) => setSingleUrl(e.target.value)}
                  className="h-8 text-xs flex-1"
                />
                <Button
                  type="submit"
                  disabled={isProcessing || !singleUrl.trim()}
                  size="sm"
                  className="h-8 text-xs gap-1.5 shrink-0"
                >
                  <IconDownload className="w-3.5 h-3.5" />
                  Video Importieren
                </Button>
              </form>
            )}
          </div>

          {/* Filter Bar */}
          <div className="flex items-center gap-2 p-3 border-b bg-muted/10 text-xs">
            <div className="relative flex-1">
              <IconSearch className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-muted-foreground" />
              <Input
                placeholder="Videos durchsuchen..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-8 pl-8 text-xs"
              />
            </div>

            <select
              value={selectedFolder}
              onChange={(e) => setSelectedFolder(e.target.value)}
              className="h-8 text-xs px-2 rounded-md border bg-background text-foreground"
            >
              <option value="all">Alle Ordner</option>
              {stats?.folders?.map((f) => (
                <option key={f.folder} value={f.folder}>
                  {f.folder} ({f.count})
                </option>
              ))}
            </select>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="h-8 text-xs px-2 rounded-md border bg-background text-foreground"
            >
              <option value="all">Alle Status</option>
              <option value="available">Transkribiert ✅</option>
              <option value="missing">Transkript fehlt ⏳</option>
              <option value="fetching">Wird geladen 🔄</option>
            </select>
          </div>

          {/* Video List */}
          <div className="flex-1 overflow-y-auto divide-y">
            {isLoading ? (
              <div className="p-4 space-y-3">
                <Skeleton className="h-14 w-full rounded-lg" />
                <Skeleton className="h-14 w-full rounded-lg" />
                <Skeleton className="h-14 w-full rounded-lg" />
              </div>
            ) : filteredVideos.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground text-xs">
                Keine YouTube-Videos gefunden. Klicke auf "1-Klick Seed Import", um 5 kuratierte Videos einzupflegen.
              </div>
            ) : (
              filteredVideos.map((video) => {
                const isSelected = selectedVideo?.videoId === video.videoId;
                return (
                  <div
                    key={video.videoId}
                    onClick={() => setSelectedVideo(video)}
                    className={cn(
                      "p-3.5 flex items-start justify-between gap-3 cursor-pointer transition-colors hover:bg-muted/30",
                      isSelected && "bg-primary/5 border-l-2 border-primary",
                    )}
                  >
                    <div className="flex items-start gap-3 min-w-0 flex-1">
                      <div className="w-8 h-8 rounded-lg bg-red-600/10 text-red-600 dark:text-red-400 flex items-center justify-center shrink-0 mt-0.5">
                        <IconPlayerPlay className="w-4 h-4" />
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className="font-medium text-xs truncate text-foreground hover:underline">
                            {video.title}
                          </span>
                          {video.watched && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-600 font-medium">
                              Gesehen
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-3 text-[11px] text-muted-foreground flex-wrap">
                          <span>{video.channelTitle || "YouTube"}</span>
                          <span>·</span>
                          <span className="flex items-center gap-1">
                            <IconFolder className="w-3 h-3" />
                            {video.folder}
                          </span>
                          <span>·</span>
                          <span className="flex items-center gap-1">
                            <IconClock className="w-3 h-3" />
                            {formatSeconds(video.durationSeconds)}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {video.transcriptStatus === "available" ? (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1">
                          <IconCheck className="w-3 h-3" />
                          Transkript bereit
                        </span>
                      ) : video.transcriptStatus === "fetching" ? (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-600 font-medium flex items-center gap-1 animate-pulse">
                          <IconRefresh className="w-3 h-3 animate-spin" />
                          Lädt...
                        </span>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleTranscribe(video.videoId);
                          }}
                          className="h-6 text-[10px] px-2 gap-1"
                        >
                          <IconSparkles className="w-3 h-3 text-amber-500" />
                          Transkribieren
                        </Button>
                      )}

                      <a
                        href={video.url}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="p-1 rounded text-muted-foreground hover:text-foreground"
                        title="Auf YouTube ansehen"
                      >
                        <IconExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right column: Video Inspector & Clickable Timestamps (4/5 cols) */}
        <div className="lg:col-span-5 xl:col-span-4 flex flex-col bg-muted/5 overflow-hidden">
          {selectedVideo ? (
            <div className="flex flex-col h-full overflow-hidden">
              <div className="p-4 border-b bg-background">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <h3 className="text-sm font-semibold leading-tight">{selectedVideo.title}</h3>
                  <a
                    href={selectedVideo.url}
                    target="_blank"
                    rel="noreferrer"
                    className="p-1 text-muted-foreground hover:text-foreground shrink-0"
                  >
                    <IconExternalLink className="w-4 h-4" />
                  </a>
                </div>

                <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap mb-3">
                  <span>Kanal: {selectedVideo.channelTitle || "–"}</span>
                  <span>·</span>
                  <span>Dauer: {formatSeconds(selectedVideo.durationSeconds)}</span>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleGenerateNote(selectedVideo.videoId)}
                    className="h-7 text-xs gap-1.5 flex-1"
                  >
                    <IconFileText className="w-3.5 h-3.5 text-blue-500" />
                    {selectedVideo.notePath ? "Notiz aktualisieren" : "In Spark anlegen"}
                  </Button>

                  {selectedVideo.notePath && onOpenNote && (
                    <Button
                      size="sm"
                      onClick={() => onOpenNote(selectedVideo.notePath!)}
                      className="h-7 text-xs gap-1.5 flex-1"
                    >
                      <IconExternalLink className="w-3.5 h-3.5" />
                      Notiz öffnen
                    </Button>
                  )}
                </div>

                {selectedVideo.notePath && (
                  <div className="mt-2 text-[11px] text-muted-foreground font-mono truncate">
                    📄 {selectedVideo.notePath}
                  </div>
                )}
              </div>

              {/* Timestamped Transcript View */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <IconClock className="w-3.5 h-3.5 text-red-500" />
                    Zeitstempel-Transkript ({selectedVideo.transcriptSegments?.length ?? 0} Abschnitte)
                  </span>

                  {selectedVideo.transcriptText && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        copyToClipboard(selectedVideo.transcriptText!, selectedVideo.videoId)
                      }
                      className="h-6 text-[11px] gap-1 px-1.5"
                    >
                      {copiedId === selectedVideo.videoId ? (
                        <IconCheck className="w-3 h-3 text-emerald-500" />
                      ) : (
                        <IconCopy className="w-3 h-3" />
                      )}
                      Kopieren
                    </Button>
                  )}
                </div>

                {selectedVideo.transcriptSegments && selectedVideo.transcriptSegments.length > 0 ? (
                  <div className="space-y-2">
                    {selectedVideo.transcriptSegments.map((seg, idx) => {
                      const mins = Math.floor(seg.start / 60);
                      const secs = Math.floor(seg.start % 60);
                      const timeStr = `${mins}:${secs.toString().padStart(2, "0")}`;
                      const timeUrl = `https://www.youtube.com/watch?v=${selectedVideo.videoId}&t=${Math.floor(seg.start)}s`;

                      return (
                        <div
                          key={idx}
                          className="p-2.5 rounded-lg border bg-card/60 text-xs hover:border-primary/40 transition-colors"
                        >
                          <div className="flex items-center justify-between mb-1">
                            <a
                              href={timeUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 font-mono text-[11px] font-semibold text-red-600 dark:text-red-400 bg-red-500/10 px-1.5 py-0.5 rounded hover:underline"
                            >
                              <IconPlayerPlay className="w-2.5 h-2.5" />
                              {timeStr}
                            </a>
                            <span className="text-[10px] text-muted-foreground">
                              bis {Math.floor(seg.end / 60)}:{Math.floor(seg.end % 60).toString().padStart(2, "0")}
                            </span>
                          </div>
                          <p className="text-foreground/90 leading-relaxed">{seg.text}</p>
                        </div>
                      );
                    })}
                  </div>
                ) : selectedVideo.transcriptText ? (
                  <div className="p-3 rounded-lg border bg-card/60 text-xs leading-relaxed text-foreground/90 whitespace-pre-wrap">
                    {selectedVideo.transcriptText}
                  </div>
                ) : (
                  <div className="p-6 text-center text-xs text-muted-foreground">
                    Kein Transkript vorhanden. Klicke oben auf "Transkribieren", um Untertitel abzurufen.
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-muted-foreground text-xs">
              <IconBrandYoutube className="w-10 h-10 text-muted-foreground/30 mb-2" />
              <p className="font-medium text-foreground">Kein Video ausgewählt</p>
              <p className="mt-1">Wähle links ein Video aus, um Zeitstempel, Transkript und Spark-Notizen anzuzeigen.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
export default YouTubeImportPanel;
