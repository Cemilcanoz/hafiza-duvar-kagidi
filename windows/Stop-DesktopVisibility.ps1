param([string]$Root=(Split-Path $PSScriptRoot -Parent))
$ErrorActionPreference='Stop'
$exe=Join-Path $PSScriptRoot 'DesktopVisibility\bin\Release\net10.0-windows\DesktopVisibility.exe'
if(Test-Path -LiteralPath $exe){
    & $exe $Root --stop
    for($attempt=0;$attempt -lt 40;$attempt++){
        if(-not(Get-Process DesktopVisibility -ErrorAction SilentlyContinue)){
            Start-Process -FilePath $exe -ArgumentList ('"'+$Root+'" --restore-only') -WindowStyle Hidden -Wait
            return
        }
        Start-Sleep -Milliseconds 100
    }
    throw 'Desktop visibility companion has not exited; original visibility lease is retained for recovery.'
}
