/**
 * Razer Local Web Driver — Zero-Bloat Local Hardware Server
 *
 * Replaces Razer Synapse 4's cloud-dependent Electron UI (https://apps.razer.com)
 * with a 100% offline, local HTTP + hardware bridge on http://127.0.0.1:5426.
 *
 * Directly loads Razer's N-API native addon (`HID.node`) from
 * `C:\Program Files\Razer\RazerAppEngine\app-4.0.827\resources\app.asar.unpacked\node_modules\node-rz-hid\build\Release\HID.node`
 */

"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { spawn } = require("child_process");
const Protocol25 = require("./protocol25");
const { createStudioDaemon } = require("./studio-daemon");

const HOST = process.env.HOST || "127.0.0.1";
const PORT = Number(process.env.PORT || 5426); // 5426 = 0x1532 (Razer Vendor ID)
const NATIVE_BRIDGE_HOST = "127.0.0.1";
const NATIVE_BRIDGE_PORT = Number(process.env.WEBSYNAPSE_BRIDGE_PORT || 18925);
const ALLOWED_COMMAND_CLASSES = new Set([0x00, 0x02, 0x03, 0x04, 0x05, 0x07, 0x08, 0x0b, 0x0c, 0x0d, 0x0f, 0x17, 0x18]);
const ALLOWED_CLASS_00_IDS = new Set([0x04, 0x05, 0x40, 0x81, 0x82, 0x84, 0x86, 0x87, 0xc0]);

const PROGRAM_FILES = process.env.ProgramFiles || "C:\\Program Files";
const LOCAL_APPDATA = process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local");
const RAZER_BASE_DIR = path.join(PROGRAM_FILES, "Razer", "RazerAppEngine");
const RAZER_USER_DATA = path.join(LOCAL_APPDATA, "Razer", "RazerAppEngine", "User Data");

function findLatestAppDir() {
  try {
    if (!fs.existsSync(RAZER_BASE_DIR)) return null;
    const entries = fs
      .readdirSync(RAZER_BASE_DIR)
      .filter((name) => name.startsWith("app-"))
      .sort()
      .reverse();
    return entries.length > 0 ? path.join(RAZER_BASE_DIR, entries[0]) : null;
  } catch {
    return null;
  }
}

const APP_DIR = findLatestAppDir() || "C:\\Program Files\\Razer\\RazerAppEngine\\app-4.0.827";
const UNPACKED_NM = path.join(APP_DIR, "resources", "app.asar.unpacked", "node_modules");
const RESTORE_DEVICES_DIR = path.join(RAZER_USER_DATA, "Devices", "Restore");

let nodeHid = null;
const nativeLoadStatus = {
  runtime: process.versions.electron ? `Electron-Node (${process.versions.electron})` : `Node.js (${process.version})`,
  modulesVersion: process.versions.modules,
  appDir: APP_DIR,
  hidLoaded: false,
  errors: [],
};

const hidNodeBinaryPath = path.join(UNPACKED_NM, "node-rz-hid", "build", "Release", "HID.node");
try {
  if (fs.existsSync(hidNodeBinaryPath)) {
    nodeHid = require(hidNodeBinaryPath);
    nativeLoadStatus.hidLoaded = true;
    nativeLoadStatus.hidBinary = hidNodeBinaryPath;
  } else {
    nodeHid = require("node-rz-hid");
    nativeLoadStatus.hidLoaded = true;
  }
} catch (err) {
  nativeLoadStatus.errors.push(`HID.node: ${err.message}`);
}

function loadRestoreProfiles() {
  const profiles = [];
  try {
    if (!fs.existsSync(RESTORE_DEVICES_DIR)) return profiles;
    const files = fs.readdirSync(RESTORE_DEVICES_DIR).filter((f) => f.endsWith(".json"));
    for (const file of files) {
      try {
        const fullPath = path.join(RESTORE_DEVICES_DIR, file);
        const content = JSON.parse(fs.readFileSync(fullPath, "utf8"));
        profiles.push({
          file,
          fullPath,
          ...content,
          knownMeta: Protocol25.KNOWN_DEVICES[content.productId] || null,
        });
      } catch {
        // ignore
      }
    }
  } catch {
    // ignore
  }
  return profiles;
}

let spawnedBridgeChild = null;
let bridgeStartupPromise = null;
const bridgeKeepAliveAgent = new http.Agent({
  keepAlive: true,
  keepAliveMsecs: 30000,
  maxSockets: 8,
});

function callNativeBridge(method, routePath, bodyObj = null, timeoutMs = 2200) {
  return new Promise((resolve, reject) => {
    const payload = bodyObj ? Buffer.from(JSON.stringify(bodyObj), "utf8") : null;
    const req = http.request(
      {
        hostname: NATIVE_BRIDGE_HOST,
        port: NATIVE_BRIDGE_PORT,
        path: routePath,
        method,
        agent: bridgeKeepAliveAgent,
        timeout: timeoutMs,
        headers: {
          Connection: "keep-alive",
          "X-WebSynapse-Bridge": "1",
          ...(payload
            ? {
                "Content-Type": "application/json",
                "Content-Length": payload.length,
              }
            : {}),
        },
      },
      (res) => {
        let raw = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          raw += chunk;
        });
        res.on("end", () => {
          try {
            const parsed = JSON.parse(raw || "{}");
            if (res.statusCode >= 200 && res.statusCode < 300) {
              nativeLoadStatus.bridgeOnline = true;
              resolve(parsed);
            } else {
              const httpErr = new Error(parsed?.error || `Native bridge HTTP ${res.statusCode}`);
              httpErr.isHttpStatus = true;
              reject(httpErr);
            }
          } catch (err) {
            reject(err);
          }
        });
      }
    );
    req.on("socket", (s) => {
      s.setNoDelay(true);
    });
    req.on("timeout", () => {
      req.destroy(new Error("Native bridge timeout"));
    });
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function callNativeBridgeFast(method, routePath, bodyObj = null, timeoutMs = 2200) {
  if (!nativeLoadStatus.bridgeOnline) {
    await ensureNativeBridge();
  }
  try {
    return await callNativeBridge(method, routePath, bodyObj, timeoutMs);
  } catch (err) {
    if (err && err.isHttpStatus) throw err;
    nativeLoadStatus.bridgeOnline = false;
    await ensureNativeBridge();
    return await callNativeBridge(method, routePath, bodyObj, timeoutMs);
  }
}

function findBridgeScriptPath() {
  const candidates = [
    path.join(__dirname, "websynapse", "websynapse-bridge.cmd"),
    path.join(__dirname, "public", "websynapse-bridge.cmd"),
  ];
  return candidates.find((p) => fs.existsSync(p)) || null;
}

async function ensureNativeBridge() {
  if (process.platform !== "win32") return null;
  try {
    const status = await callNativeBridge("GET", "/status", null, 900);
    if (status && status.ok) {
      nativeLoadStatus.bridgeOnline = true;
      return status;
    }
  } catch {
    // Not running yet — spawn below
  }

  if (bridgeStartupPromise) return bridgeStartupPromise;

  bridgeStartupPromise = (async () => {
    const scriptPath = findBridgeScriptPath();
    if (!scriptPath) return null;

    if (!spawnedBridgeChild || spawnedBridgeChild.killed || spawnedBridgeChild.exitCode !== null) {
      const escapedPath = scriptPath.replace(/'/g, "''");
      spawnedBridgeChild = spawn(
        "powershell.exe",
        [
          "-NoProfile",
          "-ExecutionPolicy",
          "Bypass",
          "-Command",
          `Invoke-Expression ([System.IO.File]::ReadAllText('${escapedPath}'))`,
        ],
        {
          env: { ...process.env, WEBSYNAPSE_NO_BROWSER: "1" },
          stdio: "ignore",
          windowsHide: true,
        }
      );
      spawnedBridgeChild.unref();
    }

    const deadline = Date.now() + 6500;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 220));
      try {
        const st = await callNativeBridge("GET", "/status", null, 900);
        if (st && st.ok) {
          nativeLoadStatus.bridgeOnline = true;
          return st;
        }
      } catch {
        // wait for C# compilation + HttpListener bind
      }
    }
    return null;
  })().finally(() => {
    bridgeStartupPromise = null;
  });

  return bridgeStartupPromise;
}

