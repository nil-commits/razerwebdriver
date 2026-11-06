/**
 * Razer Local Web Driver — Zero-Bloat Local Hardware Server
 *
 * Replaces Razer Synapse 4's cloud-dependent Electron UI (https://apps.razer.com)
 * with a 100% offline, local HTTP + hardware bridge on http://127.0.0.1:5426.
 *
 * Directly loads Razer's N-API native addon (`HID.node`) from
 * `C:\Program Files\Razer\RazerAppEngine\app-4.0.827\resources\app.asar.unpacked\node_modules\node-rz-hid\build\Release\HID.node`
 * which is ABI-stable across standard Node.js (including v24) and Electron!
 */

"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");
const os = require("os");
const Protocol25 = require("./protocol25");

const HOST = process.env.HOST || "127.0.0.1";
const PORT = Number(process.env.PORT || 5426); // 5426 = 0x1532 (Razer Vendor ID)

// Locate installed RazerAppEngine & User Data paths
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

// Load HID.node directly from app.asar.unpacked (N-API binary works directly in Node v24 without Electron!)
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

/**
 * Enumerates all live Razer HID devices via HID.node + cached Restore profiles
 */
async function discoverDevices() {
  const restoreProfiles = loadRestoreProfiles();
  let hidDevices = [];

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
      transportLayer: prof.transportLayer || "USB",
      category: meta.category || "peripheral",
      features: meta.features || ["chroma", "device-mode"],
      restoreCommands: prof.restore || [],
      hidInterfaces: [],
      source: "restore-profile",
      connectedLive: false,
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

/**
 * Selects the exact Protocol 25 feature-report control interface for a given Razer PID.
 * Verified against live hardware:
 *   - PID 679 (Huntsman V3 Pro TKL): interface 3, usagePage 12, usage 1 (TID 0x1F -> FW v1.04)
 *   - PID 193 (Viper V3 Pro Wireless): interface 0, usagePage 1, usage 2 (TID 0xFF -> FW v1.11)
 */
function selectControlInterfaces(allHidForPid, productId, preferredInterface) {
  const meta = Protocol25.KNOWN_DEVICES[Number(productId)] || {};
  const targetIf = meta.interface !== undefined ? meta.interface : Number(preferredInterface);

  const ranked = [...allHidForPid].sort((a, b) => {
    const score = (d) => {
      let s = 0;
      if (meta.usagePage && d.usagePage === meta.usagePage && d.usage === meta.usage) s += 100;
      if (d.interface === targetIf) s += 50;
      if (d.usagePage === 12 && d.usage === 1) s += 20;
      if (d.usagePage === 1 && d.usage === 2) s += 15;
      if (d.path && d.path.endsWith("\\kbd")) s -= 40;
      return s;
    };
    return score(b) - score(a);
  });

  return ranked;
}

/**
 * Sends a 90-byte Protocol 25 packet to a Razer device via native HID.node
 * and reads back the 91-byte Feature Report response.
 */
async function sendProtocol25Command({ productId, interfaceNum = 3, reportId = 0, packet90 }) {
  const meta = Protocol25.KNOWN_DEVICES[Number(productId)] || {};
  const body90 = packet90.length === 91 ? [...packet90.slice(1)] : [...packet90];

  // Use device-specific default transactionId (e.g. 0xFF for Viper V3 Pro wireless dongle) if default 0x1F was passed
  if (meta.defaultTransactionId && body90[1] === 0x1f && meta.defaultTransactionId !== 0x1f) {
    body90[1] = meta.defaultTransactionId;
    body90[88] = Protocol25.computeCrc(body90);
  }

  const report91 = [reportId & 0xff, ...body90];
  const parsedReq = Protocol25.parsePacket(report91);

  if (!nodeHid) {
    const simResp = [...body90];
    simResp[0] = Protocol25.STATUS.SUCCESS;
    simResp[88] = Protocol25.computeCrc(simResp);
    const logItem = recordPacketLog({
      mode: "simulated-or-webhid",
      productId,
      interfaceNum,
      reportId,
      txHex: toHex(report91),
      rxHex: toHex([reportId, ...simResp]),
      parsedTx: parsedReq,
      parsedRx: Protocol25.parsePacket([reportId, ...simResp]),
    });
    return {
      ok: true,
      mode: "simulated-or-webhid",
      tx: report91,
      rx: [reportId, ...simResp],
      parsedRx: logItem.parsedRx,
      logItem,
    };
  }

  const allHid = (nodeHid.devices() || []).filter(
    (d) => d.vendorId === Protocol25.RAZER_VENDOR_ID && (!productId || d.productId === Number(productId))
  );
  if (allHid.length === 0) {
    throw new Error(`No live Razer HID interface found for PID ${productId}`);
  }

  const candidates = selectControlInterfaces(allHid, productId, interfaceNum);
  let lastError = null;

  for (const targetInfo of candidates) {
    let handle = null;
    try {
      handle = new nodeHid.HID(targetInfo.path);
      await handle.sendFeatureReport(report91);
      await new Promise((r) => setTimeout(r, 18));
      const rawRx = await handle.getFeatureReport(reportId, 91);
      handle.close();

      const rxArr = Array.from(rawRx || []);
      const parsedRx = Protocol25.parsePacket(rxArr);

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

  throw lastError || new Error("All candidate HID interfaces rejected sendFeatureReport");
}

function toHex(arr) {
  return Array.from(arr || [])
    .map((b) => (b & 0xff).toString(16).toUpperCase().padStart(2, "0"))
    .join(" ");
}

const STATE_FILE = path.join(__dirname, "local-driver-state.json");
let driverState = {
  selectedPid: 679,
  deviceMode: "normal",
  lighting: {
    brightness: 100,
    effect: "static",
    color1: "#00FF66",
    color2: "#00AAFF",
    waveDirection: 1,
    speed: 2,
  },
  huntsman: {
    actuationMm: 1.2,
    rapidTriggerEnabled: true,
    rapidTriggerDownMm: 0.3,
    rapidTriggerUpMm: 0.3,
    continuousRapidTrigger: true,
    snapTapEnabled: true,
    snapTapKeyA: "A",
    snapTapKeyB: "D",
  },
  mouse: {
    dpiX: 1600,
    dpiY: 1600,
    pollingHz: 1000,
    sensorAngle: 0,
    stages: [400, 800, 1600, 3200, 6400],
  },
  audio: {
    speakerVolume: 80,
    micVolume: 75,
    sidetoneVolume: 35,
    sidetoneEnabled: false,
  },
  mappingHooksEnabled: true,
};

try {
  if (fs.existsSync(STATE_FILE)) {
    driverState = { ...driverState, ...JSON.parse(fs.readFileSync(STATE_FILE, "utf8")) };
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

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
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

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
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

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || `${HOST}:${PORT}`}`);
  const pathname = url.pathname;

  try {
    if (pathname === "/api/status" && req.method === "GET") {
      const discovery = await discoverDevices();
      return sendJson(res, 200, {
        ok: true,
        serverVersion: "1.0.0-local",
        zeroInternet: true,
        telemetryStripped: ["Sentry", "RazerID Cloud", "apps.razer.com Remote Loader", "GMS3 WMI Scanner"],
        ...discovery,
        state: driverState,
        packetHistory: packetHistory.slice(0, 30),
      });
    }

    if (pathname === "/api/send-packet" && req.method === "POST") {
      const body = await readJsonBody(req);
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

      if (body.statePatch && typeof body.statePatch === "object") {
        driverState = {
          ...driverState,
          ...body.statePatch,
          lighting: { ...driverState.lighting, ...(body.statePatch.lighting || {}) },
          huntsman: { ...driverState.huntsman, ...(body.statePatch.huntsman || {}) },
          mouse: { ...driverState.mouse, ...(body.statePatch.mouse || {}) },
          audio: { ...driverState.audio, ...(body.statePatch.audio || {}) },
        };
        saveDriverState();
      }

      const result = await sendProtocol25Command({
        productId: body.productId || driverState.selectedPid,
        interfaceNum: body.interfaceNum ?? 3,
        reportId: body.reportId ?? 0,
        packet90,
      });

      return sendJson(res, 200, {
        ...result,
        state: driverState,
      });
    }

    if (pathname === "/api/rpc" && req.method === "POST") {
      const body = await readJsonBody(req);
      const result = await handleApiElectronRpc(body.method, body.arg);
      return sendJson(res, 200, { ok: true, result, state: driverState });
    }

    if (pathname === "/api/clear-logs" && req.method === "POST") {
      packetHistory.length = 0;
      return sendJson(res, 200, { ok: true, packetHistory: [] });
    }

    if (pathname === "/protocol25.js" && req.method === "GET") {
      const content = fs.readFileSync(path.join(__dirname, "protocol25.js"));
      res.writeHead(200, { "Content-Type": "application/javascript; charset=utf-8" });
      return res.end(content);
    }

    const publicDir = path.join(__dirname, "public");
    const relPath = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
    const safePath = path.normalize(path.join(publicDir, relPath));

    if (safePath.startsWith(publicDir) && fs.existsSync(safePath) && fs.statSync(safePath).isFile()) {
      const ext = path.extname(safePath).toLowerCase();
      res.writeHead(200, {
        "Content-Type": MIME_TYPES[ext] || "application/octet-stream",
        "Cache-Control": "no-store",
      });
      return res.end(fs.readFileSync(safePath));
    }

    sendJson(res, 404, { ok: false, error: `Not found: ${pathname}` });
  } catch (err) {
    sendJson(res, 500, { ok: false, error: err.message });
  }
});

server.listen(PORT, HOST, () => {
  console.log("================================================================");
  console.log("  Razer Local Web Driver (Zero-Internet / Zero-Bloat Edition)");
  console.log(`  Local URL   : http://${HOST}:${PORT}`);
  console.log(`  Runtime     : ${nativeLoadStatus.runtime} (ABI ${nativeLoadStatus.modulesVersion})`);
  console.log(`  Native HID  : ${nativeLoadStatus.hidLoaded ? "ACTIVE (HID.node)" : "WebHID / Restore Profile Mode"}`);
  console.log("================================================================");
});
