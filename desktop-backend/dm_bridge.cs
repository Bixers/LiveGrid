using System;
using System.IO;
using System.Net;
using System.Net.Security;
using System.Net.Sockets;
using System.Security.Authentication;
using System.Security.Cryptography;
using System.Text;
using System.Threading;

// 斗鱼弹幕 WSS 桥接程序（使用 Windows 系统加密栈 Schannel）
// 用法: dm_bridge.exe <host> <port>
// 输入: P <base64> 发送一个斗鱼数据包(自动包成WS二进制帧)；Q 退出
// 输出: OK 握手完成；C <base64> 收到的一批斗鱼数据包；ERR <文本> 错误；CLOSE 连接结束
class DmBridge
{
    static string _host;
    static int _port;
    static SslStream _net;

    static int Main(string[] args)
    {
        _host = args.Length > 0 ? args[0] : "danmuproxy.douyu.com";
        _port = args.Length > 1 ? int.Parse(args[1]) : 8506;
        Console.OutputEncoding = Encoding.UTF8;
        try
        {
            Connect();
            Console.WriteLine("OK");
            Console.Out.Flush();
        }
        catch (Exception e)
        {
            Console.WriteLine("ERR " + e.Message);
            Console.Out.Flush();
            return 1;
        }

        Thread t = new Thread(StdinLoop);
        t.IsBackground = true;
        t.Start();

        try
        {
            FrameLoop();
        }
        catch (Exception e)
        {
            Console.WriteLine("ERR " + e.Message);
            Console.Out.Flush();
        }
        Console.WriteLine("CLOSE");
        Console.Out.Flush();
        try { _net.Close(); } catch { }
        return 0;
    }

    static void Connect()
    {
        var list = new System.Collections.Generic.List<IPAddress>();
        foreach (IPAddress a in Dns.GetHostAddresses(_host))
            if (a.AddressFamily == AddressFamily.InterNetwork) list.Add(a);
        foreach (IPAddress a in Dns.GetHostAddresses(_host))
            if (a.AddressFamily == AddressFamily.InterNetworkV6) list.Add(a);
        if (list.Count == 0) throw new Exception("no address for " + _host);

        Exception last = null;
        foreach (IPAddress ip in list)
        {
            TcpClient tcp = null;
            try
            {
                tcp = new TcpClient();
                IAsyncResult ar = tcp.BeginConnect(ip, _port, null, null);
                if (!ar.AsyncWaitHandle.WaitOne(10000)) throw new Exception("connect timeout");
                tcp.EndConnect(ar);
                tcp.ReceiveTimeout = 30000;
                tcp.SendTimeout = 30000;
                SslStream ssl = new SslStream(tcp.GetStream(), false,
                    new RemoteCertificateValidationCallback((s, c, ch, e) => true));
                ssl.ReadTimeout = 15000;
                ssl.WriteTimeout = 15000;
                ssl.AuthenticateAsClient(_host, null, SslProtocols.Tls12, false);
                _net = ssl;
                WsHandshake();
                return;
            }
            catch (Exception e)
            {
                last = e;
                if (tcp != null) { try { tcp.Close(); } catch { } }
            }
        }
        throw last ?? new Exception("connect failed");
    }

    static void WsHandshake()
    {
        string key = Convert.ToBase64String(RandomBytes(16));
        string req =
            "GET / HTTP/1.1\r\n" +
            "Host: " + _host + ":" + _port + "\r\n" +
            "Upgrade: websocket\r\n" +
            "Connection: Upgrade\r\n" +
            "Sec-WebSocket-Key: " + key + "\r\n" +
            "Sec-WebSocket-Version: 13\r\n" +
            "Origin: https://www.douyu.com\r\n" +
            "\r\n";
        byte[] rb = Encoding.ASCII.GetBytes(req);
        _net.Write(rb, 0, rb.Length);
        _net.Flush();

        MemoryStream resp = new MemoryStream();
        byte[] one = new byte[1];
        while (!EndsWith(resp, 13, 10, 13, 10))
        {
            int n = _net.Read(one, 0, 1);
            if (n <= 0) throw new Exception("ws handshake closed");
            resp.WriteByte(one[0]);
            if (resp.Length > 65536) throw new Exception("ws handshake too large");
        }
        string head = Encoding.ASCII.GetString(resp.ToArray());
        if (!head.Contains(" 101 ")) throw new Exception("bad ws handshake");
    }

    static bool EndsWith(MemoryStream ms, params int[] tail)
    {
        if (ms.Length < tail.Length) return false;
        byte[] b = ms.ToArray();
        for (int i = 0; i < tail.Length; i++)
            if (b[b.Length - tail.Length + i] != tail[i]) return false;
        return true;
    }

