<#
.SYNOPSIS
  Log a standup note to the cyberdeck from the PC terminal.

.DESCRIPTION
  Posts to the cyberdeck's /standup/log endpoint. Reads RESTART_URL and
  WEBHOOK_TOKEN from a .env file in this script's directory.

.EXAMPLE
  .\note.ps1 fixed the hardcoded IPs in webhook_new
.EXAMPLE
  .\note.ps1 -Tag ai had claude write the forza packet parser
.EXAMPLE
  .\note.ps1 -List
#>
[CmdletBinding()]
param(
    [Parameter(Position = 0, ValueFromRemainingArguments = $true)]
    [string[]]$Text,

    [ValidateSet('progress', 'ai', 'gap', 'values', 'next')]
    [string]$Tag = 'progress',

    [switch]$List
)

$ErrorActionPreference = 'Stop'

# ── Config ───────────────────────────────────────────────
$envPath = Join-Path $PSScriptRoot '.env'
if (-not (Test-Path $envPath)) {
    Write-Error "No .env found at $envPath. Copy .env.example and fill it in."
    exit 1
}

$config = @{}
foreach ($line in Get-Content $envPath) {
    $trimmed = $line.Trim()
    if (-not $trimmed -or $trimmed.StartsWith('#') -or $trimmed -notmatch '=') { continue }
    $key, $value = $trimmed -split '=', 2
    $config[$key.Trim()] = $value.Trim().Trim('"').Trim("'")
}

$baseUrl = $config['RESTART_URL']
$token = $config['WEBHOOK_TOKEN']
if (-not $baseUrl -or -not $token) {
    Write-Error 'RESTART_URL or WEBHOOK_TOKEN missing from .env'
    exit 1
}
$baseUrl = $baseUrl.TrimEnd('/')

# ── List this week ───────────────────────────────────────
if ($List) {
    $resp = Invoke-RestMethod -Uri "$baseUrl/standup/entries?token=$token" -Method Get
    if (-not $resp.entries -or $resp.entries.Count -eq 0) {
        Write-Host "nothing logged since $($resp.week_start)" -ForegroundColor DarkGray
        exit 0
    }
    Write-Host "week of $($resp.week_start)" -ForegroundColor DarkGray
    foreach ($e in $resp.entries) {
        $day = ([datetime]$e.ts).ToString('ddd HH:mm')
        Write-Host ("  {0}  " -f $day) -ForegroundColor DarkGray -NoNewline
        Write-Host ("[{0}] " -f $e.tag) -ForegroundColor Cyan -NoNewline
        Write-Host $e.text
    }
    exit 0
}

# ── Log an entry ─────────────────────────────────────────
if (-not $Text -or $Text.Count -eq 0) {
    Write-Error 'Nothing to log. Usage: note.ps1 [-Tag progress|ai|gap|values|next] <what you did>'
    exit 1
}

$body = @{ text = ($Text -join ' '); tag = $Tag } | ConvertTo-Json -Compress

try {
    $null = Invoke-RestMethod -Uri "$baseUrl/standup/log?token=$token" `
        -Method Post -ContentType 'application/json' -Body $body
    Write-Host "logged [$Tag]" -ForegroundColor Green
} catch {
    Write-Error "Failed to reach the cyberdeck: $($_.Exception.Message)"
    exit 1
}
