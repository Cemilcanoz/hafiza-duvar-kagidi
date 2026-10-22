param([string]$Root = (Split-Path $PSScriptRoot -Parent))
$ErrorActionPreference = 'Stop'
$exe = Join-Path $PSScriptRoot 'bin\Release\net10.0-windows\Hafiza.Hotkey.exe'
if (-not (Test-Path -LiteralPath $exe)) {
    dotnet build (Join-Path $PSScriptRoot 'Hafiza.Hotkey.csproj') -c Release --nologo
    if ($LASTEXITCODE -ne 0) { throw 'Hotkey helper build failed.' }
}
Start-Process -FilePath $exe -ArgumentList ('"' + $Root + '"') -WindowStyle Hidden
