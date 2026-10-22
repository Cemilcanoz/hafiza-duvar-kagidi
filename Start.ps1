param([switch]$Wallpaper)
$ErrorActionPreference = 'Stop'
$projectRoot = $PSScriptRoot
$configPath = Join-Path $projectRoot 'runtime/config.json'
if (!(Test-Path -LiteralPath $configPath)) { throw 'runtime/config.json missing. Run node server.js once to initialize.' }
$config = Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json
$url = 'http://127.0.0.1:' + $config.port
$running = $false
try { $null = Invoke-RestMethod -Uri ($url + '/api/state') -TimeoutSec 2; $running = $true } catch {}
if (!$running) {
    $nodePath = (Get-Command node.exe).Source
    Start-Process -FilePath $nodePath -ArgumentList @((Join-Path $projectRoot 'server.js')) -WorkingDirectory $projectRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $projectRoot 'runtime/server.log') -RedirectStandardError (Join-Path $projectRoot 'runtime/server-error.log')
    for ($attempt = 0; $attempt -lt 30; $attempt++) {
        try { $null = Invoke-RestMethod -Uri ($url + '/api/state') -TimeoutSec 1; $running = $true; break } catch { Start-Sleep -Milliseconds 200 }
    }
    if (!$running) { throw 'Bridge did not start. See runtime/server-error.log.' }
}
& (Join-Path $projectRoot 'windows/Start-Hotkey.ps1')
& (Join-Path $projectRoot 'windows/Start-DesktopVisibility.ps1')
if ($Wallpaper) { & (Join-Path $projectRoot 'windows/Start-Desktop.ps1') }
Write-Output ('Ready: ' + $url)

