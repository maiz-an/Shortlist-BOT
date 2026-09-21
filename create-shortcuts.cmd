@echo off
rem  Puts two shortcuts on your Desktop: "Shortlist BOT" (start + open) and "Stop Shortlist BOT".
rem  They run with no console window. Add "remote" to enable phone access:  create-shortcuts.cmd remote
setlocal
set "OPT="
if /i "%~1"=="remote" set "OPT=remote "
set "DESK=%USERPROFILE%\Desktop"
if exist "%USERPROFILE%\OneDrive\Desktop" set "DESK=%USERPROFILE%\OneDrive\Desktop"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\make-shortcut.ps1" -Path "%DESK%\Shortlist BOT.lnk" -Script "%~dp0start.cmd" -Arguments "%OPT%hidden" -Description "Start Shortlist BOT"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\make-shortcut.ps1" -Path "%DESK%\Stop Shortlist BOT.lnk" -Script "%~dp0stop.cmd" -Arguments "hidden" -Description "Stop Shortlist BOT"
echo.
echo  Created on your Desktop:
echo    Shortlist BOT        starts everything in the background and opens the app
echo    Stop Shortlist BOT   stops it
timeout /t 6 >nul
