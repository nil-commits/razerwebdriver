@echo off
setlocal
title Razer Local Web Driver (http://localhost:5426)
cd /d "%~dp0"

set "NODE_EXE="
where node >nul 2>nul
if %ERRORLEVEL% EQU 0 (
    set "NODE_EXE=node"
) else if exist "C:\Program Files\nodejs\node.exe" (
    set "NODE_EXE=C:\Program Files\nodejs\node.exe"
) else if exist "%LOCALAPPDATA%\Programs\nodejs\node.exe" (
    set "NODE_EXE=%LOCALAPPDATA%\Programs\nodejs\node.exe"
)

if "%NODE_EXE%"=="" (
    echo [Error] Node.js was not found. Please install Node.js LTS from https://nodejs.org/
    pause
    exit /b 1
)

if /I not "%~1"=="--no-browser" (
    echo [Razer Local Web Driver] Opening http://localhost:5426 ...
    start "" "http://localhost:5426"
)

:watchdog_loop
"%NODE_EXE%" "%~dp0server.js" %*
if %ERRORLEVEL% EQU 0 goto :eof

echo.
echo [Watchdog] server.js exited unexpectedly (code %ERRORLEVEL%). Restarting in 2 seconds...
timeout /t 2 /nobreak >nul
goto :watchdog_loop
