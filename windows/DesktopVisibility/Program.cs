using System.Net.Http.Headers;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Threading.Channels;

internal static class Program
{
    record Authority(long revision,string mode,bool active);
    record Lease(int schema,bool originalHidden,DateTimeOffset acquiredAt,int ownerPid);
    static string root="",leasePath="",logPath="";
    static long latestRevision;
    [STAThread]static int Main(string[] args)
    {
        root=Path.GetFullPath(args.FirstOrDefault(x=>!x.StartsWith("--"))??Path.Combine(AppContext.BaseDirectory,"../../../../../"));
        leasePath=Path.Combine(root,"runtime","icon-visibility-lease.json");logPath=Path.Combine(root,"runtime","icon-visibility.log");Directory.CreateDirectory(Path.GetDirectoryName(logPath)!);
        string identity=Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(root.ToLowerInvariant())))[..16];string name=@"Local\HafizaDesktopVisibility."+identity;
        try {
            if(args.Contains("--query")){using var desktop=new DesktopFolder();File.WriteAllText(Path.Combine(root,"runtime","icon-visibility-query.json"),JsonSerializer.Serialize(desktop.Capture()));return 0;}
            if(args.Contains("--set-hidden")||args.Contains("--set-visible")){using var desktop=new DesktopFolder();desktop.SetHidden(args.Contains("--set-hidden"));return 0;}
            if(args.Contains("--stop")){try{using var stop=EventWaitHandle.OpenExisting(name+".Stop");stop.Set();}catch(WaitHandleCannotBeOpenedException){}return 0;}
            using var mutex=new Mutex(true,name,out bool first);if(!first)return 0;
            try {
                // A previous crash can leave icons hidden. Repair from durable baseline before accepting a new lease.
                Restore("startup recovery");
                if(args.Contains("--restore-only"))return 0;
                if(args.Contains("--set-hidden")||args.Contains("--set-visible")){using var desktop=new DesktopFolder();desktop.SetHidden(args.Contains("--set-hidden"));return 0;}
                using var config=JsonDocument.Parse(File.ReadAllText(Path.Combine(root,"runtime","config.json")));int port=config.RootElement.GetProperty("port").GetInt32();string token=config.RootElement.GetProperty("token").GetString()!;
                var channel=Channel.CreateBounded<Authority>(new BoundedChannelOptions(1){SingleReader=true,SingleWriter=false,FullMode=BoundedChannelFullMode.DropOldest});
                using var cancellation=new CancellationTokenSource();using var stopEvent=new EventWaitHandle(false,EventResetMode.ManualReset,name+".Stop");
                var stopWait=ThreadPool.RegisterWaitForSingleObject(stopEvent,(_,_)=>{cancellation.Cancel();channel.Writer.TryComplete();},null,-1,true);
                Task watcher=Watch(port,token,channel.Writer,cancellation.Token);Log("ready pid="+Environment.ProcessId);
                try {
                    Authority? current=null;Task<bool>? pendingRead=null;
                    while(!cancellation.IsCancellationRequested){
                        var available=pendingRead??=channel.Reader.WaitToReadAsync(cancellation.Token).AsTask();
                        try{Task.WhenAny(available,Task.Delay(1000,cancellation.Token)).GetAwaiter().GetResult();}catch(OperationCanceledException){break;}
                        if(available.IsCompleted)pendingRead=null;
                        if(channel.Reader.TryRead(out var update)){current=update;while(channel.Reader.TryRead(out var newer))current=newer;}
                        if(current is null)continue;var authority=current;
                        if(cancellation.IsCancellationRequested)break;
                        if(authority.revision!=Volatile.Read(ref latestRevision))continue;
                        try{if(authority.active)ApplyActive(authority.mode);else Restore("mode="+authority.mode+" active="+authority.active);}
                        catch(Exception ex){Log("apply failed, baseline retained: "+ex.Message);}
                    }
                }finally{cancellation.Cancel();stopWait.Unregister(null);watcher.GetAwaiter().GetResult();Restore("shutdown");}
                return 0;
            }finally{mutex.ReleaseMutex();}
        }catch(Exception ex){Log("error: "+ex.Message);return 1;}
    }
    static async Task Watch(int port,string token,ChannelWriter<Authority> writer,CancellationToken cancellation)
    {
        using var client=new HttpClient{Timeout=Timeout.InfiniteTimeSpan};client.DefaultRequestHeaders.Authorization=new AuthenticationHeaderValue("Bearer",token);
        int duration=500;
        try{using var stateTimeout=CancellationTokenSource.CreateLinkedTokenSource(cancellation);stateTimeout.CancelAfter(2000);using var state=JsonDocument.Parse(await client.GetStringAsync($"http://127.0.0.1:{port}/api/state",stateTimeout.Token));if(state.RootElement.TryGetProperty("duration",out var value)&&value.TryGetInt32(out int ms))duration=Math.Clamp(ms,0,3000);}catch{}
        CancellationTokenSource? pendingImage=null;
        void Publish(string mode,bool active){
            long revision=Interlocked.Increment(ref latestRevision);pendingImage?.Cancel();pendingImage?.Dispose();pendingImage=null;
            var authority=new Authority(revision,mode,active);
            if(mode=="image"&&active){
                pendingImage=CancellationTokenSource.CreateLinkedTokenSource(cancellation);var token=pendingImage.Token;
                _=Task.Run(async()=>{try{await Task.Delay(duration,token);if(revision==Volatile.Read(ref latestRevision)&&!token.IsCancellationRequested)writer.TryWrite(authority);}catch(OperationCanceledException){}},CancellationToken.None);
            }else writer.TryWrite(authority);
        }
        while(!cancellation.IsCancellationRequested){
            try {
                using var response=await client.GetAsync($"http://127.0.0.1:{port}/api/events?client=desktop-visibility",HttpCompletionOption.ResponseHeadersRead,cancellation);response.EnsureSuccessStatusCode();using var reader=new StreamReader(await response.Content.ReadAsStreamAsync(cancellation));string type="";
                while(await reader.ReadLineAsync(cancellation)is string line){if(line.StartsWith("event:"))type=line[6..].Trim();else if(type=="mode"&&line.StartsWith("data:")){using var data=JsonDocument.Parse(line[5..]);bool active=data.RootElement.TryGetProperty("wallpaperActive",out var value)&&value.ValueKind==JsonValueKind.True;Publish(data.RootElement.GetProperty("mode").GetString()??"image",active);}}
            }catch(OperationCanceledException)when(cancellation.IsCancellationRequested){break;}
            catch(Exception ex){Log("bridge disconnected: "+ex.Message);}
            finally{Publish("offline",false);}
            try{await Task.Delay(750,cancellation);}catch(OperationCanceledException){break;}
        }
        pendingImage?.Cancel();pendingImage?.Dispose();
    }
    static void ApplyActive(string mode)
    {
        using var desktop=new DesktopFolder();
        if(!File.Exists(leasePath)&&!File.Exists(leasePath+".bak")){
            var lease=new Lease(1,desktop.Hidden,DateTimeOffset.Now,Environment.ProcessId);
            WriteLease(lease); // Durable baseline must precede the Shell mutation.
        }
        // Keep this lease throughout an active wallpaper lifecycle, including photo mode.
        // Otherwise showing the photo could overwrite an originally-hidden baseline.
        var baseline=ReadLease();
        using var config=JsonDocument.Parse(File.ReadAllText(Path.Combine(root,"runtime","config.json")));
        bool showInImage=config.RootElement.TryGetProperty("desktopIconsInImage",out var policy)&&policy.GetString()=="show";
        bool hidden=mode=="graph"||(!showInImage&&baseline.originalHidden);
        bool changed=desktop.Hidden!=hidden;desktop.SetHidden(hidden);if(changed)Log("reconciled mode="+mode+" hidden="+hidden+" originalHidden="+baseline.originalHidden);
    }
    static void Restore(string reason)
    {
        if(!File.Exists(leasePath)&&!File.Exists(leasePath+".bak"))return;
        var lease=ReadLease();
        if(lease.schema!=1)throw new InvalidOperationException("Unknown icon visibility lease schema.");
        using var desktop=new DesktopFolder();desktop.SetHidden(lease.originalHidden);File.Delete(leasePath);File.Delete(leasePath+".bak");Log("restored originalHidden="+lease.originalHidden+" "+reason);
    }
    static Lease ReadLease()
    {
        try{return ParseLease(leasePath);}catch(Exception ex)when(ex is JsonException or InvalidOperationException or IOException){
            if(!File.Exists(leasePath+".bak"))throw new InvalidOperationException("Visibility lease damaged and no backup; refusing guessed restoration.",ex);
            var backup=ParseLease(leasePath+".bak");
            string evidence=leasePath+".corrupt-"+DateTime.UtcNow.ToString("yyyyMMddHHmmssfff");if(File.Exists(leasePath))File.Copy(leasePath,evidence,false);
            DurableWrite(leasePath,JsonSerializer.Serialize(backup));Log("recovered damaged visibility lease from validated backup; evidence="+Path.GetFileName(evidence));return backup;
        }
    }
    static Lease ParseLease(string path){string json=File.ReadAllText(path);using var document=JsonDocument.Parse(json);if(!document.RootElement.TryGetProperty("originalHidden",out var hidden)||hidden.ValueKind is not(JsonValueKind.True or JsonValueKind.False))throw new InvalidOperationException("Missing explicit visibility baseline.");var value=JsonSerializer.Deserialize<Lease>(json)??throw new InvalidOperationException("Missing visibility lease.");if(value.schema!=1||value.ownerPid<=0||value.acquiredAt==default)throw new InvalidOperationException("Invalid visibility lease fields.");return value;}
    static void WriteLease(Lease lease){string json=JsonSerializer.Serialize(lease);DurableWrite(leasePath+".bak",json);DurableWrite(leasePath,json);}
    static void DurableWrite(string path,string content){string temp=path+".tmp";using(var stream=new FileStream(temp,FileMode.Create,FileAccess.Write,FileShare.None,4096,FileOptions.WriteThrough)){var bytes=Encoding.UTF8.GetBytes(content);stream.Write(bytes);stream.Flush(true);}File.Move(temp,path,true);}
    static void Log(string message){lock(typeof(Program))File.AppendAllText(logPath,DateTimeOffset.Now.ToString("O")+" "+message+Environment.NewLine);}
}
