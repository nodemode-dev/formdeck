@echo off
setlocal
cd /d "%~dp0.."
if not defined FORMDECK_PORT set "FORMDECK_PORT=8197"
start "formdeck backend" cmd /k "cd /d %cd%\backend && boot_backend.bat"
start "formdeck frontend" cmd /k "cd /d %cd%\frontend && boot_frontend.bat"
echo [formdeck] frontend http://localhost:5197 and backend http://127.0.0.1:%FORMDECK_PORT%
