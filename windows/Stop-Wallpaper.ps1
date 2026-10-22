$ErrorActionPreference='Stop'
& (Join-Path $PSScriptRoot 'Stop-Desktop.ps1')
& (Join-Path $PSScriptRoot 'Stop-DesktopVisibility.ps1')
& (Join-Path $PSScriptRoot 'Stop-Hotkey.ps1')