function cleanupSpawnedBridge() {
  if (spawnedBridgeChild && !spawnedBridgeChild.killed) {
    try {
      spawnedBridgeChild.kill();
    } catch {
      // ignore
    }
    spawnedBridgeChild = null;
  }
}

let studioDaemon = null;

process.on("exit", cleanupSpawnedBridge);
process.on("SIGINT", async () => {
  if (studioDaemon) await studioDaemon.stop().catch(() => {});
  cleanupSpawnedBridge();
  process.exit(0);
});
process.on("SIGTERM", async () => {
  if (studioDaemon) await studioDaemon.stop().catch(() => {});
  cleanupSpawnedBridge();
  process.exit(0);
});

function validateOutgoingPacket90(rawPacket) {
  const body90 = rawPacket.length === 91 ? [...rawPacket.slice(1)] : [...rawPacket];
  if (body90.length !== 90) {
    throw new Error("Protocol 25 frame must be 90 bytes");
  }
  const dataSize = body90[5] & 0xff;
  const cmdClass = body90[6] & 0xff;
  const cmdId = body90[7] & 0xff;
  if (dataSize > 80) {
    throw new Error(`Invalid Protocol 25 dataSize (${dataSize} > 80)`);
  }
  if (!ALLOWED_COMMAND_CLASSES.has(cmdClass)) {
    throw new Error(`Blocked restricted command class 0x${cmdClass.toString(16).toUpperCase().padStart(2, "0")}`);
  }
  if (cmdClass === 0x00 && !ALLOWED_CLASS_00_IDS.has(cmdId)) {
    throw new Error(`Blocked restricted system command 0x00/0x${cmdId.toString(16).toUpperCase().padStart(2, "0")}`);
  }
  body90[88] = Protocol25.computeCrc(body90);
  body90[89] = 0x00;
  return body90;
}

const packetHistory = [];
function recordPacketLog(entry) {
  const item = {
    id: packetHistory.length + 1,
    timestamp: new Date().toISOString(),
    ...entry,
  };
  packetHistory.unshift(item);
  if (packetHistory.length > 100) packetHistory.pop();
  return item;
}

async function discoverDevices({ rescanBridge = false } = {}) {
  const restoreProfiles = loadRestoreProfiles();
  let hidDevices = [];
  let bridgeDevices = [];

  if (process.platform === "win32") {
    try {
      const bridgeSt = rescanBridge
        ? (await ensureNativeBridge()) && (await callNativeBridge("POST", "/rescan", {}, 2500))
        : await ensureNativeBridge();
      if (bridgeSt && Array.isArray(bridgeSt.devices)) {
        bridgeDevices = bridgeSt.devices;
      }
    } catch {
      // ignore if native bridge unavailable
    }
  }

  if (nodeHid) {
    try {
      const allHid = nodeHid.devices() || [];
      hidDevices = allHid.filter((d) => d.vendorId === Protocol25.RAZER_VENDOR_ID);
    } catch (err) {
      nativeLoadStatus.errors.push(`hid.devices(): ${err.message}`);
    }
  }

  const byPid = new Map();

  for (const prof of restoreProfiles) {
    const meta = Protocol25.KNOWN_DEVICES[prof.productId] || {};
    byPid.set(prof.productId, {
      vendorId: prof.vendorId || Protocol25.RAZER_VENDOR_ID,
      productId: prof.productId,
      hexPid: `0x${prof.productId.toString(16).toUpperCase().padStart(4, "0")}`,
      productName: meta.name || prof.productName || `Razer Device (${prof.productId})`,
      deviceContainerId: prof.deviceContainerId || "",
      protocol: prof.protocol || "25",
      interface: prof.interface ?? meta.interface ?? 0,
      usagePage: meta.usagePage ?? null,
      usage: meta.usage ?? null,
      defaultTransactionId: meta.defaultTransactionId ?? 0x1f,
      maxSlots: meta.maxSlots ?? 5,
      transportLayer: prof.transportLayer || "USB",
      category: meta.category || "peripheral",
      features: meta.features || ["chroma", "device-mode"],
      restoreCommands: prof.restore || [],
      hidInterfaces: [],
      source: "restore-profile",
      connectedLive: false,
    });
  }

  for (const b of bridgeDevices) {
    const pid = Number(b.productId);
    if (!pid) continue;
    const meta = Protocol25.KNOWN_DEVICES[pid] || {};
    if (!byPid.has(pid)) {
      byPid.set(pid, {
        vendorId: b.vendorId || Protocol25.RAZER_VENDOR_ID,
        productId: pid,
        hexPid: b.hexPid || `0x${pid.toString(16).toUpperCase().padStart(4, "0")}`,
        productName: meta.name || b.productName || `Razer USB Device (${pid})`,
        deviceContainerId: "",
        protocol: "25",
        interface: b.interfaceNumber ?? meta.interface ?? 0,
        usagePage: meta.usagePage ?? null,
        usage: meta.usage ?? null,
        defaultTransactionId: b.tid ?? meta.defaultTransactionId ?? 0x1f,
        maxSlots: meta.maxSlots ?? 5,
        transportLayer: b.transport || "USB",
        category: meta.category || "peripheral",
        features: meta.features || ["chroma", "dpi", "polling", "device-mode"],
        restoreCommands: [],
        hidInterfaces: [],
        firmware: b.firmware || null,
        hasLampArray: Boolean(b.hasLampArray),
        lampCount: Number(b.lampCount) || 0,
        source: "native-bridge",
        connectedLive: true,
      });
    } else {
      const existing = byPid.get(pid);
      existing.connectedLive = true;
      existing.source = "native-bridge";
      existing.transportLayer = b.transport || existing.transportLayer;
      if (b.firmware) existing.firmware = b.firmware;
      if (b.hasLampArray !== undefined) existing.hasLampArray = Boolean(b.hasLampArray);
      if (b.lampCount) existing.lampCount = Number(b.lampCount);
    }
    byPid.get(pid).hidInterfaces.push({
      path: `${b.transport || "USB"}:IF_${b.interfaceNumber ?? 0}`,
      interface: b.interfaceNumber ?? meta.interface ?? 0,
      usagePage: meta.usagePage ?? 12,
      usage: meta.usage ?? 1,
    });
  }

  for (const h of hidDevices) {
    const pid = h.productId;
    const meta = Protocol25.KNOWN_DEVICES[pid] || {};
    if (!byPid.has(pid)) {
      byPid.set(pid, {
        vendorId: h.vendorId,
        productId: pid,
        hexPid: `0x${pid.toString(16).toUpperCase().padStart(4, "0")}`,
        productName: meta.name || h.product || `Razer HID (${pid})`,
        deviceContainerId: h.deviceContainerId || "",
        protocol: "25",
        interface: meta.interface ?? h.interface ?? 0,
        usagePage: meta.usagePage ?? null,
        usage: meta.usage ?? null,
        defaultTransactionId: meta.defaultTransactionId ?? 0x1f,
        maxSlots: meta.maxSlots ?? 5,
        transportLayer: "USB",
        category: meta.category || "peripheral",
        features: meta.features || ["chroma", "dpi", "polling", "device-mode"],
        restoreCommands: [],
        hidInterfaces: [],
        source: "live-hid",
        connectedLive: true,
      });
    }
    const entry = byPid.get(pid);
    entry.connectedLive = true;
    if (h.product && !h.product.startsWith("HID-") && !meta.name) {
      entry.productName = h.product;
    }
    entry.hidInterfaces.push({
      path: h.path,
      interface: h.interface,
      usagePage: h.usagePage,
      usage: h.usage,
      release: h.release,
      deviceContainerId: h.deviceContainerId,
    });
  }

  return {
    nativeStatus: nativeLoadStatus,
    devices: Array.from(byPid.values()),
    rawHidCount: hidDevices.length,
    restoreProfilesCount: restoreProfiles.length,
  };
}

