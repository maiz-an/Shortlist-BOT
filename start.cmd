@echo off
rem ============================================================================
rem  Shortlist BOT - start everything with one click. All services run hidden:
rem  no console windows and no taskbar entries. Logs go to the logs folder.
rem
rem    start.cmd                 start on this computer only (http://localhost:5870)
rem    start.cmd remote          also accept other devices (phone over Tailscale / Wi-Fi).
rem                              Requires ACCESS_PASSCODE in backend\.env.
rem    start.cmd silent          do not open the browser
rem    start.cmd hidden          for shortcuts: no console output at all, opens the browser,
rem                              and shows a message box if something goes wrong
rem    (options can be combined, e.g.  start.cmd remote hidden)
rem
rem  Starts, only if not already running: built-in database (if you use it), WhatsApp alerts (if set up),
rem  Ollama, the API (5871) and the app (5870).
rem ============================================================================
setlocal EnableDelayedExpansion
cd /d "%~dp0"

set "REMOTE=0"
set "SILENT=0"
set "HIDDEN=0"
for %%A in (%*) do (
  if /i "%%A"=="remote" set "REMOTE=1"
  if /i "%%A"=="silent" set "SILENT=1"
  if /i "%%A"=="hidden" set "HIDDEN=1"
)

echo.
echo  Shortlist BOT
echo  -------------

where node >nul 2>&1
if errorlevel 1 (
  set "FAILMSG=Node.js is not installed. Get it from https://nodejs.org and start Shortlist BOT again."
  goto :fail
)

if not exist "backend\.env" (
  node backend\scripts\init-env.js
  set "FAILMSG=First run: your settings files were created. Open backend\.env, set DATABASE_URL for your database, then start Shortlist BOT again. See SETUP.md for help."
  goto :fail
)

if not exist "backend\node_modules" (
  echo  [i] Installing backend packages ^(first run only^)...
  pushd backend & call npm install & popd
)
if not exist "frontend\node_modules" (
  echo  [i] Installing frontend packages ^(first run only^)...
  pushd frontend & call npm install & popd
)
if not exist "logs" mkdir logs

if "%REMOTE%"=="1" (
  findstr /r /c:"^ACCESS_PASSCODE=." "backend\.env" >nul 2>&1
  if errorlevel 1 (
    set "FAILMSG=Remote mode needs a login. Open backend\.env and set ACCESS_PASSCODE to a long passphrase, then start again. Without it anyone who reaches the app could use your Gmail."
    goto :fail
  )
  set "SHORTLIST_REMOTE=1"
)

rem --- database: only the built-in one needs starting (it uses port 5872) ---
findstr /c:":5872/" "backend\.env" >nul 2>&1
if not errorlevel 1 (
  call :listening 5872
  if errorlevel 1 (
    if not exist "Setup\node_modules" ( pushd Setup & call npm install & popd )
    echo  [+] Starting the built-in database...
    call :hidden "%~dp0scripts\run-db.cmd"
    call :waitport 5872 40
  ) else echo  [=] Database already running
)

rem --- Ollama (the AI). Optional: the app starts without it. ---
call :listening 11434
if errorlevel 1 (
  set "OLLAMA="
  where ollama >nul 2>&1 && for /f "delims=" %%O in ('where ollama') do if not defined OLLAMA set "OLLAMA=%%O"
  if not defined OLLAMA if exist "%LOCALAPPDATA%\Programs\Ollama\ollama.exe" set "OLLAMA=%LOCALAPPDATA%\Programs\Ollama\ollama.exe"
  if not defined OLLAMA if exist "%~dp0Setup\Ollama\ollama.exe" set "OLLAMA=%~dp0Setup\Ollama\ollama.exe"
  if defined OLLAMA (
    echo  [+] Starting Ollama...
    call :hidden "!OLLAMA!" serve
  ) else echo  [!] Ollama not found. Jobs cannot be analyzed until you install it ^(https://ollama.com^).
) else echo  [=] Ollama already running

rem --- OpenWA (optional WhatsApp alerts, see SETUP.md). The app works fully without it. ---
if exist "services\openwa\package.json" if exist "services\openwa\node_modules" if exist "services\openwa\.env" (
  call :listening 2785
  if errorlevel 1 (
    echo  [+] Starting WhatsApp alerts ^(OpenWA^)...
    call :hidden "%~dp0scripts\run-openwa.cmd"
  ) else echo  [=] WhatsApp alerts already running
) else echo  [ ] WhatsApp alerts: not set up ^(optional, see SETUP.md^)

rem --- API and app ---
call :listening 5871
if errorlevel 1 (
  echo  [+] Starting the API...
  call :hidden "%~dp0scripts\run-backend.cmd"
) else echo  [=] API already running
call :listening 5870
if errorlevel 1 (
  echo  [+] Starting the app...
  call :hidden "%~dp0scripts\run-frontend.cmd"
) else echo  [=] App already running

echo  [.] Waiting for everything to be ready...
call :waithttp "http://127.0.0.1:5871/api/health" 120
if errorlevel 1 ( set "FAILMSG=The API did not start. See logs\backend.log for the reason." & goto :fail )
call :waithttp "http://localhost:5870" 60
if errorlevel 1 ( set "FAILMSG=The app did not start. See logs\frontend.log for the reason." & goto :fail )

echo.
echo  [ok] Shortlist BOT is running.
echo       On this computer:  http://localhost:5870
if "%REMOTE%"=="1" (
  echo       Remote access is ON ^(login required^). From your phone use one of:
  where tailscale >nul 2>&1 && for /f %%I in ('tailscale ip -4 2^>nul') do echo         http://%%I:5870   ^(Tailscale - permanent^)
  for /f "tokens=2 delims=:" %%I in ('ipconfig ^| findstr /c:"IPv4"') do echo         http://%%I:5870   ^(same Wi-Fi only^)
)
echo       Stop it with stop.cmd
if "%SILENT%"=="0" start "" "http://localhost:5870"
if "%HIDDEN%"=="0" if "%SILENT%"=="0" (
  echo.
  echo  You can close this window; Shortlist BOT keeps running in the background.
  timeout /t 8 >nul
)
exit /b 0

:fail
echo.
echo  [x] %FAILMSG%
if "%HIDDEN%"=="1" (
  powershell -NoProfile -Command "Add-Type -AssemblyName System.Windows.Forms; [void][System.Windows.Forms.MessageBox]::Show($env:FAILMSG, 'Shortlist BOT', 'OK', 'Warning')" >nul 2>&1
) else if "%SILENT%"=="0" pause
exit /b 1

rem ---- helpers ----
:hidden
rem Starts a program with no window at all. %1 = program, %2 = optional arguments.
set "H_FILE=%~1"
set "H_ARGS=%~2"
powershell -NoProfile -Command "if($env:H_ARGS){Start-Process -FilePath $env:H_FILE -ArgumentList $env:H_ARGS -WindowStyle Hidden}else{Start-Process -FilePath $env:H_FILE -WindowStyle Hidden}" >nul 2>&1
exit /b 0

:listening
netstat -ano | findstr /r /c:":%1 .*LISTENING" >nul
exit /b %errorlevel%

:waitport
set /a _n=0
:waitport_loop
call :listening %1
if not errorlevel 1 exit /b 0
set /a _n+=1
if !_n! geq %2 exit /b 1
ping -n 2 127.0.0.1 >nul
goto :waitport_loop

:waithttp
set /a _n=0
:waithttp_loop
powershell -NoProfile -Command "try{ if((Invoke-WebRequest -UseBasicParsing '%~1' -TimeoutSec 2).StatusCode -lt 500){exit 0} }catch{}; exit 1" >nul 2>&1
if not errorlevel 1 exit /b 0
set /a _n+=2
if !_n! geq %2 exit /b 1
ping -n 3 127.0.0.1 >nul
goto :waithttp_loop
