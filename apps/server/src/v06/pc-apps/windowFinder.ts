/**
 * Window Finder für PC-Apps (v06 / A28)
 *
 * Sucht offene Fenster anhand von Prozessname und/oder Fenstertitel-Regex
 * auf dem Windows-Host-System. Liefert HWND, Titel, Prozess-ID und Fenster-Rechteck.
 */

import { spawn, spawnSync } from "node:child_process";
import type { WindowMatch } from "./types";

export interface WindowInfo {
  hwnd: number;
  pid: number;
  processName: string;
  title: string;
  className: string;
  isVisible: boolean;
  bounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

const ENUM_WINDOWS_PS_SCRIPT = `
Add-Type -AssemblyName System.Drawing
Add-Type -TypeDefinition @"
using System;
using System.Text;
using System.Collections.Generic;
using System.Runtime.InteropServices;

public class WinEnumHelper {
    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

    [DllImport("user32.dll")]
    public static extern bool EnumWindows(EnumWindowsProc enumProc, IntPtr lParam);

    [DllImport("user32.dll")]
    public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);

    [DllImport("user32.dll")]
    public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);

    [DllImport("user32.dll")]
    public static extern int GetClassName(IntPtr hWnd, StringBuilder lpString, int nMaxCount);

    [DllImport("user32.dll")]
    public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);

    [DllImport("user32.dll")]
    public static extern bool IsWindowVisible(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern bool SetForegroundWindow(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

    [StructLayout(LayoutKind.Sequential)]
    public struct RECT {
        public int Left;
        public int Top;
        public int Right;
        public int Bottom;
    }

    public class WindowEntry {
        public long Hwnd;
        public uint Pid;
        public string Title;
        public string ClassName;
        public bool IsVisible;
        public int X;
        public int Y;
        public int Width;
        public int Height;
    }

    public static List<WindowEntry> GetAllVisibleWindows() {
        var list = new List<WindowEntry>();
        EnumWindows((hWnd, lParam) => {
            if (!IsWindowVisible(hWnd)) return true;
            RECT r;
            GetWindowRect(hWnd, out r);
            int w = r.Right - r.Left;
            int h = r.Bottom - r.Top;
            if (w <= 30 || h <= 30) return true;

            uint pid;
            GetWindowThreadProcessId(hWnd, out pid);

            var sbTitle = new StringBuilder(512);
            GetWindowText(hWnd, sbTitle, 512);

            var sbClass = new StringBuilder(256);
            GetClassName(hWnd, sbClass, 256);

            list.Add(new WindowEntry {
                Hwnd = hWnd.ToInt64(),
                Pid = pid,
                Title = sbTitle.ToString(),
                ClassName = sbClass.ToString(),
                IsVisible = true,
                X = r.Left,
                Y = r.Top,
                Width = w,
                Height = h
            });
            return true;
        }, IntPtr.Zero);
        return list;
    }
}
"@

$wins = [WinEnumHelper]::GetAllVisibleWindows()
$procs = Get-Process | Group-Object Id -AsHashTable

$result = @()
foreach ($w in $wins) {
    $procName = ""
    if ($procs.ContainsKey([int]$w.Pid)) {
        $procName = $procs[[int]$w.Pid].ProcessName
    }
    $result += @{
        hwnd = $w.Hwnd
        pid = $w.Pid
        processName = $procName
        title = $w.Title
        className = $w.ClassName
        isVisible = $w.IsVisible
        bounds = @{
            x = $w.X
            y = $w.Y
            width = $w.Width
            height = $w.Height
        }
    }
}

$result | ConvertTo-Json -Depth 4
`;

export class WindowFinder {
  private cache: { timestamp: number; windows: WindowInfo[] } = {
    timestamp: 0,
    windows: [],
  };
  private cacheTtlMs = 1200;

  /**
   * Listet alle sichtbaren Fenster auf
   */
  public async listVisibleWindows(forceRefresh = false): Promise<WindowInfo[]> {
    const now = Date.now();
    if (!forceRefresh && now - this.cache.timestamp < this.cacheTtlMs) {
      return this.cache.windows;
    }

    try {
      const res = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", ENUM_WINDOWS_PS_SCRIPT], {
        encoding: "utf8",
        timeout: 6000,
      });

