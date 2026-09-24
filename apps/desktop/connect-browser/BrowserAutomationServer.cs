using System;
using System.IO;
using System.Linq;
using System.Net;
using System.Text;
using System.Text.Json;
using System.Threading.Tasks;
using System.Windows;
using Microsoft.Web.WebView2.Wpf;

namespace ConnectDesktop;

public class BrowserAutomationServer
{
    private const string DefaultBrowserHome = "https://www.google.com/";

    private readonly HttpListener _listener;
    private readonly MainWindow _mainWindow;
    private bool _isRunning;
    public int Port { get; }

    public BrowserAutomationServer(MainWindow mainWindow, BrowserTabs tabs, int port = 3002)
    {
        _mainWindow = mainWindow;
        Port = port;
        _listener = new HttpListener();
        _listener.Prefixes.Add($"http://127.0.0.1:{Port}/");
    }

    /// <summary>
    /// Extract the optional tab id from a path like "/api/browser/{tabId}/...".
    /// Returns null when no id segment is present.
    /// </summary>
    private static string? ExtractTabId(string path)
    {
        // path starts with "/api/browser/"
        var rest = path.Substring("/api/browser/".Length);
        if (string.IsNullOrEmpty(rest)) return null;
        var slash = rest.IndexOf('/');
        return slash < 0 ? rest : rest.Substring(0, slash);
    }

    /// <summary>Resolve a tab's WebView2 by id, falling back to the active tab.</summary>
    private Microsoft.Web.WebView2.Wpf.WebView2? ResolveTab(string? tabId)
    {
        if (!string.IsNullOrEmpty(tabId))
        {
            var match = _mainWindow.TabView(tabId);
            if (match != null) return match;
        }
        return _mainWindow.ActiveTabView;
    }

    public void Start()
    {
        try
        {
            _listener.Start();
            _isRunning = true;
            Task.Run(ListenLoop);
        }
        catch (Exception ex)
        {
            System.Diagnostics.Debug.WriteLine($"Automation Server Error: {ex.Message}");
        }
    }

    public void Stop()
    {
        _isRunning = false;
        try
        {
            _listener.Stop();
        }
        catch { }
    }

    private async Task<T> RunOnUiAsync<T>(Func<Task<T>> func)
    {
        var op = await Application.Current.Dispatcher.InvokeAsync(func);
        return await op;
    }

    private async Task RunOnUiAsync(Func<Task> func)
    {
        var op = await Application.Current.Dispatcher.InvokeAsync(func);
        await op;
    }

    private async Task ListenLoop()
    {
        while (_isRunning)
        {
            try
            {
                var context = await _listener.GetContextAsync();
                _ = Task.Run(() => HandleRequest(context));
            }
            catch when (!_isRunning)
            {
                break;
            }
            catch (Exception ex)
            {
                System.Diagnostics.Debug.WriteLine($"ListenLoop error: {ex.Message}");
            }
        }
    }

