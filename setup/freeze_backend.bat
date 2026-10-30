@echo off
setlocal
cd /d "%~dp0.."
set "ROOT=%cd%"
if not exist backend\venv\Scripts\activate.bat ( echo [formdeck] backend venv missing, run formdeck.bat install & exit /b 1 )
call backend\venv\Scripts\activate.bat
python -c "import PyInstaller" >nul 2>nul || ( echo [formdeck] PyInstaller missing, run formdeck.bat install-desktop & exit /b 1 )
set "TRIPLE="
if defined FORMDECK_TARGET ( set "TRIPLE=%FORMDECK_TARGET%" ) else ( for /f "tokens=2" %%t in ('rustc -vV 2^>nul ^| findstr /b "host:"') do set "TRIPLE=%%t" )
if not defined TRIPLE ( echo [formdeck] rustc not found, install Rust or set FORMDECK_TARGET & exit /b 1 )
if not exist frontend\dist\index.html ( call setup\build_frontend.bat || exit /b 1 )
set "FONTS="
if exist "%ROOT%\backend\app\fonts" set FONTS=--add-data "%ROOT%\backend\app\fonts;fonts"
cd backend
if exist build\pyinstaller rmdir /s /q build\pyinstaller
if exist dist-engine rmdir /s /q dist-engine
pyinstaller --noconfirm --clean --onefile --name formdeck-engine --distpath dist-engine --workpath build\pyinstaller --specpath build\pyinstaller --add-data "%ROOT%\frontend\dist;frontend_dist" --add-data "%ROOT%\addins;addins" --collect-submodules app --collect-submodules uvicorn --collect-all pptx --collect-all pdfplumber --hidden-import pypdfium2 --collect-all latex2mathml --add-data "%ROOT%\backend\app\services\odp\presets.json;app\services\odp" %FONTS% "%ROOT%\backend\formdeck_engine.py" || exit /b 1
if not exist "%ROOT%\src-tauri\binaries" mkdir "%ROOT%\src-tauri\binaries"
copy /y dist-engine\formdeck-engine.exe "%ROOT%\src-tauri\binaries\formdeck-engine-%TRIPLE%.exe" >nul || exit /b 1
"%ROOT%\src-tauri\binaries\formdeck-engine-%TRIPLE%.exe" --selfcheck || exit /b 1
echo [formdeck] sidecar ready: %ROOT%\src-tauri\binaries\formdeck-engine-%TRIPLE%.exe
