@echo off
setlocal EnableExtensions
color 0B
title Arkavathi LAN Frontend
cd /d "%~dp0..\frontend"

echo ==============================================================
echo  ARKAVATHI DASHBOARD - LAN FRONTEND
echo ==============================================================
echo Working directory: %CD%
echo LAN listen port: 8088
echo Backend is proxied internally to http://127.0.0.1:8765
echo.

where node >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Node.js was not found.
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
  echo Installing frontend packages...
  call npm install
  if errorlevel 1 goto :fail
)

echo Starting LAN frontend on 0.0.0.0:8088 ...
echo.
call npm run dev -- --host 0.0.0.0 --port 8088 --strictPort
if errorlevel 1 goto :fail
exit /b 0

:fail
echo.
echo [ERROR] LAN frontend failed to start.
echo If port 8088 is already in use, close the old Arkavathi/Vite window and retry.
pause
exit /b 1
