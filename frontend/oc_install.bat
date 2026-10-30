@echo off
cd /d "%~dp0"
call npm install || exit /b 1
