@echo off
setlocal EnableExtensions
for %%I in ("%~dp0..") do set "PROJECT=%%~fI"
set "BACKEND=%PROJECT%\backend"

echo ==============================================================
echo  ARKAVATHI BACKEND - MULTI-DEPARTMENT DATA HUB v1.7
echo ==============================================================
echo Project : %PROJECT%
echo Backend : %BACKEND%
echo.

cd /d "%BACKEND%" || (
  echo [ERROR] Could not open backend folder.
  pause
  exit /b 1
)

set "PYTHON_CMD="
py -3.10 --version >nul 2>&1 && set "PYTHON_CMD=py -3.10"
if not defined PYTHON_CMD py --version >nul 2>&1 && set "PYTHON_CMD=py"
if not defined PYTHON_CMD python --version >nul 2>&1 && set "PYTHON_CMD=python"
if not defined PYTHON_CMD (
  echo [ERROR] Python 3.10+ was not found.
  pause
  exit /b 1
)

set "ARKAVATHI_HOST=127.0.0.1"
set "ARKAVATHI_PORT=8765"

echo Starting Arkavathi API on http://127.0.0.1:8765
echo Module: %PYTHON_CMD% -m app.simple_server
echo Data Hub: Civil / GIS / Survey / LiDAR / Photogrammetry
echo.
%PYTHON_CMD% -m app.simple_server

if errorlevel 1 (
  echo.
  echo [ERROR] Arkavathi backend stopped with an error.
  pause
)
endlocal
