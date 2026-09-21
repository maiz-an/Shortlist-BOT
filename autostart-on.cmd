@echo off
rem  Start Shortlist BOT automatically (hidden, no windows) when you sign in to Windows. No admin rights needed.
rem
rem    autostart-on.cmd            local only
rem    autostart-on.cmd remote     also accept your phone (needs ACCESS_PASSCODE in backend\.env)
rem
rem  Turn it off again with autostart-off.cmd.
setlocal
set "STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "OPT="
if /i "%~1"=="remote" set "OPT=remote "
if exist "%STARTUP%\Shortlist BOT.cmd" del "%STARTUP%\Shortlist BOT.cmd" >nul 2>&1
rem "silent hidden": start the services, do not open a browser, show a message box only on failure
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\make-shortcut.ps1" -Path "%STARTUP%\Shortlist BOT.lnk" -Script "%~dp0start.cmd" -Arguments "%OPT%silent hidden" -Description "Start Shortlist BOT at sign-in"
echo.
echo  Shortlist BOT will now start quietly in the background when you sign in to Windows.
echo  Open it any time at http://localhost:5870. Turn this off with autostart-off.cmd.
timeout /t 6 >nul
