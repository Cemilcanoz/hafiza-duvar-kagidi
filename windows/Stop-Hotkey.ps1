param([string]$Root = (Split-Path $PSScriptRoot -Parent))
& (Join-Path $PSScriptRoot 'bin\Release\net10.0-windows\Hafiza.Hotkey.exe') $Root --stop
