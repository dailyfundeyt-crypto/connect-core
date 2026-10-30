/**
 * Screen & Window Capture für PC-Apps (v06 / A28)
 *
 * Erfasst das Bild eines Desktop-Fensters via Windows Graphics Capture / PrintWindow / GDI.
 * Kodiert Frames als JPEG Base64 für ultra-schnellen Transport an die LiveScreen-Komponente.
 *
 * Verwaltet Screencast-Sitzungen mit adaptivem Frame-Loop (15-25 FPS bei Interaktion,
 * 1-2 FPS bei Leerlauf) zur Schonung von CPU und GPU.
 *
 * Dynamische Auflösungsbegrenzung (Default: max. 1920x1080):
 * Garantiert gestochene Schärfe für Adobe-Timelines und -Menüs, verhindert jedoch
 * bei 4K-Monitoren eine übermäßige Belastung von CPU und Netzwerk.
 */

import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import * as readline from "node:readline";
import { defaultInputInjector, type InputTargetWindow } from "./input";
import type { PcAppCastMessage, PcAppInputEvent } from "./types";
import { defaultWindowFinder, type WindowInfo } from "./windowFinder";

export interface CaptureResult {
  ok: boolean;
  data?: string; // Base64 JPEG
  width: number;
  height: number;
  durationMs: number;
  method: "PrintWindow" | "BitBlt";
  error?: string;
}

export interface StreamSession {
  handle(rawMessage: string): void;
  close(): void;
  getTarget(): InputTargetWindow | null;
}

const CAPTURE_WORKER_PS_SCRIPT = `
Add-Type -AssemblyName System.Drawing
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;

public class WinFastCap {
    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
    [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr hWnd, IntPtr hdcBlt, uint nFlags);
    [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);

    [StructLayout(LayoutKind.Sequential)]
    public struct RECT {
        public int Left;
        public int Top;
        public int Right;
        public int Bottom;
    }
}
"@

$ms = New-Object System.IO.MemoryStream

while ($line = [Console]::In.ReadLine()) {
    if ($line -eq "exit") { break }
    try {
        $parts = $line.Split(",")
        $hwnd = [IntPtr][long]$parts[0]
        $maxW = if ($parts.Length -gt 1) { [int]$parts[1] } else { 1920 }
        $maxH = if ($parts.Length -gt 2) { [int]$parts[2] } else { 1080 }

        $rect = New-Object WinFastCap+RECT
        [WinFastCap]::GetWindowRect($hwnd, [ref]$rect)
        $rawW = [Math]::Max(10, $rect.Right - $rect.Left)
        $rawH = [Math]::Max(10, $rect.Bottom - $rect.Top)

        # Skalierungsfaktor zur Begrenzung auf max. 1920x1080 (HD/FullHD)
        $scale = [Math]::Min(1.0, [Math]::Min($maxW / $rawW, $maxH / $rawH))
        $w = [Math]::Max(10, [int]($rawW * $scale))
        $h = [Math]::Max(10, [int]($rawH * $scale))

        if ($scale -lt 0.99) {
            $rawBmp = New-Object System.Drawing.Bitmap $rawW, $rawH
            $rawG = [System.Drawing.Graphics]::FromImage($rawBmp)
            $rawHdc = $rawG.GetHdc()
            $ok = [WinFastCap]::PrintWindow($hwnd, $rawHdc, 2)
            $rawG.ReleaseHdc($rawHdc)
            if (-not $ok) {
                try {
                    $rawG.CopyFromScreen($rect.Left, $rect.Top, 0, 0, (New-Object System.Drawing.Size $rawW, $rawH))
                    $ok = $true
                } catch {}
            }

            $bmp = New-Object System.Drawing.Bitmap $w, $h
            $g = [System.Drawing.Graphics]::FromImage($bmp)
            $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::Bilinear
            $g.DrawImage($rawBmp, 0, 0, $w, $h)
            $rawG.Dispose(); $rawBmp.Dispose()
        } else {
            $bmp = New-Object System.Drawing.Bitmap $w, $h
            $g = [System.Drawing.Graphics]::FromImage($bmp)
            $hdc = $g.GetHdc()
            # PW_RENDERFULLCONTENT = 2
            $ok = [WinFastCap]::PrintWindow($hwnd, $hdc, 2)
            $g.ReleaseHdc($hdc)

            if (-not $ok) {
                try {
                    $g.CopyFromScreen($rect.Left, $rect.Top, 0, 0, (New-Object System.Drawing.Size $w, $h))
                    $ok = $true
                } catch {}
            }
        }

        $ms.SetLength(0)
        $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Jpeg)
        $b64 = [Convert]::ToBase64String($ms.ToArray())

        $g.Dispose()
        $bmp.Dispose()

        [Console]::Out.WriteLine("FRAME|" + $w + "|" + $h + "|" + $b64)
    } catch {
        [Console]::Out.WriteLine("ERR|" + $_.Exception.Message)
    }
}
`;

