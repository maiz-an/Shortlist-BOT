# Creates a Windows shortcut that runs a batch file with NO console window (conhost --headless).
# Usage: powershell -File make-shortcut.ps1 -Path <lnk> -Script <cmd> [-Arguments "remote"] [-Description "..."]
param(
  [Parameter(Mandatory)] [string] $Path,
  [Parameter(Mandatory)] [string] $Script,
  [string] $Arguments = '',
  [string] $Description = 'Shortlist BOT'
)
$conhost = Join-Path $env:SystemRoot 'System32\conhost.exe'
$shell = New-Object -ComObject WScript.Shell
$lnk = $shell.CreateShortcut($Path)
$lnk.TargetPath = $conhost
$lnk.Arguments = "--headless cmd /c `"`"$Script`" $Arguments`""
$lnk.WorkingDirectory = Split-Path $Script
$lnk.WindowStyle = 7
$lnk.Description = $Description
$icon = Join-Path (Split-Path $Script) 'scripts\shortlist.ico'
if (Test-Path $icon) { $lnk.IconLocation = $icon }
$lnk.Save()
