using System.Diagnostics;
using System.Net.Http;
using System.Net.NetworkInformation;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace ConnectApp;

/// <summary>Das eingebaute Backend: portables PostgreSQL 17 (+pgvector) mit Daten in
/// %LOCALAPPDATA%\ConnectApp\data\pgdata, Migrationen (drizzle, apps/server/drizzle) und der
/// Connect-Server (Bun), der API und gebaute Web-UI auf EINEM Port ausliefert.</summary>
internal sealed class Backend
{
    private readonly AppPaths _p;
    private static readonly HttpClient Http = new() { Timeout = TimeSpan.FromSeconds(8) };

    public Backend(AppPaths p) { _p = p; }

    private string Pg(string tool) => Path.Combine(_p.PgBin, tool + ".exe");

    // ---------------------------------------------------------------- Konfiguration / Secrets
    /// <summary>Dauerhafte Einstellungen + Secrets dieser Installation (DB-Passwort, KEY_ENCRYPTION_KEY …).
    /// Liegt im Datenordner, damit sie Updates ueberleben. Wird nur beim ersten Start erzeugt.</summary>
    public Dictionary<string, string> EnsureEnvFile()
    {
        Directory.CreateDirectory(_p.DataDir);
        if (!File.Exists(_p.EnvFile))
        {
            var sb = new StringBuilder();
            sb.AppendLine("# Connect App - lokale Konfiguration (automatisch erzeugt " + DateTime.Now.ToString("yyyy-MM-dd HH:mm") + ")");
            sb.AppendLine("# Diese Datei NICHT loeschen: KEY_ENCRYPTION_KEY verschluesselt gespeicherte Zugangsdaten in der DB.");
            sb.AppendLine("CONNECT_APP_DB_PASSWORD=" + Convert.ToHexString(RandomNumberGenerator.GetBytes(24)).ToLowerInvariant());
            sb.AppendLine("KEY_ENCRYPTION_KEY=" + Convert.ToBase64String(RandomNumberGenerator.GetBytes(32)));
            sb.AppendLine("WORKER_SHARED_SECRET=" + Convert.ToHexString(RandomNumberGenerator.GetBytes(24)).ToLowerInvariant());
            var imported = ImportKeysFromDevCopy();
            if (imported.Count > 0)
            {
                sb.AppendLine("# Einmalig uebernommen aus " + Path.Combine(_p.DevCopyRoot!, ".env") + ":");
                foreach (var kv in imported) sb.AppendLine(kv.Key + "=" + kv.Value);
            }
            File.WriteAllText(_p.EnvFile, sb.ToString(), new UTF8Encoding(false));
            Log.Write($"connect.env erzeugt ({imported.Count} Keys aus Dev-Kopie uebernommen: {string.Join(",", imported.Keys)})");
        }
        return ParseEnv(_p.EnvFile);
    }

    // Nur Anbieter-/Agent-Einstellungen, keine Login-/DB-/URL-Werte (die App hat eigene DB, eigenen Port, Single-User).
    private static readonly string[] ImportWhitelist =
    {
        "OPENAI_API_KEY", "INTELLIGENCE_API_URL", "INTELLIGENCE_GATEWAY_WS_URL", "INTELLIGENCE_API_KEY",
        "COPILOTKIT_LICENSE_TOKEN", "AGENT_STALL_TIMEOUT_MS", "COMPOSIO_API_KEY",
        "CONNECT_CODEX_BRIDGE_MODE", "CONNECT_CODEX_BRIDGE_URL", "CONNECT_CODEX_BRIDGE_MODEL",
        "AGENT_COMPUTER_URL", "COMPUTER_TOKEN", "COMPUTER_BROWSER_MODE", "COMPUTER_SUPERVISOR_URL", "SUPERVISOR_TOKEN",
        "COMPUTER_RUNTIME", "MANAGED_AGENT_TOKEN", "AGENT_TOOL_TOKEN",
        "CONNECT_CHROME_BIN", "CONNECT_CHROME_PROFILE", "CONNECT_CHROME_CDP_PORT",
    };

