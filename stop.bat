@echo off
setlocal enabledelayedexpansion
title Marketing Agent - Stop
cd /d "%~dp0"

set "PIDFILE=%~dp0data\server.pid"

if not exist "%PIDFILE%" (
  echo Marketing Agent does not appear to be running.
  echo ^(Closing the browser tab doesn't stop it - this is how you stop it.^)
  timeout /t 3 >nul
  exit /b 0
)

set "OLDPID="
set /p OLDPID=<"%PIDFILE%"
if not defined OLDPID (
  echo Could not read the running process id. Nothing to stop.
  del "%PIDFILE%" >nul 2>nul
  timeout /t 3 >nul
  exit /b 0
)

echo Stopping Marketing Agent ^(and anything it started^)...
taskkill /PID %OLDPID% /T /F >nul 2>nul
del "%PIDFILE%" >nul 2>nul
del "%~dp0data\server.url" >nul 2>nul
echo Stopped. You can close this window.
timeout /t 2 >nul
exit /b 0
