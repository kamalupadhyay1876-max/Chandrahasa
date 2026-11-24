@echo off
setlocal
cd /d "%~dp0.."
echo ===============================================
echo CHANDRAHASA - OWNER READINESS CHECK
echo ===============================================
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Install Node.js 20 LTS from https://nodejs.org/ and run this again.
  pause
  exit /b 1
)
echo.
echo [1/3] Backend source audit
pushd backend
node scripts/audit.js
if errorlevel 1 goto failed
node scripts/env-doctor.js
if errorlevel 1 echo NOTE: Set the server SECRET and production settings in Railway Variables.
popd
echo.
echo [2/3] Frontend/source checks
where python >nul 2>nul
if not errorlevel 1 (
  python QA-SOURCE-CHECKS.py
  if errorlevel 1 goto failed
) else (
  where py >nul 2>nul
  if not errorlevel 1 (
    py -3 QA-SOURCE-CHECKS.py
    if errorlevel 1 goto failed
  ) else (
    echo NOTE: Python not installed; optional source QA skipped. Backend audit and JavaScript syntax checks have already run.
  )
)
echo.
echo [3/3] Read OWNER-SETUP-HINGLISH.md for account and credential steps.
echo.
echo Check finished. INFO means a provider credential is optional or not configured; this script never prints secret values.
pause
exit /b 0
:failed
popd 2>nul
echo A source check failed. Save this output and share it without any credentials.
pause
exit /b 1
