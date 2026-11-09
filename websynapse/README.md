# websynap.se — Zero-Install Razer WebHID Configurator

A **100% client-side, zero-backend** online web configurator for Razer keyboards and mice powered by the browser's **WebHID API (`navigator.hid`)** and reverse-engineered Razer **Protocol 25** (`rzDevice25`).

Anyone using a Chromium-based browser (**Chrome, Edge, Brave, Opera, Vivaldi, Arc**) can visit your hosted site, click **⚡ Connect Razer Device**, and configure their hardware directly in the browser with **nothing installed or running locally**.

## How It Works
- **100% Static Hosting**: Pure `index.html`, `styles.css`, `protocol25.js`, and `app.js` — no backend server, no database, no Node.js required on the user's PC.
- **Direct Browser WebHID (`navigator.hid`)**: Sends and receives 90-byte Razer Protocol 25 HID Feature Reports (`Report ID 0x00`) directly from the browser over USB, including automatic control-interface selection, per-device async mutex locking, and `0x01 BUSY` flash-write polling.
- **Instant Persistence**: Saves onboard hardware settings directly to the keyboard/mouse MCU flash and persists local slot presets & UI themes in browser `localStorage` (plus portable `RZW1:` Base64 profile keys and JSON export/import).
- **Interactive Demo Preview Mode**: Visitors without a Razer device plugged in can still explore the full Huntsman V3 Pro TKL and Viper V3 Pro UI in Demo Preview Mode before pairing.

## Supported Protocol 25 Features
- **Onboard Profile Slots (`0x05 / 0x04` & `0x05 / 0x84`)**: Switch and flash up to 6 keyboard slots or 5 mouse slots.
- **Analog Optical Actuation & Rapid Trigger (`0x02 / 0x19`, `0x02 / 0x1A`, `0x02 / 0x20`)**: Global 87-key and per-key actuation (`0.1 mm – 4.0 mm` at `16380 units/mm`), Rapid Trigger press/release sensitivity (`0.1 mm – 2.0 mm`), and Continuous Rapid Trigger.
- **Razer Snap Tap / SOCD (`0x02 / 0x21`)**: Hardware directional priority (`A + D` or custom key pair).
- **Key & Mouse Button Remapping (`0x02 / 0x0D` & `0x02 / 0x0C`)**: Standard and Razer Hypershift layers.
- **Gaming Mode (`0x03 / 0x00`, LED `0x08`)**: Hardware Gaming Mode LED/lock toggle.
- **Chroma Matrix Lighting & Brightness (`0x0F / 0x02` & `0x0F / 0x04`)**: Instant Static, Breathing, Spectrum, Wave, Reactive, Starlight, and Off effects.
- **HyperPolling Rate (`0x00 / 0x40`)**: `125 Hz` up to `8000 Hz`.
- **Mouse Sensor & Wireless Power (`0x04 / 0x06`, `0x0B / 0x0B`, `0x0B / 0x11`, `0x0B / 0x14`, `0x07 / 0x03`, `0x07 / 0x80`)**: 5-stage X/Y DPI table, Smart Tracking (symmetric/asymmetric lift-off & landing), sensor angle, dynamic sensitivity, idle sleep timeout, and live battery telemetry.

## Deploying Online (`websynap.se`)
Because browsers require a **Secure Context (HTTPS)** for `navigator.hid`, host this folder on any static HTTPS provider:
- **Cloudflare Pages / Netlify / Vercel**: Point directly at this folder (no build step required; output directory is `.`). The included [`_headers`](./_headers) file automatically sets `Permissions-Policy: hid=(self)`.
- **GitHub Pages**: Push this folder to a repository and enable GitHub Pages with HTTPS enforced.
- **Nginx / Caddy / Apache**: Serve the directory over HTTPS and ensure `Permissions-Policy` allows `hid=(self)`.

## Local Preview
To test locally on `http://localhost:8080` (`localhost` is treated as a secure context by Chromium):
```powershell
node serve-local.js
```
