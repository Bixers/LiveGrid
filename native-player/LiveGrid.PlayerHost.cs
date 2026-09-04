using System;
using System.Collections.Generic;
using System.Drawing;
using System.IO;
using System.Globalization;
using System.Net;
using System.Net.WebSockets;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using System.Windows.Forms;

namespace LiveGrid.PlayerHost
{
    internal static class Program
    {
        [STAThread]
        private static int Main(string[] args)
        {
            if (args.Length != 1)
            {
                return 2;
            }

            long parentValue;
            if (!long.TryParse(args[0], out parentValue) || parentValue <= 0)
            {
                return 2;
            }

            NativeMethods.EnablePerMonitorDpiAwareness();
            ServicePointManager.SecurityProtocol = SecurityProtocolType.Tls12;
            Console.InputEncoding = new UTF8Encoding(false);
            Console.OutputEncoding = new UTF8Encoding(false);
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);

            using (var dispatcher = new DispatcherForm())
            using (var host = new HostController(new IntPtr(parentValue), dispatcher))
            {
                var dispatcherHandle = dispatcher.Handle;
                var inputThread = new Thread(delegate() { ReadCommands(host, dispatcher); });
                inputThread.IsBackground = true;
                inputThread.Name = "LiveGrid command reader";
                inputThread.Start();
                host.Emit("ready", null, null);
                Application.Run(dispatcher);
            }
            return 0;
        }