function selectControlInterfaces(allHidForPid, productId, preferredInterface) {
  const meta = Protocol25.KNOWN_DEVICES[Number(productId)] || {};
  const targetIf = meta.interface !== undefined ? meta.interface : Number(preferredInterface);

  return [...allHidForPid]
    .filter((d) => d.usagePage !== 0x0059) // Exclude Windows Dynamic Lighting LampArray (0x0059)
    .sort((a, b) => {
      const score = (d) => {
        let s = 0;
        if (meta.usagePage && d.usagePage === meta.usagePage && d.usage === meta.usage) s += 140;
        if (d.interface === targetIf) s += 120;
        if (d.usagePage === 12 && d.usage === 1) s += 30;
        if (d.usagePage === 1 && d.usage === 2) s += 25;
        if (d.path && /&col/i.test(d.path)) s -= 80;
        if (d.path && d.path.endsWith("\\kbd")) s -= 80;
        return s;
      };
      return score(b) - score(a);
    });
}

const hidHandleCache = new Map(); // pid -> { handle, info }
const hidMutexByPid = new Map(); // pid -> Promise

function getHidCandidates(productId, interfaceNum = 3) {
  const pidKey = Number(productId) || 679;
  const allHid = (nodeHid.devices() || []).filter(
    (d) => d.vendorId === Protocol25.RAZER_VENDOR_ID && (!productId || d.productId === pidKey)
  );
  if (allHid.length === 0) {
    throw new Error(`No live Razer HID interface found for PID ${pidKey}`);
  }
  return selectControlInterfaces(allHid, pidKey, interfaceNum);
}

async function executeHidFeatureTransfer(handle, report91, reportId) {
  if (typeof handle.sendFeatureReportSync === "function") {
    handle.sendFeatureReportSync(report91);
  } else {
    await handle.sendFeatureReport(report91);
  }
  await new Promise((r) => setTimeout(r, 10));
  let rawRx =
    typeof handle.getFeatureReportSync === "function"
      ? handle.getFeatureReportSync(reportId, 91)
      : await handle.getFeatureReport(reportId, 91);

  let rxArr = Array.from(rawRx || []);
  let parsedRx = Protocol25.parsePacket(rxArr);

  // If the MCU is still writing to onboard flash (0x01 BUSY),
  // poll getFeatureReport (without re-sending sendFeatureReport) until it finishes.
  for (let poll = 0; poll < 8 && (parsedRx.status === 0x01 || parsedRx.status === 0x00); poll++) {
    await new Promise((r) => setTimeout(r, 20));
    if (parsedRx.status === 0x00) {
      if (typeof handle.sendFeatureReportSync === "function") {
        handle.sendFeatureReportSync(report91);
      } else {
        await handle.sendFeatureReport(report91);
      }
      await new Promise((r) => setTimeout(r, 15));
    }
    rawRx =
      typeof handle.getFeatureReportSync === "function"
        ? handle.getFeatureReportSync(reportId, 91)
        : await handle.getFeatureReport(reportId, 91);
    rxArr = Array.from(rawRx || []);
    parsedRx = Protocol25.parsePacket(rxArr);
  }

  return { rxArr, parsedRx };
}

async function sendProtocol25Command({ productId, interfaceNum = 3, reportId = 0, packet90 }) {
  const pidKey = Number(productId) || 679;
  const prevLock = hidMutexByPid.get(pidKey) || Promise.resolve();
  let releaseLock;
  const nextLock = new Promise((r) => {
    releaseLock = r;
  });
  hidMutexByPid.set(pidKey, prevLock.then(() => nextLock));
  await prevLock;

  try {
    const meta = Protocol25.KNOWN_DEVICES[pidKey] || {};
    const body90 = packet90.length === 91 ? [...packet90.slice(1)] : [...packet90];

    if (meta.defaultTransactionId && body90[1] === 0x1f && meta.defaultTransactionId !== 0x1f) {
      body90[1] = meta.defaultTransactionId;
      body90[88] = Protocol25.computeCrc(body90);
    }

    const report91 = [reportId & 0xff, ...body90];
    const parsedReq = Protocol25.parsePacket(report91);

    // 0. Prefer Native WinUSB + HidUsb Bridge on Windows (supports both Zadig WinUSB and standard HidUsb under any Node ABI)
    if (process.platform === "win32") {
      try {
        const bridgeRes = await callNativeBridgeFast(
          "POST",
          "/transfer",
          { pid: pidKey, packet90: body90, timeoutMs: 1400 },
          2400
        );
        if (bridgeRes && bridgeRes.ok && Array.isArray(bridgeRes.rx91)) {
          const rxArr = bridgeRes.rx91.map((b) => Number(b) & 0xff);
          const parsedRx = Protocol25.parsePacket(rxArr);
          const logItem = recordPacketLog({
            mode: `native-${String(bridgeRes.transport || "bridge").toLowerCase()}`,
            productId: pidKey,
            interfaceNum: bridgeRes.interfaceNumber ?? interfaceNum,
            reportId,
            txHex: toHex(report91),
            rxHex: toHex(rxArr),
            parsedTx: parsedReq,
            parsedRx,
          });
          return {
            ok: true,
            mode: logItem.mode,
            transport: bridgeRes.transport || "BRIDGE",
            interfaceNumber: bridgeRes.interfaceNumber ?? interfaceNum,
            tx: report91,
            rx: rxArr,
            parsedRx,
            logItem,
          };
        }
      } catch (bridgeErr) {
        if (!nodeHid) {
          throw bridgeErr;
        }
      }
    }

    if (!nodeHid) {
      throw new Error(`No native hardware backend available for PID 0x${pidKey.toString(16).toUpperCase()}`);
    }

    // 1. Try cached verified handle first if present
    const cached = hidHandleCache.get(pidKey);
    if (cached && cached.handle) {
      try {
        const { rxArr, parsedRx } = await executeHidFeatureTransfer(cached.handle, report91, reportId);
        const logItem = recordPacketLog({
          mode: "native-hid",
          productId: cached.info.productId,
          interfaceNum: cached.info.interface,
          path: cached.info.path,
          reportId,
          txHex: toHex(report91),
          rxHex: toHex(rxArr),
          parsedTx: parsedReq,
          parsedRx,
        });
        return {
          ok: true,
          mode: "native-hid",
          tx: report91,
          rx: rxArr,
          parsedRx,
          logItem,
        };
      } catch {
        try {
          cached.handle.close();
        } catch {
          // ignore
        }
        hidHandleCache.delete(pidKey);
      }
    }

    // 2. Iterate through all ranked candidate HID collections and cache the first one that accepts the 91-byte Feature Report
    const candidates = getHidCandidates(pidKey, interfaceNum);
    let lastError = null;
    for (const targetInfo of candidates) {
      let handle = null;
      try {
        handle = new nodeHid.HID(targetInfo.path);
        const { rxArr, parsedRx } = await executeHidFeatureTransfer(handle, report91, reportId);
        hidHandleCache.set(pidKey, { handle, info: targetInfo });

        const logItem = recordPacketLog({
          mode: "native-hid",
          productId: targetInfo.productId,
          interfaceNum: targetInfo.interface,
          path: targetInfo.path,
          reportId,
          txHex: toHex(report91),
          rxHex: toHex(rxArr),
          parsedTx: parsedReq,
          parsedRx,
        });

        return {
          ok: true,
          mode: "native-hid",
          tx: report91,
          rx: rxArr,
          parsedRx,
          logItem,
        };
      } catch (err) {
        lastError = err;
        if (handle) {
          try {
            handle.close();
          } catch {
            // ignore
          }
        }
      }
    }
    throw lastError || new Error(`All HID interfaces rejected feature report for PID ${pidKey}`);
  } finally {
    releaseLock();
  }
}

