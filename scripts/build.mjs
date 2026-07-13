import * as esbuild from "esbuild";
import { cpSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outdir = join(root, "dist");

rmSync(outdir, { recursive: true, force: true });
mkdirSync(outdir, { recursive: true });

const shared = {
  bundle: true,
  sourcemap: true,
  target: ["firefox121"],
  logLevel: "info",
  platform: "browser",
};

// Background + Workbench are ES modules (manifest type:module / <script type=module>).
await esbuild.build({
  ...shared,
  format: "esm",
  entryPoints: {
    background: join(root, "src/background/index.ts"),
    workbench: join(root, "src/workbench/main.ts"),
  },
  outdir,
});

// Content script must be classic IIFE — no top-level import/export.
await esbuild.build({
  ...shared,
  format: "iife",
  entryPoints: [join(root, "src/content/light.ts")],
  outfile: join(outdir, "content.js"),
});

const manifest = JSON.parse(readFileSync(join(root, "src/manifest.json"), "utf8"));
writeFileSync(join(outdir, "manifest.json"), JSON.stringify(manifest, null, 2));

cpSync(join(root, "src/workbench/index.html"), join(outdir, "workbench.html"));
cpSync(join(root, "src/workbench/styles.css"), join(outdir, "workbench.css"));

console.log("build ok → dist/");
