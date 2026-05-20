' Launches the Node server with NO visible window, so there's no console for the marketer to
' close by accident. Output is appended to data\server.log for troubleshooting.
' Arg 0 (optional): full path to node.exe; defaults to "node" on PATH.

Option Explicit
Dim sh, fso, root, nodeExe, logFile, q, cmd
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
root = fso.GetParentFolderName(WScript.ScriptFullName)

nodeExe = "node"
If WScript.Arguments.Count > 0 Then nodeExe = WScript.Arguments(0)

If Not fso.FolderExists(root & "\data") Then fso.CreateFolder(root & "\data")
logFile = root & "\data\server.log"

q = Chr(34)
' cmd /c "  "node.exe"  "...\index.cjs"  >> "...\server.log" 2>&1  "
cmd = "cmd /c " & q & q & nodeExe & q & " " & q & root & "\out\main\index.cjs" & q & _
      " >> " & q & logFile & q & " 2>&1" & q

' 0 = hidden window, False = don't wait.
sh.Run cmd, 0, False