    private Dictionary<string, string> ImportKeysFromDevCopy()
    {
        var result = new Dictionary<string, string>();
        if (_p.DevCopyRoot == null) return result;
        var env = Path.Combine(_p.DevCopyRoot, ".env");
        if (!File.Exists(env)) return result;
        var src = ParseEnv(env);
        foreach (var k in ImportWhitelist)
            if (src.TryGetValue(k, out var v) && !string.IsNullOrWhiteSpace(v)) result[k] = v;
        return result;
    }

    public static Dictionary<string, string> ParseEnv(string file)
    {
        var d = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        foreach (var raw in File.ReadAllLines(file))
        {
            var line = raw.Trim();
            if (line.Length == 0 || line.StartsWith('#')) continue;
            var i = line.IndexOf('=');
            if (i <= 0) continue;
            var v = line[(i + 1)..].Trim();
            if (v.Length >= 2 && ((v[0] == '"' && v[^1] == '"') || (v[0] == '\'' && v[^1] == '\''))) v = v[1..^1];
            d[line[..i].Trim()] = v;
        }
        return d;
    }

    public string DatabaseUrl(Dictionary<string, string> env) =>
        $"postgres://connect:{env["CONNECT_APP_DB_PASSWORD"]}@127.0.0.1:{_p.PgPort}/connect";

    /// <summary>Umgebung fuer Migration und Server. Port/Pfade kommen immer frisch vom Launcher,
    /// damit ein Update (neuer Programmordner) nichts in den Daten anpassen muss.</summary>
    public Dictionary<string, string> ServerEnv(Dictionary<string, string> envFile)
    {
        var e = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        foreach (var kv in envFile) if (!kv.Key.StartsWith("CONNECT_APP_", StringComparison.OrdinalIgnoreCase)) e[kv.Key] = kv.Value;
        var origin = $"http://localhost:{_p.AppPort}";
        e["DATABASE_URL"] = DatabaseUrl(envFile);
        e["PORT"] = _p.AppPort.ToString();
        e["SERVER_PORT"] = _p.AppPort.ToString();
        e["NODE_ENV"] = "production";
        e["CONNECT_SINGLE_USER"] = "true";
        e["APP_DIST_DIR"] = _p.AppDistDir;
        e["TENANT_PACKAGE_DIR"] = _p.TenantDir;
        e["CONNECT_APP_URL"] = origin;
        e["OPENBOT_APP_URL"] = origin;
        e["TRUSTED_ORIGINS"] = $"{origin},http://127.0.0.1:{_p.AppPort}";
        e["PATH"] = Path.GetDirectoryName(_p.BunExe) + ";" + _p.PgBin + ";" + Environment.GetEnvironmentVariable("PATH");
        // Geerbte Login-/DB-Variablen aus der Benutzerumgebung neutralisieren (Single-User, eigene DB),
        // ausser sie stehen bewusst in connect.env.
        foreach (var k in new[] { "BETTER_AUTH_SECRET", "BETTER_AUTH_URL", "GOOGLE_OAUTH_CLIENT_ID", "GOOGLE_OAUTH_CLIENT_SECRET",
                     "MICROSOFT_OAUTH_CLIENT_ID", "MICROSOFT_OAUTH_CLIENT_SECRET", "OKTA_OAUTH_ISSUER", "CONNECT_PUBLIC_URL" })
            if (!envFile.ContainsKey(k)) e[k] = "";
        return e;
    }

    // ---------------------------------------------------------------- PostgreSQL
    public bool ClusterExists => File.Exists(Path.Combine(_p.PgData, "PG_VERSION"));

    public void InitCluster(Dictionary<string, string> env)
    {
        Directory.CreateDirectory(_p.DataDir);
        if (Directory.Exists(_p.PgData) && Directory.EnumerateFileSystemEntries(_p.PgData).Any())
            throw new InvalidOperationException($"Datenordner {_p.PgData} existiert, ist aber kein PostgreSQL-Cluster. Bitte pruefen/umbenennen.");
        var pw = Path.Combine(_p.DataDir, "pw.tmp");
        File.WriteAllText(pw, env["CONNECT_APP_DB_PASSWORD"]);
        try
        {
            var r = Proc.Run(Pg("initdb"), new[] { "-D", _p.PgData, "-U", "connect", "--pwfile=" + pw, "-A", "scram-sha-256", "-E", "UTF8", "--no-locale" }, timeoutMs: 180_000);
            Log.Write("initdb exit " + r.ExitCode + "\n" + r.Output);
            if (r.ExitCode != 0) throw new InvalidOperationException("initdb fehlgeschlagen:\n" + Last(r.Output));
        }
        finally { try { File.Delete(pw); } catch { } }
        // Nur Loopback; kleine Desktop-Defaults.
        File.AppendAllText(Path.Combine(_p.PgData, "postgresql.auto.conf"),
            "\nlisten_addresses = '127.0.0.1'\nmax_connections = 60\nshared_buffers = '128MB'\nlog_timezone = 'Europe/Berlin'\ntimezone = 'UTC'\n");
    }