        private static void ReadCommands(HostController host, Control dispatcher)
        {
            string line;
            while ((line = Console.ReadLine()) != null)
            {
                var commandLine = line;
                try
                {
                    dispatcher.BeginInvoke(new Action(delegate() { host.Handle(commandLine); }));
                }
                catch (InvalidOperationException)
                {
                    break;
                }
            }

            try
            {
                dispatcher.BeginInvoke(new Action(delegate()
                {
                    host.Dispose();
                    Application.ExitThread();
                }));
            }
            catch (InvalidOperationException)
            {
            }
        }
    }

    internal sealed class DispatcherForm : Form
    {
        public DispatcherForm()
        {
            ShowInTaskbar = false;
            FormBorderStyle = FormBorderStyle.None;
            StartPosition = FormStartPosition.Manual;
            Location = new Point(-32000, -32000);
            Size = new Size(1, 1);
            Opacity = 0;
        }

        protected override bool ShowWithoutActivation
        {
            get { return true; }
        }
    }

    internal sealed class HostController : IDisposable
    {
        private readonly IntPtr parent;
        private readonly Control dispatcher;
        private readonly JavaScriptSerializer json = new JavaScriptSerializer();
        private readonly Dictionary<string, RoomSession> rooms = new Dictionary<string, RoomSession>();
        private readonly object outputGate = new object();
        private bool disposed;

        public HostController(IntPtr parent, Control dispatcher)
        {
            this.parent = parent;
            this.dispatcher = dispatcher;
            json.MaxJsonLength = 1024 * 1024;
        }

        public void Handle(string line)
        {
            if (disposed || String.IsNullOrWhiteSpace(line)) return;
            Dictionary<string, object> command;
            try
            {
                command = json.DeserializeObject(line) as Dictionary<string, object>;
            }
            catch (Exception error)
            {
                Emit("host-error", null, "IPC 数据无效: " + error.Message);
                return;
            }
            if (command == null) return;

            var op = Text(command, "op");
            var roomId = Text(command, "roomId");
            if (op == "shutdown")
            {
                Dispose();
                Application.ExitThread();
                return;
            }
            if (op == "create")
            {
                GetOrCreate(roomId);
                return;
            }
            if (String.IsNullOrEmpty(roomId)) return;

            RoomSession room;
            if (op == "destroy")
            {
                if (rooms.TryGetValue(roomId, out room))
                {
                    rooms.Remove(roomId);
                    room.Dispose();
                }
                return;
            }

            room = GetOrCreate(roomId);
            if (room == null) return;
            switch (op)
            {
                case "load":
                    room.Load(Text(command, "url"));
                    break;
                case "unload":
                    room.Unload();
                    break;
                case "bounds":
                    room.SetBounds(Number(command, "x"), Number(command, "y"),
                        Number(command, "width"), Number(command, "height"),
                        Boolean(command, "visible"));
                    break;
                case "pause":
                    room.SetPaused(Boolean(command, "value"));
                    break;
                case "mute":
                    room.SetMuted(Boolean(command, "value"));
                    break;
                case "volume":
                    room.SetVolume(Number(command, "value"));
                    break;
                case "front":
                    room.BringToFront();
                    break;
                case "danmaku-visible":
                    room.SetDanmakuVisible(Boolean(command, "value"));
                    break;
                case "danmaku-settings":
                    room.SetDanmakuSettings(Number(command, "opacity"),
                        Number(command, "fontSize"), Text(command, "area"));
                    break;
            }
        }

        public void Emit(string eventName, string roomId, string detail)
        {
            var value = new Dictionary<string, object>();
            value["event"] = eventName;
            if (!String.IsNullOrEmpty(roomId)) value["roomId"] = roomId;
            if (!String.IsNullOrEmpty(detail)) value["detail"] = detail;
            Write(value);
        }

        public void Emit(IDictionary<string, object> value)
        {
            Write(value);
        }

        private void Write(IDictionary<string, object> value)
        {
            lock (outputGate)
            {
                try
                {
                    Console.WriteLine(json.Serialize(value));
                    Console.Out.Flush();
                }
                catch (IOException)
                {
                }
            }
        }

        private RoomSession GetOrCreate(string roomId)
        {
            if (disposed || !IsRoomId(roomId)) return null;
            RoomSession room;
            if (rooms.TryGetValue(roomId, out room)) return room;
            try
            {
                room = new RoomSession(parent, roomId, this, dispatcher);
                rooms.Add(roomId, room);
                return room;
            }
            catch (Exception error)
            {
                Emit("host-error", roomId, "libmpv 初始化失败: " + error.Message);
                return null;
            }
        }

        private static bool IsRoomId(string value)
        {
            if (String.IsNullOrEmpty(value) || value.Length > 20) return false;
            for (var i = 0; i < value.Length; i++)
            {
                if (value[i] < '0' || value[i] > '9') return false;
            }
            return true;
        }

        private static string Text(IDictionary<string, object> value, string key)
        {
            object item;
            return value.TryGetValue(key, out item) && item != null ? Convert.ToString(item) : String.Empty;
        }

        private static int Number(IDictionary<string, object> value, string key)
        {
            object item;
            int result;
            return value.TryGetValue(key, out item) && item != null
                && Int32.TryParse(Convert.ToString(item), out result) ? result : 0;
        }

        private static bool Boolean(IDictionary<string, object> value, string key)
        {
            object item;
            bool result;
            return value.TryGetValue(key, out item) && item != null
                && System.Boolean.TryParse(Convert.ToString(item), out result) && result;
        }

        public void Dispose()
        {
            if (disposed) return;
            disposed = true;
            foreach (var room in rooms.Values) room.Dispose();
            rooms.Clear();
        }
    }

    internal sealed class RoomSession : IDisposable
    {
        private readonly string roomId;
        private readonly HostController host;
        private readonly PlayerWindow playerWindow;
        private readonly DanmakuWindow danmakuWindow;
        private readonly MpvPlayer player;
        private readonly DouyuDanmakuClient danmaku;
        private bool visible;
        private bool disposed;

        public RoomSession(IntPtr parent, string roomId, HostController host, Control dispatcher)
        {
            this.roomId = roomId;
            this.host = host;
            playerWindow = new PlayerWindow(parent);
            danmakuWindow = new DanmakuWindow(parent);
            player = new MpvPlayer(playerWindow.Handle, OnPlayerState);
            danmaku = new DouyuDanmakuClient(roomId, host, dispatcher, danmakuWindow);
            danmaku.Start();
        }

        public void Load(string url)
        {
            if (disposed) return;
            player.Load(url);
        }

        public void Unload()
        {
            if (disposed) return;
            player.Unload();
            ShowWindows(false);
        }

        public void SetBounds(int x, int y, int width, int height, bool shouldShow)
        {
            if (disposed) return;
            width = Math.Max(1, width);
            height = Math.Max(1, height);
            playerWindow.SetNativeBounds(x, y, width, height);
            danmakuWindow.SetNativeBounds(x, y, width, height);
            visible = shouldShow;
            ShowWindows(visible && player.State == "playing");
        }

        public void SetPaused(bool value)
        {
            if (!disposed) player.SetPaused(value);
        }

        public void SetMuted(bool value)
        {
            if (!disposed) player.SetMuted(value);
        }

        public void SetVolume(int value)
        {
            if (!disposed) player.SetVolume(value);
        }

        public void BringToFront()
        {
            if (disposed) return;
            playerWindow.BringNativeToFront();
            danmakuWindow.BringNativeToFront();
        }

        public void SetDanmakuVisible(bool value)
        {
            if (disposed) return;
            danmakuWindow.DanmakuVisible = value;
            if (!value) danmakuWindow.ClearMessages();
        }

        public void SetDanmakuSettings(int opacity, int fontSize, string area)
        {
            if (!disposed) danmakuWindow.Configure(opacity, fontSize, area);
        }

        private void OnPlayerState(string state, string detail)
        {
            if (disposed) return;
            if (playerWindow.InvokeRequired)
            {
                try
                {
                    playerWindow.BeginInvoke(new Action(delegate() { OnPlayerState(state, detail); }));
                }
                catch (InvalidOperationException)
                {
                }
                return;
            }
            ShowWindows(visible && state == "playing");
            var value = new Dictionary<string, object>();
            value["event"] = "player-state";
            value["roomId"] = roomId;
            value["state"] = state;
            value["detail"] = detail ?? String.Empty;
            host.Emit(value);
        }

        private void ShowWindows(bool show)
        {
            playerWindow.SetNativeVisible(show);
            danmakuWindow.SetNativeVisible(show && danmakuWindow.DanmakuVisible);
            if (show) BringToFront();
        }

        public void Dispose()
        {
            if (disposed) return;
            disposed = true;
            danmaku.Dispose();
            player.Dispose();
            danmakuWindow.Dispose();
            playerWindow.Dispose();
        }
    }

    internal class NativeChildForm : Form
    {
        private readonly IntPtr parent;

        protected NativeChildForm(IntPtr parent)
        {
            this.parent = parent;
            FormBorderStyle = FormBorderStyle.None;
            ShowInTaskbar = false;
            StartPosition = FormStartPosition.Manual;
            BackColor = Color.Black;
            Size = new Size(1, 1);
            var handle = Handle;
            NativeMethods.SetParent(handle, parent);
            NativeMethods.SetWindowLongPtr(handle, NativeMethods.GwlStyle,
                new IntPtr(NativeMethods.WsChild | NativeMethods.WsClipChildren | NativeMethods.WsClipSiblings));
        }

        protected override bool ShowWithoutActivation
        {
            get { return true; }
        }

        protected override CreateParams CreateParams
        {
            get
            {
                var value = base.CreateParams;
                value.ExStyle |= unchecked((int)(NativeMethods.WsExNoActivate | NativeMethods.WsExToolWindow));
                return value;
            }
        }

        public void SetNativeBounds(int x, int y, int width, int height)
        {
            NativeMethods.SetWindowPos(Handle, IntPtr.Zero, x, y, width, height,
                NativeMethods.SwpNoActivate | NativeMethods.SwpNoZOrder);
        }

        public void SetNativeVisible(bool visible)
        {
            NativeMethods.ShowWindow(Handle, visible ? NativeMethods.SwShowNoActivate : NativeMethods.SwHide);
        }

        public void BringNativeToFront()
        {
            NativeMethods.SetWindowPos(Handle, NativeMethods.HwndTop, 0, 0, 0, 0,
                NativeMethods.SwpNoActivate | NativeMethods.SwpNoMove | NativeMethods.SwpNoSize);
        }
    }

    internal sealed class PlayerWindow : NativeChildForm
    {
        public PlayerWindow(IntPtr parent) : base(parent)
        {
            BackColor = Color.Black;
        }
    }

    internal sealed class DanmakuWindow : NativeChildForm
    {
        private sealed class Message
        {
            public string Text;
            public Color Color;
            public int Lane;
            public long StartedAt;
            public int Duration;
        }

        private readonly List<Message> messages = new List<Message>();
        private readonly System.Windows.Forms.Timer timer;
        private readonly Color transparentColor = Color.FromArgb(255, 0, 255);
        private int opacity = 92;
        private int fontSize = 16;
        private string area = "top-third";

        public bool DanmakuVisible { get; set; }

        public DanmakuWindow(IntPtr parent) : base(parent)
        {
            DanmakuVisible = true;
            BackColor = transparentColor;
            NativeMethods.SetWindowLongPtr(Handle, NativeMethods.GwlExStyle,
                new IntPtr(NativeMethods.GetWindowLongPtr(Handle, NativeMethods.GwlExStyle).ToInt64()
                    | NativeMethods.WsExLayered | NativeMethods.WsExTransparent | NativeMethods.WsExNoActivate));
            ApplyLayeredAttributes();
            timer = new System.Windows.Forms.Timer();
            timer.Interval = 33;
            timer.Tick += delegate
            {
                var now = Environment.TickCount;
                messages.RemoveAll(delegate(Message item) { return unchecked(now - item.StartedAt) >= item.Duration; });
                if (messages.Count > 0) Invalidate();
            };
            timer.Start();
        }

        public void Configure(int nextOpacity, int nextFontSize, string nextArea)
        {
            opacity = Math.Max(20, Math.Min(100, nextOpacity));
            fontSize = Math.Max(12, Math.Min(28, nextFontSize));
            if (!String.IsNullOrEmpty(nextArea)) area = nextArea;
            ApplyLayeredAttributes();
            ClearMessages();
        }

        public void AddMessage(string text, string color)
        {
            if (!DanmakuVisible || String.IsNullOrWhiteSpace(text)) return;
            if (InvokeRequired)
            {
                try { BeginInvoke(new Action(delegate() { AddMessage(text, color); })); }
                catch (InvalidOperationException) { }
                return;
            }

            var laneHeight = fontSize + 8;
            var range = LaneRange();
            var lanes = Math.Max(1, range.Item2 / laneHeight);
            var lane = 0;
            var now = Environment.TickCount;
            for (var candidate = 0; candidate < lanes; candidate++)
            {
                var occupied = messages.Exists(delegate(Message item)
                {
                    return item.Lane == candidate && unchecked(now - item.StartedAt) < 1300;
                });
                if (!occupied)
                {
                    lane = candidate;
                    break;
                }
                lane = (lane + 1) % lanes;
            }

            Color parsed;
            try { parsed = ColorTranslator.FromHtml(String.IsNullOrEmpty(color) ? "#ffffff" : color); }
            catch { parsed = Color.White; }
            messages.Add(new Message
            {
                Text = text.Length > 160 ? text.Substring(0, 160) : text,
                Color = parsed,
                Lane = lane,
                StartedAt = now,
                Duration = 9000,
            });
            if (messages.Count > 120) messages.RemoveRange(0, messages.Count - 120);
            Invalidate();
        }

        public void ClearMessages()
        {
            messages.Clear();
            Invalidate();
        }

        protected override void OnPaintBackground(PaintEventArgs e)
        {
            e.Graphics.Clear(transparentColor);
        }

        protected override void OnPaint(PaintEventArgs e)
        {
            base.OnPaint(e);
            if (!DanmakuVisible || messages.Count == 0) return;
            e.Graphics.TextRenderingHint = System.Drawing.Text.TextRenderingHint.AntiAliasGridFit;
            using (var font = new Font("Microsoft YaHei UI", fontSize, FontStyle.Bold, GraphicsUnit.Pixel))
            using (var outline = new SolidBrush(Color.FromArgb(235, 18, 22, 28)))
            {
                var range = LaneRange();
                var now = Environment.TickCount;
                foreach (var item in messages.ToArray())
                {
                    var elapsed = Math.Max(0, unchecked(now - item.StartedAt));
                    var size = e.Graphics.MeasureString(item.Text, font);
                    var progress = Math.Min(1.0, (double)elapsed / item.Duration);
                    var x = (float)(Width - progress * (Width + size.Width));
                    var y = range.Item1 + item.Lane * (fontSize + 8);
                    e.Graphics.DrawString(item.Text, font, outline, x - 1, y);
                    e.Graphics.DrawString(item.Text, font, outline, x + 1, y);
                    e.Graphics.DrawString(item.Text, font, outline, x, y - 1);
                    e.Graphics.DrawString(item.Text, font, outline, x, y + 1);
                    using (var brush = new SolidBrush(item.Color))
                    {
                        e.Graphics.DrawString(item.Text, font, brush, x, y);
                    }
                }
            }
        }

        private Tuple<int, int> LaneRange()
        {
            var height = Math.Max(1, Height);
            if (area == "top-quarter") return Tuple.Create(0, Math.Max(1, height / 4));
            if (area == "top-half") return Tuple.Create(0, Math.Max(1, height / 2));
            if (area == "full") return Tuple.Create(0, height);
            if (area == "bottom-half") return Tuple.Create(height / 2, Math.Max(1, height / 2));
            if (area == "bottom-quarter") return Tuple.Create(height * 3 / 4, Math.Max(1, height / 4));
            return Tuple.Create(0, Math.Max(1, height / 3));
        }

        private void ApplyLayeredAttributes()
        {
            NativeMethods.SetLayeredWindowAttributes(Handle, NativeMethods.ColorRef(transparentColor),
                (byte)(255 * opacity / 100), NativeMethods.LwaColorKey | NativeMethods.LwaAlpha);
        }

        protected override void Dispose(bool disposing)
        {
            if (disposing && timer != null) timer.Dispose();
            base.Dispose(disposing);
        }
    }

    internal sealed class MpvPlayer : IDisposable
    {
        private static readonly int[] RetrySeconds = { 1, 2, 4, 8, 15, 15 };
        private readonly Action<string, string> onState;
        private readonly object gate = new object();
        private IntPtr handle;
        private Thread eventThread;
        private System.Threading.Timer retryTimer;
        private string currentUrl = String.Empty;
        private int retryAttempt;
        private bool stopping;
        private bool disposed;
        private string state = "idle";

        public string State { get { return state; } }

        public MpvPlayer(IntPtr windowHandle, Action<string, string> onState)
        {
            this.onState = onState;
            handle = MpvNative.mpv_create();
            if (handle == IntPtr.Zero) throw new InvalidOperationException("mpv_create 返回空句柄");
            SetOption("config", "no");
            SetOption("terminal", "no");
            SetOption("osc", "no");
            SetOption("input-default-bindings", "no");
            SetOption("wid", unchecked((ulong)windowHandle.ToInt64()).ToString(CultureInfo.InvariantCulture));
            SetOption("vo", "gpu");
            SetOption("gpu-api", "d3d11");
            SetOption("hwdec", "d3d11va-copy");
            SetOption("video-sync", "audio");
            SetOption("framedrop", "vo");
            SetOption("audio-pitch-correction", "yes");
            SetOption("cache", "yes");
            SetOption("cache-pause", "no");
            SetOption("demuxer-readahead-secs", "2");
            SetOption("demuxer-max-bytes", "67108864");
            SetOption("demuxer-max-back-bytes", "16777216");
            SetOption("audio-buffer", "0.2");
            SetOption("network-timeout", "10");
            SetOption("keep-open", "no");
            if (MpvNative.mpv_initialize(handle) < 0)
            {
                MpvNative.mpv_terminate_destroy(handle);
                handle = IntPtr.Zero;
                throw new InvalidOperationException("mpv_initialize 失败");
            }
            MpvNative.mpv_request_log_messages(handle, "warn");
            SetMuted(true);
            eventThread = new Thread(EventLoop);
            eventThread.IsBackground = true;
            eventThread.Name = "LiveGrid libmpv events";
            eventThread.Start();
        }

        public void Load(string url)
        {
            if (disposed || String.IsNullOrWhiteSpace(url))
            {
                Unload();
                return;
            }
            lock (gate)
            {
                if (url == currentUrl && (state == "playing" || state == "loading")) return;
                currentUrl = url;
                retryAttempt = 0;
                stopping = false;
                CancelRetry();
                Command("loadfile", url, "replace");
                ChangeState("loading", String.Empty);
            }
        }

        public void Unload()
        {
            if (disposed) return;
            lock (gate)
            {
                stopping = true;
                currentUrl = String.Empty;
                CancelRetry();
                Command("stop");
                ChangeState("idle", String.Empty);
            }
        }

        public void SetPaused(bool value)
        {
            if (disposed) return;
            MpvNative.mpv_set_property_string(handle, "pause", value ? "yes" : "no");
            ChangeState(value ? "stalled" : "playing", value ? "已暂停" : String.Empty);
        }

        public void SetMuted(bool value)
        {
            if (!disposed) MpvNative.mpv_set_property_string(handle, "mute", value ? "yes" : "no");
        }

        public void SetVolume(int value)
        {
            if (!disposed) MpvNative.mpv_set_property_string(handle, "volume",
                Math.Max(0, Math.Min(100, value)).ToString());
        }

        private void EventLoop()
        {
            var mpv = handle;
            while (!disposed && mpv != IntPtr.Zero)
            {
                var pointer = MpvNative.mpv_wait_event(mpv, 0.5);
                if (pointer == IntPtr.Zero) continue;
                var value = (MpvNative.MpvEvent)Marshal.PtrToStructure(pointer, typeof(MpvNative.MpvEvent));
                if (value.EventId == MpvNative.EventNone) continue;
                if (value.EventId == MpvNative.EventLogMessage)
                {
                    LogMpvMessage(value.Data);
                }
                else if (value.EventId == MpvNative.EventPlaybackRestart)
                {
                    retryAttempt = 0;
                    CancelRetry();
                    ChangeState("playing", String.Empty);
                }
                else if (value.EventId == MpvNative.EventFileLoaded)
                {
                    ChangeState("loading", String.Empty);
                }
                else if (value.EventId == MpvNative.EventStartFile)
                {
                    ChangeState("loading", String.Empty);
                }
                else if (value.EventId == MpvNative.EventEndFile && !stopping && !String.IsNullOrEmpty(currentUrl))
                {
                    var end = ReadEndFile(value.Data);
                    // STOP is emitted for a deliberate loadfile replacement; retrying it creates a reload loop.
                    if (!end.HasValue || (end.Value.Reason != MpvNative.EndFileReasonStop
                        && end.Value.Reason != MpvNative.EndFileReasonRedirect))
                        ScheduleRetry(EndFileDetail(end));
                }
                else if (value.EventId == MpvNative.EventShutdown)
                {
                    return;
                }
            }
        }

        private void ScheduleRetry(string detail)
        {
            lock (gate)
            {
                if (disposed || stopping || String.IsNullOrEmpty(currentUrl) || retryTimer != null) return;
                ChangeState("stalled", detail);
                var index = Math.Min(retryAttempt, RetrySeconds.Length - 1);
                retryAttempt++;
                retryTimer = new System.Threading.Timer(delegate
                {
                    string url;
                    lock (gate)
                    {
                        if (disposed || stopping) return;
                        retryTimer.Dispose();
                        retryTimer = null;
                        url = currentUrl;
                    }
                    if (!String.IsNullOrEmpty(url))
                    {
                        Command("loadfile", url, "replace");
                        ChangeState("loading", "正在重新连接直播流");
                    }
                }, null, RetrySeconds[index] * 1000, Timeout.Infinite);
            }
        }

        private void CancelRetry()
        {
            if (retryTimer == null) return;
            retryTimer.Dispose();
            retryTimer = null;
        }

        private void ChangeState(string next, string detail)
        {
            state = next;
            if (onState != null) onState(next, detail);
        }

        private void SetOption(string name, string value)
        {
            if (MpvNative.mpv_set_option_string(handle, name, value) < 0)
                throw new InvalidOperationException("不支持 mpv 参数 " + name);
        }

        private void Command(params string[] values)
        {
            if (disposed || handle == IntPtr.Zero) return;
            var pointers = new IntPtr[values.Length + 1];
            try
            {
                for (var index = 0; index < values.Length; index++)
                    pointers[index] = Marshal.StringToHGlobalAnsi(values[index]);
                var block = Marshal.AllocHGlobal(IntPtr.Size * pointers.Length);
                try
                {
                    for (var index = 0; index < pointers.Length; index++)
                        Marshal.WriteIntPtr(block, index * IntPtr.Size, pointers[index]);
                    var result = MpvNative.mpv_command(handle, block);
                    if (result < 0) ChangeState("error", "mpv 命令失败: " + MpvNative.ErrorText(result));
                }
                finally { Marshal.FreeHGlobal(block); }
            }
            finally
            {
                for (var index = 0; index < values.Length; index++)
                    if (pointers[index] != IntPtr.Zero) Marshal.FreeHGlobal(pointers[index]);
            }
        }

        private void LogMpvMessage(IntPtr data)
        {
            if (data == IntPtr.Zero) return;
            var message = (MpvNative.MpvEventLogMessage)Marshal.PtrToStructure(
                data, typeof(MpvNative.MpvEventLogMessage));
            var prefix = Marshal.PtrToStringAnsi(message.Prefix) ?? "mpv";
            var text = (Marshal.PtrToStringAnsi(message.Text) ?? String.Empty).Trim();
            if (!String.IsNullOrEmpty(text)) Console.Error.WriteLine("[" + prefix + "] " + text);
        }

        private static MpvNative.MpvEventEndFile? ReadEndFile(IntPtr data)
        {
            if (data == IntPtr.Zero) return null;
            return (MpvNative.MpvEventEndFile)Marshal.PtrToStructure(
                data, typeof(MpvNative.MpvEventEndFile));
        }

        private static string EndFileDetail(MpvNative.MpvEventEndFile? value)
        {
            if (!value.HasValue) return "直播流中断，正在恢复";
            var end = value.Value;
            if (end.Reason == MpvNative.EndFileReasonError)
                return "直播流中断: " + MpvNative.ErrorText(end.Error);
            return "直播流结束 (" + MpvNative.EndFileReasonText(end.Reason) + ")，正在恢复";
        }

        public void Dispose()
        {
            if (disposed) return;
            disposed = true;
            stopping = true;
            CancelRetry();
            var mpv = handle;
            if (mpv != IntPtr.Zero)
            {
                MpvNative.mpv_wakeup(mpv);
                if (eventThread != null && eventThread.IsAlive) eventThread.Join(1500);
                handle = IntPtr.Zero;
                MpvNative.mpv_terminate_destroy(mpv);
            }
        }
    }

    internal sealed class DouyuDanmakuClient : IDisposable
    {
        private static readonly int[] RetrySeconds = { 1, 2, 4, 8, 15, 15 };
        private readonly string[] endpoints = {
            "wss://danmuproxy.douyu.com:8501/", "wss://danmuproxy.douyu.com:8502/",
            "wss://danmuproxy.douyu.com:8503/", "wss://danmuproxy.douyu.com:8504/",
            "wss://danmuproxy.douyu.com:8505/", "wss://danmuproxy.douyu.com:8506/"
        };
        private readonly string roomId;
        private readonly HostController host;
        private readonly Control dispatcher;
        private readonly DanmakuWindow overlay;
        private readonly CancellationTokenSource lifetime = new CancellationTokenSource();
        private Task worker;
        private int endpointIndex;
        private int attempt;

        public DouyuDanmakuClient(string roomId, HostController host, Control dispatcher, DanmakuWindow overlay)
        {
            this.roomId = roomId;
            this.host = host;
            this.dispatcher = dispatcher;
            this.overlay = overlay;
        }

        public void Start()
        {
            worker = Task.Run((Func<Task>)Run);
        }

        private async Task Run()
        {
            try { await Task.Delay(new Random(roomId.GetHashCode()).Next(150, 1500), lifetime.Token); }
            catch (OperationCanceledException) { return; }
            while (!lifetime.IsCancellationRequested)
            {
                var connectedAt = DateTime.UtcNow;
                try
                {
                    EmitStatus(attempt == 0 ? "connecting" : "retrying", null);
                    using (var socket = new ClientWebSocket())
                    {
                        socket.Options.KeepAliveInterval = TimeSpan.FromSeconds(45);
                        var connectTask = socket.ConnectAsync(new Uri(endpoints[endpointIndex]), lifetime.Token);
                        var connected = await Task.WhenAny(connectTask, Task.Delay(10000, lifetime.Token));
                        if (connected != connectTask) throw new TimeoutException("弹幕连接超时");
                        await connectTask;
                        await Send(socket, Stt(new Dictionary<string, string> {
                            { "type", "loginreq" }, { "roomid", roomId }
                        }), lifetime.Token);
                        await Send(socket, Stt(new Dictionary<string, string> {
                            { "type", "joingroup" }, { "rid", roomId }, { "gid", "-9999" }
                        }), lifetime.Token);

                        using (var connection = CancellationTokenSource.CreateLinkedTokenSource(lifetime.Token))
                        {
                            var handshake = new TaskCompletionSource<bool>();
                            var heartbeat = Heartbeat(socket, connection.Token);
                            var receive = Receive(socket, handshake, connection.Token);
                            var handshakeTimeout = Task.Delay(10000, connection.Token);
                            var first = await Task.WhenAny(handshake.Task, receive, handshakeTimeout);
                            if (first == receive) await receive;
                            if (first != handshake.Task) throw new TimeoutException("弹幕握手超时");
                            EmitStatus("online", null);
                            var completed = await Task.WhenAny(receive, heartbeat);
                            connection.Cancel();
                            await completed;
                        }
                    }
                }
                catch (OperationCanceledException)
                {
                    break;
                }
                catch (Exception error)
                {
                    EmitStatus("retrying", error.Message);
                }

                if (DateTime.UtcNow - connectedAt >= TimeSpan.FromSeconds(60)) attempt = 0;
                var index = Math.Min(attempt, RetrySeconds.Length - 1);
                attempt++;
                endpointIndex = (endpointIndex + 1) % endpoints.Length;
                try { await Task.Delay(RetrySeconds[index] * 1000, lifetime.Token); }
                catch (OperationCanceledException) { break; }
            }
            EmitStatus("offline", null);
        }

        private async Task Heartbeat(ClientWebSocket socket, CancellationToken token)
        {
            while (!token.IsCancellationRequested && socket.State == WebSocketState.Open)
            {
                await Task.Delay(45000, token);
                if (socket.State == WebSocketState.Open)
                    await Send(socket, Stt(new Dictionary<string, string> { { "type", "mrkl" } }), token);
            }
        }

        private async Task Receive(ClientWebSocket socket, TaskCompletionSource<bool> handshake,
            CancellationToken token)
        {
            var buffer = new byte[64 * 1024];
            var pending = new List<byte>();
            while (!token.IsCancellationRequested && socket.State == WebSocketState.Open)
            {
                var result = await socket.ReceiveAsync(new ArraySegment<byte>(buffer), token);
                if (result.MessageType == WebSocketMessageType.Close) break;
                if (result.MessageType != WebSocketMessageType.Binary) continue;
                for (var i = 0; i < result.Count; i++) pending.Add(buffer[i]);
                DecodeFrames(pending, handshake);
            }
            throw new IOException("弹幕连接已断开");
        }

        private void DecodeFrames(List<byte> pending, TaskCompletionSource<bool> handshake)
        {
            while (pending.Count >= 12)
            {
                var bodyLength = ReadInt32(pending, 0);
                var totalLength = bodyLength + 4;
                if (bodyLength < 9 || totalLength > 1024 * 1024)
                    throw new InvalidDataException("弹幕帧长度无效");
                if (pending.Count < totalLength) return;
                var payloadLength = totalLength - 13;
                var payload = pending.GetRange(12, Math.Max(0, payloadLength)).ToArray();
                pending.RemoveRange(0, totalLength);
                var fields = ParseStt(Encoding.UTF8.GetString(payload));
                string type;
                fields.TryGetValue("type", out type);
                if (type == "loginres" || type == "setmsggroup") handshake.TrySetResult(true);
                if (type == "chatmsg") EmitChat(fields);
                else if (type == "dgb") EmitGift(fields);
            }
        }

        private void EmitChat(IDictionary<string, string> fields)
        {
            string text;
            string sender;
            string color;
            fields.TryGetValue("txt", out text);
            fields.TryGetValue("nn", out sender);
            fields.TryGetValue("col", out color);
            if (String.IsNullOrWhiteSpace(text)) return;
            var htmlColor = DanmakuColor(color);
            overlay.AddMessage(text, htmlColor);
            var value = new Dictionary<string, object>();
            value["event"] = "danmaku";
            value["roomId"] = roomId;
            value["type"] = "chat";
            value["text"] = text;
            value["sender"] = sender ?? String.Empty;
            value["color"] = htmlColor;
            value["time"] = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
            host.Emit(value);
        }

        private void EmitGift(IDictionary<string, string> fields)
        {
            string giftId;
            string count;
            string sender;
            fields.TryGetValue("gfid", out giftId);
            fields.TryGetValue("gfcnt", out count);
            fields.TryGetValue("nn", out sender);
            var value = new Dictionary<string, object>();
            value["event"] = "danmaku";
            value["roomId"] = roomId;
            value["type"] = "gift";
            value["giftId"] = giftId ?? String.Empty;
            value["giftCount"] = count ?? "1";
            value["sender"] = sender ?? String.Empty;
            value["time"] = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
            host.Emit(value);
        }

        private void EmitStatus(string state, string detail)
        {
            var value = new Dictionary<string, object>();
            value["event"] = "danmaku-state";
            value["roomId"] = roomId;
            value["state"] = state;
            value["endpoint"] = endpointIndex + 8501;
            if (!String.IsNullOrEmpty(detail)) value["detail"] = detail;
            host.Emit(value);
        }

        private static async Task Send(ClientWebSocket socket, string payload, CancellationToken token)
        {
            var data = EncodeFrame(payload);
            await socket.SendAsync(new ArraySegment<byte>(data), WebSocketMessageType.Binary, true, token);
        }

        private static byte[] EncodeFrame(string payload)
        {
            var body = Encoding.UTF8.GetBytes(payload);
            var bodyLength = body.Length + 9;
            var frame = new byte[bodyLength + 4];
            WriteInt32(frame, 0, bodyLength);
            WriteInt32(frame, 4, bodyLength);
            frame[8] = 0xb1;
            frame[9] = 0x02;
            Buffer.BlockCopy(body, 0, frame, 12, body.Length);
            frame[frame.Length - 1] = 0;
            return frame;
        }

        private static string Stt(IDictionary<string, string> fields)
        {
            var result = new StringBuilder();
            foreach (var pair in fields)
            {
                result.Append(Escape(pair.Key)).Append("@=").Append(Escape(pair.Value)).Append('/');
            }
            return result.ToString();
        }

        private static Dictionary<string, string> ParseStt(string raw)
        {
            var fields = new Dictionary<string, string>();
            foreach (var part in raw.Split(new[] { '/' }, StringSplitOptions.RemoveEmptyEntries))
            {
                var separator = part.IndexOf("@=", StringComparison.Ordinal);
                if (separator <= 0) continue;
                fields[Unescape(part.Substring(0, separator))] = Unescape(part.Substring(separator + 2));
            }
            return fields;
        }

        private static string Escape(string value)
        {
            return (value ?? String.Empty).Replace("@", "@A").Replace("/", "@S");
        }

        private static string Unescape(string value)
        {
            return value.Replace("@S", "/").Replace("@A", "@");
        }

        private static int ReadInt32(IList<byte> data, int offset)
        {
            return data[offset] | data[offset + 1] << 8 | data[offset + 2] << 16 | data[offset + 3] << 24;
        }

        private static void WriteInt32(byte[] data, int offset, int value)
        {
            data[offset] = (byte)value;
            data[offset + 1] = (byte)(value >> 8);
            data[offset + 2] = (byte)(value >> 16);
            data[offset + 3] = (byte)(value >> 24);
        }

        private static string DanmakuColor(string value)
        {
            switch (value)
            {
                case "1": return "#ff7078";
                case "2": return "#73b7ff";
                case "3": return "#72e6a4";
                case "4": return "#ffd369";
                case "5": return "#c79cff";
                default: return "#ffffff";
            }
        }

        public void Dispose()
        {
            lifetime.Cancel();
            if (worker != null)
            {
                try { worker.Wait(1500); }
                catch { }
            }
            lifetime.Dispose();
        }
    }

    internal static class MpvNative
    {
        public const int EventNone = 0;
        public const int EventShutdown = 1;
        public const int EventLogMessage = 2;
        public const int EventStartFile = 6;
        public const int EventEndFile = 7;
        public const int EventFileLoaded = 8;
        public const int EventPlaybackRestart = 21;
        public const int EndFileReasonStop = 2;
        public const int EndFileReasonError = 4;
        public const int EndFileReasonRedirect = 5;

        [StructLayout(LayoutKind.Sequential)]
        public struct MpvEvent
        {
            public int EventId;
            public int Error;
            public ulong ReplyUserdata;
            public IntPtr Data;
        }

        [StructLayout(LayoutKind.Sequential)]
        public struct MpvEventLogMessage
        {
            public IntPtr Prefix;
            public IntPtr Level;
            public IntPtr Text;
            public int LogLevel;
        }

        [StructLayout(LayoutKind.Sequential)]
        public struct MpvEventEndFile
        {
            public int Reason;
            public int Error;
            public long PlaylistEntryId;
            public long PlaylistInsertId;
            public int PlaylistInsertNumEntries;
        }

        public static string ErrorText(int error)
        {
            var pointer = mpv_error_string(error);
            return pointer == IntPtr.Zero ? "错误 " + error : Marshal.PtrToStringAnsi(pointer);
        }

        public static string EndFileReasonText(int reason)
        {
            switch (reason)
            {
                case 0: return "连接结束";
                case 2: return "播放已停止";
                case 3: return "播放器退出";
                case 4: return "播放错误";
                case 5: return "地址重定向";
                default: return "原因 " + reason;
            }
        }

        [DllImport("libmpv-2.dll", CallingConvention = CallingConvention.Cdecl)]
        public static extern IntPtr mpv_create();

        [DllImport("libmpv-2.dll", CallingConvention = CallingConvention.Cdecl)]
        public static extern int mpv_initialize(IntPtr handle);

        [DllImport("libmpv-2.dll", CallingConvention = CallingConvention.Cdecl)]
        public static extern int mpv_request_log_messages(IntPtr handle, string minLevel);

        [DllImport("libmpv-2.dll", CallingConvention = CallingConvention.Cdecl)]
        public static extern IntPtr mpv_error_string(int error);

        [DllImport("libmpv-2.dll", CallingConvention = CallingConvention.Cdecl)]
        public static extern int mpv_set_option_string(IntPtr handle, string name, string value);

        [DllImport("libmpv-2.dll", CallingConvention = CallingConvention.Cdecl)]
        public static extern int mpv_set_property_string(IntPtr handle, string name, string value);

        [DllImport("libmpv-2.dll", CallingConvention = CallingConvention.Cdecl)]
        public static extern int mpv_command(IntPtr handle, IntPtr args);

        [DllImport("libmpv-2.dll", CallingConvention = CallingConvention.Cdecl)]
        public static extern IntPtr mpv_wait_event(IntPtr handle, double timeout);

        [DllImport("libmpv-2.dll", CallingConvention = CallingConvention.Cdecl)]
        public static extern void mpv_wakeup(IntPtr handle);

        [DllImport("libmpv-2.dll", CallingConvention = CallingConvention.Cdecl)]
        public static extern void mpv_terminate_destroy(IntPtr handle);
    }

    internal static class NativeMethods
    {
        public const int GwlStyle = -16;
        public const int GwlExStyle = -20;
        public const long WsChild = 0x40000000L;
        public const long WsClipSiblings = 0x04000000L;
        public const long WsClipChildren = 0x02000000L;
        public const long WsExTransparent = 0x00000020L;
        public const long WsExToolWindow = 0x00000080L;
        public const long WsExLayered = 0x00080000L;
        public const long WsExNoActivate = 0x08000000L;
        public const uint LwaColorKey = 0x1;
        public const uint LwaAlpha = 0x2;
        public const uint SwpNoSize = 0x0001;
        public const uint SwpNoMove = 0x0002;
        public const uint SwpNoZOrder = 0x0004;
        public const uint SwpNoActivate = 0x0010;
        public const int SwHide = 0;
        public const int SwShowNoActivate = 4;
        public static readonly IntPtr HwndTop = IntPtr.Zero;

        [DllImport("user32.dll")]
        public static extern IntPtr SetParent(IntPtr child, IntPtr parent);

        [DllImport("user32.dll", EntryPoint = "SetWindowLongPtr", SetLastError = true)]
        public static extern IntPtr SetWindowLongPtr64(IntPtr window, int index, IntPtr value);

        [DllImport("user32.dll", EntryPoint = "SetWindowLong", SetLastError = true)]
        public static extern IntPtr SetWindowLongPtr32(IntPtr window, int index, IntPtr value);

        public static IntPtr SetWindowLongPtr(IntPtr window, int index, IntPtr value)
        {
            return IntPtr.Size == 8 ? SetWindowLongPtr64(window, index, value)
                                    : SetWindowLongPtr32(window, index, value);
        }

        [DllImport("user32.dll", EntryPoint = "GetWindowLongPtr", SetLastError = true)]
        public static extern IntPtr GetWindowLongPtr64(IntPtr window, int index);

        [DllImport("user32.dll", EntryPoint = "GetWindowLong", SetLastError = true)]
        public static extern IntPtr GetWindowLongPtr32(IntPtr window, int index);

        public static IntPtr GetWindowLongPtr(IntPtr window, int index)
        {
            return IntPtr.Size == 8 ? GetWindowLongPtr64(window, index)
                                    : GetWindowLongPtr32(window, index);
        }

        [DllImport("user32.dll", SetLastError = true)]
        public static extern bool SetWindowPos(IntPtr window, IntPtr insertAfter, int x, int y,
            int width, int height, uint flags);

        [DllImport("user32.dll")]
        public static extern bool ShowWindow(IntPtr window, int command);

        [DllImport("user32.dll", SetLastError = true)]
        public static extern bool SetLayeredWindowAttributes(IntPtr window, uint colorKey,
            byte alpha, uint flags);

        [DllImport("user32.dll", EntryPoint = "SetProcessDpiAwarenessContext")]
        private static extern bool SetProcessDpiAwarenessContext(IntPtr value);

        [DllImport("user32.dll")]
        private static extern bool SetProcessDPIAware();

        public static uint ColorRef(Color color)
        {
            return (uint)(color.R | color.G << 8 | color.B << 16);
        }

        public static void EnablePerMonitorDpiAwareness()
        {
            try { SetProcessDpiAwarenessContext(new IntPtr(-4)); }
            catch (EntryPointNotFoundException) { SetProcessDPIAware(); }
        }
    }
}
