using System.Runtime.InteropServices;
using System.Text;
namespace Hafiza.Desktop;
// Forward only primary desktop left pointer input. Never inspects keyboard or other applications.
internal sealed class DesktopPointer : IDisposable
{
    readonly Proc callback; readonly Action<string,int,int> send;readonly Func<bool> enabled;readonly Rectangle bounds;IntPtr hook;bool down;long lastMove;
    public DesktopPointer(Rectangle bounds,Func<bool> enabled,Action<string,int,int> send){this.bounds=bounds;this.enabled=enabled;this.send=send;callback=OnMouse;hook=SetWindowsHookEx(14,callback,GetModuleHandle(null),0);if(hook==IntPtr.Zero)throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());}
    IntPtr OnMouse(int code,IntPtr message,IntPtr data){try{if(code>=0){int type=message.ToInt32();var p=Marshal.PtrToStructure<Mouse>(data).point;bool desktop=IsDesktop(WindowFromPoint(p));if(enabled()&&bounds.Contains(p.x,p.y)&&desktop&&(type==0x200||type==0x201||type==0x202)){if(type==0x201){down=true;send("mousePressed",p.x-bounds.X,p.y-bounds.Y);}else if(type==0x202){send("mouseReleased",p.x-bounds.X,p.y-bounds.Y);down=false;}else if(Environment.TickCount64-lastMove>=16){lastMove=Environment.TickCount64;send(down?"drag":"mouseMoved",p.x-bounds.X,p.y-bounds.Y);}if(type!=0x200)return new IntPtr(1);}else if(down&&(type==0x202||!enabled()||!desktop)){down=false;send("mouseReleased",Math.Clamp(p.x-bounds.X,0,bounds.Width-1),Math.Clamp(p.y-bounds.Y,0,bounds.Height-1));}}}catch{}return CallNextHookEx(hook,code,message,data);}
    static bool IsDesktop(IntPtr w){var s=new StringBuilder(64);GetClassName(w,s,64);if(s.ToString()=="SysListView32")return false;var root=GetAncestor(w,2);GetClassName(root,s,64);GetWindowThreadProcessId(root,out uint pid);GetWindowThreadProcessId(GetShellWindow(),out uint shell);return pid==(uint)Environment.ProcessId||pid==shell&&(s.ToString()=="Progman"||s.ToString()=="WorkerW");}
    public void Dispose(){if(hook!=IntPtr.Zero)UnhookWindowsHookEx(hook);hook=IntPtr.Zero;GC.KeepAlive(callback);}
    delegate IntPtr Proc(int code,IntPtr message,IntPtr data);
    [StructLayout(LayoutKind.Sequential)]struct P{public int x,y;}
    [StructLayout(LayoutKind.Sequential)]struct Mouse{public P point;public uint mouseData,flags,time;public UIntPtr extra;}
    [DllImport("user32.dll",SetLastError=true)]static extern IntPtr SetWindowsHookEx(int id,Proc proc,IntPtr module,uint thread);
    [DllImport("user32.dll")]static extern bool UnhookWindowsHookEx(IntPtr hook);
    [DllImport("user32.dll")]static extern IntPtr CallNextHookEx(IntPtr hook,int code,IntPtr message,IntPtr data);
    [DllImport("kernel32.dll",CharSet=CharSet.Unicode)]static extern IntPtr GetModuleHandle(string? name);
    [DllImport("user32.dll")]static extern IntPtr WindowFromPoint(P p);
    [DllImport("user32.dll")]static extern IntPtr GetAncestor(IntPtr w,uint flags);
    [DllImport("user32.dll",CharSet=CharSet.Unicode)]static extern int GetClassName(IntPtr w,StringBuilder s,int size);
    [DllImport("user32.dll")]static extern uint GetWindowThreadProcessId(IntPtr w,out uint pid);
    [DllImport("user32.dll")]static extern IntPtr GetShellWindow();[DllImport("user32.dll")]static extern IntPtr GetForegroundWindow();
}



