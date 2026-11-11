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
    }

    private static readonly object IoLock = new object();
    private static readonly Regex RxStripInterfaceSuffix = new Regex(@"\s*\(Interface\s+\d+\)\s*$", RegexOptions.IgnoreCase);

    private static string CleanProductName(string raw)
    {
        if (string.IsNullOrWhiteSpace(raw)) return "";
        return RxStripInterfaceSuffix.Replace(raw.Trim(), "").Trim();
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

    public static bool SendLampArrayBase64(string lampPath, string[] reportsB64)
    {
        if (string.IsNullOrEmpty(lampPath) || reportsB64 == null || reportsB64.Length == 0)
            return false;
        if (reportsB64.Length > 64)
            throw new ArgumentException("Too many LampArray reports in single batch");
        lock (IoLock)
        {
            IntPtr hLamp = CreateFileW(lampPath, 0, FILE_SHARE_READ | FILE_SHARE_WRITE, IntPtr.Zero, OPEN_EXISTING, 0, IntPtr.Zero);
            if (hLamp == INVALID_HANDLE_VALUE) return false;
            try
            {
                for (int i = 0; i < reportsB64.Length; i++)
                {
                    if (string.IsNullOrEmpty(reportsB64[i])) continue;
                    byte[] raw = Convert.FromBase64String(reportsB64[i]);
                    if (raw == null || raw.Length < 2 || raw.Length > 64) continue;
                    byte reportId = raw[0];
                    if (reportId != 4 && reportId != 6) continue;
                    if (!HidD_SetFeature(hLamp, raw, raw.Length))
                        return false;
                }
                return true;
            }
            finally
            {
                CloseHandle(hLamp);
            }
        }
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
        sb.Append("{\"ok\":true,\"bridgeVersion\":\"1.2.0\",\"devices\":[");
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
}
'@

Add-Type -TypeDefinition $csharp -Language CSharp

$script:VerifiedByPid = @{}
$script:StaticCache = @{}
$ScriptDir = if ($env:WEBSYNAPSE_SCRIPT_DIR) { $env:WEBSYNAPSE_SCRIPT_DIR.TrimEnd('\', '/') } else { (Get-Location).Path }

function New-FwProbePacket([byte]$tid = 0x1F) {
    $b = New-Object byte[] 90
    $b[1] = $tid
    $b[5] = 0x02
    $b[6] = 0x00
    $b[7] = 0x81
    $crc = 0
    for ($i = 2; $i -lt 88; $i++) { $crc = $crc -bxor $b[$i] }
    $b[88] = [byte]$crc
    return $b
}

function Resolve-RazerDevice([int]$pidNum) {
    $all = [RazerBridgeNative]::DiscoverEndpoints() | Where-Object { $_.Pid -eq $pidNum }
    if (-not $all) { return $null }

    if ($script:VerifiedByPid.ContainsKey($pidNum)) {
        $cached = $script:VerifiedByPid[$pidNum]
        $still = $all | Where-Object { $_.Path -eq $cached.Path } | Select-Object -First 1
        if ($still) {
            $still.Tid = $cached.Tid
            $still.Firmware = $cached.Firmware
            $still.LampArrayPath = $cached.LampArrayPath
            $still.LampCount = $cached.LampCount
            if (-not $still.LampArrayPath) { [RazerBridgeNative]::AttachLampArrayInfo($still) }
            if (-not $still.Name -and $cached.Name) { $still.Name = $cached.Name }
            return $still
        }
        $script:VerifiedByPid.Remove($pidNum)
    }

    # Prefer WinUSB first, then MI_03 (keyboards), MI_00 (mice), MI_02, MI_01
    $ordered = $all | Sort-Object @{Expression={ if ($_.Mode -eq 'winusb') { 0 } else { 1 } }}, @{Expression={
        switch ($_.InterfaceNumber) { 3 { 0 } 0 { 1 } 2 { 2 } 1 { 3 } default { 9 } }
    }}

    foreach ($ep in $ordered) {
        foreach ($tid in @(0x1F, 0x3F, 0xFF)) {
            $probe = New-FwProbePacket ([byte]$tid)
            $rx = [RazerBridgeNative]::TransferProtocol25OnEndpoint($ep, $probe, 500)
            if ($rx -and $rx[1] -eq 0x02 -and $rx[7] -eq 0x00 -and $rx[8] -eq 0x81) {
                $ep.Tid = [byte]$tid
                $ep.Firmware = ("v{0}.{1:D2}" -f [int]$rx[9], [int]$rx[10])
                if (-not $ep.Name) {
                    $namedPeer = $all | Where-Object { $_.Name } | Select-Object -First 1
                    if ($namedPeer) { $ep.Name = $namedPeer.Name }
                }
                [RazerBridgeNative]::AttachLampArrayInfo($ep)
                $script:VerifiedByPid[$pidNum] = $ep
                return $ep
            }
        }
    }
    return $null
}

function Get-VerifiedEndpoints {
    $eps = [RazerBridgeNative]::DiscoverEndpoints()
    $pids = $eps | Select-Object -ExpandProperty Pid -Unique
    $list = New-Object 'System.Collections.Generic.List[RazerBridgeNative+RazerEndpoint]'
    foreach ($p in $pids) {
        if ($null -eq $p) { continue }
        $v = Resolve-RazerDevice ([int]$p)
        if ($v) { $list.Add($v) }
    }
    return $list
}

if ($env:WEBSYNAPSE_BRIDGE_SELFTEST -eq "1") {
    $verified = Get-VerifiedEndpoints
    Write-Output ([RazerBridgeNative]::FormatDevicesJson($verified))
    exit 0
}

$AllowedOrigins = @(
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
)

$StaticAllowlist = @{
    "/index.html"              = "text/html; charset=utf-8"
    "/styles.css"              = "text/css; charset=utf-8"
    "/app.js"                  = "application/javascript; charset=utf-8"
    "/protocol25.js"           = "application/javascript; charset=utf-8"
    "/timer-worker.js"         = "application/javascript; charset=utf-8"
    "/LICENSE"                 = "text/plain; charset=utf-8"
    "/fonts/DMSans-Variable.ttf" = "font/ttf"
    "/fonts/DM-Sans-OFL.txt"   = "text/plain; charset=utf-8"
    "/websynapse-bridge.cmd"   = "application/octet-stream"
}

function Get-StaticAssetBytes([string]$relPath) {
    $localCandidate = Join-Path $ScriptDir ($relPath.TrimStart('/').Replace('/', '\'))
    if (Test-Path -LiteralPath $localCandidate -PathType Leaf) {
        return [System.IO.File]::ReadAllBytes($localCandidate)
    }
    if ($script:StaticCache.ContainsKey($relPath)) {
        return $script:StaticCache[$relPath]
    }
    $wc = New-Object System.Net.WebClient
    try {
        $bytes = $wc.DownloadData("https://websynap.se" + $relPath)
        if ($relPath -eq "/index.html") {
            $html = [System.Text.Encoding]::UTF8.GetString($bytes)
            $html = $html -replace "connect-src 'none';", "connect-src 'self' http://127.0.0.1:18925 http://localhost:18925;"
            $bytes = [System.Text.Encoding]::UTF8.GetBytes($html)
        }
        $script:StaticCache[$relPath] = $bytes
        return $bytes
    } finally {
        $wc.Dispose()
    }
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
$initDevices = Get-VerifiedEndpoints
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

while ($true) {
    $client = $listener.AcceptTcpClient()
    try {
        $client.ReceiveTimeout = 3000
        $client.SendTimeout = 3000
        $stream = $client.GetStream()
        $ms = New-Object System.IO.MemoryStream
        $buf = New-Object byte[] 8192
        $headerEnd = -1
        while ($headerEnd -lt 0) {
            $n = $stream.Read($buf, 0, $buf.Length)
            if ($n -le 0) { break }
            $ms.Write($buf, 0, $n)
            $arr = $ms.ToArray()
            for ($i = 0; $i -le $arr.Length - 4; $i++) {
                if ($arr[$i] -eq 13 -and $arr[$i+1] -eq 10 -and $arr[$i+2] -eq 13 -and $arr[$i+3] -eq 10) {
                    $headerEnd = $i + 4
                    break
                }
            }
            if ($ms.Length -gt 32768) { break }
        }
        if ($headerEnd -lt 0) { $client.Close(); continue }

        $allBytes = $ms.ToArray()
        $headerStr = [System.Text.Encoding]::ASCII.GetString($allBytes, 0, $headerEnd)
        $lines = $headerStr -split "`r`n"
        $reqParts = $lines[0] -split " "
        $method = $reqParts[0]
        $rawUrl = if ($reqParts.Length -gt 1) { $reqParts[1] } else { "/" }
        $cleanPath = ($rawUrl -split "\?")[0]

        $headers = @{}
        for ($i = 1; $i -lt $lines.Length; $i++) {
            $idx = $lines[$i].IndexOf(":")
            if ($idx -gt 0) {
                $k = $lines[$i].Substring(0, $idx).Trim().ToLowerInvariant()
                $v = $lines[$i].Substring($idx + 1).Trim()
                $headers[$k] = $v
            }
        }

        $origin = if ($headers.ContainsKey("origin")) { $headers["origin"] } else { "" }
        $corsOrigin = if ($AllowedOrigins -contains $origin) { $origin } else { "https://websynap.se" }

        if ($method -eq "OPTIONS") {
            $respHdr = "HTTP/1.1 204 No Content`r`n" +
                       "Access-Control-Allow-Origin: $corsOrigin`r`n" +
                       "Access-Control-Allow-Methods: GET, POST, OPTIONS`r`n" +
                       "Access-Control-Allow-Headers: Content-Type, X-WebSynapse-Bridge`r`n" +
                       "Access-Control-Allow-Private-Network: true`r`n" +
                       "Access-Control-Max-Age: 600`r`n" +
                       "Vary: Origin`r`n" +
                       "Connection: close`r`n" +
                       "Content-Length: 0`r`n`r`n"
            $outB = [System.Text.Encoding]::ASCII.GetBytes($respHdr)
            $stream.Write($outB, 0, $outB.Length)
            $client.Close()
            continue
        }

        # Serve allowlisted static UI files at http://localhost:18925/
        $staticRel = if ($cleanPath -eq "/") { "/index.html" } else { $cleanPath }
        if (($method -eq "GET" -or $method -eq "HEAD") -and $StaticAllowlist.ContainsKey($staticRel)) {
            $assetBytes = Get-StaticAssetBytes $staticRel
            $mime = $StaticAllowlist[$staticRel]
            $extraDisp = if ($staticRel -eq "/websynapse-bridge.cmd") { "Content-Disposition: attachment; filename=`"websynapse-bridge.cmd`"`r`n" } else { "" }
            $respHdr = "HTTP/1.1 200 OK`r`n" +
                       "Content-Type: $mime`r`n" +
                       $extraDisp +
                       "Content-Security-Policy: default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' http://127.0.0.1:18925 http://localhost:18925; font-src 'self'; media-src 'none'; object-src 'none'; child-src 'none'; frame-src 'none'; frame-ancestors 'none'; worker-src 'self' blob:; base-uri 'none'; form-action 'none';`r`n" +
                       "Permissions-Policy: hid=(self), usb=(self), serial=(), bluetooth=(), camera=(), microphone=(), geolocation=(), payment=()`r`n" +
                       "X-Content-Type-Options: nosniff`r`n" +
                       "X-Frame-Options: DENY`r`n" +
                       "Referrer-Policy: no-referrer`r`n" +
                       "Cache-Control: no-cache`r`n" +
                       "Connection: close`r`n" +
                       "Content-Length: $($assetBytes.Length)`r`n`r`n"
            $hdrB = [System.Text.Encoding]::ASCII.GetBytes($respHdr)
            $stream.Write($hdrB, 0, $hdrB.Length)
            if ($method -eq "GET") {
                $stream.Write($assetBytes, 0, $assetBytes.Length)
            }
            $client.Close()
            continue
        }

        # API routes require strict Origin + X-WebSynapse-Bridge header
        $secSite = if ($headers.ContainsKey("sec-fetch-site")) { $headers["sec-fetch-site"] } else { "" }
        $originInvalid = ($origin -and ($AllowedOrigins -notcontains $origin)) -or ((-not $origin) -and $secSite -and $secSite -ne "same-origin" -and $secSite -ne "none")
        if ($originInvalid -or (-not $headers.ContainsKey("x-websynapse-bridge"))) {
            $errJson = '{"ok":false,"error":"Forbidden origin or missing X-WebSynapse-Bridge header"}'
            $errB = [System.Text.Encoding]::UTF8.GetBytes($errJson)
            $respHdr = "HTTP/1.1 403 Forbidden`r`nContent-Type: application/json`r`nContent-Length: $($errB.Length)`r`nConnection: close`r`n`r`n"
            $hdrB = [System.Text.Encoding]::ASCII.GetBytes($respHdr)
            $stream.Write($hdrB, 0, $hdrB.Length)
            $stream.Write($errB, 0, $errB.Length)
            $client.Close()
            continue
        }

        $contentLen = if ($headers.ContainsKey("content-length")) { [int]$headers["content-length"] } else { 0 }
        $bodyAlready = $allBytes.Length - $headerEnd
        while ($bodyAlready -lt $contentLen -and $contentLen -le 65536) {
            $n = $stream.Read($buf, 0, [Math]::Min($buf.Length, $contentLen - $bodyAlready))
            if ($n -le 0) { break }
            $ms.Write($buf, 0, $n)
            $bodyAlready += $n
        }
        $finalBytes = $ms.ToArray()
        $bodyStr = if ($contentLen -gt 0) { [System.Text.Encoding]::UTF8.GetString($finalBytes, $headerEnd, [Math]::Min($contentLen, $finalBytes.Length - $headerEnd)) } else { "" }

        $statusLine = "200 OK"
        $jsonOut = '{"ok":false,"error":"Unknown endpoint"}'

        if ($method -eq "GET" -and $cleanPath -eq "/status") {
            $jsonOut = [RazerBridgeNative]::FormatDevicesJson((Get-VerifiedEndpoints))
        }
        elseif ($method -eq "POST" -and $cleanPath -eq "/rescan") {
            $script:VerifiedByPid.Clear()
            $jsonOut = [RazerBridgeNative]::FormatDevicesJson((Get-VerifiedEndpoints))
        }
        elseif ($method -eq "POST" -and $cleanPath -eq "/transfer") {
            $reqJson = $bodyStr | ConvertFrom-Json
            $pidNum = [int]$reqJson.pid
            $timeoutMs = if ($reqJson.timeoutMs) { [Math]::Min(3000, [Math]::Max(100, [int]$reqJson.timeoutMs)) } else { 1200 }
            $hexOrArr = $reqJson.packet90
            $pkt90 = New-Object byte[] 90
            for ($i = 0; $i -lt 90; $i++) { $pkt90[$i] = [byte]([int]$hexOrArr[$i] -band 0xFF) }

            $ep = Resolve-RazerDevice $pidNum
            if (-not $ep) {
                $errMsg = [RazerBridgeNative]::JsonEscape(("Device PID 0x{0:X4} not found by local bridge" -f $pidNum))
                $jsonOut = "{`"ok`":false,`"error`":`"$errMsg`"}"
            } else {
                # If caller sent generic Tid 0x1F on a wireless dongle that verified on 0x3F (or vice versa), align Tid
                if ($pkt90[1] -eq 0x1F -and $ep.Tid -ne 0x1F) {
                    $pkt90[1] = $ep.Tid
                }
                $rx91 = [RazerBridgeNative]::TransferProtocol25OnEndpoint($ep, $pkt90, $timeoutMs)
                if (-not $rx91) {
                    $script:VerifiedByPid.Remove($pidNum)
                    $jsonOut = '{"ok":false,"error":"USB Protocol 25 transfer failed"}'
                } else {
                    $jsonOut = [RazerBridgeNative]::FormatTransferJson($ep, $rx91)
                }
            }
        }
        elseif ($method -eq "POST" -and $cleanPath -eq "/lamparray") {
            $reqJson = $bodyStr | ConvertFrom-Json
            $pidNum = [int]$reqJson.pid
            $ep = Resolve-RazerDevice $pidNum
            if (-not $ep -or -not $ep.LampArrayPath) {
                $jsonOut = '{"ok":false,"error":"LampArray HID interface not available for this device"}'
            } else {
                $b64List = [string[]]@($reqJson.reportsB64)
                $okLamp = [RazerBridgeNative]::SendLampArrayBase64($ep.LampArrayPath, $b64List)
                if (-not $okLamp) {
                    $ep.LampArrayPath = ""
                    [RazerBridgeNative]::AttachLampArrayInfo($ep)
                    if ($ep.LampArrayPath) {
                        $okLamp = [RazerBridgeNative]::SendLampArrayBase64($ep.LampArrayPath, $b64List)
                    }
                }
                if ($okLamp) {
                    $jsonOut = "{`"ok`":true,`"lampCount`":$($ep.LampCount)}"
                } else {
                    $jsonOut = '{"ok":false,"error":"HidD_SetFeature failed on LampArray interface"}'
                }
            }
        }
        else {
            $statusLine = "404 Not Found"
        }

        $jsonBytes = [System.Text.Encoding]::UTF8.GetBytes($jsonOut)
        $respHdr = "HTTP/1.1 $statusLine`r`n" +
                   "Content-Type: application/json; charset=utf-8`r`n" +
                   "Access-Control-Allow-Origin: $corsOrigin`r`n" +
                   "Access-Control-Allow-Private-Network: true`r`n" +
                   "Vary: Origin`r`n" +
                   "Connection: close`r`n" +
                   "Content-Length: $($jsonBytes.Length)`r`n`r`n"
        $hdrBytes = [System.Text.Encoding]::ASCII.GetBytes($respHdr)
        $stream.Write($hdrBytes, 0, $hdrBytes.Length)
        $stream.Write($jsonBytes, 0, $jsonBytes.Length)
    } catch {
        try {
            $errMsg = [RazerBridgeNative]::JsonEscape($_.Exception.Message)
            $errJson = "{`"ok`":false,`"error`":`"$errMsg`"}"
            $errB = [System.Text.Encoding]::UTF8.GetBytes($errJson)
            $hdr = [System.Text.Encoding]::ASCII.GetBytes("HTTP/1.1 500 Internal Server Error`r`nAccess-Control-Allow-Origin: https://websynap.se`r`nAccess-Control-Allow-Private-Network: true`r`nContent-Type: application/json`r`nContent-Length: $($errB.Length)`r`nConnection: close`r`n`r`n")
            $client.GetStream().Write($hdr, 0, $hdr.Length)
            $client.GetStream().Write($errB, 0, $errB.Length)
        } catch {}
    } finally {
        $client.Close()
    }
}
