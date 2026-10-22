using System.ComponentModel;
using System.Net.Http.Headers;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Threading.Channels;

internal static class Program
{
    const int HotkeyId = 0x4846;
    const uint WmHotkey = 0x0312, WmQuit = 0x0012;
    static string logPath = "";
    record Command(string Path,string Payload,long Foreground);

    [STAThread]
    static int Main(string[] args)
    {
        SetProcessDpiAwarenessContext(new IntPtr(-4)); // Physical primary-screen coordinates for native wheel routing.
        string root = Path.GetFullPath(args.FirstOrDefault(x => !x.StartsWith("--")) ?? Path.Combine(AppContext.BaseDirectory, "../../../../"));
        string configPath = Path.Combine(root, "runtime", "config.json");
        string identity = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(root.ToLowerInvariant())))[..16];
        string name = @"Local\HafizaWallpaper." + identity;
        logPath = Path.Combine(root, "runtime", "hotkey.log");
        Directory.CreateDirectory(Path.GetDirectoryName(logPath)!);
        if(args.Contains("--self-test")){
            var result=DesktopGestures.TestPolicy();
            File.WriteAllText(Path.Combine(root,"runtime","acceptance","gesture-policy-tests.json"),JsonSerializer.Serialize(result));
            return JsonSerializer.Serialize(result).Contains("false")?1:0;
        }
        if (args.Contains("--stop"))
        {
            try { using var stop = EventWaitHandle.OpenExisting(name + ".Stop"); stop.Set(); return 0; }
            catch (WaitHandleCannotBeOpenedException) { return 0; }
        }
        using var mutex = new Mutex(true, name, out bool first);
        if (!first) return 0;
        try
        {
            using var config = JsonDocument.Parse(File.ReadAllText(configPath));
            var cfg = config.RootElement;
            int port = cfg.GetProperty("port").GetInt32();
            if (port < 1024 || port > 65535) throw new ArgumentException("Invalid bridge port.");
            string token = cfg.GetProperty("token").GetString() ?? throw new ArgumentException("Missing token.");
            uint modifiers = 0x4000; // MOD_NOREPEAT: one event per physical key press.
            var hk = cfg.GetProperty("hotkey");
            foreach (var item in hk.GetProperty("modifiers").EnumerateArray())
                modifiers |= item.GetString()?.ToLowerInvariant() switch
                { "alt" => 1u, "control" or "ctrl" => 2u, "shift" => 4u, "win" or "windows" => 8u, _ => throw new ArgumentException("Unknown hotkey modifier.") };
            uint key = ParseKey(hk.GetProperty("key").GetString() ?? "G");
            if ((modifiers & 15) == 0) throw new ArgumentException("A global hotkey requires a modifier.");
            // Create this thread's queue before a stop callback can post WM_QUIT.
            PeekMessage(out _, IntPtr.Zero, 0, 0, 0);
            uint thread = GetCurrentThreadId();
            using var stop = new EventWaitHandle(false, EventResetMode.ManualReset, name + ".Stop");
            var stopWait = ThreadPool.RegisterWaitForSingleObject(stop, (_, _) => PostThreadMessage(thread, WmQuit, UIntPtr.Zero, IntPtr.Zero), null, -1, true);
            if (!RegisterHotKey(IntPtr.Zero, HotkeyId, modifiers, key))
                throw new Win32Exception(Marshal.GetLastWin32Error(), "Global hotkey could not be registered; choose another key in runtime/config.json.");
            var queue = Channel.CreateUnbounded<Command>(new UnboundedChannelOptions { SingleReader = true, SingleWriter = false });
            using var gestures = new DesktopGestures(port,token,g=>queue.Writer.TryWrite(new Command("gesture",JsonSerializer.Serialize(g),0)),Log);
            using var client = new HttpClient { Timeout = TimeSpan.FromSeconds(2) };
            client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
            // Sequential delivery preserves every press and its order. Never refocus a window.
            Task sender = Task.Run(async () => {
                await foreach (var command in queue.Reader.ReadAllAsync())
                {
                    try {
                        using var response = await client.PostAsync($"http://127.0.0.1:{port}/api/{command.Path}", new StringContent(command.Payload, Encoding.UTF8, "application/json"));
                        response.EnsureSuccessStatusCode();
                        Log($"{command.Path} ok foregroundBefore={command.Foreground} foregroundAfter={GetForegroundWindow().ToInt64()}"+(command.Path=="gesture"?" "+command.Payload:""));
                    } catch (Exception ex) { Log(command.Path+" failed: " + ex.Message); }
                }
            });
            Log($"ready pid={Environment.ProcessId} key={hk.GetProperty("key").GetString()} modifiers={modifiers & 15}");
            try {
                int result;
                while ((result = GetMessage(out var message, IntPtr.Zero, 0, 0)) > 0)
                    if (message.message == WmHotkey && message.wParam.ToUInt64() == HotkeyId)
                        queue.Writer.TryWrite(new Command("toggle","{}",GetForegroundWindow().ToInt64()));
                if (result < 0) throw new Win32Exception(Marshal.GetLastWin32Error());
            } finally {
                UnregisterHotKey(IntPtr.Zero, HotkeyId);
                stopWait.Unregister(null);
                queue.Writer.Complete();
                sender.GetAwaiter().GetResult();
                Log("stopped");
            }
            return 0;
        }
        catch (Exception ex) { Log("error: " + ex.Message); return 1; }
        finally { mutex.ReleaseMutex(); }
    }

    static uint ParseKey(string value)
    {
        value = value.ToUpperInvariant();
        if (value.Length == 1 && char.IsAsciiLetterOrDigit(value[0])) return value[0];
        if (value.StartsWith('F') && int.TryParse(value[1..], out int f) && f is >= 1 and <= 24) return (uint)(0x70 + f - 1);
        if (value == "SPACE") return 0x20;
        throw new ArgumentException("Hotkey key must be A-Z, 0-9, F1-F24 or Space.");
    }
    static void Log(string message) { lock (typeof(Program)) File.AppendAllText(logPath, DateTimeOffset.Now.ToString("O") + " " + message + Environment.NewLine); }
    [StructLayout(LayoutKind.Sequential)] struct Point { public int x, y; }
    [StructLayout(LayoutKind.Sequential)] struct Msg { public IntPtr hwnd; public uint message; public UIntPtr wParam; public IntPtr lParam; public uint time; public Point point; public uint lPrivate; }
    [DllImport("user32.dll", SetLastError = true)] static extern bool RegisterHotKey(IntPtr window, int id, uint modifiers, uint key);
    [DllImport("user32.dll")] static extern bool UnregisterHotKey(IntPtr window, int id);
    [DllImport("user32.dll", SetLastError = true)] static extern int GetMessage(out Msg message, IntPtr window, uint min, uint max);
    [DllImport("user32.dll")] static extern bool PeekMessage(out Msg message, IntPtr window, uint min, uint max, uint remove);
    [DllImport("user32.dll", SetLastError = true)] static extern bool PostThreadMessage(uint thread, uint message, UIntPtr wparam, IntPtr lparam);
    [DllImport("kernel32.dll")] static extern uint GetCurrentThreadId();
    [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] static extern bool SetProcessDpiAwarenessContext(IntPtr context);
}
