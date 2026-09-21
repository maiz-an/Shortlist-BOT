@echo off
rem  Stop Shortlist BOT from starting automatically when you sign in to Windows.
set "STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "FOUND=0"
if exist "%STARTUP%\Shortlist BOT.lnk" ( del "%STARTUP%\Shortlist BOT.lnk" & set "FOUND=1" )
if exist "%STARTUP%\Shortlist BOT.cmd" ( del "%STARTUP%\Shortlist BOT.cmd" & set "FOUND=1" )
if "%FOUND%"=="1" ( echo  Auto-start turned off. ) else echo  Auto-start was not on.
timeout /t 4 >nul
