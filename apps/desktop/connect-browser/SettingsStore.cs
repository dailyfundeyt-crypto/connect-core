using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace ConnectDesktop;

/// <summary>
/// Persistiert alle Connect-Settings lokal auf der Festplatte
/// (gleiche Keys wie die WebApp: connect-theme, connect.companies.custom, etc.).
///
/// Schema-Datei: <c>%LocalAppData%\ConnectDesktop\settings.json</c>.
/// Web-Keys werden mit <c>syncWebLocalStorage</c> zusätzlich 1:1 unter
/// <c>%LocalAppData%\ConnectDesktop\web-localstorage.json</c> gespiegelt, damit der
/// Connect-WebApp-Renderer im Chromium die identischen Werte sieht.
/// </summary>
public sealed class SettingsStore
{
    public static SettingsStore Instance { get; } = new();

    private readonly string _appDataDir;
    private readonly string _settingsPath;
    private readonly string _webLocalStoragePath;

    private SettingsRoot _data = new();
    private readonly object _lock = new();

    public event EventHandler? Changed;

    private SettingsStore()
    {
        _appDataDir = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "ConnectDesktop");
        _settingsPath = Path.Combine(_appDataDir, "settings.json");
        _webLocalStoragePath = Path.Combine(_appDataDir, "web-localstorage.json");
        Load();
    }

    // =============================================================
    // Public settings surface (typed) — alle 14 WebApp-Keys gespiegelt
    // =============================================================

    public bool IsDark
    {
        get { lock (_lock) return _data.IsDark; }
        set { lock (_lock) _data.IsDark = value; Persist(); }
    }

    public string ActiveCompanyId
    {
        get { lock (_lock) return _data.ActiveCompanyId ?? "nordwind"; }
        set { lock (_lock) _data.ActiveCompanyId = value; Persist(); }
    }

    public string ActiveLevel
    {
        get { lock (_lock) return _data.ActiveLevel ?? "2"; }
        set { lock (_lock) _data.ActiveLevel = value; Persist(); }
    }

    public bool SidebarAppMode
    {
        get { lock (_lock) return _data.SidebarAppMode; }
        set { lock (_lock) _data.SidebarAppMode = value; Persist(); }
    }

    public List<OpenTab> OpenTabs
    {
        get { lock (_lock) return new(_data.OpenTabs); }
        set { lock (_lock) _data.OpenTabs = new(value); Persist(); }
    }

    public string? ActiveTabId
    {
        get { lock (_lock) return _data.ActiveTabId; }
        set { lock (_lock) _data.ActiveTabId = value; Persist(); }
    }

    public List<CustomCompany> CustomCompanies
    {
        get { lock (_lock) return new(_data.CustomCompanies); }
        set { lock (_lock) _data.CustomCompanies = new(value); Persist(); }
    }

    public string? LocalProfileName
    {
        get { lock (_lock) return _data.LocalProfileName; }
        set { lock (_lock) _data.LocalProfileName = value; Persist(); }
    }

    public string? LocalProfileAvatar
    {
        get { lock (_lock) return _data.LocalProfileAvatar; }
        set { lock (_lock) _data.LocalProfileAvatar = value; Persist(); }
    }

    // ---- Bridge-Typed-Settings (alle 14 WebApp-Keys) ----

    public string? GlobalApiKeys
    {
        get { lock (_lock) return _data.GlobalApiKeys; }
        set { lock (_lock) _data.GlobalApiKeys = value; Persist(); }
    }

    public string? AgentApiKeys
    {
        get { lock (_lock) return _data.AgentApiKeys; }
        set { lock (_lock) _data.AgentApiKeys = value; Persist(); }
    }

    public string? ModelProvider
    {
        get { lock (_lock) return _data.ModelProvider; }
        set { lock (_lock) _data.ModelProvider = value; Persist(); }
    }

    public string? VoiceSettings
    {
        get { lock (_lock) return _data.VoiceSettings; }
        set { lock (_lock) _data.VoiceSettings = value; Persist(); }
    }

    public bool KeepLoggedIn
    {
        get { lock (_lock) return _data.KeepLoggedIn; }
        set { lock (_lock) _data.KeepLoggedIn = value; Persist(); }
    }

    public int FocusTimerSeconds
    {
        get { lock (_lock) return _data.FocusTimerSeconds; }
        set { lock (_lock) _data.FocusTimerSeconds = value; Persist(); }
    }

    public bool FocusTimerRunning
    {
        get { lock (_lock) return _data.FocusTimerRunning; }
        set { lock (_lock) _data.FocusTimerRunning = value; Persist(); }
    }

    public DateTime? FocusTimerStartedAt
    {
        get { lock (_lock) return _data.FocusTimerStartedAt; }
        set { lock (_lock) _data.FocusTimerStartedAt = value; Persist(); }
    }

    public int FocusTimerSecondsAtStart
    {
        get { lock (_lock) return _data.FocusTimerSecondsAtStart; }
        set { lock (_lock) _data.FocusTimerSecondsAtStart = value; Persist(); }
    }

    public string? AvatarOverrides
    {
        get { lock (_lock) return _data.AvatarOverrides; }
        set { lock (_lock) _data.AvatarOverrides = value; Persist(); }
    }

    // =============================================================
    // Web-LocalStorage bridge
    // =============================================================

    public string? GetWebLocalStorage(string key)
    {
        try
        {
            if (!File.Exists(_webLocalStoragePath)) return null;
            var raw = File.ReadAllText(_webLocalStoragePath, Encoding.UTF8);
            var map = JsonSerializer.Deserialize<Dictionary<string, string>>(raw);
            return map?.GetValueOrDefault(key);
        }
        catch { return null; }
    }

    public void SetWebLocalStorage(string key, string? value)
    {
        try
        {
            Dictionary<string, string> map;
            if (File.Exists(_webLocalStoragePath))
            {
                var raw = File.ReadAllText(_webLocalStoragePath, Encoding.UTF8);
                map = JsonSerializer.Deserialize<Dictionary<string, string>>(raw) ?? new();
            }
            else
            {
                map = new();
            }
            if (value == null) map.Remove(key);
            else map[key] = value;
            Directory.CreateDirectory(_appDataDir);
            File.WriteAllText(_webLocalStoragePath,
                JsonSerializer.Serialize(map, JsonOpts), Encoding.UTF8);
        }
        catch { /* swallow */ }
    }

    /// <summary>
    /// 1:1-Sync nach web-localstorage — nutzt jetzt die neue Bridge.
    /// </summary>
    public void SyncWebLocalStorage()
    {
        try { WebLocalStorageBridge.Instance.SyncFromSettingsStore(); } catch { }
    }

    // =============================================================
    // Internals
    // =============================================================

    private void Load()
    {
        try
        {
            if (!File.Exists(_settingsPath))
            {
                _data = new SettingsRoot();
                return;
            }
            var raw = File.ReadAllText(_settingsPath, Encoding.UTF8);
            var loaded = JsonSerializer.Deserialize<SettingsRoot>(raw);
            _data = loaded ?? new SettingsRoot();
        }
        catch
        {
            _data = new SettingsRoot();
        }
    }

    private void Persist()
    {
        try
        {
            Directory.CreateDirectory(_appDataDir);
            File.WriteAllText(_settingsPath,
                JsonSerializer.Serialize(_data, JsonOpts), Encoding.UTF8);
            SyncWebLocalStorage();
            try { Changed?.Invoke(this, EventArgs.Empty); } catch { }
        }
        catch
        {
            // swallow: best effort
        }
    }

    private static readonly JsonSerializerOptions JsonOpts = new()
    {
        WriteIndented = true,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
    };
}

