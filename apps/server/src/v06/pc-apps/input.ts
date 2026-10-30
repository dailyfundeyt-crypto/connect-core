/**
 * Input Injector für PC-Apps (v06 / A28)
 *
 * Injiziert Maus- und Tastaturereignisse in ein Windows-Fenster.
 *
 * WICHTIG: Gemäß Sicherheitsrichtlinie werden Eingaben NUR injiziert,
 * wenn der Steuern-Modus (driving = true) aktiv ist!
 *
 * Spike-Erkenntnis (23.10.2026): `PostMessage(WM_CHAR/WM_KEYDOWN)` an das
 * Top-Level-HWND kommt bei WinUI-Apps (Windows-11-Notepad) nicht an, weil die
 * Texteingabe dort über TSF/CoreText am HWND vorbei läuft. Nachgewiesen:
 * PostMessage -> Dokument bleibt leer.
 *
 * Deshalb arbeitet dieser Adapter mit SetForegroundWindow + SendInput:
 * - Tasten (Enter, Shortcuts) als virtuelle Key-Codes (VK) -> funktioniert.
 * - Text über die Zwischenablage + Strg+V. Direkte `KEYEVENTF_UNICODE`-
 *   Zeicheninjektion lieferte auf diesem Host reproduzierbar verstümmelte
 *   Zeichen (z. B. "live input OK" -> "KKKKKKKKKKKKK"), Clipboard-Paste
 *   liefert exakt den gesendeten Text inkl. Umlauten.
 *   Hinweis: Der Host-Zwischenablageinhalt enthält danach den gesendeten Text.
 *
 * Das bedeutet bewusst: Im Steuern-Modus übernimmt die PC-App den Fokus auf
 * dem Host-Desktop (wie bei einer Fernsteuerung). Außerhalb von `driving`
 * wird kein Fokus gesetzt und kein Ereignis geschickt.
 */

import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { PcAppInputEvent } from "./types";

