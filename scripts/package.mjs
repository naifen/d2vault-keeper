/**
 * Zip dist/ for Firefox temporary add-on / about:debugging load.
 * Usage: npm run package  →  artifacts/vault-keeper.zip
 */
import { mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
const artifacts = join(root, "artifacts");

if (!existsSync(join(dist, "manifest.json"))) {
  console.error("dist/ missing — run npm run build first");
  process.exit(1);
}

mkdirSync(artifacts, { recursive: true });
const zipPath = join(artifacts, "vault-keeper.zip");

const result = spawnSync("zip", ["-r", "-X", zipPath, "."], {
  cwd: dist,
  stdio: "inherit",
});

if (result.status !== 0) {
  console.error("zip failed; is the zip CLI installed?");
  process.exit(result.status ?? 1);
}

console.log(`package ok → ${zipPath}`);
console.log(
  "Load in Firefox: about:debugging → This Firefox → Load Temporary Add-on → pick dist/manifest.json",
);
