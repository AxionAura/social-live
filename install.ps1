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
# ══ AxionInstaller v1 (auto-embedded — edit AxionInstaller/lib instead) ══
# ══════════════════════════════════════════════════════════════════
#  AxionInstaller — PowerShell UI library      v1.0 · AxionAura
#  Branded terminal UI for Windows installers (Windows 10/11).
#  Design tokens: indigo #6366f1 · violet #8b5cf6 · purple #a855f7 ·
#  fuchsia #d946ef · bg #06090f · fg #e6edf3 · muted #8b949e
#
#  Public API:
#    Initialize-Axion <Project Name> [Tagline]
#    Invoke-AxionStep -Label "..." -Script { ... }   (atom spinner)
#    Write-AxionInfo / Ok / Warn / Fail "msg"
#    Write-AxionBanner
#    Complete-Axion -Lines "a","b"
#  Rules:
#    • Call Initialize-Axion first. Non-interactive hosts fall back
#      to plain logs automatically (CI safe).
# ══════════════════════════════════════════════════════════════════

$script:AxProject = 'AxionInstaller'
$script:AxTagline = 'Open source by default. Free for everyone.'
$script:AxTty     = $false
$script:AxFrameIx = 0

$script:AxEsc    = [char]27
$script:AxIndigo = "$esc[38;2;99;102;241m"
$script:AxViolet = "$esc[38;2;139;92;246m"
$script:AxPurple = "$esc[38;2;168;85;247m"
$script:AxFuchsia= "$esc[38;2;217;70;239m"
$script:AxFg     = "$esc[38;2;230;237;243m"
$script:AxMuted  = "$esc[38;2;139;148;158m"
$script:AxDIM   = "$esc[38;2;48;54;61m"
$script:AxOk     = "$esc[38;2;63;185;80m"
$script:AxErr    = "$esc[38;2;248;81;73m"
$script:AxBold   = "$esc[1m"
$script:AxReset  = "$esc[0m"

$script:AxFrames = @(
"    ·────────·`n   ╱          ╲`n  ●────┼──────●`n   ╲          ╱`n    ·────────·",
"    ·───●────·`n   ╱     │    ╲`n  ·─────┼─────●`n   ╲    │    ╱`n    ·────────·",
"    ·──────·─·`n   ╱     │   ╲`n  ·──────┼────●`n   ╲    │    ╱`n    ·──●─────·",
"    ·──────·─●`n   ╱     │   ╲`n  ·──────┼────·`n   ╲    │    ╱`n    ·──●─────·",
"    ·──●─────·`n   ╱    │    ╲`n  ·─────┼─────·`n   ╲    │    ╱`n    ·────────●·",
"    ·────────·`n   ╱    ●    ╲`n  ●─────┼─────·`n   ╲    │    ╱`n    ·────────·"
)
$script:AxSpin = '⠋⠙⠹⠸⠼⠴⠦⠧'

function Initialize-Axion {
  param([string]$Project = 'AxionInstaller', [string]$Tagline = 'Open source by default. Free for everyone.')
  $script:AxProject = $Project
  $script:AxTagline = $Tagline
  $script:AxTty = $false
  try {
    if (-not [Console]::IsOutputRedirected) {
      # conhost-এ ANSI/VT enable — Windows Terminal-এ এটা ইতিমধ্যেই থাকে
      if (-not ('Win32.AxK32' -as [type])) {
        Add-Type -MemberDefinition @'
[DllImport("kernel32.dll", SetLastError=true)] public static extern IntPtr GetStdHandle(int nStdHandle);
[DllImport("kernel32.dll", SetLastError=true)] public static extern bool GetConsoleMode(IntPtr hConsoleHandle, out uint lpMode);
[DllImport("kernel32.dll", SetLastError=true)] public static extern bool SetConsoleMode(IntPtr hConsoleHandle, uint dwMode);
'@ -Name 'AxK32' -Namespace 'Win32' | Out-Null
      }
      $h = [Win32.AxK32]::GetStdHandle(-11)
      $mode = [uint32]0
      if ([Win32.AxK32]::GetConsoleMode($h, [ref]$mode) -and [Win32.AxK32]::SetConsoleMode($h, $mode -bor 0x0004)) {
        $script:AxTty = $true   # 0x0004 = ENABLE_VIRTUAL_TERMINAL_PROCESSING
      }
    }
  } catch { $script:AxTty = $false }
  # non-TTY/CI হলে সব রঙ খালি — প্লেইন লগ নিশ্চিত
  if (-not $script:AxTty) {
    foreach ($v in 'Indigo','Violet','Purple','Fuchsia','Fg','Muted','Ok','Err','Bold','Reset','Dim') {
      Set-Variable -Name "Ax$v" -Value '' -Scope Script
    }
  }
}

