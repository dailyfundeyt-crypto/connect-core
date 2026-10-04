using System.Diagnostics;
using System.Text.Json.Nodes;
using Microsoft.Win32;

namespace ConnectApp;

internal sealed class Launcher
{
    private readonly AppPaths _p;
    private readonly Backend _b;
    public Launcher(AppPaths p) { _p = p; _b = new Backend(p); }

    public int Run()
    {
        // Eine Instanz: ein zweiter Start holt nur das vorhandene Fenster nach vorn.
        using var mutex = new Mutex(false, @"Local\KuncGmbH.ConnectApp.Main");
        var sw = Stopwatch.StartNew();
        while (true)
        {
            bool owned;
            try { owned = mutex.WaitOne(0); } catch (AbandonedMutexException) { owned = true; }
            if (owned) break;
            var w = Helium.AllWindows(_p).FirstOrDefault();
            if (w != null) { Native.Focus(w.Handle); Log.Write("Bereits gestartet - Fenster fokussiert"); return 0; }
            if (sw.Elapsed > TimeSpan.FromSeconds(25)) { Log.Write("Andere Instanz startet noch - beende"); return 0; }
            Thread.Sleep(400);
        }

        try
        {
            Exception? error = null;
            var splash = new SplashForm();
            splash.Shown += async (_, _) =>
            {
                try { await Task.Run(() => Startup(splash.SetStatus)); }
                catch (Exception ex) { error = ex; }
                splash.Close();
            };
            Application.Run(splash);
            if (error != null)
            {
                Log.Write("START FEHLGESCHLAGEN: " + error);
                Ui.Error(error.Message, _p.LauncherLog);
                return 1;
            }
            // Ab hier: unsichtbar im Hintergrund. Haelt Fenster-Identitaet aktuell und faehrt das Backend
            // herunter, sobald das letzte Connect-Fenster geschlossen ist.
            Application.Run(new Watcher(_p, _b));
            return 0;
        }
        finally { try { mutex.ReleaseMutex(); } catch { } }
    }

    private void Startup(Action<string> status)
    {
        status("Prüfe Installation …");
        foreach (var (what, path) in new[] { ("Helium", _p.HeliumExe), ("Bun", _p.BunExe), ("PostgreSQL", Path.Combine(_p.PgBin, "pg_ctl.exe")),
                     ("Server", Path.Combine(_p.ServerDir, "src", "index.ts")), ("Web-UI", Path.Combine(_p.AppDistDir, "index.html")) })
            if (!File.Exists(path)) throw new InvalidOperationException($"Installation unvollständig: {what} fehlt ({path}).");
        Log.Write($"Bundle {_p.BundleVersion}, Port {_p.AppPort}, PG-Port {_p.PgPort}, Url {_p.AppUrl}");
        if (_p.UsesRemote)
        {
            // Gehostetes Backend: kein lokaler Server/DB, nur die Shell.
            status("Öffne Connect …");
            Helium.LaunchOrFocus(_p);
            Wait(30, () => Helium.AllWindows(_p).Count > 0);
            Helium.ApplyIdentity(_p);
            Log.Write("Connect App bereit (remote): " + _p.AppUrl);
            return;
        }

        var env = _b.EnsureEnvFile();
        var serverEnv = _b.ServerEnv(env);

        // Laeuft schon alles (z.B. KeepBackendRunning oder Neustart der Shell)? Dann nur Fenster.
        var serverRunning = _b.ServerProcesses().Count > 0 && _b.HealthOk().GetAwaiter().GetResult();

        if (!serverRunning)
        {
            var firstRun = !_b.ClusterExists;
            if (firstRun)
            {
                status("Erster Start: lege lokale Datenbank an …");
                _b.InitCluster(env);
            }
            status("Starte Datenbank …");
            _b.StartPostgres();
            if (!Wait(30, () => _b.PostgresReady())) throw new InvalidOperationException("PostgreSQL antwortet nicht.\n" + Proc.Tail(_p.PostgresLog, 10));
            _b.EnsureDatabase(env);

            var before = _b.AppliedMigrations(env);
            var last = _b.LastBundleVersion();
            if (before > 0 && last != null && last != _p.BundleVersion)
            {
                status("Update erkannt: sichere Daten …");
                _b.Backup(env, "auto-pre-update");
            }
            status(before <= 0 ? "Richte Datenbank ein (Migrationen) …" : "Prüfe Datenbank-Migrationen …");
            _b.Migrate(serverEnv);
            var after = _b.AppliedMigrations(env);
            Log.Write($"Migrationen: vorher {before}, nachher {after}");
            _b.SaveState(after);

            if (Backend.PortListening(_p.AppPort))
                throw new InvalidOperationException($"Port {_p.AppPort} ist bereits von einem anderen Programm belegt. In connect-app.json \"AppPort\" ändern.");
            status("Starte Connect-Server …");
            _b.StartServer(serverEnv);
            if (!Wait(120, () => _b.HealthOk().GetAwaiter().GetResult(), () => _b.ServerProcesses().Count == 0 ? "Server-Prozess beendet" : null))
                throw new InvalidOperationException("Der Connect-Server antwortet nicht.\n\n" + Proc.Tail(_p.ServerLog, 15));
        }
        else Log.Write("Server laeuft bereits - wiederverwendet");

        status("Lade Oberfläche …");
        if (!Wait(60, () => _b.UiOk().GetAwaiter().GetResult()))
            throw new InvalidOperationException($"Die Web-Oberfläche antwortet nicht auf {_p.AppUrl}.\n\n" + Proc.Tail(_p.ServerLog, 10));

        status("Öffne Connect …");
        Helium.LaunchOrFocus(_p);
        Wait(30, () => Helium.AllWindows(_p).Count > 0);
        Helium.ApplyIdentity(_p);
        Log.Write("Connect App bereit: " + _p.AppUrl);
    }

