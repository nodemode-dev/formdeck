@echo off
setlocal
cd /d "%~dp0.."
echo [formdeck] installing backend
pushd backend
call oc_install.bat %* || ( popd & exit /b 1 )
popd
echo [formdeck] installing frontend
pushd frontend
call oc_install.bat %* || ( popd & exit /b 1 )
popd
echo [formdeck] done. Boot with formdeck.bat
