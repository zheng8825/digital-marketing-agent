' Creates a "Marketing Agent" shortcut on the Desktop, pointing at start.bat with the app icon.
' Run once (start.bat does this automatically on first launch). Safe to re-run.

Option Explicit
Dim sh, fso, root, desktop, iconPath, lnkPath, lnk
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
root = fso.GetParentFolderName(WScript.ScriptFullName)
desktop = sh.SpecialFolders("Desktop")

iconPath = root & "\build\icon.ico"
lnkPath = desktop & "\Marketing Agent.lnk"

Set lnk = sh.CreateShortcut(lnkPath)
lnk.TargetPath = root & "\start.bat"
lnk.WorkingDirectory = root
lnk.Description = "Marketing Agent"
lnk.WindowStyle = 7   ' run minimized (the heavy lifting runs hidden anyway)
If fso.FileExists(iconPath) Then lnk.IconLocation = iconPath
lnk.Save
