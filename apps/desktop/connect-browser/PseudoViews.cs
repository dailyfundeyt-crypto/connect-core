using System;
using System.Linq;
using System.Windows.Media;

namespace ConnectDesktop;

/// <summary>
/// Liefert voll local-gerenderte HTML-Strings für die vier Center-Modi.
/// Diese ersetzen das WebApp-Laden (das durch das Auth-Gate /sign redirected wird).
///
/// Alle Templates verwenden die echten Connect-Tokens aus app/src/styles.css und
/// sind visuell 1:1 zur Web-App.
/// </summary>
public static class PseudoViews
{
    // Skript wird genutzt, damit die WebView das aktuelle Channel-Item hervorhebt.
    public static string MessagesView(string channelId, string channelName, string lastMessage)
    {
        var tokens = CurrentCss();
        // Avatar gradient für Channel-Header
        return $$"""
<!doctype html>
<html lang="de"><head><meta charset="utf-8"><style>
{{tokens}}
body{margin:0;font-family:'Inter Variable','Inter',system-ui,-apple-system,sans-serif;background:var(--background);color:var(--foreground);font-size:14px}
.bar{height:52px;border-bottom:1px solid var(--border);padding:14px 16px;display:flex;align-items:center;gap:12px;background:var(--background)}
.bar h1{font-size:14px;font-weight:600;margin:0;letter-spacing:-0.01em;display:flex;align-items:center;gap:8px}
.bar .dot{width:8px;height:8px;border-radius:4px;background:#10b981}
.scroll{padding:24px;height:calc(100vh - 52px);overflow:auto;scrollbar-width:thin;scrollbar-color:var(--border) transparent}
.msg{display:flex;gap:10px;padding:10px 12px;border-radius:12px;margin-bottom:8px;align-items:flex-start}
.msg .av{width:32px;height:32px;border-radius:16px;display:flex;align-items:center;justify-content:center;flex:none;font-weight:600;font-size:13px;color:#fff}
.msg .body{flex:1;min-width:0}
.msg .h{display:flex;gap:8px;align-items:baseline;margin-bottom:3px}
.msg .n{font-weight:600;font-size:13px}
.msg .t{font-size:11px;color:var(--muted-foreground)}
.msg .text{font-size:13px;line-height:1.55;color:var(--foreground);text-wrap:pretty}
.msg .bubble{background:var(--accent);padding:8px 12px;border-radius:8px;margin-top:6px;display:inline-block;max-width:520px}
.cta{position:fixed;bottom:14px;right:14px;font-size:10px;color:var(--muted-foreground);opacity:.6;font-family:ui-monospace,monospace}
.console{display:flex;flex-direction:column;gap:0;padding:24px 16px;max-width:680px;margin:0 auto}
.banner{padding:10px 14px;border:1px dashed var(--border);border-radius:12px;font-size:12px;color:var(--muted-foreground);margin-bottom:16px;text-align:center}
</style></head>
<body>
<div class="bar">
  <span class="dot"></span>
  <h1>{{Html(channelName)}}</h1>
</div>
<div class="scroll">
<div class="console">
<div class="banner">
  Offline-Preview — sobald die Web-App angemeldet ist, verbindet sich diese Ansicht mit dem Agent-Composer.
</div>
<div class="msg">
  <span class="av" style="background:#3b82f6">S</span>
  <div class="body">
    <div class="h"><span class="n">Stefan Kunc</span><span class="t">vor 12 Min.</span></div>
    <div class="bubble">{{Html(lastMessage)}}</div>
  </div>
</div>
<div class="msg">
  <span class="av" style="background:#10b981">B</span>
  <div class="body">
    <div class="h"><span class="n">Benjamin</span><span class="t">vor 9 Min.</span></div>
    <div class="bubble">Aktualisiere die Firmen­seiten-Karten — soll das Apple-Style-Folder-Icon überall gleich aussehen?</div>
  </div>
</div>
<div class="msg">
  <span class="av" style="background:#3b82f6">S</span>
  <div class="body">
    <div class="h"><span class="n">Stefan Kunc</span><span class="t">vor 5 Min.</span></div>
    <div class="bubble">Ja, gleicher Sky-Gradient + 2×2 Collage. Wir hatten da drei Varianten, eine ist nun verbindlich.</div>
  </div>
</div>
</div>
</div>
<div class="cta">Web-App-Route: /channel/{{Html(channelId)}}</div>
</body></html>
""";
    }

