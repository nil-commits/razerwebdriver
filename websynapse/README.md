# websynap.se — Zero-Install Razer WebHID Configurator (Online Edition)

**websynap.se** is a 100% client-side, zero-backend web application for configuring Razer keyboards, mice, headsets, controllers, and Chroma accessories directly from any Chromium-based browser (`Chrome`, `Edge`, `Brave`, `Opera`, `Vivaldi`) via the W3C **WebHID API** (`navigator.hid`).

> **Trademark & Non-Affiliation Disclaimer:**
> **websynap.se** is an independent, community-developed open-source project and is **not affiliated with, endorsed by, sponsored by, or associated with Razer Inc.** "Razer", "Razer Synapse", "Razer Chroma", "Hypershift", "HyperPolling", "Snap Tap", and all Razer product names are trademarks or registered trademarks of Razer Inc., used solely for descriptive hardware compatibility identification.

---

## Production Deployment Checklist (Public Server)

When deploying to your public web server (`/var/www/websynap.se`), **only deploy the public web assets**:
- `index.html`
- `styles.css`
- `app.js`
- `protocol25.js`
- `LICENSE`
- `fonts/DMSans-Variable.ttf`
- `fonts/DM-Sans-OFL.txt`

**Do NOT deploy or serve**:
- `serve-local.js` *(strictly for local `127.0.0.1` preview during development — never expose publicly)*
- `README.md`
- `SECURITY.md`
- `nginx.conf.example` / `Caddyfile.example` / `_headers`

Both [`nginx.conf.example`](./nginx.conf.example) and [`Caddyfile.example`](./Caddyfile.example) include explicit rules (`return 404` / `respond 404`) blocking `serve-local.js`, `README.md`, `SECURITY.md`, `_headers`, and `*.example` even if the repository folder is mounted directly.

---

## Licenses

- **Application Code**: Licensed under the **MIT License** (see [`LICENSE`](./LICENSE)).
- **Bundled Font (`DM Sans`)**: `./fonts/DMSans-Variable.ttf` is licensed under the **SIL Open Font License 1.1 (OFL-1.1)** (see [`./fonts/DM-Sans-OFL.txt`](./fonts/DM-Sans-OFL.txt)).
