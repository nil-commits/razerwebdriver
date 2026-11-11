@echo off
title websynap.se v3.0 · Local Node.js Chroma Studio (http://localhost:5426)
cd /d "%~dp0"

set TOOLCHAIN_NODE=%~dp0..\toolchain\node-v24.22.2-win-x64\node.exe

if exist "%TOOLCHAIN_NODE%" (
    echo [websynap.se v3.0] Starting on http://localhost:5426 using workspace Node.js + WinUSB/HidUsb Native Bridge...
    "%TOOLCHAIN_NODE%" "%~dp0server.js"
) else (
    echo [websynap.se v3.0] Starting on http://localhost:5426 using system Node.js + WinUSB/HidUsb Native Bridge...
    node "%~dp0server.js"
)
pause
