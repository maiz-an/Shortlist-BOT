@echo off
rem ============================================================================
rem  Shortlist BOT - update this folder to the latest version from GitHub.
rem  Run start.cmd yourself afterwards (with whatever options you normally use).
rem
rem  Safe to run any time, safe to re-run if something fails partway through.
rem  Your backend\.env, frontend\.env, uploaded CVs and database are never touched.
rem ============================================================================
setlocal EnableDelayedExpansion
cd /d "%~dp0"

echo.
echo  Shortlist BOT - Update
echo  ----------------------

where git >nul 2>&1
if errorlevel 1 (
  set "FAILMSG=Git is not installed, so this folder cannot be updated automatically. Install it from https://git-scm.com and run update.cmd again, or download the latest version yourself from https://github.com/maiz-an/Shortlist-BOT/releases/latest"
  goto :fail
)

git rev-parse --is-inside-work-tree >nul 2>&1
if errorlevel 1 (
  set "FAILMSG=This folder is not a Git checkout, so it cannot be updated automatically. Download the latest version yourself from https://github.com/maiz-an/Shortlist-BOT/releases/latest"
  goto :fail
)

where node >nul 2>&1
if errorlevel 1 (
  set "FAILMSG=Node.js is not installed. Get it from https://nodejs.org and run update.cmd again."
  goto :fail
)

echo  [i] Stopping Shortlist BOT if it is running...
call "%~dp0stop.cmd" silent

git diff --quiet --exit-code -- backend frontend scripts *.cmd *.sh
if errorlevel 1 (
  echo  [^^!] You have edited some of Shortlist BOT's own files. They are left as they are;
  echo      only files that changed on GitHub are updated. backend\.env, frontend\.env
  echo      and everything under storage\ are never touched by this either way.
)

echo  [i] Downloading the latest version...
for /f "delims=" %%B in ('git rev-parse --abbrev-ref HEAD 2^>nul') do set "BRANCH=%%B"
if not defined BRANCH (
  set "FAILMSG=Could not work out which branch this checkout is on. If you cloned this normally you should not see this - ask for help."
  goto :fail
)
git fetch origin
if errorlevel 1 (
  set "FAILMSG=Could not reach GitHub to check for updates. Check your internet connection and try again."
  goto :fail
)
git pull --ff-only origin "!BRANCH!"
if errorlevel 1 (
  set "FAILMSG=The update could not be applied automatically - this copy has local commits that differ from GitHub. If you did not intend to change any of Shortlist BOT's own files, the simplest fix is to download it fresh from https://github.com/maiz-an/Shortlist-BOT/releases/latest and move your backend\.env, frontend\.env and storage\ folder into it."
  goto :fail
)

echo  [i] Updating backend packages...
pushd backend
call npm install
if errorlevel 1 ( popd & set "FAILMSG=Installing backend packages failed. Scroll up for the error, fix it (often a network problem), then run update.cmd again." & goto :fail )
rem The generated database client file can stay briefly locked (antivirus, or another
rem program that had it open) right after Shortlist BOT stops - this is a known Windows
rem quirk, not a real failure, so retry a few times before giving up.
set "GEN_OK=0"
for /l %%R in (1,1,5) do (
  if "!GEN_OK!"=="0" (
    call npx prisma generate >nul 2>nul
    if not errorlevel 1 (set "GEN_OK=1") else timeout /t 3 >nul
  )
)
if "!GEN_OK!"=="0" (
  call npx prisma generate
  popd
  set "FAILMSG=Preparing the database client failed - its file may still be locked by another running copy of Shortlist BOT. Make sure it is fully closed (check Task Manager for a leftover node.exe if unsure) and run update.cmd again."
  goto :fail
)
rem Best-effort: the built-in database cannot run real migrations, only Shortlist BOT's own
rem additive changes on next start (see backend/src/prisma/prisma.service.ts). A real
rem PostgreSQL database gets this applied properly; either way this step is not fatal.
call npm run db:deploy
popd

echo  [i] Updating app packages...
pushd frontend
call npm install
if errorlevel 1 ( popd & set "FAILMSG=Installing app packages failed. Scroll up for the error, fix it (often a network problem), then run update.cmd again." & goto :fail )
popd

echo.
set "NEWVER=(unknown)"
if exist VERSION for /f "delims=" %%V in (VERSION) do set "NEWVER=%%V"
echo  [OK] Updated to version !NEWVER!.
echo       What changed: https://github.com/maiz-an/Shortlist-BOT/blob/main/CHANGELOG.md
echo.
echo  Run start.cmd when you are ready to start it again.
exit /b 0

:fail
echo.
echo  [x] %FAILMSG%
pause
exit /b 1