export interface InputTargetWindow {
  hwnd: number;
  bounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

const INPUT_WORKER_PS_SCRIPT = `
Add-Type -AssemblyName System.Windows.Forms
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
using System.Threading;

public class PcAppInput {
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
    [DllImport("user32.dll")] public static extern bool BringWindowToTop(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, IntPtr processId);
    [DllImport("user32.dll")] public static extern bool AttachThreadInput(uint idAttach, uint idAttachTo, bool fAttach);
    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
    [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);

    [StructLayout(LayoutKind.Sequential)]
    public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }

    [StructLayout(LayoutKind.Sequential)]
    public struct MOUSEINPUT { public int dx; public int dy; public uint mouseData; public uint dwFlags; public uint time; public IntPtr dwExtraInfo; }

    [StructLayout(LayoutKind.Sequential)]
    public struct KEYBDINPUT { public ushort wVk; public ushort wScan; public uint dwFlags; public uint time; public IntPtr dwExtraInfo; }

    [StructLayout(LayoutKind.Explicit)]
    public struct INPUTUNION { [FieldOffset(0)] public MOUSEINPUT mi; [FieldOffset(0)] public KEYBDINPUT ki; }

    [StructLayout(LayoutKind.Sequential)]
    public struct INPUT { public uint type; public INPUTUNION u; }

    [DllImport("user32.dll", SetLastError = true)]
    public static extern uint SendInput(uint nInputs, INPUT[] pInputs, int cbSize);

    public const uint INPUT_MOUSE = 0;
    public const uint INPUT_KEYBOARD = 1;
    public const uint KEYEVENTF_KEYUP = 0x0002;
    public const uint KEYEVENTF_UNICODE = 0x0004;
    public const uint MOUSEEVENTF_LEFTDOWN = 0x0002;
    public const uint MOUSEEVENTF_LEFTUP = 0x0004;
    public const uint MOUSEEVENTF_RIGHTDOWN = 0x0008;
    public const uint MOUSEEVENTF_RIGHTUP = 0x0010;
    public const uint MOUSEEVENTF_MIDDLEDOWN = 0x0020;
    public const uint MOUSEEVENTF_MIDDLEUP = 0x0040;
    public const uint MOUSEEVENTF_WHEEL = 0x0800;

    public static void Focus(IntPtr hWnd) {
        uint fgThread = GetWindowThreadProcessId(GetForegroundWindow(), IntPtr.Zero);
        uint targetThread = GetWindowThreadProcessId(hWnd, IntPtr.Zero);
        bool attached = fgThread != targetThread && AttachThreadInput(fgThread, targetThread, true);
        try {
            ShowWindow(hWnd, 5); // SW_SHOW
            BringWindowToTop(hWnd);
            SetForegroundWindow(hWnd);
        } finally {
            if (attached) AttachThreadInput(fgThread, targetThread, false);
        }
    }

    private static void SendMouse(uint flags, int data) {
        INPUT[] buf = new INPUT[1];
        buf[0].type = INPUT_MOUSE;
        buf[0].u.mi = new MOUSEINPUT();
        buf[0].u.mi.dwFlags = flags;
        buf[0].u.mi.mouseData = (uint)data;
        SendInput(1, buf, Marshal.SizeOf(typeof(INPUT)));
    }

    public static void Click(IntPtr hWnd, int x, int y, int button) {
        RECT r;
        GetWindowRect(hWnd, out r);
        Focus(hWnd);
        Thread.Sleep(90);
        SetCursorPos(r.Left + x, r.Top + y);
        Thread.Sleep(30);
        if (button == 2) {
            SendMouse(MOUSEEVENTF_RIGHTDOWN, 0);
            SendMouse(MOUSEEVENTF_RIGHTUP, 0);
        } else if (button == 1) {
            SendMouse(MOUSEEVENTF_MIDDLEDOWN, 0);
            SendMouse(MOUSEEVENTF_MIDDLEUP, 0);
        } else {
            SendMouse(MOUSEEVENTF_LEFTDOWN, 0);
            SendMouse(MOUSEEVENTF_LEFTUP, 0);
        }
    }

    public static void Move(IntPtr hWnd, int x, int y) {
        RECT r;
        GetWindowRect(hWnd, out r);
        SetCursorPos(r.Left + x, r.Top + y);
    }

    public static void Wheel(IntPtr hWnd, int delta) {
        Focus(hWnd);
        Thread.Sleep(60);
        SendMouse(MOUSEEVENTF_WHEEL, delta);
    }

    public static void Key(IntPtr hWnd, int vk, bool up) {
        INPUT[] buf = new INPUT[1];
        buf[0].type = INPUT_KEYBOARD;
        buf[0].u.ki = new KEYBDINPUT();
        buf[0].u.ki.wVk = (ushort)vk;
        buf[0].u.ki.dwFlags = up ? KEYEVENTF_KEYUP : 0;
        SendInput(1, buf, Marshal.SizeOf(typeof(INPUT)));
    }
}
"@

while ($line = [Console]::In.ReadLine()) {
    if ($line -eq "exit") { break }
    try {
        $cmdEnd = $line.IndexOf("|")
        if ($cmdEnd -lt 0) {
            [Console]::Out.WriteLine("ERR|Leeres Kommando")
            continue
        }
        $cmd = $line.Substring(0, $cmdEnd)
        $rest = $line.Substring($cmdEnd + 1)
        $sep = $rest.IndexOf("|")
        if ($sep -lt 0) {
            $hwnd = [IntPtr][long]$rest
            $payload = ""
        } else {
            $hwnd = [IntPtr][long]$rest.Substring(0, $sep)
            $payload = $rest.Substring($sep + 1)
        }

        if ($cmd -eq "FOCUS") {
            [PcAppInput]::Focus($hwnd)
        } elseif ($cmd -eq "CLICK") {
            $p = $payload.Split("|")
            [PcAppInput]::Click($hwnd, [int]$p[0], [int]$p[1], [int]$p[2])
        } elseif ($cmd -eq "MOVE") {
            $p = $payload.Split("|")
            [PcAppInput]::Move($hwnd, [int]$p[0], [int]$p[1])
        } elseif ($cmd -eq "WHEEL") {
            [PcAppInput]::Wheel($hwnd, [int]$payload)
        } elseif ($cmd -eq "TEXT") {
            # Text über die Zwischenablage einfügen: KEYEVENTF_UNICODE lieferte
            # auf diesem Host verstümmelte Zeichen, Clipboard-Paste ist exakt.
            [PcAppInput]::Focus($hwnd)
            Start-Sleep -Milliseconds 110
            Set-Clipboard -Value $payload -ErrorAction Stop
            Start-Sleep -Milliseconds 70
            [PcAppInput]::Key($hwnd, 0x11, $false)
            [PcAppInput]::Key($hwnd, 0x56, $false)
            [PcAppInput]::Key($hwnd, 0x56, $true)
            [PcAppInput]::Key($hwnd, 0x11, $true)
        } elseif ($cmd -eq "KEY") {
            $p = $payload.Split("|")
            [PcAppInput]::Key($hwnd, [int]$p[0], [bool]::Parse($p[1]))
        } else {
            [Console]::Out.WriteLine("ERR|Unbekanntes Kommando: " + $cmd)
            continue
        }
        [Console]::Out.WriteLine("OK")
    } catch {
        [Console]::Out.WriteLine("ERR|" + $_.Exception.Message)
    }
}
`;

export class PcAppInputInjector {
  private worker?: ChildProcess;
  private spawnFailed = false;

