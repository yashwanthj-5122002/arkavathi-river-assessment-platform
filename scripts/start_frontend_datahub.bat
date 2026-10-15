@echo off
setlocal EnableExtensions
for %%I in ("%~dp0..") do set "PROJECT=%%~fI"
set "FRONTEND=%PROJECT%\frontend"

echo ==============================================================
echo  ARKAVATHI FRONTEND - DATA HUB v1.7
echo ==============================================================
echo Frontend : %FRONTEND%
echo URL      : http://127.0.0.1:8088
echo.
cd /d "%FRONTEND%" || exit /b 1
where npm >nul 2>nul || (
  echo [ERROR] npm was not found in PATH.
  pause
  exit /b 1
)
if not exist "node_modules" (
  echo Installing frontend packages...
  call npm install || (
    echo [ERROR] npm install failed.
    pause
    exit /b 1
  )
)
call npm run dev -- --host 0.0.0.0 --port 8088 --force
endlocal
