@echo off
title Alwarraq - Dev
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is needed only on the developer machine. Install the LTS version from nodejs.org, then run this file again.
  start "" "https://nodejs.org/en/download"
  pause
  exit /b 1
)
if not exist "node_modules\electron" (
  echo First time: installing build tools - a few minutes...
  call npm install --no-audit --no-fund
  if errorlevel 1 ( echo Install failed. Check your internet connection. & pause & exit /b 1 )
)
call npm start
