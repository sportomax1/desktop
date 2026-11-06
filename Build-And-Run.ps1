param([switch]$SkipLaunch)
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
Write-Host ''
Write-Host 'FOUR MONITOR COMMAND CENTER - WINDOWS BUILD' -ForegroundColor Cyan
Write-Host '------------------------------------------------'
if (-not (Get-Command dotnet -ErrorAction SilentlyContinue)) {
  Write-Host 'The .NET SDK is missing. Install .NET 9 or 10 SDK for Windows x64.' -ForegroundColor Yellow
  exit 1
}
$project = Join-Path $PSScriptRoot 'WindowsHost\DenverFourMonitorWallpaper.csproj'
$staging = Join-Path $PSScriptRoot 'Published-Staging'
$publish = Join-Path $PSScriptRoot 'Published'
Write-Host 'Publishing self-contained Windows x64 application...'
dotnet publish $project -c Release -r win-x64 --self-contained true `
  -p:PublishSingleFile=false -p:PublishTrimmed=false -o $staging
if ($LASTEXITCODE -ne 0) { throw 'Build failed. Existing wallpaper left running. Copy compiler output for troubleshooting.' }
# Stop older wallpapers only after compilation succeeds.
$existing = @(Get-Process -Name 'DenverFourMonitorWallpaper','DenverSportsWallpaper' -ErrorAction SilentlyContinue)
if ($existing.Count -gt 0) {
  Write-Host 'Build succeeded. Stopping old wallpaper instances...' -ForegroundColor Yellow
  $existing | Stop-Process -Force -ErrorAction Stop
  Start-Sleep -Milliseconds 950
}
try {
  $stale = @(Get-CimInstance Win32_Process -Filter "Name = 'msedgewebview2.exe'" -ErrorAction Stop |
    Where-Object { $_.CommandLine -match 'Denver(FourMonitor|Sports)Wallpaper.*WebView2' })
  foreach ($item in $stale) { Stop-Process -Id $item.ProcessId -Force -ErrorAction SilentlyContinue }
  if ($stale.Count -gt 0) { Start-Sleep -Milliseconds 550 }
} catch { Write-Host 'Orphaned browser check skipped. Continuing.' -ForegroundColor DarkGray }
New-Item -ItemType Directory -Force -Path $publish | Out-Null
Copy-Item -Path (Join-Path $staging '*') -Destination $publish -Recurse -Force
Copy-Item (Join-Path $PSScriptRoot 'README.md') (Join-Path $publish 'README.md') -Force
$exe = Join-Path $publish 'DenverFourMonitorWallpaper.exe'
if (-not (Test-Path $exe)) { throw 'Published EXE not found.' }
Write-Host "Build complete: $exe" -ForegroundColor Green
Write-Host 'Right-click the tray icon and choose Monitor manager to assign screens.'
if (-not $SkipLaunch) { Start-Process -FilePath $exe }
