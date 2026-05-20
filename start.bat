@echo off
setlocal enabledelayedexpansion
title Marketing Agent
cd /d "%~dp0"

set "ROOT=%~dp0"
set "PIDFILE=%ROOT%data\server.pid"
set "URLFILE=%ROOT%data\server.url"

REM --- Already running? Just re-open it (don't start a second copy). -------------
if exist "%PIDFILE%" (
  set "OLDPID="
  set /p OLDPID=<"%PIDFILE%"
  if defined OLDPID (
    tasklist /FI "PID eq !OLDPID!" 2>nul | find "!OLDPID!" >nul
    if !errorlevel!==0 (
      set "OLDURL=http://127.0.0.1:8731"
      if exist "%URLFILE%" set /p OLDURL=<"%URLFILE%"
      echo Marketing Agent is already running - opening it in your browser...
      start "" "!OLDURL!"
      exit /b 0
    )
  )
)

echo ============================================
echo   Marketing Agent  -  starting up...
echo ============================================
echo.

REM --- 1. Find Node.js -----------------------------------------------------------
REM Prefer Node on the system PATH; otherwise use a portable copy in ".\node".
set "NODE_EXE="
where node >nul 2>nul
if %errorlevel%==0 (
  for /f "delims=" %%i in ('where node') do if not defined NODE_EXE set "NODE_EXE=%%i"
  echo Using the Node.js already on this PC.
) else if exist "%ROOT%node\node.exe" (
  set "NODE_EXE=%ROOT%node\node.exe"
  set "PATH=%ROOT%node;%PATH%"
  echo Using the bundled Node.js in the "node" folder.
) else (
  echo.
  echo  Node.js was not found on this computer.
  echo    Option A: install Node.js LTS from  https://nodejs.org
  echo    Option B: put a portable Node into a "node" folder next to this file
  echo              ^(so that  node\node.exe  exists^), then run this again.
  echo.
  pause
  exit /b 1
)
echo.

REM --- 2. Decide whether we must (re)install / (re)build -------------------------
REM Rebuild when there's no build yet, or when the checked-out code changed (git).
set "STAMP=%ROOT%out\.build-commit"
set "CURCOMMIT="
for /f "delims=" %%i in ('git rev-parse HEAD 2^>nul') do set "CURCOMMIT=%%i"

set "NEEDBUILD="
if not exist "%ROOT%out\main\index.cjs" set "NEEDBUILD=1"
if defined CURCOMMIT (
  set "OLDCOMMIT="
  if exist "%STAMP%" set /p OLDCOMMIT=<"%STAMP%"
  if not "!OLDCOMMIT!"=="!CURCOMMIT!" set "NEEDBUILD=1"
)

if not exist "%ROOT%node_modules" set "NEEDINSTALL=1"
if defined NEEDBUILD set "NEEDINSTALL=1"

if defined NEEDINSTALL (
  echo Installing local dependencies ^(may take a few minutes the first time^)...
  call npm install
  if errorlevel 1 (
    echo. & echo  Dependency install failed. Check your internet connection and try again.
    pause & exit /b 1
  )
  echo.
)

if defined NEEDBUILD (
  echo Building the app ^(first run / after an update^)...
  call npm run build
  if errorlevel 1 (
    echo. & echo  Build failed. See the messages above.
    pause & exit /b 1
  )
  echo.
)
REM Record which commit we built, so the next launch only rebuilds after a real update.
REM (Leading-redirect form avoids a hash ending in a digit being parsed as "1>"/"2>".)
if defined NEEDBUILD if defined CURCOMMIT >"%STAMP%" echo !CURCOMMIT!

REM --- 3. Make a desktop shortcut once (nice icon, feels like an app) ------------
if not exist "%ROOT%data\.shortcut-done" (
  if not exist "%ROOT%data" mkdir "%ROOT%data"
  wscript.exe //nologo "%ROOT%create-shortcut.vbs" >nul 2>nul
  > "%ROOT%data\.shortcut-done" echo done
)

REM --- 4. Launch the server hidden (no console to accidentally close) ------------
REM The server keeps running in the background and opens your browser. To stop it,
REM double-click stop.bat (or use the desktop shortcut's folder).
echo Starting the agent. Your browser will open in a moment...
wscript.exe //nologo "%ROOT%launch-hidden.vbs" "%NODE_EXE%"

REM Give the server a second to come up and open the browser, then close this window.
timeout /t 2 >nul
exit /b 0
