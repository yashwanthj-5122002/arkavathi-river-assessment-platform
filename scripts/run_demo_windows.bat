@echo off
setlocal EnableExtensions
color 0F
title Arkavathi Dashboard Launcher v1.2

echo ==============================================================
echo  ARKAVATHI RIVER PROJECT - ONE CLICK LAUNCHER v1.2
echo ==============================================================
echo.
echo V1.2 is compatible with Python 3.14 and does not install Pydantic.
echo It starts the Python backend, verifies it, then starts React.
echo.

where powershell >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Windows PowerShell is required for the startup health check.
  pause
  exit /b 1
)

start "Arkavathi Backend v1.2" cmd /k call "%~dp0start_backend.bat"

echo Waiting for backend at http://127.0.0.1:8765/health ...
for /L %%I in (1,1,45) do (
  powershell -NoProfile -ExecutionPolicy Bypass -Command "try { $j=Invoke-RestMethod -TimeoutSec 2 'http://127.0.0.1:8765/health'; if ($j.status -eq 'ok' -and $j.service -eq 'Arkavathi Survey GIS Dashboard API') { exit 0 } } catch {}; exit 1" >nul 2>&1
  if not errorlevel 1 goto :backend_ready
  timeout /t 2 /nobreak >nul
)

echo.
echo [ERROR] Backend did not become ready within 90 seconds.
echo Look at the "Arkavathi Backend v1.2" window for the exact error.
pause
exit /b 1

:backend_ready
echo [OK] Backend health check passed.
start "Arkavathi Frontend" cmd /k call "%~dp0start_frontend.bat"

echo Waiting for frontend at http://localhost:5173 ...
for /L %%I in (1,1,90) do (
  powershell -NoProfile -ExecutionPolicy Bypass -Command "try { $r=Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 'http://localhost:5173'; if ($r.StatusCode -ge 200 -and $r.StatusCode -lt 500) { exit 0 } } catch {}; exit 1" >nul 2>&1
  if not errorlevel 1 goto :frontend_ready
  timeout /t 2 /nobreak >nul
)

echo.
echo [ERROR] Frontend did not become ready within 3 minutes.
echo Look at the "Arkavathi Frontend" window for the exact error.
pause
exit /b 1

:frontend_ready
echo [OK] Frontend is ready.
echo Opening dashboard...
start "" "http://localhost:5173"
echo.
echo Dashboard: http://localhost:5173
echo Backend:   http://127.0.0.1:8765
echo API list:  http://127.0.0.1:8765/docs
echo.
echo Keep Backend and Frontend windows open while demonstrating.
timeout /t 5 /nobreak >nul
exit /b 0