public sealed class SettingsRoot
{
    public bool IsDark { get; set; } = true;
    public string? ActiveCompanyId { get; set; } = "nordwind";
    public string? ActiveLevel { get; set; } = "2";
    public bool SidebarAppMode { get; set; } = false; // Default: WebApp-Sidebar (WPF collapsed)
    public string? ActiveTabId { get; set; }
    public List<OpenTab> OpenTabs { get; set; } = new();
    public List<CustomCompany> CustomCompanies { get; set; } = new();
    public string? LocalProfileName { get; set; } = "Stefan Kunc";
    public string? LocalProfileAvatar { get; set; }

    // ---- Bridge: alle 14 WebApp-Keys ----
    public string? GlobalApiKeys { get; set; }       // connect.global-api-keys
    public string? AgentApiKeys { get; set; }        // connect.agent-api-keys
    public string? ModelProvider { get; set; }       // connect.model-provider
    public string? VoiceSettings { get; set; }       // connect.voice-settings
    public bool KeepLoggedIn { get; set; } = true;   // connect.lab.prefs
    public int FocusTimerSeconds { get; set; } = 1500;     // connect.focus-timer
    public bool FocusTimerRunning { get; set; } = false;
    public DateTime? FocusTimerStartedAt { get; set; }
    public int FocusTimerSecondsAtStart { get; set; } = 1500;
    public string? AvatarOverrides { get; set; }     // connect.avatar.overrides

    // ---- Keyboard Shortcuts (alle editierbar über WebApp / Settings#shortcuts) ----
    // Format pro Shortcut: "Ctrl+B", "Ctrl+Shift+T", "F11", "Esc", "Alt+Left" — siehe ShortcutCombo.ToString/Parse.
    public string? ShortcutBrowser        { get; set; } = "Ctrl+B";
    public string? ShortcutBrowserMenu    { get; set; } = "Ctrl+M";
    public string? ShortcutBrowserFull    { get; set; } = "Ctrl+F";
    public string? ShortcutBrowserTab     { get; set; } = "Ctrl+Alt+T";
    public string? ShortcutTheme          { get; set; } = "Ctrl+T";
    public string? ShortcutSidebar        { get; set; } = "Ctrl+\\";
    public string? ShortcutSettings       { get; set; } = "Ctrl+,";
    public string? ShortcutFocusInput     { get; set; } = "Ctrl+I";
    public string? ShortcutNewChat        { get; set; } = "Ctrl+N";
    public string? ShortcutReload         { get; set; } = "Ctrl+R";
    public string? ShortcutEscape         { get; set; } = "Esc";
    public string? ShortcutHistoryBack    { get; set; } = "Alt+Left";
    public string? ShortcutHistoryForward { get; set; } = "Alt+Right";
}

public sealed class OpenTab
{
    public string Id { get; set; } = Guid.NewGuid().ToString("N");
    public string Url { get; set; } = "";
    public string Title { get; set; } = "";
    public string? Favicon { get; set; }
    public bool Pinned { get; set; }
}

public sealed class CustomCompany
{
    public string id { get; set; } = Guid.NewGuid().ToString("N").Substring(0, 8);
    public string name { get; set; } = "";
    public string description { get; set; } = "";
    public List<string> agentIds { get; set; } = new();
    public string accent { get; set; } = "linear-gradient(145deg, #0f766e 0%, #164e63 55%, #1e293b 100%)";
    public string? handle { get; set; }
    public string? logo { get; set; }
    public string? banner { get; set; }
    public string? category { get; set; }
    public string? location { get; set; }
    public string? website { get; set; }
}