  /**
   * Startet den PowerShell-Worker erst bei der ersten echten Eingabe.
   * Wichtig: Beim bloßen Import/Serverstart (Feature-Flag aus) wird kein
   * Prozess gestartet.
   */
  private ensureWorker(): ChildProcess | undefined {
    if (this.worker && !this.worker.killed) return this.worker;
    if (this.spawnFailed) return undefined;

    try {
      // -STA: Zwischenablage-Zugriff (System.Windows.Forms.Clipboard) benötigt STA
      this.worker = spawn(
        "powershell.exe",
        ["-NoProfile", "-NonInteractive", "-STA", "-Command", INPUT_WORKER_PS_SCRIPT],
        { stdio: ["pipe", "pipe", "ignore"] },
      );
      this.worker.unref();

      // C#-Kompilierung läuft asynchron an; stdin wird gepuffert, daher können
      // Kommandos sofort geschrieben werden.
      this.worker.on("exit", () => {
        this.worker = undefined;
      });
      this.worker.on("error", () => {
        this.worker = undefined;
        this.spawnFailed = true;
      });

      return this.worker;
    } catch {
      this.spawnFailed = true;
      return undefined;
    }
  }

  /**
   * Injiziert ein Eingabe-Ereignis
   * @param target Das Zielfenster mit HWND und Koordinaten
   * @param event Das Eingabeereignis
   * @param driving Muss TRUE sein; andernfalls wird die Eingabe aus Sicherheitsgründen ignoriert
   */
  public inject(
    target: InputTargetWindow,
    event: PcAppInputEvent,
    driving: boolean,
  ): boolean {
    if (!driving) {
      // Sicherheits-Gate: Keine Eingaben ohne aktiven Steuern-Modus!
      return false;
    }

    if (!target.hwnd || target.hwnd <= 0) {
      return false;
    }

    const worker = this.ensureWorker();
    if (!worker?.stdin) {
      return this.fallbackInject(target, event);
    }

    try {
      if (event.type === "mouse") {
        const x = Math.round(Number(event.x || 0));
        const y = Math.round(Number(event.y || 0));
        const btn = event.button === "right" ? 2 : event.button === "middle" ? 1 : 0;
        if (event.event === "moved") {
          worker.stdin.write(`MOVE|${target.hwnd}|${x}|${y}\n`);
        } else {
          worker.stdin.write(`CLICK|${target.hwnd}|${x}|${y}|${btn}\n`);
        }
        return true;
      }

      if (event.type === "wheel") {
        const delta = Math.round(Number(event.deltaY || 0) * -1);
        worker.stdin.write(`WHEEL|${target.hwnd}|${delta}\n`);
        return true;
      }

      if (event.type === "text" && typeof event.text === "string") {
        // Nur echte Zeilenumbrüche ersetzen – der Text ist das letzte Feld der Pipe-Zeile
        const clean = event.text.replace(/[\r\n]/g, " ");
        worker.stdin.write(`TEXT|${target.hwnd}|${clean}\n`);
        return true;
      }

      if (event.type === "prompt" && typeof event.text === "string") {
        const clean = event.text.replace(/[\r\n]/g, " ");
        worker.stdin.write(`TEXT|${target.hwnd}|${clean}\n`);
        if (event.submit) {
          setTimeout(() => {
            if (this.worker?.stdin) {
              this.worker.stdin.write(`KEY|${target.hwnd}|13|false\n`);
              this.worker.stdin.write(`KEY|${target.hwnd}|13|true\n`);
            }
          }, 120);
        }
        return true;
      }

      if (event.type === "key") {
        const vk = Number(event.windowsVirtualKeyCode || 0);
        const isUp = event.event === "up";
        if (vk > 0) {
          worker.stdin.write(`KEY|${target.hwnd}|${vk}|${isUp}\n`);
        } else if (event.text && !isUp) {
          worker.stdin.write(`TEXT|${target.hwnd}|${event.text}\n`);
        }
        return true;
      }
    } catch {
      return false;
    }

    return false;
  }

