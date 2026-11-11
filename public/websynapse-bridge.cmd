<# :
@echo off
setlocal
title websynap.se Local USB Bridge (127.0.0.1:18925)
set "WEBSYNAPSE_SCRIPT_DIR=%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -Command "Invoke-Expression ([System.IO.File]::ReadAllText('%~f0'))"
exit /b
#>

$ErrorActionPreference = "Stop"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$csharp = @'
using System;
using System.Collections.Generic;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using Microsoft.Win32;

public static class RazerBridgeNative
{
    public const uint GENERIC_READ = 0x80000000;
    public const uint GENERIC_WRITE = 0x40000000;
    public const uint FILE_SHARE_READ = 0x00000001;
    public const uint FILE_SHARE_WRITE = 0x00000002;
    public const uint OPEN_EXISTING = 3;
    public const uint FILE_FLAG_OVERLAPPED = 0x40000000;
    public static readonly IntPtr INVALID_HANDLE_VALUE = new IntPtr(-1);

    [StructLayout(LayoutKind.Sequential, Pack = 1)]
    public struct WINUSB_SETUP_PACKET
    {
        public byte RequestType;
        public byte Request;
        public ushort Value;
        public ushort Index;
        public ushort Length;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct NativeOverlappedSimple
    {
        public IntPtr Internal;
        public IntPtr InternalHigh;
        public uint Offset;
        public uint OffsetHigh;
        public IntPtr EventHandle;
    }

    [DllImport("CfgMgr32.dll", CharSet = CharSet.Unicode)]
    public static extern int CM_Get_Device_Interface_List_SizeW(out uint pulLen, ref Guid InterfaceClassGuid, string pDeviceID, uint ulFlags);

    [DllImport("CfgMgr32.dll", CharSet = CharSet.Unicode)]
    public static extern int CM_Get_Device_Interface_ListW(ref Guid InterfaceClassGuid, string pDeviceID, char[] Buffer, uint BufferLen, uint ulFlags);

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    public static extern IntPtr CreateFileW(string lpFileName, uint dwDesiredAccess, uint dwShareMode, IntPtr lpSecurityAttributes, uint dwCreationDisposition, uint dwFlagsAndAttributes, IntPtr hTemplateFile);

    [DllImport("kernel32.dll", SetLastError = true)]
    public static extern bool CloseHandle(IntPtr hObject);

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    public static extern IntPtr CreateEventW(IntPtr lpEventAttributes, bool bManualReset, bool bInitialState, string lpName);

    [DllImport("kernel32.dll", SetLastError = true)]
    public static extern uint WaitForSingleObject(IntPtr hHandle, uint dwMilliseconds);

    [DllImport("kernel32.dll", SetLastError = true)]
    public static extern bool CancelIoEx(IntPtr hFile, ref NativeOverlappedSimple lpOverlapped);

    [DllImport("user32.dll")]
    private static extern short GetAsyncKeyState(int vKey);

    [DllImport("user32.dll")]
    private static extern uint MapVirtualKeyW(uint uCode, uint uMapType);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern IntPtr OpenInputDesktop(uint dwFlags, bool fInherit, uint dwDesiredAccess);

