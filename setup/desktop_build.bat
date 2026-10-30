@echo off
setlocal
cd /d "%~dp0.."
set "FD_NEXT="
for %%A in (%*) do call :scan "%%~A"
call setup\build_frontend.bat || exit /b 1
call setup\freeze_backend.bat || exit /b 1
if not exist src-tauri\icons\icon.ico call frontend\node_modules\.bin\tauri.cmd icon assets\formdeck_icon.png
call frontend\node_modules\.bin\tauri.cmd build %* || exit /b 1
echo [formdeck] bundles are in src-tauri\target\release\bundle
exit /b 0
:scan
if defined FD_NEXT ( set "FORMDECK_TARGET=%~1" & set "FD_NEXT=" & exit /b 0 )
if /i "%~1"=="--target" set "FD_NEXT=1"
exit /b 0
