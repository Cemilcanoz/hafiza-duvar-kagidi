using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;

// Documented Shell COM interfaces; vtable slots verified against Microsoft's Win32 SDK headers.
internal sealed class DesktopFolder : IDisposable
{
    const uint NoIcons=0x1000;
    readonly List<IntPtr> release=[];
    IntPtr folder;
    internal record ItemPosition(string id,int x,int y);
    internal record Snapshot(bool hidden,uint flags,int iconSize,int mode,int iconCount,string positionHash,bool taskbarVisible,List<ItemPosition> positions);
    internal DesktopFolder()
    {
        try {
            var clsid=new Guid("9BA05972-F6A8-11CF-A442-00A0C90A8F39");var iid=new Guid("85CB6900-4D95-11CF-960C-0080C7F4EE85");
            Check(CoCreateInstance(ref clsid,0,4,ref iid,out var windows));release.Add(windows);
            IntPtr location=Marshal.AllocCoTaskMem(24),empty=Marshal.AllocCoTaskMem(24);
            IntPtr dispatch;
            try {for(int i=0;i<24;i++){Marshal.WriteByte(location,i,0);Marshal.WriteByte(empty,i,0);}Marshal.WriteInt16(location,3);Check(Method<FindDesktop>(windows,15)(windows,location,empty,8,out _,1,out dispatch));}
            finally{Marshal.FreeCoTaskMem(location);Marshal.FreeCoTaskMem(empty);}
            release.Add(dispatch);iid=new Guid("6D5140C1-7436-11CE-8034-00AA006009FA");Check(Marshal.QueryInterface(dispatch,in iid,out var service));release.Add(service);
            var sid=new Guid("4C96BE40-915C-11CF-99D3-00AA004AE837");iid=new Guid("000214E2-0000-0000-C000-000000000046");Check(Method<QueryService>(service,3)(service,ref sid,ref iid,out var browser));release.Add(browser);
            Check(Method<GetView>(browser,15)(browser,out var view));release.Add(view);iid=new Guid("1AF3A467-214F-4298-908E-06B03E0B39F9");Check(Marshal.QueryInterface(view,in iid,out folder));release.Add(folder);
        }catch{Dispose();throw;}
    }
    internal bool Hidden {get{Check(Method<GetFlags>(folder,25)(folder,out uint flags));return(flags&NoIcons)!=0;}}
    internal void SetHidden(bool hidden){if(Hidden==hidden)return;Check(Method<SetFlags>(folder,24)(folder,NoIcons,hidden?NoIcons:0));if(Hidden!=hidden)throw new InvalidOperationException("Shell did not apply icon visibility.");}
    internal Snapshot Capture()
    {
        Check(Method<GetFlags>(folder,25)(folder,out uint flags));Check(Method<GetMode>(folder,36)(folder,out int mode,out int size));Check(Method<ItemCount>(folder,7)(folder,2,out int count));
        var positions=new List<string>();var positionMap=new List<ItemPosition>();
        for(int i=0;i<count;i++){
            Check(Method<GetItem>(folder,6)(folder,i,out IntPtr pidl));
            try{
                Check(Method<GetPosition>(folder,11)(folder,pidl,out Point p));var iid=new Guid("43826D1E-E718-42EE-BC55-A1E261C37BFE");Check(Method<GetShellItem>(folder,29)(folder,i,ref iid,out var item));string name;
                try{Check(Method<GetName>(item,5)(item,0x80028000,out var text));try{name=Marshal.PtrToStringUni(text)??"";}finally{Marshal.FreeCoTaskMem(text);}}finally{Marshal.Release(item);}
                string identity=Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(name)));positions.Add(identity+":"+p.x+","+p.y);positionMap.Add(new ItemPosition(identity,p.x,p.y));
            }
            finally{Marshal.FreeCoTaskMem(pidl);}
        }
        positions.Sort(StringComparer.Ordinal);
        return new Snapshot((flags&NoIcons)!=0,flags,size,mode,count,Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(string.Join('\n',positions)))),IsWindowVisible(FindWindow("Shell_TrayWnd",null)),positionMap);
    }
    public void Dispose(){for(int i=release.Count-1;i>=0;i--)Marshal.Release(release[i]);release.Clear();}
    static void Check(int result)=>Marshal.ThrowExceptionForHR(result);
    static T Method<T>(IntPtr pointer,int slot)where T:Delegate=>Marshal.GetDelegateForFunctionPointer<T>(Marshal.ReadIntPtr(Marshal.ReadIntPtr(pointer),slot*IntPtr.Size));
    [StructLayout(LayoutKind.Sequential)]struct Point{public int x,y;}
    [UnmanagedFunctionPointer(CallingConvention.StdCall)]delegate int FindDesktop(IntPtr self,IntPtr location,IntPtr root,int type,out int hwnd,int options,out IntPtr dispatch);
    [UnmanagedFunctionPointer(CallingConvention.StdCall)]delegate int QueryService(IntPtr self,ref Guid service,ref Guid iid,out IntPtr result);
    [UnmanagedFunctionPointer(CallingConvention.StdCall)]delegate int GetView(IntPtr self,out IntPtr view);
    [UnmanagedFunctionPointer(CallingConvention.StdCall)]delegate int GetFlags(IntPtr self,out uint flags);
    [UnmanagedFunctionPointer(CallingConvention.StdCall)]delegate int SetFlags(IntPtr self,uint mask,uint flags);
    [UnmanagedFunctionPointer(CallingConvention.StdCall)]delegate int GetMode(IntPtr self,out int mode,out int size);
    [UnmanagedFunctionPointer(CallingConvention.StdCall)]delegate int ItemCount(IntPtr self,uint flags,out int count);
    [UnmanagedFunctionPointer(CallingConvention.StdCall)]delegate int GetItem(IntPtr self,int index,out IntPtr pidl);
    [UnmanagedFunctionPointer(CallingConvention.StdCall)]delegate int GetPosition(IntPtr self,IntPtr pidl,out Point point);
    [UnmanagedFunctionPointer(CallingConvention.StdCall)]delegate int GetShellItem(IntPtr self,int index,ref Guid iid,out IntPtr item);
    [UnmanagedFunctionPointer(CallingConvention.StdCall)]delegate int GetName(IntPtr self,uint flags,out IntPtr name);
    [DllImport("ole32.dll")]static extern int CoCreateInstance(ref Guid clsid,IntPtr outer,uint context,ref Guid iid,out IntPtr result);
    [DllImport("user32.dll",CharSet=CharSet.Unicode)]static extern IntPtr FindWindow(string className,string? title);
    [DllImport("user32.dll")]static extern bool IsWindowVisible(IntPtr window);
}
