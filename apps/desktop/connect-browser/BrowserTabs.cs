using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;
using System.IO;
using System.Linq;
using System.Text.Json;
using System.Windows;
using System.Windows.Controls;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.Wpf;

namespace ConnectDesktop;

/// <summary>
/// Manages a list of WebView2 browser tabs inside a single host Grid.
///
/// - Each tab is its own WebView2 instance (WebView2 has no native tab concept;
///   multiple WebViews share the same CoreWebView2Environment and therefore
///   share the userDataFolder, which means shared login cookies).
/// - Exactly one tab is "active" at a time; non-active tabs are Visibility=Collapsed.
/// - Tab list, URLs, and active tab id are persisted to tabs.json next to
///   WebView2Data so the user reopens the same set of tabs across app restarts.
/// - Tab ids are stable strings ("tab-1", "tab-2", …).
/// - The UI-side <see cref="BrowserTabItem"/> carries title + IsLoading + favicon
///   so the strip can show a spinner and a per-tab close button.
/// </summary>
public sealed class BrowserTabs
{
    private readonly Grid _host;
    private readonly ListBox _tabStrip;
    private readonly Action<BrowserTab> _onActiveChanged;
    private readonly CoreWebView2Environment _env;

    private readonly List<BrowserTab> _tabs = new();
    private BrowserTab? _active;

    /// <summary>Observable collection shown in the tab strip.</summary>
    public ObservableCollection<BrowserTabItem> Items { get; } = new();

    public IReadOnlyList<BrowserTab> Tabs => _tabs;
    public BrowserTab? ActiveTab => _active;

