# Razer Local Web Driver (Zero-Internet / Zero-Bloat Edition)

A 100% local, browser-accessible hardware driver for Razer peripherals reverse-engineered from **Razer Synapse 4 (`RazerAppEngine` v4.0.827)** using the REA MCP reverse-engineering suite.

## Why This Exists
Razer Synapse 4 (`RazerAppEngine.exe`) is an Electron wrapper that loads its UI remotely from `https://apps.razer.com/synapse/dashboard`, bundles Sentry crash telemetry, runs background WMI process scanners (`GameManagerService3.dll` + `Razer.WMI.dll`), and requires cloud login/services.

Our REA MCP investigation uncovered three critical architectural facts:
1. **Electron Fuse `RunAsNode: enabled`** (`ev_407df9a5470f6cdae33f7051cfa573a12282a9503f61fde21865524a3ce32be9`): Setting `ELECTRON_RUN_AS_NODE=1` turns `RazerAppEngine.exe` into a pure headless Node.js runtime with exact ABI compatibility (`NODE_MODULE_VERSION`) for all unpacked native `.node` addons (`node-rz-hid`, `rz-usb-detect`, `ffi-napi-rz`) and native C++ DLLs (`mapping_engine.dll`, `simple_service.dll`)—without launching Electron or connecting to the internet.
2. **Protocol 25 90-Byte HID Feature Reports** (`electron/Protocol/protocol25.js`, `electron/UsbRzDeviceAction.js`, and `Devices/Restore/5426_679.json`): All device configuration (Chroma RGB matrix, brightness, Huntsman V3 Pro TKL analog actuation & Rapid Trigger, Snap Tap, DPI, polling rate, device mode) is sent via 90-byte Protocol 25 packets (91 bytes with Report ID `0x00` prepended) where byte `88` is the XOR checksum of bytes `2..87`.
3. **Dual Transport (Native Node HID + Browser WebHID)**: Any Chromium browser (Chrome, Edge, Brave) can also communicate directly with Razer USB HID interfaces (`VID 0x1532`) via `navigator.hid` (`sendFeatureReport` / `receiveFeatureReport`) using `protocol25.js`.

## Quick Start

### Option 1: Double-click `start-driver.bat` (or run from terminal)
```powershell
cd c:\Users\Nick\Downloads\rea-main\razer-web-driver
.\start-driver.bat
```
Then open **`http://127.0.0.1:5426`** in any browser.

### Option 2: Run with standard Node.js + Browser WebHID
```powershell
node c:\Users\Nick\Downloads\rea-main\razer-web-driver\server.js
```
Open **`http://127.0.0.1:5426`** and click **"Connect Browser WebHID (0x1532)"** in the top bar to grant direct USB HID access from your browser.

## Files
- [`protocol25.js`](./protocol25.js): Isomorphic Razer Protocol 25 packet encoder/decoder, XOR CRC calculator (`bytes[2..87]`), and command builders.
- [`server.js`](./server.js): Zero-dependency local HTTP + RPC hardware server (`127.0.0.1:5426`) bridging `node-rz-hid`, `rz-usb-detect`, `mapping_engine.dll`, `simple_service.dll`, and `window.apiElectron`.
- [`public/index.html`](./public/index.html) & [`public/app.js`](./public/app.js): Clean, fast local browser UI with Chroma Lighting, Huntsman V3 Pro TKL Analog/Rapid Trigger/Snap Tap controls, Mouse DPI/Polling/Battery, Mapping Engine hooks, and a live 91-byte Protocol 25 Packet Studio.
