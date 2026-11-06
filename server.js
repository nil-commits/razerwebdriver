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
const Protocol25 = require("./protocol25");

const HOST = process.env.HOST || "127.0.0.1";
const PORT = Number(process.env.PORT || 5426); // 5426 = 0x1532 (Razer Vendor ID)

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

  return [...allHidForPid].sort((a, b) => {
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
}

async function sendProtocol25Command({ productId, interfaceNum = 3, reportId = 0, packet90 }) {
  const meta = Protocol25.KNOWN_DEVICES[Number(productId)] || {};
  const body90 = packet90.length === 91 ? [...packet90.slice(1)] : [...packet90];

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
      driverState = { ...driverState, ...loaded };
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
        serverVersion: "2.0.0-local",
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
      const isMouse = pid === 193 || pid === 192;

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

      if (body.action === "switch") {
        devProfiles.activeSlot = slotId;
        saveDriverState();
        const pkt90 = Protocol25.Builders.setActiveProfileSlot(slotId);
        const hw = await sendProtocol25Command({ productId: pid, packet90: pkt90 }).catch(() => null);
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
        const pkt90 = Protocol25.Builders.setActiveProfileSlot(slotId);
        const hw = await sendProtocol25Command({ productId: pid, packet90: pkt90 }).catch(() => null);
        return sendJson(res, 200, { ok: true, state: driverState, hw });
      }

      if (body.action === "reset") {
        devProfiles.slots[slotId] = isMouse
          ? createDefaultMouseSlot(slotId)
          : createDefaultKeyboardSlot(slotId);
        saveDriverState();
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

      // Persist slot updates if slotPatch is provided
      if (body.slotPatch && driverState.profilesByPid[pid]) {
        const activeSlot = driverState.profilesByPid[pid].activeSlot || 1;
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
  console.log("  Razer Local Web Driver v2.0 (Onboard Slots + Per-Key Edition)");
  console.log(`  Local URL   : http://${HOST}:${PORT}`);
  console.log(`  Runtime     : ${nativeLoadStatus.runtime} (ABI ${nativeLoadStatus.modulesVersion})`);
  console.log(`  Native HID  : ${nativeLoadStatus.hidLoaded ? "ACTIVE (HID.node)" : "WebHID / Restore Profile Mode"}`);
  console.log("================================================================");
});