export class PcAppCaptureManager {
  private worker?: ChildProcess;
  private isReady = false;
  private pendingResolvers: ((frame: { ok: boolean; data?: string; width: number; height: number; error?: string }) => void)[] = [];
  private spawnFailed = false;

  /**
   * Der PowerShell-Worker wird erst beim ersten Frame gestartet. Damit startet
   * ein Server mit deaktiviertem Feature-Flag keine Capture-Prozesse.
   */
  private ensureWorker(): void {
    if (this.worker && !this.worker.killed) return;
    if (this.spawnFailed) return;
    this.startWorker();
  }

  private startWorker(): void {
    try {
      this.worker = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", CAPTURE_WORKER_PS_SCRIPT], {
        stdio: ["pipe", "pipe", "ignore"],
      });
      this.worker.unref();

      if (this.worker.stdout) {
        const rl = readline.createInterface({ input: this.worker.stdout });
        rl.on("line", (line) => {
          if (line.startsWith("FRAME|")) {
            const parts = line.split("|");
            const width = parseInt(parts[1], 10) || 1280;
            const height = parseInt(parts[2], 10) || 720;
            const data = parts[3] || "";
            const resolver = this.pendingResolvers.shift();
            if (resolver) resolver({ ok: true, data, width, height });
          } else if (line.startsWith("ERR|")) {
            const resolver = this.pendingResolvers.shift();
            if (resolver) resolver({ ok: false, width: 0, height: 0, error: line.slice(4) });
          }
        });
      }

      // stdin wird gepuffert: Kommandos können sofort geschrieben werden,
      // während PowerShell das C# noch kompiliert.
      this.isReady = true;

