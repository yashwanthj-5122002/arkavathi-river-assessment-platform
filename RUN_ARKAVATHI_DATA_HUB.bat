@echo off
setlocal
cd /d "%~dp0"
start "Arkavathi Backend V1.7" cmd /k call "%~dp0scripts\start_backend.bat"
timeout /t 3 /nobreak >nul
start "Arkavathi Frontend V1.7" cmd /k call "%~dp0scripts\start_frontend_datahub.bat"
endlocal
