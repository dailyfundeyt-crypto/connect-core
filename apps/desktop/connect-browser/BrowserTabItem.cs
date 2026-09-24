using System;
using System.ComponentModel;
using System.Windows.Media;

namespace ConnectDesktop;

/// <summary>
/// Display model for a browser tab in the strip. Tracks title, URL,
/// and whether the tab is currently loading (drives the spinner).
/// </summary>
public sealed class BrowserTabItem : INotifyPropertyChanged
{
    private string _id = "";
    private string _title = "";
    private string _url = "";
    private bool _isLoading;
    private string _favicon = "🌐";

    public string Id { get => _id; set => Set(ref _id, value); }
    public string Title { get => _title; set => Set(ref _title, value); }
    public string Url { get => _url; set => Set(ref _url, value); }
    public bool IsLoading { get => _isLoading; set => Set(ref _isLoading, value); }
    public string Favicon { get => _favicon; set => Set(ref _favicon, value); }

    public event PropertyChangedEventHandler? PropertyChanged;
    private void Set<T>(ref T field, T value, [System.Runtime.CompilerServices.CallerMemberName] string? name = null)
    {
        if (Equals(field, value)) return;
        field = value;
        PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(name ?? string.Empty));
    }
}
