@echo off
setlocal EnableExtensions
color 0B
title Arkavathi Frontend - React
cd /d "%~dp0..\frontend"

echo ==============================================================
echo  ARKAVATHI DASHBOARD - FRONTEND
echo ==============================================================
echo Working directory: %CD%
echo.

where node >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Node.js was not found.
  echo Install Node.js 20 LTS or newer and restart Command Prompt.
  pause
  exit /b 1
)
where npm >nul 2>&1
if errorlevel 1 (
  echo [ERROR] npm was not found.
  pause
  exit /b 1
)

if not exist "node_modules\.bin\vite.cmd" (
  echo [1/2] Installing frontend packages. First run may take a few minutes...
  if exist "package-lock.json" (
    call npm ci
  ) else (
    call npm install
  )
  if errorlevel 1 goto :fail
) else (
  echo [1/2] Frontend packages already installed.
)

echo [2/2] Starting React/Vite on http://localhost:5173
echo Backend expected at http://127.0.0.1:8765
echo.
call npm run dev -- --host 0.0.0.0 --port 5173
if errorlevel 1 goto :fail
exit /b 0

:fail
echo.
echo [ERROR] Frontend failed to start. Keep this window open and read the error above.
pause
exit /b 1