      if (res.status === 0 && res.stdout.trim()) {
        const parsed = JSON.parse(res.stdout.trim());
        const list = Array.isArray(parsed) ? parsed : [parsed];
        const formatted: WindowInfo[] = list
          .filter((w: any) => w && w.hwnd)
          .map((w: any) => ({
            hwnd: Number(w.hwnd),
            pid: Number(w.pid),
            processName: String(w.processName || ""),
            title: String(w.title || ""),
            className: String(w.className || ""),
            isVisible: Boolean(w.isVisible),
            bounds: {
              x: Number(w.bounds?.x || 0),
              y: Number(w.bounds?.y || 0),
              width: Number(w.bounds?.width || 0),
              height: Number(w.bounds?.height || 0),
            },
          }));

        this.cache = { timestamp: now, windows: formatted };
        return formatted;
      }
    } catch {
      // Bei Fehlern im PowerShell-Aufruf aktuellen Cache belassen
    }

    return this.cache.windows;
  }

  /**
   * Findet das passendste Fenster anhand des Match-Filters
   */
  public async findWindow(match: WindowMatch, forceRefresh = false): Promise<WindowInfo | null> {
    const windows = await this.listVisibleWindows(forceRefresh);
    const procRegex = match.processName
      ? new RegExp(match.processName.replace(/\.exe$/i, ""), "i")
      : null;
    const titleRegex = match.titleRegex ? new RegExp(match.titleRegex, "i") : null;

    const matched = windows.filter((w) => {
      if (procRegex && !procRegex.test(w.processName)) {
        return false;
      }
      if (titleRegex && !titleRegex.test(w.title)) {
        return false;
      }
      return true;
    });

    if (matched.length === 0) {
      // Wenn mit Cache nichts gefunden wurde, noch einmal mit forceRefresh versuchen
      if (!forceRefresh) {
        return this.findWindow(match, true);
      }
      return null;
    }

    // Wähle das Fenster mit der größten Fläche (Hauptfenster)
    matched.sort((a, b) => b.bounds.width * b.bounds.height - a.bounds.width * a.bounds.height);
    return matched[0];
  }

  /**
   * Prüft ob ein Prozess läuft
   */
  public isProcessRunning(processName: string): boolean {
    try {
      const cleanName = processName.replace(/\.exe$/i, "");
      const res = spawnSync("powershell.exe", [
        "-NoProfile",
        "-Command",
        `Get-Process -Name "${cleanName}" -ErrorAction SilentlyContinue | Select-Object -First 1 Id`,
      ], { encoding: "utf8", timeout: 2500 });
      return Boolean(res.stdout && res.stdout.trim().length > 0);
    } catch {
      return false;
    }
  }

  /**
   * Startet die Anwendung falls nicht aktiv
   */
  public launchApp(exePath: string, args: string[] = []): { ok: boolean; pid?: number; error?: string } {
    try {
      const child = spawn(exePath, args, {
        detached: true,
        stdio: "ignore",
      });
      child.unref();
      return { ok: true, pid: child.pid };
    } catch (err: any) {
      return { ok: false, error: err.message || "Start fehlgeschlagen" };
    }
  }

  /**
   * Bringt das Fenster in den Vordergrund
   */
  public bringToFront(hwnd: number): boolean {
    try {
      const ps = `
      Add-Type @"
      using System;
      using System.Runtime.InteropServices;
      public class Fg {
        [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
        [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int n);
      }
"@
      [Fg]::ShowWindow([IntPtr]${hwnd}, 1)
      [Fg]::SetForegroundWindow([IntPtr]${hwnd})
      `;
      const res = spawnSync("powershell.exe", ["-NoProfile", "-Command", ps], { encoding: "utf8", timeout: 3000 });
      return res.status === 0;
    } catch {
      return false;
    }
  }
}

export const defaultWindowFinder = new WindowFinder();
