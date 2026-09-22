@echo off
rem Used by start.cmd. Runs OpenWA (optional WhatsApp alerts) and appends its output to logs\openwa.log.
rem OpenWA is not part of this repo (see SETUP.md) - if it was never set up here, this is a no-op.
cd /d "%~dp0..\services\openwa"
if not exist "package.json" exit /b 0
if not exist "node_modules" exit /b 0
if not exist ".env" exit /b 0
if not exist "..\..\logs" mkdir "..\..\logs"
call npm run start:dev >> "..\..\logs\openwa.log" 2>&1
