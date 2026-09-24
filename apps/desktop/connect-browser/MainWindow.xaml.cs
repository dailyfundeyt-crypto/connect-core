using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;
using System.IO;
using System.Linq;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Threading;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.Wpf;

namespace ConnectDesktop;

/// <summary>Sidebar-Eintrag — animierbar via ReactiveList (Fade-In + Move-to-Top).</summary>
public sealed class SidebarItem : DependencyObject
{
    public string Id { get; set; } = "";
    public string Name { get; set; } = "";
    public string Glyph { get; set; } = "";
    public string Url { get; set; } = "";
    public string Subtitle { get; set; } = "";
    public string LastAt { get; set; } = "";
    public bool Online { get; set; }
    public bool Pinned { get; set; }
    public bool Unread { get; set; }
    public string AccentHex { get; set; } = "#475569";
    public string[] Participants { get; set; } = Array.Empty<string>();
    public ImageSource? AvatarSource { get; set; }

    // Bindings-Convenience
    public Brush AccentBrush => new SolidColorBrush(ColorFromHex(AccentHex));
    public Brush FgBrush => new SolidColorBrush(ColorFromHex(ThemeService.Current.SidebarFg.Color.ToString()));
    public Brush OnlineBrush => Online
        ? new SolidColorBrush(ColorFromHex("#10B981"))
        : new SolidColorBrush(ColorFromHex("#475569"));

    public static Color ColorFromHex(string hex)
    {
        hex = hex.TrimStart('#');
        if (hex.Length == 6) hex = "FF" + hex;
        return Color.FromArgb(
            (byte)System.Convert.ToInt32(hex.Substring(0, 2), 16),
            (byte)System.Convert.ToInt32(hex.Substring(2, 2), 16),
            (byte)System.Convert.ToInt32(hex.Substring(4, 2), 16),
            (byte)System.Convert.ToInt32(hex.Substring(6, 2), 16));
    }
}

public partial class MainWindow : Window
{
    public const string ConnectUrl = "http://127.0.0.1:3010";

    private BrowserAutomationServer? _automationServer;

    // Sidebar collections
    public ObservableCollection<SidebarItem> Pinned  { get; } = new();
    public ObservableCollection<SidebarItem> Groups  { get; } = new();
    public ObservableCollection<SidebarItem> Agents  { get; } = new();
    public ObservableCollection<SidebarItem> Channels { get; } = new();

    // Echte Bot-Namen — der ChannelAvatar rendert das Initial auf einer
    // deterministischen Tint-Fläche.
    private static readonly string[] BotBenjamin    = { "Benjamin" };
    private static readonly string[] BotChristopher = { "Christopher" };
    private static readonly string[] BotWilli       = { "Willi" };
    private static readonly string[] BotStefan      = { "Stefan" };
    private static readonly string[] BotHafenTeam   = { "Willi", "Stefan" };
    private static readonly string[] BotAlphaTeam   = { "Willi" };
    private static readonly string[] BotAppleTeam   = { "Stefan", "Benjamin", "Willi", "Mia" };

    public MainWindow()
    {
        InitializeComponent();

        // Theme lazy global resources (DynamicResource braucht zentralen Ort).
        Resources = App.Current.Resources;
        Loaded += MainWindow_Loaded;
        Closing += MainWindow_Closing;
    }

    /// <summary>Setze alle Dynamic-Resource Brushes zentral + Sidebar-Daten + Mode-Switch.</summary>
    public void ApplyTheme(ThemePalette p)
    {
        try
        {
            // 1) Resource-Dictionary auf App-Ebene synchronisieren
            var dict = App.Current?.Resources;
            if (dict == null) return;
            dict["Background"]        = p.Background;
            dict["Foreground"]        = p.Foreground;
            dict["Border"]            = p.Border;
            dict["StatusBarBg"]       = p.StatusBarBg;
            dict["StatusFg"]          = p.StatusFg;
            dict["ToolbarBg"]         = p.ToolbarBg;
            dict["InputBg"]           = p.InputBg;
            dict["BrowserPaneBg"]     = p.BrowserPaneBg;
            dict["SideBg"]            = p.SidebarBg;
            dict["SideFg"]            = p.SidebarFg;
            dict["SideFgMuted"]       = p.SidebarFgMuted;
            dict["SideFgSofter"]      = p.SidebarFgSofter;
            dict["SideAccent"]        = p.SidebarAccent;
            dict["SideBorder"]        = p.SidebarBorder;
            dict["SideRowHover"]      = p.SidebarRowHover;
            dict["SideRowActive"]     = p.SidebarRowActive;
            dict["AccentGreen"]       = new SolidColorBrush(Color.FromRgb(0x10, 0xB9, 0x81));
            dict["Primary"]           = p.Primary;
            dict["PrimaryFg"]         = p.PrimaryFg;

            // 2) Theme-abhängige Akzentfarben: AI-Bridge Pill, Browser Pane
            var isDark = p.IsDark;
            SafeSetColor(AiBridgePill, "Background",
                isDark ? Color.FromRgb(0x05, 0x2E, 0x1F) : Color.FromRgb(0xEC, 0xFD, 0xF5));
            SafeSetColor(AiBridgePill, "BorderBrush",
                isDark ? Color.FromRgb(0x10, 0xB9, 0x81) : Color.FromRgb(0x6E, 0xE7, 0xB7));
            SafeSetThickness(AiBridgePill, 1);
            SafeSetCornerRadius(AiBridgePill, 8);
            SafeSetColor(AiBridgeLed, "Fill", Color.FromRgb(0x10, 0xB9, 0x81));
            SafeSetColor(AiBridgeIcon, "Foreground", Color.FromRgb(0x10, 0xB9, 0x81));
            SafeSetColor(AiServerStatus, "Foreground",
                isDark ? Color.FromRgb(0x6E, 0xE7, 0xB7) : Color.FromRgb(0x05, 0x2E, 0x1F));

            // 3) Folder-Icons neu rendern (Sky-Gradient ist theme-invariant)
            SafeRebuildAvatarSources();

            // 4) Browser-Pane echtes Schwarz/Weiß (SplitBrowser + WebApp)
            SafeSetBg(BrowserSplitRoot, p.BrowserPaneBg);
            SafeSetBg(SplitWebView, p.BrowserPaneBg);

            // 4a) WebView2 Browser-Profil: prefers-color-scheme sync (localhost + jede externe Seite)
            SyncBrowserColorScheme(isDark);

            // 5) Pseudo-Views neu anwenden (mit aktuellen Tokens)
            SafeRefreshPseudoView();

            SetStatus(SettingsStore.Instance.IsDark ? "Theme: dark" : "Theme: light");
        }
        catch (Exception ex)
        {
            // Theme-Toggle darf nie crashen — wir schlucken alle Fehler
            // in den Status-Bar, damit der Toggle-Klick immer ein sichtbares Feedback hat.
            try { SetStatus($"Theme-Apply: {ex.Message}"); } catch { }
        }
    }

    private static void SafeSetColor(DependencyObject? obj, string prop, Color c)
    {
        try
        {
            if (obj == null) return;
            var p = obj.GetType().GetProperty(prop);
            if (p == null) return;
            p.SetValue(obj, new SolidColorBrush(c));
        }
        catch { /* swallow */ }
    }

    private static void SafeSetBg(DependencyObject? obj, Brush b)
    {
        try
        {
            if (obj == null) return;
            if (obj is System.Windows.Controls.Panel p) p.Background = b;
            else if (obj is System.Windows.Controls.Control c) c.Background = b;
            else if (obj is System.Windows.Controls.Border br) br.Background = b;
        }
        catch { /* swallow */ }
    }

    private static void SafeSetThickness(DependencyObject? obj, double t)
    {
        try
        {
            if (obj is System.Windows.Controls.Border b) b.BorderThickness = new Thickness(t);
            else if (obj is System.Windows.Controls.Control c) c.BorderThickness = new Thickness(t);
        }
        catch { /* swallow */ }
    }

    private static void SafeSetCornerRadius(DependencyObject? obj, double r)
    {
        try
        {
            if (obj is System.Windows.Controls.Border b) b.CornerRadius = new CornerRadius(r);
        }
        catch { /* swallow */ }
    }

    private void SafeRebuildAvatarSources()
    {
        try { RebuildAvatarSources(); } catch { /* swallow */ }
    }

    private void SafeRefreshPseudoView()
    {
        try
        {
            // Pseudo-Views nur re-rendern wenn die jeweilige WebView2 wirklich initialisiert ist.
            // Wenn MessagesView im Pseudo-View ist, neu zeichnen mit aktuellen Tokens.
            if (_mode == AppMode.Messages && MessagesView != null
                && MessagesView.CoreWebView2 != null
                && MessagesView.Source != null
                && MessagesView.Source.ToString().StartsWith("data:text/html"))
            {
                var seed = Channels.FirstOrDefault();
                if (seed != null)
                    MessagesView.NavigateToString(PseudoViews.MessagesView(seed.Id, seed.Name, seed.Subtitle));
            }
            else if (_mode == AppMode.Company && CompanyView != null
                && CompanyView.CoreWebView2 != null
                && CompanyView.Source != null
                && CompanyView.Source.ToString().StartsWith("data:text/html"))
            {
                CompanyView.NavigateToString(PseudoViews.CompanyView());
            }
        }
        catch { /* swallow */ }
    }