    private async Task HandleRequest(HttpListenerContext context)
    {
        var req = context.Request;
        var res = context.Response;

        // CORS headers
        res.Headers.Add("Access-Control-Allow-Origin", "*");
        res.Headers.Add("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
        res.Headers.Add("Access-Control-Allow-Headers", "Content-Type");

        if (req.HttpMethod == "OPTIONS")
        {
            res.StatusCode = 204;
            res.Close();
            return;
        }

        try
        {
            var path = req.Url?.AbsolutePath.ToLowerInvariant() ?? "";
            const string prefix = "/api/browser/";
            if (!path.StartsWith(prefix, StringComparison.Ordinal)) goto notFound;

            var rest = path.Substring(prefix.Length);
            if (rest.Length == 0) goto notFound;

            var segments = rest.Split('/');
            string tabId = null!;
            string action;

            if (segments.Length == 1)
            {
                // /api/browser/{verb}
                action = segments[0];
            }
            else
            {
                // /api/browser/{tabId}/{verb} — only treat segments[0] as a tab id
                // when it actually matches the tab- prefix and segments[1] is the verb.
                tabId = segments[0];
                action = segments[1];
            }

            switch ((action, req.HttpMethod))
            {
                case ("status", "GET"):
                    await HandleStatus(res, tabId);
                    return;
                case ("tabs", "GET"):
                    await HandleTabs(res);
                    return;
                case ("navigate", "POST"):
                    await HandleNavigate(req, res, tabId);
                    return;
                case ("exec", "POST"):
                    await HandleEval(req, res, tabId);
                    return;
                case ("click", "POST"):
                    await HandleClick(req, res, tabId);
                    return;
                case ("type", "POST"):
                    await HandleType(req, res, tabId);
                    return;
                case ("snapshot", "GET"):
                    await HandleSnapshot(res, tabId);
                    return;
                case ("screenshot", "GET"):
                    await HandleScreenshot(res, tabId);
                    return;
                case ("newtab", "POST"):
                    await HandleNewTab(req, res, tabId);
                    return;
                case ("closetab", "POST"):
                    await HandleCloseTab(req, res, tabId);
                    return;
                case ("switchtab", "POST"):
                    await HandleSwitchTab(req, res, tabId);
                    return;
            }

            notFound:
            res.StatusCode = 404;
            await SendJson(res, new { error = "Not found" });
        }
        catch (Exception ex)
        {
            res.StatusCode = 500;
            await SendJson(res, new { error = ex.Message });
        }
    }

    private async Task HandleStatus(HttpListenerResponse res, string? tabId)
    {
        string currentUrl = "";
        string currentTitle = "";
        bool isReady = false;

        await Application.Current.Dispatcher.InvokeAsync(() =>
        {
            var tab = ResolveTab(tabId);
            currentUrl = tab?.Source?.ToString() ?? "";
            currentTitle = tab?.CoreWebView2?.DocumentTitle ?? "";
            isReady = tab?.CoreWebView2 != null;
        });

        var tabsList = new List<object>();
        await Application.Current.Dispatcher.InvokeAsync(() =>
        {
            foreach (var t in _mainWindow.TabsAccessor?.Tabs ?? new List<BrowserTab>())
            {
                tabsList.Add(new
                {
                    id = t.Id,
                    url = t.Url,
                    title = t.Title,
                    active = _mainWindow.TabsAccessor?.ActiveTab?.Id == t.Id,
                });
            }
        });

        await SendJson(res, new
        {
            ok = true,
            browser = "WebView2",
            tabId = tabId ?? _mainWindow.TabsAccessor?.ActiveTab?.Id,
            url = currentUrl,
            title = currentTitle,
            ready = isReady,
            tabs = tabsList,
            automationPort = Port,
            webAppUrl = MainWindow.ConnectUrl,
        });
    }

    private async Task HandleTabs(HttpListenerResponse res)
    {
        var tabsList = new List<object>();
        await Application.Current.Dispatcher.InvokeAsync(() =>
        {
            foreach (var t in _mainWindow.TabsAccessor?.Tabs ?? new List<BrowserTab>())
            {
                tabsList.Add(new
                {
                    id = t.Id,
                    url = t.Url,
                    title = t.Title,
                    active = _mainWindow.TabsAccessor?.ActiveTab?.Id == t.Id,
                });
            }
        });
        await SendJson(res, new { ok = true, tabs = tabsList, activeId = _mainWindow.TabsAccessor?.ActiveTab?.Id });
    }

    private async Task HandleNewTab(HttpListenerRequest req, HttpListenerResponse res, string? tabId)
    {
        string targetUrl = DefaultBrowserHome;
        try
        {
            using var reader = new StreamReader(req.InputStream, req.ContentEncoding);
            var body = await reader.ReadToEndAsync();
            if (!string.IsNullOrWhiteSpace(body))
            {
                var data = JsonSerializer.Deserialize<JsonElement>(body);
                if (data.TryGetProperty("url", out var urlProp) && !string.IsNullOrWhiteSpace(urlProp.GetString()))
                    targetUrl = urlProp.GetString()!;
            }
        }
        catch { }

        string? newTabId = null;
        await Application.Current.Dispatcher.InvokeAsync(async () =>
        {
            var tabs = _mainWindow.TabsAccessor;
            if (tabs == null) return;
            var tab = await tabs.CreateTabAsync(targetUrl);
            newTabId = tab.Id;
        });

        await SendJson(res, new { ok = true, tabId = newTabId, url = targetUrl });
    }

    private async Task HandleCloseTab(HttpListenerRequest req, HttpListenerResponse res, string? tabId)
    {
        string targetId = tabId ?? "";
        try
        {
            using var reader = new StreamReader(req.InputStream, req.ContentEncoding);
            var body = await reader.ReadToEndAsync();
            if (!string.IsNullOrWhiteSpace(body))
            {
                var data = JsonSerializer.Deserialize<JsonElement>(body);
                if (data.TryGetProperty("tabId", out var idProp) && !string.IsNullOrWhiteSpace(idProp.GetString()))
                    targetId = idProp.GetString()!;
            }
        }
        catch { }

        await Application.Current.Dispatcher.InvokeAsync(() =>
        {
            _mainWindow.TabsAccessor?.Close(targetId);
        });

        await SendJson(res, new { ok = true, closed = targetId });
    }

    private async Task HandleSwitchTab(HttpListenerRequest req, HttpListenerResponse res, string? tabId)
    {
        string targetId = tabId ?? "";
        try
        {
            using var reader = new StreamReader(req.InputStream, req.ContentEncoding);
            var body = await reader.ReadToEndAsync();
            if (!string.IsNullOrWhiteSpace(body))
            {
                var data = JsonSerializer.Deserialize<JsonElement>(body);
                if (data.TryGetProperty("tabId", out var idProp) && !string.IsNullOrWhiteSpace(idProp.GetString()))
                    targetId = idProp.GetString()!;
            }
        }
        catch { }

        await Application.Current.Dispatcher.InvokeAsync(() =>
        {
            _mainWindow.TabsAccessor?.SwitchTo(targetId);
        });

        await SendJson(res, new { ok = true, active = targetId });
    }

    private async Task HandleNavigate(HttpListenerRequest req, HttpListenerResponse res, string? tabId)
    {
        using var reader = new StreamReader(req.InputStream, req.ContentEncoding);
        var body = await reader.ReadToEndAsync();
        var data = JsonSerializer.Deserialize<JsonElement>(body);

        if (!data.TryGetProperty("url", out var urlProp) || string.IsNullOrWhiteSpace(urlProp.GetString()))
        {
            res.StatusCode = 400;
            await SendJson(res, new { error = "Missing 'url' parameter" });
            return;
        }

        var targetUrl = urlProp.GetString()!;
        if (!targetUrl.Contains("://")) targetUrl = "https://" + targetUrl;

        string? resolvedTabId = null;
        await Application.Current.Dispatcher.InvokeAsync(() =>
        {
            var tab = ResolveTab(tabId);
            if (tab?.CoreWebView2 != null)
            {
                tab.CoreWebView2.Navigate(targetUrl);
                resolvedTabId = _mainWindow.TabsAccessor?.Tabs.FirstOrDefault(t => t.View == tab)?.Id;
            }
        });

        await SendJson(res, new { ok = true, tabId = resolvedTabId, url = targetUrl, status = "navigating" });
    }

    private async Task HandleEval(HttpListenerRequest req, HttpListenerResponse res, string? tabId)
    {
        using var reader = new StreamReader(req.InputStream, req.ContentEncoding);
        var body = await reader.ReadToEndAsync();
        var data = JsonSerializer.Deserialize<JsonElement>(body);

        if (!data.TryGetProperty("script", out var scriptProp))
        {
            res.StatusCode = 400;
            await SendJson(res, new { error = "Missing 'script' parameter" });
            return;
        }

        string result = await RunOnUiAsync(async () =>
        {
            var tab = ResolveTab(tabId);
            if (tab?.CoreWebView2 != null)
            {
                return await tab.CoreWebView2.ExecuteScriptAsync(scriptProp.GetString());
            }
            return "";
        });

        await SendJson(res, new { ok = true, tabId = tabId, result });
    }

    private async Task HandleClick(HttpListenerRequest req, HttpListenerResponse res, string? tabId)
    {
        using var reader = new StreamReader(req.InputStream, req.ContentEncoding);
        var body = await reader.ReadToEndAsync();
        var data = JsonSerializer.Deserialize<JsonElement>(body);

        var selector = data.GetProperty("selector").GetString() ?? "";
        var script = $@"
            (() => {{
                const el = document.querySelector('{selector.Replace("'", "\\'")}');
                if (el) {{
                    el.scrollIntoView({{ behavior: 'instant', block: 'center' }});
                    el.click();
                    return true;
                }}
                return false;
            }})();
        ";

        string result = await RunOnUiAsync(async () =>
        {
            var tab = ResolveTab(tabId);
            if (tab?.CoreWebView2 != null)
            {
                return await tab.CoreWebView2.ExecuteScriptAsync(script);
            }
            return "false";
        });

        await SendJson(res, new { ok = result == "true", tabId = tabId, clicked = selector });
    }

    private async Task HandleType(HttpListenerRequest req, HttpListenerResponse res, string? tabId)
    {
        using var reader = new StreamReader(req.InputStream, req.ContentEncoding);
        var body = await reader.ReadToEndAsync();
        var data = JsonSerializer.Deserialize<JsonElement>(body);

        var selector = data.GetProperty("selector").GetString() ?? "";
        var text = data.GetProperty("text").GetString() ?? "";

        var script = $@"
            (() => {{
                const el = document.querySelector('{selector.Replace("'", "\\'")}');
                if (el) {{
                    el.focus();
                    el.value = '{text.Replace("'", "\\'")}';
                    el.dispatchEvent(new Event('input', {{ bubbles: true }}));
                    el.dispatchEvent(new Event('change', {{ bubbles: true }}));
                    return true;
                }}
                return false;
            }})();
        ";

        string result = await RunOnUiAsync(async () =>
        {
            var tab = ResolveTab(tabId);
            if (tab?.CoreWebView2 != null)
            {
                return await tab.CoreWebView2.ExecuteScriptAsync(script);
            }
            return "false";
        });

        await SendJson(res, new { ok = result == "true", tabId = tabId, typed = text });
    }

    private async Task HandleSnapshot(HttpListenerResponse res, string? tabId)
    {
        string textSnapshot = "";
        string currentUrl = "";

        var result = await RunOnUiAsync<(string url, string raw)>(async () =>
        {
            var tab = ResolveTab(tabId);
            if (tab?.CoreWebView2 != null)
            {
                var url = tab.Source?.ToString() ?? "";
                var script = @"
                    (() => {
                        return JSON.stringify({
                            title: document.title,
                            url: location.href,
                            innerText: document.body ? document.body.innerText.substring(0, 10000) : ''
                        });
                    })();
                ";
                var raw = await tab.CoreWebView2.ExecuteScriptAsync(script);
                return (url, raw);
            }
            return ("", "");
        });

        currentUrl = result.url;
        textSnapshot = result.raw;

        await SendJson(res, new { ok = true, tabId = tabId, url = currentUrl, snapshot = textSnapshot });
    }

    private async Task HandleScreenshot(HttpListenerResponse res, string? tabId)
    {
        byte[]? imageBytes = await RunOnUiAsync(async () =>
        {
            var tab = ResolveTab(tabId);
            if (tab?.CoreWebView2 != null)
            {
                using var ms = new MemoryStream();
                await tab.CoreWebView2.CapturePreviewAsync(
                    Microsoft.Web.WebView2.Core.CoreWebView2CapturePreviewImageFormat.Png,
                    ms);
                return ms.ToArray();
            }
            return null;
        });

        if (imageBytes != null && imageBytes.Length > 0)
        {
            res.ContentType = "image/png";
            res.ContentLength64 = imageBytes.Length;
            await res.OutputStream.WriteAsync(imageBytes, 0, imageBytes.Length);
            res.Close();
        }
        else
        {
            res.StatusCode = 500;
            await SendJson(res, new { error = "Failed to capture preview" });
        }
    }

    private static async Task SendJson(HttpListenerResponse res, object obj)
    {
        res.ContentType = "application/json; charset=utf-8";
        var bytes = Encoding.UTF8.GetBytes(JsonSerializer.Serialize(obj));
        res.ContentLength64 = bytes.Length;
        await res.OutputStream.WriteAsync(bytes, 0, bytes.Length);
        res.Close();
    }
}
