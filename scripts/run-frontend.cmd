@echo off
rem Used by start.cmd. Runs the app and appends its output to logs\frontend.log.
cd /d "%~dp0..\frontend"
if not exist "..\logs" mkdir "..\logs"
call npm run dev >> "..\logs\frontend.log" 2>&1
