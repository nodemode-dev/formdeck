@echo off
setlocal EnableExtensions
cd /d "%~dp0"
set "OPEN=0"
for %%A in (%*) do (
  if /i "%%~A"=="--open" ( set "OPEN=1" ) else if /i "%%~A"=="--help" ( goto :usage ) else if /i "%%~A"=="-h" ( goto :usage ) else ( call :usage & exit /b 2 )
)

echo.
echo [formdeck] == checking the tools
where python >nul 2>nul || ( echo [formdeck] Python 3.12 or newer is needed: https://www.python.org/downloads/ & exit /b 1 )
where node >nul 2>nul || ( echo [formdeck] Node 20.19 or newer is needed: https://nodejs.org & exit /b 1 )
where cargo >nul 2>nul || ( echo [formdeck] Rust is needed: https://rustup.rs & exit /b 1 )

echo.
echo [formdeck] == installing the engine and the window
call setup\install_all.bat || goto :failed

echo.
echo [formdeck] == installing the desktop packages and checking the Tauri toolchain
call setup\install_desktop.bat || goto :failed

echo.
echo [formdeck] == building the window, freezing the engine and building the desktop app
echo [formdeck] the first build compiles several hundred Rust crates
call setup\desktop_build.bat || goto :failed

echo.
echo [formdeck] done. The installers are in src-tauri\target\release\bundle (msi and nsis)
if "%OPEN%"=="1" start "" "src-tauri\target\release\bundle"
exit /b 0

:failed
echo.
echo [formdeck] the build stopped at the step above; fix what it says and run build_app.bat again
exit /b 1

:usage
echo build_app.bat           build formdeck's desktop app on Windows, start to finish
echo   --open                open the folder with the installers when the build is done
exit /b 0
