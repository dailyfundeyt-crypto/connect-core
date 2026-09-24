using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Windows;
using System.Windows.Media;
using System.Windows.Media.Imaging;

namespace ConnectDesktop;

/// <summary>
/// Generiert die zwei Sidebar-Spezial-Icons aus der Web-App 1:1.
///
/// <list type="bullet">
///   <item>
///     <b>AppleFolderIcon</b> — Sky-blue gradient (#7ec8f5 → #3b9de0) mit 2×2 Avatar-Collage
///     drin (siehe app/src/components/companies/company-app-folders-nav.tsx → AppleFolderIcon).
///   </item>
///   <item>
///     <b>ChannelAvatar</b> — Stack/Cluster von Avataren je nach Participant-Count
///     (siehe app/src/components/channels/avatar.tsx).
///   </item>
/// </list>
/// </summary>
public static class SidebarAvatarRenderer
{
    // Web-Tokens — identisch zu app/src/components/channels/avatar.tsx
    private static readonly Color FolderTop   = FromHex("#7ec8f5");
    private static readonly Color FolderBottom = FromHex("#3b9de0");
    private static readonly Color FolderRing = FromHex("#000000").WithAlpha(0.10);
    private static readonly Color TileWhite = FromHex("#FFFFFF").WithAlpha(0.50);
    private static readonly Color EmptyTileWhite = FromHex("#FFFFFF").WithAlpha(0.35);

    // Mock-Avatare für die Seed-Bots:
    public static readonly string[] SeedBotNames =
    {
        "Benjamin", "Christopher", "Olivia",
        "Sophia", "Liam", "Mia", "Ava", "Noah",
    };
    public static readonly string[] SeedBotSeedHex =
    {
        "#10B981", "#3B82F6", "#EC4899", "#A78BFA",
        "#F59E0B", "#06B6D4", "#84CC16", "#EF4444",
    };

    /// <summary>Sky-blue Apple-Folder mit 2×2 Avatar-Collage.</summary>
    public static ImageSource RenderAppleFolder(string[] agentSeeds, int sizePx = 36)
    {
        var dv = new DrawingVisual();
        using (var dc = dv.RenderOpen())
        {
            // Outer squircle — gradient fill
            var rect = new Rect(0, 0, sizePx, sizePx);
            var radius = sizePx * 0.28;
            dc.DrawRoundedRectangle(
                new LinearGradientBrush(FolderTop, FolderBottom, 90.0),
                new Pen(new SolidColorBrush(FolderRing), 1.0),
                rect, radius, radius);

            // Inner grid: 2 cols × 2 rows with 2px gap, inside 3px insets
            var ins = sizePx * 0.10;
            var innerGap = sizePx * 0.07;
            var innerRadius = sizePx * 0.20;
            var inner = new Rect(ins, ins, sizePx - 2 * ins, sizePx - 2 * ins);
            var colW = inner.Width / 2 - innerGap / 2;
            var rowH = inner.Height / 2 - innerGap / 2;

            // White overlay
            dc.DrawRoundedRectangle(
                new SolidColorBrush(TileWhite),
                null,
                inner, innerRadius, innerRadius);

            // Avatar tiles
            for (int i = 0; i < 4; i++)
            {
                int row = i / 2;
                int col = i % 2;
                var tile = new Rect(
                    inner.X + col * (colW + innerGap),
                    inner.Y + row * (rowH + innerGap),
                    colW, rowH);
                dc.DrawRoundedRectangle(
                    agentSeeds.Length > i
                        ? new SolidColorBrush(FromHex(agentSeeds[i]))
                        : new SolidColorBrush(EmptyTileWhite),
                    null,
                    tile, innerRadius * 0.45, innerRadius * 0.45);
            }
        }

        return VisualToBitmap(dv, sizePx, sizePx);
    }

    /// <summary>
    /// Channel-Avatar wie web <c>channels/avatar.tsx</c>:
    /// <list type="bullet">
    ///   <item>Single-Agent: runder Badge mit Initial (z.B. "B" für Benjamin), agent-Tint-Hintergrund.</item>
    ///   <item>Multi-Agent: überlappende Stack-Avatare mit Initialen + weißem Ring.</item>
    /// </list>
    /// </summary>
    public static ImageSource RenderChannelAvatar(string[] agents, int sizePx = 32)
    {
        if (agents.Length == 0)
            return RenderSingleChannel("?", "#475569", sizePx);
        if (agents.Length == 1)
            return RenderSingleChannel(InitialFor(agents[0]), agents[0], sizePx);
        return RenderStackedChannel(agents.Take(3).ToArray(), sizePx);
    }