    static void FrameLoop()
    {
        MemoryStream frag = new MemoryStream();
        byte[] remain = new byte[0];
        byte[] hdr = new byte[2];
        while (true)
        {
            if (!ReadExact(hdr, 0, 2)) break;
            int opcode = hdr[0] & 0x0F;
            bool fin = (hdr[0] & 0x80) != 0;
            int len = hdr[1] & 0x7F;
            if (len == 126)
            {
                byte[] b = new byte[2];
                if (!ReadExact(b, 0, 2)) break;
                len = (b[0] << 8) | b[1];
            }
            else if (len == 127)
            {
                byte[] b = new byte[8];
                if (!ReadExact(b, 0, 8)) break;
                long l = 0;
                for (int i = 0; i < 8; i++) l = (l << 8) | b[i];
                if (l > 4 * 1024 * 1024) throw new Exception("frame too large");
                len = (int)l;
            }
            byte[] payload = new byte[len];
            if (!ReadExact(payload, 0, len)) break;
            if (opcode == 0x8) break;                            // close
            if (opcode == 0x9) { SendMasked(0x0A, payload); continue; } // ping -> pong
            if (opcode == 0x1 || opcode == 0x2 || opcode == 0x0)
            {
                frag.Write(payload, 0, payload.Length);
                if (fin)
                {
                    byte[] whole = new byte[remain.Length + (int)frag.Length];
                    Buffer.BlockCopy(remain, 0, whole, 0, remain.Length);
                    frag.ToArray().CopyTo(whole, remain.Length);
                    remain = EmitDouyu(whole);
                    frag.SetLength(0);
                }
            }
        }
    }

    // 从 WS 载荷里拆出完整斗鱼数据包（长度字段在第0-3字节，小端），输出剩余不完整的部分
    static byte[] EmitDouyu(byte[] data)
    {
        int off = 0;
        MemoryStream outblob = new MemoryStream();
        while (off + 4 <= data.Length)
        {
            int plen = data[off] | (data[off + 1] << 8) | (data[off + 2] << 16) | (data[off + 3] << 24);
            if (plen < 9 || plen > (1 << 20)) { off++; continue; }
            if (off + 4 + plen > data.Length) break;
            outblob.Write(data, off, 4 + plen);
            off += 4 + plen;
        }
        if (outblob.Length > 0)
        {
            Console.WriteLine("C " + Convert.ToBase64String(outblob.ToArray()));
            Console.Out.Flush();
        }
        byte[] rest = new byte[data.Length - off];
        Array.Copy(data, off, rest, 0, rest.Length);
        return rest;
    }

    static void StdinLoop()
    {
        string line;
        while ((line = Console.In.ReadLine()) != null)
        {
            if (line == "Q") break;
            if (line.StartsWith("P ") && line.Length > 2)
            {
                try { SendMasked(0x2, Convert.FromBase64String(line.Substring(2))); }
                catch { }
            }
        }
    }

    static bool ReadExact(byte[] buf, int off, int n)
    {
        int got = 0;
        while (got < n)
        {
            int r = _net.Read(buf, off + got, n - got);
            if (r <= 0) return false;
            got += r;
        }
        return true;
    }

    static void SendMasked(int opcode, byte[] payload)
    {
        byte[] mask = RandomBytes(4);
        byte[] head;
        int n = payload.Length;
        if (n < 126)
        {
            head = new byte[] { (byte)(0x80 | opcode), (byte)(0x80 | n) };
        }
        else if (n < 65536)
        {
            head = new byte[] { (byte)(0x80 | opcode), (byte)(0x80 | 126), (byte)(n >> 8), (byte)n };
        }
        else
        {
            head = new byte[10];
            head[0] = (byte)(0x80 | opcode);
            head[1] = (byte)(0x80 | 127);
            long l = n;
            for (int i = 9; i >= 2; i--) { head[i] = (byte)(l & 0xFF); l >>= 8; }
        }
        byte[] outb = new byte[head.Length + 4 + n];
        Buffer.BlockCopy(head, 0, outb, 0, head.Length);
        Buffer.BlockCopy(mask, 0, outb, head.Length, 4);
        for (int i = 0; i < n; i++)
            outb[head.Length + 4 + i] = (byte)(payload[i] ^ mask[i % 4]);
        _net.Write(outb, 0, outb.Length);
        _net.Flush();
    }

    static byte[] RandomBytes(int n)
    {
        byte[] b = new byte[n];
        using (var rng = new RNGCryptoServiceProvider()) rng.GetBytes(b);
        return b;
    }
}
