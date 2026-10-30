@echo off
setlocal
cd /d "%~dp0"
set "PY="
python -c "import sys; raise SystemExit(0 if sys.version_info >= (3, 12) else 1)" >nul 2>nul && set "PY=python"
if not defined PY py -3 -c "import sys; raise SystemExit(0 if sys.version_info >= (3, 12) else 1)" >nul 2>nul && set "PY=py -3"
if not defined PY ( echo [formdeck] Python 3.12 or newer is required & exit /b 1 )
if not exist venv ( %PY% -m venv venv || exit /b 1 )
call venv\Scripts\activate.bat
python -m pip install --upgrade pip || exit /b 1
pip install -r requirements.txt || exit /b 1
