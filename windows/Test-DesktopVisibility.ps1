param([string]$Root=(Split-Path $PSScriptRoot -Parent))
$ErrorActionPreference='Stop'
$exe=Join-Path $PSScriptRoot 'DesktopVisibility\bin\Release\net10.0-windows\DesktopVisibility.exe'
$config=Get-Content (Join-Path $Root 'runtime\config.json') -Raw|ConvertFrom-Json
$headers=@{Authorization=('Bearer '+$config.token)}
$evidence=[System.Collections.Generic.List[object]]::new()
function Command([string]$Operation){$p=Start-Process -FilePath $exe -ArgumentList ('"'+$Root+'" '+$Operation) -WindowStyle Hidden -Wait -PassThru;if($p.ExitCode -ne 0){throw ('Visibility utility failed: '+$Operation)}}
function Query {
    for($attempt=0;$attempt -lt 30;$attempt++){
        Command '--query'
        $snapshot=Get-Content (Join-Path $Root 'runtime\icon-visibility-query.json') -Raw|ConvertFrom-Json
        # Shell asynchronously repopulates its item collection when visibility changes.
        if($snapshot.iconCount -gt 0){return $snapshot}
        Start-Sleep -Milliseconds 100
    }
    throw 'Desktop Shell item enumeration did not settle.'
}
function Mode([string]$Mode){Invoke-RestMethod ('http://127.0.0.1:'+$config.port+'/api/mode') -Method Post -Headers $headers -ContentType application/json -Body (@{mode=$Mode}|ConvertTo-Json)|Out-Null}
function WaitHidden([bool]$Hidden){for($i=0;$i -lt 30;$i++){$s=Query;if($s.hidden -eq $Hidden){return $s};Start-Sleep -Milliseconds 100};throw ('Shell visibility did not become '+$Hidden)}
function Record([string]$Name,$Snapshot,[bool]$ExpectedHidden,$Baseline){
    $ok=$Snapshot.hidden -eq $ExpectedHidden -and $Snapshot.iconSize -eq $Baseline.iconSize -and $Snapshot.positionHash -eq $Baseline.positionHash -and $Snapshot.iconCount -eq $Baseline.iconCount -and $Snapshot.taskbarVisible -eq $Baseline.taskbarVisible -and (($Snapshot.flags -band (-bnot 0x1000)) -eq ($Baseline.flags -band (-bnot 0x1000)))
    $evidence.Add([pscustomobject]@{name=$Name;passed=$ok;expectedHidden=$ExpectedHidden;baseline=$Baseline;snapshot=$Snapshot})
    if(-not $ok){throw ('Visibility/preservation check failed: '+$Name)}
}
$originalLease=Join-Path $Root 'runtime\icon-visibility-lease.json'
$originalHidden=if(Test-Path $originalLease){(Get-Content $originalLease -Raw|ConvertFrom-Json).originalHidden}else{(Query).hidden}
try {
    foreach($baselineHidden in @($false,$true)){
        & (Join-Path $PSScriptRoot 'Stop-DesktopVisibility.ps1') -Root $Root
        Command $(if($baselineHidden){'--set-hidden'}else{'--set-visible'})
        $baseline=Query
        Mode graph
        & (Join-Path $PSScriptRoot 'Start-DesktopVisibility.ps1') -Root $Root
        Record ('baseline='+$baselineHidden+' graph hides') (WaitHidden $true) $true $baseline
        $lease=Get-Content $originalLease -Raw|ConvertFrom-Json
        if($lease.originalHidden -ne $baselineHidden){throw 'Wrong durable original baseline.'}
        $showClock=[System.Diagnostics.Stopwatch]::StartNew()
        Mode image
        $early=Query
        if($showClock.ElapsedMilliseconds -lt 450){Record ('baseline='+$baselineHidden+' image remains hidden during fade') $early $true $baseline}
        Record ('baseline='+$baselineHidden+' image shows explicit preference') (WaitHidden $false) $false $baseline
        $evidence.Add([pscustomobject]@{name=('baseline='+$baselineHidden+' image delay');passed=($showClock.ElapsedMilliseconds -ge 450);elapsedMilliseconds=$showClock.ElapsedMilliseconds})
        if((Get-Content $originalLease -Raw|ConvertFrom-Json).originalHidden -ne $baselineHidden){throw 'Image mode overwrote durable baseline.'}
        foreach($mode in @('graph','image','graph','image','graph')){Mode $mode}
        Record ('baseline='+$baselineHidden+' rapid final graph') (WaitHidden $true) $true $baseline
        Start-Sleep -Milliseconds 650
        Record ('baseline='+$baselineHidden+' cancelled old image show stays hidden') (WaitHidden $true) $true $baseline
        if(-not $baselineHidden){
            $owner=(Get-Content $originalLease -Raw|ConvertFrom-Json).ownerPid
            Stop-Process -Id $owner -Force
            & (Join-Path $PSScriptRoot 'Start-DesktopVisibility.ps1') -Root $Root
            Start-Sleep -Milliseconds 400
            Record 'crash startup recovers original then hides graph' (WaitHidden $true) $true $baseline
            if((Get-Content $originalLease -Raw|ConvertFrom-Json).originalHidden){throw 'Crash recovery lost visible original baseline.'}
        }
        & (Join-Path $PSScriptRoot 'Stop-DesktopVisibility.ps1') -Root $Root
        Record ('baseline='+$baselineHidden+' shutdown restores original') (WaitHidden $baselineHidden) $baselineHidden $baseline
    }
}finally{
    & (Join-Path $PSScriptRoot 'Stop-DesktopVisibility.ps1') -Root $Root
    Command $(if($originalHidden){'--set-hidden'}else{'--set-visible'})
    Mode graph
    & (Join-Path $PSScriptRoot 'Start-DesktopVisibility.ps1') -Root $Root
    $evidence | ConvertTo-Json -Depth 8 | Set-Content (Join-Path $Root 'runtime\acceptance\desktop-visibility-acceptance.json')
}
$evidence|Select-Object name,passed|Format-Table -AutoSize
