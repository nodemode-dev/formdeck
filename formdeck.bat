@echo off
setlocal
set "FORMDECK_CALLER_DIR=%cd%"
for %%k in (PORT HOST DATA_DIR TARGET DIST CORS_ORIGINS MCP_AUTOSTART) do call :legacy %%k
cd /d "%~dp0"
set "CMD=%~1"
set "ARG=%~2"
set "REST="
set "REST2="
set "SEEN=0"
:collect
shift
if "%~1"=="" goto :dispatch
set REST=%REST% %1
if "%SEEN%"=="1" set REST2=%REST2% %1
set "SEEN=1"
goto :collect
:dispatch
if "%CMD%"=="" set "CMD=boot"
if /i "%CMD%"=="boot" ( call setup\boot_all.bat %REST% & goto :eof )
if /i "%CMD%"=="dev" ( call setup\boot_all.bat %REST% & goto :eof )
if /i "%CMD%"=="install" ( call setup\install_all.bat %REST% & goto :eof )
if /i "%CMD%"=="install-desktop" ( call setup\install_desktop.bat %REST% & goto :eof )
if /i "%CMD%"=="backend" ( call setup\boot_backend.bat %REST% & goto :eof )
if /i "%CMD%"=="frontend" ( call setup\boot_frontend.bat %REST% & goto :eof )
if /i "%CMD%"=="build" ( call setup\build_frontend.bat %REST% & goto :eof )
if /i "%CMD%"=="serve" ( call setup\serve.bat %REST% & goto :eof )
if /i "%CMD%"=="freeze" ( call setup\freeze_backend.bat %REST% & goto :eof )
if /i "%CMD%"=="desktop" (
  if "%ARG%"=="" ( call setup\desktop_dev.bat & goto :eof )
  if /i "%ARG%"=="dev" ( call setup\desktop_dev.bat %REST2% & goto :eof )
  if /i "%ARG%"=="build" ( call setup\desktop_build.bat %REST2% & goto :eof )
  call :usage
  exit /b 2
)
if /i "%CMD%"=="doctor" ( call setup\doctor.bat %REST% & goto :eof )
if /i "%CMD%"=="counts" ( call setup\counts.bat %REST% & goto :eof )
if /i "%CMD%"=="claude" ( python setup\claude_launch.py %REST% & goto :eof )
if /i "%CMD%"=="cli" ( python setup\catalogue.py %REST% & goto :eof )
if /i "%CMD%"=="i18n" ( python setup\i18n_tool.py %REST% & goto :eof )
if /i "%CMD%"=="pdf-check" ( python setup\pdf_check.py %REST% & goto :eof )
if /i "%CMD%"=="mcp" ( python setup\mcp_stdio.py %REST% & goto :eof )
if /i "%CMD%"=="agents" ( python setup\agents.py %REST% & goto :eof )
if /i "%CMD%"=="build-deck" ( call setup\build_deck.bat %REST% & goto :eof )
if /i "%CMD%"=="templates" ( call setup\templates.bat %REST% & goto :eof )
if /i "%CMD%"=="clean" ( call setup\clean.bat %REST% & goto :eof )
if /i "%CMD%"=="help" ( call :usage & exit /b 0 )
if /i "%CMD%"=="-h" ( call :usage & exit /b 0 )
if /i "%CMD%"=="--help" ( call :usage & exit /b 0 )
echo [formdeck] unknown command: %CMD%
echo.
call :usage
exit /b 2
:legacy
if not defined FORMDECK_%1 if defined FORMSLD_%1 call set "FORMDECK_%1=%%FORMSLD_%1%%"
exit /b 0
:usage
set "VER="
for /f "tokens=2 delims='" %%v in ('findstr /b /c:"export const VERSION" frontend\src\version.ts 2^>nul') do set "VER=%%v"
echo formdeck %VER%, presentation editor
echo.
echo usage: formdeck.bat [command] [options]
echo.
echo   (none) ^| boot       boot backend (8197) and frontend (5197) together
echo   install [--lite]    install backend and frontend
echo   install-desktop     install PyInstaller and check the Rust and Tauri toolchain
echo   backend             boot the backend only
echo   frontend            boot the frontend only
echo   build               production build of the frontend into frontend\dist
echo   serve               serve the built frontend from the backend on 127.0.0.1:8197
echo   freeze              freeze the backend into the Tauri sidecar binary
echo   desktop dev^|build   run or bundle the desktop app
echo   doctor              check the toolchain, installs and ports
echo   counts [--check]    the README's code sizes (--check: exit 1 if README.md has drifted)
echo   claude [args]       Claude Code in this terminal with formdeck's MCP tools attached
echo   cli list^|describe^|run^|batch  the editor's command catalogue from a terminal (the window must be open)
echo   i18n check^|scan^|export^|import  the translations: check for gaps, find new strings, or a language as CSV for a native reviewer and back
echo   pdf-check FILE.pdf  validate an exported PDF as PDF/UA-1 with veraPDF (installed separately, needs Java)
echo   mcp                formdeck over MCP's stdio transport, for Claude Desktop and other MCP clients
echo   agents install^|sync  set up Claude Code, Codex and Cursor for building decks in plain language (install), or refresh the skill (sync)
echo   build-deck [args]   build a deck from files headlessly, without the window
echo   templates export [dir]  write the built-in templates as .pptx files
echo   clean [--all]       remove build output (--all also venv and node_modules)
echo   help                this text
exit /b 0
