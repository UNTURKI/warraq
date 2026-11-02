@echo off
title Alwarraq - Build Store package
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is needed only on the developer machine. Install the LTS version from nodejs.org, then run this file again.
  start "" "https://nodejs.org/en/download"
  pause
  exit /b 1
)
rem Caches and temp files stay on this drive, next to the project
set "ELECTRON_BUILDER_CACHE=%~dp0.cache\electron-builder"
set "electron_config_cache=%~dp0.cache\electron"
set "TEMP=%~dp0.cache\temp"
set "TMP=%~dp0.cache\temp"
if not exist "%TEMP%" mkdir "%TEMP%"
if not exist "node_modules\electron-builder" (
  echo Installing build tools - a few minutes...
  call npm install --no-audit --no-fund
  if errorlevel 1 ( echo Install failed. Check your internet connection. & pause & exit /b 1 )
)
echo Building the Store package...
call npm run store
if errorlevel 1 ( echo Build failed - see the messages above. & pause & exit /b 1 )
echo.
echo Done. The package is in the "dist" folder.
start "" "%~dp0dist"
pause