    private static bool Wait(int seconds, Func<bool> ok, Func<string?>? abort = null)
    {
        var sw = Stopwatch.StartNew();
        while (sw.Elapsed.TotalSeconds < seconds)
        {
            try { if (ok()) { Log.Write($"  ok nach {sw.Elapsed.TotalSeconds:0.0}s"); return true; } } catch { }
            var a = sw.Elapsed.TotalSeconds > 6 ? abort?.Invoke() : null;
            if (a != null) { Log.Write("  abgebrochen: " + a); return false; }
            Thread.Sleep(700);
        }
        return false;
    }
}

/// <summary>Hintergrund-Waechter nach dem Start (kein sichtbares Fenster).</summary>
internal sealed class Watcher : ApplicationContext
{
    private readonly AppPaths _p;
    private readonly Backend _b;
    private readonly System.Windows.Forms.Timer _timer = new() { Interval = 1500 };
    private DateTime _lastSeen = DateTime.Now;
    private bool _stopping;

    public Watcher(AppPaths p, Backend b)
    {
        _p = p; _b = b;
        _timer.Tick += (_, _) => Tick();
        _timer.Start();
        SystemEvents.SessionEnding += (_, _) => Shutdown("Windows-Abmeldung");
    }

    private void Tick()
    {
        if (_stopping) return;
        try
        {
            if (Helium.Processes(_p).Count > 0) { _lastSeen = DateTime.Now; Helium.ApplyIdentity(_p); return; }
            if (DateTime.Now - _lastSeen > TimeSpan.FromSeconds(4)) Shutdown("letztes Connect-Fenster geschlossen");
        }
        catch (Exception ex) { Log.Write("Watcher: " + ex.Message); }
    }

    private void Shutdown(string why)
    {
        if (_stopping) return;
        _stopping = true; _timer.Stop();
        Log.Write("Beende Connect App (" + why + ")");
        if (!_p.KeepBackendRunning)
        {
            _b.StopServer();
            _b.StopPostgres();
        }
        Log.Write("Connect App beendet");
        ExitThread();
    }
}

internal static class Helium
{
    public static List<Process> Processes(AppPaths p) => Native.ProcessesOf(p.HeliumExe);

    public static List<Native.WindowInfo> AllWindows(AppPaths p)
    {
        var procs = Processes(p);
        var pids = procs.Select(x => (uint)x.Id).ToHashSet();
        foreach (var x in procs) x.Dispose();
        return Native.TopWindows(pids);
    }

