@echo off
rem  Shortlist BOT - stop the app, the API and the built-in database (all run hidden).
rem  Ollama is left running because other programs may use it. "stop.cmd all" stops it too.
rem  Add "hidden" as the last option for no output (used by the Stop shortcut).
setlocal
cd /d "%~dp0"
set "ALL=0"
set "QUIET=0"
for %%A in (%*) do (
  if /i "%%A"=="all" set "ALL=1"
  if /i "%%A"=="hidden" set "QUIET=1"
  if /i "%%A"=="silent" set "QUIET=1"
)
if "%QUIET%"=="0" ( echo. & echo  Stopping Shortlist BOT... )

rem 1) our hidden launcher scripts and everything they started, 2) anything still listening on our ports
set "STOP_ALL=%ALL%"
powershell -NoProfile -Command "$me=$PID; Get-CimInstance Win32_Process | Where-Object { $_.ProcessId -ne $me -and $_.CommandLine -match 'scripts.run-(backend|frontend|db)\.cmd' } | ForEach-Object { & taskkill /PID $_.ProcessId /T /F *> $null }; foreach($p in 5870,5871,5872){ Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue } }; if($env:STOP_ALL -eq '1'){ Get-Process ollama* -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue }" >nul 2>&1

if "%QUIET%"=="0" (
  if "%ALL%"=="1" echo  Ollama stopped.
  echo  Done.
  timeout /t 3 >nul
)
exit /b 0
