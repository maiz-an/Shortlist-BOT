@echo off
rem ============================================================================
rem  Shortlist BOT - first-time setup for a Windows PC with nothing installed yet.
rem  Double-click this file. It installs what is missing (Node.js, Git, optionally
rem  Ollama), sets up your database and .env files, and asks how you want AI to run.
rem
rem  Safe to run more than once - every step only does something if it is not
rem  already done. Nothing here touches an existing backend\.env or frontend\.env.
rem ============================================================================
setlocal EnableDelayedExpansion
cd /d "%~dp0"

echo.
echo  Shortlist BOT - First-time setup
echo  ---------------------------------
echo.

set "NEED_RESTART=0"

where winget >nul 2>&1
set "HAVE_WINGET=1"
if errorlevel 1 set "HAVE_WINGET=0"

rem --- Node.js -----------------------------------------------------------------
where node >nul 2>&1
if errorlevel 1 (
  if "%HAVE_WINGET%"=="0" (
    echo  [x] Node.js is not installed, and this PC does not have winget to install it
    echo      automatically ^(that needs Windows 10 2004+ or Windows 11^). Install Node.js
    echo      yourself from https://nodejs.org ^(the LTS version^), then run install.cmd again.
    goto :fail
  )
  echo  [+] Installing Node.js ^(this can take a few minutes^)...
  winget install --id OpenJS.NodeJS.LTS -e --accept-source-agreements --accept-package-agreements
  if errorlevel 1 (
    echo  [x] Installing Node.js failed. Install it yourself from https://nodejs.org and run install.cmd again.
    goto :fail
  )
  set "NEED_RESTART=1"
) else (
  echo  [=] Node.js is already installed.
)

rem --- Git -----------------------------------------------------------------------
where git >nul 2>&1
if errorlevel 1 (
  if "%HAVE_WINGET%"=="0" (
    echo  [^^!] Git is not installed and cannot be installed automatically on this PC.
    echo      Shortlist BOT will still run, but update.cmd needs Git to fetch updates later.
    echo      You can install it any time from https://git-scm.com
  ) else (
    echo  [+] Installing Git...
    winget install --id Git.Git -e --accept-source-agreements --accept-package-agreements
    if errorlevel 1 (
      echo  [^^!] Installing Git failed ^(not fatal - Shortlist BOT itself does not need it,
      echo      only update.cmd does^). You can install it later from https://git-scm.com
    ) else (
      set "NEED_RESTART=1"
    )
  )
) else (
  echo  [=] Git is already installed.
)

if "%NEED_RESTART%"=="1" (
  rem Pick up newly-installed programs without waiting for a new terminal.
  for /f "tokens=2*" %%A in ('reg query "HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\Environment" /v Path 2^>nul') do set "SYS_PATH=%%B"
  for /f "tokens=2*" %%A in ('reg query "HKCU\Environment" /v Path 2^>nul') do set "USER_PATH=%%B"
  set "PATH=!SYS_PATH!;!USER_PATH!"
  where node >nul 2>&1
  if errorlevel 1 (
    echo.
    echo  [i] Node.js was just installed, but this window cannot see it yet.
    echo      Close this window and double-click install.cmd again to continue.
    pause
    exit /b 0
  )
)

where git >nul 2>&1
set "HAVE_GIT=1"
if errorlevel 1 set "HAVE_GIT=0"

