Add-Type @'
using System;using System.Runtime.InteropServices;public class NativeMouseTest{[DllImport("user32.dll")]public static extern bool SetCursorPos(int x,int y);[DllImport("user32.dll")]public static extern void mouse_event(uint flags,uint dx,uint dy,uint data,UIntPtr extra);}
'@
$shell=New-Object -ComObject Shell.Application
$shell.MinimizeAll()
try{
Start-Sleep -Milliseconds 600
[void][NativeMouseTest]::SetCursorPos(80,500)
[NativeMouseTest]::mouse_event(2,0,0,0,[UIntPtr]::Zero)
Start-Sleep -Milliseconds 100
for($i=1;$i -le 10;$i++){[NativeMouseTest]::mouse_event(1,8,0,0,[UIntPtr]::Zero);Start-Sleep -Milliseconds 20}
[NativeMouseTest]::mouse_event(4,0,0,0,[UIntPtr]::Zero)
Start-Sleep -Milliseconds 300
}finally{$shell.UndoMinimizeAll()}

