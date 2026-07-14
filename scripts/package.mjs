/**
 * Zip dual-target dist/ packages for temporary browser load.
 * Usage: npm run package  →  artifacts/vault-keeper-{firefox,chromium}.zip
 */
import { mkdirSync, existsSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
const artifacts = join(root, "artifacts");

const targets = [
  {
    name: "firefox",
    dir: join(dist, "firefox"),
    zip: "vault-keeper-firefox.zip",
    loadHint:
      "Load in Firefox: about:debugging → This Firefox → Load Temporary Add-on → pick dist/firefox/manifest.json",
  },
  {
    name: "chromium",
    dir: join(dist, "chromium"),
    zip: "vault-keeper-chromium.zip",
    loadHint:
      "Load in Chrome/Edge: chrome://extensions or edge://extensions → Developer mode → Load unpacked → pick dist/chromium/",
  },
];

for (const t of targets) {
  if (!existsSync(join(t.dir, "manifest.json"))) {
    console.error(`${t.dir} missing — run npm run build first`);
    process.exit(1);
  }
}

mkdirSync(artifacts, { recursive: true });

for (const t of targets) {
  const zipPath = join(artifacts, t.zip);
  // Fresh archive each run — plain `zip -r` would keep stale members from prior packages.
  rmSync(zipPath, { force: true });
  const result = spawnSync("zip", ["-r", "-X", zipPath, "."], {
    cwd: t.dir,
    stdio: "inherit",
  });
  if (result.status !== 0) {
    console.error(`zip failed for ${t.name}; is the zip CLI installed?`);
    process.exit(result.status ?? 1);
  }
  console.log(`package ok → ${zipPath}`);
  console.log(t.loadHint);
}
