param([string]$Root=(Split-Path $PSScriptRoot -Parent))
$ErrorActionPreference='Stop'
$project=Join-Path $PSScriptRoot 'DesktopVisibility/DesktopVisibility.csproj'
$exe=Join-Path $PSScriptRoot 'DesktopVisibility/bin/Release/net10.0-windows/DesktopVisibility.exe'
$exe=[IO.Path]::GetFullPath($exe)
$existing=Get-CimInstance Win32_Process -Filter "Name='DesktopVisibility.exe'" | Where-Object {$_.ExecutablePath -eq $exe}
if($existing){return}
$needsBuild=!(Test-Path -LiteralPath $exe)
if(!$needsBuild){$built=(Get-Item -LiteralPath $exe).LastWriteTimeUtc;$needsBuild=@(Get-ChildItem (Split-Path $project) -File|Where-Object {$_.Extension -in '.cs','.csproj' -and $_.LastWriteTimeUtc -gt $built}).Count -gt 0}
if($needsBuild){dotnet build $project -c Release --nologo *> (Join-Path $Root 'runtime/visibility-build.log');if($LASTEXITCODE -ne 0){throw 'Desktop visibility build failed. See runtime/visibility-build.log.'}}
$p=Start-Process -FilePath $exe -ArgumentList ('"'+$Root+'"') -WindowStyle Hidden -PassThru
Start-Sleep -Milliseconds 400
if($p.HasExited){throw 'Desktop visibility failed. See runtime/icon-visibility.log.'}
