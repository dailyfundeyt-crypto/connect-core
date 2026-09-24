using System.Collections.Generic;

namespace ConnectDesktop;

/// <summary>
/// Mirror of <c>app/src/lib/companies/projects.ts:AppKey</c> — the four
/// "app folder" types the Web Sidebar groups projects under. In WPF we
/// don't show real app logos (no embedded image assets) but we keep the
/// keys so projects seeded in the Web Sidebar's localStorage round-trip
/// back to here with the same identity.
/// </summary>
public enum AppKey
{
    Arc,
    Linear,
    Slack,
    Browser,
}

public static class AppKeys
{
    public static AppKey Parse(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw)) return AppKey.Arc;
        return raw.Trim().ToLowerInvariant() switch
        {
            "arc" => AppKey.Arc,
            "linear" => AppKey.Linear,
            "slack" => AppKey.Slack,
            "browser" => AppKey.Browser,
            _ => AppKey.Arc,
        };
    }

    public static string AsString(AppKey k) => k switch
    {
        AppKey.Arc => "arc",
        AppKey.Linear => "linear",
        AppKey.Slack => "slack",
        AppKey.Browser => "browser",
        _ => "arc",
    };

    public static string Label(AppKey k) => k switch
    {
        AppKey.Arc => "Arc",
        AppKey.Linear => "Linear",
        AppKey.Slack => "Slack",
        AppKey.Browser => "Browser",
        _ => "Arc",
    };

    /// <summary>Single-letter glyph used in the sidebar avatar tile.</summary>
    public static string Glyph(AppKey k) => k switch
    {
        AppKey.Arc => "A",
        AppKey.Linear => "L",
        AppKey.Slack => "S",
        AppKey.Browser => "B",
        _ => "?",
    };

    /// <summary>Hex background for the avatar tile (matches Web accent).</summary>
    public static string Accent(AppKey k) => k switch
    {
        AppKey.Arc => "#0EA5E9",
        AppKey.Linear => "#5E6AD2",
        AppKey.Slack => "#EAB308",
        AppKey.Browser => "#10B981",
        _ => "#475569",
    };
}

/// <summary>One "GRUPPE" tile in the Web Sidebar — backed by a <c>ConnectProject</c>.</summary>
public sealed class ConnectProject
{
    public string Id { get; set; } = "";
    public string CompanyId { get; set; } = "";
    public string Name { get; set; } = "";
    public string Description { get; set; } = "";
    public string Accent { get; set; } = "#0F766E";
    public string? LogoPath { get; set; }
    public AppKey AppFolder { get; set; } = AppKey.Arc;
    public List<string> AgentIds { get; set; } = new();
}

/// <summary>One company in the roster (Nordwind / Lumen / Helm / Pulse).</summary>
public sealed class ConnectCompany
{
    public string Id { get; set; } = "";
    public string Name { get; set; } = "";
    public string Handle { get; set; } = "";
    public string Description { get; set; } = "";
    public string Accent { get; set; } = "#0F766E";
    public string? LogoPath { get; set; }
    public List<string> AgentIds { get; set; } = new();
    public string? Category { get; set; }
    public string? Location { get; set; }
    public string? Website { get; set; }
}

/// <summary>One agent row in the sidebar's AGENTEN section.</summary>
public sealed class ConnectAgent
{
    public string Id { get; set; } = "";
    public string Name { get; set; } = "";
    public string Email { get; set; } = "";
    public string Role { get; set; } = "";
    public string? AvatarUrl { get; set; }
    public bool Online { get; set; }
    public string Accent { get; set; } = "#475569";

    /// <summary>Two-letter monogram, fallback when no avatar is set.</summary>
    public string Monogram
    {
        get
        {
            if (string.IsNullOrWhiteSpace(Name)) return "?";
            var parts = Name.Trim().Split(' ', 2);
            return parts.Length == 2
                ? $"{parts[0][0]}{parts[1][0]}".ToUpperInvariant()
                : parts[0][..Math.Min(2, parts[0].Length)].ToUpperInvariant();
        }
    }
}

/// <summary>One channel row in the sidebar's CHANNELS section.</summary>
public sealed class ConnectChannel
{
    public string Id { get; set; } = "";
    public string Name { get; set; } = "";
    public bool Pinned { get; set; }
    public string LastFromName { get; set; } = "";
    public bool LastFromOnline { get; set; }
    public string? LastPreview { get; set; }
    public string? ProjectId { get; set; }
}
