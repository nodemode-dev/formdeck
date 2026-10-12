@echo off
setlocal
if not defined FORMDECK_CALLER_DIR set "FORMDECK_CALLER_DIR=%cd%"
cd /d "%~dp0.."
if not exist backend\venv\Scripts\activate.bat ( echo [formdeck] backend venv missing, run formdeck.bat install & exit /b 1 )
call backend\venv\Scripts\activate.bat
python setup\templates.py %*
exit /b %ERRORLEVEL%
