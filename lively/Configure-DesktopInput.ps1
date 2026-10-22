param(
    [string]$LivelyExe = (Join-Path $env:LOCALAPPDATA 'Programs\Lively Wallpaper\Lively.exe'),
    [switch]$DiagnosticPort
)
$ErrorActionPreference = 'Stop'
$settingsPath = Join-Path $env:LOCALAPPDATA 'Lively Wallpaper\Settings.json'
if (-not (Test-Path -LiteralPath $settingsPath)) { throw 'Lively ayar dosyası bulunamadı.' }
# Shut down gracefully before editing so Lively cannot overwrite the change at exit.
if (Get-Process -Name Lively -ErrorAction SilentlyContinue) {
    Start-Process -FilePath $LivelyExe -ArgumentList 'app --shutdown true' -WindowStyle Hidden
}
for ($attempt=0; $attempt -lt 30; $attempt++) {
    $main=Get-Process -Name Lively -ErrorAction SilentlyContinue
    if (-not $main) { break }
    Start-Sleep -Milliseconds 200
}
if (Get-Process -Name Lively -ErrorAction SilentlyContinue) { throw 'Lively kapanmadı; ayarlar değiştirilmedi.' }
$settings=Get-Content -LiteralPath $settingsPath -Raw | ConvertFrom-Json
$settings.InputForward=1
$settings.MouseInputMovAlways=$false
$settings | ConvertTo-Json -Depth 30 | Set-Content -LiteralPath $settingsPath -Encoding utf8
$oldArguments=$env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS
try {
    if ($DiagnosticPort) { $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS='--remote-debugging-port=47832' }
    Start-Process -FilePath $LivelyExe -ArgumentList 'app --showApp false' -WindowStyle Hidden
} finally {
    if ($null -eq $oldArguments) { Remove-Item Env:\WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS -ErrorAction SilentlyContinue }
    else { $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=$oldArguments }
}