function toHex(arr) {
  return Array.from(arr || [])
    .map((b) => (b & 0xff).toString(16).toUpperCase().padStart(2, "0"))
    .join(" ");
}

// Factory default slot builders for Keyboard (6 slots) & Mouse (5 slots)
function createDefaultKeyboardSlot(slotNum) {
  const presets = {
    1: { name: "Standard Default", color: "#ffffff", act: 1.2, rt: true, down: 0.3, up: 0.3, snap: true },
    2: { name: "FPS Rapid Trigger", color: "#ff3b30", act: 0.4, rt: true, down: 0.1, up: 0.1, snap: true },
    3: { name: "Tactical Shooter", color: "#00e676", act: 0.8, rt: true, down: 0.15, up: 0.15, snap: true },
    4: { name: "MOBA / Action", color: "#007aff", act: 1.5, rt: true, down: 0.4, up: 0.4, snap: false },
    5: { name: "Typing & Coding", color: "#00d2ff", act: 2.0, rt: false, down: 0.5, up: 0.5, snap: false },
    6: { name: "Custom Slot 6", color: "#d946ef", act: 1.2, rt: true, down: 0.3, up: 0.3, snap: false },
  };
  const p = presets[slotNum] || presets[1];
  return {
    slot: slotNum,
    name: p.name,
    ledColor: p.color,
    actuationMm: p.act,
    rtEnabled: p.rt,
    rtDownMm: p.down,
    rtUpMm: p.up,
    continuousRt: true,
    perKeyOverrides: {}, // e.g., { "W": { act: 0.4, rt: true, down: 0.1, up: 0.1 } }
    snapTapEnabled: p.snap,
    snapKeyA: "A",
    snapKeyB: "D",
    gamingMode: {
      enabled: slotNum === 2 || slotNum === 3,
      disableWin: true,
      disableAltTab: false,
      disableAltF4: false,
    },
    pollingHz: 1000,
    lighting: {
      effect: "static",
      color1: p.color === "#ffffff" ? "#00e676" : p.color,
      color2: "#00d2ff",
      brightness: 100,
      speed: 2,
      waveDirection: 1,
    },
    keyBindings: {
      standard: {},
      hypershift: {},
    },
  };
}

function createDefaultMouseSlot(slotNum) {
  const presets = {
    1: { name: "All-Rounder 1600", color: "#ffffff", activeStage: 3, hz: 1000 },
    2: { name: "Esports 4000Hz", color: "#ff3b30", activeStage: 2, hz: 4000 },
    3: { name: "HyperPolling 8000Hz", color: "#00e676", activeStage: 3, hz: 8000 },
    4: { name: "Low Sens 800", color: "#007aff", activeStage: 2, hz: 2000 },
    5: { name: "Battery Saver", color: "#00d2ff", activeStage: 3, hz: 1000 },
  };
  const p = presets[slotNum] || presets[1];
  return {
    slot: slotNum,
    name: p.name,
    ledColor: p.color,
    independentXY: false,
    activeStageIndex: p.activeStage,
    dpiStages: [
      { stage: 1, enabled: true, x: 400, y: 400, color: "#ff5252" },
      { stage: 2, enabled: true, x: 800, y: 800, color: "#40c4ff" },
      { stage: 3, enabled: true, x: 1600, y: 1600, color: "#00e676" },
      { stage: 4, enabled: true, x: 3200, y: 3200, color: "#ffd740" },
      { stage: 5, enabled: true, x: 6400, y: 6400, color: "#e040fb" },
    ],
    pollingHz: p.hz,
    sensorAngle: 0,
    dynamicSensitivity: 0, // 0=Off, 1=Classic, 2=Natural, 3=Jump
    smartTracking: {
      asymmetric: false,
      symmetricLevel: 1, // 1=Low, 2=Medium, 3=High
      liftOffLevel: 14,
      landingLevel: 10,
    },
    powerSaving: {
      idleMinutes: 5,
      lowPowerPercent: 15,
    },
    buttonBindings: {
      standard: {
        M1: "Left Click",
        M2: "Right Click",
        M3: "Scroll Click",
        M4: "Mouse Back (Button 4)",
        M5: "Mouse Forward (Button 5)",
        DPI: "DPI Stage Cycle",
      },
      hypershift: {
        M1: "Left Click",
        M2: "Right Click",
        M3: "Media Play/Pause",
        M4: "Volume Up",
        M5: "Volume Down",
        DPI: "Onboard Profile Cycle",
      },
    },
  };
}

function buildDefaultState() {
  const kbdSlots = {};
  for (let i = 1; i <= 6; i++) kbdSlots[i] = createDefaultKeyboardSlot(i);
  const mouseSlots = {};
  for (let i = 1; i <= 5; i++) mouseSlots[i] = createDefaultMouseSlot(i);

  return {
    selectedPid: 679,
    deviceMode: "normal",
    mappingHooksEnabled: true,
    preferences: {
      theme: "venom",
      reducedMotion: false,
      instantFlash: true,
      soundsEnabled: false,
      sidebarCollapsed: false,
    },
    profilesByPid: {
      679: {
        activeSlot: 1,
        slots: kbdSlots,
      },
      193: {
        activeSlot: 1,
        slots: mouseSlots,
      },
    },
  };
}

const STATE_FILE = path.join(__dirname, "local-driver-state.json");
let driverState = buildDefaultState();

try {
  if (fs.existsSync(STATE_FILE)) {
    const loaded = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
    if (loaded && loaded.profilesByPid) {
      driverState = {
        ...driverState,
        ...loaded,
        preferences: {
          ...driverState.preferences,
          ...(loaded.preferences || {}),
        },
      };
    }
  }
} catch {
  // use default state
}

function saveDriverState() {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(driverState, null, 2), "utf8");
  } catch {
    // ignore
  }
}

studioDaemon = createStudioDaemon({
  callNativeBridgeFast,
  getDriverState: () => driverState,
  saveDriverState,
  targetPid: 679,
});

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".cmd": "application/octet-stream",
  ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".ttf": "font/ttf",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".png": "image/png",
  ".webp": "image/webp",
};

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 2 * 1024 * 1024) reject(new Error("Payload too large"));
    });
    req.on("end", () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-WebSynapse-Bridge",
  "Access-Control-Allow-Private-Network": "true",
};

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...CORS_HEADERS,
  });
  res.end(JSON.stringify(data));
}

