using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace Hafiza.Desktop;
internal static class Program
{
    [STAThread] static void Main(string[] args)
    {
        string root=Path.GetFullPath(args.FirstOrDefault(x=>!x.StartsWith("--"))??throw new ArgumentException("Project root required"));
        string identity=Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(root.ToLowerInvariant())))[..16];
        string name=@"Local\HafizaDesktop."+identity;
        if(args.Contains("--stop")){try{using var e=EventWaitHandle.OpenExisting(name+".Stop");e.Set();}catch(WaitHandleCannotBeOpenedException){}return;}
        using var mutex=new Mutex(true,name,out bool first);if(!first)return;
        Application.SetHighDpiMode(HighDpiMode.PerMonitorV2);
        Application.EnableVisualStyles();
        try { using var form=new DesktopForm(root,args.Contains("--debug"),!(args.Contains("--debug")&&args.Contains("--test-no-helper-watchdog")));using var stop=new EventWaitHandle(false,EventResetMode.ManualReset,name+".Stop");
            var wait=ThreadPool.RegisterWaitForSingleObject(stop,(_,_)=>{if(form.IsHandleCreated)form.BeginInvoke(form.Close);},null,-1,true);
            try{Application.Run(form);}finally{wait.Unregister(null);}
        }catch(Exception ex){File.AppendAllText(Path.Combine(root,"runtime","desktop-host.log"),ex+Environment.NewLine);}
        finally{mutex.ReleaseMutex();}
    }
}
internal sealed class DesktopForm : Form
{
    readonly string root; readonly bool debug; readonly bool supervise; readonly WebView2 web=new(){Dock=DockStyle.Fill};
    readonly System.Windows.Forms.Timer monitor=new(){Interval=2000};
    DateTime lastHelperStart=DateTime.MinValue;
    IntPtr shellParent; int shellPid; DesktopPointer? pointer; bool graph; readonly System.Windows.Forms.Timer stateTimer=new(){Interval=200};
    public DesktopForm(string root,bool debug,bool supervise){this.root=root;this.debug=debug;this.supervise=supervise;Text="Hafýza Desktop";FormBorderStyle=FormBorderStyle.None;ShowInTaskbar=false;StartPosition=FormStartPosition.Manual;Bounds=Screen.PrimaryScreen!.Bounds;Controls.Add(web);Shown+=Initialize;monitor.Tick+=(_,_)=>{try{if(!IsWindow(shellParent)||GetOwner(shellParent)!=shellPid)Attach();EnsureVisibilityHelper();}catch(Exception ex){Log(ex.Message);Close();}};}
    protected override bool ShowWithoutActivation=>true;
    protected override CreateParams CreateParams{get{var p=base.CreateParams;p.ExStyle|=0x08000000|0x80;return p;}}
    async void Initialize(object? sender,EventArgs args){try{
        EnsureVisibilityHelper();Attach();
        using var cfg=JsonDocument.Parse(File.ReadAllText(Path.Combine(root,"runtime/config.json")));int port=cfg.RootElement.GetProperty("port").GetInt32();
        string origin=$"http://127.0.0.1:{port}";
        var environment=await CoreWebView2Environment.CreateAsync(null,Path.Combine(root,"runtime/webview2"),new CoreWebView2EnvironmentOptions(debug?"--remote-debugging-port=47832 --remote-debugging-address=127.0.0.1":null));
        await web.EnsureCoreWebView2Async(environment);
        web.CoreWebView2.Settings.AreDefaultContextMenusEnabled=false;web.CoreWebView2.Settings.AreDevToolsEnabled=debug;web.CoreWebView2.Settings.IsStatusBarEnabled=false;
        web.CoreWebView2.NavigationStarting+=(_,e)=>{if(!e.Uri.StartsWith(origin+"/",StringComparison.Ordinal))e.Cancel=true;};
        web.CoreWebView2.NewWindowRequested+=(_,e)=>{e.Handled=true;if(e.Uri==origin+"/"||e.Uri==origin)Process.Start(new ProcessStartInfo(origin+"/"){UseShellExecute=true});};
        web.CoreWebView2.NavigationCompleted+=async (_,e)=>{try{Log("navigation success="+e.IsSuccess);if(e.IsSuccess){await Task.Delay(2500);if(IsDisposed||web.IsDisposed)return;Directory.CreateDirectory(Path.Combine(root,"runtime/acceptance"));using var output=File.Create(Path.Combine(root,"runtime/acceptance/native-desktop.png"));await web.CoreWebView2.CapturePreviewAsync(CoreWebView2CapturePreviewImageFormat.Png,output);}}catch(Exception ex){if(!IsDisposed)Log("preview: "+ex.Message);}};
        stateTimer.Tick+=async (_,_)=>{try{graph=(await web.ExecuteScriptAsync("window.hafiza?.diagnostics().target"))=="\"graph\"";}catch{graph=false;}};stateTimer.Start();pointer=new DesktopPointer(Screen.PrimaryScreen!.Bounds,()=>graph,(type,x,y)=>BeginInvoke(async ()=>{try{double scale=DeviceDpi/96.0;await web.CoreWebView2.CallDevToolsProtocolMethodAsync("Input.dispatchMouseEvent",JsonSerializer.Serialize(new{type=type=="drag"?"mouseMoved":type,x=x/scale,y=y/scale,button=type=="mouseMoved"?"none":"left",buttons=type=="drag"||type=="mousePressed"?1:0,clickCount=type=="mousePressed"||type=="mouseReleased"?1:0}));}catch(Exception ex){Log("pointer: "+ex.Message);}}));web.Source=new Uri(origin+"/?wallpaper=1&host=native");monitor.Start();Log("ready pid="+Environment.ProcessId+" parent="+shellParent+" size="+ClientSize);
    }catch(Exception ex){Log(ex.ToString());Close();}}
    void EnsureVisibilityHelper(){
        if(!supervise)return;
        string exe=Path.GetFullPath(Path.Combine(root,"windows/DesktopVisibility/bin/Release/net10.0-windows/DesktopVisibility.exe"));
        foreach(var process in Process.GetProcessesByName("DesktopVisibility")){using(process){try{if(string.Equals(process.MainModule?.FileName,exe,StringComparison.OrdinalIgnoreCase))return;}catch{}}}
        if(DateTime.UtcNow-lastHelperStart<TimeSpan.FromSeconds(5))return;
        lastHelperStart=DateTime.UtcNow;if(!File.Exists(exe))throw new FileNotFoundException("Visibility helper missing; run Start.ps1 -Wallpaper",exe);
        Process.Start(new ProcessStartInfo(exe){Arguments="\""+root+"\"",UseShellExecute=false,CreateNoWindow=true});Log("restarted visibility helper");
    }
    void Attach(){
        var progman=FindWindow("Progman",null);if(progman==IntPtr.Zero)throw new InvalidOperationException("Explorer desktop unavailable");
        SendMessageTimeout(progman,0x052c,new UIntPtr(0xd),new IntPtr(1),0,1000,out _);
        IntPtr parent=IntPtr.Zero;
        EnumWindows((window,_)=>{if(FindWindowEx(window,IntPtr.Zero,"SHELLDLL_DefView",null)!=IntPtr.Zero){parent=FindWindowEx(IntPtr.Zero,window,"WorkerW",null);}return true;},IntPtr.Zero);
        // Newer Windows 11 shells can keep the wallpaper WorkerW as a Progman child.
        if(parent==IntPtr.Zero)parent=FindWindowEx(progman,IntPtr.Zero,"WorkerW",null);
        if(parent==IntPtr.Zero)throw new InvalidOperationException("No wallpaper WorkerW found; refusing a foreground window");
        long style=GetWindowLongPtr(Handle,-16).ToInt64();SetWindowLongPtr(Handle,-16,new IntPtr((style&~0x80000000L)|0x40000000L));
        Marshal.SetLastPInvokeError(0);SetParent(Handle,parent);int error=Marshal.GetLastWin32Error();if(error!=0)throw new System.ComponentModel.Win32Exception(error,"Desktop parenting failed");
        shellParent=parent;shellPid=GetOwner(parent);var bounds=Screen.PrimaryScreen!.Bounds;var point=new Point(bounds.Left,bounds.Top);ScreenToClient(parent,ref point);SetWindowPos(Handle,IntPtr.Zero,point.X,point.Y,bounds.Width,bounds.Height,0x10|0x40);Log("attached shellPid="+shellPid);
    }
    void Log(string message)=>File.AppendAllText(Path.Combine(root,"runtime/desktop-host.log"),DateTimeOffset.Now.ToString("O")+" "+message+Environment.NewLine);
    static int GetOwner(IntPtr window){GetWindowThreadProcessId(window,out int pid);return pid;}
    protected override void Dispose(bool disposing){if(disposing){pointer?.Dispose();stateTimer.Dispose();monitor.Dispose();web.Dispose();}base.Dispose(disposing);}
    delegate bool EnumProc(IntPtr window,IntPtr data);
    [DllImport("user32.dll",CharSet=CharSet.Unicode)]static extern IntPtr FindWindow(string cls,string? title);
    [DllImport("user32.dll",CharSet=CharSet.Unicode)]static extern IntPtr FindWindowEx(IntPtr parent,IntPtr after,string cls,string? title);
    [DllImport("user32.dll")]static extern bool EnumWindows(EnumProc callback,IntPtr data);
    [DllImport("user32.dll",SetLastError=true)]static extern IntPtr SetParent(IntPtr child,IntPtr parent);
    [DllImport("user32.dll",EntryPoint="GetWindowLongPtrW")]static extern IntPtr GetWindowLongPtr(IntPtr window,int index);
    [DllImport("user32.dll",EntryPoint="SetWindowLongPtrW")]static extern IntPtr SetWindowLongPtr(IntPtr window,int index,IntPtr value);
    [DllImport("user32.dll")]static extern bool SetWindowPos(IntPtr window,IntPtr after,int x,int y,int width,int height,uint flags);
    [DllImport("user32.dll")]static extern bool ScreenToClient(IntPtr window,ref Point point);
    [DllImport("user32.dll")]static extern bool IsWindow(IntPtr window);
    [DllImport("user32.dll")]static extern uint GetWindowThreadProcessId(IntPtr window,out int pid);
    [DllImport("user32.dll")]static extern IntPtr SendMessageTimeout(IntPtr window,uint message,UIntPtr wparam,IntPtr lparam,uint flags,uint timeout,out UIntPtr result);
}


