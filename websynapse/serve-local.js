/**
 * Optional local static preview server for websynap.se
 * Usage: node serve-local.js
 * Opens http://localhost:8080 (Chromium allows WebHID on localhost without HTTPS)
 */
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const PORT = Number(process.env.PORT || 8080);
const ROOT = __dirname;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

http
  .createServer((req, res) => {
    const reqPath = (req.url || "/").split("?")[0];
    const relPath = reqPath === "/" ? "/index.html" : reqPath;
    const filePath = path.join(ROOT, path.normalize(relPath));
    if (!filePath.startsWith(ROOT) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not found");
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      "Content-Type": MIME[ext] || "application/octet-stream",
      "Permissions-Policy": "hid=(self)",
      "Cache-Control": "no-cache",
    });
    fs.createReadStream(filePath).pipe(res);
  })
  .listen(PORT, "127.0.0.1", () => {
    console.log(`websynap.se static preview running at http://localhost:${PORT}`);
  });
