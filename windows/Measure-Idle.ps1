param([string]$Root = (Split-Path $PSScriptRoot -Parent), [int]$Seconds = 20)
$ErrorActionPreference = 'Stop'
$config=Get-Content (Join-Path $Root 'runtime\config.json') -Raw | ConvertFrom-Json
$headers=@{Authorization=('Bearer '+$config.token)}
$samples=@()
foreach($mode in @('graph','image')) {
    Invoke-RestMethod ('http://127.0.0.1:'+$config.port+'/api/mode') -Method Post -Headers $headers -ContentType application/json -Body (@{mode=$mode}|ConvertTo-Json) | Out-Null
    Start-Sleep -Seconds 2
    $all=Get-CimInstance Win32_Process
    $players=$all | Where-Object { $_.Name -like 'Lively*' -or $_.Name -eq 'Hafiza.Hotkey.exe' -or ($_.Name -eq 'msedgewebview2.exe' -and $_.CommandLine -like '*Lively Wallpaper*') }
    $ids=@($players.ProcessId)
    $bridge=Get-NetTCPConnection -State Listen -LocalPort $config.port -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty OwningProcess
    if($bridge){ $ids += $bridge }
    $before=@{}
    foreach($p in (Get-Process -Id $ids -ErrorAction SilentlyContinue)) { $before[$p.Id]=$p.TotalProcessorTime.TotalSeconds }
    $started=Get-Date
    Start-Sleep -Seconds $Seconds
    $elapsed=((Get-Date)-$started).TotalSeconds
    $rows=@(foreach($p in (Get-Process -Id $ids -ErrorAction SilentlyContinue)) {
        [pscustomobject]@{Name=$p.ProcessName;Id=$p.Id;CpuSeconds=[math]::Round(($p.TotalProcessorTime.TotalSeconds-$before[$p.Id]),4);OneCorePercent=[math]::Round(100*($p.TotalProcessorTime.TotalSeconds-$before[$p.Id])/$elapsed,3);WorkingSetMB=[math]::Round($p.WorkingSet64/1MB,1)}
    })
    $samples += [pscustomobject]@{Mode=$mode;SampleStart=$started.ToString('o');ElapsedSeconds=$elapsed;Processes=$rows}
}
Invoke-RestMethod ('http://127.0.0.1:'+$config.port+'/api/mode') -Method Post -Headers $headers -ContentType application/json -Body '{"mode":"graph"}' | Out-Null
$samples | ConvertTo-Json -Depth 5 | Set-Content (Join-Path $Root 'runtime\acceptance\windows-final-idle.json')
$samples | ConvertTo-Json -Depth 5