function Write-AxionInfo([string]$m) {
  if ($AxTty) { Write-Host "$AxViolet●$AxFg $m$AxReset" } else { Write-Host "● $m" }
}
function Write-AxionOk([string]$m) {
  if ($AxTty) { Write-Host "$AxOk✔$AxFg $m$AxReset" } else { Write-Host "✔ $m" }
}
function Write-AxionWarn([string]$m) {
  if ($AxTty) { Write-Host "$AxFuchsia▲$AxFg $m$AxReset" } else { Write-Host "▲ $m" }
}
function Write-AxionFail([string]$m) {
  if ($AxTty) { Write-Host "$AxErr✘$AxFg $m$AxReset" } else { Write-Host "✘ $m" }
}

function Write-AxionBanner {
  if (-not $AxTty) {
    Write-Host ("═" * 32); Write-Host "  $AxProject — $AxTagline"; Write-Host ("═" * 32); return
  }
  Write-Host @"

$AxDIM        ·────────·
       ╱    $AxPurple●$AxDIM     ╲
      $AxIndigo●$AxDIM──────┼──────$AxFuchsia●$AxDIM
       ╲          ╱
        ·────────·$AxReset

"@
  Write-Host "$AxBold$AxIndigo  Axion${AxPurple}Aura$AxFg  $AxReset${AxMuted}presents$AxReset"
  Write-Host "$AxBold$AxFg  $AxProject$AxReset  $AxMuted$AxTagline$AxReset`n"
}

function Invoke-AxionStep {
  param([string]$Label, [scriptblock]$Script)
  if (-not $AxTty) {
    Write-AxionInfo $Label
    try {
      & $Script
      $ok = ($null -eq $LASTEXITCODE -or $LASTEXITCODE -eq 0)
      if ($ok) { Write-AxionOk $Label } else { Write-AxionFail "$Label (exit $LASTEXITCODE)" }
      $script:AxLastStepOk = $ok
      return
    } catch {
      Write-AxionFail "$Label — $_"
      $script:AxLastStepOk = $false
      return
    }
  }
  $job = Start-Job -ScriptBlock $Script
  $si = 0
  Write-Host "$esc[?25l" -NoNewline
  while ($job.State -eq 'Running') {
    $frame = $AxFrames[$script:AxFrameIx % $AxFrames.Count]
    $script:AxFrameIx++
    $b = $AxSpin[$si % $AxSpin.Length]; $si++
    $lit = $frame -replace '●', "$AxPurple●$AxDIM"
    Write-Host "$esc[2K$esc[1A$esc[2K$esc[1A$esc[2K$esc[1A$esc[2K$esc[1A$esc[2K`r" -NoNewline
    Write-Host "$AxDIM  ────────────────────────────$AxReset"
    Write-Host "$AxDIM$lit$AxReset"
    Write-Host "$AxViolet$b$AxReset $AxFg$Label$AxReset $AxMuted…$AxReset" -NoNewline
    Start-Sleep -Milliseconds 120
  }
  $out = Receive-Job $job 2>&1
  $ok = ($job.State -eq 'Completed')
  Remove-Job $job -Force -ErrorAction SilentlyContinue
  Write-Host "$esc[2K$esc[1A$esc[2K$esc[1A$esc[2K$esc[1A$esc[2K$esc[1A$esc[2K`r$esc[?25h" -NoNewline
  if ($out) { $out | ForEach-Object { Write-Host "$AxMuted  | $_$AxReset" } }
  if ($ok) { Write-AxionOk $Label } else { Write-AxionFail "$Label (job $($job.State))" }
  $script:AxLastStepOk = $ok
}

function Complete-Axion {
  param([string[]]$Lines)
  Write-Host "$AxDIM  ────────────────────────────$AxReset"
  Write-Host "$AxOk  ✔$AxBold$AxFg  $AxProject is ready$AxReset"
  foreach ($l in $Lines) { Write-Host "$AxMuted  · $AxFg$l$AxReset" }
  Write-Host "$AxViolet  ── AxionAura · Open source by default. Free for everyone. ──$AxReset`n"
}

# ══ end AxionInstaller ══

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'   # much faster Invoke-WebRequest
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$NodeVersion = '22.14.0'
$RepoUrl      = 'https://github.com/AxionAura/social-live'
$RuntimeDir   = Join-Path $Dir 'runtime'