    /// <summary>Normales Helium-Fenster (mit Toolbar, wie "Connect (Helium)"); Connect ist Start- und Neuer-Tab-Seite.
    /// Laeuft das gebuendelte Helium schon mit Fenster, wird nur fokussiert.</summary>
    public static void LaunchOrFocus(AppPaths p)
    {
        var existing = AllWindows(p).FirstOrDefault();
        if (existing != null) { Native.Focus(existing.Handle); Log.Write("Helium-Fenster vorhanden - fokussiert"); return; }
        var running = Processes(p).Count > 0;
        if (!running) SeedProfile(p);
        var args = new List<string>
        {
            "--user-data-dir=" + p.ProfileDir,
            "--no-first-run",
            "--no-default-browser-check",
            "--custom-ntp=" + p.AppUrl,
        };
        if (p.LoadExtension && p.ExtensionDir != null && File.Exists(Path.Combine(p.ExtensionDir, "manifest.json")))
            args.Add("--load-extension=" + p.ExtensionDir);
        else if (p.LoadExtension) Log.Write("Extension nicht gefunden: " + p.ExtensionDir);
        args.Add(p.AppUrl);
        var psi = new ProcessStartInfo(p.HeliumExe) { UseShellExecute = false, WorkingDirectory = Path.GetDirectoryName(p.HeliumExe)! };
        foreach (var a in args) psi.ArgumentList.Add(a);
        Process.Start(psi)?.Dispose();
        Log.Write("Helium gestartet: " + string.Join(" ", args));
    }

    /// <summary>Profil-Voreinstellungen fuer das eigene Profil: kein Onboarding und KEIN Helium-Auto-Update
    /// (der Updater wuerde sonst den per-User-Installer starten, also Stefans normales Helium aktualisieren).</summary>
    private static void SeedProfile(AppPaths p)
    {
        try
        {
            var dir = Path.Combine(p.ProfileDir, "Default");
            Directory.CreateDirectory(dir);
            var file = Path.Combine(dir, "Preferences");
            var root = File.Exists(file) ? (JsonNode.Parse(File.ReadAllText(file)) as JsonObject ?? new JsonObject()) : new JsonObject();
            var helium = root["helium"] as JsonObject ?? new JsonObject(); root["helium"] = helium;
            helium["completed_onboarding"] = true;
            var services = helium["services"] as JsonObject ?? new JsonObject(); helium["services"] = services;
            services["browser_updates"] = false;
            var browser = root["browser"] as JsonObject ?? new JsonObject(); root["browser"] = browser;
            browser["has_seen_welcome_page"] = true;
            browser["check_default_browser"] = false;
            File.WriteAllText(file, root.ToJsonString());
        }
        catch (Exception ex) { Log.Write("SeedProfile: " + ex.Message); }
    }

    private static Icon? _big, _small;
    private static readonly HashSet<IntPtr> Logged = new();

    public static void ApplyIdentity(AppPaths p)
    {
        try
        {
            if (_big == null)
            {
                using var s1 = typeof(Helium).Assembly.GetManifestResourceStream("connect-app.ico")!;
                _big = new Icon(s1, Native.GetSystemMetrics(11), Native.GetSystemMetrics(12));
                using var s2 = typeof(Helium).Assembly.GetManifestResourceStream("connect-app.ico")!;
                _small = new Icon(s2, Native.GetSystemMetrics(49), Native.GetSystemMetrics(50));
            }
            var relaunch = "\"" + p.ExePath + "\"";
            var iconRes = Path.Combine(p.AppDir, "connect-app.ico");
            foreach (var w in AllWindows(p))
            {
                if (Native.GetWindowAppId(w.Handle) != Program.AppUserModelId)
                {
                    var ok = Native.SetWindowAppId(w.Handle, Program.AppUserModelId, relaunch, Program.DisplayName, File.Exists(iconRes) ? iconRes : p.ExePath + ",0");
                    if (Logged.Add(w.Handle)) Log.Write($"Fenster-Identitaet gesetzt ({ok}): hwnd={w.Handle} '{w.Title}'");
                }
                if (Native.GetIcon(w.Handle, 1) != _big!.Handle) Native.SetIcon(w.Handle, 1, _big.Handle);
                if (Native.GetIcon(w.Handle, 0) != _small!.Handle) Native.SetIcon(w.Handle, 0, _small.Handle);
            }
        }
        catch (Exception ex) { Log.Write("ApplyIdentity: " + ex.Message); }
    }
}
