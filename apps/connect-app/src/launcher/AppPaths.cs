using System.Text.Json;

namespace ConnectApp;

/// <summary>Alle Pfade und Einstellungen. Programm (AppDir) und Daten (DataRoot) sind strikt getrennt:
/// ein Update ersetzt nur AppDir, die Daten unter %LOCALAPPDATA%\ConnectApp bleiben.</summary>
internal sealed class AppPaths
{
    public required string AppDir { get; init; }
    public required string ExePath { get; init; }
    public required string HeliumExe { get; init; }
    public required string BunExe { get; init; }
    public required string PgBin { get; init; }
    public required string ConnectDir { get; init; }
    public required string ServerDir { get; init; }
    public required string AppDistDir { get; init; }
    public required string TenantDir { get; init; }
    public required string BundleVersionFile { get; init; }

    public required string DataRoot { get; init; }
    public required string DataDir { get; init; }
    public required string PgData { get; init; }
    public required string EnvFile { get; init; }
    public required string StateFile { get; init; }
    public required string BackupDir { get; init; }
    public required string ProfileDir { get; init; }

    public required string LauncherLog { get; init; }
    public required string ServerLog { get; init; }
    public required string PostgresLog { get; init; }
    public required string MigrateLog { get; init; }

    public required string DesktopShortcut { get; init; }
    public required string StartMenuShortcut { get; init; }
    public string? DevCopyRoot { get; init; }

    public required int AppPort { get; init; }
    public required int PgPort { get; init; }
    public required bool LoadExtension { get; init; }
    public string? ExtensionDir { get; init; }
    public required bool KeepBackendRunning { get; init; }

    /// <summary>Optional: gehostetes Connect statt lokalem Backend (z.B. "https://connect.example.com/").</summary>
    public string? RemoteUrl { get; init; }
    public bool UsesRemote => !string.IsNullOrWhiteSpace(RemoteUrl);
    public string AppUrl => UsesRemote ? RemoteUrl!.TrimEnd('/') + "/" : $"http://localhost:{AppPort}/";
    public string BundleVersion => File.Exists(BundleVersionFile) ? File.ReadAllText(BundleVersionFile).Trim() : "unknown";

    private sealed class ConfigFile
    {
        public int? AppPort { get; set; }
        public int? PgPort { get; set; }
        public bool? LoadExtension { get; set; }
        public string? ExtensionDir { get; set; }
        public bool? KeepBackendRunning { get; set; }
        public string? DataRoot { get; set; }
        public string? RemoteUrl { get; set; }
    }

    public static AppPaths Resolve()
    {
        var appDir = Path.TrimEndingDirectorySeparator(AppContext.BaseDirectory);
        var cfg = new ConfigFile();
        var cfgPath = Path.Combine(appDir, "connect-app.json");
        if (File.Exists(cfgPath))
        {
            cfg = JsonSerializer.Deserialize<ConfigFile>(File.ReadAllText(cfgPath),
                new JsonSerializerOptions { PropertyNameCaseInsensitive = true, ReadCommentHandling = JsonCommentHandling.Skip, AllowTrailingCommas = true }) ?? cfg;
        }
        var local = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
        var dataRoot = string.IsNullOrWhiteSpace(cfg.DataRoot) ? Path.Combine(local, "ConnectApp") : Environment.ExpandEnvironmentVariables(cfg.DataRoot);
        var dataDir = Path.Combine(dataRoot, "data");
        var temp = Path.GetTempPath();
        var runtime = Path.Combine(appDir, "runtime");
        var connect = Path.Combine(runtime, "connect");

        // Liegt die App in einer Entwickler-Kopie (…\OpenBot-v2-Helium\apps\connect-app), wird deren Wurzel erkannt:
        // nur zum einmaligen Uebernehmen von API-Keys aus deren .env und fuer den optionalen Extension-Pfad.
        string? devRoot = null;
        for (var d = Directory.GetParent(appDir); d != null; d = d.Parent)
        {
            if (File.Exists(Path.Combine(d.FullName, "docker-compose.yml")) && Directory.Exists(Path.Combine(d.FullName, "apps", "server")))
            { devRoot = d.FullName; break; }
        }
        // Extension: gebuendelte Kopie (AppDir\extension, Port beim Bundle-Bau angepasst) hat Vorrang.
        var ext = string.IsNullOrWhiteSpace(cfg.ExtensionDir) ? null : Environment.ExpandEnvironmentVariables(cfg.ExtensionDir);
        var bundledExt = Path.Combine(appDir, "extension");
        if (ext == null && File.Exists(Path.Combine(bundledExt, "manifest.json"))) ext = bundledExt;

        return new AppPaths
        {
            AppDir = appDir,
            ExePath = Environment.ProcessPath ?? Path.Combine(appDir, "Connect.exe"),
            HeliumExe = Path.Combine(appDir, "helium", "chrome.exe"),
            BunExe = Path.Combine(runtime, "bun", "bun.exe"),
            PgBin = Path.Combine(runtime, "pgsql", "bin"),
            ConnectDir = connect,
            ServerDir = Path.Combine(connect, "apps", "server"),
            AppDistDir = Path.Combine(connect, "apps", "app", "dist"),
            TenantDir = Path.Combine(connect, "apps", "examples", "fintech"),
            BundleVersionFile = Path.Combine(connect, "BUNDLE_VERSION.txt"),
            DataRoot = dataRoot,
            DataDir = dataDir,
            PgData = Path.Combine(dataDir, "pgdata"),
            EnvFile = Path.Combine(dataDir, "connect.env"),
            StateFile = Path.Combine(dataDir, "state.json"),
            BackupDir = Path.Combine(dataDir, "backups"),
            ProfileDir = Path.Combine(dataRoot, "profile"),
            LauncherLog = Path.Combine(temp, "connect-app.log"),
            ServerLog = Path.Combine(temp, "connect-app-server.log"),
            PostgresLog = Path.Combine(temp, "connect-app-postgres.log"),
            MigrateLog = Path.Combine(temp, "connect-app-migrate.log"),
            DesktopShortcut = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory), "Connect App.lnk"),
            StartMenuShortcut = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Programs), "Connect App.lnk"),
            DevCopyRoot = devRoot,
            AppPort = cfg.AppPort ?? 3101,
            PgPort = cfg.PgPort ?? 5544,
            LoadExtension = cfg.LoadExtension ?? (ext != null),
            ExtensionDir = ext,
            KeepBackendRunning = cfg.KeepBackendRunning ?? false,
            RemoteUrl = string.IsNullOrWhiteSpace(cfg.RemoteUrl) ? null : cfg.RemoteUrl.Trim(),
        };
    }
}

internal static class Log
{
    private static string? _path;
    private static readonly object Gate = new();

    public static void Init(string path)
    {
        _path = path;
        try { var fi = new FileInfo(path); if (fi.Exists && fi.Length > 5_000_000) File.Move(path, path + ".old", true); } catch { }
    }

    public static void Write(string msg)
    {
        if (_path == null) return;
        lock (Gate)
        {
            try { File.AppendAllText(_path, $"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] {msg}{Environment.NewLine}"); } catch { }
        }
    }
}
