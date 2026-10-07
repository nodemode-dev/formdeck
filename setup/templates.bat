@echo off
setlocal
if not defined FORMSLD_CALLER_DIR set "FORMSLD_CALLER_DIR=%cd%"
cd /d "%~dp0.."
if not exist backend\venv\Scripts\activate.bat ( echo [formsld] backend venv missing, run formsld.bat install & exit /b 1 )
call backend\venv\Scripts\activate.bat
python setup\templates.py %*
exit /b %ERRORLEVEL%