    /// <summary>
    /// Synct WebView2 prefers-color-scheme mit dem aktuellen WPF-Theme.
    /// Greift für ALLE WebView2-Instanzen (WebApp, Split-Browser, MessagesView, CompanyView, WorkspaceView),
    /// weil alle das gleiche default CoreWebView2Profile aus dem gemeinsamen Environment nutzen.
    /// Seiten wie localhost:3010 reagieren auf `prefers-color-scheme: light/dark` via CSS media query.
    /// </summary>
    private void SyncBrowserColorScheme(bool isDark)
    {
        try
        {
            var scheme = isDark
                ? CoreWebView2PreferredColorScheme.Dark
                : CoreWebView2PreferredColorScheme.Light;

            // Browser-Pane echtes Schwarz/Weiß: WebView2 erbt von HwndHost und
            // ignoriert WPF-Background. Stattdessen setzen wir DefaultBackgroundColor
            // auf CoreWebView2 — das färbt den Bereich VOR dem Page-Render.
            // Wir verwenden das aktuelle BrowserPaneBg aus dem Theme.
            var paneBg = SettingsStore.Instance.IsDark
                ? System.Drawing.Color.FromArgb(0xFF, 0x00, 0x00, 0x00)
                : System.Drawing.Color.FromArgb(0xFF, 0xFF, 0xFF, 0xFF);

            // Default-Profile wird von allen WebViews geteilt, aber wir setzen pro-Instanz
            // für Robustheit (manche Builds nutzen unterschiedliche Profile).
            // Wichtig: `?.` ist auf der linken Seite einer Zuweisung nicht erlaubt, daher explizite if-blöcke.
            if (WebAppView?.CoreWebView2?.Profile is { } p1) p1.PreferredColorScheme = scheme;
            if (SplitWebView?.CoreWebView2?.Profile is { } p2) p2.PreferredColorScheme = scheme;
            if (MessagesView?.CoreWebView2?.Profile is { } p3) p3.PreferredColorScheme = scheme;
            if (CompanyView?.CoreWebView2?.Profile is { } p4) p4.PreferredColorScheme = scheme;

            try { if (WebAppView != null) WebAppView.DefaultBackgroundColor = paneBg; } catch { }
            try { if (SplitWebView != null) SplitWebView.DefaultBackgroundColor = paneBg; } catch { }
            try { if (MessagesView != null) MessagesView.DefaultBackgroundColor = paneBg; } catch { }
            try { if (CompanyView != null) CompanyView.DefaultBackgroundColor = paneBg; } catch { }

            // Web-Apps reagieren meist nur auf prefers-color-scheme nach einem Reload.
            // Wir reloaden die WebApp + SplitBrowser, damit das Theme sicher angewendet wird.
            // Pseudo-Views (Messages/Workspace/Company) sind rein lokal — kein Reload nötig.
            try { WebAppView?.CoreWebView2?.Reload(); } catch { }
            try { SplitWebView?.CoreWebView2?.Reload(); } catch { }
        }
        catch { /* swallow — Theme-Toggle darf nie crashen */ }
    }