    /// <summary>Path to the persistence file. Lives next to WebView2Data.</summary>
    public static string PersistencePath => Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
        "ConnectDesktop",
        "tabs.json");

    public BrowserTabs(
        Grid host,
        ListBox tabStrip,
        CoreWebView2Environment env,
        Action<BrowserTab> onActiveChanged)
    {
        _host = host;
        _tabStrip = tabStrip;
        _env = env;
        _onActiveChanged = onActiveChanged;

        _tabStrip.ItemsSource = Items;
        _tabStrip.SelectionChanged += (_, _) =>
        {
            if (_tabStrip.SelectedItem is BrowserTabItem item)
            {
                var match = _tabs.FirstOrDefault(t => t.Item == item);
                if (match != null && match != _active)
                    SwitchTo(match.Id);
            }
        };
    }

    /// <summary>
    /// Load tabs from persistence if present, otherwise create the default
    /// single tab pointing at <paramref name="defaultUrl"/>. Always finishes
    /// with at least one tab and a selected tab.
    /// </summary>
    public async void InitializeOrRestore(string defaultUrl)
    {
        var restored = TryRestore();
        if (restored.Count == 0)
        {
            await CreateTabAsync(defaultUrl);
        }
        else
        {
            foreach (var (id, url) in restored)
            {
                await CreateTabAsync(url, id);
            }
            var activeId = ReadActiveId();
            if (activeId != null && _tabs.Any(t => t.Id == activeId))
            {
                SwitchTo(activeId);
            }
            else if (_tabs.Count > 0)
            {
                SwitchTo(_tabs[0].Id);
            }
        }
    }

    /// <summary>
    /// Create a new tab. If <paramref name="id"/> is null, a fresh "tab-N" id
    /// is assigned. Always makes the new tab active.
    /// </summary>
    public async System.Threading.Tasks.Task<BrowserTab> CreateTabAsync(string url, string? id = null)
    {
        id ??= NextId();
        var view = new WebView2 { Visibility = Visibility.Collapsed };
        _host.Children.Add(view);
        await view.EnsureCoreWebView2Async(_env);
        var item = new BrowserTabItem
        {
            Id = id,
            Title = id,
            Url = url,
            Favicon = FaviconFor(url),
            IsLoading = true,
        };
        var tab = new BrowserTab(id, view, url, item);
        _tabs.Add(tab);
        Items.Add(item);
        WireTab(view, tab);
        view.CoreWebView2.Navigate(url);
        SwitchTo(id);
        Persist();
        return tab;
    }

    /// <summary>Make the tab with the given id the visible one. No-op if id is unknown or already active.</summary>
    public void SwitchTo(string id)
    {
        var tab = _tabs.FirstOrDefault(t => t.Id == id);
        if (tab == null || tab == _active) return;

        foreach (var t in _tabs)
            t.View.Visibility = Visibility.Collapsed;

        tab.View.Visibility = Visibility.Visible;
        _active = tab;
        // Sync ListBox selection without re-triggering the SelectionChanged
        // infinite recursion (we already drive the change from here).
        _tabStrip.SelectionChanged -= OnStripSelectionChanged;
        _tabStrip.SelectedItem = tab.Item;
        _tabStrip.SelectionChanged += OnStripSelectionChanged;
        _onActiveChanged(tab);
        Persist();
    }

    private void OnStripSelectionChanged(object? sender, SelectionChangedEventArgs e)
    {
        if (_tabStrip.SelectedItem is BrowserTabItem item)
        {
            var match = _tabs.FirstOrDefault(t => t.Item == item);
            if (match != null && match != _active)
                SwitchTo(match.Id);
        }
    }

    /// <summary>
    /// Close the tab with the given id. If it was the active tab, switch to
    /// the nearest neighbour. Refuses to close the last remaining tab (it
    /// navigates that tab to about:blank instead).
    /// </summary>
    public void Close(string id)
    {
        var tab = _tabs.FirstOrDefault(t => t.Id == id);
        if (tab == null) return;

        if (_tabs.Count == 1)
        {
            tab.View.CoreWebView2?.Navigate("about:blank");
            tab.Url = "about:blank";
            tab.Item.Url = "about:blank";
            tab.Item.Title = "New Tab";
            tab.Item.Favicon = "🗗";
            tab.Item.IsLoading = false;
            Persist();
            return;
        }

        var idx = _tabs.IndexOf(tab);
        Items.Remove(tab.Item);
        _tabs.Remove(tab);
        _host.Children.Remove(tab.View);
        tab.View.Dispose();

        var wasActive = _active == tab;
        if (wasActive)
        {
            var neighbour = _tabs[Math.Max(0, idx - 1)];
            SwitchTo(neighbour.Id);
        }
        Persist();
    }

    /// <summary>Navigate the active tab to a URL. No-op if no active tab.</summary>
    public void NavigateActive(string url)
    {
        if (_active == null || string.IsNullOrWhiteSpace(url)) return;
        _active.View.CoreWebView2?.Navigate(url);
    }

    private void WireTab(WebView2 view, BrowserTab tab)
    {
        var core = view.CoreWebView2;
        core.Settings.AreDefaultContextMenusEnabled = true;
        core.Settings.IsStatusBarEnabled = false;
        core.Settings.UserAgent = AppendUA(core.Settings.UserAgent);

        tab.Item.IsLoading = true;

        core.DocumentTitleChanged += (_, _) =>
        {
            var newTitle = core.DocumentTitle;
            if (!string.IsNullOrWhiteSpace(newTitle))
            {
                tab.Title = newTitle;
                tab.Item.Title = newTitle;
            }
            Persist();
        };

        core.SourceChanged += (_, _) =>
        {
            var src = view.Source?.ToString() ?? "";
            tab.Url = src;
            tab.Item.Url = src;
            tab.Item.Favicon = FaviconFor(src);
            if (tab == _active)
                _onActiveChanged(tab);
            // Wenn auf Connect-URL navigiert wird, automatisch in Web-Sidebar-Mode schalten
            if (IsConnectUrl(src) && Application.Current.MainWindow is MainWindow mw)
            {
                mw.SwitchToWebMode("Connect-WebApp geladen");
            }
            Persist();
        };

        core.NavigationStarting += (_, args) =>
        {
            tab.Item.IsLoading = true;
            Application.Current.Dispatcher.BeginInvoke(new Action(() =>
            {
                var t = _tabs.FirstOrDefault(x => x.Id == tab.Id);
                if (t == _active && Application.Current.MainWindow is MainWindow mw)
                    mw.SetStatus("AI-Browser lädt: " + args.Uri);
            }));
        };

        core.NavigationCompleted += (_, _) =>
        {
            tab.Item.IsLoading = false;
            // Re-pull title after navigation completes (DocumentTitleChanged
            // sometimes fires before the body is parsed).
            var t = core.DocumentTitle;
            if (!string.IsNullOrWhiteSpace(t))
            {
                tab.Title = t;
                tab.Item.Title = t;
            }
        };
    }

    private static string AppendUA(string ua) =>
        ua + " ConnectDesktop/1.0";

    private static bool IsConnectUrl(string url)
    {
        if (string.IsNullOrWhiteSpace(url)) return false;
        return url.Contains("127.0.0.1:3010", StringComparison.OrdinalIgnoreCase)
            || url.Contains("localhost:3010", StringComparison.OrdinalIgnoreCase);
    }

    private static string FaviconFor(string url)
    {
        if (string.IsNullOrWhiteSpace(url)) return "🌐";
        if (url.StartsWith("about:blank", StringComparison.OrdinalIgnoreCase)) return "🗗";
        if (url.StartsWith("data:", StringComparison.OrdinalIgnoreCase)) return "🖼";
        if (url.Contains("google.com", StringComparison.OrdinalIgnoreCase)) return "🔍";
        if (url.Contains("youtube.com", StringComparison.OrdinalIgnoreCase)) return "▶";
        if (url.Contains("github.com", StringComparison.OrdinalIgnoreCase)) return "⌨";
        if (url.Contains("localhost") || url.Contains("127.0.0.1")) return "⚡";
        if (url.Contains(".pdf")) return "📕";
        return "🌐";
    }

    private string NextId()
    {
        var max = 0;
        foreach (var t in _tabs)
        {
            if (t.Id.StartsWith("tab-", StringComparison.Ordinal)
                && int.TryParse(t.Id.AsSpan(4), out var n)
                && n > max) max = n;
        }
        return $"tab-{max + 1}";
    }

    // ---- Persistence ----

    [Serializable]
    private class PersistedState
    {
        public List<string> Tabs { get; set; } = new();
        public List<string> Urls { get; set; } = new();
        public string? ActiveId { get; set; }
    }

    private List<(string id, string url)> TryRestore()
    {
        try
        {
            if (!File.Exists(PersistencePath)) return new List<(string, string)>();
            var json = File.ReadAllText(PersistencePath);
            var state = JsonSerializer.Deserialize<PersistedState>(json);
            if (state == null || state.Tabs.Count != state.Urls.Count) return new List<(string, string)>();
            var pairs = new List<(string, string)>(state.Tabs.Count);
            for (var i = 0; i < state.Tabs.Count; i++)
                pairs.Add((state.Tabs[i], state.Urls[i]));
            return pairs;
        }
        catch
        {
            return new List<(string, string)>();
        }
    }

    private string? ReadActiveId()
    {
        try
        {
            if (!File.Exists(PersistencePath)) return null;
            var state = JsonSerializer.Deserialize<PersistedState>(File.ReadAllText(PersistencePath));
            return state?.ActiveId;
        }
        catch { return null; }
    }

    private void Persist()
    {
        try
        {
            var dir = Path.GetDirectoryName(PersistencePath);
            if (!string.IsNullOrEmpty(dir)) Directory.CreateDirectory(dir);
            var state = new PersistedState
            {
                Tabs = _tabs.Select(t => t.Id).ToList(),
                Urls = _tabs.Select(t => t.Url).ToList(),
                ActiveId = _active?.Id,
            };
            File.WriteAllText(PersistencePath, JsonSerializer.Serialize(state, new JsonSerializerOptions { WriteIndented = true }));
        }
        catch { /* persistence is best-effort */ }
    }
}

public sealed class BrowserTab
{
    public string Id { get; }
    public WebView2 View { get; }
    public string Url { get; set; }
    public string Title { get; set; }
    public BrowserTabItem Item { get; }

    public BrowserTab(string id, WebView2 view, string url, BrowserTabItem item)
    {
        Id = id;
        View = view;
        Url = url;
        Title = id;
        Item = item;
    }
}
