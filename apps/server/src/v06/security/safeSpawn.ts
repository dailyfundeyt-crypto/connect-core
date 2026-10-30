import { spawn, type ChildProcess, type SpawnOptions } from "node:child_process";

/**
 * Hilfsfunktionen für sichere Prozessstarts und Argument-Quoting unter Windows.
 * Verhindert Command-Injection-Schwachstellen (OWASP A03 / SEC-01 & SEC-07).
 */

/**
 * Maskiert ein einzelnes Argument strikt nach Windows-CommandLine-Regeln.
 * Verdoppelt Anführungszeichen und schützt vor Ausbrüchen aus cmd.exe / Shell-Kontexten.
 */
export function quoteCmdArg(arg: string): string {
  if (typeof arg !== "string") {
    arg = String(arg);
  }

  // Nullbytes und unzulässige Steuerzeichen abfangen
  if (arg.includes("\0")) {
    throw new Error("Command argument contains illegal null bytes");
  }

  // Leeres Argument als ""
  if (arg.length === 0) {
    return '""';
  }

  // Wenn keine Leerzeichen oder Metazeichen enthalten sind und keine Quotes, unverändert lassen
  if (!/[\s"&|<>=^%!;,()]/.test(arg)) {
    return arg;
  }

  // Anführungszeichen verdoppeln und in doppelte Anführungszeichen hüllen
  const escaped = arg.replace(/"/g, '""');
  return `"${escaped}"`;
}

/**
 * Erstellt eine sichere Befehlszeile für `cmd.exe /c "..."`.
 * Jedes Argument wird einzeln gequotet, sodass Metazeichen wie `&`, `|`, `<`, `>`
 * nicht als Shell-Operatoren interpretiert werden können.
 */
export function buildSafeWindowsCommandLine(cmd: string, args: string[] = []): string {
  if (cmd.includes("\0")) {
    throw new Error("Command contains illegal null bytes");
  }

  const quotedCmd = quoteCmdArg(cmd);
  const quotedArgs = args.map(quoteCmdArg);
  return [quotedCmd, ...quotedArgs].join(" ");
}

/**
 * Validiert eine URL vor der Übergabe an System-Launcher (z.B. `start` / Shell-Exec).
 * Schützt vor SEC-07: Verhindert `file:`, `javascript:`, Pipe-Tricks oder Windows-Optionen.
 */
export function validateSafeUrl(urlStr: string): { valid: boolean; error?: string } {
  if (!urlStr || typeof urlStr !== "string") {
    return { valid: false, error: "URL is empty or not a string" };
  }

  // Nullbytes oder Newlines verbieten
  if (/[\0\r\n]/.test(urlStr)) {
    return { valid: false, error: "URL contains illegal control characters" };
  }

  // Windows-Kommandozeilenoptionen wie /c oder -switch am Anfang abfangen
  const trimmed = urlStr.trim();
  if (trimmed.startsWith("/") || trimmed.startsWith("-")) {
    return { valid: false, error: "URL begins with suspicious switch syntax" };
  }

  // Anführungszeichen oder Shell-Operatoren in der URL blockieren
  if (/["'|&;^><]/.test(trimmed)) {
    return { valid: false, error: "URL contains unsafe shell metacharacters" };
  }

  try {
    const parsed = new URL(trimmed);
    const protocol = parsed.protocol.toLowerCase();
    if (protocol !== "http:" && protocol !== "https:") {
      return {
        valid: false,
        error: `Prohibited protocol: ${protocol}. Only http: and https: are permitted.`,
      };
    }
    return { valid: true };
  } catch (err: any) {
    return { valid: false, error: `Invalid URL format: ${err?.message || String(err)}` };
  }
}

/**
 * Sicherer Spawn-Wrapper:
 * - Erzwingt Argument-Arrays (kein zusammengefügter Befehls-String)
 * - Standardmäßig `shell: false` zur Verhinderung von Shell-Injektion
 * - Bereinigt Nullbytes aus allen Argumenten
 */
export function safeSpawn(
  executable: string,
  args: string[] = [],
  options: SpawnOptions = {},
): ChildProcess {
  if (executable.includes("\0")) {
    throw new Error("Executable path contains illegal null bytes");
  }

  const sanitizedArgs = args.map((arg, idx) => {
    if (typeof arg !== "string") {
      arg = String(arg);
    }
    if (arg.includes("\0")) {
      throw new Error(`Argument at index ${idx} contains illegal null bytes`);
    }
    return arg;
  });

  // Erzwinge shell: false außer ausdrücklich erlaubt (und warne/valdiere in dem Fall)
  const spawnOptions: SpawnOptions = {
    ...options,
    shell: options.shell ?? false,
    windowsHide: options.windowsHide ?? true,
  };

  return spawn(executable, sanitizedArgs, spawnOptions);
}