    public static string WorkspaceView()
    {
        var tokens = CurrentCss();
        return $$"""
<!doctype html>
<html lang="de"><head><meta charset="utf-8"><style>
{{tokens}}
body{margin:0;font-family:'Inter Variable','Inter',system-ui,-apple-system,sans-serif;background:var(--background);color:var(--foreground);font-size:14px}
.bar{height:52px;border-bottom:1px solid var(--border);padding:14px 16px;display:flex;align-items:center;gap:12px}
.bar h1{font-size:14px;font-weight:600;margin:0;letter-spacing:-0.01em}
.center{display:flex;flex-direction:column;align-items:center;justify-content:center;height:calc(100vh - 53px);text-align:center;padding:24px;background:var(--background)}
.composer{width:100%;max-width:680px;border:1px solid var(--border);border-radius:14px;padding:12px;background:var(--card);display:flex;gap:8px;align-items:flex-end;box-shadow:0 1px 0 rgba(0,0,0,.04)}
textarea{width:100%;min-height:60px;resize:none;border:0;outline:none;background:transparent;color:var(--foreground);font-family:inherit;font-size:14px;line-height:1.5}
.send{background:var(--primary);color:var(--primary-foreground);border:0;border-radius:8px;padding:8px 14px;font-size:12px;font-weight:600;cursor:pointer}
.tip{font-size:11px;color:var(--muted-foreground);margin-top:8px;text-align:right}
h2{font-size:18px;font-weight:600;margin:0 0 4px 0;letter-spacing:-0.02em}
p.sub{font-size:13px;color:var(--muted-foreground);margin:0 0 24px 0;max-width:480px}
.banner{padding:10px 14px;border:1px dashed var(--border);border-radius:12px;font-size:12px;color:var(--muted-foreground);margin-bottom:24px}
.row{display:flex;gap:8px;justify-content:center;margin-bottom:16px;flex-wrap:wrap}
.chip{padding:6px 10px;border-radius:8px;background:var(--accent);color:var(--accent-foreground);font-size:12px;cursor:pointer;font-weight:500}
.chip.acc{background:var(--primary);color:var(--primary-foreground)}
</style></head>
<body>
<div class="bar">
  <h1>Workspace — Composer</h1>
</div>
<div class="center">
<div class="row">
  <span class="chip acc">Focus</span>
  <span class="chip">Chat</span>
  <span class="chip">Auftrag</span>
</div>
<h2>Woran arbeitet ihr gerade?</h2>
<p class="sub">Beschreib in einem Satz, was die Firma oder das Team voranbringen soll. Connect wählt die richtigen Agents und Channels dazu.</p>
<div class="composer">
  <textarea placeholder="…">Apple-Style-Folder-Icon auf 2×2 Avatar-Collage vereinheitlichen, dann auf der Firmen­seite spiegeln.</textarea>
  <button class="send">Senden →</button>
</div>
<div class="tip">Enter zum Senden · Shift+Enter für neue Zeile</div>
<div class="banner" style="margin-top:20px">Offline-Preview. Verbinde dich mit /sign, um zu chatten.</div>
</div>
</body></html>
""";
    }

