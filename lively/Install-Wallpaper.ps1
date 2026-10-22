param(
    [string]$Root = (Split-Path $PSScriptRoot -Parent),
    [string]$LivelyExe,
    [string]$LibraryRoot,
    [int]$Monitor = 0,
    [switch]$PrepareOnly
)
$ErrorActionPreference = 'Stop'
$config = Get-Content -LiteralPath (Join-Path $Root 'runtime\config.json') -Raw | ConvertFrom-Json
$settingsPath = Join-Path $env:LOCALAPPDATA 'Lively Wallpaper\Settings.json'
if (-not $LibraryRoot) {
    if (Test-Path -LiteralPath $settingsPath) {
        $settings = Get-Content -LiteralPath $settingsPath -Raw | ConvertFrom-Json
        $LibraryRoot = $settings.WallpaperDir
    }
    if (-not $LibraryRoot) { $LibraryRoot = Join-Path $env:LOCALAPPDATA 'Lively Wallpaper\Library' }
}
$package = Join-Path $LibraryRoot 'wallpapers\hafiza-duvar-kagidi'
New-Item -ItemType Directory -Path $package -Force | Out-Null
$metadata = [ordered]@{
    AppVersion = '2.2.1.0'
    Title = 'Hafıza Duvar Kâğıdı'
    Desc = 'Obsidian MetadataCache bağlantı grafı ve aynı sahnede resim geçişi.'
    Author = 'CemoOS'
    Type = 3
    FileName = ('http://127.0.0.1:' + $config.port + '/?wallpaper=1')
    Arguments = '--pause-event true'
    IsAbsolutePath = $true
    Version = 1
}
$metadata | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $package 'LivelyInfo.json') -Encoding utf8
Write-Output ('Lively package prepared: ' + $package)
if ($PrepareOnly) { return }
if (-not $LivelyExe) {
    $candidates = @(
        (Join-Path $env:LOCALAPPDATA 'Programs\Lively Wallpaper\Lively.exe'),
        (Join-Path $env:ProgramFiles 'Lively Wallpaper\Lively.exe'),
        (Join-Path ${env:ProgramFiles(x86)} 'Lively Wallpaper\Lively.exe')
    )
    $LivelyExe = $candidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
}
if (-not $LivelyExe) { throw 'Lively.exe bulunamadı. Lively kurulumunu tamamlayıp -LivelyExe ile konumunu belirtin.' }
# No monitor flag means primary display; changing wallpapers is done only at startup.
$arguments = 'setwp --file "' + $package + '"'
if ($Monitor -gt 0) { $arguments += ' --monitor ' + $Monitor }
Start-Process -FilePath $LivelyExe -ArgumentList $arguments -WindowStyle Hidden
