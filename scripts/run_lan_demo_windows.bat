@echo off
setlocal EnableExtensions
color 0F
title Arkavathi Organization LAN Launcher

echo ==============================================================
echo  ARKAVATHI RIVER PROJECT - ORGANIZATION LAN LAUNCHER
echo ==============================================================
echo.

start "Arkavathi Backend" cmd /k call "%~dp0start_backend.bat"

echo Waiting for backend at http://127.0.0.1:8765/health ...
for /L %%I in (1,1,45) do (
  powershell -NoProfile -ExecutionPolicy Bypass -Command "try { $j=Invoke-RestMethod -TimeoutSec 2 'http://127.0.0.1:8765/health'; if ($j.status -eq 'ok') { exit 0 } } catch {}; exit 1" >nul 2>&1
  if not errorlevel 1 goto :backend_ready
  timeout /t 2 /nobreak >nul
)

echo [ERROR] Backend did not become ready.
pause
exit /b 1

:backend_ready
echo [OK] Backend ready.
start "Arkavathi LAN Frontend" cmd /k call "%~dp0start_frontend_lan.bat"

echo Waiting for LAN frontend on port 8088 ...
for /L %%I in (1,1,60) do (
  powershell -NoProfile -ExecutionPolicy Bypass -Command "try { $r=Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 'http://127.0.0.1:8088'; if ($r.StatusCode -ge 200 -and $r.StatusCode -lt 500) { exit 0 } } catch {}; exit 1" >nul 2>&1
  if not errorlevel 1 goto :frontend_ready
  timeout /t 2 /nobreak >nul
)

echo [ERROR] LAN frontend did not become ready.
pause
exit /b 1

:frontend_ready
set LAN_IP=
for /f "usebackq delims=" %%A in (powershell -NoProfile -Command "$ip=(Get-NetIPConfiguration ^| Where-Object { $_.IPv4DefaultGateway -ne $null } ^| ForEach-Object { $_.IPv4Address.IPAddress } ^| Where-Object { $_ -and $_ -notlike '169.254*' } ^| Select-Object -First 1); if ($ip) { Write-Output $ip }") do set LAN_IP=%%A
if not defined LAN_IP set LAN_IP=192.168.10.81

set LAN_URL=http://%LAN_IP%:8088

echo.
echo ==============================================================
echo  ARKAVATHI LAN DASHBOARD READY
echo ==============================================================
echo Local URL : http://localhost:8088
echo Office URL: %LAN_URL%
echo Backend   : private on 127.0.0.1:8765
echo ==============================================================
echo.
echo Other PCs on the same office LAN should open:
echo %LAN_URL%
echo.
start "" "%LAN_URL%"
pause
