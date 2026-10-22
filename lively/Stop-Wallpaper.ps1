param([int]$Monitor = 1, [string]$LivelyExe = (Join-Path $env:LOCALAPPDATA 'Programs\Lively Wallpaper\Lively.exe'))
$ErrorActionPreference = 'Stop'
if (-not (Test-Path -LiteralPath $LivelyExe)) { throw 'Lively.exe bulunamadı; -LivelyExe parametresiyle konumunu belirtin.' }
Start-Process -FilePath $LivelyExe -ArgumentList ('closewp --monitor ' + $Monitor) -WindowStyle Hidden
