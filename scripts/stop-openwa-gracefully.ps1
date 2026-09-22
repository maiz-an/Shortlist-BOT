# Used by stop.cmd. Asks OpenWA to stop its WhatsApp session cleanly (POST /sessions/:id/stop) before the
# main script force-kills the process. A forceful kill can catch the underlying Chromium mid-write and
# corrupt the saved WhatsApp login, forcing a fresh QR scan next time; a clean stop avoids that. Best-effort
# only: if OpenWA is not running, not configured, or the call fails, this does nothing and stop.cmd's own
# force-kill (which always runs afterwards) is the real safety net.
$ErrorActionPreference = 'SilentlyContinue'
$envPath = Join-Path $PSScriptRoot '..\services\openwa\.env'
if (-not (Test-Path $envPath)) { exit 0 }

$port = (Get-NetTCPConnection -LocalPort 2785 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1)
if (-not $port) { exit 0 }

$key = (Get-Content $envPath | Select-String '^API_MASTER_KEY=(.+)$').Matches.Groups[1].Value
if (-not $key) { exit 0 }

try {
  $headers = @{ 'x-api-key' = $key }
  $sessions = Invoke-RestMethod -Uri 'http://127.0.0.1:2785/api/sessions?name=shortlist-alerts' -Headers $headers -TimeoutSec 3
  $session = $sessions | Select-Object -First 1
  if ($session -and $session.status -ne 'disconnected') {
    Invoke-RestMethod -Uri "http://127.0.0.1:2785/api/sessions/$($session.id)/stop" -Method Post -Headers $headers -TimeoutSec 5 | Out-Null
    Start-Sleep -Seconds 2
  }
} catch {}
exit 0
