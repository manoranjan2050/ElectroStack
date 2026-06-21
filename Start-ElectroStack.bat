@echo off
setlocal EnableExtensions

set "PROJECT_DIR=%~dp0"
set "STACK_ROOT=C:\ElectroStack"

title ElectroStack Launcher
cd /d "%PROJECT_DIR%"

echo.
echo ========================================
echo  ElectroStack Launcher
echo ========================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js was not found. Install Node.js 20 or newer, then run this file again.
  pause
  exit /b 1
)

where cargo >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Rust/Cargo was not found. Install Rust stable, then run this file again.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo [1/3] Installing npm dependencies...
  call npm.cmd install
  if errorlevel 1 (
    echo [ERROR] npm install failed.
    pause
    exit /b 1
  )
) else (
  echo [1/3] npm dependencies already installed.
)

if not exist "%STACK_ROOT%\config" (
  echo [2/3] Installing local stack to %STACK_ROOT%...
  echo This step may ask for Administrator permission and needs internet on first run.
  powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process PowerShell -Verb RunAs -Wait -ArgumentList '-NoProfile -ExecutionPolicy Bypass -File ""%PROJECT_DIR%scripts\install-stack.ps1""'"
  if errorlevel 1 (
    echo [ERROR] Stack installation failed or was cancelled.
    pause
    exit /b 1
  )
) else (
  echo [2/3] Local stack already exists at %STACK_ROOT%.
)

echo [2/3] Repairing local runtime layout...
powershell -NoProfile -ExecutionPolicy Bypass -File "%PROJECT_DIR%scripts\repair-stack.ps1"
if errorlevel 1 (
  echo [WARN] Runtime repair did not complete. ElectroStack will still start, but some services may remain missing.
)

echo [3/3] Starting ElectroStack desktop app...
echo.
call npm.cmd run tauri:dev

echo.
echo ElectroStack stopped.
pause
