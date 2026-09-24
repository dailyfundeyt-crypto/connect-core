using System;
using System.Globalization;
using System.Linq;
using System.Windows;
using System.Windows.Media;

namespace ConnectDesktop;

/// <summary>
/// Verbindet die WPF-Optik 1:1 mit der Connect-Web-CSS (app/src/styles.css).
///
/// - Light-Mode-Tokens aus `:root { ... }` (oklch-converted to sRGB).
/// - Dark-Mode-Tokens aus `.dark { ... }` (oklch-converted to sRGB).
/// - Browser-Pane: echtes Schwarz #000000 (Dark) / Weiß #FFFFFF (Light).
/// - Sidebar: zinc-cream (Light) / zinc-anthrazit (Dark).
///
/// Tokens werden im Window geladen via <see cref="ThemeService.Apply"/>.
/// </summary>
public sealed class ThemeService
{
    public static bool IsDark { get; private set; } = true;

    public static readonly ThemePalette Light = BuildLight();
    public static readonly ThemePalette Dark = BuildDark();

    public static ThemePalette Current => IsDark ? Dark : Light;

    /// <summary>Eingabe aus localStorage["connect-theme"] oder default dark.</summary>
    public static void InitializeFromStorage()
    {
        var dir = System.IO.Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "ConnectDesktop");
        var path = System.IO.Path.Combine(dir, "theme.txt");
        if (System.IO.File.Exists(path))
        {
            var value = (System.IO.File.ReadAllText(path).Trim() ?? "").ToLowerInvariant();
            IsDark = value == "dark";
        }
    }

    public static void PersistToStorage()
    {
        var dir = System.IO.Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "ConnectDesktop");
        System.IO.Directory.CreateDirectory(dir);
        System.IO.File.WriteAllText(System.IO.Path.Combine(dir, "theme.txt"),
            IsDark ? "dark" : "light");
    }

    public static void Toggle()
    {
        IsDark = !IsDark;
        PersistToStorage();
        ApplyToMainWindow();
    }

    public static void ApplyToMainWindow()
    {
        foreach (var w in Application.Current.Windows.OfType<MainWindow>())
        {
            w.ApplyTheme(Current);
        }
    }

    // ============ Tokendefinition (manuell aus app/src/styles.css übersetzt) ============

    private static ThemePalette BuildLight()
    {
        var p = new ThemePalette { IsDark = false };
        // :root aus styles.css (oklch → sRGB ungefähr konvertiert):
        p.Background         = C("#FFFFFF");
        p.Foreground         = C("#2E2E2E");
        p.SidebarBg          = C("#F1F2F4");
        p.SidebarFg          = C("#333333");
        p.SidebarFgMuted     = C("#71717A");
        p.SidebarFgSofter    = C("#A1A1AA");
        p.SidebarAccent      = C("#E5E7EA");
        p.SidebarAccentFg    = C("#2E2E2E");
        p.SidebarBorder      = C("#E1E3E6");
        p.SidebarRowHover    = C("#E5E7EA");
        p.SidebarRowActive   = C("#DCE0E5");
        p.BrowserPaneBg      = C("#FFFFFF");
        p.ToolbarBg          = C("#FFFFFF");
        p.InputBg            = C("#FFFFFF");
        p.ButtonFg           = C("#2E2E2E");
        p.StatusBarBg        = C("#F1F2F4");
        p.StatusFg           = C("#71717A");
        p.Border             = C("#E1E3E6");
        // Action-Akzent: --primary oklch(0.22 0 0) = #383838
        p.Primary            = C("#383838");
        p.PrimaryFg          = C("#FAFAFA");
        return p;
    }

    private static ThemePalette BuildDark()
    {
        var p = new ThemePalette { IsDark = true };
        // .dark aus styles.css:
        p.Background         = C("#000000");
        p.Foreground         = C("#FAFAFA");
        p.SidebarBg          = C("#0F172A");  // oklch(0.165 0.004 260) ≈ dunkles Zinc
        p.SidebarFg          = C("#F4F4F5");
        p.SidebarFgMuted     = C("#71717A");
        p.SidebarFgSofter    = C("#A1A1AA");
        p.SidebarAccent      = C("#1F2937");  // oklch(0.24 0.008 260) ≈ Zinc-800
        p.SidebarAccentFg    = C("#FAFAFA");
        p.SidebarBorder      = C("#1F2937");
        p.SidebarRowHover    = C("#1F2937");
        p.SidebarRowActive   = C("#1E1B4B");
        p.BrowserPaneBg      = C("#000000");  // ECHTES SCHWARZ
        p.ToolbarBg          = C("#0F172A");
        p.InputBg            = C("#0F172A");
        p.ButtonFg           = C("#E4E4E7");
        p.StatusBarBg        = C("#0F172A");
        p.StatusFg           = C("#A1A1AA");
        p.Border             = C("#1F2937");
        // --primary: oklch(0.922 0 0) = #EAEAEA (light text in dark mode)
        p.Primary            = C("#EAEAEA");
        p.PrimaryFg          = C("#0A0A0A");
        return p;
    }

    private static SolidColorBrush C(string hex) => new(FromHex(hex));
    private static Color FromHex(string hex)
    {
        hex = hex.TrimStart('#');
        if (hex.Length == 6) hex = "FF" + hex;
        return Color.FromArgb(
            (byte)int.Parse(hex.Substring(0, 2), System.Globalization.NumberStyles.HexNumber),
            (byte)int.Parse(hex.Substring(2, 2), System.Globalization.NumberStyles.HexNumber),
            (byte)int.Parse(hex.Substring(4, 2), System.Globalization.NumberStyles.HexNumber),
            (byte)int.Parse(hex.Substring(6, 2), System.Globalization.NumberStyles.HexNumber));
    }
}

public sealed class ThemePalette
{
    public bool IsDark;
    // Window
    public SolidColorBrush Background = Brushes.Black;
    public SolidColorBrush Foreground = Brushes.White;
    public SolidColorBrush Border     = Brushes.Gray;
    public SolidColorBrush StatusBarBg = Brushes.Black;
    public SolidColorBrush StatusFg   = Brushes.Gray;

    // Sidebar
    public SolidColorBrush SidebarBg       = Brushes.Black;
    public SolidColorBrush SidebarFg       = Brushes.White;
    public SolidColorBrush SidebarFgMuted  = Brushes.Gray;
    public SolidColorBrush SidebarFgSofter = Brushes.Gray;
    public SolidColorBrush SidebarAccent   = Brushes.Gray;
    public SolidColorBrush SidebarAccentFg = Brushes.White;
    public SolidColorBrush SidebarBorder   = Brushes.Gray;
    public SolidColorBrush SidebarRowHover  = Brushes.Gray;
    public SolidColorBrush SidebarRowActive = Brushes.Gray;

    // Browser pane / toolbar
    public SolidColorBrush BrowserPaneBg = Brushes.Black;
    public SolidColorBrush ToolbarBg     = Brushes.Black;
    public SolidColorBrush InputBg       = Brushes.Black;
    public SolidColorBrush ButtonFg      = Brushes.White;

    // Primary CTA
    public SolidColorBrush Primary       = Brushes.White;
    public SolidColorBrush PrimaryFg     = Brushes.Black;
}
