@echo off
title Razer Local Web Driver (Zero-Internet / Zero-Bloat)
cd /d "%~dp0"

set TOOLCHAIN_NODE=%~dp0..\toolchain\node-v24.22.2-win-x64\node.exe

if exist "%TOOLCHAIN_NODE%" (
    echo [Razer Local Web Driver] Starting on http://127.0.0.1:5426 using workspace Node.js + Native HID.node...
    "%TOOLCHAIN_NODE%" "%~dp0server.js"
) else (
    echo [Razer Local Web Driver] Starting on http://127.0.0.1:5426 using system Node.js + Native HID.node...
    node "%~dp0server.js"
)
pause
