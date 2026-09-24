using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace ConnectDesktop;

/// <summary>
/// Bidirektionale Brücke zwischen WPF und der Connect-WebApp.
///
/// <para>
/// Die WebApp läuft im Chromium-Renderer (WebView2). Sie speichert alle
/// Settings in <c>window.localStorage</c>. WPF kann diese Werte lesen und
/// schreiben — und zwar über einen einzigen lokalen Datei-Spool, der mit
/// <see cref="SettingsStore"/> (WPF-Settings) synchronisiert wird.
/// </para>
///
/// <para><b>Architektur</b>:</para>
/// <code>
/// WPF-Settings.json                web-localstorage.json (gespiegelt)
///     |                                    |
///     +--&gt; SettingsStore.IsDark ---------&gt; "connect-theme"
///                  ActiveCompanyId --------&gt; "connect.activeCompanyId"
///                  ApiKeys --------&gt; "connect.global-api-keys"
///                  ... + alle 14 Keys
/// </code>
///
/// <para>
/// WPF -&gt; WebView2 wird über <see cref="WebLocalStorageInjector"/> gepusht:
/// Bei jedem Sync injiziert ein <c>init-script</c> alle Keys via
/// <c>localStorage.setItem</c>, BEVOR die WebApp ihr eigenes JS startet.
/// </para>
/// </summary>
public sealed class WebLocalStorageBridge
{
    public static WebLocalStorageBridge Instance { get; } = new();

    private readonly object _lock = new();
    private string _appDataDir;
    private string _webLocalStoragePath;

