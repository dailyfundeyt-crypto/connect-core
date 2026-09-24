using System;
using System.Globalization;
using System.Windows;
using System.Windows.Data;

namespace ConnectDesktop;

/// <summary>
/// Boolean → Visibility. true=Visible, false=Collapsed (nicht Hidden — Hidden würde Platz freihalten).
/// </summary>
public sealed class BoolToVisibleConverter : IValueConverter
{
    public object Convert(object? value, Type targetType, object? parameter, CultureInfo culture)
    {
        return value is bool b && b ? Visibility.Visible : Visibility.Collapsed;
    }

    public object ConvertBack(object? value, Type targetType, object? parameter, CultureInfo culture)
    {
        return value is Visibility v && v == Visibility.Visible;
    }
}

/// <summary>
/// Invertierter BoolToVisibleConverter: true → Collapsed, false → Visible.
/// </summary>
public sealed class BoolToHiddenConverter : IValueConverter
{
    public object Convert(object? value, Type targetType, object? parameter, CultureInfo culture)
    {
        return value is bool b && b ? Visibility.Collapsed : Visibility.Visible;
    }

    public object ConvertBack(object? value, Type targetType, object? parameter, CultureInfo culture)
    {
        return value is Visibility v && v == Visibility.Collapsed;
    }
}
