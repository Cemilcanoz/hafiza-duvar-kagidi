param([string]$Root=(Split-Path $PSScriptRoot -Parent))
$exe=Join-Path $PSScriptRoot 'DesktopHost/bin/Release/net10.0-windows/Hafiza.Desktop.exe'
if(Test-Path -LiteralPath $exe){& $exe $Root --stop}
