# Razer Local Web Driver (Zero-Internet / Zero-Bloat Edition)

A 100% local, browser-accessible hardware driver for Razer peripherals reverse-engineered from **Razer Synapse 4 (`RazerAppEngine` v4.0.827)** using the REA MCP reverse-engineering suite.

## Why This Exists
Razer Synapse 4 (`RazerAppEngine.exe`) is an Electron wrapper that loads its UI remotely from `https://apps.razer.com/synapse/dashboard`, bundles Sentry crash telemetry, runs background WMI process scanners (`GameManagerService3.dll` + `Razer.WMI.dll`), and requires cloud login/services.

Our REA MCP investigation uncovered three critical architectural facts:
1. **Electron Fuse `RunAsNode: enabled`** (`ev_407df9a5470f6cdae33f7051cfa573a12282a9503f61fde21865524a3ce32be9`): Setting `ELECTRON_RUN_AS_NODE=1` turns `RazerAppEngine.exe` into a pure headless Node.js runtime with exact ABI compatibility (`NODE_MODULE_VERSION`) for all unpacked native `.node` addons (`node-rz-hid`, `rz-usb-detect`, `ffi-napi-rz`) and native C++ DLLs (`mapping_engine.dll`, `simple_service.dll`)—without launching Electron or connecting to the internet.
2. **Protocol 25 90-Byte HID Feature Reports** (`electron/Protocol/protocol25.js`, `electron/UsbRzDeviceAction.js`, and `Devices/Restore/5426_679.json`): All device configuration (Chroma RGB matrix, brightness, Huntsman V3 Pro TKL analog actuation & Rapid Trigger, Snap Tap, DPI, polling rate, device mode) is sent via 90-byte Protocol 25 packets (91 bytes with Report ID `0x00` prepended) where byte `88` is the XOR checksum of bytes `2..87`.
3. **Dual Transport (Native Node HID + Browser WebHID)**: Any Chromium browser (Chrome, Edge, Brave) can also communicate directly with Razer USB HID interfaces (`VID 0x1532`) via `navigator.hid` (`sendFeatureReport` / `receiveFeatureReport`) using `protocol25.js`.

## One-Script Setup & Auto-Restart

Zero `npm install` or external dependencies required — **just run [`start-driver.bat`](./start-driver.bat)** (double-click in Explorer or run from terminal):

```bat
start-driver.bat
```

What `start-driver.bat` + `server.js` do automatically:
1. Locates your installed Node.js LTS binary (`node.exe`) with zero package installation needed.
2. Starts a **built-in Node.js crash-recovery supervisor** in [`server.js`](./server.js) (backed up by a `:watchdog_loop` in `start-driver.bat`) that automatically restarts the HTTP + Chroma Studio worker within 1 second if it ever crashes.
3. Automatically launches the local USB/HID Bridge (`127.0.0.1:18925`) and opens **`http://localhost:5426`** in your browser.

## Verified Hardware Features (Protocol 25)
- **Onboard Profile Slots (`0x05 / 0x04` & `0x05 / 0x84`)**: Switch and persist up to 6 onboard hardware slots with per-slot settings.
- **Huntsman V3 Pro TKL Analog Actuation & Rapid Trigger (`0x02 / 0x19`, `0x02 / 0x1A`, `0x02 / 0x20`)**: Per-key or all-key actuation (`0.1 mm – 4.0 mm` at `16380 units/mm`), Rapid Trigger up/down sensitivity (`0.1 mm – 2.0 mm`), and Continuous Rapid Trigger.
- **Snap Tap / SOCD (`0x02 / 0x21`)**: Hardware Kill Switch priority for opposing movement keys (`A + D`).
- **Key & Mouse Button Remapping (`0x02 / 0x0D` & `0x02 / 0x0C`)**: Standard and Hypershift layer assignments.
- **Gaming Mode (`0x03 / 0x00`, LED `0x08`)**: Hardware Gaming Mode toggle.
- **Chroma Lighting & Brightness (`0x0F / 0x02` & `0x0F / 0x04`)**: Instant Static, Breathing, Spectrum Cycling, Wave, Reactive, Starlight, and Off effects with hardware brightness control.
- **HyperPolling Rate (`0x00 / 0x40`)**: `125 Hz` up to `8000 Hz` USB high-speed polling period.
- **Mouse Sensor & Wireless Power (`0x04 / 0x05`, `0x04 / 0x06`, `0x0B / 0x0B`, `0x0B / 0x11`, `0x0B / 0x14`, `0x07 / 0x03`, `0x07 / 0x80`)**: 5-stage DPI table, Smart Tracking (symmetric/asymmetric lift-off & landing), angle snapping/rotation, dynamic sensitivity, idle sleep timeout, and live battery telemetry.

## Files
- [`protocol25.js`](./protocol25.js): Isomorphic Razer Protocol 25 packet encoder/decoder, XOR CRC calculator (`bytes[2..87]`), and command builders.
- [`server.js`](./server.js): Zero-dependency local HTTP + RPC hardware server (`127.0.0.1:5426`) with persistent per-PID HID handle caching and onboard slot persistence.
- [`public/index.html`](./public/index.html), [`public/styles.css`](./public/styles.css), & [`public/app.js`](./public/app.js): Local browser UI that works in any browser (Firefox, Safari, Chrome, Edge) with 0 ms instant UI feedback.
