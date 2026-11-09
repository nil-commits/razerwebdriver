# websynap.se — Public Deployment Security Architecture

`websynap.se` is hardened for public internet hosting as a **100% static, zero-backend client-side application** communicating directly with user-authorized Razer USB hardware over Chromium's WebHID API.

## 1. Zero-Network / Zero-Exfiltration Content Security Policy (CSP)
Both [`index.html`](./index.html) and the server headers ([`nginx.conf.example`](./nginx.conf.example), [`Caddyfile.example`](./Caddyfile.example), [`_headers`](./_headers)) enforce:
```http
Content-Security-Policy: default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'none'; font-src 'self'; media-src 'none'; object-src 'none'; child-src 'none'; frame-src 'none'; frame-ancestors 'none'; worker-src 'none'; base-uri 'none'; form-action 'none';
```
- **`connect-src 'none'`**: Completely disables `fetch()`, `XMLHttpRequest`, `WebSocket`, `EventSource`, and `navigator.sendBeacon()` at the browser engine level. Even if a user loads a third-party browser extension, the page cannot exfiltrate telemetry, device serials, or profile data over the network.
- **`script-src 'self'`**: Blocks all inline `<script>` tags, inline `on*` event attributes, `javascript:` URLs, `eval()`, and `new Function()`.
- **`frame-ancestors 'none'` + `X-Frame-Options: DENY`**: Prevents clickjacking and cross-origin iframe embedding of WebHID prompts.

## 2. Explicit WebHID `Permissions-Policy`
```http
Permissions-Policy: hid=(self), usb=(), serial=(), bluetooth=(), camera=(), microphone=(), geolocation=(), payment=()
```
- Grants `navigator.hid` exclusively to the top-level `self` origin while explicitly disabling WebUSB, WebSerial, WebBluetooth, Camera, Microphone, and Geolocation.

## 3. Protocol 25 Hardware Command Firewall (`validateOutgoingPacket90`)
Before any 90-byte USB HID Feature Report is transmitted in [`app.js`](./app.js):
- **Vendor ID Verification**: Enforces `dev.vendorId === 0x1532` (Razer Inc.).
- **Frame Structure & CRC Verification**: Enforces exact 90-byte payload length, `dataSize <= 80`, and recomputes/verifies the XOR checksum at `byte[88]`.
- **Bootloader / DFU / Flash Erase Protection**: Blocks restricted command classes (such as `0xFF` DFU/factory mode) and restricts system class `0x00` strictly to safe telemetry, operating mode, and polling rate commands (`0x04`, `0x05`, `0x40`, `0x81`, `0x82`, `0x84`, `0x86`, `0x87`, `0xC0`).
- **USB Mutex & Inter-Frame Spacing**: Serializes all feature report transfers per PID with a promise mutex and minimum 12 ms inter-command spacing to prevent MCU buffer overrun.

## 4. DOM XSS, Prototype Pollution & Import Sanitization
- **Prototype Pollution Guard (`safeJsonParse`)**: Strips `__proto__`, `constructor`, and `prototype` keys during JSON deserialization and enforces a strict **256 KB** file size limit on `.json` profile imports and **64 KB** limit on `RZW1:` share keys.
- **Schema Validation (`sanitizeSlotData` / `sanitizeDeviceProfile`)**: Clamps all numerical hardware parameters (actuation `0.1–4.0 mm`, DPI `100–45,000`, polling rate allowlist `125–8000 Hz`, 10-band EQ `-12..+12 dB`, deadzones `0–30%`, ARGB LED count `1–60`) and validates all color strings against `/^#[0-9a-fA-F]{6}$/`.
- **HTML Escaping (`escapeHtml`)**: Escapes all user-supplied and USB-descriptor strings (`productName`, profile slot names, hex logs) and uses `textContent` for toast notifications.
