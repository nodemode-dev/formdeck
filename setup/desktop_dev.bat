@echo off
setlocal
cd /d "%~dp0.."
set "TRIPLE="
if defined FORMSLD_TARGET ( set "TRIPLE=%FORMSLD_TARGET%" ) else ( for /f "tokens=2" %%t in ('rustc -vV 2^>nul ^| findstr /b "host:"') do set "TRIPLE=%%t" )
if not defined TRIPLE ( echo [formsld] rustc not found, run formsld.bat install-desktop & exit /b 1 )
if not exist "src-tauri\binaries\formsld-engine-%TRIPLE%.exe" ( call setup\freeze_backend.bat || exit /b 1 )
call frontend\node_modules\.bin\tauri.cmd dev %*
