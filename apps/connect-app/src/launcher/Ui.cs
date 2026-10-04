using System.Diagnostics;
using System.Drawing.Drawing2D;

namespace ConnectApp;

internal static class Ui
{
    public static void Error(string message, string? logPath)
    {
        var text = message + (logPath != null ? $"\n\nLog: {logPath}\nWeitere Logs: %TEMP%\\connect-app-*.log\n\nLog jetzt öffnen?" : "");
        var r = MessageBox.Show(text, "Connect App – Start fehlgeschlagen", logPath != null ? MessageBoxButtons.YesNo : MessageBoxButtons.OK, MessageBoxIcon.Error);
        if (r == DialogResult.Yes && logPath != null && File.Exists(logPath))
            Process.Start(new ProcessStartInfo("notepad.exe", "\"" + logPath + "\"") { UseShellExecute = true });
    }

    public static void Info(string message) => MessageBox.Show(message, "Connect App", MessageBoxButtons.OK, MessageBoxIcon.Information);
}

/// <summary>Kleines Startfenster mit Statuszeile.</summary>
internal sealed class SplashForm : Form
{
    private readonly Label _status;

    public SplashForm()
    {
        Text = "Connect App";
        FormBorderStyle = FormBorderStyle.None;
        StartPosition = FormStartPosition.CenterScreen;
        ClientSize = new Size(420, 150);
        BackColor = Color.FromArgb(17, 24, 39);
        ShowInTaskbar = true;
        AutoScaleMode = AutoScaleMode.Dpi;
        using (var s = typeof(SplashForm).Assembly.GetManifestResourceStream("connect-app.ico")!) Icon = new Icon(s);

        var pic = new PictureBox { Image = new Icon(Icon, 64, 64).ToBitmap(), SizeMode = PictureBoxSizeMode.Zoom, Location = new Point(24, 28), Size = new Size(64, 64) };
        var title = new Label { Text = "Connect", ForeColor = Color.White, Font = new Font("Segoe UI Semibold", 18f), AutoSize = true, Location = new Point(104, 26) };
        var sub = new Label { Text = "App wird gestartet", ForeColor = Color.FromArgb(156, 163, 175), Font = new Font("Segoe UI", 9.5f), AutoSize = true, Location = new Point(107, 62) };
        _status = new Label { Text = "…", ForeColor = Color.FromArgb(209, 213, 219), Font = new Font("Segoe UI", 9f), AutoEllipsis = true, Location = new Point(107, 86), Size = new Size(295, 20) };
        var bar = new ProgressBar { Style = ProgressBarStyle.Marquee, MarqueeAnimationSpeed = 25, Location = new Point(24, 120), Size = new Size(372, 6) };
        Controls.AddRange(new Control[] { pic, title, sub, _status, bar });
    }

    protected override void OnPaint(PaintEventArgs e)
    {
        base.OnPaint(e);
        using var pen = new Pen(Color.FromArgb(55, 65, 81));
        e.Graphics.DrawRectangle(pen, 0, 0, ClientSize.Width - 1, ClientSize.Height - 1);
    }

    public void SetStatus(string text)
    {
        Log.Write("Status: " + text);
        if (IsHandleCreated) BeginInvoke(() => _status.Text = text);
    }
}

internal static class Maintenance
{
    public static int Backup(AppPaths p, bool interactive)
    {
        var b = new Backend(p);
        if (!b.ClusterExists) { if (interactive) Ui.Info("Es gibt noch keine Daten (App wurde noch nie gestartet)."); return 1; }
        var env = b.EnsureEnvFile();
        var started = false;
        try
        {
            if (!b.PostgresRunning()) { b.StartPostgres(); started = true; }
            for (var i = 0; i < 40 && !b.PostgresReady(); i++) Thread.Sleep(500);
            var file = b.Backup(env, "manual");
            if (interactive)
            {
                Process.Start("explorer.exe", "/select,\"" + file + "\"");
                Ui.Info("Backup gespeichert:\n" + file + "\n\nWiederherstellen: siehe README (pg_restore).");
            }
            return 0;
        }
        catch (Exception ex) { Log.Write("Backup: " + ex); if (interactive) Ui.Error(ex.Message, p.LauncherLog); return 1; }
        finally { if (started) b.StopPostgres(); }
    }

    /// <summary>Schliesst die Connect-Fenster und stoppt Server + Datenbank der App (nur eigene Prozesse).</summary>
    public static int StopAll(AppPaths p)
    {
        foreach (var w in Helium.AllWindows(p)) Native.Close(w.Handle);
        for (var i = 0; i < 20 && Helium.Processes(p).Count > 0; i++) Thread.Sleep(500);
        foreach (var x in Helium.Processes(p)) { try { x.Kill(true); } catch { } }
        var b = new Backend(p);
        b.StopServer();
        b.StopPostgres();
        Log.Write("--stop: alles beendet");
        return 0;
    }
}