    private async void MainWindow_Loaded(object sender, RoutedEventArgs e)
    {
        try
        {
            // Theme aus SettingsStore lesen, sonst Default = Dark
            ThemeService.InitializeFromStorage();
            SettingsStore.Instance.IsDark = ThemeService.IsDark;
            ApplyTheme(ThemeService.Current);

            BuildSidebar();

            var userDataFolder = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "ConnectDesktop", "WebView2Data");
            Directory.CreateDirectory(userDataFolder);
            var env = await CoreWebView2Environment.CreateAsync(null, userDataFolder);

            // 1) WebApp-View (Default: sichtbar, lädt Connect-Web/SignIn)
            await WebAppView.EnsureCoreWebView2Async(env);
            WebAppView.CoreWebView2.Settings.AreDefaultContextMenusEnabled = false;
            // Bridge: LocalStorage PRE-POPULATION via init-script
            try
            {
                WebLocalStorageBridge.Instance.SyncFromSettingsStore();
                var initJs = WebLocalStorageBridge.Instance.BuildInitScript();
                await WebAppView.CoreWebView2.AddScriptToExecuteOnDocumentCreatedAsync(initJs);
            }
            catch { }

            // WebApp -> WPF: alle target=_blank / window.open() automatisch im Side-Browser öffnen
            try
            {
                WebAppView.CoreWebView2.NewWindowRequested += WebApp_NewWindowRequested;
            }
            catch { }

            // 2) Split-Browser-View (Default: versteckt, nur wenn User es öffnet)
            await SplitWebView.EnsureCoreWebView2Async(env);
            SplitWebView.CoreWebView2.Settings.AreDefaultContextMenusEnabled = false;

            // 3) Fallback Pseudo-Views
            await MessagesView.EnsureCoreWebView2Async(env);
            MessagesView.CoreWebView2.Settings.AreDefaultContextMenusEnabled = false;
            await WorkspaceView.EnsureCoreWebView2Async(env);
            WorkspaceView.CoreWebView2.Settings.AreDefaultContextMenusEnabled = false;
            await CompanyView.EnsureCoreWebView2Async(env);
            CompanyView.CoreWebView2.Settings.AreDefaultContextMenusEnabled = false;

            // WebApp-URL: IMMER http://localhost:3010/ — die WebApp ist primary view und fullscreen
            // (Side-Browser ist nur secondary, wird per window.open / postMessage auto-geöffnet)
            var webAppUrl = "http://localhost:3010/";
            try
            {
                if (IsLocalWebAppRunning())
                {
                    SetStatus($"Verbinde mit {DefaultWebAppUrl}…");
                }
                else
                {
                    // Trotzdem navigieren — Next.js-Dev-Server braucht evtl. länger zum Booten.
                    // Wenn er nicht erreichbar, zeigt die WebApp halt einen 503/Connection-Error
                    // und der User weiß Bescheid. NICHT about:blank — das wäre eine leere Seite.
                    SetStatus("Connect-Web (localhost:3010) wird geladen… (Dev-Server startet ggf. noch)");
                }
            }
            catch { }
            WebAppView.CoreWebView2.Navigate(webAppUrl);

            // WebApp -> WPF: bei jeder Navigation Hook installieren, der LocalStorage
            // an WPF propagiert (damit Settings im WebApp die WPF-Bridge informiert)
            try
            {
                WebAppView.CoreWebView2.WebMessageReceived += WebApp_MessageReceived;
                await WebAppView.CoreWebView2.AddScriptToExecuteOnDocumentCreatedAsync(
                    "(function(){window.addEventListener('storage',()=>{try{" +
                    "  if(window.chrome && window.chrome.webview){" +
                    "    var p={};for(var k in localStorage){p[k]=localStorage.getItem(k)}" +
                    "    window.chrome.webview.postMessage(JSON.stringify({type:'localstorage',data:p}))" +
                    "  }}catch(e){console.error(e)}})()");
            }
            catch { }

            // HideSplitBrowser initial
            SetSplitBrowserVisible(false);

            // Sync web-localstorage in den Browser
            SettingsStore.Instance.SyncWebLocalStorage();

            // AI-Bridge (Hintergrund, unsichtbar)
            StartAutomationServerWithRetry();

            _mode = AppMode.WebApp;
            SetStatus($"Connect Desktop bereit ({(ThemeService.IsDark ? "dark" : "light")})");
        }
        catch (Exception ex)
        {
            MessageBox.Show(
                "Fehler beim Starten von WebView2:\n\n" + ex.Message,
                "Connect Desktop", MessageBoxButton.OK, MessageBoxImage.Error);
        }
    }

    /// <summary>Default-Home der Connect-WebApp (SignIn-Page).</summary>
    public const string DefaultWebAppUrl = "http://localhost:3010/sign-in";

    /// <summary>Prüft ob die Connect-WebApp lokal erreichbar ist (für Auto-Connect).</summary>
    private bool IsLocalWebAppRunning()
    {
        try
        {
            var req = (System.Net.HttpWebRequest)System.Net.WebRequest.Create(DefaultWebAppUrl);
            req.Timeout = 2000;
            req.Method = "HEAD";
            using var resp = (System.Net.HttpWebResponse)req.GetResponse();
            return resp.StatusCode == System.Net.HttpStatusCode.OK;
        }
        catch
        {
            return false;
        }
    }

    private void BtnTheme_Click(object sender, RoutedEventArgs e)
    {
        SafeThemeToggle();
    }

    /// <summary>
    /// WebApp → WPF: jedes neue Fenster (target=_blank, window.open, …) wird im
    /// Side-Browser geöffnet. WPF hat keine eigenen Browser-Tabs — nur einen
    /// Side-Browser, der bei Bedarf sichtbar wird.
    /// </summary>
    private void WebApp_NewWindowRequested(object? sender, CoreWebView2NewWindowRequestedEventArgs e)
    {
        try
        {
            e.Handled = true; // Wir managen das selbst

            var uri = e.Uri;
            if (string.IsNullOrEmpty(uri)) return;

            // Block: javascript: und about: URLs verwerfen
            if (uri.StartsWith("javascript:", StringComparison.OrdinalIgnoreCase) ||
                uri.StartsWith("about:", StringComparison.OrdinalIgnoreCase))
                return;

            // Side-Browser sichtbar machen + URL laden
            SetSplitBrowserVisible(true);
            try
            {
                SplitWebView.CoreWebView2?.Navigate(uri);
                if (SplitAddressBar != null) SplitAddressBar.Text = uri;
            }
            catch { }

            // Tab in der WebApp speichern (via Bridge-Spool, LocalStorage in WebApp)
            try
            {
                var stored = WebLocalStorageBridge.Instance.Get("connect.connect-sidelinks") ?? "[]";
                var arr = System.Text.Json.JsonSerializer.Deserialize<List<System.Text.Json.JsonElement>>(stored) ?? new();
                // Statt Liste: einfache Push in connect.opened-externals
                WebLocalStorageBridge.Instance.Set(
                    "connect.lastExternalUrl",
                    System.Text.Json.JsonSerializer.Serialize(new { url = uri, at = DateTime.UtcNow.ToString("O") }));
                WebAppView.CoreWebView2?.ExecuteScriptAsync(
                    $"(function(){{try{{localStorage.setItem('connect.lastExternalUrl','{System.Text.Json.JsonSerializer.Serialize(uri).Replace("\\","\\\\").Replace("'", "\\'")}');}}catch(e){{}}}})()");
            }
            catch { }
        }
        catch { }
    }

    /// <summary>
    /// WebApp → WPF: empfängt LocalStorage-Updates aus dem WebApp-Renderer
    /// und merged sie zurück in den Bridge-Spool.
    /// </summary>
    private void WebApp_MessageReceived(object? sender, CoreWebView2WebMessageReceivedEventArgs e)
    {
        try
        {
            var raw = e.TryGetWebMessageAsString();
            if (string.IsNullOrEmpty(raw)) return;
            using var doc = System.Text.Json.JsonDocument.Parse(raw);
            if (!doc.RootElement.TryGetProperty("type", out var t) ||
                t.GetString() != "localstorage") return;
            if (!doc.RootElement.TryGetProperty("data", out var data)) return;

            var map = new Dictionary<string, string>();
            foreach (var prop in data.EnumerateObject())
            {
                var v = prop.Value.ValueKind == System.Text.Json.JsonValueKind.String
                    ? prop.Value.GetString()
                    : prop.Value.GetRawText();
                if (v != null) map[prop.Name] = v;
            }
            // Merge: WebApp-Werte überschreiben lokale, wenn älter
            WebLocalStorageBridge.Instance.SetAll(map);

            // Theme-Update sofort anwenden (idempotent)
            try
            {
                if (map.TryGetValue("connect-theme", out var t1))
                {
                    var dark = string.Equals(t1, "dark", StringComparison.OrdinalIgnoreCase);
                    if (dark != SettingsStore.Instance.IsDark)
                        SettingsStore.Instance.IsDark = dark;
                }
            }
            catch { }

            // Keyboard-Shortcuts-Update: WebApp-Settings#shortcuts hat etwas geändert.
            // Wir parsen die Map und schreiben jeden Combo-String in die SettingsStore-Property
            // zurück. Damit greifen die neuen Tastenkürzel sofort (nächste KeyDown-Auswertung).
            try
            {
                if (map.TryGetValue(WebLocalStorageBridge.Keys.KeyboardShortcuts, out var rawShortcuts) &&
                    !string.IsNullOrWhiteSpace(rawShortcuts))
                {
                    var parsed = System.Text.Json.JsonSerializer.Deserialize<
                        Dictionary<string, string>>(rawShortcuts);
                    if (parsed != null)
                    {
                        foreach (var kv in parsed)
                            ShortcutRegistry.SetCombo(kv.Key, kv.Value ?? "");
                    }
                }
            }
            catch { }
        }
        catch { /* best-effort */ }
    }

    /// <summary>
    /// Der zentrale Theme-Toggle. Idempotent, Thread-safe, niemals crashend.
    /// </summary>
    public void SafeThemeToggle()
    {
        try
        {
            SettingsStore.Instance.IsDark = !SettingsStore.Instance.IsDark;
            var p = SettingsStore.Instance.IsDark ? ThemeService.Dark : ThemeService.Light;
            ApplyTheme(p);
            try { RebuildAvatarSources(); } catch { }
        }
        catch (Exception ex)
        {
            try { SetStatus($"Theme-Toggle: {ex.Message}"); } catch { }
        }
    }

    /// <summary>
    /// Toggle für die WPF-App-Sidebar (links). Default: collapsed.
    /// Die WebApp im Chromium hat ihre eigene Sidebar — keine Doppelung.
    /// </summary>
    private void BtnToggleWpfSidebar_Click(object sender, RoutedEventArgs e)
    {
        try
        {
            var isVisible = SidebarRoot.Visibility == Visibility.Visible;
            if (isVisible)
            {
                // App-Sidebar komplett verstecken: Spalte auf 0, Flag setzen,
                // damit SidebarRoot_SizeChanged die Spalte nicht überschreibt.
                _appSidebarHidden = true;
                SidebarRoot.Visibility = Visibility.Collapsed;
                AnimateSidebarColumn(WpfSidebarColumn.Width.Value, 0, 220);
                SettingsStore.Instance.SidebarAppMode = false;
                SetStatus("App-Sidebar ausgeblendet (WebApp-Sidebar aktiv)");
            }
            else
            {
                // App-Sidebar wieder zeigen: Flag aus, SidebarRoot einblenden,
                // Spalte auf aktuelle SidebarRoot-Width syncen.
                _appSidebarHidden = false;
                SidebarRoot.Visibility = Visibility.Visible;
                AnimateSidebarColumn(WpfSidebarColumn.Width.Value, SidebarRoot.Width, 220);
                SettingsStore.Instance.SidebarAppMode = true;
                SetStatus("App-Sidebar eingeblendet");
            }
        }
        catch (Exception ex)
        {
            try { SetStatus($"Sidebar-Toggle: {ex.Message}"); } catch { }
        }
    }

    private bool _appSidebarHidden = true;  // Default: App-Sidebar ist aus

    /// <summary>
    /// Snap-to-Close: wenn der User den Side-Browser fast komplett wegzieht
    /// (unter Schwelle), automatisch ganz einklappen.
    /// </summary>
    private void BrowserSplitter_DragCompleted(object sender, System.Windows.Controls.Primitives.DragCompletedEventArgs e)
    {
        try
        {
            if (BrowserSplitRoot.Visibility != Visibility.Visible) return;
            // Wenn die Side-Browser-Spalte < 80px ist → komplett schließen (Snap-to-Close)
            const double collapseThreshold = 80.0;
            if (BrowserSplitColumn.ActualWidth < collapseThreshold)
            {
                SetSplitBrowserVisible(false);
                SetStatus("Side-Browser eingerastet (zu) — Toggle erneut drücken zum Öffnen");
            }
        }
        catch (Exception ex)
        {
            try { SetStatus($"Snap-Close: {ex.Message}"); } catch { }
        }
    }

    /// <summary>
    /// Toggle für den Split-Browser (rechts). Default: collapsed.
    /// WebApp links, Browser rechts zum Surfen.
    /// </summary>
    private void BtnToggleBrowserSplit_Click(object sender, RoutedEventArgs e)
    {
        try
        {
            // Floating-Button und X-Button toggeln immer auf "Split" (mit Splitter)
            SetSideBrowserMode(SideBrowserMode.Split);
        }
        catch (Exception ex)
        {
            try { SetStatus($"Browser-Split: {ex.Message}"); } catch { }
        }
    }

    private void SetSplitBrowserVisible(bool visible)
    {
        // Delegiert an die neue Mode-basierte Steuerung. true → Split, false → Hidden.
        SetSideBrowserMode(visible ? SideBrowserMode.Split : SideBrowserMode.Hidden);
    }

    private double _sideBrowserLastWidth = 600.0;

    /// <summary>
    /// Fullscreen-Button-Toggle: Side-Browser sichtbar/ausblenden.
    /// (WebApp läuft immer fullscreen-primary, Side-Browser ist secondary,
    /// öffnet automatisch wenn die WebApp eine externe URL postet).
    /// </summary>
    private void BtnFullscreen_Click(object sender, RoutedEventArgs e)
    {
        try
        {
            SetSideBrowserMode(SideBrowserMode.Fullscreen);
        }
        catch (Exception ex)
        {
            try { SetStatus($"Fullscreen: {ex.Message}"); } catch { }
        }
    }

    // ============================================================
    //   KEYBOARD SHORTCUTS (alle editierbar über Settings#shortcuts)
    // ============================================================
    private enum SideBrowserMode { Hidden, Split, SnapToMenu, Fullscreen }
    private SideBrowserMode _sideMode = SideBrowserMode.Hidden;

    /// <summary>
    /// Vergleicht das aktuelle KeyEvent mit dem registrierten Combo-String aus den Settings.
    /// Beim Match → Handler aufrufen. Wenn keiner passt → false (damit z.B. das WebView eigene
    /// Shortcuts wie Ctrl+R für Reload probieren kann).
    /// </summary>
    private bool TryShortcut(string id, Action action)
    {
        try
        {
            var combo = ShortcutCombo.Parse(ShortcutRegistry.GetCombo(id));
            if (combo.Matches(_lastKeyEvent)) { action(); return true; }
        }
        catch { }
        return false;
    }

    private KeyEventArgs? _lastKeyEvent;
    private void Window_KeyDown(object sender, KeyEventArgs e)
    {
        _lastKeyEvent = e;
        try
        {
            // Side-Browser Back/Forward (auch als Combo editierbar, mit Default Alt+Left/Right)
            TryShortcut("history-back",    () => { if (BrowserSplitRoot.Visibility == Visibility.Visible) BtnBack_Click(this, new RoutedEventArgs()); });
            TryShortcut("history-forward", () => { if (BrowserSplitRoot.Visibility == Visibility.Visible) BtnForward_Click(this, new RoutedEventArgs()); });

            if (TryShortcut("browser",      () => SetSideBrowserMode(SideBrowserMode.Split)))    { e.Handled = true; return; }
            if (TryShortcut("browser-menu", () => SetSideBrowserMode(SideBrowserMode.SnapToMenu))) { e.Handled = true; return; }
            if (TryShortcut("browser-full", () => SetSideBrowserMode(SideBrowserMode.Fullscreen))) { e.Handled = true; return; }
            if (TryShortcut("theme",        () => ThemeService.Toggle()))                          { e.Handled = true; return; }
            if (TryShortcut("sidebar",      () => BtnCollapse_Click(this, new RoutedEventArgs())))   { e.Handled = true; return; }
            if (TryShortcut("settings",     () => BtnOpenSettings_Click(this, new RoutedEventArgs()))) { e.Handled = true; return; }
            if (TryShortcut("focus-input",  () => BtnFocusInput_Click(this, new RoutedEventArgs()))) { e.Handled = true; return; }
            if (TryShortcut("new-chat",     () => BtnNewChat_Click(this, new RoutedEventArgs())))    { e.Handled = true; return; }
            if (TryShortcut("reload",       () => WebAppView?.Reload()))                            { e.Handled = true; return; }
            if (TryShortcut("browser-tab",  () => BtnNewTab_Click(this, new RoutedEventArgs())))   { e.Handled = true; return; }
            // Escape ist gesondert, weil das XAML-KeyDown oft Vorrang hat — also nur Swallow wenn Browser offen
            if (TryShortcut("escape", () =>
                {
                    if (BrowserSplitRoot.Visibility == Visibility.Visible &&
                        _sideMode == SideBrowserMode.Fullscreen)
                    {
                        SetSideBrowserMode(SideBrowserMode.Hidden);
                    }
                }))
            { e.Handled = true; return; }
        }
        catch (Exception ex)
        {
            try { SetStatus($"Shortcut: {ex.Message}"); } catch { }
        }
    }

    /// <summary>Side-Browser neuer Tab — Adresse-Bar leeren und fokussieren.</summary>
    private void BtnNewTab_Click(object sender, RoutedEventArgs e)
    {
        try
        {
            if (BrowserSplitRoot.Visibility != Visibility.Visible)
                SetSideBrowserMode(SideBrowserMode.Split);
            if (SplitAddressBar != null)
            {
                SplitAddressBar.Clear();
                SplitAddressBar.Focus();
            }
        }
        catch { }
    }

    /// <summary>Springt in das Eingabefeld der WebApp (falls vorhanden).</summary>
    private void BtnFocusInput_Click(object sender, RoutedEventArgs e)
    {
        try
        {
            // Wir versuchen über die WebApp-Bridge das Chat-Composer-Element zu fokussieren.
            // Wenn das fehlschlägt (z.B. WebApp noch nicht geladen), klick auf das Composer-Icon.
            if (WebAppView?.CoreWebView2 != null)
            {
                _ = WebAppView.CoreWebView2.ExecuteScriptAsync(
                    "(()=>{try{var el=document.querySelector('[data-composer-input],textarea,[contenteditable=\"true\"]');if(el){el.focus();return true;}}catch(e){}return false;})()");
            }
        }
        catch { }
    }

    /// <summary>WebApp: neuen Channel öffnen.</summary>
    private void BtnNewChat_Click(object sender, RoutedEventArgs e)
    {
        try
        {
            if (WebAppView?.CoreWebView2 != null)
                _ = WebAppView.CoreWebView2.ExecuteScriptAsync(
                    "history.pushState(null,'','/channel/new');window.dispatchEvent(new PopStateEvent('popstate'));");
        }
        catch { }
    }

    /// <summary>
    /// Wechselt Side-Browser zwischen den 4 Zuständen: Hidden / Split (Default-Toggle)
    /// / SnapToMenu (überlappt WebApp, Side-Menü bleibt sichtbar) / Fullscreen (nur Browser).
    /// Ein Doppelklick auf die gleiche Mode-Taste schaltet zurück auf Hidden.
    /// </summary>
    private void SetSideBrowserMode(SideBrowserMode mode)
    {
        try
        {
            // Doppelklick auf den gleichen Mode → Hidden (Toggle-Verhalten)
            if (mode == _sideMode && mode != SideBrowserMode.Hidden)
                mode = SideBrowserMode.Hidden;

            // Erst alles zurücksetzen (Spaltenbreiten, Sidebar)
            ResetGridForMode();

            switch (mode)
            {
                case SideBrowserMode.Hidden:
                    // Beide Spalten aktiv zusammenschieben, damit die Bewegung sichtbar ist.
                    AnimateSplitColumns(
                        webAppFrom: WebAppColumn.Width.IsAbsolute ? WebAppColumn.Width.Value : RootGrid.ActualWidth,
                        webAppTo: RootGrid.ActualWidth,
                        browserFrom: BrowserSplitColumn.Width.IsAbsolute ? BrowserSplitColumn.Width.Value : 0,
                        browserTo: 0,
                        durationMs: 220);
                    HideSideBrowserAfterDelay();
                    SettingsStore.Instance.SidebarAppMode = false;
                    _sideMode = SideBrowserMode.Hidden;
                    SetStatus("Side-Browser geschlossen");
                    break;

                case SideBrowserMode.Split:
                    EnsureSplitBrowserInitialized();
                    // Zielbreiten: WebApp schiebt sich aktiv zusammen, Browser bekommt den Rest.
                    var totalAvail = RootGrid.ActualWidth - SplitterColumn.ActualWidth;
                    var webAppTarget = Clamp(totalAvail - SideBrowserSplitTargetWidth, SideBrowserSplitMinWebAppWidth, SideBrowserSplitMaxWebAppWidth);
                    var browserTarget = Math.Max(SideBrowserSplitMinBrowserWidth, totalAvail - webAppTarget - SplitterColumn.ActualWidth);
                    _sideBrowserLastWidth = browserTarget;

                    BrowserSplitRoot.Visibility = Visibility.Visible;
                    BrowserSplitter.Visibility = Visibility.Visible;
                    SplitterColumn.Width = GridLength.Auto;

                    AnimateSplitColumns(
                        webAppFrom: RootGrid.ActualWidth,
                        webAppTo: webAppTarget,
                        browserFrom: 0,
                        browserTo: browserTarget,
                        durationMs: 280);
                    _sideMode = SideBrowserMode.Split;
                    SetStatus($"Side-Browser: Split (Browser {browserTarget:0}px · WebApp {webAppTarget:0}px)");
                    break;

                case SideBrowserMode.SnapToMenu:
                    EnsureSplitBrowserInitialized();
                    // Sidebar erzwingen sichtbar (sonst macht "bis ans Side-Menü" keinen Sinn)
                    if (SidebarRoot.Visibility != Visibility.Visible)
                        BtnToggleWpfSidebar_Click(this, new RoutedEventArgs());
                    BrowserSplitRoot.Visibility = Visibility.Visible;
                    BrowserSplitter.Visibility = Visibility.Collapsed;
                    SplitterColumn.Width = new GridLength(0);
                    WebAppColumn.Width = new GridLength(0);
                    BrowserSplitColumn.Width = new GridLength(1, GridUnitType.Star);
                    WebAppColumn.MinWidth = 0;
                    _sideMode = SideBrowserMode.SnapToMenu;
                    SetStatus("Side-Browser: eingerastet am Side-Menü (überdeckt WebApp)");
                    break;

                case SideBrowserMode.Fullscreen:
                    EnsureSplitBrowserInitialized();
                    if (SidebarRoot.Visibility == Visibility.Visible)
                        BtnToggleWpfSidebar_Click(this, new RoutedEventArgs());
                    BrowserSplitRoot.Visibility = Visibility.Visible;
                    BrowserSplitter.Visibility = Visibility.Collapsed;
                    SplitterColumn.Width = new GridLength(0);
                    WebAppColumn.Width = new GridLength(0);
                    BrowserSplitColumn.Width = new GridLength(1, GridUnitType.Star);
                    WebAppColumn.MinWidth = 0;
                    _sideMode = SideBrowserMode.Fullscreen;
                    SetStatus("Side-Browser: Vollbild (nur Side-Browser sichtbar)");
                    break;
            }

            // Floating-Toggle-Position und Status immer aktuell
            UpdateSideTogglePosition();
        }
        catch (Exception ex)
        {
            try { SetStatus($"Side-Mode {mode}: {ex.Message}"); } catch { }
        }
    }

    private void ResetGridForMode()
    {
        // Sicherstellen, dass MinWidths nach einem Modus-Wechsel nicht steckenbleiben.
        // BrowserSplitColumn bleibt MinWidth=0, damit der Side-Browser vollständig auf 0
        // kollabieren kann (sonst bleibt ein 50px-Streifen sichtbar). Die echte Mindest-
        // breite beim Resize regelt der Splitter/Snap-Threshold.
        WebAppColumn.MinWidth = SideBrowserSplitMinWebAppWidth;
        BrowserSplitColumn.MinWidth = 0;
        SplitterColumn.Width = GridLength.Auto;
    }

    /// <summary>
    /// Mindestbreite für den Side-Browser im Split-Modus — bleibt benutzbar.
    /// </summary>
    private const double SideBrowserSplitMinBrowserWidth = 720;

    /// <summary>
    /// Wunschbreite des Side-Browsers im Split-Modus. WebApp schiebt sich auf den Rest
    /// zusammen, schrumpft aber nie unter <see cref="SideBrowserSplitMinWebAppWidth"/>.
    /// </summary>
    private const double SideBrowserSplitTargetWidth = 820;

    /// <summary>
    /// Maximalbreite der WebApp im Split-Modus. Wenn sie größer wäre, klappt der weiße
    /// Rest zusammen und der Browser bekommt mehr Platz.
    /// </summary>
    private const double SideBrowserSplitMaxWebAppWidth = 900;

    /// <summary>
    /// Untergrenze der WebApp-Spalte im Split-Modus (Sidebar + Channel-Liste + Chat lesbar).
    /// </summary>
    private const double SideBrowserSplitMinWebAppWidth = 480;

    private static double Clamp(double v, double min, double max) =>
        v < min ? min : (v > max ? max : v);

    /// <summary>
    /// Animiert WebApp- und Browser-Spalte gleichzeitig, sodass der Side-Browser sichtbar
    /// "rangezogen" wird, während die WebApp aktiv zusammengeschoben wird.
    /// EaseOut-Cubic, ~16ms-Frame-Intervall.
    /// </summary>
    private void AnimateSplitColumns(double webAppFrom, double webAppTo, double browserFrom, double browserTo, int durationMs)
    {
        try
        {
            var start = DateTime.UtcNow;
            var timer = new System.Windows.Threading.DispatcherTimer
            {
                Interval = TimeSpan.FromMilliseconds(16)
            };
            timer.Tick += (s, e) =>
            {
                var elapsed = (DateTime.UtcNow - start).TotalMilliseconds;
                var t = Math.Min(1.0, elapsed / durationMs);
                var eased = 1.0 - Math.Pow(1.0 - t, 3); // EaseOut-Cubic
                var w = webAppFrom + (webAppTo - webAppFrom) * eased;
                var b = browserFrom + (browserTo - browserFrom) * eased;
                WebAppColumn.Width = new GridLength(Math.Max(0, w));
                BrowserSplitColumn.Width = new GridLength(Math.Max(0, b));
                if (t >= 1.0)
                {
                    WebAppColumn.Width = new GridLength(webAppTo);
                    BrowserSplitColumn.Width = new GridLength(browserTo);
                    timer.Stop();
                }
            };
            timer.Start();
        }
        catch { }
    }

    private void EnsureSplitBrowserInitialized()
    {
        try
        {
            if (SplitWebView != null)
            {
                SplitWebView.Visibility = Visibility.Visible;
                var src = SplitWebView.Source?.ToString() ?? "";
                bool isBlank = string.IsNullOrEmpty(src) || src == "about:blank";
                if (isBlank)
                    SplitWebView.NavigateToString(SplitEmptyHome());
                // AddressBar vorbefüllen mit der WebApp-URL, falls leer — sodass der
                // User direkt Enter drücken kann, um die WebApp im Side-Browser zu sehen.
                if (SplitAddressBar != null && string.IsNullOrWhiteSpace(SplitAddressBar.Text))
                {
                    try
                    {
                        var hint = ResolveSideBrowserDefaultUrl();
                        if (!string.IsNullOrWhiteSpace(hint))
                            SplitAddressBar.Text = hint;
                    }
                    catch { }
                }
            }
        }
        catch { }
    }

    /// <summary>
    /// Bestimmt die Default-URL für den Side-Browser: wenn die WebApp gerade auf
    /// einer normalen App-URL läuft (nicht about:blank), wird diese übernommen —
    /// der Side-Browser startet also "spiegelnd" mit dem, was der User gerade offen hat.
    /// Fällt zurück auf die Connect Local-URL.
    /// </summary>
    private string ResolveSideBrowserDefaultUrl()
    {
        try
        {
            var current = WebAppView?.Source?.ToString() ?? "";
            if (!string.IsNullOrEmpty(current) &&
                current != "about:blank" &&
                !current.StartsWith("data:", StringComparison.OrdinalIgnoreCase))
            {
                return current;
            }
        }
        catch { }
        // Fallback: gleicher Port wie die WebApp (Default :4117)
        return "http://localhost:4117";
    }

    private void HideSideBrowserAfterDelay()
    {
        var t = new System.Windows.Threading.DispatcherTimer
        {
            Interval = TimeSpan.FromMilliseconds(240)
        };
        t.Tick += (s, args) =>
        {
            t.Stop();
            try
            {
                if (_sideMode != SideBrowserMode.Hidden) return; // abgebrochen
                BrowserSplitRoot.Visibility = Visibility.Collapsed;
                BrowserSplitter.Visibility = Visibility.Collapsed;
                SplitterColumn.Width = new GridLength(0);
                if (SplitWebView != null) SplitWebView.Visibility = Visibility.Collapsed;
                WebAppColumn.Width = new GridLength(1, GridUnitType.Star);
            }
            catch { }
        };
        t.Start();
    }

    private bool _sideToggleHovered;

    private void SideToggleFloat_MouseEnter(object sender, System.Windows.Input.MouseEventArgs e)
    {
        _sideToggleHovered = true;
        ApplySideToggleVisual();
    }

    private void SideToggleFloat_MouseLeave(object sender, System.Windows.Input.MouseEventArgs e)
    {
        _sideToggleHovered = false;
        ApplySideToggleVisual();
    }

    /// <summary>
    /// Setzt Opacity + Border-Hervorhebung des Side-Browser-Toggles in Abhängigkeit
    /// vom aktuellen Mode und Hover-Zustand. Default ist immer sichtbar (≥ 0.85),
    /// damit der User den Anker jederzeit findet — Hover boostet auf 1.0.
    /// </summary>
    private void ApplySideToggleVisual()
    {
        if (SideToggleFloat == null) return;

        // Basis-Opacity: IMMER klar sichtbar. Der Button ist 38×118 px groß mit
        // Label — er soll als Anker jederzeit erkennbar sein, nicht erst beim
        // Suchen. Hover boostet auf volle Sichtbarkeit.
        double baseOpacity = 0.88;

        SideToggleFloat.Opacity = _sideToggleHovered ? 1.0 : baseOpacity;

        // Icon rotiert: zeigt nach rechts, wenn Side-Browser geschlossen ist
        // (das Panel ist rechts, Pfeil zeigt darauf). Zeigt nach links, wenn offen
        // (schließen, zurück zur WebApp).
        double target = _sideMode == SideBrowserMode.Hidden ? 180.0 : 0.0;
        if (SideToggleRotate != null)
            AnimateRotate(SideToggleRotate, SideToggleRotate.Angle, target, 220);
        if (SideToggleLabelRotate != null)
            AnimateRotate(SideToggleLabelRotate, SideToggleLabelRotate.Angle, target, 220);
        if (SideToggleDotRotate != null)
            AnimateRotate(SideToggleDotRotate, SideToggleDotRotate.Angle, target, 220);
    }

    private void UpdateSideTogglePosition()
    {
        if (SideToggleFloat == null) return;
        // IMMER am rechten Rand der WebApp-Spalte — gleicher Anker-Punkt, egal ob
        // Browser offen oder zu. So findet der User den Toggle immer an der
        // gleichen Stelle.
        SideToggleFloat.HorizontalAlignment = HorizontalAlignment.Right;
        ApplySideToggleVisual();
    }

    private void AnimateRotate(System.Windows.Media.RotateTransform rt, double from, double to, int durationMs)
    {
        try
        {
            var start = DateTime.UtcNow;
            var timer = new System.Windows.Threading.DispatcherTimer
            {
                Interval = TimeSpan.FromMilliseconds(16)
            };
            timer.Tick += (s, e) =>
            {
                var elapsed = (DateTime.UtcNow - start).TotalMilliseconds;
                var t = Math.Min(1.0, elapsed / durationMs);
                var eased = 1.0 - Math.Pow(1.0 - t, 3);
                rt.Angle = from + (to - from) * eased;
                if (t >= 1.0)
                {
                    rt.Angle = to;
                    timer.Stop();
                }
            };
            timer.Start();
        }
        catch
        {
            rt.Angle = to;
        }
    }

    private void AnimateColumnWidth(System.Windows.Controls.ColumnDefinition col, double from, double to, int durationMs)
    {
        try
        {
            var start = DateTime.UtcNow;
            var timer = new System.Windows.Threading.DispatcherTimer
            {
                Interval = TimeSpan.FromMilliseconds(16)
            };
            timer.Tick += (s, e) =>
            {
                var elapsed = (DateTime.UtcNow - start).TotalMilliseconds;
                var t = Math.Min(1.0, elapsed / durationMs);
                // EaseOut
                var eased = 1.0 - Math.Pow(1.0 - t, 3);
                var current = from + (to - from) * eased;
                col.Width = new GridLength(current);
                if (t >= 1.0)
                {
                    col.Width = new GridLength(to);
                    timer.Stop();
                }
            };
            timer.Start();
        }
        catch
        {
            col.Width = new GridLength(to);
        }
    }

    private void AnimateSidebarColumn(double from, double to, int durationMs)
    {
        try
        {
            var start = DateTime.UtcNow;
            var timer = new System.Windows.Threading.DispatcherTimer
            {
                Interval = TimeSpan.FromMilliseconds(16)
            };
            timer.Tick += (s, e) =>
            {
                var elapsed = (DateTime.UtcNow - start).TotalMilliseconds;
                var t = Math.Min(1.0, elapsed / durationMs);
                var eased = 1.0 - Math.Pow(1.0 - t, 3);
                var current = from + (to - from) * eased;
                WpfSidebarColumn.Width = new GridLength(current);
                if (t >= 1.0)
                {
                    WpfSidebarColumn.Width = new GridLength(to);
                    timer.Stop();
                }
            };
            timer.Start();
        }
        catch
        {
            WpfSidebarColumn.Width = new GridLength(to);
        }
    }

    private string SplitEmptyHome()
    {
        // Theme-aware Empty-Karte. Wir lesen das aktuelle BrowserPaneBg aus den
        // Settings — damit ist die Karte im Light-Theme hell und im Dark-Theme
        // dunkel. So wirkt der Side-Browser wie aus einem Guss.
        bool isDark = SettingsStore.Instance.IsDark;
        string bg = isDark ? "#0A0A0A" : "#FFFFFF";
        string fg = isDark ? "#A1A1AA" : "#52525B";
        string heading = isDark ? "#F4F4F5" : "#18181B";
        string cardBg = isDark ? "#1F2937" : "#F4F4F5";
        string accent = isDark ? "#10B981" : "#059669";
        return $$"""
        <!doctype html><html><head><meta charset="utf-8">
        <style>
        body{margin:0;font-family:'Inter',system-ui,sans-serif;background:{{bg}};color:{{fg}};
          display:flex;align-items:center;justify-content:center;height:100vh;flex-direction:column;gap:8px;
          padding:24px;box-sizing:border-box;text-align:center}
        h1{font-size:18px;font-weight:600;color:{{heading}};margin:0}
        p{font-size:12px;margin:0;line-height:1.5;max-width:32ch}
        .hint{padding:8px 12px;background:{{cardBg}};border-radius:8px;margin-top:12px;font-size:11px;color:{{accent}}}
        </style></head><body>
          <h1>Browser</h1>
          <p>Echter Chromium für AI-Tasks (unsichtbar für den User).</p>
          <p>Im WebApp auf "Browser" klicken öffnet hier einen Split-View.</p>
          <div class="hint">URL oben eingeben und Enter drücken</div>
        </body></html>
        """;
    }

    /// <summary>Settings öffnen — öffnet die WPF-Sidebar als Settings-Panel.</summary>
    private void BtnOpenSettings_Click(object sender, RoutedEventArgs e)
    {
        BtnToggleWpfSidebar_Click(sender, e);
    }

    /// <summary>Enter-Taste in der Split-URL-Bar → WebView navigieren.</summary>
    private void SplitAddressBar_KeyDown(object sender, KeyEventArgs e)
    {
        try
        {
            if (e.Key == Key.Enter)
            {
                var url = (SplitAddressBar.Text ?? "").Trim();
                if (string.IsNullOrEmpty(url)) return;
                if (!url.StartsWith("http://", StringComparison.OrdinalIgnoreCase) &&
                    !url.StartsWith("https://", StringComparison.OrdinalIgnoreCase))
                {
                    // Ohne Protokoll: als URL behandeln, sonst als Suchanfrage (Google)
                    if (url.Contains(' ') || !url.Contains('.'))
                        url = "https://www.google.com/search?q=" + Uri.EscapeDataString(url);
                    else
                        url = "https://" + url;
                }
                SplitWebView.CoreWebView2?.Navigate(url);
                SplitAddressBar.Text = url;
                SetStatus($"Browser → {url}");
            }
        }
        catch (Exception ex)
        {
            try { SetStatus($"Browser-Nav: {ex.Message}"); } catch { }
        }
    }

    /// <summary>User-Menu-Item-Click (Theme/Settings/SignOut).</summary>
    private void UserMenuItem_Click(object sender, RoutedEventArgs e)
    {
        try
        {
            if (sender is not MenuItem m || m.Tag == null) return;
            switch (m.Tag.ToString())
            {
                case "settings": BtnToggleWpfSidebar_Click(sender, e); break;
                case "theme": SafeThemeToggle(); break;
                case "signout":
                    SettingsStore.Instance.LocalProfileName = "Gast";
                    SetStatus("Abgemeldet (lokal)");
                    break;
                case "help": SetStatus("Hilfe: Connect Desktop v0.2.0"); break;
            }
        }
        catch (Exception ex)
        {
            try { SetStatus($"Menu: {ex.Message}"); } catch { }
        }
    }

    private void StartAutomationServerWithRetry()
    {
        try
        {
            // AI-Bridge läuft im Hintergrund auf Port 3002.
            // Sie kann den SplitWebView via BrowserAutomationServer steuern —
            // unsichtbar für den User, der nur die WebApp sieht.
            _automationServer = new BrowserAutomationServer(this, null!, 3002);
            _automationServer.Start();
            AiServerStatus.Text = "AI-Bridge: verbunden";
        }
        catch
        {
            AiServerStatus.Text = "AI-Bridge: Port 3002 belegt";
        }
    }

    private void MainWindow_Closing(object? sender, System.ComponentModel.CancelEventArgs e)
    {
        _automationServer?.Stop();
    }

    // ===================== SIDEBAR DATA =====================

    private void BuildSidebar()
    {
        // Pinned: Slack (live)
        Pinned.Clear();
        Pinned.Add(new SidebarItem
        {
            Id = "pinned-slack", Name = "Slack", Subtitle = "Workspace · 3 unread",
            AccentHex = "#7C3AED", Pinned = true, Unread = true,
            Participants = new[] { "Slack" }, // monogram-style Slack icon
        });

        // Groups: Zentrale/Slack, Research/Arc, Delivered/Linear
        Groups.Clear();
        Groups.Add(new SidebarItem
        {
            Id = "g-zentrale", Name = "Zentrale", Glyph = "Z",
            Subtitle = "3 Agents · Slack",
            AccentHex = "#5E6AD2",
            Url = "https://slack.com/",
            Participants = new[] { "Benjamin", "Christopher", "Stefan" },
        });
        Groups.Add(new SidebarItem
        {
            Id = "g-research", Name = "Research", Glyph = "R",
            Subtitle = "2 Agents · Arc",
            AccentHex = "#5E6AD2",
            Url = "https://arc.net/",
            Participants = new[] { "Mia", "Noah" },
        });
        Groups.Add(new SidebarItem
        {
            Id = "g-delivered", Name = "Delivered", Glyph = "D",
            Subtitle = "2 Agents · Linear",
            AccentHex = "#5E6AD2",
            Url = "https://linear.app/",
            Participants = new[] { "Willi", "Olivia" },
        });

        // Trading-Tools (direkt im Side-Browser öffnen)
        Groups.Add(new SidebarItem
        {
            Id = "g-tradingview", Name = "TradingView", Glyph = "T",
            Subtitle = "Alle Märkte · Live Charts",
            AccentHex = "#2962FF",
            Url = "https://www.tradingview.com/chart/",
        });

        // Agents: Benjamin + Christopher + Add
        Agents.Clear();
        Agents.Add(new SidebarItem
        {
            Id = "a-benjamin", Name = "Benjamin", Online = true,
            AccentHex = "#10B981",
            Participants = new[] { "Benjamin" },
        });
        Agents.Add(new SidebarItem
        {
            Id = "a-christopher", Name = "Christopher", Online = true,
            AccentHex = "#3B82F6",
            Participants = new[] { "Christopher" },
        });

        // Channels (web spec: ChannelAvatar + last message + unread/pinned/online badges)
        Channels.Clear();
        Channels.Add(new SidebarItem
        {
            Id = "c-hafen-1", Name = "hafen-1",
            Subtitle = "Willi: Hafen 1 ist ausgebucht…", LastAt = "vor 4 Min.",
            AccentHex = "#3B82F6", Online = true, Unread = true,
            Participants = new[] { "Willi", "Stefan" },
        });
        Channels.Add(new SidebarItem
        {
            Id = "c-alpha-2", Name = "alpha-2",
            Subtitle = "Willi: Planänderung beim Termin", LastAt = "vor 1 Std",
            AccentHex = "#64748B", Online = true, Pinned = true,
            Participants = new[] { "Willi" },
        });
        Channels.Add(new SidebarItem
        {
            Id = "c-apple-style-folders", Name = "apple-style-folders",
            Subtitle = "Stefan: Oh, sieht clean aus — …", LastAt = "jetzt",
            AccentHex = "#EC4899", Online = true, Unread = true, Pinned = true,
            Participants = new[] { "Stefan", "Benjamin", "Willi", "Mia" },
        });
        Channels.Add(new SidebarItem
        {
            Id = "c-arbeitsbereich", Name = "arbeitsbereich",
            Subtitle = "offen — niemand hat geschrieben", LastAt = "",
            AccentHex = "#94A3B8",
            Participants = new[] { "?" },
        });

        RebuildAvatarSources();
        PinnedList.ItemsSource  = Pinned;
        GroupList.ItemsSource   = Groups;
        AgentList.ItemsSource   = Agents;
        ChannelList.ItemsSource = Channels;
    }

    private void RebuildAvatarSources()
    {
        try
        {
            // Defensive Kopie der Collections — falls zur Renderzeit gemutiert wird
            var pinned = Pinned.ToArray();
            var groups = Groups.ToArray();
            var agents = Agents.ToArray();
            var channels = Channels.ToArray();

            foreach (var item in pinned.Concat(groups).Concat(agents).Concat(channels))
            {
                if (item == null) continue;
                try
                {
                    item.AvatarSource = SidebarAvatarRenderer.RenderChannelAvatar(item.Participants, 32);
                }
                catch { /* skip this item */ }
            }
            // Folder-Icons für Groups: Sky-gradient mit 2x2-Avatar-Collage (wie AppleFolderIcon)
            foreach (var g in groups)
            {
                if (g == null) continue;
                try
                {
                    g.AvatarSource = SidebarAvatarRenderer.RenderAppleFolder(g.Participants, 36);
                }
                catch { /* skip this item */ }
            }
        }
        catch (Exception ex)
        {
            try { SetStatus($"Avatare: {ex.Message}"); } catch { }
        }
    }

    // ===================== SIDEBAR ACTIONS =====================

    private void SidebarSearch_TextChanged(object sender, TextChangedEventArgs e)
    {
        var q = (SidebarSearch.Text ?? "").Trim().ToLowerInvariant();
        if (string.IsNullOrEmpty(q))
        {
            PinnedList.ItemsSource  = Pinned;
            GroupList.ItemsSource   = Groups;
            AgentList.ItemsSource   = Agents;
            ChannelList.ItemsSource = Channels;
            return;
        }
        PinnedList.ItemsSource  = Filter(Pinned, q);
        GroupList.ItemsSource   = Filter(Groups, q);
        AgentList.ItemsSource   = Filter(Agents, q);
        ChannelList.ItemsSource = Filter(Channels, q);
    }

    private static List<SidebarItem> Filter(IEnumerable<SidebarItem> src, string q) =>
        src.Where(s => s.Name.ToLowerInvariant().Contains(q)).ToList();

    private void UserMenu_Click(object sender, MouseButtonEventArgs e)
    {
        if (sender is not Border b) return;
        b.ContextMenu ??= new ContextMenu();
        b.ContextMenu.Items.Clear();
        var profile = new MenuItem { Header = "Profil — Stefan Kunc" };
        profile.IsEnabled = false;
        b.ContextMenu.Items.Add(profile);
        b.ContextMenu.Items.Add(new MenuItem { Header = "Settings", Tag = "settings" });
        var theme = new MenuItem { Header = SettingsStore.Instance.IsDark ? "Light mode" : "Dark mode", Tag = "theme" };
        theme.Click += (_, _) => SafeThemeToggle();
        b.ContextMenu.Items.Add(theme);
        b.ContextMenu.Items.Add(new MenuItem { Header = "Help", Tag = "help" });
        b.ContextMenu.Items.Add(new Separator());
        b.ContextMenu.Items.Add(new MenuItem { Header = "Sign out", Tag = "logout" });
        b.ContextMenu.PlacementTarget = b;
        b.ContextMenu.IsOpen = true;
        SetStatus("User-Menü: Theme / Settings / Sign-out");
    }
    private void BtnCreate_Click(object sender, RoutedEventArgs e)
    {
        // Plus-Dropdown: New company / New group / New bot / Market (web spec)
        if (sender is not Button btn) return;
        btn.ContextMenu ??= new ContextMenu();
        btn.ContextMenu.Items.Clear();
        btn.ContextMenu.Items.Add(new MenuItem { Header = "New company", Tag = "company" });
        btn.ContextMenu.Items.Add(new MenuItem { Header = "New group", Tag = "group" });
        btn.ContextMenu.Items.Add(new MenuItem { Header = "New bot", Tag = "bot" });
        btn.ContextMenu.Items.Add(new MenuItem { Header = "Market", Tag = "market" });
        btn.ContextMenu.PlacementTarget = btn;
        btn.ContextMenu.IsOpen = true;
        SetStatus("Erstellen: company / group / bot / market");
    }
    private void BtnSsl_Click(object sender, RoutedEventArgs e) => SetStatus("SSL: sichere Verbindung");
    private void BtnBookmark_Click(object sender, RoutedEventArgs e) => SetStatus("Lesezeichen — folgt");

    private void PinnedList_SelectionChanged(object sender, SelectionChangedEventArgs e)
        => RouteToChannel(sender, "pinned");

    private void ChannelList_SelectionChanged(object sender, SelectionChangedEventArgs e)
        => RouteToChannel(sender, "channel");

    private void RouteToChannel(object sender, string prefix)
    {
        if ((sender as ListBox)?.SelectedItem is not SidebarItem s) return;
        LevelChat.IsChecked = true;
        ShowMessagesView();
        if (MessagesView.CoreWebView2 != null)
        {
            MessagesView.NavigateToString(PseudoViews.MessagesView(s.Id, s.Name, s.Subtitle));
        }
        SetStatus($"Channel: {s.Name}");
    }

    private void GroupList_SelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        if ((sender as ListBox)?.SelectedItem is not SidebarItem s) return;
        LevelBrowser.IsChecked = true;
        // Öffnet Split-Browser mit dieser URL (Browser ist nicht mehr Default-Ansicht)
        SetSplitBrowserVisible(true);
        try { SplitWebView?.CoreWebView2?.Navigate($"https://{s.Id}.connect.local/"); } catch { }
        // Workspace ist Browser-Mode mit Workspace-URL
        SetStatus($"Gruppe: {s.Name}");
    }

    private void AgentList_SelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        if ((sender as ListBox)?.SelectedItem is not SidebarItem s) return;
        LevelChat.IsChecked = true;
        ShowMessagesView();
        if (MessagesView.CoreWebView2 != null)
        {
            MessagesView.NavigateToString(PseudoViews.MessagesView(s.Id, s.Name, "Hallo Benjamin — was steht heute an?"));
        }
        SetStatus($"Agent: {s.Name}");
    }

    // ===================== MODE SWITCH (sidebar level chips) =====================

    private void LevelFocus_Checked(object sender, RoutedEventArgs e)   => SetLevel(1);
    private void LevelChat_Checked(object sender, RoutedEventArgs e)    => SetLevel(2);
    private void LevelBrowser_Checked(object sender, RoutedEventArgs e) => SetLevel(3);
    private void LevelCompany_Checked(object sender, RoutedEventArgs e) => SetLevel(4);

    private void SetLevel(int level)
    {
        switch (level)
        {
            case 1: ShowMessagesView(); break; // Focus = Messages
            case 2: ShowMessagesView(); break; // Chat = Messages
            case 3: SetSplitBrowserVisible(true); break; // Browser = Split-Browser öffnen
            case 4: ShowCompanyView(); break;
        }
        SetStatus($"Level: {level}");
    }

    private void ConnectBrandMark_Click(object sender, MouseButtonEventArgs e)
    {
        // Company-Switcher — Liste der Seed-Companies
        if (sender is not Border b) return;
        b.ContextMenu ??= new ContextMenu();
        b.ContextMenu.Items.Clear();
        b.ContextMenu.Items.Add(new MenuItem { Header = "Nordwind", Tag = "nordwind" });
        b.ContextMenu.Items.Add(new MenuItem { Header = "Lumen", Tag = "lumen" });
        b.ContextMenu.Items.Add(new MenuItem { Header = "Helm", Tag = "helm" });
        b.ContextMenu.Items.Add(new MenuItem { Header = "Pulse", Tag = "pulse" });
        b.ContextMenu.PlacementTarget = b;
        b.ContextMenu.IsOpen = true;
        SetStatus("Companies: Nordwind / Lumen / Helm / Pulse");
    }

    private void BtnCollapse_Click(object sender, RoutedEventArgs e)
    {
        // Sidebar einklappen/ausklappen mit Width-Animation (200ms ease-out)
        var grid = SidebarRoot.Parent as Grid;
        if (grid == null) return;

        var isCollapsed = SidebarRoot.Width <= 70;
        var targetWidth = isCollapsed ? 280.0 : 60.0;
        var dur = TimeSpan.FromMilliseconds(220);

        // Chevron-Richtung umkehren
        CollapseIcon.Data = isCollapsed
            ? Geometry.Parse("M15 18l-6-6 6-6")   // ChevronLeft → expandieren
            : Geometry.Parse("M9 18l6-6-6-6");   // ChevronRight → einklappen

        // Content-Visibility je nach Zustand
        SetSidebarContentVisibility(!isCollapsed);

        // Width-Animation
        var anim = new System.Windows.Media.Animation.DoubleAnimation(targetWidth, dur)
        {
            EasingFunction = new System.Windows.Media.Animation.CubicEase { EasingMode = System.Windows.Media.Animation.EasingMode.EaseOut }
        };
        SidebarRoot.BeginAnimation(System.Windows.Controls.Border.WidthProperty, anim);

        SetStatus(isCollapsed
            ? "Sidebar ausgeklappt (280px)"
            : "Sidebar eingeklappt (60px Icon-Rail)");
    }

    private void SetSidebarContentVisibility(bool expanded)
    {
        // Header-Content (LevelChips) und Search, ContentPanel, Footer ausblenden wenn collapsed
        if (HeaderContentPanel != null)
            HeaderContentPanel.Visibility = expanded ? Visibility.Visible : Visibility.Collapsed;
        if (SearchPanel != null)
            SearchPanel.Visibility = expanded ? Visibility.Visible : Visibility.Collapsed;
        if (SidebarContentPanel != null)
            SidebarContentPanel.Visibility = expanded ? Visibility.Visible : Visibility.Collapsed;
        if (FooterPanel != null)
            FooterPanel.Visibility = expanded ? Visibility.Visible : Visibility.Collapsed;

        // Brand-Mark bleibt immer sichtbar
        // CollapseIcon dreht sich und bleibt sichtbar
    }

    private void SidebarRoot_SizeChanged(object sender, SizeChangedEventArgs e)
    {
        // Sidebar kann zwischen 60 (Icon-Rail) und 280 (Voll) liegen.
        // Wenn App-Sidebar komplett versteckt ist (_appSidebarHidden), Spalte NICHT überschreiben.
        if (_appSidebarHidden) return;

        // Content-Visibility mit aktueller Width syncen
        var isCollapsed = SidebarRoot.Width <= 70;
        SetSidebarContentVisibility(!isCollapsed);

        // Grid-Spalte folgt der Sidebar → Browser-Spalte rückt automatisch mit
        var newWidth = Math.Max(60, SidebarRoot.ActualWidth);
        if (Math.Abs(WpfSidebarColumn.Width.Value - newWidth) > 0.5)
        {
            WpfSidebarColumn.Width = new GridLength(newWidth);
        }
    }

    private void ShowCurrentMode()
    {
        try
        {
            switch (_mode)
            {
                case AppMode.WebApp:
                    // WebApp ist Default — einfach nur sichtbar machen
                    WebAppView.Visibility = Visibility.Visible;
                    MessagesView.Visibility = Visibility.Collapsed;
                    WorkspaceView.Visibility = Visibility.Collapsed;
                    CompanyView.Visibility = Visibility.Collapsed;
                    break;
                case AppMode.Messages: ShowMessagesView(); break;
                case AppMode.Company: ShowCompanyView(); break;
            }
        }
        catch (Exception ex)
        {
            try { SetStatus($"Mode: {ex.Message}"); } catch { }
        }
    }

    private enum AppMode { WebApp, Browser, Messages, Workspace, Company }
    private AppMode _mode = AppMode.WebApp;

    // ===================== LEGACY VIEW-MODES (Pseudo-Views) =====================
    // Im neuen Architektur-Modell ist WebApp Fullscreen (Default),
    // und der echte Browser lebt im Split-Browser rechts.
    // Diese Methoden bleiben für Fallback-PseudoViews (Messages/Company),
    // wenn jemand explizit darauf umschalten will.

    private void ShowMessagesView()
    {
        try
        {
            _mode = AppMode.Messages;
            WebAppView.Visibility = Visibility.Collapsed;
            MessagesView.Visibility = Visibility.Visible;
            WorkspaceView.Visibility = Visibility.Collapsed;
            CompanyView.Visibility = Visibility.Collapsed;
            if (MessagesView.CoreWebView2 != null
                && (MessagesView.Source == null
                    || !MessagesView.Source.ToString().StartsWith("data:text/html")))
            {
                var seed = Channels.FirstOrDefault();
                if (seed != null)
                    MessagesView.NavigateToString(PseudoViews.MessagesView(seed.Id, seed.Name, seed.Subtitle));
            }
            SetStatus("Modus: Messages");
        }
        catch (Exception ex) { try { SetStatus($"Messages: {ex.Message}"); } catch { } }
    }

    private void ShowCompanyView()
    {
        try
        {
            _mode = AppMode.Company;
            WebAppView.Visibility = Visibility.Collapsed;
            MessagesView.Visibility = Visibility.Collapsed;
            WorkspaceView.Visibility = Visibility.Collapsed;
            CompanyView.Visibility = Visibility.Visible;
            if (CompanyView.CoreWebView2 != null
                && (CompanyView.Source == null
                    || !CompanyView.Source.ToString().StartsWith("data:text/html")))
            {
                CompanyView.NavigateToString(PseudoViews.CompanyView());
            }
            SetStatus("Modus: Unternehmen");
        }
        catch (Exception ex) { try { SetStatus($"Company: {ex.Message}"); } catch { } }
    }

    private void BtnBack_Click(object sender, RoutedEventArgs e)
    {
        try
        {
            if (SplitWebView?.CoreWebView2?.CanGoBack == true)
                SplitWebView.CoreWebView2.GoBack();
        }
        catch { }
    }
    private void BtnForward_Click(object sender, RoutedEventArgs e)
    {
        try
        {
            if (SplitWebView?.CoreWebView2?.CanGoForward == true)
                SplitWebView.CoreWebView2.GoForward();
        }
        catch { }
    }
    private void BtnRefresh_Click(object sender, RoutedEventArgs e)
    {
        try { SplitWebView?.CoreWebView2?.Reload(); } catch { }
    }

    private void AddressBar_KeyDown(object sender, KeyEventArgs e)
    {
        // Legacy: nicht mehr in Verwendung — SplitBrowser hat eigene URL-Bar
        if (e.Key != Key.Enter) return;
        e.Handled = true;
        SetStatus("Hinweis: Browser-URLs werden in der Split-URL-Bar (rechts) eingegeben.");
    }

    public void NavigateBrowser(string url)
    {
        if (string.IsNullOrWhiteSpace(url)) return;
        SplitAddressBar.Text = url;
        try { SplitWebView?.CoreWebView2?.Navigate(url); } catch { }
    }

    public void SetStatus(string text)
    {
        // Bottom-Bar (Grid.Row=2) zeigt Status links + Toggle rechts.
        // Thread-safe weil SetStatus vom UI-Thread aufgerufen wird (alle Caller sind Click-Handler / Init).
        try
        {
            if (BottomStatusText != null)
                BottomStatusText.Text = text ?? "";
        }
        catch { }
    }

    /// <summary>Legacy: switch to web mode (no-op now — WebApp is default).</summary>
    public void SwitchToWebMode(string reason)
    {
        SetStatus(reason);
    }

    /// <summary>
    /// Legacy: switch to app mode (no-op now).
    public void SwitchToAppMode(string reason)
    {
        SetStatus(reason);
    }
    public WebView2? ActiveTabView => SplitWebView;
    public WebView2? TabView(string tabId) => SplitWebView;
    public BrowserTabs? TabsAccessor => null;
}