  /**
   * Einmal-Fallback, falls der Worker nicht startet: fokussiert das Fenster und
   * fügt den Text per Zwischenablage + Strg+V ein (Einzel-PowerShell-Kommando).
   */
  private fallbackInject(target: InputTargetWindow, event: PcAppInputEvent): boolean {
    const text =
      event.type === "text" || event.type === "prompt"
        ? String(event.text || "")
        : event.type === "key"
          ? String(event.text || "")
          : "";
    if (!text) return false;

    try {
      const tmpFile = path.join(os.tmpdir(), `a28-fallback-${process.pid}-${Date.now()}.txt`);
      fs.writeFileSync(tmpFile, text, "utf8");
      const ps = `
Add-Type -AssemblyName System.Windows.Forms
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class WinInputFb {
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int n);
  [DllImport("user32.dll")] public static extern uint SendInput(uint n, INPUT[] p, int cb);
  [StructLayout(LayoutKind.Sequential)] public struct KEYBDINPUT { public ushort wVk; public ushort wScan; public uint dwFlags; public uint time; public IntPtr dwExtraInfo; }
  [StructLayout(LayoutKind.Explicit)] public struct INPUTUNION { [FieldOffset(0)] public KEYBDINPUT ki; }
  [StructLayout(LayoutKind.Sequential)] public struct INPUT { public uint type; public INPUTUNION u; }
  public static void Key(int vk, bool up) {
    INPUT[] b = new INPUT[1];
    b[0].type = 1; b[0].u.ki = new KEYBDINPUT(); b[0].u.ki.wVk = (ushort)vk; b[0].u.ki.dwFlags = up ? 0x0002u : 0u;
    SendInput(1, b, Marshal.SizeOf(typeof(INPUT)));
  }
}
"@
$text = [System.IO.File]::ReadAllText('${tmpFile.replace(/'/g, "''")}')
[WinInputFb]::ShowWindow([IntPtr]${target.hwnd}, 5)
[WinInputFb]::SetForegroundWindow([IntPtr]${target.hwnd})
Start-Sleep -Milliseconds 150
[System.Windows.Forms.Clipboard]::SetText($text)
Start-Sleep -Milliseconds 80
[WinInputFb]::Key(0x11, $false); [WinInputFb]::Key(0x56, $false)
[WinInputFb]::Key(0x56, $true); [WinInputFb]::Key(0x11, $true)
`;
      // Text über eine temporäre Datei übergeben, damit keine Anführungszeichen/Escapes nötig sind
      spawnSync("powershell.exe", ["-NoProfile", "-STA", "-Command", ps], { timeout: 5000 });
      try {
        fs.unlinkSync(tmpFile);
      } catch {}
      return true;
    } catch {
      return false;
    }
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

export const defaultInputInjector = new PcAppInputInjector();
