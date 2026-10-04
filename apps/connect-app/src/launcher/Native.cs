using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Runtime.InteropServices.ComTypes;
using System.Text;

namespace ConnectApp;

internal static class Native
{
    [DllImport("shell32.dll", CharSet = CharSet.Unicode)]
    public static extern int SetCurrentProcessExplicitAppUserModelID(string appId);

    private delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
    [DllImport("user32.dll")] private static extern bool EnumWindows(EnumWindowsProc cb, IntPtr lParam);
    [DllImport("user32.dll")] private static extern bool IsWindowVisible(IntPtr hWnd);
    [DllImport("user32.dll")] private static extern bool IsIconic(IntPtr hWnd);
    [DllImport("user32.dll")] private static extern IntPtr GetWindow(IntPtr hWnd, uint cmd);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern int GetWindowText(IntPtr hWnd, StringBuilder s, int n);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern int GetClassName(IntPtr hWnd, StringBuilder s, int n);
    [DllImport("user32.dll")] private static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);
    [DllImport("user32.dll")] private static extern bool ShowWindow(IntPtr hWnd, int cmd);
    [DllImport("user32.dll")] private static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")] private static extern bool PostMessage(IntPtr hWnd, uint msg, IntPtr w, IntPtr l);
    [DllImport("user32.dll")] private static extern IntPtr SendMessageTimeout(IntPtr hWnd, uint msg, IntPtr w, IntPtr l, uint flags, uint timeout, out IntPtr result);
    [DllImport("user32.dll")] public static extern int GetSystemMetrics(int index);

    [DllImport("kernel32.dll", SetLastError = true)] private static extern IntPtr OpenProcess(uint access, bool inherit, uint pid);
    [DllImport("kernel32.dll", SetLastError = true)] private static extern bool CloseHandle(IntPtr h);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern bool QueryFullProcessImageName(IntPtr h, uint flags, StringBuilder name, ref uint size);

    [DllImport("shell32.dll")] private static extern int SHGetPropertyStoreForWindow(IntPtr hwnd, ref Guid riid, out IPropertyStore store);
    [DllImport("ole32.dll")] private static extern int PropVariantClear(ref PROPVARIANT pv);

    public record WindowInfo(IntPtr Handle, uint Pid, string Title);

    public static string? ProcessPath(int pid)
    {
        var h = OpenProcess(0x1000 /*QUERY_LIMITED_INFORMATION*/, false, (uint)pid);
        if (h == IntPtr.Zero) return null;
        try
        {
            var sb = new StringBuilder(1024); uint n = (uint)sb.Capacity;
            return QueryFullProcessImageName(h, 0, sb, ref n) ? sb.ToString() : null;
        }
        finally { CloseHandle(h); }
    }

    /// <summary>Prozesse eines bestimmten Executables (exakter Pfadvergleich), z.B. nur das gebuendelte Helium.</summary>
    public static List<Process> ProcessesOf(string exePath)
    {
        var name = Path.GetFileNameWithoutExtension(exePath);
        var result = new List<Process>();
        foreach (var p in Process.GetProcessesByName(name))
        {
            var path = ProcessPath(p.Id);
            if (path != null && string.Equals(Path.GetFullPath(path), Path.GetFullPath(exePath), StringComparison.OrdinalIgnoreCase)) result.Add(p);
            else p.Dispose();
        }
        return result;
    }

    /// <summary>Sichtbare Top-Level-Fenster (Chrome_WidgetWin_1, mit Titel) der angegebenen Prozesse.</summary>
    public static List<WindowInfo> TopWindows(HashSet<uint> pids)
    {
        var list = new List<WindowInfo>();
        if (pids.Count == 0) return list;
        EnumWindows((h, _) =>
        {
            if (!IsWindowVisible(h) || GetWindow(h, 4 /*GW_OWNER*/) != IntPtr.Zero) return true;
            GetWindowThreadProcessId(h, out var pid);
            if (!pids.Contains(pid)) return true;
            var cls = new StringBuilder(64); GetClassName(h, cls, 64);
            if (cls.ToString() != "Chrome_WidgetWin_1") return true;
            var t = new StringBuilder(512); GetWindowText(h, t, 512);
            if (t.Length > 0) list.Add(new WindowInfo(h, pid, t.ToString()));
            return true;
        }, IntPtr.Zero);
        return list;
    }

    public static void Focus(IntPtr hwnd)
    {
        if (IsIconic(hwnd)) ShowWindow(hwnd, 9 /*SW_RESTORE*/);
        SetForegroundWindow(hwnd);
    }

    public static void Close(IntPtr hwnd) => PostMessage(hwnd, 0x0010 /*WM_CLOSE*/, IntPtr.Zero, IntPtr.Zero);

    public static IntPtr GetIcon(IntPtr hwnd, int which)
    {
        SendMessageTimeout(hwnd, 0x007F /*WM_GETICON*/, (IntPtr)which, IntPtr.Zero, 0x0002, 300, out var r);
        return r;
    }

    public static void SetIcon(IntPtr hwnd, int which, IntPtr hIcon) =>
        SendMessageTimeout(hwnd, 0x0080 /*WM_SETICON*/, (IntPtr)which, hIcon, 0x0002, 300, out _);

    // ---- AppUserModelID / Taskleisten-Identitaet -------------------------------------------------
    private static readonly Guid AppUserModelFmtId = new("9F4C2855-9F79-4B39-A8D0-E1D42DE1D5F3");
    public static PROPERTYKEY PKeyId => new() { fmtid = AppUserModelFmtId, pid = 5 };
    public static PROPERTYKEY PKeyRelaunchCommand => new() { fmtid = AppUserModelFmtId, pid = 2 };
    public static PROPERTYKEY PKeyRelaunchIcon => new() { fmtid = AppUserModelFmtId, pid = 3 };
    public static PROPERTYKEY PKeyRelaunchName => new() { fmtid = AppUserModelFmtId, pid = 4 };

    public static string? GetWindowAppId(IntPtr hwnd)
    {
        var iid = typeof(IPropertyStore).GUID;
        if (SHGetPropertyStoreForWindow(hwnd, ref iid, out var store) != 0 || store == null) return null;
        try { return GetString(store, PKeyId); }
        finally { Marshal.ReleaseComObject(store); }
    }

    /// <summary>Gibt dem (fremden) Helium-Fenster die AppUserModelID der Connect App, damit Windows es
    /// als eigene App gruppiert, mit eigenem Icon/Namen und "Anheften" auf Connect.exe zeigt.</summary>
    public static bool SetWindowAppId(IntPtr hwnd, string appId, string relaunchCommand, string relaunchName, string relaunchIcon)
    {
        var iid = typeof(IPropertyStore).GUID;
        if (SHGetPropertyStoreForWindow(hwnd, ref iid, out var store) != 0 || store == null) return false;
        try
        {
            SetString(store, PKeyRelaunchCommand, relaunchCommand);
            SetString(store, PKeyRelaunchName, relaunchName);
            SetString(store, PKeyRelaunchIcon, relaunchIcon);
            SetString(store, PKeyId, appId);
            return store.Commit() == 0;
        }
        finally { Marshal.ReleaseComObject(store); }
    }

    public static string? GetString(IPropertyStore store, PROPERTYKEY key)
    {
        if (store.GetValue(ref key, out var pv) != 0) return null;
        try { return pv.vt == 31 /*VT_LPWSTR*/ ? Marshal.PtrToStringUni(pv.p) : null; }
        finally { PropVariantClear(ref pv); }
    }

    public static void SetString(IPropertyStore store, PROPERTYKEY key, string value)
    {
        var pv = new PROPVARIANT { vt = 31, p = Marshal.StringToCoTaskMemUni(value) };
        try { Marshal.ThrowExceptionForHR(store.SetValue(ref key, ref pv)); }
        finally { PropVariantClear(ref pv); }
    }
}

