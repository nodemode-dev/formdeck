@echo off
setlocal
cd /d "%~dp0.."
for %%p in (frontend\dist backend\build backend\dist-engine src-tauri\target src-tauri\gen) do if exist %%p rmdir /s /q %%p
for /d /r backend %%d in (__pycache__) do if exist "%%d" rmdir /s /q "%%d"
del /q src-tauri\binaries\formdeck-engine-* 2>nul
del /q src-tauri\binaries\formsld-engine-* 2>nul
if /i "%~1"=="--all" for %%p in (frontend\node_modules backend\venv) do if exist %%p rmdir /s /q %%p
echo [formdeck] clean
