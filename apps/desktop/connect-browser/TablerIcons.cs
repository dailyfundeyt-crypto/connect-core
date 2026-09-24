using System.IO;
using System.Linq;
using System.Windows;
using System.Windows.Media;
using System.Xml;

namespace ConnectDesktop;

/// <summary>
/// Lädt Tabler-Icons (outline SVGs mit viewBox="0 0 24 24") als WPF-Geometrie.
/// Genutzt für Sidebar-Glyphs und Mode-Chips — identisches Aussehen zur Web-App.
/// </summary>
public static class TablerIcons
{
    public static Geometry Get(string name, double sizePx = 16)
    {
        var path = Path.Combine(AppContext.BaseDirectory, "Icons", $"{name}.svg");
        if (!File.Exists(path)) return Geometry.Empty;
        var d = ExtractSinglePathData(path);
        if (string.IsNullOrEmpty(d)) return Geometry.Empty;
        var g = Geometry.Parse(d);
        // Setze Transform auf scale: SVG viewBox 24×24 -> sizePx × sizePx
        var scale = sizePx / 24.0;
        g.Transform = new ScaleTransform(scale, scale);
        g.Freeze();
        return g;
    }

    /// <summary>Lädt das SVG und gibt alle Path-d-Attribute als kombiniertes Geometry zurück.</summary>
    public static Geometry GetCombined(string name, double sizePx = 16)
    {
        var path = Path.Combine(AppContext.BaseDirectory, "Icons", $"{name}.svg");
        if (!File.Exists(path)) return Geometry.Empty;
        var combined = "";
        try
        {
            var xml = new XmlDocument();
            xml.Load(path);
            foreach (XmlNode node in xml.GetElementsByTagName("path"))
            {
                var d = node.Attributes?["d"]?.Value;
                if (!string.IsNullOrEmpty(d))
                {
                    if (combined.Length > 0) combined += " ";
                    combined += d;
                }
            }
        }
        catch { return Geometry.Empty; }
        if (string.IsNullOrEmpty(combined)) return Geometry.Empty;
        var g = Geometry.Parse(combined);
        var scale = sizePx / 24.0;
        g.Transform = new ScaleTransform(scale, scale);
        g.Freeze();
        return g;
    }

    private static string? ExtractSinglePathData(string path)
    {
        try
        {
            var xml = new XmlDocument();
            xml.Load(path);
            return xml.GetElementsByTagName("path").OfType<XmlElement>().FirstOrDefault()?.GetAttribute("d");
        }
        catch { return null; }
    }
}
