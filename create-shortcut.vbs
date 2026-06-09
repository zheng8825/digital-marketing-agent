' Creates Desktop shortcuts for the app: "Marketing Agent" (start.bat, brain logo) and
' "Stop Marketing Agent" (stop.bat, red stop icon). Run once (start.bat does this automatically on
' first launch). Safe to re-run — it overwrites the shortcuts in place.

Option Explicit
Dim sh, fso, root, desktop, startIcon, stopIcon, lnk
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
root = fso.GetParentFolderName(WScript.ScriptFullName)
desktop = sh.SpecialFolders("Desktop")

startIcon = root & "\build\icon.ico"
stopIcon = root & "\build\stop.ico"

' --- Start ---
Set lnk = sh.CreateShortcut(desktop & "\Marketing Agent.lnk")
lnk.TargetPath = root & "\start.bat"
lnk.WorkingDirectory = root
lnk.Description = "Start the Marketing Agent"
lnk.WindowStyle = 7   ' run minimized (the heavy lifting runs hidden anyway)
If fso.FileExists(startIcon) Then lnk.IconLocation = startIcon
lnk.Save

' --- Stop ---
Set lnk = sh.CreateShortcut(desktop & "\Stop Marketing Agent.lnk")
lnk.TargetPath = root & "\stop.bat"
lnk.WorkingDirectory = root
lnk.Description = "Stop the Marketing Agent"
lnk.WindowStyle = 7
If fso.FileExists(stopIcon) Then lnk.IconLocation = stopIcon
lnk.Save
