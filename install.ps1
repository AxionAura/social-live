# SocialLive installer for Windows 10/11
#
#   irm https://raw.githubusercontent.com/AxionAura/social-live/main/install.ps1 | iex
#
# Provisions a user-local Node.js + FFmpeg runtime (no admin rights needed),
# downloads and builds SocialLive into %USERPROFILE%\.social-live, registers a
# Scheduled Task so the dashboard starts with Windows, and opens the browser.
#
# Flags:  -Uninstall   -Port 3000   -Dir "C:\path"   -NoService   -Update
param(
  [switch]$Uninstall,
  [switch]$Update,
  [switch]$NoService,
  [int]$Port = 3000,
  [string]$Dir = "$env:USERPROFILE\.social-live"
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'   # much faster Invoke-WebRequest
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$NodeVersion = '22.14.0'
$RepoUrl      = 'https://github.com/AxionAura/social-live'
$RuntimeDir   = Join-Path $Dir 'runtime'

function Write-Step([string]$msg)  { Write-Host "`n[install] $msg" -ForegroundColor Cyan }
function Write-Info([string]$msg)  { Write-Host "[install] $msg" }
function Write-Warn2([string]$msg) { Write-Host "[warn] $msg" -ForegroundColor Yellow }
function Die([string]$msg)         { Write-Host "[error] $msg" -ForegroundColor Red; exit 1 }

function Get-LatestHtml([string]$url, [string]$out) {
  Invoke-WebRequest -Uri $url -OutFile $out -UseBasicParsing
}

# ────────────────────────── uninstall ──────────────────────────
if ($Uninstall) {
  Write-Step "Uninstalling SocialLive from $Dir"
  $ErrorActionPreference = 'Continue'
  schtasks /delete /tn "SocialLive" /f 2>$null | Out-Null
  Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -like "*$Dir*" } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
  if (Test-Path "$env:APPDATA\Microsoft\Windows\Start Menu\Programs\SocialLive.lnk") { Remove-Item "$env:APPDATA\Microsoft\Windows\Start Menu\Programs\SocialLive.lnk" -Force }
  if (Test-Path "$env:LOCALAPPDATA\Microsoft\WindowsApps\social-live.cmd") { Remove-Item "$env:LOCALAPPDATA\Microsoft\WindowsApps\social-live.cmd" -Force }
  if (Test-Path $Dir) { Remove-Item $Dir -Recurse -Force }
  Write-Info "Removed. Your dashboard data went with $Dir — the encryption key too."
  exit 0
}

# ────────────────────────── update path ──────────────────────────
if ($Update) {
  if (-not (Test-Path $Dir)) { Die "SocialLive is not installed at $Dir — run the installer first." }
  Write-Step "Updating SocialLive in $Dir"
  & (Join-Path $env:LOCALAPPDATA 'Microsoft\WindowsApps\social-live.cmd') stop 2>$null | Out-Null
}

# ────────────────────────── Node.js runtime ──────────────────────────
function Test-NodeOk {
  try {
    $v = & node -v 2>$null
    if (-not $v) { return $false }
    return [version]($v.TrimStart('v')) -ge [version]'22.13'
  } catch { return $false }
}

if (-not ($Update -and (Test-Path $RuntimeDir))) {
  if (Test-NodeOk) {
    Write-Step "Node.js $(& node -v) found — OK (needs >= 22.13)"
  } else {
    Write-Step "Downloading Node.js v$NodeVersion (portable, no admin needed)"
    $zip = "$env:TEMP\node-portable.zip"
    Get-LatestHtml "https://nodejs.org/dist/v$NodeVersion/node-v$NodeVersion-win-x64.zip" $zip
    New-Item -ItemType Directory -Force -Path $RuntimeDir | Out-Null
    $tmp = "$env:TEMP\node-extract"
    if (Test-Path $tmp) { Remove-Item $tmp -Recurse -Force }
    Expand-Archive -Path $zip -DestinationPath $tmp -Force
    Copy-Item "$tmp\node-v$NodeVersion-win-x64\*" $RuntimeDir -Recurse -Force
    Remove-Item $zip, $tmp -Recurse -Force -ErrorAction SilentlyContinue
    $env:Path = "$RuntimeDir;$env:Path"
    Write-Info "Node.js $(& node -v) provisioned at $RuntimeDir"
  }
}
$env:Path = "$RuntimeDir;$env:Path"

# ────────────────────────── FFmpeg runtime ──────────────────────────
if (-not (Get-Command ffmpeg -ErrorAction SilentlyContinue)) {
  Write-Step "Downloading FFmpeg (essential build, ~80 MB) — one time only"
  $zip = "$env:TEMP\ffmpeg.zip"
  Get-LatestHtml 'https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip' $zip
  $tmp = "$env:TEMP\ffmpeg-extract"
  if (Test-Path $tmp) { Remove-Item $tmp -Recurse -Force }
  Expand-Archive -Path $zip -DestinationPath $tmp -Force
  $bin = Get-ChildItem $tmp -Recurse -Filter 'ffmpeg.exe' | Select-Object -First 1
  if (-not $bin) { Die 'FFmpeg archive extracted but ffmpeg.exe not found.' }
  New-Item -ItemType Directory -Force -Path $RuntimeDir | Out-Null
  Copy-Item $bin.FullName $RuntimeDir -Force
  Copy-Item (Join-Path $bin.Directory 'ffprobe.exe') $RuntimeDir -Force
  Remove-Item $zip, $tmp -Recurse -Force -ErrorAction SilentlyContinue
  $env:Path = "$RuntimeDir;$env:Path"
  Write-Info "FFmpeg $(& ffmpeg -version | Select-Object -First 1) provisioned at $RuntimeDir"
} else {
  Write-Step "FFmpeg found — OK"
}

