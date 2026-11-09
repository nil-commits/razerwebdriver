/**
 * LOCAL PREVIEW SERVER ONLY (127.0.0.1) — DO NOT USE FOR PUBLIC HOSTING!
 * For public deployment, serve only the static web assets behind Nginx, Caddy,
 * or Cloudflare Pages using the provided nginx.conf.example / Caddyfile.example.
 *
 * Usage: node serve-local.js
 * Opens http://localhost:8080 (Chromium allows WebHID on localhost without HTTPS)
 */
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const PORT = Number(process.env.PORT || 8080);
const ROOT = path.resolve(__dirname);
const ROOT_WITH_SEP = ROOT.endsWith(path.sep) ? ROOT : ROOT + path.sep;

// Strict allowlist of public static files — never serve serve-local.js, README.md, SECURITY.md, *.example, or _headers
const PUBLIC_ALLOWLIST = new Set([
  "/index.html",
  "/styles.css",
  "/app.js",
  "/protocol25.js",
  "/LICENSE",
  "/fonts/DMSans-Variable.ttf",
  "/fonts/DM-Sans-OFL.txt",
]);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".ttf": "font/ttf",
  ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

http
  .createServer((req, res) => {
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.writeHead(405, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Method Not Allowed");
      return;
    }

    const reqPath = decodeURIComponent((req.url || "/").split("?")[0]);
    const relPath = reqPath === "/" ? "/index.html" : reqPath;

    if (!PUBLIC_ALLOWLIST.has(relPath)) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not found");
      return;
    }

    const filePath = path.resolve(ROOT, "." + relPath);
    if (
      !filePath.startsWith(ROOT_WITH_SEP) ||
      !fs.existsSync(filePath) ||
      fs.statSync(filePath).isDirectory()
    ) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not found");
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      "Content-Type": MIME[ext] || "text/plain; charset=utf-8",
      "Content-Security-Policy":
        "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'none'; font-src 'self'; media-src 'none'; object-src 'none'; child-src 'none'; frame-src 'none'; frame-ancestors 'none'; worker-src 'none'; base-uri 'none'; form-action 'none';",
      "Permissions-Policy":
        "hid=(self), usb=(), serial=(), bluetooth=(), camera=(), microphone=(), geolocation=(), payment=()",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
      "Referrer-Policy": "no-referrer",
      "Cache-Control": "no-cache",
    });

    if (req.method === "HEAD") {
      res.end();
      return;
    }
    fs.createReadStream(filePath).pipe(res);
  })
  .listen(PORT, "127.0.0.1", () => {
    console.log(
      `websynap.se local preview server (127.0.0.1 ONLY) running at http://localhost:${PORT}`
    );
  });