rem --- Make sure update.cmd will work later (a ZIP download isn't a Git checkout) --
if "%HAVE_GIT%"=="1" if exist "VERSION" (
  git rev-parse --is-inside-work-tree >nul 2>&1
  if errorlevel 1 (
    echo  [+] This looks like a ZIP download rather than a Git checkout, so update.cmd could
    echo      not update it later. Turning it into one now ^(none of your files are touched^)...
    git init -q -b main
    git remote add origin https://github.com/maiz-an/Shortlist-BOT.git
    git fetch -q origin main
    if errorlevel 1 (
      echo  [^^!] Could not reach GitHub to finish this. update.cmd will not work until you
      echo      retry install.cmd with an internet connection.
      rd /s /q .git >nul 2>&1
    ) else (
      git reset -q --hard origin/main
      echo  [OK] This folder can now be updated with update.cmd.
    )
  )
)

rem --- Settings files ------------------------------------------------------------
set "FIRST_RUN=0"
if not exist "backend\.env" set "FIRST_RUN=1"
echo  [i] Setting up .env files...
call node backend\scripts\init-env.js
if not exist "backend\.env" (
  echo  [x] Could not create backend\.env. See the message above.
  goto :fail
)

if "%FIRST_RUN%"=="1" (
  rem Brand new install: default to the built-in database, so nothing else needs installing.
  rem (An existing .env is never changed - see backend/.env.example if you want real PostgreSQL instead.)
  call :setenv DATABASE_URL "postgresql://postgres:postgres@127.0.0.1:5872/postgres?schema=public&connection_limit=1&sslmode=disable&pgbouncer=true"
  echo  [i] Using the database built into Shortlist BOT ^(no separate database to install^).
  echo      To use your own PostgreSQL instead, edit DATABASE_URL in backend\.env - see SETUP.md.
)

rem --- Packages --------------------------------------------------------------------
echo  [i] Installing backend packages ^(first run only^)...
pushd backend
call npm install
if errorlevel 1 ( popd & echo  [x] Installing backend packages failed. See the messages above. & goto :fail )
popd

echo  [i] Installing app packages ^(first run only^)...
pushd frontend
call npm install
if errorlevel 1 ( popd & echo  [x] Installing app packages failed. See the messages above. & goto :fail )
popd

rem --- AI choice ---------------------------------------------------------------------
echo.
echo  How should Shortlist BOT run its AI?
echo    1. I have an API key for a cloud AI ^(OpenAI, OpenRouter, Groq, Together.ai, ...^)
echo    2. Use a free local AI model with Ollama ^(needs a reasonably capable PC^)
set "AI_CHOICE="
set /p "AI_CHOICE=Type 1 or 2 and press Enter [2]: "
if not defined AI_CHOICE set "AI_CHOICE=2"

if "%AI_CHOICE%"=="1" (
  echo.
  set "AI_KEY="
  set /p "AI_KEY=Paste your API key: "
  if not defined AI_KEY (
    echo  [^^!] No key entered - staying on Ollama for now. Re-run install.cmd any time to switch.
  ) else (
    set "AI_BASE="
    set /p "AI_BASE=API base URL [https://api.openai.com/v1]: "
    if not defined AI_BASE set "AI_BASE=https://api.openai.com/v1"
    set "AI_MODELNAME="
    set /p "AI_MODELNAME=Model name [gpt-4o-mini]: "
    if not defined AI_MODELNAME set "AI_MODELNAME=gpt-4o-mini"
    call :setenv AI_PROVIDER openai
    call :setenv AI_API_BASE_URL "!AI_BASE!"
    call :setenv AI_API_KEY "!AI_KEY!"
    call :setenv AI_API_MODEL "!AI_MODELNAME!"
    echo  [OK] Cloud AI configured ^(!AI_MODELNAME! via !AI_BASE!^).
  )
) else (
  call :setenv AI_PROVIDER ollama
  where ollama >nul 2>&1
  if errorlevel 1 (
    if "%HAVE_WINGET%"=="1" (
      echo  [+] Installing Ollama...
      winget install --id Ollama.Ollama -e --accept-source-agreements --accept-package-agreements
      for /f "tokens=2*" %%A in ('reg query "HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\Environment" /v Path 2^>nul') do set "SYS_PATH=%%B"
      for /f "tokens=2*" %%A in ('reg query "HKCU\Environment" /v Path 2^>nul') do set "USER_PATH=%%B"
      set "PATH=!SYS_PATH!;!USER_PATH!"
    ) else (
      echo  [^^!] Ollama is not installed and cannot be installed automatically on this PC.
      echo      Install it yourself from https://ollama.com, then run install.cmd again
      echo      to pick a model for your PC.
    )
  )
  where ollama >nul 2>&1
  if not errorlevel 1 (
    set "RAM_GB=8"
    for /f "delims=" %%R in ('powershell -NoProfile -Command "[math]::Round((Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory/1GB)" 2^>nul') do set "RAM_GB=%%R"
    set "OLLAMA_PICK=qwen3:8b"
    if !RAM_GB! LEQ 6  set "OLLAMA_PICK=qwen3:1.7b"
    if !RAM_GB! GEQ 7  set "OLLAMA_PICK=qwen3:4b"
    if !RAM_GB! GEQ 12 set "OLLAMA_PICK=qwen3:8b"
    if !RAM_GB! GEQ 20 set "OLLAMA_PICK=qwen3:14b"
    echo  [i] This PC has about !RAM_GB! GB of RAM - picking !OLLAMA_PICK!.
    echo  [i] Downloading the model ^(a few GB, only happens once^)...
    call ollama pull !OLLAMA_PICK!
    if errorlevel 1 (
      echo  [^^!] Could not download !OLLAMA_PICK! right now. Shortlist BOT will still start;
      echo      run "ollama pull !OLLAMA_PICK!" yourself later, or check the AI card in Settings.
    ) else (
      call :setenv OLLAMA_MODEL "!OLLAMA_PICK!"
      echo  [OK] Ollama configured with !OLLAMA_PICK!.
    )
  )
)

rem --- WhatsApp alerts (optional) --------------------------------------------------
echo.
if exist "services\openwa\package.json" (
  echo  [=] WhatsApp alerts ^(OpenWA^) are already set up.
) else (
  echo  Want WhatsApp alerts too? Shortlist BOT can message you on WhatsApp when a job
  echo  matches. This needs a spare WhatsApp number - never use your main one ^(see SETUP.md
  echo  for why^) - and downloads its own small Chrome browser to talk to WhatsApp Web.
  set "WA_CHOICE="
  set /p "WA_CHOICE=Set it up now? [y/N]: "
  if /i "!WA_CHOICE!"=="y" (
    if "%HAVE_GIT%"=="0" (
      echo  [^^!] Git is needed for this and is not installed. Skipping - see SETUP.md to do this later.
    ) else (
      echo  [+] Downloading OpenWA...
      git clone --quiet https://github.com/rmyndharis/OpenWA.git services\openwa
      if errorlevel 1 (
        echo  [^^!] Could not download OpenWA ^(check your internet connection^). Skipping - see SETUP.md to do this later.
      ) else (
        pushd services\openwa
        copy /y .env.minimal .env >nul
        echo  [+] Installing OpenWA packages ^(this can take a few minutes^)...
        call npm ci
        if errorlevel 1 (
          popd
          echo  [^^!] Installing OpenWA packages failed. See the messages above; see SETUP.md to finish this later.
        ) else (
          echo  [+] Downloading OpenWA's browser ^(a few hundred MB, only happens once^)...
          call npx puppeteer browsers install chrome
          for /f "delims=" %%K in ('powershell -NoProfile -Command "[guid]::NewGuid().ToString('N') + [guid]::NewGuid().ToString('N')"') do set "WA_KEY=%%K"
          call :setenvfile ".env" "HOST" "127.0.0.1"
          call :setenvfile ".env" "API_MASTER_KEY" "!WA_KEY!"
          popd
          call :setenv OPENWA_URL "http://127.0.0.1:2785"
          call :setenv OPENWA_API_KEY "!WA_KEY!"
          echo  [OK] WhatsApp alerts installed. Once Shortlist BOT is running, open Settings ^> WhatsApp
          echo      and scan the QR code with WhatsApp on your phone ^(Settings ^> Linked devices ^> Link a device^).
        )
      )
    )
  )
)

echo.
echo  [OK] Setup finished.
echo.
set "GOSTART="
set /p "GOSTART=Start Shortlist BOT now? [Y/n]: "
if /i "%GOSTART%"=="n" (
  echo  Run start.cmd whenever you are ready.
  exit /b 0
)
call "%~dp0start.cmd"
exit /b 0

:setenv
rem %1=KEY %2=VALUE - sets KEY=VALUE in backend\.env, uncommenting it if needed,
rem or adding it if it is not there at all. Never touches any other line.
call :setenvfile "backend\.env" "%~1" "%~2"
exit /b 0

:setenvfile
rem %1=FILE %2=KEY %3=VALUE - same as :setenv, but against an arbitrary file.
set "SETENV_FILE=%~1"
set "SETENV_KEY=%~2"
set "SETENV_VAL=%~3"
powershell -NoProfile -Command ^
  "$p = $env:SETENV_FILE; $k = $env:SETENV_KEY; $v = $env:SETENV_VAL;" ^
  "$pat = '^#?\s*' + [regex]::Escape($k) + '=.*$';" ^
  "$c = @(Get-Content $p);" ^
  "if ($c -match $pat) { $c = $c -replace $pat, ($k + '=' + $v) } else { $c = $c + @($k + '=' + $v) };" ^
  "Set-Content -Path $p -Value $c"
exit /b 0

:fail
echo.
pause
exit /b 1