    public bool PostgresRunning() =>
        ClusterExists && Proc.Run(Pg("pg_ctl"), new[] { "status", "-D", _p.PgData }, timeoutMs: 20_000).ExitCode == 0;

    public bool PostgresReady() =>
        Proc.Run(Pg("pg_isready"), new[] { "-h", "127.0.0.1", "-p", _p.PgPort.ToString(), "-U", "connect", "-d", "postgres", "-t", "3" }, timeoutMs: 15_000).ExitCode == 0;

    public void StartPostgres()
    {
        if (PostgresRunning()) { Log.Write("PostgreSQL laeuft bereits"); return; }
        if (PortListening(_p.PgPort))
            throw new InvalidOperationException($"Port {_p.PgPort} ist von einem anderen Programm belegt. In connect-app.json \"PgPort\" aendern.");
        var code = Proc.RunDetachedWait(Pg("pg_ctl"), new[] { "start", "-D", _p.PgData, "-l", _p.PostgresLog, "-w", "-t", "90", "-o", $"-p {_p.PgPort}" }, timeoutMs: 120_000);
        Log.Write("pg_ctl start exit " + code);
        if (code != 0) throw new InvalidOperationException("PostgreSQL startet nicht.\n" + Proc.Tail(_p.PostgresLog, 12));
    }

    public void StopPostgres()
    {
        if (!ClusterExists) return;
        if (!PostgresRunning()) return;
        var code = Proc.RunDetachedWait(Pg("pg_ctl"), new[] { "stop", "-D", _p.PgData, "-m", "fast", "-w", "-t", "60" }, timeoutMs: 90_000);
        Log.Write("pg_ctl stop exit " + code);
    }

    private Dictionary<string, string> PgEnv(Dictionary<string, string> env) => new() { ["PGPASSWORD"] = env["CONNECT_APP_DB_PASSWORD"], ["PGCLIENTENCODING"] = "UTF8" };

    public void EnsureDatabase(Dictionary<string, string> env)
    {
        var q = Proc.Run(Pg("psql"), new[] { "-h", "127.0.0.1", "-p", _p.PgPort.ToString(), "-U", "connect", "-d", "postgres", "-tAc", "select 1 from pg_database where datname='connect'" }, PgEnv(env), timeoutMs: 30_000);
        if (q.ExitCode != 0) throw new InvalidOperationException("Datenbank nicht erreichbar:\n" + Last(q.Output));
        if (q.Output.Trim() == "1") return;
        var c = Proc.Run(Pg("createdb"), new[] { "-h", "127.0.0.1", "-p", _p.PgPort.ToString(), "-U", "connect", "-E", "UTF8", "connect" }, PgEnv(env), timeoutMs: 60_000);
        Log.Write("createdb exit " + c.ExitCode + " " + c.Output);
        if (c.ExitCode != 0) throw new InvalidOperationException("Datenbank 'connect' konnte nicht angelegt werden:\n" + Last(c.Output));
    }

    public int AppliedMigrations(Dictionary<string, string> env)
    {
        var q = Proc.Run(Pg("psql"), new[] { "-h", "127.0.0.1", "-p", _p.PgPort.ToString(), "-U", "connect", "-d", "connect", "-tAc",
            "select case when to_regclass('drizzle.__drizzle_migrations') is null then 0 else (select count(*) from drizzle.__drizzle_migrations) end" }, PgEnv(env), timeoutMs: 30_000);
        return int.TryParse(q.Output.Trim(), out var n) ? n : -1;
    }