function Write-Step([string]$msg)  { Write-AxionInfo $msg }
function Write-Info([string]$msg)  { Write-AxionInfo $msg }
function Write-Warn2([string]$msg) { Write-AxionWarn $msg }
function Die([string]$msg)         { Write-AxionFail $msg; exit 1 }

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
# আগের install-এর runtime থাকলে PATH-এ বসাও — re-run দ্রুত হবে
if (Test-Path "$RuntimeDir\node.exe") { $env:Path = "$RuntimeDir;$env:Path" }
if (Test-Path "$RuntimeDir\ffmpeg.exe") { $env:Path = "$RuntimeDir;$env:Path" }

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
    Invoke-AxionStep -Label "Downloading Node.js v$NodeVersion (portable, no admin needed)" -Script {
      $zip = "$env:TEMP\node-portable.zip"
      Invoke-WebRequest -Uri "https://nodejs.org/dist/v$NodeVersion/node-v$NodeVersion-win-x64.zip" -OutFile $zip -UseBasicParsing
      New-Item -ItemType Directory -Force -Path $RuntimeDir | Out-Null
      $tmp = "$env:TEMP\node-extract"
      if (Test-Path $tmp) { Remove-Item $tmp -Recurse -Force }
      Expand-Archive -Path $zip -DestinationPath $tmp -Force
      Copy-Item "$tmp\node-v$NodeVersion-win-x64\*" $RuntimeDir -Recurse -Force
      Remove-Item $zip, $tmp -Recurse -Force -ErrorAction SilentlyContinue
    }
    $env:Path = "$RuntimeDir;$env:Path"
    Write-Info "Node.js $(& node -v) provisioned at $RuntimeDir"
  }
}
$env:Path = "$RuntimeDir;$env:Path"

# ────────────────────────── FFmpeg runtime ──────────────────────────
if (-not (Get-Command ffmpeg -ErrorAction SilentlyContinue)) {
  Invoke-AxionStep -Label 'Downloading FFmpeg (essential build, ~80 MB) — one time only' -Script {
    $zip = "$env:TEMP\ffmpeg.zip"
    Invoke-WebRequest -Uri 'https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip' -OutFile $zip -UseBasicParsing
    $tmp = "$env:TEMP\ffmpeg-extract"
    if (Test-Path $tmp) { Remove-Item $tmp -Recurse -Force }
    Expand-Archive -Path $zip -DestinationPath $tmp -Force
    $bin = Get-ChildItem $tmp -Recurse -Filter 'ffmpeg.exe' | Select-Object -First 1
    if (-not $bin) { throw 'ffmpeg.exe not found in archive' }
    New-Item -ItemType Directory -Force -Path $RuntimeDir | Out-Null
    Copy-Item $bin.FullName $RuntimeDir -Force
    Copy-Item (Join-Path $bin.Directory 'ffprobe.exe') $RuntimeDir -Force
    Remove-Item $zip, $tmp -Recurse -Force -ErrorAction SilentlyContinue
  }
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

if ($Update) {
  Write-Step "Updating SocialLive sources ($tag)"
} else {
  Write-Step "Downloading SocialLive $tag → $Dir"
}
# পুরো ডাউনলোড+এক্সট্র্যাক্ট+কপি job-এর ভেতরে self-contained —
# job-এর ভেতর থেকে parent scope-এ variable ফেরত যায় না
Invoke-AxionStep -Label "Downloading SocialLive $tag" -Script {
  $zip = "$env:TEMP\social-live-src.zip"
  Invoke-WebRequest -Uri "https://github.com/AxionAura/social-live/archive/refs/tags/$tag.zip" -OutFile $zip -UseBasicParsing
  $tmp = "$env:TEMP\social-live-src"
  if (Test-Path $tmp) { Remove-Item $tmp -Recurse -Force }
  Expand-Archive -Path $zip -DestinationPath $tmp -Force
  $inner = Get-ChildItem $tmp -Directory | Select-Object -First 1
  New-Item -ItemType Directory -Force -Path $Dir | Out-Null
  # data/ (ডাটাবেজ, ভিডিও, encryption key) অক্ষত রেখে সোর্স রিপ্লেস
  Get-ChildItem "$($inner.FullName)" -Exclude 'data' | Copy-Item -Destination $Dir -Recurse -Force
  Remove-Item $zip, $tmp -Recurse -Force -ErrorAction SilentlyContinue
}

Push-Location $Dir
try {
  $ErrorActionPreference = 'Continue'   # npm writes to stderr; don't turn that into a terminating error
  Initialize-Axion -Project 'SocialLive' -Tagline 'Self-hosted live streaming dashboard'
  Write-AxionBanner
  Invoke-AxionStep -Label 'Installing dependencies (npm ci)' -Script {
    Set-Location $using:Dir; & npm.cmd ci --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) { throw 'npm ci failed' }
  }
  Invoke-AxionStep -Label 'Building dashboard and server' -Script {
    Set-Location $using:Dir; & npm.cmd run build
    if ($LASTEXITCODE -ne 0) { throw 'build failed' }
  }
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
  Initialize-Axion -Project 'SocialLive' -Tagline 'Self-hosted live streaming dashboard'
Write-AxionBanner
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
if ($ok) { Write-AxionOk "Dashboard:   http://localhost:$Port  (opened in your browser)" }
else     { Write-AxionWarn "Server is warming up — open http://localhost:$Port in a moment." }
Complete-Axion -Lines @(
  "Install dir: $Dir",
  'First step:  create the admin account, add a destination, upload a video',
  'Update:      social-live update',
  'Uninstall:   reinstall install.ps1 with -Uninstall',
  'Firewall:    if Windows asks about Node.js — click Allow (private networks)',
  "Keys:        $Dir\data\config\ — back that folder up"
)
