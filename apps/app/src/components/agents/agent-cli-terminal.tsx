/**
 * Agent-CLI-Terminal (Phase D Schritt 17).
 *
 * Zeigt das echte PTY-Terminal des Agenten via xterm.js an:
 * - Lokal (localhost:3101): Volle bidirektionale Interaktivitaet (Tippen, Ctrl+C, Resize)
 *   ueber WebSocket (/api/terminal/:agentId/ws).
 * - Remote / Vercel: Read-Only Modus mit Hinweistext; Tastatureingaben deaktiviert.
 * - Toolbar mit Status-Anzeige (PTY / Pipe, PID, CLI-Typ), Neustart- und Clear-Buttons.
 */

import {
  IconAlertTriangle,
  IconCheck,
  IconChevronDown,
  IconClearAll,
  IconKey,
  IconLoader2,
  IconLogout,
  IconPlayerPlay,
  IconPlayerStop,
  IconRefresh,
  IconTerminal2,
  IconUserPlus,
  IconUsers,
  IconWifi,
  IconWifiOff,
  IconFolder,
  IconFolderOpen,
  IconArrowLeft,
  IconSend,
  IconX,
  IconArrowsExchange,
} from "@tabler/icons-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { isLoopbackHost, useConnectOnPc } from "@/lib/brain/pc-mode";
import { agentKeys, codexAccountsQueryOptions } from "@/lib/agents/queries";
import { cliManagerStatusQuery, type ManagedCliKind } from "@/lib/agent-hub/api";
import { ProviderSwitcher } from "@/v06/unified-cli/ProviderSwitcher";
import { BrokerNotice, SwitchProgress } from "@/v06/unified-cli/SwitchProgress";
import { useCliUnifiedSessionFlag } from "@/v06/unified-cli/useCliUnifiedSessionFlag";
import { useUnifiedSession } from "@/v06/unified-cli/useUnifiedSession";
import { getFlag } from "@/contracts/v06/flags";
import { cn } from "@/lib/utils";

interface AgentCliTerminalProps {
  agentId: string;
  agentName: string;
  /** Channel-ID des sichtbaren Agentengesprächs, nie die Runtime-Agenten-ID. */
  conversationId?: string | null;
}

type TerminalStatus = "connecting" | "connected" | "disconnected" | "error";

interface SessionInfo {
  agentId: string;
  cli: string;
  status: "stopped" | "running" | "crashed" | "stopping";
  pid: number | null;
  mode?: "pty" | "pipe" | null;
  workdir?: string;
  restartCount?: number;
  /** E-Mail des Kontos, mit dem die CLI angemeldet ist (Default = DEFAULT_GOOGLE_ACCOUNT). */
  accountEmail?: string | null;
  /** helium-agyshare: erkannter Kontingent-/Credit-Fehler. */
  quotaHit?: { at: number; text: string } | null;
  agyResume?: "continue" | "handoff" | "auto" | null;
}

/** helium-agyshare: Konto-Eintrag fuer "Mit anderem Konto weitermachen". */
interface AgyAccountOption {
  email: string;
  label: string;
  isDefault: boolean;
  isCurrent: boolean;
  loggedIn: boolean | null;
  signInPending: boolean;
  exhausted: boolean;
  inUseBy: string[];
  free: boolean;
}

type AgySwitchMode = "auto" | "continue" | "handoff";

const AGY_QUOTA_UI_RE =
  /(RESOURCE_EXHAUSTED|quota[^\n]{0,30}(exceeded|exhausted|reached|limit)|exceeded your (current )?quota|out of credits|insufficient credits|no (more )?credits|credits? (exhausted|depleted|aufgebraucht)|usage limit|rate limit exceeded|too many requests|Kontingent)/i;

function stripAnsiUi(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\u001b\[[0-9;?]*[ -\/]*[@-~]|\u001b\][^\u0007]*(\u0007|\u001b\\)|\u001b[@-_]/g, "");
}

