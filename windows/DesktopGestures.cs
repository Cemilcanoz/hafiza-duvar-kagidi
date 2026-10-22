using System.Diagnostics;
using System.Net.Http.Headers;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.Json;

// Only wheel messages are inspected. No keyboard hook, text capture or window activation.
internal sealed class DesktopGestures : IDisposable
{
    internal record Gesture(double factor, double xRatio, double yRatio);
    readonly Action<Gesture> send;
    readonly HookProc callback;
    readonly CancellationTokenSource stop = new();
    readonly HttpClient events = new() { Timeout = Timeout.InfiniteTimeSpan };
    readonly Task watcher;
    readonly object pendingGate=new();
    readonly Timer pendingTimer;
    bool pending;
    double pendingLog,pendingX,pendingY;
    IntPtr hook;
    volatile bool wallpaperConnected,graphMode;

    public DesktopGestures(int port, string token, Action<Gesture> send,Action<string> log)
    {
        this.send=send;
        pendingTimer=new Timer(_=>FlushPending(),null,Timeout.Infinite,Timeout.Infinite);
        events.DefaultRequestHeaders.Authorization=new AuthenticationHeaderValue("Bearer",token);
        callback=OnMouse;
        hook=SetWindowsHookEx(14,callback,GetModuleHandle(null),0); // WH_MOUSE_LL
        if(hook==IntPtr.Zero)throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error(),"Desktop gesture hook failed.");
        watcher=Task.Run(async()=>{
            while(!stop.IsCancellationRequested){
                try {
                    using var response=await events.GetAsync($"http://127.0.0.1:{port}/api/events",HttpCompletionOption.ResponseHeadersRead,stop.Token);
                    response.EnsureSuccessStatusCode();
                    using var reader=new StreamReader(await response.Content.ReadAsStreamAsync(stop.Token));
                    string type="";
                    while(await reader.ReadLineAsync(stop.Token) is string line){
                        if(line.StartsWith("event:"))type=line[6..].Trim();
                        else if(type=="mode"&&line.StartsWith("data:")){
                            using var data=JsonDocument.Parse(line[5..]);
                            graphMode=data.RootElement.GetProperty("mode").GetString()=="graph";
                            wallpaperConnected=data.RootElement.TryGetProperty("wallpaperActive",out var active)&&active.ValueKind==JsonValueKind.True;
                            ClearPending();
                            log($"gesture routing wallpaperActive={wallpaperConnected} graph={graphMode}");
                        }
                    }
                } catch(OperationCanceledException) when(stop.IsCancellationRequested){ break; }
                catch { /* Local bridge unavailable: pass wheel through until SSE reconnects. */ }
                finally { wallpaperConnected=false;ClearPending(); }
                try { await Task.Delay(750,stop.Token); } catch(OperationCanceledException){ break; }
            }
        });
    }
    IntPtr OnMouse(int code,IntPtr message,IntPtr data)
    {
        try { return HandleMouse(code,message,data); }
        catch { return CallNextHookEx(hook,code,message,data); }
    }
    IntPtr HandleMouse(int code,IntPtr message,IntPtr data)
    {
        if(code>=0&&message.ToInt64()==0x020A&&wallpaperConnected&&(graphMode||(GetAsyncKeyState(0x11)&0x8000)!=0)){
            var mouse=Marshal.PtrToStructure<MouseData>(data);
            if(IsDesktopAt(mouse.point)){
                short delta=unchecked((short)(mouse.mouseData>>16));
                if(delta!=0){
                    int width=GetSystemMetrics(0),height=GetSystemMetrics(1);
                    // Only primary monitor is supported by this prototype.
                    if(Policy(wallpaperConnected,graphMode,(GetAsyncKeyState(0x11)&0x8000)!=0,true,mouse.point.x>=0&&mouse.point.x<width&&mouse.point.y>=0&&mouse.point.y<height,delta)){
                        if(graphMode)Accumulate(delta,Math.Clamp((double)mouse.point.x/width,0,1),Math.Clamp((double)mouse.point.y/height,0,1));
                        return new IntPtr(1); // Consume before Explorer sees Ctrl+wheel/icon resize.
                    }
                }
            }
        }
        return CallNextHookEx(hook,code,message,data);
    }
    static bool IsDesktopAt(Point point)
    {
        IntPtr foreground=GetForegroundWindow();
        if(!IsShellDesktop(foreground))return false;
        return IsShellDesktop(GetAncestor(WindowFromPoint(point),2)); // GA_ROOT: reject taskbar/overlaid apps.
    }
    internal static double Factor(int delta)=>Math.Clamp(Math.Exp(delta*.0015),.5,2);
    void Accumulate(int delta,double x,double y){lock(pendingGate){pendingLog+=delta*.0015;pendingX=x;pendingY=y;if(!pending){pending=true;pendingTimer.Change(16,Timeout.Infinite);}}}
    void FlushPending(){Gesture? gesture=null;lock(pendingGate){if(pending&&wallpaperConnected&&graphMode)gesture=new Gesture(Math.Clamp(Math.Exp(pendingLog),.5,2),pendingX,pendingY);pending=false;pendingLog=0;}if(gesture is not null)send(gesture);}
    void ClearPending(){lock(pendingGate){pending=false;pendingLog=0;pendingTimer.Change(Timeout.Infinite,Timeout.Infinite);}}
    internal static bool Policy(bool active,bool graph,bool control,bool desktop,bool primary,int delta)=>active&&(graph||control)&&desktop&&primary&&delta!=0;
    internal static object TestPolicy(){
        var cases=new[]{
            ("graph wheel",true,true,false,true,true,120,true),
            ("graph pinch",true,true,true,true,true,120,true),
            ("image ordinary wheel",true,false,false,true,true,120,false),
            ("image pinch icon protection",true,false,true,true,true,120,true),
            ("wallpaper absent",false,true,true,true,true,120,false),
            ("other app",true,true,true,false,true,120,false),
            ("secondary monitor",true,true,true,true,false,120,false),
            ("zero delta",true,true,true,true,true,0,false)};
        return cases.Select(c=>new{name=c.Item1,passed=Policy(c.Item2,c.Item3,c.Item4,c.Item5,c.Item6,c.Item7)==c.Item8}).ToArray();
    }
    static bool IsShellDesktop(IntPtr window)
    {
        var name=new StringBuilder(64);
        GetClassName(window,name,name.Capacity);
        if(name.ToString() is not("Progman" or "WorkerW"))return false;
        GetWindowThreadProcessId(window,out uint owner);
        GetWindowThreadProcessId(GetShellWindow(),out uint shell);
        return owner!=0&&owner==shell;
    }
    public void Dispose(){wallpaperConnected=false;if(hook!=IntPtr.Zero){UnhookWindowsHookEx(hook);hook=IntPtr.Zero;}stop.Cancel();events.Dispose();watcher.GetAwaiter().GetResult();pendingTimer.Dispose();stop.Dispose();GC.KeepAlive(callback);}
    [StructLayout(LayoutKind.Sequential)] struct Point { public int x,y; }
    [StructLayout(LayoutKind.Sequential)] struct MouseData {public Point point;public uint mouseData,flags,time;public UIntPtr extra;}
    delegate IntPtr HookProc(int code,IntPtr message,IntPtr data);
    [DllImport("user32.dll",SetLastError=true)] static extern IntPtr SetWindowsHookEx(int type,HookProc callback,IntPtr module,uint thread);
    [DllImport("user32.dll")] static extern bool UnhookWindowsHookEx(IntPtr hook);
    [DllImport("user32.dll")] static extern IntPtr CallNextHookEx(IntPtr hook,int code,IntPtr message,IntPtr data);
    [DllImport("kernel32.dll",CharSet=CharSet.Unicode)] static extern IntPtr GetModuleHandle(string? module);
    [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] static extern IntPtr GetShellWindow();
    [DllImport("user32.dll")] static extern IntPtr WindowFromPoint(Point point);
    [DllImport("user32.dll")] static extern IntPtr GetAncestor(IntPtr window,uint flags);
    [DllImport("user32.dll",CharSet=CharSet.Unicode)] static extern int GetClassName(IntPtr window,StringBuilder name,int size);
    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr window,out uint pid);
    [DllImport("user32.dll")] static extern int GetSystemMetrics(int index);
    [DllImport("user32.dll")] static extern short GetAsyncKeyState(int key);
}
