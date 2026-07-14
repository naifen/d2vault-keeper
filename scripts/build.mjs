import * as esbuild from "esbuild";
import {
  cpSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  rmSync,
  existsSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outdir = join(root, "dist");
const stagedir = join(outdir, "_stage");

rmSync(outdir, { recursive: true, force: true });
mkdirSync(stagedir, { recursive: true });

// Bundle TS shape module for Node import (single source of truth w/ tests).
const shapeBundle = join(stagedir, "manifest-shape.mjs");
await esbuild.build({
  entryPoints: [join(root, "src/manifest/shape.ts")],
  outfile: shapeBundle,
  format: "esm",
  platform: "node",
  bundle: true,
  logLevel: "silent",
});
const { BROWSER_TARGETS, shapeChromiumManifest, shapeFirefoxManifest } = await import(
  pathToFileURL(shapeBundle).href
);

const shared = {
  bundle: true,
  sourcemap: true,
  // Chrome 116+ / Firefox 121+ — ES2022 is fine for both shells.
  target: ["chrome116", "firefox121"],
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
  outdir: stagedir,
});

// Content script must be classic IIFE — no top-level import/export.
await esbuild.build({
  ...shared,
  format: "iife",
  entryPoints: [join(root, "src/content/light.ts")],
  outfile: join(stagedir, "content.js"),
});

cpSync(join(root, "src/workbench/index.html"), join(stagedir, "workbench.html"));
cpSync(join(root, "src/workbench/styles.css"), join(stagedir, "workbench.css"));

const base = JSON.parse(readFileSync(join(root, "src/manifest.base.json"), "utf8"));
const shapers = {
  firefox: shapeFirefoxManifest,
  chromium: shapeChromiumManifest,
};

const assetNames = [
  "background.js",
  "background.js.map",
  "workbench.js",
  "workbench.js.map",
  "content.js",
  "content.js.map",
  "workbench.html",
  "workbench.css",
];

for (const target of BROWSER_TARGETS) {
  const targetDir = join(outdir, target);
  mkdirSync(targetDir, { recursive: true });
  for (const name of assetNames) {
    const from = join(stagedir, name);
    if (existsSync(from)) {
      cpSync(from, join(targetDir, name));
    }
  }
  const manifest = shapers[target](base);
  writeFileSync(join(targetDir, "manifest.json"), JSON.stringify(manifest, null, 2));
}

// Stable path for classic-script regression tests.
cpSync(join(stagedir, "content.js"), join(outdir, "content.js"));
if (existsSync(join(stagedir, "content.js.map"))) {
  cpSync(join(stagedir, "content.js.map"), join(outdir, "content.js.map"));
}

console.log("build ok → dist/firefox/ + dist/chromium/");
