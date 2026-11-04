# Create a .lnk shortcut with full Unicode support (IShellLinkW).
# WScript.Shell goes through the system ANSI code page and fails on Chinese names/paths on non-Chinese Windows.
# Usage: powershell -NoProfile -ExecutionPolicy Bypass -File shortcut.ps1 <lnk> <target> [arguments] [workdir] [icon]
param([string]$Lnk, [string]$Target, [string]$Arguments = '', [string]$WorkDir = '', [string]$Icon = '')
if (-not ('EciLnk' -as [type])) {
Add-Type -TypeDefinition @"
using System; using System.Runtime.InteropServices; using System.Text;
[ComImport, Guid("00021401-0000-0000-C000-000000000046")] class CShellLink {}
[ComImport, InterfaceType(ComInterfaceType.InterfaceIsIUnknown), Guid("000214F9-0000-0000-C000-000000000046")]
interface IShellLinkW {
  void GetPath([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder f, int c, IntPtr fd, uint fl);
  void GetIDList(out IntPtr p); void SetIDList(IntPtr p);
  void GetDescription([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder s, int c);
  void SetDescription([MarshalAs(UnmanagedType.LPWStr)] string s);
  void GetWorkingDirectory([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder s, int c);
  void SetWorkingDirectory([MarshalAs(UnmanagedType.LPWStr)] string s);
  void GetArguments([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder s, int c);
  void SetArguments([MarshalAs(UnmanagedType.LPWStr)] string s);
  void GetHotkey(out short h); void SetHotkey(short h);
  void GetShowCmd(out int i); void SetShowCmd(int i);
  void GetIconLocation([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder s, int c, out int i);
  void SetIconLocation([MarshalAs(UnmanagedType.LPWStr)] string s, int i);
  void SetRelativePath([MarshalAs(UnmanagedType.LPWStr)] string s, uint r);
  void Resolve(IntPtr h, uint f);
  void SetPath([MarshalAs(UnmanagedType.LPWStr)] string s);
}
[ComImport, InterfaceType(ComInterfaceType.InterfaceIsIUnknown), Guid("0000010b-0000-0000-C000-000000000046")]
interface IPersistFile {
  void GetClassID(out Guid g); [PreserveSig] int IsDirty();
  void Load([MarshalAs(UnmanagedType.LPWStr)] string f, uint m);
  void Save([MarshalAs(UnmanagedType.LPWStr)] string f, bool r);
  void SaveCompleted([MarshalAs(UnmanagedType.LPWStr)] string f);
  void GetCurFile([MarshalAs(UnmanagedType.LPWStr)] out string f);
}
public static class EciLnk {
  public static void Make(string lnk, string target, string args, string dir, string icon) {
    var l = (IShellLinkW)new CShellLink();
    l.SetPath(target); l.SetArguments(args ?? ""); l.SetWorkingDirectory(dir ?? "");
    if (!string.IsNullOrEmpty(icon)) l.SetIconLocation(icon, 0);
    ((IPersistFile)l).Save(lnk, true);
  }
}
"@
}
if (-not $WorkDir) { $WorkDir = Split-Path -Parent $Target }
[EciLnk]::Make($Lnk, $Target, $Arguments, $WorkDir, $Icon)
