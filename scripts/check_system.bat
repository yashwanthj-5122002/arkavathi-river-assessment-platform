@echo off
setlocal EnableExtensions
color 0E
title Arkavathi Dashboard Diagnostics

echo ==============================================================
echo  ARKAVATHI DASHBOARD - CONNECTION CHECK
echo ==============================================================
echo.

echo [1] Python backend health
powershell -NoProfile -ExecutionPolicy Bypass -Command "try { $r=Invoke-WebRequest -UseBasicParsing -TimeoutSec 4 'http://127.0.0.1:8765/health'; Write-Host ('PASS  HTTP ' + $r.StatusCode + '  ' + $r.Content); exit 0 } catch { Write-Host ('FAIL  ' + $_.Exception.Message); exit 1 }"
echo.

echo [2] Summary API
powershell -NoProfile -ExecutionPolicy Bypass -Command "try { $r=Invoke-WebRequest -UseBasicParsing -TimeoutSec 4 'http://127.0.0.1:8765/api/v1/summary'; Write-Host ('PASS  HTTP ' + $r.StatusCode); exit 0 } catch { Write-Host ('FAIL  ' + $_.Exception.Message); exit 1 }"
echo.

echo [3] React frontend
powershell -NoProfile -ExecutionPolicy Bypass -Command "try { $r=Invoke-WebRequest -UseBasicParsing -TimeoutSec 4 'http://localhost:5173'; Write-Host ('PASS  HTTP ' + $r.StatusCode); exit 0 } catch { Write-Host ('FAIL  ' + $_.Exception.Message); exit 1 }"
echo.

echo If backend is FAIL, run start_backend.bat and keep its window open.
echo If frontend is FAIL, run start_frontend.bat after backend passes.
echo.
pause
