@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>&1 || (echo Node.js 18 or newer is required. Install from https://nodejs.org/ & pause & exit /b 1)
if not exist .env copy .env.example .env >nul
if not exist node_modules call npm install
if errorlevel 1 (echo Dependency installation failed. & pause & exit /b 1)
echo Starting Chandrahasa. Configure .env before production use.
node server.js
pause
