@echo off
setlocal
cd /d "%~dp0.."
echo [formsld] installing backend
pushd backend
call oc_install.bat %* || ( popd & exit /b 1 )
popd
echo [formsld] installing frontend
pushd frontend
call oc_install.bat %* || ( popd & exit /b 1 )
popd
echo [formsld] done. Boot with formsld.bat
