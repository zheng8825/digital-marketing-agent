@echo off
setlocal enabledelayedexpansion
title Marketing Agent - Update
cd /d "%~dp0"

echo Getting the latest version...
echo.

REM Stop a running instance first, so the new build is used next time.
if exist "%~dp0data\server.pid" (
  set "OLDPID="
  set /p OLDPID=<"%~dp0data\server.pid"
  if defined OLDPID taskkill /PID !OLDPID! /T /F >nul 2>nul
  del "%~dp0data\server.pid" >nul 2>nul
  del "%~dp0data\server.url" >nul 2>nul
)

if exist "%~dp0node\node.exe" set "PATH=%~dp0node;%PATH%"

git pull
if errorlevel 1 (
  echo. & echo  git pull failed. Resolve the issue above, then run this again.
  pause & exit /b 1
)

echo.
echo Done. Double-click start.bat (or the desktop shortcut) - it will rebuild
echo automatically the first time you launch this new version.
pause