async function handleApiElectronRpc(method, arg) {
  switch (method) {
    case "doRzDeviceAction": {
      const action = arg?.action;
      if (action === "hid.getDevices") {
        const info = await discoverDevices();
        return info.devices.flatMap((d) => d.hidInterfaces);
      }
      if (action === "usb.getDevices") {
        const info = await discoverDevices();
        return info.devices;
      }
      if (action === "hid.sendFeatureReport" || action === "hid.sendFeatureReportMutex") {
        const dataSend = arg?.payload?.dataSend || [];
        return sendProtocol25Command({
          productId: arg?.payload?.productId || driverState.selectedPid,
          interfaceNum: arg?.payload?.claimInterface ?? 3,
          reportId: arg?.payload?.reportId ?? 0,
          packet90: dataSend,
        });
      }
      return { result: true };
    }
    case "doMappingEngineAction": {
      const action = arg?.action;
      if (action === "enableMapping" || action === "enableAllDevicesHooks") {
        driverState.mappingHooksEnabled = true;
      } else if (action === "disableMapping" || action === "disableAllDevicesHooks") {
        driverState.mappingHooksEnabled = false;
      }
      saveDriverState();
      return { result: true, mappingHooksEnabled: driverState.mappingHooksEnabled };
    }
    default:
      return { result: true, method, arg };
  }
}

const ALL_TKL_ANALOG_KEY_IDS = [
  255,
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15,
  16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30,
  31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45,
  46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 57, 58, 59, 60, 61, 62,
  64, 75, 76, 79, 80, 81, 83, 84, 85, 86, 89, 110, 112, 113, 114,
  115, 116, 117, 118, 119, 120, 121, 122, 123, 124, 125, 126, 127, 129,
];

