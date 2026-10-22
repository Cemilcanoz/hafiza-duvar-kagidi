using System.Runtime.InteropServices;
using System.Text.Json;

// Uses documented Shell COM APIs. Vtable indices verified against Microsoft Win32 SDK headers:
// https://github.com/microsoft/win32metadata/tree/main/generation/WinSDK/RecompiledIdlHeaders/um
internal static class Program
{
    [STAThread] static int Main(string[] args)
    {
        IntPtr windows=0,dispatch=0,service=0,browser=0,view=0,folder=0,location=0,empty=0;
        try {
            var clsid=new Guid("9BA05972-F6A8-11CF-A442-00A0C90A8F39");var iid=new Guid("85CB6900-4D95-11CF-960C-0080C7F4EE85");
            Check(CoCreateInstance(ref clsid,0,4,ref iid,out windows));
            location=Marshal.AllocCoTaskMem(24);empty=Marshal.AllocCoTaskMem(24);
            for(int i=0;i<24;i++){Marshal.WriteByte(location,i,0);Marshal.WriteByte(empty,i,0);}Marshal.WriteInt16(location,3); // VT_I4, CSIDL_DESKTOP=0.
            Check(Method<FindDesktop>(windows,15)(windows,location,empty,8,out _,1,out dispatch));
            iid=new Guid("6D5140C1-7436-11CE-8034-00AA006009FA");Check(Marshal.QueryInterface(dispatch,ref iid,out service));
            var sid=new Guid("4C96BE40-915C-11CF-99D3-00AA004AE837");iid=new Guid("000214E2-0000-0000-C000-000000000046");
            Check(Method<QueryService>(service,3)(service,ref sid,ref iid,out browser));
            Check(Method<GetView>(browser,15)(browser,out view));iid=new Guid("1AF3A467-214F-4298-908E-06B03E0B39F9");Check(Marshal.QueryInterface(view,ref iid,out folder));
            Check(Method<GetMode>(folder,36)(folder,out int modeBefore,out int sizeBefore));
            var positions=new List<(IntPtr pidl,Point position)>();
            Check(Method<ItemCount>(folder,7)(folder,2,out int count));
            try {
                for(int i=0;i<count;i++){Check(Method<GetItem>(folder,6)(folder,i,out IntPtr pidl));Check(Method<GetPosition>(folder,11)(folder,pidl,out Point position));positions.Add((pidl,position));}
                if(args.Contains("--set-small")){
                    Check(Method<SetMode>(folder,35)(folder,1,32)); // FVM_ICON, user-selected Small 32 px.
                    var ids=positions.Select(p=>p.pidl).ToArray();var points=positions.Select(p=>p.position).ToArray();
                    // Reapply positions only if Shell moved any, preserving desktop placement.
                    bool moved=false;foreach(var p in positions){Check(Method<GetPosition>(folder,11)(folder,p.pidl,out Point now));moved|=now.x!=p.position.x||now.y!=p.position.y;}
                    if(moved)Check(Method<PositionItems>(folder,16)(folder,(uint)ids.Length,ids,points,0x80));
                }
                Check(Method<GetMode>(folder,36)(folder,out int modeAfter,out int sizeAfter));
                bool preserved=true;foreach(var p in positions){Check(Method<GetPosition>(folder,11)(folder,p.pidl,out Point now));preserved&=now.x==p.position.x&&now.y==p.position.y;}
                Console.WriteLine(JsonSerializer.Serialize(new{sizeBefore,sizeAfter,modeBefore,modeAfter,iconCount=count,positionsPreserved=preserved,changed=args.Contains("--set-small")}));
                return args.Contains("--set-small")&&(sizeAfter!=32||!preserved)?1:0;
            }finally{foreach(var p in positions)Marshal.FreeCoTaskMem(p.pidl);}
        }catch(Exception ex){Console.Error.WriteLine(ex);return 1;}
        finally {foreach(var p in new[]{folder,view,browser,service,dispatch,windows})if(p!=0)Marshal.Release(p);if(location!=0)Marshal.FreeCoTaskMem(location);if(empty!=0)Marshal.FreeCoTaskMem(empty);}
    }
    static void Check(int result)=>Marshal.ThrowExceptionForHR(result);
    static T Method<T>(IntPtr pointer,int slot)where T:Delegate=>Marshal.GetDelegateForFunctionPointer<T>(Marshal.ReadIntPtr(Marshal.ReadIntPtr(pointer),slot*IntPtr.Size));
    [StructLayout(LayoutKind.Sequential)]struct Point{public int x,y;}
    [UnmanagedFunctionPointer(CallingConvention.StdCall)]delegate int FindDesktop(IntPtr self,IntPtr location,IntPtr root,int type,out int hwnd,int options,out IntPtr dispatch);
    [UnmanagedFunctionPointer(CallingConvention.StdCall)]delegate int QueryService(IntPtr self,ref Guid service,ref Guid iid,out IntPtr result);
    [UnmanagedFunctionPointer(CallingConvention.StdCall)]delegate int GetView(IntPtr self,out IntPtr view);
    [UnmanagedFunctionPointer(CallingConvention.StdCall)]delegate int GetMode(IntPtr self,out int mode,out int size);
    [UnmanagedFunctionPointer(CallingConvention.StdCall)]delegate int SetMode(IntPtr self,int mode,int size);
    [UnmanagedFunctionPointer(CallingConvention.StdCall)]delegate int ItemCount(IntPtr self,uint flags,out int count);
    [UnmanagedFunctionPointer(CallingConvention.StdCall)]delegate int GetItem(IntPtr self,int index,out IntPtr pidl);
    [UnmanagedFunctionPointer(CallingConvention.StdCall)]delegate int GetPosition(IntPtr self,IntPtr pidl,out Point position);
    [UnmanagedFunctionPointer(CallingConvention.StdCall)]delegate int PositionItems(IntPtr self,uint count,[MarshalAs(UnmanagedType.LPArray,SizeParamIndex=1)]IntPtr[] pidls,[MarshalAs(UnmanagedType.LPArray,SizeParamIndex=1)]Point[] points,uint flags);
    [DllImport("ole32.dll")]static extern int CoCreateInstance(ref Guid clsid,IntPtr outer,uint context,ref Guid iid,out IntPtr result);
}