    public string Backup(Dictionary<string, string> env, string label)
    {
        Directory.CreateDirectory(_p.BackupDir);
        var file = Path.Combine(_p.BackupDir, $"connect-{label}-{DateTime.Now:yyyyMMdd-HHmmss}.dump");
        var r = Proc.Run(Pg("pg_dump"), new[] { "-h", "127.0.0.1", "-p", _p.PgPort.ToString(), "-U", "connect", "-d", "connect", "-Fc", "-f", file }, PgEnv(env), timeoutMs: 600_000);
        Log.Write($"pg_dump {label} exit {r.ExitCode} -> {file} {r.Output}");
        if (r.ExitCode != 0) throw new InvalidOperationException("Backup fehlgeschlagen:\n" + Last(r.Output));
        // Automatische Backups rotieren (die letzten 10 behalten); manuelle bleiben.
        foreach (var old in new DirectoryInfo(_p.BackupDir).GetFiles("connect-auto-*.dump").OrderByDescending(f => f.Name).Skip(10)) old.Delete();
        return file;
    }

    // ---------------------------------------------------------------- Migrationen + Server
    public void Migrate(Dictionary<string, string> serverEnv)
    {
        var r = Proc.Run(_p.BunExe, new[] { "scripts/migrate.ts" }, serverEnv, _p.ServerDir, timeoutMs: 300_000);
        File.AppendAllText(_p.MigrateLog, $"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] exit {r.ExitCode}\n{r.Output}\n");
        Log.Write("migrate exit " + r.ExitCode + " " + Last(r.Output, 400));
        if (r.ExitCode != 0) throw new InvalidOperationException("Datenbank-Migration fehlgeschlagen:\n" + Last(r.Output));
    }

    public List<Process> ServerProcesses() => Native.ProcessesOf(_p.BunExe);

    public void StartServer(Dictionary<string, string> serverEnv)
    {
        try { var fi = new FileInfo(_p.ServerLog); if (fi.Exists && fi.Length > 10_000_000) File.Move(_p.ServerLog, _p.ServerLog + ".old", true); } catch { }
        File.AppendAllText(_p.ServerLog, $"\n===== {DateTime.Now:yyyy-MM-dd HH:mm:ss} Connect App Server Start (Port {_p.AppPort}) =====\n");
        Proc.StartLogged(_p.BunExe, "src/index.ts", _p.ServerLog, _p.ServerDir, serverEnv);
        Log.Write("Server gestartet (bun src/index.ts, Log " + _p.ServerLog + ")");
    }

    public void StopServer()
    {
        foreach (var p in ServerProcesses())
        {
            try { p.Kill(entireProcessTree: true); p.WaitForExit(10_000); Log.Write("Server-Prozess beendet: " + p.Id); } catch (Exception ex) { Log.Write("Kill " + p.Id + ": " + ex.Message); }
        }
    }

    public async Task<bool> HealthOk()
    {
        try { using var r = await Http.GetAsync($"http://127.0.0.1:{_p.AppPort}/health"); return r.IsSuccessStatusCode; } catch { return false; }
    }

    public async Task<bool> UiOk()
    {
        try
        {
            using var r = await Http.GetAsync($"http://127.0.0.1:{_p.AppPort}/");
            var body = await r.Content.ReadAsStringAsync();
            return r.IsSuccessStatusCode && body.Contains("<html", StringComparison.OrdinalIgnoreCase);
        }
        catch { return false; }
    }

    public static bool PortListening(int port) =>
        IPGlobalProperties.GetIPGlobalProperties().GetActiveTcpListeners().Any(e => e.Port == port);

    // ---------------------------------------------------------------- State (Bundle-Version)
    public string? LastBundleVersion()
    {
        try { return JsonDocument.Parse(File.ReadAllText(_p.StateFile)).RootElement.GetProperty("bundleVersion").GetString(); } catch { return null; }
    }

    public void SaveState(int migrations)
    {
        File.WriteAllText(_p.StateFile, JsonSerializer.Serialize(new
        {
            bundleVersion = _p.BundleVersion, migrations, lastStart = DateTime.Now.ToString("s"), appDir = _p.AppDir,
        }, new JsonSerializerOptions { WriteIndented = true }));
    }

    private static string Last(string s, int max = 1500) => s.Length <= max ? s.Trim() : "…" + s[^max..].Trim();
}
