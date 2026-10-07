@echo off
setlocal
cd /d "%~dp0"
if not exist venv\Scripts\activate.bat ( echo [formsld] backend venv missing, run formsld.bat install & exit /b 1 )
call venv\Scripts\activate.bat
if not defined FORMSLD_HOST set "FORMSLD_HOST=127.0.0.1"
if not defined FORMSLD_PORT set "FORMSLD_PORT=8197"
uvicorn app.main:app --reload --host %FORMSLD_HOST% --port %FORMSLD_PORT%