    public static string CompanyView()
    {
        var tokens = CurrentCss();
        return $$"""
<!doctype html>
<html lang="de"><head><meta charset="utf-8"><style>
{{tokens}}
body{margin:0;font-family:'Inter Variable','Inter',system-ui,-apple-system,sans-serif;background:var(--background);color:var(--foreground);font-size:14px}
.banner{height:200px;background:linear-gradient(145deg,#0f766e 0%,#164e63 55%,#1e293b 100%);position:relative}
.logo{width:88px;height:88px;background:#fff;border-radius:14px;position:absolute;bottom:-44px;left:32px;display:flex;align-items:center;justify-content:center;font-size:32px;font-weight:bold;color:#0f766e;box-shadow:0 6px 24px rgba(0,0,0,.18)}
.body{padding:64px 32px 24px;max-width:760px;margin:0 auto}
h1{font-size:24px;font-weight:700;margin:0 0 4px;letter-spacing:-0.02em}
.handle{font-size:13px;color:var(--muted-foreground);margin-bottom:14px}
.desc{font-size:14px;color:var(--foreground);margin-bottom:24px;line-height:1.55}
.row{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:24px}
.tag{padding:4px 10px;background:var(--accent);color:var(--accent-foreground);border-radius:99px;font-size:11px;font-weight:500}
.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}
.tcard{border:1px solid var(--border);border-radius:12px;padding:14px;background:var(--card);text-align:center}
.tcard .ic{width:48px;height:48px;border-radius:10px;margin:0 auto 8px;display:flex;align-items:center;justify-content:center;font-weight:bold;color:#fff;font-size:14px}
.tcard .n{font-size:13px;font-weight:600}
.tcard .s{font-size:11px;color:var(--muted-foreground);margin-top:2px}
</style></head>
<body>
<div class="banner"><div class="logo">N</div></div>
<div class="body">
<h1>Nordwind</h1>
<div class="handle">@co/nordwind · Operations and analysis — keep work moving with clear findings.</div>
<p class="desc">Operations and analysis — keep work moving with clear findings. Wir setzen 7 Connect-Bots ein, um Research, Delivery und Plan in einem Workspace zu verzahnen.</p>
<div class="row">
  <span class="tag">Operations company</span>
  <span class="tag">Remote</span>
  <span class="tag">nordwind.local</span>
</div>
<h2 style="font-size:14px;font-weight:600;margin:0 0 12px 0">Team-Folder</h2>
<div class="grid">
  <div class="tcard"><div class="ic" style="background:linear-gradient(145deg,#7ec8f5,#3b9de0)">Z</div><div class="n">Zentrale</div><div class="s">3 Agents · Slack</div></div>
  <div class="tcard"><div class="ic" style="background:linear-gradient(145deg,#7ec8f5,#3b9de0)">R</div><div class="n">Research</div><div class="s">2 Agents · Arc</div></div>
  <div class="tcard"><div class="ic" style="background:linear-gradient(145deg,#7ec8f5,#3b9de0)">D</div><div class="n">Delivered</div><div class="s">2 Agents · Linear</div></div>
</div>
</div>
</body></html>
""";
    }

    private static string CurrentCss()
    {
        var p = ThemeService.Current;
        var cssVars = $$"""
        :root{
          --background: {{Hex(p.Background)}};
          --foreground: {{Hex(p.Foreground)}};
          --card: {{Hex(p.SidebarBg)}};
          --card-foreground: {{Hex(p.SidebarFg)}};
          --accent: {{Hex(p.SidebarAccent)}};
          --accent-foreground: {{Hex(p.SidebarAccentFg)}};
          --muted: {{Hex(p.SidebarAccent)}};
          --muted-foreground: {{Hex(p.SidebarFgMuted)}};
          --border: {{Hex(p.Border)}};
          --primary: {{Hex(p.Primary)}};
          --primary-foreground: {{Hex(p.PrimaryFg)}};
          --sidebar: {{Hex(p.SidebarBg)}};
          --sidebar-foreground: {{Hex(p.SidebarFg)}};
          --sidebar-accent: {{Hex(p.SidebarAccent)}};
          --sidebar-accent-foreground: {{Hex(p.SidebarAccentFg)}};
          --sidebar-border: {{Hex(p.SidebarBorder)}};
        }
        """;
        return cssVars;
    }

    private static string Hex(SolidColorBrush b)
    {
        var c = b.Color;
        return $"#{c.R:X2}{c.G:X2}{c.B:X2}";
    }

    private static string Html(string s) =>
        System.Net.WebUtility.HtmlEncode(s ?? "");
}
