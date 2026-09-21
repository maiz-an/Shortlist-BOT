@echo off
rem Used by start.cmd. Runs the API and appends its output to logs\backend.log.
cd /d "%~dp0..\backend"
if not exist "..\logs" mkdir "..\logs"
call npm run start:dev >> "..\logs\backend.log" 2>&1