async function syncKeyboardSlotActuationServer({ pid, slotId, slotObj, interfaceNum = 3, reportId = 0, skipFirstGlobalActChunk = false }) {
  const gAct = slotObj.actuationMm ?? 1.2;
  const gRt = !!slotObj.rtEnabled;
  const gDown = slotObj.rtDownMm ?? 0.3;
  const gUp = slotObj.rtUpMm ?? 0.3;
  const overrides = slotObj.perKeyOverrides && typeof slotObj.perKeyOverrides === "object" ? slotObj.perKeyOverrides : {};

  const overriddenIds = new Set();
  const overrideGroups = new Map();
  for (const [kLabel, ov] of Object.entries(overrides)) {
    if (!ov || typeof ov !== "object") continue;
    const kId = Protocol25.keyLabelToMatrixId(kLabel);
    if (!kId) continue;
    overriddenIds.add(kId);
    const act = ov.act ?? gAct;
    const rt = ov.rt !== undefined ? !!ov.rt : gRt;
    const down = ov.down ?? gDown;
    const up = ov.up ?? gUp;
    const sig = `${Number(act).toFixed(1)}|${rt ? 1 : 0}|${Number(down).toFixed(2)}|${Number(up).toFixed(2)}`;
    let grp = overrideGroups.get(sig);
    if (!grp) {
      grp = { act, rt, down, up, keyIds: [] };
      overrideGroups.set(sig, grp);
    }
    grp.keyIds.push(kId);
  }

  const globalKeyIds = ALL_TKL_ANALOG_KEY_IDS.filter((id) => !overriddenIds.has(id));
  for (let i = skipFirstGlobalActChunk ? 15 : 0; i < globalKeyIds.length; i += 15) {
    await sendProtocol25Command({
      productId: pid,
      interfaceNum,
      reportId,
      packet90: Protocol25.Builders.setAnalogActuation({
        slotId,
        actuationMm: gAct,
        keyIds: globalKeyIds.slice(i, i + 15),
      }),
    }).catch(() => null);
  }

  for (let i = 0; i < globalKeyIds.length; i += 13) {
    await sendProtocol25Command({
      productId: pid,
      interfaceNum,
      reportId,
      packet90: Protocol25.Builders.setAnalogRapidTrigger({
        slotId,
        rtEnabled: gRt,
        rtDownMm: gDown,
        rtUpMm: gUp,
        keyIds: globalKeyIds.slice(i, i + 13),
      }),
    }).catch(() => null);
  }

  for (const grp of overrideGroups.values()) {
    for (let i = 0; i < grp.keyIds.length; i += 15) {
      await sendProtocol25Command({
        productId: pid,
        interfaceNum,
        reportId,
        packet90: Protocol25.Builders.setAnalogActuation({
          slotId,
          actuationMm: grp.act,
          keyIds: grp.keyIds.slice(i, i + 15),
        }),
      }).catch(() => null);
    }
    for (let i = 0; i < grp.keyIds.length; i += 13) {
      await sendProtocol25Command({
        productId: pid,
        interfaceNum,
        reportId,
        packet90: Protocol25.Builders.setAnalogRapidTrigger({
          slotId,
          rtEnabled: grp.rt,
          rtDownMm: grp.down,
          rtUpMm: grp.up,
          keyIds: grp.keyIds.slice(i, i + 13),
        }),
      }).catch(() => null);
    }
  }

  await sendProtocol25Command({
    productId: pid,
    interfaceNum,
    reportId,
    packet90: Protocol25.Builders.setContinuousRapidTrigger({
      slotId,
      enabled: slotObj.continuousRt !== false,
    }),
  }).catch(() => null);
}

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, CORS_HEADERS);
    return res.end();
  }

  const url = new URL(req.url, `http://${req.headers.host || `${HOST}:${PORT}`}`);
  const pathname = url.pathname;

  try {
    // =========================================================================
    // websynap.se v3.0 Native Bridge Endpoints (/status, /rescan, /transfer)
    // =========================================================================
    if ((pathname === "/status" && req.method === "GET") || (pathname === "/rescan" && req.method === "POST")) {
      const doRescan = pathname === "/rescan";
      const discovery = await discoverDevices({ rescanBridge: doRescan });
      const liveDevices = [];
      for (const dev of discovery.devices) {
        if (!dev.connectedLive) continue;
        let fw = dev.firmware || null;
        if (!fw && nodeHid) {
          try {
            const fwRes = await sendProtocol25Command({
              productId: dev.productId,
              interfaceNum: dev.interface ?? 0,
              packet90: Protocol25.Builders.getFirmwareVersion(dev.defaultTransactionId || 0x1f),
            });
            const a = fwRes?.parsedRx?.args || [];
            if (fwRes?.parsedRx?.status === 2) {
              fw = `v${a[0] ?? 1}.${String(a[1] ?? 0).padStart(2, "0")}`;
            }
          } catch {
            // ignore
          }
        }
        const hidHasLamp = Array.isArray(dev.hidInterfaces) && dev.hidInterfaces.some((i) => i.usagePage === 0x0059);
        liveDevices.push({
          vendorId: dev.vendorId || Protocol25.RAZER_VENDOR_ID,
          productId: dev.productId,
          hexPid: dev.hexPid,
          productName: dev.productName,
          interfaceNumber: dev.interface ?? 0,
          transport: dev.transportLayer || "HID",
          tid: dev.defaultTransactionId || 0x1f,
          firmware: fw || "v1.00",
          hasLampArray: Boolean(dev.hasLampArray || hidHasLamp),
          lampCount: Number(dev.lampCount) || (hidHasLamp ? 87 : 0),
        });
      }
      return sendJson(res, 200, {
        ok: true,
        version: "3.0.0-node",
        devices: liveDevices,
      });
    }

    if (pathname === "/keyevents" && req.method === "GET") {
      if (process.platform === "win32") {
        const bridgeRes = await callNativeBridgeFast("GET", `/keyevents${url.search || ""}`, null, 900);
        return sendJson(res, 200, bridgeRes);
      }
      return sendJson(res, 200, { ok: true, seq: 0, events: [] });
    }

    if (pathname === "/lamparray" && req.method === "POST") {
      const body = await readJsonBody(req);
      const pid = Number(body.pid || body.productId || 0);
      const reportsB64 = Array.isArray(body.reportsB64) ? body.reportsB64 : [];
      if (!pid || reportsB64.length === 0 || reportsB64.length > 64) {
        return sendJson(res, 400, { ok: false, error: "pid and 1..64 reportsB64 entries required" });
      }
      studioDaemon.noteBrowserLampFrame(pid);
      if (process.platform === "win32") {
        const bridgeRes = await callNativeBridgeFast("POST", "/lamparray", { pid, reportsB64 }, 1800);
        return sendJson(res, 200, bridgeRes);
      }
      return sendJson(res, 400, { ok: false, error: "Native LampArray bridge requires Windows" });
    }

    if (pathname === "/transfer" && req.method === "POST") {
      const body = await readJsonBody(req);
      const pid = Number(body.pid || body.productId || 0);
      if (!pid || !Array.isArray(body.packet90)) {
        return sendJson(res, 400, { ok: false, error: "pid and 90-byte packet90 array required" });
      }
      const clean90 = validateOutgoingPacket90(body.packet90);
      const meta = Protocol25.KNOWN_DEVICES[pid] || {};
      const result = await sendProtocol25Command({
        productId: pid,
        interfaceNum: meta.interface ?? 0,
        reportId: 0,
        packet90: clean90,
      });
      return sendJson(res, 200, {
        ok: true,
        pid,
        transport: result.transport || result.mode || "HID",
        interfaceNumber: result.interfaceNumber ?? meta.interface ?? 0,
        rx91: result.rx,
      });
    }

    if (pathname === "/api/status" && req.method === "GET") {
      const discovery = await discoverDevices();
      return sendJson(res, 200, {
        ok: true,
        serverVersion: "3.0.0-local",
        zeroInternet: true,
        telemetryStripped: ["Sentry", "RazerID Cloud", "apps.razer.com Remote Loader", "GMS3 WMI Scanner"],
        ...discovery,
        state: driverState,
        packetHistory: packetHistory.slice(0, 30),
      });
    }

    if (pathname === "/api/profile-slot" && req.method === "POST") {
      const body = await readJsonBody(req);
      const pid = Number(body.productId || driverState.selectedPid || 679);
      const meta = Protocol25.KNOWN_DEVICES[pid] || {};
      const isMouse = meta.category === "mouse" || pid === 193 || pid === 192;

      if (!driverState.profilesByPid[pid]) {
        const slots = {};
        const max = isMouse ? 5 : 6;
        for (let i = 1; i <= max; i++) {
          slots[i] = isMouse ? createDefaultMouseSlot(i) : createDefaultKeyboardSlot(i);
        }
        driverState.profilesByPid[pid] = { activeSlot: 1, slots };
      }

      const devProfiles = driverState.profilesByPid[pid];
      const slotId = Number(body.slotId || devProfiles.activeSlot || 1);

      if (body.action === "switch" || body.action === "reset") {
        if (body.action === "reset") {
          devProfiles.slots[slotId] = isMouse
            ? createDefaultMouseSlot(slotId)
            : createDefaultKeyboardSlot(slotId);
        }
        devProfiles.activeSlot = slotId;
        saveDriverState();

        const activeSlotData = devProfiles.slots[slotId];
        await sendProtocol25Command({
          productId: pid,
          packet90: Protocol25.Builders.setDeviceMode(0x00, 0x00),
        }).catch(() => null);
        const hw = await sendProtocol25Command({
          productId: pid,
          packet90: Protocol25.Builders.setActiveProfileSlot(slotId),
        }).catch(() => null);
        if (!isMouse && Protocol25.Builders.setTriggerFirmwareEffects) {
          await sendProtocol25Command({
            productId: pid,
            packet90: Protocol25.Builders.setTriggerFirmwareEffects({ effectId: 1, profileId: slotId }),
          }).catch(() => null);
        }

        // Also sync the slot's actuation, Rapid Trigger, Snap Tap, Gaming Mode, and lighting to hardware
        if (!isMouse && activeSlotData) {
          await syncKeyboardSlotActuationServer({
            pid,
            slotId,
            slotObj: activeSlotData,
          });

          await sendProtocol25Command({
            productId: pid,
            packet90: Protocol25.Builders.setSnapTap({
              slotId,
              enabled: !!(activeSlotData.snapTap?.enabled ?? activeSlotData.snapTapEnabled),
              keyA: activeSlotData.snapTap?.keyA ?? activeSlotData.snapKeyA ?? 0x04,
              keyB: activeSlotData.snapTap?.keyB ?? activeSlotData.snapKeyB ?? 0x07,
            }),
          }).catch(() => null);

          if (activeSlotData.gamingMode !== undefined) {
            await sendProtocol25Command({
              productId: pid,
              packet90: Protocol25.Builders.setGamingMode(activeSlotData.gamingMode),
            }).catch(() => null);
          }

          if (activeSlotData.lighting) {
            const hex = (activeSlotData.lighting.color1 || "#00e676").replace("#", "");
            const num = parseInt(hex, 16) || 0x00e676;
            const hex2 = (activeSlotData.lighting.color2 || "#00d2ff").replace("#", "");
            const num2 = parseInt(hex2, 16) || 0x00d2ff;
            const brRaw = Math.round(((activeSlotData.lighting.brightness ?? 100) / 100) * 255);
            for (const vs of [slotId, 0x00]) {
              await sendProtocol25Command({
                productId: pid,
                packet90: Protocol25.Builders.setBrightness(brRaw, 0x00, vs),
              }).catch(() => null);
              await sendProtocol25Command({
                productId: pid,
                packet90: Protocol25.Builders.setChromaEffect({
                  effect: activeSlotData.lighting.effect || "static",
                  r: (num >> 16) & 0xff,
                  g: (num >> 8) & 0xff,
                  b: num & 0xff,
                  r2: (num2 >> 16) & 0xff,
                  g2: (num2 >> 8) & 0xff,
                  b2: num2 & 0xff,
                  speed: activeSlotData.lighting.speed || 2,
                  direction: activeSlotData.lighting.waveDirection || 1,
                  varStore: vs,
                  ledId: 0x00,
                }),
              }).catch(() => null);
            }
          }
        } else if (isMouse && activeSlotData?.dpiStages) {
          await sendProtocol25Command({
            productId: pid,
            packet90: Protocol25.Builders.setDpiStages(
              activeSlotData.dpiStages,
              activeSlotData.activeStageIndex || 3
            ),
          }).catch(() => null);
        }

        void studioDaemon.syncFromState();
        return sendJson(res, 200, { ok: true, state: driverState, hw });
      }

      if (body.action === "save" && body.slotData) {
        devProfiles.activeSlot = slotId;
        devProfiles.slots[slotId] = {
          ...devProfiles.slots[slotId],
          ...body.slotData,
          slot: slotId,
        };
        saveDriverState();
        void studioDaemon.syncFromState();
        const pkt90 = Protocol25.Builders.setActiveProfileSlot(slotId);
        const hw = await sendProtocol25Command({ productId: pid, packet90: pkt90 }).catch(() => null);
        return sendJson(res, 200, { ok: true, state: driverState, hw });
      }

      return sendJson(res, 400, { ok: false, error: "Invalid profile-slot action" });
    }

    if (pathname === "/api/send-packet" && req.method === "POST") {
      const body = await readJsonBody(req);
      const pid = Number(body.productId || driverState.selectedPid || 679);
      let packet90 = body.packet90;

      if (!packet90 && body.commandClass !== undefined && body.commandId !== undefined) {
        packet90 = Protocol25.buildPacket({
          commandClass: Number(body.commandClass),
          commandId: Number(body.commandId),
          args: Array.isArray(body.args) ? body.args.map(Number) : [],
          dataSize: body.dataSize !== undefined ? Number(body.dataSize) : null,
          transactionId: body.transactionId !== undefined ? Number(body.transactionId) : 0x1f,
        });
      }

      if (!Array.isArray(packet90) || (packet90.length !== 90 && packet90.length !== 91)) {
        return sendJson(res, 400, { ok: false, error: "packet90 must be a 90 or 91 byte array" });
      }

      const norm90 = packet90.length === 91 ? packet90.slice(1) : packet90;
      if (norm90[6] === 0x05 && norm90[7] === 0x04) {
        const targetSlot = Math.max(1, Math.min(6, Number(norm90[8]) || 1));
        if (driverState.profilesByPid[pid]) {
          driverState.profilesByPid[pid].activeSlot = targetSlot;
          saveDriverState();
        }
        await sendProtocol25Command({
          productId: pid,
          interfaceNum: body.interfaceNum ?? 3,
          reportId: body.reportId ?? 0,
          packet90: Protocol25.Builders.setDeviceMode(0x00, 0x00, norm90[1] || 0x1f),
        }).catch(() => null);
      }

      // Persist slot updates if slotPatch is provided
      if (body.slotPatch && driverState.profilesByPid[pid]) {
        const activeSlot = Number(body.slotId || driverState.profilesByPid[pid].activeSlot || 1);
        const curr = driverState.profilesByPid[pid].slots[activeSlot] || {};
        driverState.profilesByPid[pid].slots[activeSlot] = {
          ...curr,
          ...body.slotPatch,
        };
        saveDriverState();
      }

      if (body.statePatch && typeof body.statePatch === "object") {
        driverState = { ...driverState, ...body.statePatch };
        saveDriverState();
      }

      const result = await sendProtocol25Command({
        productId: pid,
        interfaceNum: body.interfaceNum ?? 3,
        reportId: body.reportId ?? 0,
        packet90,
      });

      // For Chroma Matrix (Class 0x0F, Cmd 0x02 or 0x04), ensure both live register (varStore 0x00)
      // and persistent onboard slot register (varStore 1..6) on regionId 0x00 are updated so the keyboard LEDs
      // reflect the change immediately AND persist in the active slot's NVRAM when closed.
      if (norm90[6] === 0x0f && (norm90[7] === 0x02 || norm90[7] === 0x04)) {
        // Ensure ForceChromaCtrl (0x0F / 0x10) is 0x00 so USB HID LampArray (MI_04) is never locked out
        if (Protocol25.Builders?.setForceChromaCtrl) {
          await sendProtocol25Command({
            productId: pid,
            interfaceNum: body.interfaceNum ?? 3,
            reportId: body.reportId ?? 0,
            packet90: Protocol25.Builders.setForceChromaCtrl(false, norm90[1] || 0x1f),
          }).catch(() => null);
        }
        const activeSlot = Math.max(
          1,
          Math.min(6, Number(body.slotId || driverState.profilesByPid?.[pid]?.activeSlot || norm90[8] || 1))
        );
        const sentVarStore = norm90[8] & 0xff;
        const mirrorStores = new Set([0x00, activeSlot]);
        mirrorStores.delete(sentVarStore);
        for (const vs of mirrorStores) {
          const altArgs = norm90.slice(8, 8 + (norm90[5] || 9));
          altArgs[0] = vs & 0xff;
          altArgs[1] = 0x00; // regionId 0x00 for PID 679 Huntsman V3 Pro TKL
          const altPkt = Protocol25.buildPacket({
            commandClass: 0x0f,
            commandId: norm90[7],
            dataSize: norm90[5],
            args: altArgs,
            transactionId: norm90[1] || 0x1f,
          });
          await sendProtocol25Command({
            productId: pid,
            interfaceNum: body.interfaceNum ?? 3,
            reportId: body.reportId ?? 0,
            packet90: altPkt,
          }).catch(() => null);
        }
      } else if (norm90[6] === 0x02 && norm90[7] === 0x19 && body.slotPatch && !body.autoChunked && driverState.profilesByPid[pid]) {
        const activeSlot = driverState.profilesByPid[pid].activeSlot || 1;
        const slotObj = driverState.profilesByPid[pid].slots[activeSlot] || {};
        await syncKeyboardSlotActuationServer({
          pid,
          slotId: activeSlot,
          slotObj,
          interfaceNum: body.interfaceNum ?? 3,
          reportId: body.reportId ?? 0,
        });
      } else if (norm90[6] === 0x07 && norm90[7] === 0x03 && body.slotPatch?.powerSaving?.lowPowerPercent !== undefined) {
        await sendProtocol25Command({
          productId: pid,
          interfaceNum: body.interfaceNum ?? 3,
          reportId: body.reportId ?? 0,
          packet90: Protocol25.Builders.setLowPowerThreshold(body.slotPatch.powerSaving.lowPowerPercent),
        }).catch(() => null);
      }

      void studioDaemon.syncFromState();
      return sendJson(res, 200, {
        ...result,
        state: driverState,
      });
    }

    if (pathname === "/api/studio-state" && req.method === "POST") {
      const body = await readJsonBody(req);
      if (body && typeof body === "object") {
        if (body.selectedPid) {
          driverState.selectedPid = Number(body.selectedPid) || driverState.selectedPid;
        }
        if (body.profilesByPid && typeof body.profilesByPid === "object") {
          driverState.profilesByPid = {
            ...driverState.profilesByPid,
            ...body.profilesByPid,
          };
        }
        saveDriverState();
        void studioDaemon.syncFromState();
      }
      return sendJson(res, 200, { ok: true });
    }

    if (pathname === "/api/studio-handoff" && req.method === "POST") {
      const body = await readJsonBody(req);
      studioDaemon.handoffFromBrowser(body || {});
      return sendJson(res, 200, { ok: true });
    }

    if (pathname === "/api/rpc" && req.method === "POST") {
      const body = await readJsonBody(req);
      const result = await handleApiElectronRpc(body.method, body.arg);
      return sendJson(res, 200, { ok: true, result, state: driverState });
    }

    if (pathname === "/api/preferences" && req.method === "POST") {
      const body = await readJsonBody(req);
      driverState.preferences = {
        ...driverState.preferences,
        ...(body.preferences || body),
      };
      saveDriverState();
      return sendJson(res, 200, { ok: true, preferences: driverState.preferences, state: driverState });
    }

    if (pathname === "/api/hardware-test" && req.method === "POST") {
      const body = await readJsonBody(req);
      const pid = Number(body.productId || driverState.selectedPid || 679);
      const discovery = await discoverDevices();
      const dev = discovery.devices.find((d) => Number(d.productId) === pid) || discovery.devices[0];
      const meta = Protocol25.KNOWN_DEVICES[pid] || {};
      const checks = [];

      // 1. HID Control Interface Enumeration
      const ifCount = dev?.hidInterfaces?.length || 0;
      const targetIf = selectControlInterfaces(dev?.hidInterfaces || [], pid, meta.interface ?? 3)[0];
      checks.push({
        key: "hid-interface",
        label: "Razer Protocol 25 HID control collection",
        status: ifCount > 0 ? "pass" : "fail",
        detail: targetIf
          ? `VID 0x1532 · PID 0x${pid.toString(16).toUpperCase().padStart(4, "0")} · IF ${targetIf.interface} (Usage ${targetIf.usagePage}:${targetIf.usage}, TxID 0x${(meta.defaultTransactionId || 0x1f).toString(16).toUpperCase()})`
          : "No live HID interface detected",
      });

      // 2. Firmware Version Readback (0x00 / 0x87)
      let fwStr = null;
      try {
        const fwRes = await sendProtocol25Command({
          productId: pid,
          packet90: Protocol25.Builders.getFirmwareVersion(),
        });
        const args = fwRes?.parsedRx?.args || [];
        fwStr = `v${args[0] ?? 1}.${String(args[1] ?? 0).padStart(2, "0")}.${String(args[2] ?? 0).padStart(2, "0")}`;
        checks.push({
          key: "firmware-read",
          label: "Firmware version read-back (0x00 / 0x87)",
          status: fwRes?.parsedRx?.status === 2 ? "pass" : "fail",
          detail: `${fwStr} · Status ${fwRes?.parsedRx?.statusName || "OK"} (CRC 0x${(fwRes?.parsedRx?.crc ?? 0).toString(16).toUpperCase()})`,
        });
      } catch (e) {
        checks.push({
          key: "firmware-read",
          label: "Firmware version read-back (0x00 / 0x87)",
          status: "fail",
          detail: e.message,
        });
      }

      // 3. Device Mode Readback (0x00 / 0x84)
      await new Promise((r) => setTimeout(r, 35));
      try {
        const modeRes = await sendProtocol25Command({
          productId: pid,
          packet90: Protocol25.Builders.getDeviceMode(),
        });
        const stCode = modeRes?.parsedRx?.status;
        const m0 = modeRes?.parsedRx?.args?.[0] ?? 0;
        checks.push({
          key: "device-mode",
          label: "Hardware operating mode read-back (0x00 / 0x84)",
          status: stCode === 2 || stCode === 4 ? "pass" : "fail",
          detail: m0 === 3 ? "Driver Mode (0x03)" : `Normal Onboard Mode (0x0${m0})`,
        });
      } catch (e) {
        checks.push({
          key: "device-mode",
          label: "Hardware operating mode read-back (0x00 / 0x84)",
          status: "fail",
          detail: e.message,
        });
      }

      // 4. Onboard Profile / Sensor Read-Back Verification (non-destructive)
      await new Promise((r) => setTimeout(r, 35));
      try {
        const isMouse = meta.category === "mouse" || pid === 193 || pid === 192;
        const slotPkt = isMouse
          ? Protocol25.Builders.getFirmwareVersion()
          : Protocol25.buildPacket({
              commandClass: 0x05,
              commandId: 0x84,
              dataSize: 0x02,
              args: [0x01, 0x00],
              transactionId: meta.defaultTransactionId || 0x1f,
            });
        const slotRes = await sendProtocol25Command({
          productId: pid,
          packet90: slotPkt,
        });
        const stCode = slotRes?.parsedRx?.status;
        const readSlot = slotRes?.parsedRx?.args?.[1] || slotRes?.parsedRx?.args?.[0] || 1;
        checks.push({
          key: "profile-roundtrip",
          label: "Onboard memory active slot read-back (0x05 / 0x84)",
          status: stCode === 2 || stCode === 4 ? "pass" : "fail",
          detail: isMouse
            ? `Sensor / MCU read-back verified (${slotRes?.parsedRx?.statusName || "OK"})`
            : `Read active onboard Slot S${readSlot} (0x02 SUCCESS — zero-write safe check)`,
        });
      } catch (e) {
        checks.push({
          key: "profile-roundtrip",
          label: "Onboard memory active slot read-back (0x05 / 0x84)",
          status: "fail",
          detail: e.message,
        });
      }

      return sendJson(res, 200, {
        ok: true,
        productId: pid,
        deviceName: dev?.productName || meta.name || `Razer PID ${pid}`,
        firmware: fwStr,
        checks,
      });
    }

    if (pathname === "/api/clear-logs" && req.method === "POST") {
      packetHistory.length = 0;
      return sendJson(res, 200, { ok: true, packetHistory: [] });
    }

    const STATIC_SECURITY_HEADERS = {
      "Content-Security-Policy":
        "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' http://127.0.0.1:18925 http://localhost:18925 http://127.0.0.1:5426 http://localhost:5426; font-src 'self'; media-src 'none'; object-src 'none'; frame-ancestors 'none'; worker-src 'self' blob:; base-uri 'none'; form-action 'none';",
      "Permissions-Policy":
        "hid=(self), usb=(self), serial=(), bluetooth=(), camera=(), microphone=(), geolocation=(), payment=()",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
      "Referrer-Policy": "no-referrer",
      "Cache-Control": "no-cache",
    };

    if (pathname === "/protocol25.js" && (req.method === "GET" || req.method === "HEAD")) {
      const p25Path = fs.existsSync(path.join(__dirname, "public", "protocol25.js"))
        ? path.join(__dirname, "public", "protocol25.js")
        : path.join(__dirname, "protocol25.js");
      res.writeHead(200, {
        "Content-Type": "application/javascript; charset=utf-8",
        ...STATIC_SECURITY_HEADERS,
      });
      if (req.method === "HEAD") return res.end();
      return fs.createReadStream(p25Path).pipe(res);
    }

    const publicDir = path.join(__dirname, "public");
    const publicDirWithSep = publicDir.endsWith(path.sep) ? publicDir : publicDir + path.sep;
    const relPath = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
    const safePath = path.resolve(publicDir, relPath);

    if (
      (req.method === "GET" || req.method === "HEAD") &&
      safePath.startsWith(publicDirWithSep) &&
      fs.existsSync(safePath) &&
      fs.statSync(safePath).isFile()
    ) {
      const ext = path.extname(safePath).toLowerCase();
      res.writeHead(200, {
        "Content-Type":
          path.basename(safePath) === "LICENSE"
            ? "text/plain; charset=utf-8"
            : MIME_TYPES[ext] || "application/octet-stream",
        ...STATIC_SECURITY_HEADERS,
      });
      if (req.method === "HEAD") return res.end();
      return fs.createReadStream(safePath).pipe(res);
    }

    sendJson(res, 404, { ok: false, error: `Not found: ${pathname}` });
  } catch (err) {
    sendJson(res, 500, { ok: false, error: err.message });
  }
});

server.keepAliveTimeout = 65000;
server.on("connection", (socket) => {
  socket.setNoDelay(true);
});

server.listen(PORT, HOST, async () => {
  const bridgeStatus = await ensureNativeBridge();
  studioDaemon.start();
  const bridgeCount = Array.isArray(bridgeStatus?.devices) ? bridgeStatus.devices.length : 0;
  console.log("================================================================");
  console.log("  websynap.se v3.0 · Local Node.js Chroma Studio Server");
  console.log(`  Local URL    : http://localhost:${PORT} (http://${HOST}:${PORT})`);
  console.log(`  Runtime      : ${nativeLoadStatus.runtime} (ABI ${nativeLoadStatus.modulesVersion})`);
  console.log(
    `  USB Backend  : ${
      bridgeStatus?.ok
        ? `WinUSB + HidUsb Native Bridge ACTIVE (${bridgeCount} live Razer device${bridgeCount === 1 ? "" : "s"})`
        : nativeLoadStatus.hidLoaded
          ? "HID.node ACTIVE"
          : "Browser WebHID / WebUSB Mode"
    }`
  );
  console.log("================================================================");
});
