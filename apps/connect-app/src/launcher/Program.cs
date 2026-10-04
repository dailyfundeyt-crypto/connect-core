namespace ConnectApp;

internal static class Program
{
    public const string AppUserModelId = "KuncGmbH.ConnectApp";
    public const string DisplayName = "Connect App";

    [STAThread]
    private static int Main(string[] args)
    {
        Native.SetCurrentProcessExplicitAppUserModelID(AppUserModelId);
        ApplicationConfiguration.Initialize();
        AppPaths paths;
        try { paths = AppPaths.Resolve(); }
        catch (Exception ex) { Ui.Error("Connect App konnte nicht initialisiert werden:\n" + ex.Message, null); return 1; }
        Log.Init(paths.LauncherLog);
        var mode = args.Length > 0 ? args[0].ToLowerInvariant() : "";
        Log.Write($"=== Connect.exe {mode} (v{typeof(Program).Assembly.GetName().Version}) AppDir={paths.AppDir} Data={paths.DataRoot} ===");
        try
        {
            switch (mode)
            {
                case "--install":
                    Shortcuts.Install(paths);
                    Ui.Info("Verknüpfungen erstellt:\n" + paths.DesktopShortcut + "\n" + paths.StartMenuShortcut);
                    return 0;
                case "--install-quiet":
                    Shortcuts.Install(paths);
                    return 0;
                case "--remove-shortcuts":
                    Shortcuts.Remove(paths);
                    return 0;
                case "--backup":
                    return Maintenance.Backup(paths, interactive: true);
                case "--backup-quiet":
                    return Maintenance.Backup(paths, interactive: false);
                case "--stop":
                    return Maintenance.StopAll(paths);
                case "--open-data":
                    System.Diagnostics.Process.Start("explorer.exe", "\"" + paths.DataRoot + "\"");
                    return 0;
                default:
                    return new Launcher(paths).Run();
            }
        }
        catch (Exception ex)
        {
            Log.Write("FATAL " + ex);
            Ui.Error("Unerwarteter Fehler: " + ex.Message, paths.LauncherLog);
            return 1;
        }
    }
}