    private static ImageSource RenderSingleChannel(string initial, string hexOrSeed, int sizePx)
    {
        var dv = new DrawingVisual();
        using (var dc = dv.RenderOpen())
        {
            var rect = new Rect(0, 0, sizePx, sizePx);
            // Hintergrundfarbe aus Hex, fallback auf seed
            var bg = IsHexColor(hexOrSeed) ? FromHex(hexOrSeed) : FromHex(SeedFromName(hexOrSeed));
            dc.DrawEllipse(
                new SolidColorBrush(bg),
                new Pen(new SolidColorBrush(FromHex("#000000").WithAlpha(0.05)), 1.0),
                new Point(sizePx / 2.0, sizePx / 2.0),
                sizePx / 2.0 - 0.5, sizePx / 2.0 - 0.5);

            // Initial als weißer Text in der Mitte
            if (!string.IsNullOrEmpty(initial))
            {
                var ft = MakeText(initial, sizePx * 0.55, FontWeights.SemiBold, Colors.White);
                var textPos = new Point((sizePx - ft.Width) / 2.0, (sizePx - ft.Height) / 2.0 - 1.0);
                dc.DrawText(ft, textPos);
            }
        }
        return VisualToBitmap(dv, sizePx, sizePx);
    }

    private static ImageSource RenderStackedChannel(string[] agents, int sizePx)
    {
        var dv = new DrawingVisual();
        using (var dc = dv.RenderOpen())
        {
            int n = agents.Length;
            double eachSize = n switch { 2 => sizePx * 0.65, _ => sizePx * 0.55 };
            double overlap = n switch { 2 => -sizePx * 0.18, _ => -sizePx * 0.10 };

            // Sidebar-Background für weißen Ring
            var ring = FromHex("#FFFFFF").WithAlpha(0.65);
            var ringBlack = FromHex("#000000").WithAlpha(0.10);

            for (int i = 0; i < n; i++)
            {
                var seed = agents[i];
                var x = i * (sizePx - eachSize + overlap) + (sizePx - eachSize) / 2.0 * 0;
                var y = (sizePx - eachSize) / 2.0;
                var r = new Rect(x, y, eachSize, eachSize);

                // Inner ring (white) für Stacking-Effekt
                dc.DrawEllipse(
                    new SolidColorBrush(ring),
                    null,
                    new Point(r.X + r.Width / 2.0, r.Y + r.Height / 2.0),
                    r.Width / 2.0 + 1, r.Height / 2.0 + 1);

                var bg = IsHexColor(seed) ? FromHex(seed) : FromHex(SeedFromName(seed));
                dc.DrawEllipse(
                    new SolidColorBrush(bg),
                    new Pen(new SolidColorBrush(ringBlack), 1.0),
                    new Point(r.X + r.Width / 2.0, r.Y + r.Height / 2.0),
                    r.Width / 2.0 - 0.5, r.Height / 2.0 - 0.5);

                // Initial
                var initial = InitialFor(seed);
                var ft = MakeText(initial, eachSize * 0.5, FontWeights.SemiBold, Colors.White);
                dc.DrawText(ft, new Point(
                    r.X + (r.Width - ft.Width) / 2.0,
                    r.Y + (r.Height - ft.Height) / 2.0 - 1.0));
            }
        }
        return VisualToBitmap(dv, sizePx, sizePx);
    }

    private static FormattedText MakeText(string text, double size, FontWeight weight, Color color)
    {
        return new FormattedText(
            text ?? "",
            System.Globalization.CultureInfo.InvariantCulture,
            FlowDirection.LeftToRight,
            new Typeface(new FontFamily("Inter"), FontStyles.Normal, weight, FontStretches.Normal),
            size,
            new SolidColorBrush(color),
            1.0);
    }

    private static string InitialFor(string seed)
    {
        // seed ist agent-name oder hex. Wenn Hex → kein Name → "?" als Fallback.
        if (string.IsNullOrEmpty(seed)) return "?";
        if (IsHexColor(seed)) return "?";
        return seed.Substring(0, 1).ToUpperInvariant();
    }

    private static bool IsHexColor(string s)
    {
        if (string.IsNullOrEmpty(s)) return false;
        return s.StartsWith("#") && s.Length >= 7;
    }

    /// <summary>Fallback-Farbe für einen Agent-Seed (deterministische Tint aus Name).</summary>
    private static string SeedFromName(string name)
    {
        // Wir haben eine kleine Palette — verteile nach Hash.
        var palette = new[] {
            "#10B981", "#3B82F6", "#EC4899", "#F59E0B", "#8B5CF6",
            "#06B6D4", "#EF4444", "#84CC16", "#14B8A6", "#A78BFA",
        };
        int hash = 0;
        foreach (var c in name) hash = (hash * 31 + c) & 0x7fffffff;
        return palette[hash % palette.Length];
    }

    private static BitmapSource VisualToBitmap(DrawingVisual dv, int w, int h)
    {
        var rtb = new RenderTargetBitmap(w, h, 96.0, 96.0, PixelFormats.Pbgra32);
        rtb.Render(dv);
        rtb.Freeze();
        return rtb;
    }

    private static Color FromHex(string hex)
    {
        hex = hex.TrimStart('#');
        if (hex.Length == 6) hex = "FF" + hex;
        return Color.FromArgb(
            (byte)int.Parse(hex.Substring(0, 2), NumberStyles.HexNumber),
            (byte)int.Parse(hex.Substring(2, 2), NumberStyles.HexNumber),
            (byte)int.Parse(hex.Substring(4, 2), NumberStyles.HexNumber),
            (byte)int.Parse(hex.Substring(6, 2), NumberStyles.HexNumber));
    }
}

internal static class ColorExt
{
    public static Color WithAlpha(this Color c, double a) =>
        Color.FromArgb((byte)(255 * a), c.R, c.G, c.B);
}