# ────────────────────────── application ──────────────────────────
$tag = 'main'
try {
  $tag = (Invoke-RestMethod 'https://api.github.com/repos/AxionAura/social-live/releases/latest').tag_name
} catch { Write-Warn2 'Could not read latest release tag — using main branch.' }

$srcTmp = "$env:TEMP\social-live-src"
if ($Update) {
  Write-Step "Downloading SocialLive $tag and updating sources"
} else {
  Write-Step "Downloading SocialLive $tag → $Dir"
}
$zip = "$env:TEMP\social-live-src.zip"
Get-LatestHtml "https://github.com/AxionAura/social-live/archive/refs/tags/$tag.zip" $zip
if (Test-Path $srcTmp) { Remove-Item $srcTmp -Recurse -Force }
Expand-Archive -Path $zip -DestinationPath $srcTmp -Force
$inner = Get-ChildItem $srcTmp -Directory | Select-Object -First 1

New-Item -ItemType Directory -Force -Path $Dir | Out-Null
# নতুন সোর্স কপি — data/ (ডাটাবেজ, ভিডিও, key) অক্ষত রেখে
Get-ChildItem "$($inner.FullName)" -Exclude 'data' | Copy-Item -Destination $Dir -Recurse -Force
Remove-Item $zip, $srcTmp -Recurse -Force -ErrorAction SilentlyContinue

Write-Step 'Installing dependencies (npm ci) — a couple of minutes'
Push-Location $Dir
try {
  $ErrorActionPreference = 'Continue'   # npm writes to stderr; don't turn that into a terminating error
  & npm.cmd ci --no-audit --no-fund
  if ($LASTEXITCODE -ne 0) { Die 'npm ci failed.' }
  Write-Step 'Building (typecheck + web bundle + server) — a minute or two'
  & npm.cmd run build
  if ($LASTEXITCODE -ne 0) { Die 'build failed.' }
} finally { Pop-Location; $ErrorActionPreference = 'Stop' }

# .env: port + data dir — secrets are auto-generated by the server on first start
$envPath = Join-Path $Dir '.env'
if (-not (Test-Path $envPath)) {
  $dataDir = ($Dir -replace '\\', '/') + '/data'
  "APP_PORT=$Port`nDATA_DIR=$dataDir" | Set-Content -Path $envPath -Encoding Ascii
}

# ────────────────────────── control shim ──────────────────────────
$shimDir = "$env:LOCALAPPDATA\Microsoft\WindowsApps"
New-Item -ItemType Directory -Force -Path $shimDir | Out-Null
@"
@echo off
setlocal
set "SOCIAL_LIVE_DIR=$Dir"
set "PATH=$RuntimeDir;%PATH%"
cd /d "$Dir"
for /f "usebackq eol=# tokens=1,* delims==" %%a in ("%envPath%") do set "%%a=%%b"
if /i "%~1"=="update" (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%Dir%\install.ps1" -Update
  exit /b %errorlevel%
)
node scripts\social-live.mjs %*
"@ | Set-Content -Path "$shimDir\social-live.cmd" -Encoding Ascii
Write-Info "Control command installed: social-live (start | stop | status | doctor | update)"

# helper: hidden server launcher used by the Scheduled Task
@"
`$env:Path = "$RuntimeDir;`$env:Path"
Set-Location "$Dir"
Get-Content "$envPath" | ForEach-Object {
  if (`$_ -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*`$') { Set-Item -Path ("env:" + `$Matches[1]) -Value `$Matches[2] }
}
node apps\server\dist\index.js
"@ | Set-Content -Path "$Dir\start-server.ps1" -Encoding Ascii

# ────────────────────────── autostart + launch ──────────────────────────
if (-not $NoService) {
  Write-Step 'Registering Scheduled Task (starts with Windows, hidden window)'
  $action  = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$Dir\start-server.ps1`""
  $trigger = New-ScheduledTaskTrigger -AtLogOn
  Register-ScheduledTask -TaskName 'SocialLive' -Action $action -Trigger $trigger -Force | Out-Null
}

Write-Step 'Starting SocialLive'
Start-Process powershell -WindowStyle Hidden -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$Dir\start-server.ps1`""
$ok = $false
foreach ($i in 1..20) {
  Start-Sleep -Milliseconds 700
  try {
    $r = Invoke-WebRequest "http://localhost:$Port/api/auth/status" -UseBasicParsing -TimeoutSec 2
    if ($r.StatusCode -eq 200) { $ok = $true; break }
  } catch {}
}

Start-Process "http://localhost:$Port"
Write-Host ''
Write-Step '──────────── SocialLive is ready ────────────'
if ($ok) { Write-Info "Dashboard:   http://localhost:$Port  (opened in your browser)" }
else     { Write-Warn2 "Server is warming up — open http://localhost:$Port in a moment." }
Write-Info "Install dir: $Dir"
Write-Info 'First step:  create the admin account, add a destination, upload a video.'
Write-Info 'Update:      social-live update        Uninstall: reinstall this script with -Uninstall'
Write-Warn2 'If Windows asks about firewall access for Node.js — click Allow (private networks).'
Write-Info "Keys live in $Dir\data\config\ — back that folder up."