    private WebLocalStorageBridge()
    {
        _appDataDir = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "ConnectDesktop");
        _webLocalStoragePath = Path.Combine(_appDataDir, "web-localstorage.json");
        Directory.CreateDirectory(_appDataDir);
    }

    public string WebLocalStoragePath => _webLocalStoragePath;

    // =============================================================
    // Key catalog (14 keys) — matched mit der WebApp-LocalStorage
    // =============================================================

    public static class Keys
    {
        public const string Theme                  = "connect-theme";           // "dark" | "light"
        public const string CustomCompanies        = "connect.companies.custom";
        public const string ActiveCompanyId        = "connect.activeCompanyId";
        public const string LocalProfile           = "connect.local-profile";
        public const string AgentApiKeys           = "connect.agent-api-keys";
        public const string AgentCodexKeySource    = "connect.agent-codex-key-source";
        public const string GlobalApiKeys          = "connect.global-api-keys";
        public const string ModelProvider          = "connect.model-provider";
        public const string VoiceSettings          = "connect.voice-settings";
        public const string LabPrefs               = "connect.lab.prefs";
        public const string FocusTimer             = "connect.focus-timer";
        public const string Donations              = "connect.donations.blue-check";
        public const string Level3Browser          = "connect.level3.browser";
        public const string ActiveLevel            = "connect.activeLevel";
        public const string AvatarOverrides        = "connect.avatar.overrides";
        public const string KeyboardShortcuts      = "connect.shortcuts";       // { id: combo-string }
    }

    // =============================================================
    // Read/Write (single-key API)
    // =============================================================

    public string? Get(string key)
    {
        lock (_lock)
        {
            try
            {
                if (!File.Exists(_webLocalStoragePath)) return null;
                var raw = File.ReadAllText(_webLocalStoragePath, Encoding.UTF8);
                if (string.IsNullOrWhiteSpace(raw)) return null;
                var map = JsonSerializer.Deserialize<Dictionary<string, string>>(raw);
                return map?.GetValueOrDefault(key);
            }
            catch { return null; }
        }
    }

    public T? Get<T>(string key) where T : class
    {
        var raw = Get(key);
        if (string.IsNullOrEmpty(raw)) return null;
        try { return JsonSerializer.Deserialize<T>(raw, JsonOpts); }
        catch { return null; }
    }

    public void Set(string key, string? value)
    {
        lock (_lock)
        {
            try
            {
                Dictionary<string, string> map = LoadMap();
                if (value == null) map.Remove(key);
                else map[key] = value;
                SaveMap(map);
            }
            catch { /* best-effort */ }
        }
    }

    public void Set<T>(string key, T? value)
    {
        if (value == null) Set(key, (string?)null);
        else Set(key, JsonSerializer.Serialize(value, JsonOpts));
    }

    public Dictionary<string, string> LoadAll()
    {
        lock (_lock) return LoadMap();
    }

    public void SetAll(Dictionary<string, string> map)
    {
        lock (_lock) SaveMap(map);
    }

    // =============================================================
    // Bulk sync: WPF SettingsStore -&gt; WebApp-LocalStorage
    // =============================================================

    /// <summary>
    /// Spiegelt den aktuellen WPF-SettingsStore in den Web-LocalStorage-Spool.
    /// Wird bei App-Start, bei jedem Settings-Property-Set, und nach jeder
    /// WebApp-Initialisierung einmal aufgerufen.
    /// </summary>
    public void SyncFromSettingsStore()
    {
        try
        {
            var settings = SettingsStore.Instance;

            // Theme
            Set(Keys.Theme, settings.IsDark ? "dark" : "light");

            // Active company
            Set(Keys.ActiveCompanyId, settings.ActiveCompanyId);

            // Active level
            Set(Keys.ActiveLevel, settings.ActiveLevel);

            // Local profile
            Set(Keys.LocalProfile, JsonSerializer.Serialize(new
            {
                name = settings.LocalProfileName ?? "",
                avatarUrl = settings.LocalProfileAvatar ?? "",
            }));

            // Custom companies
            var customJson = JsonSerializer.Serialize(
                settings.CustomCompanies.Select(c => new
                {
                    c.id, c.name, c.description, c.agentIds, c.accent,
                    handle = c.handle ?? "", logo = c.logo ?? "",
                    banner = c.banner ?? "", category = c.category ?? "",
                    location = c.location ?? "", website = c.website ?? "",
                }));
            Set(Keys.CustomCompanies, customJson);

            // API-Keys, Model-Provider, Voice — nur synchronisieren wenn nicht null
            if (settings.GlobalApiKeys != null) Set(Keys.GlobalApiKeys, settings.GlobalApiKeys);
            if (settings.AgentApiKeys != null)   Set(Keys.AgentApiKeys, settings.AgentApiKeys);
            if (settings.ModelProvider != null)  Set(Keys.ModelProvider, settings.ModelProvider);
            if (settings.VoiceSettings != null)  Set(Keys.VoiceSettings, settings.VoiceSettings);

            // Lab prefs
            Set(Keys.LabPrefs, JsonSerializer.Serialize(new { keepLoggedIn = settings.KeepLoggedIn }));

            // Focus timer
            Set(Keys.FocusTimer, JsonSerializer.Serialize(new
            {
                seconds = settings.FocusTimerSeconds,
                running = settings.FocusTimerRunning,
                startedAt = settings.FocusTimerStartedAt is { } s
                    ? s.ToString("O") : "",
                secondsAtStart = settings.FocusTimerSecondsAtStart,
            }));

            // Avatar overrides (Record&lt;string, string&gt;)
            if (settings.AvatarOverrides != null)
                Set(Keys.AvatarOverrides, settings.AvatarOverrides);

            // Keyboard shortcuts — Map { shortcut-id → combo-string }
            // Wir lesen die aktuellen Werte aus den individual Properties und spiegeln
            // sie als JSON-Map in die LocalStorage-Bridge. Damit sieht der Settings-Editor
            // in der WebApp die gleichen Tastenkürzel wie WPF selbst.
            var shortcuts = new Dictionary<string, string>();
            foreach (var entry in ShortcutRegistry.All)
            {
                var combo = ShortcutRegistry.GetCombo(entry.Id, settings);
                if (!string.IsNullOrWhiteSpace(combo))
                    shortcuts[entry.Id] = combo;
            }
            Set(Keys.KeyboardShortcuts, JsonSerializer.Serialize(shortcuts, JsonOpts));
        }
        catch (Exception)
        {
            // best-effort
        }
    }

    // =============================================================
    // Init-script: LocalStorage PRE-POPULATION für WebView2
    // =============================================================

    /// <summary>
    /// Liefert ein JavaScript-Snippet, das beim Start jedes WebView2 die
    /// Werte aus dem Bridge-Spool in <c>localStorage</c> injiziert.
    /// </summary>
    public string BuildInitScript()
    {
        var map = LoadAll();
        var sb = new StringBuilder();
        sb.AppendLine("// Injected by Connect Desktop Bridge — do not edit");
        sb.AppendLine("(function(){try{");
        foreach (var kv in map)
        {
            if (string.IsNullOrEmpty(kv.Value)) continue;
            var esc = kv.Value
                .Replace("\\", "\\\\")
                .Replace("\"", "\\\"")
                .Replace("\r", "\\r")
                .Replace("\n", "\\n");
            sb.AppendLine($"  localStorage.setItem({JsonSerializer.Serialize(kv.Key)}, \"{esc}\");");
        }
        sb.AppendLine("}catch(e){console.error('[Bridge]',e)}})();");
        return sb.ToString();
    }

    // =============================================================
    // Internals
    // =============================================================

    private static readonly JsonSerializerOptions JsonOpts = new()
    {
        WriteIndented = false,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
    };

    private Dictionary<string, string> LoadMap()
    {
        try
        {
            if (!File.Exists(_webLocalStoragePath)) return new();
            var raw = File.ReadAllText(_webLocalStoragePath, Encoding.UTF8);
            if (string.IsNullOrWhiteSpace(raw)) return new();
            return JsonSerializer.Deserialize<Dictionary<string, string>>(raw) ?? new();
        }
        catch
        {
            return new();
        }
    }

    private void SaveMap(Dictionary<string, string> map)
    {
        Directory.CreateDirectory(_appDataDir);
        File.WriteAllText(_webLocalStoragePath,
            JsonSerializer.Serialize(map, JsonOpts), Encoding.UTF8);
    }
}
