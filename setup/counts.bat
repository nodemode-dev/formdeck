@echo off
setlocal
cd /d "%~dp0.."
python setup\line_counts.py %*