    [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern IntPtr OpenDesktopW(string lpszDesktop, uint dwFlags, bool fInherit, uint dwDesiredAccess);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool SetThreadDesktop(IntPtr hDesktop);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool CloseDesktop(IntPtr hDesktop);

    [DllImport("hid.dll", SetLastError = true)]
    public static extern void HidD_GetHidGuid(out Guid HidGuid);

    [DllImport("hid.dll", SetLastError = true)]
    public static extern bool HidD_SetFeature(IntPtr HidDeviceObject, byte[] ReportBuffer, int ReportBufferLength);

    [DllImport("hid.dll", SetLastError = true)]
    public static extern bool HidD_GetFeature(IntPtr HidDeviceObject, byte[] ReportBuffer, int ReportBufferLength);

    [DllImport("hid.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    public static extern bool HidD_GetProductString(IntPtr HidDeviceObject, byte[] Buffer, int BufferLength);

    [DllImport("hid.dll", SetLastError = true)]
    public static extern bool HidD_GetPreparsedData(IntPtr HidDeviceObject, out IntPtr PreparsedData);

    [DllImport("hid.dll", SetLastError = true)]
    public static extern bool HidD_FreePreparsedData(IntPtr PreparsedData);

    [DllImport("hid.dll", SetLastError = true)]
    public static extern int HidP_GetCaps(IntPtr PreparsedData, out HIDP_CAPS Capabilities);

    [StructLayout(LayoutKind.Sequential)]
    public struct HIDP_CAPS
    {
        public ushort Usage;
        public ushort UsagePage;
        public ushort InputReportByteLength;
        public ushort OutputReportByteLength;
        public ushort FeatureReportByteLength;
        [MarshalAs(UnmanagedType.ByValArray, SizeConst = 17)]
        public ushort[] Reserved;
        public ushort NumberLinkCollectionNodes;
        public ushort NumberInputButtonCaps;
        public ushort NumberInputValueCaps;
        public ushort NumberInputDataIndices;
        public ushort NumberOutputButtonCaps;
        public ushort NumberOutputValueCaps;
        public ushort NumberOutputDataIndices;
        public ushort NumberFeatureButtonCaps;
        public ushort NumberFeatureValueCaps;
        public ushort NumberFeatureDataIndices;
    }

    [DllImport("winusb.dll", SetLastError = true)]
    public static extern bool WinUsb_Initialize(IntPtr DeviceHandle, out IntPtr InterfaceHandle);

    [DllImport("winusb.dll", SetLastError = true)]
    public static extern bool WinUsb_Free(IntPtr InterfaceHandle);

    [DllImport("winusb.dll", SetLastError = true)]
    public static extern bool WinUsb_ControlTransfer(IntPtr InterfaceHandle, WINUSB_SETUP_PACKET SetupPacket, byte[] Buffer, uint BufferLength, out uint LengthTransferred, ref NativeOverlappedSimple Overlapped);

    [DllImport("winusb.dll", SetLastError = true)]
    public static extern bool WinUsb_GetOverlappedResult(IntPtr InterfaceHandle, ref NativeOverlappedSimple Overlapped, out uint lpNumberOfBytesTransferred, bool bWait);

    public class RazerEndpoint
    {
        public int Pid;
        public int InterfaceNumber;
        public string Mode; // "hid" or "winusb"
        public string Path;
        public string Name;
        public byte Tid = 0x1F;
        public string Firmware = "";
        public string LampArrayPath = "";
        public int LampCount = 0;
        public IntPtr LampHandle = INVALID_HANDLE_VALUE;
    }

    private static readonly object IoLock = new object();
    private static readonly object CacheLock = new object();
    private static readonly object StaticLock = new object();
    private static readonly Dictionary<int, RazerEndpoint> VerifiedByPid = new Dictionary<int, RazerEndpoint>();
    private static readonly Dictionary<string, byte[]> StaticCache = new Dictionary<string, byte[]>(StringComparer.Ordinal);
    private static readonly Regex RxStripInterfaceSuffix = new Regex(@"\s*\(Interface\s+\d+\)\s*$", RegexOptions.IgnoreCase);

    private static readonly HashSet<string> AllowedOrigins = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
    {
        "https://websynap.se",
        "https://www.websynap.se",
        "http://localhost:18925",
        "http://127.0.0.1:18925",
        "http://localhost:5426",
        "http://127.0.0.1:5426",
        "http://localhost:8080",
        "http://127.0.0.1:8080",
        "http://localhost:8787",
        "http://127.0.0.1:8787"
    };

    private static readonly Dictionary<string, string> StaticAllowlist = new Dictionary<string, string>(StringComparer.Ordinal)
    {
        { "/index.html", "text/html; charset=utf-8" },
        { "/styles.css", "text/css; charset=utf-8" },
        { "/app.js", "application/javascript; charset=utf-8" },
        { "/protocol25.js", "application/javascript; charset=utf-8" },
        { "/timer-worker.js", "application/javascript; charset=utf-8" },
        { "/LICENSE", "text/plain; charset=utf-8" },
        { "/fonts/DMSans-Variable.ttf", "font/ttf" },
        { "/fonts/DM-Sans-OFL.txt", "text/plain; charset=utf-8" },
        { "/websynapse-bridge.cmd", "application/octet-stream" }
    };

    private static string CleanProductName(string raw)
    {
        if (string.IsNullOrWhiteSpace(raw)) return "";
        return RxStripInterfaceSuffix.Replace(raw.Trim(), "").Trim();
    }

    private static void SafeCloseLampHandle(RazerEndpoint ep)
    {
        if (ep == null) return;
        IntPtr h = ep.LampHandle;
        ep.LampHandle = INVALID_HANDLE_VALUE;
        if (h != IntPtr.Zero && h != INVALID_HANDLE_VALUE)
        {
            try { CloseHandle(h); } catch { }
        }
    }

    public static void ClearVerifiedCache()
    {
        lock (CacheLock)
        {
            lock (IoLock)
            {
                foreach (var kv in VerifiedByPid)
                {
                    SafeCloseLampHandle(kv.Value);
                }
            }
            VerifiedByPid.Clear();
        }
    }

    private static void InvalidatePid(int pidNum)
    {
        lock (CacheLock)
        {
            RazerEndpoint ep;
            if (VerifiedByPid.TryGetValue(pidNum, out ep))
            {
                lock (IoLock) { SafeCloseLampHandle(ep); }
                VerifiedByPid.Remove(pidNum);
            }
        }
    }

    private static List<string> GetInterfacePathsForGuid(Guid guid)
    {
        var list = new List<string>();
        uint size;
        if (CM_Get_Device_Interface_List_SizeW(out size, ref guid, null, 0) != 0 || size <= 1)
            return list;
        var buf = new char[size];
        if (CM_Get_Device_Interface_ListW(ref guid, null, buf, size, 0) != 0)
            return list;
        int start = 0;
        for (int i = 0; i < buf.Length; i++)
        {
            if (buf[i] == '\0')
            {
                if (i > start)
                    list.Add(new string(buf, start, i - start));
                start = i + 1;
                if (start < buf.Length && buf[start] == '\0')
                    break;
            }
        }
        return list;
    }

    public static List<RazerEndpoint> DiscoverEndpoints()
    {
        var results = new List<RazerEndpoint>();
        var rxVidPidMi = new Regex(@"vid_1532&pid_([0-9a-f]{4})(?:&mi_([0-9a-f]{2}))?", RegexOptions.IgnoreCase);

        // 1. Discover WinUSB Razer interfaces from Registry + CfgMgr32
        try
        {
            using (var usbKey = Registry.LocalMachine.OpenSubKey(@"SYSTEM\CurrentControlSet\Enum\USB"))
            {
                if (usbKey != null)
                {
                    foreach (var devKeyName in usbKey.GetSubKeyNames())
                    {
                        var m = rxVidPidMi.Match(devKeyName);
                        if (!m.Success) continue;
                        int pid = Convert.ToInt32(m.Groups[1].Value, 16);
                        int mi = m.Groups[2].Success ? Convert.ToInt32(m.Groups[2].Value, 16) : 0;
                        using (var devKey = usbKey.OpenSubKey(devKeyName))
                        {
                            if (devKey == null) continue;
                            foreach (var instName in devKey.GetSubKeyNames())
                            {
                                using (var instKey = devKey.OpenSubKey(instName))
                                {
                                    if (instKey == null) continue;
                                    string svc = Convert.ToString(instKey.GetValue("Service") ?? "");
                                    if (!svc.Equals("WinUSB", StringComparison.OrdinalIgnoreCase)) continue;
                                    string desc = Convert.ToString(instKey.GetValue("DeviceDesc") ?? "");
                                    int semi = desc.LastIndexOf(';');
                                    if (semi >= 0 && semi + 1 < desc.Length) desc = desc.Substring(semi + 1);
                                    desc = CleanProductName(desc);
                                    using (var dpKey = instKey.OpenSubKey("Device Parameters"))
                                    {
                                        if (dpKey == null) continue;
                                        var rawGuids = dpKey.GetValue("DeviceInterfaceGUIDs") as string[];
                                        string singleGuid = dpKey.GetValue("DeviceInterfaceGUID") as string;
                                        var guidStrs = new List<string>();
                                        if (rawGuids != null) guidStrs.AddRange(rawGuids);
                                        if (!string.IsNullOrEmpty(singleGuid)) guidStrs.Add(singleGuid);
                                        foreach (var gs in guidStrs)
                                        {
                                            Guid g;
                                            if (!Guid.TryParse(gs.Trim(), out g)) continue;
                                            foreach (var p in GetInterfacePathsForGuid(g))
                                            {
                                                if (p.IndexOf(m.Groups[1].Value, StringComparison.OrdinalIgnoreCase) >= 0)
                                                {
                                                    results.Add(new RazerEndpoint { Pid = pid, InterfaceNumber = mi, Mode = "winusb", Path = p, Name = desc });
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
        catch { }

        // 2. Discover standard Windows HidUsb Razer interfaces (zero-Zadig path)
        try
        {
            Guid hidGuid;
            HidD_GetHidGuid(out hidGuid);
            foreach (var p in GetInterfacePathsForGuid(hidGuid))
            {
                var m = rxVidPidMi.Match(p);
                if (!m.Success) continue;
                int pid = Convert.ToInt32(m.Groups[1].Value, 16);
                int mi = m.Groups[2].Success ? Convert.ToInt32(m.Groups[2].Value, 16) : 0;
                string prodName = "";
                IntPtr h = CreateFileW(p, 0, FILE_SHARE_READ | FILE_SHARE_WRITE, IntPtr.Zero, OPEN_EXISTING, 0, IntPtr.Zero);
                if (h != INVALID_HANDLE_VALUE)
                {
                    var nameBuf = new byte[256];
                    if (HidD_GetProductString(h, nameBuf, nameBuf.Length))
                    {
                        prodName = CleanProductName(Encoding.Unicode.GetString(nameBuf).TrimEnd('\0'));
                    }
                    CloseHandle(h);
                }
                results.Add(new RazerEndpoint { Pid = pid, InterfaceNumber = mi, Mode = "hid", Path = p, Name = prodName });
            }
        }
        catch { }

        return results;
    }

    private static int InterfacePriority(RazerEndpoint ep)
    {
        int baseScore = (ep.Mode == "winusb") ? 0 : 100;
        int ifRank = 9;
        switch (ep.InterfaceNumber)
        {
            case 3: ifRank = 0; break;
            case 0: ifRank = 1; break;
            case 2: ifRank = 2; break;
            case 1: ifRank = 3; break;
        }
        return baseScore + ifRank;
    }

    private static byte[] NewFwProbePacket(byte tid)
    {
        var b = new byte[90];
        b[1] = tid;
        b[5] = 0x02;
        b[6] = 0x00;
        b[7] = 0x81;
        byte crc = 0;
        for (int i = 2; i < 88; i++) crc ^= b[i];
        b[88] = crc;
        return b;
    }

    public static RazerEndpoint ResolveRazerDevice(int pidNum, bool forceRediscover)
    {
        if (!forceRediscover)
        {
            lock (CacheLock)
            {
                RazerEndpoint fastHit;
                if (VerifiedByPid.TryGetValue(pidNum, out fastHit) && fastHit != null)
                {
                    return fastHit;
                }
            }
        }

        var all = DiscoverEndpoints();
        return ResolveRazerDeviceFromDiscovered(pidNum, all);
    }

    private static RazerEndpoint ResolveRazerDeviceFromDiscovered(int pidNum, List<RazerEndpoint> allDiscovered)
    {
        var candidates = new List<RazerEndpoint>();
        for (int i = 0; i < allDiscovered.Count; i++)
        {
            if (allDiscovered[i].Pid == pidNum)
                candidates.Add(allDiscovered[i]);
        }
        if (candidates.Count == 0)
        {
            InvalidatePid(pidNum);
            return null;
        }

        lock (CacheLock)
        {
            RazerEndpoint cached;
            if (VerifiedByPid.TryGetValue(pidNum, out cached) && cached != null)
            {
                for (int i = 0; i < candidates.Count; i++)
                {
                    if (string.Equals(candidates[i].Path, cached.Path, StringComparison.OrdinalIgnoreCase))
                    {
                        if (string.IsNullOrEmpty(cached.LampArrayPath))
                            AttachLampArrayInfo(cached);
                        if (string.IsNullOrEmpty(cached.Name) && !string.IsNullOrEmpty(candidates[i].Name))
                            cached.Name = candidates[i].Name;
                        return cached;
                    }
                }
                lock (IoLock) { SafeCloseLampHandle(cached); }
                VerifiedByPid.Remove(pidNum);
            }
        }

        candidates.Sort(delegate(RazerEndpoint a, RazerEndpoint b)
        {
            return InterfacePriority(a).CompareTo(InterfacePriority(b));
        });

        byte[] probeTids = new byte[] { 0x1F, 0x3F, 0xFF };
        for (int i = 0; i < candidates.Count; i++)
        {
            var ep = candidates[i];
            for (int t = 0; t < probeTids.Length; t++)
            {
                byte tid = probeTids[t];
                byte[] probe = NewFwProbePacket(tid);
                byte[] rx = TransferProtocol25OnEndpoint(ep, probe, 500);
                if (rx != null && rx[1] == 0x02 && rx[7] == 0x00 && rx[8] == 0x81)
                {
                    ep.Tid = tid;
                    ep.Firmware = string.Format("v{0}.{1:D2}", (int)rx[9], (int)rx[10]);
                    if (string.IsNullOrEmpty(ep.Name))
                    {
                        for (int k = 0; k < candidates.Count; k++)
                        {
                            if (!string.IsNullOrEmpty(candidates[k].Name))
                            {
                                ep.Name = candidates[k].Name;
                                break;
                            }
                        }
                    }
                    AttachLampArrayInfo(ep);
                    lock (CacheLock)
                    {
                        RazerEndpoint oldEp;
                        if (VerifiedByPid.TryGetValue(pidNum, out oldEp) && oldEp != ep)
                        {
                            lock (IoLock) { SafeCloseLampHandle(oldEp); }
                        }
                        VerifiedByPid[pidNum] = ep;
                    }
                    return ep;
                }
            }
        }
        return null;
    }

    public static List<RazerEndpoint> GetVerifiedEndpoints(bool forceRescan)
    {
        if (forceRescan)
        {
            ClearVerifiedCache();
        }
        var all = DiscoverEndpoints();
        var uniquePids = new List<int>();
        var pidSet = new HashSet<int>();
        for (int i = 0; i < all.Count; i++)
        {
            int p = all[i].Pid;
            if (p > 0 && pidSet.Add(p))
                uniquePids.Add(p);
        }

        // Prune disconnected cached PIDs
        lock (CacheLock)
        {
            var stale = new List<int>();
            foreach (var kv in VerifiedByPid)
            {
                if (!pidSet.Contains(kv.Key))
                    stale.Add(kv.Key);
            }
            for (int i = 0; i < stale.Count; i++)
            {
                RazerEndpoint oldEp = VerifiedByPid[stale[i]];
                lock (IoLock) { SafeCloseLampHandle(oldEp); }
                VerifiedByPid.Remove(stale[i]);
            }
        }

        var list = new List<RazerEndpoint>();
        for (int i = 0; i < uniquePids.Count; i++)
        {
            var v = ResolveRazerDeviceFromDiscovered(uniquePids[i], all);
            if (v != null) list.Add(v);
        }
        return list;
    }

    private static bool WinUsbControl(IntPtr hFile, IntPtr hUsb, byte reqType, byte req, ushort val, ushort idx, byte[] buf, int timeoutMs)
    {
        var ov = new NativeOverlappedSimple();
        ov.EventHandle = CreateEventW(IntPtr.Zero, true, false, null);
        try
        {
            uint transferred = 0;
            var sp = new WINUSB_SETUP_PACKET { RequestType = reqType, Request = req, Value = val, Index = idx, Length = (ushort)buf.Length };
            bool ok = WinUsb_ControlTransfer(hUsb, sp, buf, (uint)buf.Length, out transferred, ref ov);
            int err = Marshal.GetLastWin32Error();
            if (!ok && err == 997) // ERROR_IO_PENDING
            {
                uint w = WaitForSingleObject(ov.EventHandle, (uint)timeoutMs);
                if (w == 0)
                {
                    ok = WinUsb_GetOverlappedResult(hUsb, ref ov, out transferred, false);
                }
                else
                {
                    CancelIoEx(hFile, ref ov);
                    ok = false;
                }
            }
            return ok && transferred >= 90;
        }
        finally
        {
            if (ov.EventHandle != IntPtr.Zero) CloseHandle(ov.EventHandle);
        }
    }

    public static void ValidatePacket90(byte[] body90)
    {
        if (body90 == null || body90.Length != 90)
            throw new ArgumentException("Protocol 25 body90 must be 90 bytes");
        byte cmdClass = body90[6];
        byte cmdId = body90[7];
        // Block bootloader / DFU / firmware-flash classes strictly
        if (cmdClass == 0xFF || cmdClass == 0xFE || (cmdClass == 0x00 && (cmdId == 0x09 || cmdId == 0xF0)))
            throw new InvalidOperationException("Blocked restricted bootloader/firmware command");
        byte crc = 0;
        for (int i = 2; i < 88; i++) crc ^= body90[i];
        body90[88] = crc;
        body90[89] = 0x00;
    }

    public static byte[] TransferProtocol25OnEndpoint(RazerEndpoint ep, byte[] body90, int timeoutMs)
    {
        ValidatePacket90(body90);
        byte cmdClass = body90[6];
        byte cmdId = body90[7];

        lock (IoLock)
        {
            if (ep.Mode == "winusb")
            {
                IntPtr hFile = CreateFileW(ep.Path, GENERIC_READ | GENERIC_WRITE, FILE_SHARE_READ | FILE_SHARE_WRITE, IntPtr.Zero, OPEN_EXISTING, FILE_FLAG_OVERLAPPED, IntPtr.Zero);
                if (hFile == INVALID_HANDLE_VALUE) return null;
                IntPtr hUsb = IntPtr.Zero;
                try
                {
                    if (!WinUsb_Initialize(hFile, out hUsb)) return null;
                    var tx = (byte[])body90.Clone();
                    if (!WinUsbControl(hFile, hUsb, 0x21, 0x09, 0x0300, (ushort)ep.InterfaceNumber, tx, 400))
                        return null;

                    int elapsed = 0;
                    int wait = 6;
                    byte[] lastRx91 = null;
                    while (elapsed < timeoutMs)
                    {
                        Thread.Sleep(wait);
                        elapsed += wait;
                        wait = Math.Min(25, (int)Math.Round(wait * 1.8));
                        var rx90 = new byte[90];
                        if (!WinUsbControl(hFile, hUsb, 0xA1, 0x01, 0x0300, (ushort)ep.InterfaceNumber, rx90, 400))
                            continue;
                        lastRx91 = new byte[91];
                        Buffer.BlockCopy(rx90, 0, lastRx91, 1, 90);
                        byte status = rx90[0];
                        if (rx90[6] == cmdClass && rx90[7] == cmdId && status != 0x00 && status != 0x01)
                            return lastRx91;
                    }
                    return lastRx91;
                }
                finally
                {
                    if (hUsb != IntPtr.Zero) WinUsb_Free(hUsb);
                    CloseHandle(hFile);
                }
            }
            else
            {
                IntPtr hHid = CreateFileW(ep.Path, 0, FILE_SHARE_READ | FILE_SHARE_WRITE, IntPtr.Zero, OPEN_EXISTING, 0, IntPtr.Zero);
                if (hHid == INVALID_HANDLE_VALUE) return null;
                try
                {
                    var tx91 = new byte[91];
                    tx91[0] = 0x00;
                    Buffer.BlockCopy(body90, 0, tx91, 1, 90);
                    if (!HidD_SetFeature(hHid, tx91, 91)) return null;

                    int elapsed = 0;
                    int wait = 5;
                    byte[] lastRx91 = null;
                    while (elapsed < timeoutMs)
                    {
                        Thread.Sleep(wait);
                        elapsed += wait;
                        wait = Math.Min(25, wait * 2);
                        var rx91 = new byte[91];
                        rx91[0] = 0x00;
                        if (!HidD_GetFeature(hHid, rx91, 91)) continue;
                        lastRx91 = rx91;
                        byte status = rx91[1];
                        if (rx91[7] == cmdClass && rx91[8] == cmdId && status != 0x00 && status != 0x01)
                            return rx91;
                    }
                    return lastRx91;
                }
                finally
                {
                    CloseHandle(hHid);
                }
            }
        }
    }

    public static void AttachLampArrayInfo(RazerEndpoint ep)
    {
        if (ep == null) return;
        try
        {
            Guid hidGuid;
            HidD_GetHidGuid(out hidGuid);
            string needle = string.Format("vid_1532&pid_{0:x4}", ep.Pid);
            foreach (var p in GetInterfacePathsForGuid(hidGuid))
            {
                if (p.IndexOf(needle, StringComparison.OrdinalIgnoreCase) < 0) continue;
                IntPtr h = CreateFileW(p, 0, FILE_SHARE_READ | FILE_SHARE_WRITE, IntPtr.Zero, OPEN_EXISTING, 0, IntPtr.Zero);
                if (h == INVALID_HANDLE_VALUE) continue;
                try
                {
                    IntPtr ppd;
                    if (!HidD_GetPreparsedData(h, out ppd)) continue;
                    HIDP_CAPS caps;
                    int st = HidP_GetCaps(ppd, out caps);
                    HidD_FreePreparsedData(ppd);
                    if (st < 0 || caps.UsagePage != 0x0059 || caps.FeatureReportByteLength < 4) continue;
                    int count = 87;
                    var rep1 = new byte[caps.FeatureReportByteLength];
                    rep1[0] = 0x01;
                    if (HidD_GetFeature(h, rep1, rep1.Length))
                    {
                        int parsed = rep1[1] | (rep1[2] << 8);
                        if (parsed > 0 && parsed <= 256) count = parsed;
                    }
                    ep.LampArrayPath = p;
                    ep.LampCount = count;
                    return;
                }
                finally
                {
                    CloseHandle(h);
                }
            }
        }
        catch { }
    }

    private static bool WriteLampReportsWithPersistentHandle(RazerEndpoint ep, List<byte[]> reports)
    {
        if (ep == null || string.IsNullOrEmpty(ep.LampArrayPath))
            return false;

        lock (IoLock)
        {
            if (ep.LampHandle == IntPtr.Zero || ep.LampHandle == INVALID_HANDLE_VALUE)
            {
                ep.LampHandle = CreateFileW(ep.LampArrayPath, 0, FILE_SHARE_READ | FILE_SHARE_WRITE, IntPtr.Zero, OPEN_EXISTING, 0, IntPtr.Zero);
                if (ep.LampHandle == INVALID_HANDLE_VALUE)
                    return false;
            }

            for (int i = 0; i < reports.Count; i++)
            {
                byte[] raw = reports[i];
                if (raw == null || raw.Length < 2 || raw.Length > 64) continue;
                byte reportId = raw[0];
                if (reportId != 4 && reportId != 6) continue;
                if (!HidD_SetFeature(ep.LampHandle, raw, raw.Length))
                {
                    SafeCloseLampHandle(ep);
                    return false;
                }
            }
            return true;
        }
    }

    public static bool SendLampArrayForPid(int pidNum, List<byte[]> reports, out int lampCount, out string errMsg)
    {
        lampCount = 0;
        errMsg = "";
        if (reports == null || reports.Count == 0)
        {
            errMsg = "No LampArray reports provided";
            return false;
        }
        if (reports.Count > 64)
        {
            errMsg = "Too many LampArray reports in single batch";
            return false;
        }

        RazerEndpoint ep = ResolveRazerDevice(pidNum, false);
        if (ep != null && string.IsNullOrEmpty(ep.LampArrayPath))
        {
            AttachLampArrayInfo(ep);
        }
        if (ep == null || string.IsNullOrEmpty(ep.LampArrayPath))
        {
            errMsg = "LampArray HID interface not available for this device";
            return false;
        }

        if (WriteLampReportsWithPersistentHandle(ep, reports))
        {
            lampCount = ep.LampCount;
            return true;
        }

        // Re-attach once in case USB device re-enumerated
        ep.LampArrayPath = "";
        AttachLampArrayInfo(ep);
        if (!string.IsNullOrEmpty(ep.LampArrayPath) && WriteLampReportsWithPersistentHandle(ep, reports))
        {
            lampCount = ep.LampCount;
            return true;
        }

        errMsg = "HidD_SetFeature failed on LampArray interface";
        return false;
    }

    public static string JsonEscape(string s)
    {
        if (s == null) return "";
        var sb = new StringBuilder(s.Length + 8);
        foreach (char c in s)
        {
            switch (c)
            {
                case '\\': sb.Append("\\\\"); break;
                case '"': sb.Append("\\\""); break;
                case '\r': sb.Append("\\r"); break;
                case '\n': sb.Append("\\n"); break;
                case '\t': sb.Append("\\t"); break;
                default:
                    if (c < 32) sb.AppendFormat("\\u{0:x4}", (int)c);
                    else sb.Append(c);
                    break;
            }
        }
        return sb.ToString();
    }

    public static string FormatDevicesJson(List<RazerEndpoint> verified)
    {
        var sb = new StringBuilder();
        sb.Append("{\"ok\":true,\"bridgeVersion\":\"1.4.1\",\"devices\":[");
        for (int i = 0; i < verified.Count; i++)
        {
            if (i > 0) sb.Append(',');
            var v = verified[i];
            string hexPid = string.Format("0x{0:X4}", v.Pid);
            string name = !string.IsNullOrWhiteSpace(v.Name) ? v.Name : string.Format("Razer Device ({0})", hexPid);
            bool hasLamp = !string.IsNullOrEmpty(v.LampArrayPath);
            sb.Append('{');
            sb.AppendFormat("\"vendorId\":5426,\"productId\":{0},\"hexPid\":\"{1}\",\"productName\":\"{2}\",\"interfaceNumber\":{3},\"transport\":\"{4}\",\"firmware\":\"{5}\",\"tid\":{6},\"hasLampArray\":{7},\"lampCount\":{8}",
                v.Pid, hexPid, JsonEscape(name), v.InterfaceNumber, JsonEscape(v.Mode), JsonEscape(v.Firmware ?? ""), (int)v.Tid, hasLamp ? "true" : "false", v.LampCount);
            sb.Append('}');
        }
        sb.Append("]}");
        return sb.ToString();
    }

    public static string FormatTransferJson(RazerEndpoint ep, byte[] rx91)
    {
        var sb = new StringBuilder(450);
        sb.AppendFormat("{{\"ok\":true,\"transport\":\"{0}\",\"interfaceNumber\":{1},\"rx91\":[", JsonEscape(ep.Mode), ep.InterfaceNumber);
        for (int i = 0; i < rx91.Length; i++)
        {
            if (i > 0) sb.Append(',');
            sb.Append((int)rx91[i]);
        }
        sb.Append("]}");
        return sb.ToString();
    }

    // =========================================================================
    // Zero-Hook, Zero-Latency Reactive Lighting Key-Edge Tracker (/keyevents)
    // Uses GetAsyncKeyState bitmask transitions (never WH_KEYBOARD_LL hooks,
    // never stores characters/text, sleeps at 0% CPU when not polled).
    // =========================================================================
    private struct KeyPollDef
    {
        public uint ScanCode;
        public int FallbackVk;
        public string Code;
        public KeyPollDef(uint sc, int vk, string code) { ScanCode = sc; FallbackVk = vk; Code = code; }
    }

    private struct KeyEdgeItem
    {
        public long Seq;
        public string Code;
        public bool Down;
    }

    private static readonly KeyPollDef[] KeyPollDefs = new KeyPollDef[]
    {
        new KeyPollDef(0, 0x1B, "Escape"),
        new KeyPollDef(0, 0x70, "F1"), new KeyPollDef(0, 0x71, "F2"), new KeyPollDef(0, 0x72, "F3"), new KeyPollDef(0, 0x73, "F4"),
        new KeyPollDef(0, 0x74, "F5"), new KeyPollDef(0, 0x75, "F6"), new KeyPollDef(0, 0x76, "F7"), new KeyPollDef(0, 0x77, "F8"),
        new KeyPollDef(0, 0x78, "F9"), new KeyPollDef(0, 0x79, "F10"), new KeyPollDef(0, 0x7A, "F11"), new KeyPollDef(0, 0x7B, "F12"),
        new KeyPollDef(0, 0x2C, "PrintScreen"), new KeyPollDef(0, 0x91, "ScrollLock"), new KeyPollDef(0, 0x13, "Pause"),
        new KeyPollDef(0x29, 0xC0, "Backquote"),
        new KeyPollDef(0x02, 0x31, "Digit1"), new KeyPollDef(0x03, 0x32, "Digit2"), new KeyPollDef(0x04, 0x33, "Digit3"),
        new KeyPollDef(0x05, 0x34, "Digit4"), new KeyPollDef(0x06, 0x35, "Digit5"), new KeyPollDef(0x07, 0x36, "Digit6"),
        new KeyPollDef(0x08, 0x37, "Digit7"), new KeyPollDef(0x09, 0x38, "Digit8"), new KeyPollDef(0x0A, 0x39, "Digit9"),
        new KeyPollDef(0x0B, 0x30, "Digit0"), new KeyPollDef(0x0C, 0xBD, "Minus"), new KeyPollDef(0x0D, 0xBB, "Equal"),
        new KeyPollDef(0, 0x08, "Backspace"),
        new KeyPollDef(0, 0x2D, "Insert"), new KeyPollDef(0, 0x24, "Home"), new KeyPollDef(0, 0x21, "PageUp"),
        new KeyPollDef(0, 0x09, "Tab"),
        new KeyPollDef(0x10, 0x51, "KeyQ"), new KeyPollDef(0x11, 0x57, "KeyW"), new KeyPollDef(0x12, 0x45, "KeyE"),
        new KeyPollDef(0x13, 0x52, "KeyR"), new KeyPollDef(0x14, 0x54, "KeyT"), new KeyPollDef(0x15, 0x59, "KeyY"),
        new KeyPollDef(0x16, 0x55, "KeyU"), new KeyPollDef(0x17, 0x49, "KeyI"), new KeyPollDef(0x18, 0x4F, "KeyO"),
        new KeyPollDef(0x19, 0x50, "KeyP"), new KeyPollDef(0x1A, 0xDB, "BracketLeft"), new KeyPollDef(0x1B, 0xDD, "BracketRight"),
        new KeyPollDef(0x2B, 0xDC, "Backslash"),
        new KeyPollDef(0, 0x2E, "Delete"), new KeyPollDef(0, 0x23, "End"), new KeyPollDef(0, 0x22, "PageDown"),
        new KeyPollDef(0, 0x14, "CapsLock"),
        new KeyPollDef(0x1E, 0x41, "KeyA"), new KeyPollDef(0x1F, 0x53, "KeyS"), new KeyPollDef(0x20, 0x44, "KeyD"),
        new KeyPollDef(0x21, 0x46, "KeyF"), new KeyPollDef(0x22, 0x47, "KeyG"), new KeyPollDef(0x23, 0x48, "KeyH"),
        new KeyPollDef(0x24, 0x4A, "KeyJ"), new KeyPollDef(0x25, 0x4B, "KeyK"), new KeyPollDef(0x26, 0x4C, "KeyL"),
        new KeyPollDef(0x27, 0xBA, "Semicolon"), new KeyPollDef(0x28, 0xDE, "Quote"),
        new KeyPollDef(0, 0x0D, "Enter"),
        new KeyPollDef(0, 0xA0, "ShiftLeft"), new KeyPollDef(0x56, 0xE2, "IntlBackslash"),
        new KeyPollDef(0x2C, 0x5A, "KeyZ"), new KeyPollDef(0x2D, 0x58, "KeyX"), new KeyPollDef(0x2E, 0x43, "KeyC"),
        new KeyPollDef(0x2F, 0x56, "KeyV"), new KeyPollDef(0x30, 0x42, "KeyB"), new KeyPollDef(0x31, 0x4E, "KeyN"),
        new KeyPollDef(0x32, 0x4D, "KeyM"), new KeyPollDef(0x33, 0xBC, "Comma"), new KeyPollDef(0x34, 0xBE, "Period"),
        new KeyPollDef(0x35, 0xBF, "Slash"), new KeyPollDef(0, 0xA1, "ShiftRight"),
        new KeyPollDef(0, 0x26, "ArrowUp"),
        new KeyPollDef(0, 0xA2, "ControlLeft"), new KeyPollDef(0, 0x5B, "MetaLeft"), new KeyPollDef(0, 0xA4, "AltLeft"),
        new KeyPollDef(0, 0x20, "Space"), new KeyPollDef(0, 0xA5, "AltRight"), new KeyPollDef(0, 0x5D, "ContextMenu"),
        new KeyPollDef(0, 0xA3, "ControlRight"),
        new KeyPollDef(0, 0x25, "ArrowLeft"), new KeyPollDef(0, 0x28, "ArrowDown"), new KeyPollDef(0, 0x27, "ArrowRight")
    };

    private static readonly object KeyRingLock = new object();
    private static readonly KeyEdgeItem[] KeyRing = new KeyEdgeItem[128];
    private static long NextKeySeq = 1;
    private static long LastKeyClientTicks = 0;
    private static Thread KeyPollerThread = null;

    private static void EnsureKeyPollerActive()
    {
        Interlocked.Exchange(ref LastKeyClientTicks, DateTime.UtcNow.Ticks);
        if (KeyPollerThread != null) return;
        lock (KeyRingLock)
        {
            if (KeyPollerThread == null)
            {
                Thread t = new Thread(KeyPollerLoop);
                t.IsBackground = true;
                t.Name = "WebSynapseReactiveKeyPoller";
                KeyPollerThread = t;
                t.Start();
            }
        }
    }

    private static void KeyPollerLoop()
    {
        int n = KeyPollDefs.Length;
        bool[] prevDown = new bool[n];
        int[] resolvedVk = new int[n];
        long lastVkMapTicks = 0;
        bool wasIdle = true;
        IntPtr attachedDesktop = IntPtr.Zero;

        while (true)
        {
            long nowTicks = DateTime.UtcNow.Ticks;
            long lastClient = Interlocked.Read(ref LastKeyClientTicks);
            if (nowTicks - lastClient > 30000000L) // > 3.0s idle -> sleep at 0% CPU
            {
                wasIdle = true;
                Thread.Sleep(120);
                continue;
            }

            if (wasIdle || (nowTicks - lastVkMapTicks > 25000000L))
            {
                // Attach poller thread to the interactive user Input Desktop ("Default")
                // so GetAsyncKeyState & MapVirtualKeyW always see live physical keystrokes
                // even when the bridge was spawned from a background / non-interactive desktop.
                IntPtr hd = OpenInputDesktop(0, false, 0x01FF);
                if (hd == IntPtr.Zero) hd = OpenDesktopW("Default", 0, false, 0x01FF);
                if (hd != IntPtr.Zero)
                {
                    if (SetThreadDesktop(hd))
                    {
                        if (attachedDesktop != IntPtr.Zero && attachedDesktop != hd)
                        {
                            try { CloseDesktop(attachedDesktop); } catch { }
                        }
                        attachedDesktop = hd;
                    }
                    else
                    {
                        try { CloseDesktop(hd); } catch { }
                    }
                }

                for (int i = 0; i < n; i++)
                {
                    uint sc = KeyPollDefs[i].ScanCode;
                    int vk = KeyPollDefs[i].FallbackVk;
                    if (sc != 0)
                    {
                        uint m = MapVirtualKeyW(sc, 1);
                        if (m > 0 && m < 255) vk = (int)m;
                    }
                    resolvedVk[i] = vk;
                }
                lastVkMapTicks = nowTicks;
            }

            if (wasIdle)
            {
                for (int i = 0; i < n; i++)
                {
                    prevDown[i] = (GetAsyncKeyState(resolvedVk[i]) & unchecked((short)0x8000)) != 0;
                }
                wasIdle = false;
                Thread.Sleep(4);
                continue;
            }

            for (int i = 0; i < n; i++)
            {
                short st = GetAsyncKeyState(resolvedVk[i]);
                bool isDown = (st & unchecked((short)0x8000)) != 0;
                bool tappedBetweenPolls = !isDown && !prevDown[i] && ((st & 1) != 0);
                if (tappedBetweenPolls)
                {
                    lock (KeyRingLock)
                    {
                        long seqDn = NextKeySeq++;
                        int idxDn = (int)(seqDn & 127);
                        KeyRing[idxDn].Seq = seqDn;
                        KeyRing[idxDn].Code = KeyPollDefs[i].Code;
                        KeyRing[idxDn].Down = true;

                        long seqUp = NextKeySeq++;
                        int idxUp = (int)(seqUp & 127);
                        KeyRing[idxUp].Seq = seqUp;
                        KeyRing[idxUp].Code = KeyPollDefs[i].Code;
                        KeyRing[idxUp].Down = false;
                    }
                }
                else if (isDown != prevDown[i])
                {
                    prevDown[i] = isDown;
                    lock (KeyRingLock)
                    {
                        long seq = NextKeySeq++;
                        int idx = (int)(seq & 127);
                        KeyRing[idx].Seq = seq;
                        KeyRing[idx].Code = KeyPollDefs[i].Code;
                        KeyRing[idx].Down = isDown;
                    }
                }
            }
            Thread.Sleep(4);
        }
    }

    private static long ParseQueryLong(string queryStr, string key, long defaultVal)
    {
        if (string.IsNullOrEmpty(queryStr)) return defaultVal;
        string prefix = key + "=";
        string[] parts = queryStr.Split('&');
        for (int i = 0; i < parts.Length; i++)
        {
            if (parts[i].StartsWith(prefix, StringComparison.Ordinal))
            {
                long v;
                if (long.TryParse(parts[i].Substring(prefix.Length), out v)) return v;
            }
        }
        return defaultVal;
    }

    public static string FormatKeyEventsJson(long sinceSeq)
    {
        EnsureKeyPollerActive();
        var sb = new StringBuilder(192);
        lock (KeyRingLock)
        {
            long latest = NextKeySeq - 1;
            sb.Append("{\"ok\":true,\"seq\":");
            sb.Append(latest);
            sb.Append(",\"events\":[");
            if (sinceSeq >= 0 && sinceSeq < latest)
            {
                long start = Math.Max(sinceSeq + 1, latest - 120);
                bool first = true;
                for (long s = start; s <= latest; s++)
                {
                    KeyEdgeItem item = KeyRing[(int)(s & 127)];
                    if (item.Seq == s && item.Code != null)
                    {
                        if (!first) sb.Append(',');
                        first = false;
                        sb.Append("{\"c\":\"");
                        sb.Append(item.Code);
                        sb.Append("\",\"d\":");
                        sb.Append(item.Down ? '1' : '0');
                        sb.Append('}');
                    }
                }
            }
            sb.Append("]}");
        }
        return sb.ToString();
    }

    // =========================================================================
    // Zero-Allocation / Fast C# JSON Extractors for /lamparray and /transfer
    // =========================================================================
    private static int FindJsonValueStart(string json, string key)
    {
        if (string.IsNullOrEmpty(json)) return -1;
        string token = "\"" + key + "\"";
        int searchFrom = 0;
        while (searchFrom < json.Length)
        {
            int idx = json.IndexOf(token, searchFrom, StringComparison.Ordinal);
            if (idx < 0) return -1;
            int p = idx + token.Length;
            while (p < json.Length && char.IsWhiteSpace(json[p])) p++;
            if (p < json.Length && json[p] == ':')
            {
                p++;
                while (p < json.Length && char.IsWhiteSpace(json[p])) p++;
                return p;
            }
            searchFrom = idx + token.Length;
        }
        return -1;
    }

    private static bool TryExtractJsonInt(string json, string key, out int val)
    {
        val = 0;
        int p = FindJsonValueStart(json, key);
        if (p < 0 || p >= json.Length) return false;
        bool neg = false;
        if (json[p] == '-') { neg = true; p++; }
        int start = p;
        long acc = 0;
        while (p < json.Length && json[p] >= '0' && json[p] <= '9')
        {
            acc = acc * 10 + (json[p] - '0');
            if (acc > int.MaxValue) break;
            p++;
        }
        if (p == start) return false;
        val = neg ? -(int)acc : (int)acc;
        return true;
    }

    private static bool TryExtractJsonByteArray90(string json, string key, out byte[] pkt90)
    {
        pkt90 = null;
        int p = FindJsonValueStart(json, key);
        if (p < 0 || p >= json.Length || json[p] != '[') return false;
        p++;
        var res = new byte[90];
        int count = 0;
        while (p < json.Length)
        {
            while (p < json.Length && (char.IsWhiteSpace(json[p]) || json[p] == ',')) p++;
            if (p >= json.Length) return false;
            if (json[p] == ']') break;
            bool neg = false;
            if (json[p] == '-') { neg = true; p++; }
            int start = p;
            int acc = 0;
            while (p < json.Length && json[p] >= '0' && json[p] <= '9')
            {
                acc = acc * 10 + (json[p] - '0');
                p++;
            }
            if (p == start || count >= 90) return false;
            int signed = neg ? -acc : acc;
            res[count++] = (byte)(signed & 0xFF);
        }
        if (count != 90) return false;
        pkt90 = res;
        return true;
    }

    private static bool TryExtractJsonBase64List(string json, string key, out List<byte[]> list)
    {
        list = null;
        int p = FindJsonValueStart(json, key);
        if (p < 0 || p >= json.Length || json[p] != '[') return false;
        p++;
        var res = new List<byte[]>(12);
        while (p < json.Length)
        {
            while (p < json.Length && (char.IsWhiteSpace(json[p]) || json[p] == ',')) p++;
            if (p >= json.Length) return false;
            if (json[p] == ']')
            {
                list = res;
                return true;
            }
            if (json[p] != '"') return false;
            p++;
            int start = p;
            while (p < json.Length && json[p] != '"')
            {
                if (json[p] == '\\') p++;
                p++;
            }
            if (p >= json.Length) return false;
            string b64 = json.Substring(start, p - start);
            p++; // skip closing quote
            if (b64.Length > 0)
            {
                if (res.Count >= 64) return false;
                res.Add(Convert.FromBase64String(b64));
            }
        }
        return false;
    }

    private static byte[] GetStaticAssetBytes(string scriptDir, string relPath)
    {
        string trimmed = relPath.TrimStart('/').Replace('/', Path.DirectorySeparatorChar);
        string localCandidate = Path.Combine(scriptDir, trimmed);
        if (File.Exists(localCandidate))
        {
            return File.ReadAllBytes(localCandidate);
        }
        lock (StaticLock)
        {
            byte[] cached;
            if (StaticCache.TryGetValue(relPath, out cached))
                return cached;
        }
        using (var wc = new WebClient())
        {
            byte[] bytes = wc.DownloadData("https://websynap.se" + relPath);
            if (relPath == "/index.html")
            {
                string html = Encoding.UTF8.GetString(bytes);
                html = html.Replace("connect-src 'none';", "connect-src 'self' http://127.0.0.1:18925 http://localhost:18925;");
                bytes = Encoding.UTF8.GetBytes(html);
            }
            lock (StaticLock)
            {
                StaticCache[relPath] = bytes;
            }
            return bytes;
        }
    }

    private static void WriteCombinedResponse(NetworkStream stream, string headerBlock, byte[] bodyBytes)
    {
        byte[] hdrBytes = Encoding.ASCII.GetBytes(headerBlock);
        int bodyLen = (bodyBytes != null) ? bodyBytes.Length : 0;
        byte[] packet = new byte[hdrBytes.Length + bodyLen];
        Buffer.BlockCopy(hdrBytes, 0, packet, 0, hdrBytes.Length);
        if (bodyLen > 0)
        {
            Buffer.BlockCopy(bodyBytes, 0, packet, hdrBytes.Length, bodyLen);
        }
        stream.Write(packet, 0, packet.Length);
    }

    private static int FindHeaderEnd(byte[] buf, int len)
    {
        int limit = len - 4;
        for (int i = 0; i <= limit; i++)
        {
            if (buf[i] == 13 && buf[i + 1] == 10 && buf[i + 2] == 13 && buf[i + 3] == 10)
                return i + 4;
        }
        return -1;
    }

    private static void HandleClientConnection(TcpClient client, string scriptDir)
    {
        try
        {
            client.NoDelay = true;
            client.ReceiveTimeout = 30000;
            client.SendTimeout = 5000;
            NetworkStream stream = client.GetStream();

            byte[] buf = new byte[16384];
            int buffered = 0;
            bool keepAlive = true;

            while (keepAlive)
            {
                int headerEnd = FindHeaderEnd(buf, buffered);
                while (headerEnd < 0)
                {
                    if (buffered >= buf.Length)
                    {
                        if (buf.Length >= 65536) return;
                        byte[] bigger = new byte[buf.Length * 2];
                        Buffer.BlockCopy(buf, 0, bigger, 0, buffered);
                        buf = bigger;
                    }
                    int n;
                    try
                    {
                        n = stream.Read(buf, buffered, buf.Length - buffered);
                    }
                    catch
                    {
                        return;
                    }
                    if (n <= 0) return;
                    buffered += n;
                    headerEnd = FindHeaderEnd(buf, buffered);
                }

                string headerStr = Encoding.ASCII.GetString(buf, 0, headerEnd - 4);
                string[] lines = headerStr.Split(new string[] { "\r\n" }, StringSplitOptions.None);
                if (lines.Length == 0 || string.IsNullOrEmpty(lines[0])) return;

                string[] reqParts = lines[0].Split(' ');
                string method = reqParts[0];
                string rawUrl = (reqParts.Length > 1) ? reqParts[1] : "/";
                int qIdx = rawUrl.IndexOf('?');
                string cleanPath = (qIdx >= 0) ? rawUrl.Substring(0, qIdx) : rawUrl;
                string queryStr = (qIdx >= 0 && qIdx + 1 < rawUrl.Length) ? rawUrl.Substring(qIdx + 1) : "";

                string origin = "";
                string secSite = "";
                bool hasBridgeHeader = false;
                int contentLen = 0;
                string connHdr = "";

                for (int i = 1; i < lines.Length; i++)
                {
                    int colon = lines[i].IndexOf(':');
                    if (colon <= 0) continue;
                    string k = lines[i].Substring(0, colon).Trim();
                    string v = lines[i].Substring(colon + 1).Trim();
                    if (k.Equals("Origin", StringComparison.OrdinalIgnoreCase)) origin = v;
                    else if (k.Equals("Sec-Fetch-Site", StringComparison.OrdinalIgnoreCase)) secSite = v;
                    else if (k.Equals("X-WebSynapse-Bridge", StringComparison.OrdinalIgnoreCase)) hasBridgeHeader = true;
                    else if (k.Equals("Content-Length", StringComparison.OrdinalIgnoreCase)) int.TryParse(v, out contentLen);
                    else if (k.Equals("Connection", StringComparison.OrdinalIgnoreCase)) connHdr = v;
                }

                if (contentLen < 0 || contentLen > 65536) return;
                if (connHdr.Equals("close", StringComparison.OrdinalIgnoreCase)) keepAlive = false;

                int totalNeeded = headerEnd + contentLen;
                if (totalNeeded > buf.Length)
                {
                    byte[] bigger = new byte[Math.Max(buf.Length * 2, totalNeeded + 1024)];
                    Buffer.BlockCopy(buf, 0, bigger, 0, buffered);
                    buf = bigger;
                }
                while (buffered < totalNeeded)
                {
                    int n = stream.Read(buf, buffered, totalNeeded - buffered);
                    if (n <= 0) return;
                    buffered += n;
                }

                string bodyStr = (contentLen > 0) ? Encoding.UTF8.GetString(buf, headerEnd, contentLen) : "";

                // Slide any pipelined next-request bytes to index 0
                int remaining = buffered - totalNeeded;
                if (remaining > 0)
                {
                    Buffer.BlockCopy(buf, totalNeeded, buf, 0, remaining);
                }
                buffered = remaining;

                string corsOrigin = AllowedOrigins.Contains(origin) ? origin : "https://websynap.se";
                string connOut = keepAlive ? "keep-alive" : "close";

                if (method == "OPTIONS")
                {
                    string optHdr =
                        "HTTP/1.1 204 No Content\r\n" +
                        "Access-Control-Allow-Origin: " + corsOrigin + "\r\n" +
                        "Access-Control-Allow-Methods: GET, POST, OPTIONS\r\n" +
                        "Access-Control-Allow-Headers: Content-Type, X-WebSynapse-Bridge\r\n" +
                        "Access-Control-Allow-Private-Network: true\r\n" +
                        "Access-Control-Max-Age: 600\r\n" +
                        "Vary: Origin\r\n" +
                        "Connection: " + connOut + "\r\n" +
                        "Content-Length: 0\r\n\r\n";
                    WriteCombinedResponse(stream, optHdr, null);
                    continue;
                }

                if ((method == "GET" || method == "HEAD") && cleanPath == "/favicon.ico")
                {
                    string favHdr =
                        "HTTP/1.1 204 No Content\r\n" +
                        "Cache-Control: public, max-age=86400\r\n" +
                        "Connection: " + connOut + "\r\n" +
                        "Content-Length: 0\r\n\r\n";
                    WriteCombinedResponse(stream, favHdr, null);
                    continue;
                }

                string staticRel = (cleanPath == "/") ? "/index.html" : cleanPath;
                string mime;
                if ((method == "GET" || method == "HEAD") && StaticAllowlist.TryGetValue(staticRel, out mime))
                {
                    byte[] assetBytes = GetStaticAssetBytes(scriptDir, staticRel);
                    string extraDisp = (staticRel == "/websynapse-bridge.cmd") ? "Content-Disposition: attachment; filename=\"websynapse-bridge.cmd\"\r\n" : "";
                    string stHdr =
                        "HTTP/1.1 200 OK\r\n" +
                        "Content-Type: " + mime + "\r\n" +
                        extraDisp +
                        "Content-Security-Policy: default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' http://127.0.0.1:18925 http://localhost:18925; font-src 'self'; media-src 'none'; object-src 'none'; frame-src 'none'; frame-ancestors 'none'; worker-src 'self' blob:; base-uri 'none'; form-action 'none';\r\n" +
                        "Permissions-Policy: hid=(self), usb=(self), serial=(), bluetooth=(), camera=(), microphone=(), geolocation=(), payment=()\r\n" +
                        "X-Content-Type-Options: nosniff\r\n" +
                        "X-Frame-Options: DENY\r\n" +
                        "Referrer-Policy: no-referrer\r\n" +
                        "Cache-Control: no-cache\r\n" +
                        "Connection: " + connOut + "\r\n" +
                        "Content-Length: " + assetBytes.Length + "\r\n\r\n";
                    byte[] hdrB = Encoding.ASCII.GetBytes(stHdr);
                    stream.Write(hdrB, 0, hdrB.Length);
                    if (method == "GET" && assetBytes.Length > 0)
                    {
                        stream.Write(assetBytes, 0, assetBytes.Length);
                    }
                    continue;
                }

                // API routes require strict Origin + X-WebSynapse-Bridge header
                bool originInvalid = (!string.IsNullOrEmpty(origin) && !AllowedOrigins.Contains(origin))
                    || (string.IsNullOrEmpty(origin) && !string.IsNullOrEmpty(secSite) && secSite != "same-origin" && secSite != "none");
                if (originInvalid || !hasBridgeHeader)
                {
                    byte[] errB = Encoding.UTF8.GetBytes("{\"ok\":false,\"error\":\"Forbidden origin or missing X-WebSynapse-Bridge header\"}");
                    string fHdr =
                        "HTTP/1.1 403 Forbidden\r\n" +
                        "Content-Type: application/json\r\n" +
                        "Connection: close\r\n" +
                        "Content-Length: " + errB.Length + "\r\n\r\n";
                    WriteCombinedResponse(stream, fHdr, errB);
                    return;
                }

                string statusLine = "200 OK";
                string jsonOut = "{\"ok\":false,\"error\":\"Unknown endpoint\"}";

                try
                {
                    if (method == "POST" && cleanPath == "/lamparray")
                    {
                        int pidNum;
                        if (!TryExtractJsonInt(bodyStr, "pid", out pidNum))
                            TryExtractJsonInt(bodyStr, "productId", out pidNum);

                        List<byte[]> reports;
                        int lampCount;
                        string errMsg;
                        if (pidNum <= 0 || !TryExtractJsonBase64List(bodyStr, "reportsB64", out reports))
                        {
                            statusLine = "400 Bad Request";
                            jsonOut = "{\"ok\":false,\"error\":\"Invalid pid or reportsB64 payload\"}";
                        }
                        else if (SendLampArrayForPid(pidNum, reports, out lampCount, out errMsg))
                        {
                            jsonOut = "{\"ok\":true,\"lampCount\":" + lampCount + "}";
                        }
                        else
                        {
                            jsonOut = "{\"ok\":false,\"error\":\"" + JsonEscape(errMsg) + "\"}";
                        }
                    }
                    else if (method == "POST" && cleanPath == "/transfer")
                    {
                        int pidNum;
                        if (!TryExtractJsonInt(bodyStr, "pid", out pidNum))
                            TryExtractJsonInt(bodyStr, "productId", out pidNum);

                        int timeoutMs;
                        if (!TryExtractJsonInt(bodyStr, "timeoutMs", out timeoutMs))
                            timeoutMs = 1200;
                        timeoutMs = Math.Min(3000, Math.Max(100, timeoutMs));

                        byte[] pkt90;
                        if (pidNum <= 0 || !TryExtractJsonByteArray90(bodyStr, "packet90", out pkt90))
                        {
                            statusLine = "400 Bad Request";
                            jsonOut = "{\"ok\":false,\"error\":\"Invalid pid or 90-byte packet90 payload\"}";
                        }
                        else
                        {
                            RazerEndpoint ep = ResolveRazerDevice(pidNum, false);
                            if (ep == null)
                            {
                                jsonOut = "{\"ok\":false,\"error\":\"" + JsonEscape(string.Format("Device PID 0x{0:X4} not found by local bridge", pidNum)) + "\"}";
                            }
                            else
                            {
                                byte[] work90 = (byte[])pkt90.Clone();
                                if (work90[1] == 0x1F && ep.Tid != 0x1F) work90[1] = ep.Tid;
                                byte[] rx91 = TransferProtocol25OnEndpoint(ep, work90, timeoutMs);
                                if (rx91 == null)
                                {
                                    // Retry once with fresh endpoint discovery
                                    InvalidatePid(pidNum);
                                    ep = ResolveRazerDevice(pidNum, true);
                                    if (ep != null)
                                    {
                                        work90 = (byte[])pkt90.Clone();
                                        if (work90[1] == 0x1F && ep.Tid != 0x1F) work90[1] = ep.Tid;
                                        rx91 = TransferProtocol25OnEndpoint(ep, work90, timeoutMs);
                                    }
                                }
                                if (rx91 == null)
                                {
                                    InvalidatePid(pidNum);
                                    jsonOut = "{\"ok\":false,\"error\":\"USB Protocol 25 transfer failed\"}";
                                }
                                else
                                {
                                    jsonOut = FormatTransferJson(ep, rx91);
                                }
                            }
                        }
                    }
                    else if (method == "GET" && cleanPath == "/keyevents")
                    {
                        long sinceSeq = ParseQueryLong(queryStr, "since", -1L);
                        jsonOut = FormatKeyEventsJson(sinceSeq);
                    }
                    else if (method == "GET" && cleanPath == "/status")
                    {
                        jsonOut = FormatDevicesJson(GetVerifiedEndpoints(false));
                    }
                    else if (method == "POST" && cleanPath == "/rescan")
                    {
                        jsonOut = FormatDevicesJson(GetVerifiedEndpoints(true));
                    }
                    else
                    {
                        statusLine = "404 Not Found";
                    }
                }
                catch (Exception ex)
                {
                    statusLine = "500 Internal Server Error";
                    jsonOut = "{\"ok\":false,\"error\":\"" + JsonEscape(ex.Message) + "\"}";
                }

                byte[] jsonBytes = Encoding.UTF8.GetBytes(jsonOut);
                string apiHdr =
                    "HTTP/1.1 " + statusLine + "\r\n" +
                    "Content-Type: application/json; charset=utf-8\r\n" +
                    "Access-Control-Allow-Origin: " + corsOrigin + "\r\n" +
                    "Access-Control-Allow-Private-Network: true\r\n" +
                    "Vary: Origin\r\n" +
                    "Connection: " + connOut + "\r\n" +
                    "Content-Length: " + jsonBytes.Length + "\r\n\r\n";
                WriteCombinedResponse(stream, apiHdr, jsonBytes);
            }
        }
        catch { }
        finally
        {
            try { client.Close(); } catch { }
        }
    }

    public static void RunHttpServer(TcpListener listener, string scriptDir)
    {
        while (true)
        {
            TcpClient client = listener.AcceptTcpClient();
            ThreadPool.QueueUserWorkItem(delegate(object state)
            {
                HandleClientConnection((TcpClient)state, scriptDir);
            }, client);
        }
    }
}
'@

Add-Type -TypeDefinition $csharp -Language CSharp

$ScriptDir = if ($env:WEBSYNAPSE_SCRIPT_DIR) { $env:WEBSYNAPSE_SCRIPT_DIR.TrimEnd('\', '/') } else { (Get-Location).Path }

if ($env:WEBSYNAPSE_BRIDGE_SELFTEST -eq "1") {
    $verified = [RazerBridgeNative]::GetVerifiedEndpoints($false)
    Write-Output ([RazerBridgeNative]::FormatDevicesJson($verified))
    exit 0
}

$listener = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Loopback, 18925)
try {
    $listener.Start()
} catch {
    Write-Host ""
    Write-Host "  [OK] websynap.se Local USB Bridge is already running on 127.0.0.1:18925!" -ForegroundColor Green
    if ($env:WEBSYNAPSE_NO_BROWSER -ne "1") {
        Start-Process "http://localhost:18925"
    }
    Start-Sleep -Seconds 2
    exit 0
}

Write-Host ""
Write-Host "  ============================================================" -ForegroundColor Green
Write-Host "   websynap.se Local USB Bridge Active on 127.0.0.1:18925" -ForegroundColor Green
Write-Host "  ============================================================" -ForegroundColor Green
$initDevices = [RazerBridgeNative]::GetVerifiedEndpoints($false)
if ($initDevices.Count -gt 0) {
    foreach ($d in $initDevices) {
        $hexP = ("0x{0:X4}" -f $d.Pid)
        $nm = if ($d.Name) { $d.Name } else { "Razer Device ($hexP)" }
        Write-Host ("   [OK] {0} ({1}, IF#{2}, {3}, {4})" -f $nm, $hexP, $d.InterfaceNumber, $d.Mode.ToUpper(), $d.Firmware) -ForegroundColor Cyan
    }
} else {
    Write-Host "   [!] Waiting for compatible Razer USB device..." -ForegroundColor Yellow
}
Write-Host ""
Write-Host "   Workspace URL : http://localhost:18925  (also bridges https://websynap.se)" -ForegroundColor White
Write-Host "   Onboard Save  : Edit slots S1-S6 & click Flash, then close anytime!" -ForegroundColor Gray
Write-Host ""

if ($env:WEBSYNAPSE_NO_BROWSER -ne "1") {
    try { Start-Process "http://localhost:18925" } catch {}
}

[RazerBridgeNative]::RunHttpServer($listener, $ScriptDir)
