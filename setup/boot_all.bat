@echo off
setlocal
cd /d "%~dp0.."
if not defined FORMSLD_PORT set "FORMSLD_PORT=8197"
start "formsld backend" cmd /k "cd /d %cd%\backend && boot_backend.bat"
start "formsld frontend" cmd /k "cd /d %cd%\frontend && boot_frontend.bat"
echo [formsld] frontend http://localhost:5197 and backend http://127.0.0.1:%FORMSLD_PORT%
