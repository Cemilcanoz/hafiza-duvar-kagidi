$ErrorActionPreference='Stop'
$root=Split-Path $PSScriptRoot -Parent
$exe=Join-Path $root 'windows/DesktopVisibility/bin/Release/net10.0-windows/DesktopVisibility.exe'
$fixture=Join-Path $root 'runtime/acceptance/visibility-fixture'
New-Item -ItemType Directory -Path (Join-Path $fixture 'runtime') -Force|Out-Null
$lease=Join-Path $fixture 'runtime/icon-visibility-lease.json'
$valid=@{schema=1;originalHidden=$false;acquiredAt=[DateTimeOffset]::Now.ToString('O');ownerPid=$PID}|ConvertTo-Json -Compress
[IO.File]::WriteAllText($lease+'.bak',$valid)
[IO.File]::WriteAllBytes($lease,[byte[]]::new(100))
$p=Start-Process $exe -ArgumentList ('"'+$fixture+'" --restore-only') -WindowStyle Hidden -PassThru -Wait
if($p.ExitCode -ne 0){throw 'Corrupt primary recovery failed'}
$corruptRecovered=!(Test-Path $lease)-and @(Get-ChildItem ($lease+'.corrupt-*')).Count -gt 0
[IO.File]::WriteAllText($lease+'.bak',$valid)
$p=Start-Process $exe -ArgumentList ('"'+$fixture+'" --restore-only') -WindowStyle Hidden -PassThru -Wait
$missingRecovered=$p.ExitCode -eq 0 -and !(Test-Path ($lease+'.bak'))
[IO.File]::WriteAllText($lease,'{"schema":1,"ownerPid":1,"acquiredAt":"2026-10-23T00:00:00Z"}')
$p=Start-Process $exe -ArgumentList ('"'+$fixture+'" --restore-only') -WindowStyle Hidden -PassThru -Wait
$missingBooleanRejected=$p.ExitCode -ne 0
Remove-Item -LiteralPath $lease
$old=Get-Process DesktopVisibility
Stop-Process -Id $old.Id -Force
Start-Sleep -Seconds 6
$new=Get-Process DesktopVisibility
$restarted=$new.Id -ne $old.Id
Start-Process $exe -ArgumentList ('"'+$root+'" --set-visible') -WindowStyle Hidden -Wait
Start-Sleep -Seconds 2
Start-Process $exe -ArgumentList ('"'+$root+'" --query') -WindowStyle Hidden -Wait
$query=Get-Content (Join-Path $root 'runtime/icon-visibility-query.json') -Raw|ConvertFrom-Json
$report=[ordered]@{corruptPrimaryRecovered=$corruptRecovered;missingPrimaryRecovered=$missingRecovered;missingBooleanRejected=$missingBooleanRejected;helperRestarted=$restarted;oldPid=$old.Id;newPid=$new.Id;forcedVisibleReconciled=$query.hidden;iconSize=$query.iconSize;positionHash=$query.positionHash}
$report|ConvertTo-Json|Set-Content (Join-Path $root 'runtime/acceptance/visibility-regression.json')
$report
if(!$corruptRecovered -or !$missingRecovered -or !$missingBooleanRejected -or !$restarted -or !$query.hidden){throw 'Visibility regression failed'}

