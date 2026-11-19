// Serves a worktree's built page under /app/ and passes everything else to
// the local stack's gateway, so scripts/dev/branch-specs.sh can run the
// browser specs against a branch's own page without touching the stack's.
// Over localhost, which the browser counts as a secure origin (a position,
// the service worker), as CI's stack is.
//
//   [PORT=4173] GATEWAY=8080 node scripts/serve-dist.mjs <dist>
//
// With no PORT, a free one the system picks, said on the first line: two
// worktrees' runs on one fixed port sent one's tests to the other's server
// (330 "connection refused" when it stopped, 2026-11-19).
import { createReadStream, existsSync, statSync } from "node:fs";
import http from "node:http";
import { extname, join, resolve } from "node:path";

const dist = resolve(process.argv[2] ?? "dist-branch");
const port = Number(process.env.PORT ?? 0);
const gateway = Number(process.env.GATEWAY ?? 8080);
const TYPES = {
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".html": "text/html",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".wasm": "application/wasm",
  ".woff2": "font/woff2",
  ".txt": "text/plain",
};

http
  .createServer((req, res) => {
    const path = new URL(req.url ?? "/", "http://localhost").pathname;
    if (path === "/app" || path.startsWith("/app/")) {
      let file = join(dist, decodeURIComponent(path.slice(5)));
      if (!file.startsWith(dist) || !existsSync(file) || statSync(file).isDirectory()) file = join(dist, "index.html");
      res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream", "cache-control": "no-store" });
      createReadStream(file).pipe(res);
      return;
    }
    const headers = { ...req.headers, host: `localhost:${gateway}` };
    const up = http.request({ host: "127.0.0.1", port: gateway, path: req.url, method: req.method, headers }, (answer) => {
      res.writeHead(answer.statusCode ?? 502, answer.headers);
      answer.pipe(res);
    });
    up.on("error", () => res.writeHead(502).end());
    req.pipe(up);
  })
  .on("error", (err) => {
    console.error(`serve-dist: ${err.message}`);
    process.exit(1);
  })
  .listen(port, "127.0.0.1", function () {
    console.log(`serve-dist: ${dist} on :${this.address().port}, the rest to :${gateway}`);
  });
