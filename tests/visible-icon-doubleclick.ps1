$ErrorActionPreference='Stop'
$root=Split-Path $PSScriptRoot -Parent
$exe=Join-Path $root 'windows/DesktopVisibility/bin/Release/net10.0-windows/DesktopVisibility.exe'
$queryPath=Join-Path $root 'runtime/icon-visibility-query.json'
$shortcut=Join-Path ([Environment]::GetFolderPath('DesktopDirectory')) 'Hafiza-click-regression.lnk'
$marker=Join-Path $root 'runtime/acceptance/visible-icon-opened.txt'
if(Test-Path -LiteralPath $shortcut){throw 'Test shortcut already exists'}
Start-Process $exe -ArgumentList ('"'+$root+'" --query') -WindowStyle Hidden -Wait
$before=Get-Content $queryPath -Raw|ConvertFrom-Json
$ws=New-Object -ComObject WScript.Shell
$link=$ws.CreateShortcut($shortcut)
$link.TargetPath=(Get-Command powershell.exe).Source
$link.Arguments='-NoProfile -WindowStyle Hidden -Command "[IO.File]::WriteAllText('''+$marker+''',''opened'')"'
$link.WindowStyle=7
$link.Save()
Add-Type @'
using System;using System.Runtime.InteropServices;public class IconMouseRegression{[DllImport("user32.dll")]public static extern IntPtr SetThreadDpiAwarenessContext(IntPtr c);[DllImport("user32.dll")]public static extern bool SetCursorPos(int x,int y);[DllImport("user32.dll")]public static extern void mouse_event(uint flags,uint dx,uint dy,uint data,UIntPtr extra);}
'@
[void][IconMouseRegression]::SetThreadDpiAwarenessContext([IntPtr]::new(-4))
$shell=New-Object -ComObject Shell.Application
try{
Start-Sleep -Milliseconds 500
Start-Process $exe -ArgumentList ('"'+$root+'" --query') -WindowStyle Hidden -Wait
$after=Get-Content $queryPath -Raw|ConvertFrom-Json
$item=@($after.positions|Where-Object {$_.id -notin $before.positions.id})
if($item.Count -ne 1){throw 'Unable to identify temporary icon'}
$shell.MinimizeAll()
Start-Sleep -Milliseconds 300
Stop-Process -Name DesktopVisibility -Force
Start-Process $exe -ArgumentList ('"'+$root+'" --set-visible') -WindowStyle Hidden -Wait
Add-Type -AssemblyName System.Windows.Forms,System.Drawing
$bmp=[Drawing.Bitmap]::new(1920,1080);$g=[Drawing.Graphics]::FromImage($bmp);$g.CopyFromScreen([Drawing.Point]::Empty,[Drawing.Point]::Empty,[Drawing.Size]::new(1920,1080));$bmp.Save((Join-Path $root 'runtime/acceptance/visible-icon-diagnostic.png'));$g.Dispose();$bmp.Dispose()
# Shell IFolderView item positions use physical desktop coordinates.
[void][IconMouseRegression]::SetCursorPos(($item[0].x+16),($item[0].y+16))
for($i=0;$i -lt 2;$i++){
[IconMouseRegression]::mouse_event(2,0,0,0,[UIntPtr]::Zero)
[IconMouseRegression]::mouse_event(4,0,0,0,[UIntPtr]::Zero)
Start-Sleep -Milliseconds 80
}
Start-Sleep -Seconds 2
$passed=Test-Path -LiteralPath $marker
[ordered]@{nativeDoubleClickOpened=$passed;iconX=$item[0].x;iconY=$item[0].y}|ConvertTo-Json|Set-Content (Join-Path $root 'runtime/acceptance/visible-icon-doubleclick.json')
if(!$passed){throw 'Visible icon double-click failed'}
}finally{$shell.UndoMinimizeAll();Remove-Item -LiteralPath $shortcut -ErrorAction SilentlyContinue}


