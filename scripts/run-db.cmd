@echo off
rem Used by start.cmd. Runs the built-in database and appends its output to logs\db.log.
cd /d "%~dp0..\Setup"
if not exist "..\logs" mkdir "..\logs"
call node pglite-server.js >> "..\logs\db.log" 2>&1
