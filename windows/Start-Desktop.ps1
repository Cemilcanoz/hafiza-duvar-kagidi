param([string]$Root=(Split-Path $PSScriptRoot -Parent),[switch]$DebugHost)
$ErrorActionPreference='Stop'
$project=Join-Path $PSScriptRoot 'DesktopHost/Hafiza.Desktop.csproj'
$exe=Join-Path $PSScriptRoot 'DesktopHost/bin/Release/net10.0-windows/Hafiza.Desktop.exe'
& (Join-Path $PSScriptRoot 'Start-DesktopVisibility.ps1') -Root $Root
$exe=[IO.Path]::GetFullPath($exe)
$existing=Get-CimInstance Win32_Process -Filter "Name='Hafiza.Desktop.exe'" | Where-Object {$_.ExecutablePath -eq $exe}
if($existing){Write-Output 'Desktop host already running.';return}
$needsBuild=!(Test-Path -LiteralPath $exe)
if(!$needsBuild){$lastBuild=(Get-Item -LiteralPath $exe).LastWriteTimeUtc;$needsBuild=@(Get-ChildItem (Split-Path $project) -File | Where-Object {$_.Extension -in '.cs','.csproj' -and $_.LastWriteTimeUtc -gt $lastBuild}).Count -gt 0}
if($needsBuild){dotnet build $project -c Release --nologo *> (Join-Path $Root 'runtime/desktop-build.log');if($LASTEXITCODE -ne 0){throw 'Desktop host build failed. See runtime/desktop-build.log.'}}
$arguments='"'+$Root+'"'
if($DebugHost){$arguments+=' --debug'}
$process=Start-Process -FilePath $exe -ArgumentList $arguments -WindowStyle Hidden -PassThru
$connected=$false
for($i=0;$i -lt 40;$i++){
Start-Sleep -Milliseconds 200
if($process.HasExited){throw 'Desktop host failed. See runtime/desktop-host.log.'}
try{$config=Get-Content -LiteralPath (Join-Path $Root 'runtime/config.json') -Raw | ConvertFrom-Json;$state=Invoke-RestMethod ('http://127.0.0.1:'+$config.port+'/api/state') -TimeoutSec 1;if($state.wallpaperActive){$connected=$true;break}}catch{}
}
if(!$connected){throw 'Desktop host did not connect. See runtime/desktop-host.log.'}
Write-Output 'Native desktop host ready.'

