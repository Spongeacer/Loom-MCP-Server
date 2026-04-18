@echo off
setlocal enabledelayedexpansion

for /f "delims=" %%i in ('where node 2^>nul') do (
    set "NODE_BIN=%%i"
    goto :found
)

:found
if "!NODE_BIN!"=="" (
    echo [LOOM] Error: node is required but not found in PATH.
    exit /b 1
)

"!NODE_BIN!" "%~dp0packages\loom-cli\dist\cli.js" %*