export function AgentCliTerminal({ agentId, agentName, conversationId }: AgentCliTerminalProps) {
  const queryClient = useQueryClient();
  const terminalRef = useRef<HTMLDivElement | null>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  // helium-cliremote: Ueber den Tunnel (gekoppeltes Geraet) ist der Server der PC selbst ->
  // volles interaktives Terminal wie lokal. Nur die gehostete Vercel-Version bleibt read-only.
  const onPc = useConnectOnPc();
  const isTunnel =
    typeof window !== "undefined" && /\.trycloudflare\.com$/i.test(window.location.hostname);
  const isLocal = isLoopbackHost() || isTunnel || onPc.pc;
  const unifiedEnabled = useCliUnifiedSessionFlag();
  const unified = useUnifiedSession(unifiedEnabled ? conversationId : null);
  const [folderPickerOpen, setFolderPickerOpen] = useState(false);
  const [lineInput, setLineInput] = useState("");
  const [connectionStatus, setConnectionStatus] = useState<TerminalStatus>("connecting");
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [isRestarting, setIsRestarting] = useState(false);
  // helium-agyshare: Kontowechsel-Dialog + Kontingent-Banner
  const [switchOpen, setSwitchOpen] = useState(false);
  const [switchMode, setSwitchMode] = useState<AgySwitchMode>("auto");
  const [switchAccounts, setSwitchAccounts] = useState<AgyAccountOption[] | null>(null);
  const [switchBusy, setSwitchBusy] = useState(false);
  const [switchError, setSwitchError] = useState<string | null>(null);
  const [quotaBanner, setQuotaBanner] = useState(false);
  const [quotaDismissedAt, setQuotaDismissedAt] = useState(0);
  const quotaTailRef = useRef("");
  const noteAgyOutput = (chunk: string) => {
    const tail = (quotaTailRef.current + stripAnsiUi(chunk)).slice(-3000);
    quotaTailRef.current = tail;
    if (AGY_QUOTA_UI_RE.test(tail)) {
      quotaTailRef.current = "";
      setQuotaBanner(true);
    }
  };
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [loginMenuOpen, setLoginMenuOpen] = useState(false);
  const [loginDraftEmail, setLoginDraftEmail] = useState("");
  const loginMenuRef = useRef<HTMLDivElement | null>(null);
  const [cliMenuOpen, setCliMenuOpen] = useState(false);
  const [isSwitchingCli, setIsSwitchingCli] = useState(false);
  const cliMenuRef = useRef<HTMLDivElement | null>(null);

  // Status-Polling für Session-Details
  const fetchSessionStatus = async () => {
    try {
      const res = await fetch(`/api/agent-hub/terminal/${encodeURIComponent(agentId)}/status`, {
        credentials: "include",
      });
      if (res.ok) {
        const json = (await res.json()) as { ok: boolean; session?: SessionInfo };
        if (json.session) setSession(json.session);
      }
    } catch {
      // Ignorieren falls offline
    }
  };

  useEffect(() => {
    void fetchSessionStatus();
    const interval = setInterval(() => {
      void fetchSessionStatus();
    }, 4000);
    return () => clearInterval(interval);
  }, [agentId]);

  // Verfügbare Konten aus 000_Codex Start (für Account-Picker im Login-Menü).
  // Wir filtern hier nach der aktuell laufenden CLI-Engine, damit nicht alle
  // verfügbaren Konten (Codex + Antigravity) angezeigt werden, sondern nur die,
  // die für die jeweilige CLI sinnvoll sind: Antigravity -> nur Google-/Gemini-Konten,
  // Codex -> nur Codex-Instanzen, etc.
  //
  // Die Engine, die gerade im Terminal läuft — ohne ":login"-Suffix.
  const activeCliKind = useMemo<ManagedCliKind>(() => {
    const raw = (session?.cli || "antigravity").toLowerCase().replace(/:login$/, "");
    if (raw.includes("claude")) return "claude";
    if (raw.includes("codex")) return "codex";
    if (raw.includes("freebuff")) return "freebuff";
    if (raw.includes("hermes")) return "hermes";
    return "antigravity";
  }, [session?.cli]);

  /** Anzeigenamen der CLIs. "Antigravity / Gemini" ist derselbe Google-Agent. */
  const CLI_LABELS: Record<ManagedCliKind, string> = {
    antigravity: "Antigravity / Gemini",
    codex: "Codex / ChatGPT",
    claude: "Claude Code",
    freebuff: "Freebuff",
    hermes: "Hermes",
  };

  const cliStatus = useQuery(cliManagerStatusQuery());
  const cliOptions = useMemo(() => {
    const byKind = new Map<ManagedCliKind, {
      kind: ManagedCliKind;
      label: string;
      installed: boolean;
      version: string | null;
      loggedIn: boolean | null;
    }>();
    for (const kind of ["antigravity", "codex", "claude", "freebuff", "hermes"] as const) {
      byKind.set(kind, {
        kind,
        label: CLI_LABELS[kind],
        installed: false,
        version: null,
        loggedIn: null,
      });
    }
    for (const info of cliStatus.data?.clis ?? []) {
      byKind.set(info.kind, {
        kind: info.kind,
        label: CLI_LABELS[info.kind] ?? info.name,
        installed: info.installed,
        version: info.version,
        loggedIn: info.loggedIn,
      });
    }
    return Array.from(byKind.values());
  }, [cliStatus.data?.clis]);

  const currentCliLabel =
    cliOptions.find((o) => o.kind === activeCliKind)?.label ?? CLI_LABELS[activeCliKind];

  const codexAccounts = useQuery(codexAccountsQueryOptions(activeCliKind));
  const availableEmails = useMemo(
    () => codexAccounts.data?.availableEmails ?? [],
    [codexAccounts.data?.availableEmails],
  );

  // Click-outside-Handler für das Login-Konto-Menü
  useEffect(() => {
    if (!loginMenuOpen) return;
    const handler = (event: MouseEvent) => {
      if (
        loginMenuRef.current &&
        event.target instanceof Node &&
        !loginMenuRef.current.contains(event.target)
      ) {
        setLoginMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [loginMenuOpen]);

  // Click-outside-Handler für das CLI-Menü
  useEffect(() => {
    if (!cliMenuOpen) return;
    const handler = (event: MouseEvent) => {
      if (
        cliMenuRef.current &&
        event.target instanceof Node &&
        !cliMenuRef.current.contains(event.target)
      ) {
        setCliMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [cliMenuOpen]);

  // Terminal-Initialisierung & WebSocket-Verbindung
  useEffect(() => {
    if (!terminalRef.current) return;

    // 1. xterm.js Terminal instanziieren
    const term = new Terminal({
      cursorBlink: isLocal,
      disableStdin: !isLocal,
      fontSize: 13,
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
      theme: {
        background: "#0c0d12",
        foreground: "#f4f4f5",
        cursor: isLocal ? "#38bdf8" : "transparent",
        selectionBackground: "rgba(56, 189, 248, 0.3)",
        black: "#18181b",
        red: "#ef4444",
        green: "#22c55e",
        yellow: "#eab308",
        blue: "#3b82f6",
        magenta: "#a855f7",
        cyan: "#06b6d4",
        white: "#f4f4f5",
        brightBlack: "#71717a",
        brightRed: "#f87171",
        brightGreen: "#4ade80",
        brightYellow: "#fde047",
        brightBlue: "#60a5fa",
        brightMagenta: "#c084fc",
        brightCyan: "#22d3ee",
        brightWhite: "#ffffff",
      },
      convertEol: true,
      allowTransparency: true,
      scrollback: 5000,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);

    term.open(terminalRef.current);
    try {
      fitAddon.fit();
    } catch {
      // Container eventuell noch ohne Dimensionen
    }

    xtermRef.current = term;
    fitAddonRef.current = fitAddon;

    term.writeln(`\x1b[1;36m┌────────────────────────────────────────────────────────────┐\x1b[0m`);
    term.writeln(`\x1b[1;36m│\x1b[0m  \x1b[1;32mConnect CLI Terminal\x1b[0m — Agent: \x1b[1m${agentName}\x1b[0m`);
    term.writeln(`\x1b[1;36m│\x1b[0m  Modus: ${isLocal ? "\x1b[32mInteraktiv (Lokal localhost:3101)\x1b[0m" : "\x1b[33mSchreibgeschützt (Vercel Preview)\x1b[0m"}`);
    term.writeln(`\x1b[1;36m└────────────────────────────────────────────────────────────┘\x1b[0m\r\n`);

    let sseSource: EventSource | null = null;

    if (isLocal) {
      // 2. Lokale WebSocket-Verbindung für interaktives PTY
      setConnectionStatus("connecting");
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const wsUrl = `${protocol}//${window.location.host}/api/terminal/${encodeURIComponent(agentId)}/ws`;

      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnectionStatus("connected");
        // Initiale Größe an Server melden
        try {
          fitAddon.fit();
          ws.send(JSON.stringify({ type: "resize", cols: term.cols, rows: term.rows }));
        } catch {}
      };

      ws.onmessage = (event) => {
        try {
          const parsed = JSON.parse(event.data as string) as {
            type?: string;
            data?: string;
            session?: SessionInfo;
          };
          if (parsed.type === "output" && typeof parsed.data === "string") {
            term.write(parsed.data);
            noteAgyOutput(parsed.data);
          } else if (parsed.type === "status" && parsed.session) {
            setSession(parsed.session);
          }
        } catch {
          // Roher Text
          term.write(String(event.data));
        }
      };

      ws.onerror = () => {
        setConnectionStatus("error");
      };

      ws.onclose = () => {
        setConnectionStatus("disconnected");
      };

      // Tastenanschläge direkt unverändert an WebSocket schicken
      const inputDisposable = term.onData((data) => {
        const live = wsRef.current;
        if (live && live.readyState === WebSocket.OPEN) {
          live.send(JSON.stringify({ type: "input", data }));
        }
      });
      // helium-cliremote: Keepalive (Cloudflare schliesst stille WebSockets nach ~100 s).
      const pingTimer = setInterval(() => {
        const live = wsRef.current;
        if (live && live.readyState === WebSocket.OPEN) {
          try {
            live.send(JSON.stringify({ type: "ping" }));
          } catch {}
        }
      }, 25_000);

      // Resize-Observer für automatisches FitAddon + Server-Benachrichtigung
      const resizeObserver = new ResizeObserver(() => {
        try {
          fitAddon.fit();
          const live = wsRef.current;
          if (live && live.readyState === WebSocket.OPEN) {
            live.send(JSON.stringify({ type: "resize", cols: term.cols, rows: term.rows }));
          }
        } catch {}
      });

      if (terminalRef.current) {
        resizeObserver.observe(terminalRef.current);
      }

      return () => {
        inputDisposable.dispose();
        clearInterval(pingTimer);
        resizeObserver.disconnect();
        try {
          ws.close();
        } catch {}
        try {
          wsRef.current?.close();
        } catch {}
        term.dispose();
      };
    } else {
      // 3. Remote / Vercel: Read-Only Stream via SSE
      setConnectionStatus("connected");
      term.writeln("\x1b[33m⚠️ Hinweis: Auf Vercel ist das Terminal schreibgeschützt.\x1b[0m\r\n");

      try {
        const streamUrl = `/api/agent-hub/terminal/${encodeURIComponent(agentId)}/stream`;
        sseSource = new EventSource(streamUrl);

        sseSource.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data as string) as { text?: string };
            if (data.text) term.write(data.text);
          } catch {
            term.write(String(event.data));
          }
        };

        sseSource.onerror = () => {
          setConnectionStatus("error");
        };
      } catch {
        setConnectionStatus("error");
      }

      const resizeObserver = new ResizeObserver(() => {
        try {
          fitAddon.fit();
        } catch {}
      });
      if (terminalRef.current) {
        resizeObserver.observe(terminalRef.current);
      }

      return () => {
        resizeObserver.disconnect();
        sseSource?.close();
        term.dispose();
      };
    }
  }, [agentId, agentName, isLocal]);

  // Terminal-Aktionen
  const handleRestart = async () => {
    setIsRestarting(true);
    try {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: "restart" }));
      } else {
        await fetch(`/api/agent-hub/terminal/${encodeURIComponent(agentId)}/restart`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
          credentials: "include",
        });
      }
      xtermRef.current?.writeln(`\r\n\x1b[33m--- Terminal wird neu gestartet... ---\x1b[0m\r\n`);
      await fetchSessionStatus();
    } catch (err) {
      xtermRef.current?.writeln(`\r\n\x1b[31m--- Neustart fehlgeschlagen: ${String(err)} ---\x1b[0m\r\n`);
    } finally {
      setTimeout(() => setIsRestarting(false), 800);
    }
  };

  const handleClear = () => {
    xtermRef.current?.clear();
  };

  /**
   * Wechselt die im Terminal laufende CLI.
   *
   * Vorher war die Engine pro Agent fest in der DB verdrahtet, wodurch nur die
   * Gemini/Antigravity-CLI startbar war, obwohl Codex, Claude, Freebuff und
   * Hermes installiert sind. Jetzt starten wir den Terminal-Prozess neu mit der
   * gewünschten CLI; das Konto bleibt dabei erhalten.
   */
  const switchCli = async (kind: ManagedCliKind) => {
    if (kind === activeCliKind) {
      setCliMenuOpen(false);
      return;
    }
    setIsSwitchingCli(true);
    setCliMenuOpen(false);
    try {
      const res = await fetch(`/api/agent-hub/terminal/${encodeURIComponent(agentId)}/cli`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cli: kind }),
        credentials: "include",
      });
      const data = (await res.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
        session?: { cli?: string };
      } | null;
      if (!res.ok || !data?.ok) {
        xtermRef.current?.writeln(
          `\r\n\x1b[31m--- CLI-Wechsel auf ${CLI_LABELS[kind] ?? kind} fehlgeschlagen: ${
            data?.error || `HTTP ${res.status}`
          } ---\x1b[0m\r\n`,
        );
        return;
      }
      xtermRef.current?.writeln(
        `\r\n\x1b[32m--- CLI gewechselt auf ${CLI_LABELS[kind] ?? kind}... ---\x1b[0m\r\n`,
      );
      // Der Terminal-Prozess ist neu — WebSocket neu aufbauen, damit die
      // Ausgabe des neuen Prozesses im xterm landet.
      handleReconnect();
      await fetchSessionStatus();
      void queryClient.invalidateQueries({ queryKey: agentKeys.all });
      void queryClient.invalidateQueries({ queryKey: ["agent-hub"] });
    } catch (err) {
      xtermRef.current?.writeln(
        `\r\n\x1b[31m--- CLI-Wechsel fehlgeschlagen: ${String(err)} ---\x1b[0m\r\n`,
      );
    } finally {
      setTimeout(() => setIsSwitchingCli(false), 800);
    }
  };

  const handleCliLogin = async () => {
    setIsLoggingIn(true);
    try {
      // Immer die aktuell gewaehlte CLI — nicht den rohen Session-String,
      // der nach einem Login-Vorgang ":login" als Suffix traegt.
      const cliKind = activeCliKind;
      // Wenn der User bereits ein Konto ausgewählt hatte, beim Klick erneut verwenden,
      // damit man nicht bei jeder Anmeldung neu wählen muss.
      const email = session?.accountEmail || undefined;
      xtermRef.current?.writeln(
        `\r\n\x1b[36m--- Starte Login-Prozess für ${cliKind}${
          email ? ` (Konto: ${email})` : ""
        }... ---\x1b[0m\r\n`,
      );
      const res = await fetch(`/api/agent-hub/agents/${encodeURIComponent(agentId)}/cli-login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cli: cliKind, ...(email ? { email } : {}) }),
        credentials: "include",
      });
      const data = (await res.json().catch(() => null)) as {
        ok?: boolean;
        message?: string;
      } | null;
      if (data?.ok) {
        xtermRef.current?.writeln(`\x1b[32m✓ ${data.message || "Login-Terminal aktiv."}\x1b[0m\r\n`);
      }
      await fetchSessionStatus();
    } catch (err) {
      xtermRef.current?.writeln(`\r\n\x1b[31m--- Login-Start fehlgeschlagen: ${String(err)} ---\x1b[0m\r\n`);
    } finally {
      setIsLoggingIn(false);
    }
  };

  /**
   * Startet den Login mit einem explizit gewählten Konto.
   *
   * Wir übergeben die E-Mail an den Server, der sie in der DB am Agenten speichert
   * (accounts.accountEmail) und das passende Config-Verzeichnis verwendet. So kann
   * der User für jeden Agenten frei entscheiden, mit welchem Google-Konto die CLI
   * laufen soll -- auch wenn das nicht der "Default"-Account ist.
   */
  const startLoginWithEmail = async (email: string) => {
    const trimmed = email.trim();
    if (!trimmed) {
      setLoginMenuOpen(false);
      return;
    }
    setIsLoggingIn(true);
    setLoginMenuOpen(false);
    try {
      const cliKind = activeCliKind;
      xtermRef.current?.writeln(
        `\r\n\x1b[36m--- Starte Login für ${cliKind} mit Konto ${trimmed}... ---\x1b[0m\r\n`,
      );
      const res = await fetch(`/api/agent-hub/agents/${encodeURIComponent(agentId)}/cli-login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cli: cliKind, email: trimmed }),
        credentials: "include",
      });
      const data = (await res.json().catch(() => null)) as {
        ok?: boolean;
        message?: string;
        accountEmail?: string;
      } | null;
      if (data?.ok) {
        xtermRef.current?.writeln(
          `\x1b[32m✓ ${data.message || "Login-Terminal aktiv."} (${
            data.accountEmail || trimmed
          })\x1b[0m\r\n`,
        );
      } else {
        xtermRef.current?.writeln(
          `\r\n\x1b[31m--- Login-Start fehlgeschlagen: ${
            data?.message || `HTTP ${res.status}`
          } ---\x1b[0m\r\n`,
        );
      }
      await fetchSessionStatus();
    } catch (err) {
      xtermRef.current?.writeln(
        `\r\n\x1b[31m--- Login-Start fehlgeschlagen: ${String(err)} ---\x1b[0m\r\n`,
      );
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleReconnect = () => {
    if (!isLocal) return;
    setConnectionStatus("connecting");
    if (wsRef.current) {
      try {
        wsRef.current.close();
      } catch {}
    }
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/api/terminal/${encodeURIComponent(agentId)}/ws`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnectionStatus("connected");
      xtermRef.current?.writeln(`\r\n\x1b[32m✓ Wieder verbunden.\x1b[0m\r\n`);
      try {
        fitAddonRef.current?.fit();
        if (xtermRef.current) {
          ws.send(JSON.stringify({ type: "resize", cols: xtermRef.current.cols, rows: xtermRef.current.rows }));
        }
      } catch {}
    };

    ws.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data as string) as { type?: string; data?: string };
        if (parsed.type === "output" && typeof parsed.data === "string") {
          xtermRef.current?.write(parsed.data);
          noteAgyOutput(parsed.data);
        }
      } catch {
        xtermRef.current?.write(String(event.data));
      }
    };

    ws.onerror = () => setConnectionStatus("error");
    ws.onclose = () => setConnectionStatus("disconnected");
  };

  // helium-cliremote: nach Rueckkehr in den Tab (Handy aus dem Hintergrund) automatisch neu verbinden.
  const reconnectRef = useRef<() => void>(() => {});
  reconnectRef.current = handleReconnect;
  useEffect(() => {
    if (!isLocal) return;
    const onVisible = () => {
      const live = wsRef.current;
      if (document.visibilityState === "visible" && (!live || live.readyState > WebSocket.OPEN)) {
        reconnectRef.current();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onVisible);
    };
  }, [isLocal]);

  /** Rohe Tastenfolge an das PTY (WebSocket, sonst HTTP-Fallback). */
  const sendRaw = async (data: string) => {
    const live = wsRef.current;
    if (live && live.readyState === WebSocket.OPEN) {
      live.send(JSON.stringify({ type: "input", data }));
      return;
    }
    await fetch(`/api/agent-hub/terminal/${encodeURIComponent(agentId)}/input`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input: data, raw: true }),
      credentials: "include",
    }).catch(() => undefined);
  };

  const submitLine = async () => {
    const text = lineInput;
    if (!text.trim()) {
      await sendRaw("\r");
      return;
    }
    setLineInput("");
    if (unifiedEnabled && conversationId) {
      const delivered = await unified.sendInput(text);
      if (!delivered) {
        setLineInput(text);
        xtermRef.current?.writeln("\r\n\x1b[31m--- Gemeinsame CLI-Eingabe fehlgeschlagen. ---\x1b[0m\r\n");
      }
      return;
    }
    await sendRaw(text);
    // kurze Pause, damit TUIs (Codex/Claude) den Text vor Enter uebernehmen
    setTimeout(() => void sendRaw("\r"), 60);
  };

  const switchUnifiedProvider = async (provider: import("@/contracts/v06/cli").CliProviderId) => {
    const changed = await unified.switchProvider(provider);
    if (changed) {
      handleReconnect();
      await fetchSessionStatus();
    }
  };

  /** Startet die aktuelle CLI im gewaehlten Projektordner neu. */
  const startInFolder = async (path: string) => {
    setFolderPickerOpen(false);
    xtermRef.current?.writeln(`\r\n\x1b[36m--- Starte ${currentCliLabel} in ${path} ... ---\x1b[0m\r\n`);
    try {
      const res = await fetch(`/api/agent-hub/terminal/${encodeURIComponent(agentId)}/restart`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cli: activeCliKind, workdir: path }),
        credentials: "include",
      });
      const data = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!res.ok || !data?.ok) {
        xtermRef.current?.writeln(
          `\r\n\x1b[31m--- Start fehlgeschlagen: ${data?.error || `HTTP ${res.status}`} ---\x1b[0m\r\n`,
        );
        return;
      }
      handleReconnect();
      await fetchSessionStatus();
    } catch (err) {
      xtermRef.current?.writeln(`\r\n\x1b[31m--- Start fehlgeschlagen: ${String(err)} ---\x1b[0m\r\n`);
    }
  };

  const workdirName = (session?.workdir || "").split(/[\\/]/).filter(Boolean).pop() || "Ordner";

  // helium-agyshare: "Mit anderem Konto weitermachen"
  const isAgyTerminal = activeCliKind === "antigravity";
  const loadSwitchAccounts = async () => {
    setSwitchAccounts(null);
    setSwitchError(null);
    try {
      const res = await fetch(`/api/agent-hub/terminal/${encodeURIComponent(agentId)}/agy-accounts`, {
        credentials: "include",
      });
      const data = (await res.json().catch(() => null)) as { ok?: boolean; accounts?: AgyAccountOption[]; error?: string } | null;
      if (!res.ok || !data?.ok) {
        setSwitchError(data?.error || `HTTP ${res.status}`);
        setSwitchAccounts([]);
        return;
      }
      setSwitchAccounts(data.accounts ?? []);
    } catch (err) {
      setSwitchError(String(err));
      setSwitchAccounts([]);
    }
  };
  const openSwitchDialog = () => {
    setSwitchOpen(true);
    void loadSwitchAccounts();
  };
  const switchToAccount = async (email: string) => {
    setSwitchBusy(true);
    setSwitchError(null);
    xtermRef.current?.writeln(`\r\n\x1b[36m--- Wechsle zu ${email} und mache in ${workdirName} weiter ... ---\x1b[0m\r\n`);
    try {
      const res = await fetch(`/api/agent-hub/terminal/${encodeURIComponent(agentId)}/switch-account`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountEmail: email, mode: switchMode }),
        credentials: "include",
      });
      const data = (await res.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
        mode?: string;
        handoff?: { path?: string | null };
      } | null;
      if (!res.ok || !data?.ok) {
        setSwitchError(data?.error || `HTTP ${res.status}`);
        return;
      }
      const modeText =
        data.mode === "handoff"
          ? "mit Uebergabe-Datei (.connect/handoff.md)"
          : data.mode === "neu"
            ? "neu (kein bisheriges Gespraech in diesem Ordner)"
            : "mit gemeinsamem Verlauf (-c)";
      xtermRef.current?.writeln(`\r\n\x1b[32m--- Weiter mit ${email} ${modeText} ---\x1b[0m\r\n`);
      setSwitchOpen(false);
      setQuotaBanner(false);
      setQuotaDismissedAt(Date.now());
      void queryClient.invalidateQueries({ queryKey: agentKeys.all });
      handleReconnect();
      await fetchSessionStatus();
    } catch (err) {
      setSwitchError(String(err));
    } finally {
      setSwitchBusy(false);
    }
  };
  const showQuotaBanner =
    isAgyTerminal &&
    isLocal &&
    !switchOpen &&
    (quotaBanner || (!!session?.quotaHit && session.quotaHit.at > quotaDismissedAt));

  const isDesignV2 = getFlag("designV2");

  return (
    <div className={cn(
      "flex flex-col flex-1 h-[calc(100dvh-3rem)] text-foreground select-none overflow-hidden",
      isDesignV2 ? "bg-[var(--p-bg,#0a0b0e)]" : "bg-[#0c0d12]"
    )}>
      {/* Vercel / Remote Read-Only Hinweis */}
      {!isLocal && (
        <div
          role="status"
          className="flex items-center gap-2 px-4 py-2 bg-amber-500/10 border-b border-amber-500/20 text-amber-200 text-xs shrink-0"
        >
          <IconAlertTriangle className="size-4 text-amber-400 shrink-0" />
          <span>
            <strong>Hinweis:</strong> Interaktives Tippen ist nur lokal auf dem PC (http://localhost:3101) verfügbar.
            Über Vercel / PC-Brücke wird das Terminal schreibgeschützt gestreamt.
          </span>
        </div>
      )}

      {isTunnel && (
        <div
          role="status"
          className="flex items-center gap-2 px-3 py-1.5 bg-sky-500/10 border-b border-sky-500/20 text-sky-200 text-[11px] shrink-0"
        >
          <IconWifi className="size-3.5 text-sky-400 shrink-0" />
          <span>Fernzugriff über den Tunnel (gekoppeltes Gerät) – Aktionen werden protokolliert.</span>
        </div>
      )}

      {/* Terminal Toolbar */}
      <div className={cn(
        "flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-xs shrink-0 transition-colors duration-180",
        isDesignV2
          ? "bg-[var(--p-surface-1,#121318)] border-b border-[var(--p-border)]"
          : "bg-[#12131a] border-b border-border/40"
      )}>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3 min-w-0">
          {/* Verbindungsstatus */}
          <div className="flex items-center gap-1.5">
            {connectionStatus === "connected" && (
              <span className="flex items-center gap-1.5 text-emerald-400 font-medium">
                <span className="size-2 rounded-full bg-emerald-400 animate-pulse" />
                <span>Verbunden</span>
              </span>
            )}
            {connectionStatus === "connecting" && (
              <span className="flex items-center gap-1.5 text-amber-400 font-medium">
                <IconLoader2 className="size-3 animate-spin" />
                <span>Verbinde...</span>
              </span>
            )}
            {(connectionStatus === "disconnected" || connectionStatus === "error") && (
              <button
                type="button"
                onClick={handleReconnect}
                className="flex items-center gap-1.5 text-rose-400 hover:underline font-medium cursor-pointer"
                title="Klicken zum Wiederverbinden"
              >
                <IconWifiOff className="size-3" />
                <span>Getrennt (Wiederverbinden)</span>
              </button>
            )}
          </div>

          <span className="text-muted-foreground/40">|</span>

          {unifiedEnabled && conversationId ? (
            <div className="flex items-center gap-1">
              <span className="text-muted-foreground">CLI:</span>
              <ProviderSwitcher
                state={unified.switchState}
                disabled={!isLocal || unified.loading}
                onChange={(provider) => void switchUnifiedProvider(provider)}
              />
            </div>
          ) : (
          <div ref={cliMenuRef} className="relative">
            <button
              type="button"
              onClick={() => setCliMenuOpen((v) => !v)}
              disabled={!isLocal || isSwitchingCli}
              className={cn(
                "flex items-center gap-1 font-mono px-1.5 py-0.5 rounded bg-muted/20 border border-border/40 hover:bg-muted/30 disabled:opacity-50",
                cliMenuOpen && "bg-muted/30",
              )}
              title="CLI wechseln"
              aria-label="CLI wechseln"
            >
              <span className="text-muted-foreground">CLI:</span>
              <strong className="text-sky-400">{currentCliLabel}</strong>
              <IconChevronDown
                className={cn(
                  "size-3 text-muted-foreground transition-transform",
                  cliMenuOpen && "rotate-180",
                )}
              />
            </button>
            {cliMenuOpen && (
              <div
                className="absolute left-0 z-50 mt-1 w-80 max-w-[calc(100vw-1rem)] rounded-lg border border-border/60 bg-[#1a1b25] shadow-2xl shadow-black/40 p-2 text-foreground"
                role="menu"
              >
                <div className="flex items-center gap-2 px-2 py-1 text-[11px] uppercase tracking-wide text-muted-foreground">
                  <IconTerminal2 className="size-3.5" />
                  <span>CLI auswählen</span>
                </div>
                <div className="max-h-64 overflow-y-auto mt-1 flex flex-col gap-0.5">
                  {cliOptions.map((opt) => {
                    const isCurrent = opt.kind === activeCliKind;
                    return (
                      <button
                        key={opt.kind}
                        type="button"
                        disabled={isSwitchingCli}
                        onClick={() => void switchCli(opt.kind)}
                        className={cn(
                          "flex items-start gap-2 w-full text-left px-2 py-1.5 rounded-md text-xs hover:bg-white/5 disabled:opacity-50",
                          isCurrent && "bg-primary/15",
                        )}
                        role="menuitem"
                      >
                        <IconTerminal2
                          className={cn(
                            "size-3.5 mt-0.5 shrink-0",
                            opt.installed ? "text-emerald-400" : "text-muted-foreground",
                          )}
                        />
                        <span className="flex flex-col min-w-0 flex-1">
                          <span className="truncate font-medium flex items-center gap-1.5">
                            {opt.label}
                            {isCurrent && (
                              <span className="text-[9px] uppercase text-sky-400">aktiv</span>
                            )}
                          </span>
                          <span className="truncate text-[10px] text-muted-foreground">
                            {opt.installed
                              ? opt.version || "installiert"
                              : "nicht installiert"}
                            {opt.loggedIn ? " · angemeldet" : ""}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
                <div className="border-t border-border/40 mt-2 pt-2 px-1 text-[10px] text-muted-foreground">
                  Nicht installierte CLIs lassen sich im Erstellungs-Dialog einrichten.
                </div>
              </div>
            )}
          </div>
          )}

          {/* helium-cliremote: Projektordner */}
          <button
            type="button"
            onClick={() => setFolderPickerOpen(true)}
            disabled={!isLocal}
            className="flex items-center gap-1 font-mono px-1.5 py-0.5 rounded bg-muted/20 border border-border/40 hover:bg-muted/30 disabled:opacity-50 max-w-[45vw]"
            title={session?.workdir ? `Projektordner: ${session.workdir}` : "Projektordner wählen"}
            aria-label="Projektordner wählen"
            data-testid="cli-folder-button"
          >
            <IconFolder className="size-3.5 text-amber-300 shrink-0" />
            <span className="truncate">{workdirName}</span>
          </button>

          {/* PTY / PID Info */}
          <div className="flex items-center gap-2 text-muted-foreground">
            {session?.mode && (
              <span className="font-mono px-1.5 py-0.5 rounded bg-muted/20 text-muted-foreground border border-border/40 text-[11px]">
                {session.mode.toUpperCase()}
              </span>
            )}
            {session?.pid && (
              <span className="text-muted-foreground/70 hidden sm:inline text-[11px]">
                PID: {session.pid}
              </span>
            )}
          </div>
        </div>

        {/* Schnellaktionen */}
        <div className="flex items-center gap-1.5">
          {/* Login-Button + Konto-Picker. Default-Klick = aktuelles Konto, Dropdown = anderes Konto wählen. */}
          <div ref={loginMenuRef} className="relative">
            <div className="flex items-stretch">
              <Button
                size="sm"
                variant="outline"
                onClick={handleCliLogin}
                disabled={!isLocal || isLoggingIn}
                className="h-7 px-2.5 text-xs gap-1 border-border/50 rounded-r-none bg-[#181922] hover:bg-[#202230]"
                title="Startet den Login-Befehl für die Agenten-CLI"
              >
                <IconKey className={cn("size-3.5 text-amber-400", isLoggingIn && "animate-spin")} />
                <span>Login</span>
              </Button>
              <button
                type="button"
                aria-label="Anderes Konto wählen"
                disabled={!isLocal || isLoggingIn}
                onClick={() => setLoginMenuOpen((v) => !v)}
                className={cn(
                  "h-7 px-1.5 text-xs border border-l-0 border-border/50 rounded-l-none bg-[#181922] hover:bg-[#202230] flex items-center",
                  loginMenuOpen && "bg-[#202230]",
                  (!isLocal || isLoggingIn) && "opacity-50 cursor-not-allowed",
                )}
                title="Anderes Konto wählen"
              >
                <IconChevronDown
                  className={cn(
                    "size-3.5 text-muted-foreground transition-transform",
                    loginMenuOpen && "rotate-180",
                  )}
                />
              </button>
            </div>
            {loginMenuOpen && (
              <div
                className="absolute right-0 z-50 mt-1 w-72 max-w-[calc(100vw-1rem)] rounded-lg border border-border/60 bg-[#1a1b25] shadow-2xl shadow-black/40 p-2 text-foreground"
                role="menu"
              >
                <div className="flex items-center gap-2 px-2 py-1 text-[11px] uppercase tracking-wide text-muted-foreground">
                  <IconUsers className="size-3.5" />
                  <span>Mit Konto anmelden</span>
                </div>
                {availableEmails.length > 0 && (
                  <div className="max-h-48 overflow-y-auto mt-1 flex flex-col gap-0.5">
                    {availableEmails.map((acc) => {
                      const isCurrent =
                        session?.accountEmail?.toLowerCase() === acc.email.toLowerCase();
                      return (
                        <button
                          key={`${acc.appId}-${acc.email}`}
                          type="button"
                          disabled={isLoggingIn}
                          onClick={() => startLoginWithEmail(acc.email)}
                          className={cn(
                            "flex items-start gap-2 w-full text-left px-2 py-1.5 rounded-md text-xs hover:bg-white/5 disabled:opacity-50",
                            isCurrent && "bg-primary/15",
                          )}
                          role="menuitem"
                        >
                          <IconUserPlus className="size-3.5 mt-0.5 text-sky-400 shrink-0" />
                          <span className="flex flex-col min-w-0">
                            <span className="truncate font-medium">
                              {acc.label || acc.email}
                            </span>
                            <span className="truncate text-[10px] text-muted-foreground">
                              {acc.email}
                              {isCurrent ? " · aktuell" : ""}
                            </span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
                <div className="border-t border-border/40 mt-2 pt-2 px-1">
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground px-1 mb-1">
                    Anderes Konto (frei eingeben)
                  </div>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      void startLoginWithEmail(loginDraftEmail);
                      setLoginDraftEmail("");
                    }}
                    className="flex items-center gap-1"
                  >
                    <input
                      type="email"
                      value={loginDraftEmail}
                      onChange={(e) => setLoginDraftEmail(e.target.value)}
                      placeholder="name@gmail.com"
                      disabled={isLoggingIn}
                      className="flex-1 h-7 px-2 rounded-md bg-[#0c0d12] border border-border/60 text-xs outline-none focus:border-sky-400/60 placeholder:text-muted-foreground/60"
                    />
                    <Button
                      type="submit"
                      size="sm"
                      variant="outline"
                      disabled={isLoggingIn || !loginDraftEmail.trim()}
                      className="h-7 px-2 text-xs border-border/50 bg-[#181922] hover:bg-[#202230]"
                      title="Login mit dieser E-Mail starten"
                    >
                      Los
                    </Button>
                  </form>
                  <div className="mt-2 px-1 flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
                    <span>
                      Aktuelles Konto:{" "}
                      <span className="font-mono text-foreground">
                        {session?.accountEmail || "Default"}
                      </span>
                    </span>
                    {session?.accountEmail && (
                      <button
                        type="button"
                        disabled={isLoggingIn}
                        onClick={() => startLoginWithEmail(session.accountEmail!)}
                        className="text-rose-400 hover:underline flex items-center gap-1 disabled:opacity-50"
                        title="Erzwingt erneutes Login mit dem aktuellen Konto"
                      >
                        <IconLogout className="size-3" />
                        Neu anmelden
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {isAgyTerminal && (
            <Button
              size="sm"
              variant="outline"
              onClick={openSwitchDialog}
              disabled={!isLocal || switchBusy}
              data-testid="agy-switch-account-button"
              className="h-7 px-2.5 text-xs gap-1 border-border/50 bg-[#181922] hover:bg-[#202230]"
              title="Gleiches Gespraech im selben Ordner mit einem anderen Google-Konto fortsetzen"
            >
              <IconArrowsExchange className={cn("size-3.5 text-amber-400", switchBusy && "animate-pulse")} />
              <span className="hidden md:inline">Mit anderem Konto weitermachen</span>
              <span className="md:hidden">Konto</span>
            </Button>
          )}

          <Button
            size="sm"
            variant="outline"
            onClick={() => void handleRestart()}
            disabled={!isLocal || isRestarting}
            className="h-7 px-2.5 text-xs gap-1 border-border/50 bg-[#181922] hover:bg-[#202230]"
            title="Startet den CLI-Terminal-Prozess neu"
          >
            <IconRefresh className={cn("size-3.5 text-sky-400", isRestarting && "animate-spin")} />
            <span>Neustart</span>
          </Button>

          <Button
            size="sm"
            variant="ghost"
            onClick={handleClear}
            className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
            title="Konsole leeren"
          >
            <IconClearAll className="size-3.5" />
            <span className="hidden sm:inline">Clear</span>
          </Button>
        </div>
      </div>

      {/* helium-agyshare: Kontingent erschoepft -> Kontowechsel anbieten */}
      {showQuotaBanner && (
        <div
          data-testid="agy-quota-banner"
          className="shrink-0 flex flex-wrap items-center gap-2 border-b border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200 select-text"
        >
          <IconAlertTriangle className="size-4 text-amber-400 shrink-0" />
          <span className="flex-1 min-w-[12rem]">
            Kontingent oder Credits dieses Kontos scheinen aufgebraucht
            {session?.accountEmail ? ` (${session.accountEmail})` : ""}. Du kannst im selben Ordner mit einem anderen Konto weitermachen.
          </span>
          <Button
            size="sm"
            onClick={openSwitchDialog}
            className="h-7 px-2.5 text-xs gap-1 bg-amber-500 text-black hover:bg-amber-400"
          >
            <IconArrowsExchange className="size-3.5" />
            Mit anderem Konto weitermachen
          </Button>
          <button
            type="button"
            onClick={() => {
              setQuotaBanner(false);
              setQuotaDismissedAt(Date.now());
            }}
            className="text-amber-300/70 hover:text-amber-200"
            title="Hinweis ausblenden"
          >
            <IconX className="size-3.5" />
          </button>
        </div>
      )}

      {/* helium-agyshare: Kontoauswahl */}
      {switchOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 select-text"
          onClick={() => !switchBusy && setSwitchOpen(false)}
        >
          <div
            data-testid="agy-switch-account-dialog"
            className="w-full max-w-md rounded-lg border border-border/60 bg-[#14151d] p-4 shadow-xl text-sm"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 mb-1">
              <IconArrowsExchange className="size-4 text-amber-400" />
              <h3 className="font-semibold flex-1">Mit anderem Konto weitermachen</h3>
              <button type="button" onClick={() => setSwitchOpen(false)} disabled={switchBusy} className="text-muted-foreground hover:text-foreground">
                <IconX className="size-4" />
              </button>
            </div>
            <p className="text-xs text-muted-foreground mb-3">
              Ordner: <span className="text-foreground">{session?.workdir || "?"}</span>
              <br />
              Aktuelles Konto: <span className="text-foreground">{session?.accountEmail || "Standard"}</span>
            </p>
            <div className="mb-3 flex flex-col gap-1 text-xs">
              {(
                [
                  ["auto", "Automatisch", "Verlauf fortsetzen, sonst Uebergabe-Datei"],
                  ["continue", "Verlauf fortsetzen", "agy -c ueber den gemeinsamen Verlauf"],
                  ["handoff", "Uebergabe-Datei", ".connect/handoff.md lesen lassen"],
                ] as Array<[AgySwitchMode, string, string]>
              ).map(([value, label, hint]) => (
                <label key={value} className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" name="agy-switch-mode" checked={switchMode === value} onChange={() => setSwitchMode(value)} />
                  <span className="text-foreground">{label}</span>
                  <span className="text-muted-foreground">– {hint}</span>
                </label>
              ))}
            </div>
            {switchAccounts === null ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground py-3">
                <IconLoader2 className="size-4 animate-spin" /> Konten werden geladen ...
              </div>
            ) : switchAccounts.length === 0 ? (
              <div className="text-xs text-muted-foreground py-3">Keine Antigravity-Konten im Register gefunden.</div>
            ) : (
              <div className="flex flex-col gap-1 max-h-72 overflow-y-auto">
                {switchAccounts.map((acc) => (
                  <button
                    key={acc.email}
                    type="button"
                    disabled={switchBusy || acc.isCurrent}
                    onClick={() => void switchToAccount(acc.email)}
                    className={cn(
                      "flex items-center gap-2 rounded-md border px-3 py-2 text-left text-xs transition-colors disabled:opacity-50",
                      acc.free ? "border-emerald-500/40 hover:bg-emerald-500/10" : "border-border/50 hover:bg-white/5",
                    )}
                  >
                    <IconUsers className="size-3.5 shrink-0 text-muted-foreground" />
                    <span className="flex-1 truncate">{acc.email}</span>
                    {acc.isCurrent && <span className="text-sky-400">aktuell</span>}
                    {!acc.isCurrent && acc.free && <span className="text-emerald-400">frei</span>}
                    {acc.exhausted && <span className="text-amber-400">Kontingent leer</span>}
                    {acc.inUseBy.length > 0 && <span className="text-muted-foreground">in Benutzung</span>}
                    {acc.loggedIn === false && <span className="text-rose-400">Anmeldung noetig</span>}
                  </button>
                ))}
              </div>
            )}
            {switchError && <div className="mt-2 text-xs text-rose-400">Fehler: {switchError}</div>}
            {switchBusy && (
              <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                <IconLoader2 className="size-4 animate-spin" /> Wechsle Konto ...
              </div>
            )}
            <p className="mt-3 text-[11px] text-muted-foreground">
              Anmeldedaten bleiben pro Konto getrennt. Ist ein Konto noch nicht angemeldet, fragt agy im Terminal nach der Anmeldung.
            </p>
          </div>
        </div>
      )}

      {unifiedEnabled && conversationId ? (
        <>
          <SwitchProgress busy={unified.switchState.busy} pending={unified.switchState.pending} />
          <BrokerNotice visible={unified.brokerNotice} />
        </>
      ) : null}

      {/* xterm.js Rendering-Container */}
      <div
        ref={terminalRef}
        data-testid="agent-cli-terminal-container"
        className="flex-1 w-full h-full p-2 overflow-hidden focus:outline-none"
        onClick={() => xtermRef.current?.focus()}
      />

      {/* helium-cliremote: Eingabezeile + Sondertasten (Handy-tauglich) */}
      {isLocal && (
        <div className={cn(
          "shrink-0 px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] select-text transition-colors duration-180",
          isDesignV2
            ? "border-t border-[var(--p-border)] bg-[var(--p-surface-1,#121318)]"
            : "border-t border-border/40 bg-[#12131a]"
        )}>
          <div className="flex gap-1 overflow-x-auto pb-1.5 text-[11px]">
            {[
              ["Esc", "\x1b"],
              ["Tab", "\t"],
              ["↑", "\x1b[A"],
              ["↓", "\x1b[B"],
              ["←", "\x1b[D"],
              ["→", "\x1b[C"],
              ["Ctrl+C", "\x03"],
              ["Enter", "\r"],
              ["y", "y"],
              ["n", "n"],
            ].map(([label, seq]) => (
              <button
                key={label}
                type="button"
                onClick={() => void sendRaw(seq)}
                className={cn(
                  "shrink-0 rounded-md font-mono transition-colors duration-150 cursor-pointer",
                  isDesignV2
                    ? "border border-[var(--p-border)] bg-[var(--p-surface-2)] px-2.5 py-1.5 text-xs text-[var(--p-text-2)] hover:text-[var(--p-text-1)] hover:bg-[var(--p-surface-3)] hover:border-[var(--p-border-strong)]"
                    : "border border-border/50 bg-[#181922] px-2.5 py-1.5 text-muted-foreground hover:text-foreground active:bg-[#262838]"
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void submitLine();
            }}
            className="flex items-end gap-1.5"
          >
            <textarea
              value={lineInput}
              onChange={(e) => setLineInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void submitLine();
                }
              }}
              rows={1}
              placeholder="Nachricht / Befehl an die CLI…"
              data-testid="cli-line-input"
              className={cn(
                "flex-1 min-h-10 max-h-32 resize-y rounded-lg px-3 py-2 text-base sm:text-sm outline-none transition-colors duration-150",
                isDesignV2
                  ? "bg-[var(--p-surface-2)] border border-[var(--p-border)] text-[var(--p-text-1)] placeholder:text-[var(--p-text-3)] focus:border-[var(--p-accent)] focus:ring-1 focus:ring-[var(--p-accent)]"
                  : "bg-[#0c0d12] border border-border/60 focus:border-sky-400/60 placeholder:text-muted-foreground/60"
              )}
            />
            <Button
              type="submit"
              size="sm"
              className={cn(
                "h-10 px-3 gap-1 cursor-pointer transition-opacity duration-150",
                isDesignV2 ? "bg-[var(--p-accent)] hover:opacity-90 text-white rounded-lg shadow-xs" : undefined
              )}
              title="Senden (Enter)"
              data-testid="cli-line-send"
            >
              <IconSend className="size-4" />
              <span className="hidden sm:inline">Senden</span>
            </Button>
          </form>
        </div>
      )}

      {folderPickerOpen && (
        <ProjectFolderPicker
          current={session?.workdir}
          cliLabel={currentCliLabel}
          onPick={(path) => void startInFolder(path)}
          onClose={() => setFolderPickerOpen(false)}
        />
      )}
    </div>
  );
}

type FsEntry = { name: string; path: string };

/** helium-cliremote: Ordner-Browser fuer erlaubte Wurzeln (Downloads/Dokumente/Desktop). */
export function ProjectFolderPicker({
  current,
  cliLabel,
  onPick,
  onClose,
}: {
  current?: string;
  cliLabel: string;
  onPick: (path: string) => void;
  onClose: () => void;
}) {
  const [path, setPath] = useState<string | null>(null);
  const roots = useQuery({
    queryKey: ["agent-hub", "fs-roots"],
    queryFn: async () => {
      const res = await fetch("/api/agent-hub/fs/roots", { credentials: "include" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()) as { roots: { label: string; path: string }[] };
    },
  });
  const list = useQuery({
    queryKey: ["agent-hub", "fs-list", path],
    enabled: !!path,
    queryFn: async () => {
      const res = await fetch(`/api/agent-hub/fs/list?path=${encodeURIComponent(path ?? "")}`, {
        credentials: "include",
      });
      const data = (await res.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
        path: string;
        parent: string | null;
        dirs: FsEntry[];
      } | null;
      if (!res.ok || !data?.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      return data;
    },
  });

  const entries: FsEntry[] = path
    ? (list.data?.dirs ?? [])
    : (roots.data?.roots ?? []).map((r) => ({ name: r.label, path: r.path }));

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/60 select-text"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-label="Projektordner wählen"
        data-testid="cli-folder-picker"
        className="w-full sm:max-w-lg max-h-[85dvh] flex flex-col rounded-t-2xl sm:rounded-2xl border border-border/60 bg-[#14151d] text-foreground shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-4 pt-4 pb-2">
          <IconFolderOpen className="size-5 text-amber-300" />
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-sm">Projektordner wählen</div>
            <div className="text-[11px] text-muted-foreground">
              {cliLabel} startet in diesem Ordner auf dem PC.
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Schließen" className="p-2 rounded-md hover:bg-white/5">
            <IconX className="size-4" />
          </button>
        </div>
        <div className="px-4 pb-2 text-[11px] font-mono text-muted-foreground break-all">
          {path ?? "Bereich wählen"}
          {!path && current ? <div className="mt-1">Aktuell: {current}</div> : null}
        </div>
        <div className="flex-1 overflow-y-auto px-2 pb-2">
          {path && (
            <button
              type="button"
              onClick={() => setPath(list.data?.parent ?? null)}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-3 text-left text-sm hover:bg-white/5"
            >
              <IconArrowLeft className="size-4 text-muted-foreground" />
              <span>Zurück</span>
            </button>
          )}
          {(path ? list.isLoading : roots.isLoading) && (
            <div className="flex items-center gap-2 px-3 py-3 text-sm text-muted-foreground">
              <IconLoader2 className="size-4 animate-spin" /> Lade…
            </div>
          )}
          {(path ? list.error : roots.error) && (
            <div className="px-3 py-3 text-sm text-rose-400">
              {String((path ? list.error : roots.error) instanceof Error ? (path ? list.error : roots.error)?.message : "Fehler")}
            </div>
          )}
          {entries.map((entry) => (
            <button
              key={entry.path}
              type="button"
              onClick={() => setPath(entry.path)}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-3 text-left text-sm hover:bg-white/5 active:bg-white/10"
            >
              <IconFolder className="size-4 shrink-0 text-amber-300" />
              <span className="truncate">{entry.name}</span>
            </button>
          ))}
          {path && !list.isLoading && !list.error && entries.length === 0 && (
            <div className="px-3 py-3 text-sm text-muted-foreground">Keine Unterordner.</div>
          )}
        </div>
        <div className="flex gap-2 border-t border-border/40 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <Button variant="outline" className="flex-1 h-11" onClick={onClose}>
            Abbrechen
          </Button>
          <Button
            className="flex-1 h-11 gap-1"
            disabled={!path}
            onClick={() => path && onPick(path)}
            data-testid="cli-folder-start"
          >
            <IconCheck className="size-4" /> Hier starten
          </Button>
        </div>
      </div>
    </div>
  );
}
