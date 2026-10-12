@echo off
setlocal
cd /d "%~dp0"
if not exist venv\Scripts\activate.bat ( echo [formdeck] backend venv missing, run formdeck.bat install & exit /b 1 )
call venv\Scripts\activate.bat
if not defined FORMDECK_HOST if defined FORMSLD_HOST set "FORMDECK_HOST=%FORMSLD_HOST%"
if not defined FORMDECK_PORT if defined FORMSLD_PORT set "FORMDECK_PORT=%FORMSLD_PORT%"
if not defined FORMDECK_HOST set "FORMDECK_HOST=127.0.0.1"
if not defined FORMDECK_PORT set "FORMDECK_PORT=8197"
uvicorn app.main:app --reload --host %FORMDECK_HOST% --port %FORMDECK_PORT%
