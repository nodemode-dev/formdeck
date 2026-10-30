@echo off
setlocal
cd /d "%~dp0.."
if not exist frontend\dist\index.html ( call setup\build_frontend.bat || exit /b 1 )
set "FORMDECK_DIST=%cd%\frontend\dist"
cd backend
if not exist venv\Scripts\activate.bat ( echo [formdeck] backend venv missing, run formdeck.bat install & exit /b 1 )
call venv\Scripts\activate.bat
if not defined FORMDECK_HOST set "FORMDECK_HOST=127.0.0.1"
if not defined FORMDECK_PORT set "FORMDECK_PORT=8197"
echo [formdeck] serving http://%FORMDECK_HOST%:%FORMDECK_PORT%
uvicorn app.main:app --host %FORMDECK_HOST% --port %FORMDECK_PORT%
