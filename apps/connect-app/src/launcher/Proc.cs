using System.Diagnostics;
using System.Text;

namespace ConnectApp;

internal static class Proc
{
    public record Result(int ExitCode, string Output);

    /// <summary>Startet ein Kommandozeilenprogramm unsichtbar und sammelt stdout+stderr.</summary>
    public static Result Run(string exe, IEnumerable<string> args, IDictionary<string, string>? env = null, string? cwd = null, int timeoutMs = 120_000)
    {
        var psi = new ProcessStartInfo(exe)
        {
            UseShellExecute = false, CreateNoWindow = true,
            RedirectStandardOutput = true, RedirectStandardError = true,
            StandardOutputEncoding = Encoding.UTF8, StandardErrorEncoding = Encoding.UTF8,
            WorkingDirectory = cwd ?? Path.GetDirectoryName(exe)!,
        };
        foreach (var a in args) psi.ArgumentList.Add(a);
        if (env != null) foreach (var kv in env) psi.Environment[kv.Key] = kv.Value;
        var sb = new StringBuilder();
        using var p = new Process { StartInfo = psi };
        p.OutputDataReceived += (_, e) => { if (e.Data != null) lock (sb) sb.AppendLine(e.Data); };
        p.ErrorDataReceived += (_, e) => { if (e.Data != null) lock (sb) sb.AppendLine(e.Data); };
        p.Start();
        p.BeginOutputReadLine(); p.BeginErrorReadLine();
        if (!p.WaitForExit(timeoutMs))
        {
            try { p.Kill(true); } catch { }
            lock (sb) return new Result(-1, sb + $"\n(Timeout nach {timeoutMs / 1000}s)");
        }
        p.WaitForExit();
        lock (sb) return new Result(p.ExitCode, sb.ToString());
    }

    /// <summary>Startet ohne Umleitung (fuer pg_ctl: dessen Kindprozess postgres wuerde sonst die Pipe erben
    /// und ReadToEnd ewig blockieren). Wartet nur auf das Ende von pg_ctl selbst.</summary>
    public static int RunDetachedWait(string exe, IEnumerable<string> args, IDictionary<string, string>? env = null, int timeoutMs = 120_000)
    {
        var psi = new ProcessStartInfo(exe) { UseShellExecute = false, CreateNoWindow = true, WorkingDirectory = Path.GetDirectoryName(exe)! };
        foreach (var a in args) psi.ArgumentList.Add(a);
        if (env != null) foreach (var kv in env) psi.Environment[kv.Key] = kv.Value;
        using var p = Process.Start(psi)!;
        if (!p.WaitForExit(timeoutMs)) { try { p.Kill(); } catch { } return -1; }
        return p.ExitCode;
    }

    /// <summary>Langlaufender Hintergrundprozess, Ausgabe per cmd-Umleitung in eine Logdatei
    /// (keine Pipe zum Launcher, damit der Prozess nicht an dessen Lebensdauer haengt).</summary>
    public static Process StartLogged(string exe, string arguments, string logFile, string cwd, IDictionary<string, string> env)
    {
        var cmd = Environment.GetEnvironmentVariable("ComSpec") ?? @"C:\Windows\System32\cmd.exe";
        var psi = new ProcessStartInfo(cmd)
        {
            UseShellExecute = false, CreateNoWindow = true, WorkingDirectory = cwd,
            Arguments = $"/d /s /c \"\"{exe}\" {arguments} 1>>\"{logFile}\" 2>&1\"",
        };
        foreach (var kv in env) psi.Environment[kv.Key] = kv.Value;
        return Process.Start(psi)!;
    }

    public static string Tail(string file, int lines = 25)
    {
        try
        {
            using var fs = new FileStream(file, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete);
            using var sr = new StreamReader(fs);
            var all = sr.ReadToEnd().Split('\n');
            return string.Join("\n", all.Skip(Math.Max(0, all.Length - lines))).Trim();
        }
        catch { return ""; }
    }
}
