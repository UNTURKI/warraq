@echo off
title Alwarraq - Build Setup.exe
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
rem Electron version changed (or first time): reinstall the build tools
set NEEDINSTALL=0
if not exist "node_modules\electron-builder" set NEEDINSTALL=1
node -e "const w=require('./package.json').devDependencies.electron.replace(/[^0-9.]/g,'');let h='';try{h=require('./node_modules/electron/package.json').version}catch(e){};process.exit(h===w?0:1)" || set NEEDINSTALL=1
if "%NEEDINSTALL%"=="1" (
  echo Installing build tools - a few minutes...
  call npm install --no-audit --no-fund
  if errorlevel 1 ( echo Install failed. Check your internet connection. & pause & exit /b 1 )
)
echo Building the installer...
call npm run dist
if errorlevel 1 ( echo Build failed - see the messages above. & pause & exit /b 1 )
powershell -NoProfile -ExecutionPolicy Bypass -File "build\setup-ui\build.ps1"
if errorlevel 1 ( echo Setup window build failed - see the messages above. & pause & exit /b 1 )
echo.
echo Done. Give people the file Alwarraq-Setup in the "dist" folder.
start "" "%~dp0dist"
pause
