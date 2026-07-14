/**
 * PROTOTYPE server — serves src/workbench/prototype/ only.
 * Not used by product build/package.
 */
import { createServer } from "node:http";
import { readFileSync, existsSync, statSync } from "node:fs";
import { join, extname, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const protoDir = join(root, "src/workbench/prototype");
const port = Number(process.env.PORT) || 4173;

const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
};

const server = createServer((req, res) => {
  const url = new URL(req.url || "/", `http://127.0.0.1:${port}`);
  let rel = decodeURIComponent(url.pathname);
  if (rel === "/") rel = "/index.html";
  const filePath = normalize(join(protoDir, rel));
  if (!filePath.startsWith(protoDir) || !existsSync(filePath) || !statSync(filePath).isFile()) {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("Not found");
    return;
  }
  const body = readFileSync(filePath);
  res.writeHead(200, {
    "content-type": types[extname(filePath)] || "application/octet-stream",
    "cache-control": "no-store",
  });
  res.end(body);
});

server.listen(port, "127.0.0.1", () => {
  console.log(`PROTOTYPE Workbench UI → http://127.0.0.1:${port}/?variant=A`);
  console.log("Variants: A Canonical | B Command rail | C Composer-first");
  console.log("← → arrows or bottom bar. Ctrl+C to stop.");
});