[StructLayout(LayoutKind.Sequential, Pack = 4)]
internal struct PROPERTYKEY { public Guid fmtid; public uint pid; }

[StructLayout(LayoutKind.Explicit, Size = 24)]
internal struct PROPVARIANT { [FieldOffset(0)] public ushort vt; [FieldOffset(8)] public IntPtr p; }

[ComImport, Guid("886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
internal interface IPropertyStore
{
    [PreserveSig] int GetCount(out uint count);
    [PreserveSig] int GetAt(uint index, out PROPERTYKEY key);
    [PreserveSig] int GetValue(ref PROPERTYKEY key, out PROPVARIANT pv);
    [PreserveSig] int SetValue(ref PROPERTYKEY key, ref PROPVARIANT pv);
    [PreserveSig] int Commit();
}

[ComImport, Guid("00021401-0000-0000-C000-000000000046")]
internal class CShellLink { }

[ComImport, InterfaceType(ComInterfaceType.InterfaceIsIUnknown), Guid("000214F9-0000-0000-C000-000000000046")]
internal interface IShellLinkW
{
    void GetPath([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder file, int cch, IntPtr fd, uint flags);
    void GetIDList(out IntPtr pidl);
    void SetIDList(IntPtr pidl);
    void GetDescription([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder name, int cch);
    void SetDescription([MarshalAs(UnmanagedType.LPWStr)] string name);
    void GetWorkingDirectory([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder dir, int cch);
    void SetWorkingDirectory([MarshalAs(UnmanagedType.LPWStr)] string dir);
    void GetArguments([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder args, int cch);
    void SetArguments([MarshalAs(UnmanagedType.LPWStr)] string args);
    void GetHotkey(out short hotkey);
    void SetHotkey(short hotkey);
    void GetShowCmd(out int cmd);
    void SetShowCmd(int cmd);
    void GetIconLocation([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder path, int cch, out int index);
    void SetIconLocation([MarshalAs(UnmanagedType.LPWStr)] string path, int index);
    void SetRelativePath([MarshalAs(UnmanagedType.LPWStr)] string path, uint reserved);
    void Resolve(IntPtr hwnd, uint flags);
    void SetPath([MarshalAs(UnmanagedType.LPWStr)] string file);
}

internal static class Shortcuts
{
    public static void Install(AppPaths p)
    {
        Create(p.DesktopShortcut, p);
        Directory.CreateDirectory(Path.GetDirectoryName(p.StartMenuShortcut)!);
        Create(p.StartMenuShortcut, p);
    }

    public static void Remove(AppPaths p)
    {
        foreach (var f in new[] { p.DesktopShortcut, p.StartMenuShortcut }) if (File.Exists(f)) File.Delete(f);
    }

    private static void Create(string lnkPath, AppPaths p)
    {
        var link = (IShellLinkW)new CShellLink();
        try
        {
            link.SetPath(p.ExePath);
            link.SetWorkingDirectory(p.AppDir);
            link.SetDescription("Connect App - Connect mit eigenem lokalen Backend (Helium-Shell)");
            var ico = Path.Combine(p.AppDir, "connect-app.ico");
            link.SetIconLocation(File.Exists(ico) ? ico : p.ExePath, 0);
            var store = (IPropertyStore)link;
            Native.SetString(store, Native.PKeyId, Program.AppUserModelId);
            Marshal.ThrowExceptionForHR(store.Commit());
            ((IPersistFile)link).Save(lnkPath, true);
            Log.Write("Verknuepfung geschrieben: " + lnkPath);
        }
        finally { Marshal.ReleaseComObject(link); }
    }
}