      this.worker.on("exit", () => {
        this.isReady = false;
        this.worker = undefined;
      });
      this.worker.on("error", () => {
        this.isReady = false;
        this.worker = undefined;
        this.spawnFailed = true;
      });
    } catch {
      this.isReady = false;
      this.spawnFailed = true;
    }
  }

  /**
   * Einzelframe erfassen
   * @param hwnd Fenster-Handle
   * @param maxWidth Maximale Breite (Standard: 1920)
   * @param maxHeight Maximale Höhe (Standard: 1080)
   */
  public async captureWindow(
    hwnd: number,
    maxWidth = 1920,
    maxHeight = 1080,
  ): Promise<CaptureResult> {
    const t0 = performance.now();
    this.ensureWorker();
    if (!this.worker || !this.worker.stdin || !this.isReady) {
      return this.fallbackCapture(hwnd, maxWidth, maxHeight);
    }

    try {
      const framePromise = new Promise<{ ok: boolean; data?: string; width: number; height: number; error?: string }>(
        (resolve) => {
          this.pendingResolvers.push(resolve);
          setTimeout(() => {
            const idx = this.pendingResolvers.indexOf(resolve);
            if (idx >= 0) {
              this.pendingResolvers.splice(idx, 1);
              resolve({ ok: false, width: 0, height: 0, error: "Capture timeout" });
            }
          }, 8000);
        },
      );

      this.worker.stdin.write(`${hwnd},${maxWidth},${maxHeight}\n`);
      const result = await framePromise;
      const durationMs = Math.round((performance.now() - t0) * 10) / 10;

      if (!result.ok || !result.data) {
        return {
          ok: false,
          width: 0,
          height: 0,
          durationMs,
          method: "PrintWindow",
          error: result.error || "Capture fehlgeschlagen",
        };
      }

      return {
        ok: true,
        data: result.data,
        width: result.width,
        height: result.height,
        durationMs,
        method: "PrintWindow",
      };
    } catch (err: any) {
      return {
        ok: false,
        width: 0,
        height: 0,
        durationMs: Math.round((performance.now() - t0) * 10) / 10,
        method: "PrintWindow",
        error: err.message,
      };
    }
  }

  /**
   * Fallback-Einzelbildaufnahme über Direktkommando
   */
  private fallbackCapture(hwnd: number, maxWidth = 1920, maxHeight = 1080): CaptureResult {
    const t0 = performance.now();
    try {
      const ps = `
      Add-Type -AssemblyName System.Drawing
      Add-Type @"
      using System;
      using System.Runtime.InteropServices;
      public class FbCap {
        [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
        [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr h, IntPtr hdc, uint f);
        public struct RECT { public int L, T, R, B; }
      }
"@
      $r = New-Object FbCap+RECT
      [FbCap]::GetWindowRect([IntPtr]${hwnd}, [ref]$r)
      $rawW = [Math]::Max(10, $r.R - $r.L)
      $rawH = [Math]::Max(10, $r.B - $r.T)
      $scale = [Math]::Min(1.0, [Math]::Min(${maxWidth} / $rawW, ${maxHeight} / $rawH))
      $w = [Math]::Max(10, [int]($rawW * $scale))
      $h = [Math]::Max(10, [int]($rawH * $scale))

      $bmp = New-Object System.Drawing.Bitmap $w, $h
      $g = [System.Drawing.Graphics]::FromImage($bmp)
      $hdc = $g.GetHdc()
      $ok = [FbCap]::PrintWindow([IntPtr]${hwnd}, $hdc, 2)
      $g.ReleaseHdc($hdc)
      $ms = New-Object System.IO.MemoryStream
      $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Jpeg)
      $b64 = [Convert]::ToBase64String($ms.ToArray())
      $g.Dispose(); $bmp.Dispose(); $ms.Dispose()
      Write-Output ("OK|" + $w + "|" + $h + "|" + $b64)
      `;
      const res = spawnSync("powershell.exe", ["-NoProfile", "-Command", ps], { encoding: "utf8", timeout: 4000 });
      if (res.status === 0 && res.stdout.includes("OK|")) {
        const parts = res.stdout.trim().split("|");
        return {
          ok: true,
          width: parseInt(parts[1], 10),
          height: parseInt(parts[2], 10),
          data: parts[3],
          durationMs: Math.round(performance.now() - t0),
          method: "PrintWindow",
        };
      }
    } catch {}

    return {
      ok: false,
      width: 0,
      height: 0,
      durationMs: Math.round(performance.now() - t0),
      method: "PrintWindow",
      error: "Fallback-Capture fehlgeschlagen",
    };
  }

  /**
   * Startet eine Streaming-Sitzung für die gegebene App
   * @param windowMatch Suchmuster für das Fenster
   * @param out Callback für ausgehende WebSocket-/SSE-Nachrichten
   * @param onEnd Callback beim Schließen
   */
  public async openStreamSession(
    windowMatch: { processName?: string; titleRegex?: string },
    out: (message: string) => void,
    onEnd: () => void,
  ): Promise<StreamSession> {
    let closed = false;
    let targetWindow: WindowInfo | null = null;
    let driving = false; // Sicherheits-Default: Keine Eingaben ohne explizite Steuerung
    let frameTimer: ReturnType<typeof setTimeout> | null = null;
    let fps = 15;
    let lastFrameTime = 0;

    // Zielfenster suchen
    targetWindow = await defaultWindowFinder.findWindow(windowMatch, true);
    if (!targetWindow) {
      out(
        JSON.stringify({
          type: "problem",
          text: `Fenster für ${windowMatch.processName || windowMatch.titleRegex || "App"} nicht gefunden. Bitte Anwendung starten.`,
        }),
      );
    } else {
      out(
        JSON.stringify({
          type: "target",
          title: targetWindow.title,
          hwnd: targetWindow.hwnd,
          processName: targetWindow.processName,
        }),
      );
    }

    const captureLoop = async () => {
      if (closed) return;

      // Fenster periodisch auffrischen (z.B. falls neu gestartet oder vergrößert)
      if (!targetWindow) {
        targetWindow = await defaultWindowFinder.findWindow(windowMatch);
        if (targetWindow) {
          out(
            JSON.stringify({
              type: "target",
              title: targetWindow.title,
              hwnd: targetWindow.hwnd,
              processName: targetWindow.processName,
            }),
          );
        }
      }

      if (targetWindow) {
        const shot = await this.captureWindow(targetWindow.hwnd);
        if (shot.ok && shot.data) {
          const now = Date.now();
          const actualFps = lastFrameTime > 0 ? Math.round(1000 / (now - lastFrameTime)) : fps;
          lastFrameTime = now;

          out(
            JSON.stringify({
              type: "frame",
              data: shot.data,
              width: shot.width,
              height: shot.height,
              fps: actualFps,
              method: shot.method,
            }),
          );
        }
      }

      // Intervall: 15-20 FPS bei aktiver Steuerung (ca. 50-66ms), sonst 1 FPS (1000ms Leerlauf)
      const intervalMs = driving ? 50 : 1000;
      if (!closed) {
        frameTimer = setTimeout(captureLoop, intervalMs);
      }
    };

    // Starte Loop
    void captureLoop();

    const session: StreamSession = {
      handle(raw: string) {
        if (closed) return;
        let msg: any;
        try {
          msg = JSON.parse(raw);
        } catch {
          return;
        }

        if (!msg || typeof msg.type !== "string") return;

        // Modus-Umschaltung "Steuern"
        if (msg.type === "driving" && typeof msg.enabled === "boolean") {
          driving = msg.enabled;
          return;
        }

        // Eingaben weiterleiten
        if (targetWindow && (msg.type === "mouse" || msg.type === "wheel" || msg.type === "key" || msg.type === "text" || msg.type === "prompt")) {
          const target: InputTargetWindow = {
            hwnd: targetWindow.hwnd,
            bounds: targetWindow.bounds,
          };
          defaultInputInjector.inject(target, msg as PcAppInputEvent, driving);
        }

        if (msg.type === "scroll" && targetWindow) {
          const target: InputTargetWindow = {
            hwnd: targetWindow.hwnd,
            bounds: targetWindow.bounds,
          };
          defaultInputInjector.inject(target, { type: "wheel", deltaY: msg.deltaY }, driving);
        }
      },
      close() {
        if (closed) return;
        closed = true;
        if (frameTimer) {
          clearTimeout(frameTimer);
          frameTimer = null;
        }
        onEnd();
      },
      getTarget() {
        return targetWindow ? { hwnd: targetWindow.hwnd, bounds: targetWindow.bounds } : null;
      },
    };

    return session;
  }

  public dispose(): void {
    if (this.worker) {
      try {
        this.worker.stdin?.write("exit\n");
        this.worker.kill();
      } catch {}
      this.worker = undefined;
    }
  }
}

export const defaultCaptureManager = new PcAppCaptureManager();
